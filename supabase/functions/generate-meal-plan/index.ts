// ── generate-meal-plan ───────────────────────────────────────────────────────
// Edge Function chamada pelo nutricionista (app.js: generatePlanWithAI()) para gerar um
// RASCUNHO de plano semanal com IA, a partir dos dados clínicos já guardados na ficha do
// paciente (pAlergias/pPatologias/pMedicacao/pNotas/pObjetivo). Nunca escreve nada na base
// de dados — devolve o plano (já validado) para o frontend carregar como rascunho editável;
// o nutricionista decide se e quando guardar.
//
// Só clientId viaja no pedido — os dados clínicos são sempre lidos aqui, através de um
// cliente Supabase com o Authorization de quem chama (RLS confirma que o paciente pertence
// mesmo a este nutricionista, tal como send-invite-email), nunca confiados a um payload do
// frontend, já que alimentam decisões relevantes para segurança do plano.
//
// Resposta em streaming NDJSON (uma linha JSON por evento):
//   {"type":"stage","stage":"a_gerar"|"a_validar_alimentos"|"a_verificar_alergenios"}
//   {"type":"reasoning_delta","text":"..."}  (na prática nunca dispara, ver nota abaixo)
//   {"type":"result","days":[...],"warnings":[...]}
//   {"type":"error","message":"..."}
// tool_choice:"any" força sempre a chamada da função (teste real mostrou o modelo a responder
// só com perguntas de esclarecimento em texto, em vez de gerar — o pedido é de uma só vez, sem
// hipótese de resposta) — a documentação da Anthropic confirma que isto elimina qualquer bloco
// de texto antes do tool_use, por isso "reasoning_delta" fica sem efeito prático (o parsing
// mantém-se por segurança, caso a Anthropic mude este comportamento). Em troca, o schema tem um
// campo "avisos_ia" (texto livre, opcional, dentro da própria chamada) para o modelo continuar
// a poder sinalizar preocupações — vem incluído no array "warnings" do resultado. O plano
// estruturado só é reencaminhado depois de terminar o stream e passar por todas as validações
// abaixo — nunca se mostra JSON a meio, por validar.
//
// Deploy: supabase functions deploy generate-meal-plan
// Secret necessário (ver README.md):
//   supabase secrets set ANTHROPIC_API_KEY=...
//
// tca_data.json é uma cópia recortada e commitada de public/js/data/tca_data.js (só
// id/nome/cat/kcal/prot/hc/lip/agtrans/na) — regenerar com `node scripts/generate-tca-trimmed.mjs`
// sempre que a base de alimentos mudar (não sincroniza sozinha).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.3';
// Import estático (não Deno.readTextFile em runtime) — o deploy do Supabase só empacota
// ficheiros alcançados pelo grafo de imports; uma leitura de ficheiro em runtime pode não
// encontrar tca_data.json no ambiente implantado, e por correr à cabeça do módulo faz a
// function inteira falhar a arrancar (incluindo o preflight OPTIONS).
import tcaJson from './tca_data.json' with { type: 'json' };
// Base de conhecimento clínico por patologia (65 patologias, ver .claude/plans para o
// desenho completo) — Fase 1: reconhecimento por aliases + injeção de regras_prompt no
// prompt + alimentos_contraindicados a somar ao filtro de exclusão. A resolução de
// conflitos entre múltiplas patologias em simultâneo (prioridade, pares mutuamente
// exclusivos) fica para a Fase 2 — aqui só se faz a união simples dos contraindicados
// (regra 2 do motor), sem arbitragem de prioridade.
import patologiasJson from './patologias.json' with { type: 'json' };

const MODEL_ID = 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Limite por PACIENTE, não por conta — um nutricionista com muitos pacientes deve conseguir
// gerar para cada um deles, o que um limite só por conta não permitiria a partir de um certo
// nº de pacientes. Pedido explícito do utilizador (substitui a primeira versão, que era por
// conta): 3/dia e 10/mês por paciente.
//
// Dois níveis, não um só — descoberto em uso real: uma geração pode gastar tokens reais na
// Anthropic e ainda assim falhar na validação desta function (ex.: "alimento inexistente",
// ver validatePlan) — o nutricionista tem de clicar "tentar novamente", o que sem isto gastava
// uma das 3 tentativas do dia sem nunca lhe dar um plano usável. Por isso:
//   - PLANS_* conta só gerações que terminaram em sucesso (error_message is null) — é este que
//     reflete "planos que o nutricionista conseguiu mesmo obter", e o que os nºs 3/10 do
//     pedido original querem dizer.
//   - ATTEMPTS_* conta TODAS as chamadas à Anthropic (sucesso + falha) — continua a ser preciso
//     um teto aqui, senão uma patologia/alergia mal reconhecida podia gerar erro atrás de erro
//     indefinidamente sem nunca bater no limite de sucesso, e cada uma dessas tentativas
//     continua a custar dinheiro real. Margem de 2x sobre o limite de sucesso, ajustável.
const DAILY_PLANS_LIMIT_PER_PATIENT = 3;
const MONTHLY_PLANS_LIMIT_PER_PATIENT = 10;
const DAILY_ATTEMPTS_LIMIT_PER_PATIENT = DAILY_PLANS_LIMIT_PER_PATIENT * 2;
const MONTHLY_ATTEMPTS_LIMIT_PER_PATIENT = MONTHLY_PLANS_LIMIT_PER_PATIENT * 2;

// Devolve uma mensagem de erro (para mostrar ao utilizador) se algum limite foi atingido, ou
// null se pode prosseguir. Corre antes de qualquer chamada à Anthropic — abuso não deve custar
// nada. Filtra por client_id (não por profile_id): a RLS de "clients" já garante, antes deste
// ponto do pedido, que este client_id pertence mesmo ao nutricionista que está a chamar — não
// é preciso repetir essa verificação aqui.
async function checkRateLimit(supabase: ReturnType<typeof createClient>, clientId: string): Promise<string | null> {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const countSince = async (since: string, onlySuccessful: boolean) => {
    let query = supabase
      .from('ai_generation_usage')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .gte('created_at', since);
    if (onlySuccessful) query = query.is('error_message', null);
    return query;
  };

  const { count: dailyPlans, error: dailyPlansErr } = await countSince(startOfDay, true);
  if (dailyPlansErr) { console.error('Erro ao verificar limite diário de IA:', dailyPlansErr); return null; } // erro transitório não deve bloquear geração legítima
  if ((dailyPlans ?? 0) >= DAILY_PLANS_LIMIT_PER_PATIENT) {
    return `Atingiu o limite diário de ${DAILY_PLANS_LIMIT_PER_PATIENT} planos gerados com IA para este paciente. Pode voltar a gerar amanhã.`;
  }

  const { count: dailyAttempts, error: dailyAttemptsErr } = await countSince(startOfDay, false);
  if (dailyAttemptsErr) { console.error('Erro ao verificar limite diário de tentativas de IA:', dailyAttemptsErr); return null; }
  if ((dailyAttempts ?? 0) >= DAILY_ATTEMPTS_LIMIT_PER_PATIENT) {
    return 'Atingiu o limite diário de tentativas de geração com IA para este paciente (demasiados erros seguidos). Reveja os dados do paciente ou tente novamente amanhã.';
  }

  const { count: monthlyPlans, error: monthlyPlansErr } = await countSince(startOfMonth, true);
  if (monthlyPlansErr) { console.error('Erro ao verificar limite mensal de IA:', monthlyPlansErr); return null; }
  if ((monthlyPlans ?? 0) >= MONTHLY_PLANS_LIMIT_PER_PATIENT) {
    return `Atingiu o limite mensal de ${MONTHLY_PLANS_LIMIT_PER_PATIENT} planos gerados com IA para este paciente.`;
  }

  const { count: monthlyAttempts, error: monthlyAttemptsErr } = await countSince(startOfMonth, false);
  if (monthlyAttemptsErr) { console.error('Erro ao verificar limite mensal de tentativas de IA:', monthlyAttemptsErr); return null; }
  if ((monthlyAttempts ?? 0) >= MONTHLY_ATTEMPTS_LIMIT_PER_PATIENT) {
    return 'Atingiu o limite mensal de tentativas de geração com IA para este paciente (demasiados erros seguidos).';
  }

  return null;
}

// Produção + qualquer localhost:<porta> (servidor local de desenvolvimento) — nunca um site
// de terceiros consegue forjar o Authorization real de uma sessão só por declarar este Origin.
const PROD_ORIGIN = 'https://cachosnutri.vercel.app';
const LOCALHOST_ORIGIN_RE = /^http:\/\/localhost:\d+$/;

function corsHeadersFor(req: Request) {
  const origin = req.headers.get('Origin') || '';
  const allowOrigin = origin === PROD_ORIGIN || LOCALHOST_ORIGIN_RE.test(origin) ? origin : PROD_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
}

const DEFAULT_MEALS = ['Pequeno-almoço', 'Lanche da manhã', 'Almoço', 'Lanche da tarde', 'Jantar'];

type TcaFood = { id: string; nome: string; cat: string; kcal: number; prot: number; hc: number; lip: number; agtrans: number | null; na: number | null };

// Alias "normal" (string) = basta aparecer no texto. Alias composto (objeto) = só conta se
// "term" aparecer JUNTO com pelo menos um dos "requiresAlsoOneOf" — usado para termos que
// descrevem um sintoma genérico (não uma patologia por si só) e que sozinhos causam falsos
// positivos. Ver "retenção de líquidos" em Insuficiência Cardíaca Crónica: sozinho é comum
// (má circulação por ficar sentada, por exemplo) e não implica doença cardíaca — só conta se
// vier acompanhado de outro sinal cardíaco (dispneia, ortopneia, etc.), confirmado em teste
// real onde uma paciente sem problema cardíaco foi incorretamente rotulada com IC.
type PatologiaAlias = string | { term: string; requiresAlsoOneOf: string[] };

type Patologia = {
  id: number;
  nome: string;
  patologia_tag: string;
  aliases: PatologiaAlias[];
  evidencia: string;
  prioridade: string;
  conflitos: string[];
  regras_prompt: string;
  alimentos_contraindicados: string[];
  alimentos_limitar: string[];
  alimentos_preferir: string[];
  nota_prompt: string;
  aplicabilidade?: string;
};

const PATOLOGIAS: Patologia[] = (patologiasJson as { patologias: Patologia[] }).patologias;

const TCA: TcaFood[] = tcaJson as TcaFood[];
const TCA_BY_ID = new Map(TCA.map((f) => [f.id, f]));

// O schema é construído por pedido (não é uma const fixa) porque a lista de alimentos
// permitidos muda por paciente (depende do filtro de alergias/crus em filterAllowedFoods).
//
// HISTÓRICO (para não repetir o mesmo erro): tentou-se aqui "strict: true" duas vezes —
// primeiro com "enum" no id (1000+ valores) referenciado em 35 pontos do schema via $ref, e
// depois sem o enum mas mantendo a estrutura de chaves fixas dia1..dia7/5 refeições. AMBAS
// as tentativas devolveram "Schema is too complex for compilation" da API da Anthropic — o
// modo estrito não lida bem com esta forma de schema (arrays de tamanho variável aninhados
// em várias posições), independentemente do enum. Voltou-se ao design simples sem "strict",
// que já funcionava de forma fiável antes (só falhava raramente, num id inventado — caso já
// coberto pela validação abaixo). Não tentar strict:true outra vez nesta tool sem primeiro
// simplificar bastante mais a forma do schema.
function buildMealPlanTool() {
  return {
    name: 'emit_meal_plan',
    description: 'Emite o plano semanal de 7 dias já estruturado.',
    input_schema: {
      type: 'object',
      properties: {
        avisos_ia: {
          type: 'string',
          description:
            'Opcional. Usa este campo para sinalizar em português qualquer preocupação, incerteza ou ' +
            'risco que tenhas identificado e que não conseguiste resolver só com a estrutura do plano ' +
            '(ex.: uma tensão entre patologias, um alimento que pode estar próximo de um limite, uma ' +
            'suposição que fizeste por falta de informação). Deixa vazio ("") se não tiveres nada a ' +
            'sinalizar — não inventes preocupações só para preencher o campo.',
        },
        days: {
          type: 'array',
          description: 'Exatamente 7 dias, pela ordem da semana.',
          items: {
            type: 'object',
            properties: {
              meals: {
                type: 'array',
                description: `Exatamente 5 refeições, por esta ordem e nomes: ${DEFAULT_MEALS.join(', ')}.`,
                items: {
                  type: 'object',
                  properties: {
                    nome: { type: 'string' },
                    hora: { type: 'string', description: 'hora sugerida, ex. "08:00"' },
                    foods: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', description: 'id exato de um alimento da lista TCA fornecida no system prompt (coluna "id") — nunca inventes um id que não conste da lista' },
                          qty: { type: 'number', description: 'quantidade em gramas' },
                        },
                        required: ['id', 'qty'],
                      },
                    },
                  },
                  required: ['nome', 'hora', 'foods'],
                },
              },
            },
            required: ['meals'],
          },
        },
      },
      required: ['days'],
    },
  };
}

function corsJson(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body) + '\n', {
    status,
    headers: { ...corsHeadersFor(req), 'Content-Type': 'application/x-ndjson' },
  });
}

// Tabela (tab-separated) em vez de JSON — o JSON repete os nomes dos campos
// ("id":, "nome":, "kcal":...) 1376 vezes, puro desperdício de tokens. Uma linha de
// cabeçalho + uma linha por alimento corta ~47% dos carateres desta parte do prompt
// (medido: 150 088 -> 79 885 carateres), sem perder nenhuma informação.
function foodsToTable(foods: TcaFood[]): string {
  const header = 'id\tnome\tcat\tkcal\tprot\thc\tlip\tsodio_mg';
  const rows = foods.map((f) => `${f.id}\t${f.nome}\t${f.cat}\t${f.kcal}\t${f.prot}\t${f.hc}\t${f.lip}\t${f.na ?? ''}`);
  return [header, ...rows].join('\n');
}

// Testes reais mostraram a IA a escolher repetidamente "Frango, peito sem pele, cru",
// "Sardinha gorda crua", "Arroz carolino branqueado cru" como itens de refeição — mesmo com
// a instrução no prompt a pedir o contrário, e mesmo quando a versão cozinhada existe na
// mesma lista (confirmado nos dados: para praticamente todo o cru nestas categorias há um
// cozido/grelhado/assado/estufado equivalente). A instrução sozinha não chegou — por isso
// as entradas cruas destas categorias de risco são removidas da lista antes de chegarem à
// IA, não só pedidas para evitar.
const RAW_FOOD_RISK_CATEGORIES = new Set(['Carnes', 'Peixes', 'Cereais', 'Tubérculos', 'Ovos']);
const RAW_FOOD_RE = /\bcru(a|as|s)?\b/i;

// "Leguminosas" não pode ser excluída em bloco como as categorias acima: sementes
// (linhaça, abóbora, girassol), tamarindo e wasabi crus são normais e seguros de comer
// sem cozinhar. Só feijão/lentilha/ervilha/fava/grão-de-bico/soja secos e crus são
// realmente perigosos (contêm toxinas naturais só destruídas pela cozedura — encontrado
// em teste real: "Feijão manteiga, seco, cru" apareceu num jantar gerado). Por isso aqui
// filtra-se por nome específico dentro da categoria, não a categoria inteira.
const RISKY_RAW_LEGUME_RE = /\b(feij(a|ã)o|lentilha|ervilha|fava|gr(a|ã)o-de-bico|soja)/i;

function isRawRiskFood(f: TcaFood): boolean {
  if (RAW_FOOD_RISK_CATEGORIES.has(f.cat) && RAW_FOOD_RE.test(f.nome)) return true;
  if (f.cat === 'Leguminosas' && RAW_FOOD_RE.test(f.nome) && RISKY_RAW_LEGUME_RE.test(f.nome)) return true;
  return false;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Fase 1 da base de conhecimento de patologias: reconhece patologias no texto livre de
// pPatologias por correspondência com os "aliases" de cada uma (ex.: "fígado gordo" ou
// "esteatose" apanham a mesma patologia esteatose_hepatica). Não há arbitragem de
// prioridade/conflitos entre patologias em simultâneo aqui (isso é Fase 2) — só a união
// simples dos alimentos_contraindicados de todas as patologias detetadas, que é a regra 2
// do motor original ("a união dos alimentos_contraindicados é sempre respeitada").
//
// Correspondência por LIMITE DE PALAVRA, não substring solta — muitos aliases são
// abreviaturas curtas e legítimas (ic, dm2, hta, irc) que de outra forma batem por acaso
// dentro de palavras não relacionadas (ex.: "ic" apanhava "alcoólica"). Confirmado por
// teste real antes de publicar.
//
// "s?" no fim tolera o plural regular português (aliases são escritos no singular no
// dataset, ex. "enxaqueca", mas a ficha do paciente escreve "Enxaquecas Crónicas" — sem
// isto o alias nunca batia e a patologia inteira ficava por reconhecer, confirmado em teste
// real). Só cobre o plural regular (+s) — plurais irregulares (ex. "coração"->"corações",
// "animal"->"animais") continuam por cobrir; não encontrámos nenhum alias afetado por isso
// até agora, mas fica por resolver numa próxima iteração se aparecer um caso real.
function wordPresent(textoNorm: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegExp(normalize(term))}s?\\b`).test(textoNorm);
}

function matchPatologias(pPatologias: unknown): Patologia[] {
  if (!pPatologias || typeof pPatologias !== 'string') return [];
  const textoNorm = normalize(pPatologias);
  return PATOLOGIAS.filter((p) =>
    p.aliases.some((alias) => {
      if (typeof alias === 'string') return wordPresent(textoNorm, alias);
      return wordPresent(textoNorm, alias.term) && alias.requiresAlsoOneOf.some((companion) => wordPresent(textoNorm, companion));
    })
  );
}

function patologiaContraindicatedKeywords(patologias: Patologia[]): string[] {
  const set = new Set<string>();
  patologias.forEach((p) => p.alimentos_contraindicados.forEach((termo) => set.add(termo)));
  return [...set];
}

// "gordura trans"/"gordura hidrogenada" aparecem em alimentos_contraindicados de 6
// patologias (hipercolesterolemia, psoríase, artrite reumatoide, síndrome metabólica,
// lúpus, osteoartrite) — mas são uma PROPRIEDADE nutricional, não um nome de alimento, por
// isso nunca batiam com nada no filtro por nome (nenhum alimento se chama "gordura trans").
// Aqui usa-se o valor real medido (agtrans) em vez do nome — confirmado que a "Margarina"
// tem 2,4g/100g, valor real e não desprezível. 0,5g/100g é o limiar usado para "sem gordura
// trans" em rotulagem — acima disso já é industrial relevante, não vestigial natural.
const TRANS_FAT_THRESHOLD = 0.5;

function wantsTransFatExclusion(patologias: Patologia[]): boolean {
  return patologias.some((p) =>
    p.alimentos_contraindicados.some((termo) => {
      const n = normalize(termo);
      return n.includes('gordura trans') || n.includes('gordura hidrogenada');
    })
  );
}

// Mesmo padrão do trans-fat: "excesso de sal"/"conservas salgadas"/etc. em
// alimentos_contraindicados (não em alimentos_limitar — esse é moderação, não exclusão, ver
// regra 5) só existe hoje em Insuficiência Cardíaca Crónica e Doença Renal em Diálise. A
// Hipertensão Arterial só tem sal em alimentos_limitar de propósito (restrição de sódio aí é
// moderação individualizada, não uma lista fixa de alimentos proibidos) — por isso não entra
// aqui. 600mg/100g é o limiar de "alto teor de sódio" da rotulagem UK/EU (~1,5g sal/100g).
const SODIUM_CONTRAINDICATION_PHRASES = ['excesso de sal', 'conservas salgadas', 'sal de adicao', 'substitutos de sal'];
const SODIUM_THRESHOLD_MG = 600;

function wantsSodiumExclusion(patologias: Patologia[]): boolean {
  return patologias.some((p) =>
    p.alimentos_contraindicados.some((termo) => {
      const n = normalize(termo);
      return SODIUM_CONTRAINDICATION_PHRASES.some((phrase) => n.includes(phrase));
    })
  );
}

// Remove da lista enviada à IA os alimentos cujo nome bate com uma palavra-chave de
// alergia/intolerância ou de contraindicação de patologia do paciente (e os alimentos
// crus de risco acima) — assim o modelo nem sequer tem essas opções disponíveis, em vez
// de confiar só no aviso pós-geração (que continua a existir como segunda rede, caso
// algum escape por semelhança de nome não capturada aqui). Alguns alimentos_contraindicados
// são regras de timing, não de alimento em si (ex.: "soja nas 4 horas após Levotiroxina") —
// esses simplesmente não batem com nenhum nome de alimento e não filtram nada, o que é
// seguro (ficam só como orientação no prompt, não como filtro rígido).
// Mesmo padrão do trans-fat/sódio: "excesso de fígado (vitamina A)" é a frase real em
// alimentos_contraindicados de "Gravidez sem Patologia Associada", mas nunca batia como
// substring em nenhum nome de alimento ("Vaca, fígado frito" não contém "excesso de fígado
// (vitamina a)"). Confirmado em teste real: fígado (vaca/porco/vitela) apareceu em 3 dos 7
// dias para uma paciente grávida — o excesso de vitamina A pré-formada do fígado é um risco
// teratogénico bem estabelecido na gravidez. Aqui extrai-se só a palavra-chave "fígado" da
// frase para o filtro de nome funcionar.
function wantsLiverExclusion(patologias: Patologia[]): boolean {
  return patologias.some((p) => p.alimentos_contraindicados.some((termo) => normalize(termo).includes('figado')));
}

function filterAllowedFoods(pAlergias: unknown, patologias: Patologia[]): TcaFood[] {
  const keywords = [...getEffectiveAllergyKeywords(pAlergias), ...patologiaContraindicatedKeywords(patologias)];
  const excludeTransFat = wantsTransFatExclusion(patologias);
  const excludeHighSodium = wantsSodiumExclusion(patologias);
  const excludeLiver = wantsLiverExclusion(patologias);
  return TCA.filter((f) => {
    if (isRawRiskFood(f)) return false;
    if (excludeTransFat && f.agtrans != null && f.agtrans > TRANS_FAT_THRESHOLD) return false;
    if (excludeHighSodium && f.na != null && f.na > SODIUM_THRESHOLD_MG) return false;
    if (excludeLiver && textContainsWord(normalize(f.nome), 'figado')) return false;
    if (!keywords.length) return true;
    const nomeNorm = normalize(f.nome);
    return !keywords.some((kw) => nomeNorm.includes(normalize(kw)));
  });
}

// Condensa as patologias detetadas (regras_prompt + alimentos_limitar/preferir) numa secção
// do prompt. Os alimentos_contraindicados já saíram da lista em filterAllowedFoods — o que
// falta aqui é dar à IA a estratégia nutricional e as moderações/preferências que não são
// exclusões rígidas (regra 5 do motor: "alimentos_limitar não são proibições").
function buildPatologiasGuidance(patologias: Patologia[]): string {
  if (!patologias.length) return '';
  const blocks = patologias.map((p) => {
    const limitar = p.alimentos_limitar.length ? ` Moderar/substituir: ${p.alimentos_limitar.join(', ')}.` : '';
    const preferir = p.alimentos_preferir.length ? ` Privilegiar: ${p.alimentos_preferir.join(', ')}.` : '';
    return `${p.nome} (prioridade ${p.prioridade}, evidência ${p.evidencia}): ${p.regras_prompt}${limitar}${preferir}`;
  });
  return (
    'Patologias identificadas na ficha deste paciente — segue esta orientação clínica ' +
    'condensada (os alimentos_contraindicados já foram retirados da lista de alimentos acima; ' +
    'o resto é orientação para as tuas escolhas, não uma lista fechada). Se houver mais do que ' +
    'uma patologia e as orientações colidirem entre si, prioriza a de prioridade mais alta ' +
    '("critica" > "alta" > "moderada" > "baixa") e sinaliza a tensão no campo "avisos_ia":\n\n' +
    blocks.join('\n\n')
  );
}

function buildSystemPrompt(allowedFoods: TcaFood[], patologias: Patologia[], macroTargets: MacroTargets | null) {
  const patologiasBlock = buildPatologiasGuidance(patologias);
  const macroBlock = macroTargets
    ? 'O nutricionista definiu metas de macros para este paciente (ver mensagem seguinte). ' +
      'Tenta que a MÉDIA SEMANAL (não cada dia individualmente) se aproxime dessas metas, com ' +
      'uma margem aceitável de cerca de ±5%. Não sacrifiques o realismo das porções (ver regra ' +
      'de quantidades abaixo) só para bater o número exato — pequenas variações dia a dia são ' +
      'normais e esperadas num plano real, mas a média semanal deve ficar dentro da margem.'
    : '';
  return [
    {
      type: 'text',
      text:
        'És um assistente que ajuda um nutricionista a preparar um RASCUNHO de plano ' +
        'alimentar semanal. O nutricionista revê e edita tudo antes de guardar — nunca ' +
        'assumas que o teu resultado é final nem que substitui o julgamento clínico dele.\n\n' +
        'As tuas sugestões são um ponto de partida, não um parecer clínico. Nunca presumas ' +
        'que evitaste todos os riscos só porque seguiste a lista de alergias/patologias — ' +
        'sinaliza sempre no campo "avisos_ia" quaisquer preocupações que identificares, mesmo ' +
        'que penses já as teres evitado.\n\n' +
        'Lista de alimentos disponíveis, em tabela separada por tabulações (uma linha de ' +
        'cabeçalho, depois uma linha por alimento). Já foram removidos desta lista os ' +
        'alimentos que batem com alergias/intolerâncias registadas do paciente — mesmo assim, ' +
        'continua atento a outros riscos (patologias, interações com medicação) e sinaliza-os ' +
        'no campo "avisos_ia". Só podes usar o valor exato da coluna "id" em foods[].id — nunca ' +
        'inventes um id que não esteja nesta lista. A coluna "sodio_mg" é o sódio em mg por ' +
        '100g do alimento — usa-a para escolher opções mais baixas em sódio sempre que o ' +
        'objetivo, patologias ou notas do paciente pedirem uma dieta pobre em sal/sódio (não há ' +
        'filtro automático nestes casos vindos só de texto livre — a escolha é tua):\n' +
        foodsToTable(allowedFoods),
      // Sem cache_control de propósito. Já foi tentado 2 vezes e revertido as duas: a
      // primeira vez (raciocínio teórico, antes de medir) concluiu que, ao ritmo de uso
      // esperado, o preço de escrita de cache (2x o preço base) raramente seria compensado
      // por uma leitura barata a seguir. A segunda vez foi mesmo posta em produção
      // (cache_control só no bloco da tabela filtrada, depois de separar as instruções 100%
      // estáticas para um bloco à parte) e o custo real por plano SUBIU de ~6 para ~10
      // cêntimos — confirma o raciocínio teórico com um número real, não é só suposição.
      // Não tentar de novo sem antes teres uma leitura de uso real (ai_generation_usage,
      // schema.sql secção 20) que mostre chamadas repetidas ao mesmo paciente dentro da
      // janela de cache (5 min) — sem isso, cada geração paga sempre o preço de escrita e
      // quase nunca chega a ler em cache.
    },
    ...(patologiasBlock ? [{ type: 'text', text: patologiasBlock }] : []),
    ...(macroBlock ? [{ type: 'text', text: macroBlock }] : []),
    {
      type: 'text',
      text:
        'Distingue sempre dois tipos de indicação nas notas/objetivo do paciente: (1) EXCLUSÃO ' +
        'MÉDICA ABSOLUTA — alergias e alimentos_contraindicados de patologias já foram removidos ' +
        'da lista de alimentos acima, nunca precisas de os evitar ativamente porque já não estão ' +
        'disponíveis; (2) PREFERÊNCIA/INCLUSÃO PEDIDA — alimentos ou categorias que as notas ' +
        'pedem para incluir (ex.: "rico em fibra... sementes de chia/linhaça"). Para o tipo (2) ' +
        'tens uma regra obrigatória: se as notas nomeiam um alimento ou categoria específica a ' +
        'incluir e esse alimento existir na lista, usa-o obrigatoriamente em pelo menos uma ' +
        'refeição da semana — não te limites a alimentos genericamente parecidos (ex.: se pedem ' +
        'chia/linhaça explicitamente, não bastam kiwi/aveia só por também serem ricos em fibra; ' +
        'inclui a chia/linhaça também, se existirem na lista). Importante: quando o alimento ' +
        'pedido for calórico ou rico em gordura (ex. frutos oleaginosos como noz/amêndoa), usa ' +
        'uma quantidade modesta (uma dose normal de fruto seco, não mais) e ajusta a escolha ou ' +
        'quantidade de outros alimentos nesse dia para compensar — a inclusão pedida não pode, ' +
        'por si só, empurrar a média semanal de calorias/macros para fora da margem definida ' +
        'acima; nunca a repitas em todos os dias só por segurança, uma ou duas vezes por semana ' +
        'já cumpre o pedido.',
    },
    {
      type: 'text',
      text:
        'Estrutura esperada do plano: exatamente 7 dias, cada um com 5 refeições, pela mesma ' +
        `ordem e nomes: ${DEFAULT_MEALS.join(', ')}. ` +
        'Quantidades sempre realistas para uma porção que uma pessoa serve e come — nunca ' +
        'ajustes a quantidade para valores muito pequenos (ex. 1g ou 2g de ovo/carne/arroz) só ' +
        'para bater um alvo de calorias exato; prefere ajustar a escolha ou a quantidade de ' +
        'outro alimento da refeição em vez de produzir uma porção que não existe na prática.\n\n' +
        'Muitos nomes da tabela dizem "cru" (ex.: "Frango, peito sem pele, cru") — isso é só o ' +
        'estado em que o valor nutricional foi medido, não uma sugestão de como servir. Nunca ' +
        'escolhas como item de refeição um alimento que precisa de ser cozinhado para se comer ' +
        '(carne crua, farinha, arroz/massa crus, ovo cru para comer inteiro) — usa-o só quando ' +
        'faz sentido comer assim mesmo (fruta, saladas, alimentos curados/prontos a comer).\n\n' +
        'Ao "Pequeno-almoço", privilegia alimentos culturalmente típicos dessa refeição em ' +
        'Portugal (laticínios, ovos, pão/cereais, fruta) — evita peixe ou carne nessa refeição ' +
        'a não ser que o objetivo/notas do paciente peçam explicitamente mais proteína logo de ' +
        'manhã.\n\n' +
        'Chama sempre a função emit_meal_plan com o plano completo — nunca escrevas o JSON ' +
        'como texto solto. Usa o campo "avisos_ia" (dentro da própria chamada) para qualquer ' +
        'nota ou preocupação que precises de comunicar; não há outro canal de texto livre.',
    },
  ];
}

type MacroTargets = { kcal: number; prot: number; hc: number; lip: number };

function buildUserMessage(info: Record<string, unknown>, macroTargets: MacroTargets | null) {
  const val = (v: unknown) => (v && String(v).trim()) || 'não fornecido';
  const metas = macroTargets
    ? `${macroTargets.kcal} kcal, ${macroTargets.prot}g proteína, ${macroTargets.hc}g hidratos, ${macroTargets.lip}g lípidos`
    : 'não definidas — usa o objetivo acima para estimar uma distribuição equilibrada';
  return (
    'Gera um rascunho de plano semanal para este paciente.\n\n' +
    `Objetivo: ${val(info.pObjetivo)}\n` +
    `Alergias: ${val(info.pAlergias)}\n` +
    `Patologias: ${val(info.pPatologias)}\n` +
    `Medicação: ${val(info.pMedicacao)}\n` +
    `Notas adicionais: ${val(info.pNotas)}\n` +
    `Metas de macros diárias: ${metas}`
  );
}

// ── Validação (nunca confiar cegamente no modelo) ───────────────────────────
function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function extractAllergyKeywords(pAlergias: unknown): string[] {
  if (!pAlergias || typeof pAlergias !== 'string') return [];
  return pAlergias
    .toLowerCase()
    .split(/,|;| e | ou /)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
}

// Correspondência literal (extractAllergyKeywords) não apanha "intolerância ao glúten" vs.
// "Pão de trigo" — nenhum nome de alimento contém a palavra "glúten" em si. Este mapa
// (chaves já normalizadas, sem acentos) alarga a palavra-chave clínica para os nomes de
// alimentos que realmente aparecem na TCA. Não é exaustivo — é um paliativo para as
// categorias mais comuns, não substitui a revisão do nutricionista.
// Cada grupo lista várias formas de escrever a MESMA restrição ("marisco"/"crustáceos"/
// "moluscos" excluem os mesmos alimentos) — um único trigger por categoria falhava sempre
// que a ficha usava o nome clínico em vez da palavra "guarda-chuva" (confirmado em teste
// real: "Alergia Alimentar ao Ovo (Grave - Anafilaxia)" não continha nenhuma categoria
// existente, e "Alergia à Proteína do Leite de Vaca (APLV)" não contém "lactose").
const ALLERGY_SYNONYM_GROUPS: { triggers: string[]; exclude: string[] }[] = [
  { triggers: ['gluten'], exclude: ['trigo', 'cevada', 'centeio', 'malte', 'aveia'] },
  {
    triggers: ['lactose', 'leite', 'aplv'],
    // "kefir"/"requeijao"/"pudim"/"arroz doce"/"gelado" não contêm nenhuma das palavras
    // acima mas são lacticínios reais (confirmado na categoria "Laticínios" da TCA) — teste
    // real serviu Kefir 4 vezes numa semana a uma paciente com APLV, sem o filtro o detetar.
    exclude: ['leite', 'iogurte', 'queijo', 'manteiga', 'nata', 'lacteo', 'kefir', 'requeijao', 'pudim', 'arroz doce', 'gelado'],
  },
  {
    triggers: ['marisco', 'crustaceos', 'moluscos'],
    exclude: ['camarao', 'lagosta', 'caranguejo', 'mexilhao', 'ameijoa', 'lula', 'polvo', 'santola', 'perceve'],
  },
  {
    triggers: ['frutos secos', 'frutos de casca rija'],
    exclude: ['amendoa', 'noz', 'avela', 'castanha', 'pistacio', 'caju', 'pinhao'],
  },
  { triggers: ['amendoim'], exclude: ['amendoim'] },
  { triggers: ['soja'], exclude: ['soja'] },
  { triggers: ['peixe'], exclude: ['peixe', 'atum', 'salmao', 'bacalhau', 'sardinha', 'pescada', 'dourada', 'robalo', 'linguado'] },
  { triggers: ['ovo', 'ovos'], exclude: ['ovo'] },
  { triggers: ['aipo'], exclude: ['aipo'] },
  { triggers: ['mostarda'], exclude: ['mostarda'] },
  { triggers: ['sesamo', 'gergelim'], exclude: ['sesamo', 'gergelim'] },
  { triggers: ['sulfito', 'sulfitos'], exclude: ['sulfito'] },
  { triggers: ['tremoco'], exclude: ['tremoco'] },
];

// Word-boundary, não substring solta — "ovo" solto apanharia "novo" ("Sem alergias
// conhecidas, caso novo"), o mesmo problema já resolvido para os aliases de patologias.
function textContainsWord(text: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`).test(text);
}

function getEffectiveAllergyKeywords(pAlergias: unknown): string[] {
  const raw = extractAllergyKeywords(pAlergias);
  const expanded = new Set<string>(raw);
  for (const kw of raw) {
    const kwNorm = normalize(kw);
    for (const group of ALLERGY_SYNONYM_GROUPS) {
      if (group.triggers.some((t) => textContainsWord(kwNorm, t))) {
        group.exclude.forEach((s) => expanded.add(s));
      }
    }
  }
  return [...expanded];
}

// Teste real mostrou a IA a prescrever "Ovo de galinha, cozido: 1g" e ": 2g" — ajustava a
// quantidade milimetricamente só para bater a meta de calorias exata, produzindo uma
// porção que ninguém serve na prática. Só se aplica a categorias "de corpo" da refeição
// (proteína/lacticínios/cereais/tubérculos/leguminosas) — Gorduras (azeite, 5-10g é normal),
// Temperos e Hortícolas (ervas frescas tipo salsa, 5g é normal) ficam de fora de propósito.
const MIN_QTY_CATEGORIES = new Set(['Carnes', 'Peixes', 'Ovos', 'Laticínios', 'Cereais', 'Tubérculos', 'Leguminosas']);
const MIN_QTY_GRAMS = 10;

// Sementes (linhaça, chia, sésamo, girassol, abóbora, etc.) estão categorizadas como
// "Leguminosas" na TCA junto com feijão/lentilha/grão-de-bico/soja, mas são um topping da
// refeição, não um alimento de corpo — uma dose real (5-15g, uma colher de sopa) fica
// legitimamente abaixo do mínimo de 10g pensado para as leguminosas "de corpo". Confirmado
// em teste real: "Sementes de linhaça cruas" a 8g era repetidamente rejeitado como
// "irrealista" (obrigando a gerar de novo), quando é uma dose normal e correta.
const SEED_TOPPING_RE = /^sementes/i;
function isSeedTopping(f: TcaFood): boolean {
  return f.cat === 'Leguminosas' && SEED_TOPPING_RE.test(f.nome);
}

function validatePlan(
  rawDays: unknown,
  pAlergias: unknown,
  avisosIa: unknown,
  allowedIds: Set<string>
): { error: string } | { days: unknown[]; warnings: string[] } {
  if (!Array.isArray(rawDays) || rawDays.length !== 7) {
    return { error: 'O modelo não devolveu exatamente 7 dias. Tenta gerar novamente.' };
  }
  const days: { meals: { nome: string; hora: string; foods: { id: string; qty: number }[] }[] }[] = [];
  for (const day of rawDays) {
    if (!day || !Array.isArray((day as any).meals)) {
      return { error: 'Estrutura de dia inválida na resposta do modelo. Tenta gerar novamente.' };
    }
    const meals: { nome: string; hora: string; foods: { id: string; qty: number }[] }[] = [];
    for (const meal of (day as any).meals) {
      if (typeof meal?.nome !== 'string' || typeof meal?.hora !== 'string' || !Array.isArray(meal.foods)) {
        return { error: 'Estrutura de refeição inválida na resposta do modelo. Tenta gerar novamente.' };
      }
      const foods: { id: string; qty: number }[] = [];
      for (const fi of meal.foods) {
        const food = TCA_BY_ID.get(String(fi?.id));
        if (!food) {
          return { error: `O modelo incluiu um alimento inexistente (id ${fi?.id}). Tenta gerar novamente.` };
        }
        // Sem "enum" no schema (ver histórico em buildMealPlanTool), nada impede
        // estruturalmente o modelo de devolver um id real da TCA mas que foi
        // deliberadamente excluído (alergia, cru de risco, gordura trans, sódio, fígado
        // na gravidez, etc.) — confirmado em teste real: "Vitela, coração cru" (excluído
        // pelo filtro de crus) chegou a ser devolvido e só não foi apanhado porque esta
        // verificação só existia contra a TCA completa, não contra a lista já filtrada
        // para este paciente. Sem isto, TODOS os filtros de segurança desta function são
        // meras sugestões de prompt, nunca impostos de facto.
        if (!allowedIds.has(food.id)) {
          return { error: `O modelo incluiu um alimento não permitido para este paciente ("${food.nome}"). Tenta gerar novamente.` };
        }
        const qty = Number(fi.qty);
        if (!Number.isFinite(qty) || qty <= 0) {
          return { error: `Quantidade inválida para "${food.nome}". Tenta gerar novamente.` };
        }
        if (MIN_QTY_CATEGORIES.has(food.cat) && !isSeedTopping(food) && qty < MIN_QTY_GRAMS) {
          return { error: `Quantidade irrealista (${qty}g) para "${food.nome}". Tenta gerar novamente.` };
        }
        foods.push({ id: food.id, qty });
      }
      meals.push({ nome: meal.nome, hora: meal.hora, foods });
    }
    days.push({ meals });
  }

  const warnings: string[] = [];
  if (typeof avisosIa === 'string' && avisosIa.trim()) {
    warnings.push(`Nota da IA: ${avisosIa.trim()}`);
  }
  const keywords = getEffectiveAllergyKeywords(pAlergias);
  if (keywords.length) {
    days.forEach((day, dIdx) => {
      day.meals.forEach((meal) => {
        meal.foods.forEach((fi) => {
          const food = TCA_BY_ID.get(fi.id)!;
          const nomeNorm = normalize(food.nome);
          for (const kw of keywords) {
            if (nomeNorm.includes(normalize(kw))) {
              warnings.push(
                `Aviso: "${food.nome}" (dia ${dIdx + 1}, refeição ${meal.nome}) pode conter "${kw}" — o paciente regista alergia/intolerância a isso.`
              );
            }
          }
        });
      });
    });
  }

  return { days, warnings };
}

// Regista tokens consumidos por geração (schema.sql secção 20) — é o que permite medir se o
// prompt caching está mesmo a compensar (cache_read_input_tokens alto = a repetir prefixo em
// cache; cache_creation_input_tokens sem leituras a seguir = a pagar o extra sem proveito).
// Nunca bloqueia a resposta ao utilizador: se a escrita falhar, só fica registado nos logs —
// a geração já aconteceu e já foi faturada pela Anthropic de qualquer forma, não faz sentido
// devolver erro ao nutricionista por causa disto.
async function logUsage(supabase: ReturnType<typeof createClient>, usage: AnthropicUsage, clientId: string, errorMessage: string | null) {
  try {
    const { error } = await supabase.from('ai_generation_usage').insert({
      client_id: clientId,
      input_tokens: usage.input_tokens ?? null,
      output_tokens: usage.output_tokens ?? null,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? null,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? null,
      error_message: errorMessage,
    });
    if (error) console.error('Erro ao registar uso de IA:', error);
  } catch (e) {
    console.error('Erro inesperado ao registar uso de IA:', e);
  }
}

type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

// ── Chamada à Anthropic (stream manual, sem SDK — ver plano) ────────────────
async function streamGeneration(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  info: Record<string, unknown>,
  macroTargets: MacroTargets | null
) {
  const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

  send({ type: 'stage', stage: 'a_gerar' });

  const patologias = matchPatologias(info.pPatologias);
  const allowedFoods = filterAllowedFoods(info.pAlergias, patologias);

  const anthropicRes = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL_ID,
      max_tokens: 8192,
      stream: true,
      system: buildSystemPrompt(allowedFoods, patologias, macroTargets),
      messages: [{ role: 'user', content: buildUserMessage(info, macroTargets) }],
      tools: [buildMealPlanTool()],
      // tool_choice:"any" força SEMPRE uma chamada à função — teste real mostrou o modelo a
      // responder só com perguntas de esclarecimento em texto (datas/horários/preferências)
      // em vez de gerar o plano, apesar da instrução "nunca escrevas o JSON como texto solto,
      // usa sempre a chamada de função" (o pedido é de uma só vez, sem hipótese de resposta
      // às perguntas). Troca aceite conscientemente: a documentação da Anthropic confirma que
      // com tool_choice forçado o modelo deixa de emitir texto antes do tool_use — o "texto de
      // raciocínio" streamado ao vivo no modal deixa de existir (a caixa fica vazia), mas a
      // geração nunca mais fica bloqueada à espera de uma resposta que a UI não consegue dar.
      tool_choice: { type: 'any' },
    }),
  });

  if (!anthropicRes.ok || !anthropicRes.body) {
    // O texto de erro da API (errText) fica só nos logs da função — pode
    // conter detalhe interno do fornecedor do modelo que não deve ir para o
    // ecrã do utilizador.
    const errText = await anthropicRes.text().catch(() => '');
    console.error('Erro ao contactar o modelo de IA:', anthropicRes.status, errText);
    send({ type: 'error', message: 'Não foi possível gerar o plano de momento. Tenta novamente.' });
    return;
  }

  const reader = anthropicRes.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let toolJson = '';
  let sawToolUse = false;
  // input_tokens/cache_*_tokens só vêm em message_start; output_tokens só fica definitivo no
  // último message_delta (o de message_start é sempre 0 nesse momento) — por isso guarda-se
  // aqui à parte em vez de ler só um evento.
  const usage: AnthropicUsage = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') continue;
      let evt: any;
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }
      if (evt.type === 'message_start') {
        const u = evt.message?.usage;
        if (u) {
          usage.input_tokens = u.input_tokens;
          usage.cache_creation_input_tokens = u.cache_creation_input_tokens;
          usage.cache_read_input_tokens = u.cache_read_input_tokens;
        }
      } else if (evt.type === 'message_delta') {
        if (typeof evt.usage?.output_tokens === 'number') usage.output_tokens = evt.usage.output_tokens;
      } else if (evt.type === 'content_block_delta') {
        if (evt.delta?.type === 'text_delta' && evt.delta.text) {
          send({ type: 'reasoning_delta', text: evt.delta.text });
        } else if (evt.delta?.type === 'input_json_delta' && evt.delta.partial_json) {
          sawToolUse = true;
          toolJson += evt.delta.partial_json;
        }
      }
    }
  }

  // Regista-se sempre no fim, com o resultado final (sucesso ou o motivo exato da falha) — não
  // logo aqui, ao contrário de uma versão anterior desta function: os tokens já foram
  // consumidos/faturados pela Anthropic independentemente do que acontece a seguir (falha de
  // parsing, alimento inexistente, etc.), mas o limite diário/mensal (checkRateLimit) só deve
  // contar como "plano usado" as gerações que resultam mesmo num plano — uma falha de
  // validação (ex.: "alimento inexistente") gastou dinheiro real mas não deu ao nutricionista
  // nada aproveitável, e obrigá-lo a "tentar novamente" já é o preço que paga; não devia além
  // disso ficar com menos planos de sobra no dia. logUsage grava sempre (para observabilidade
  // de custo total), errorMessage é que distingue "plano usado" de "tentativa falhada" para
  // efeitos do limite — ver checkRateLimit().
  const logAndSend = async (errorMessage: string | null, resultPayload?: unknown) => {
    if (usage.input_tokens != null) await logUsage(supabase, usage, clientId, errorMessage);
    if (errorMessage) send({ type: 'error', message: errorMessage });
    else if (resultPayload) send(resultPayload);
  };

  if (!sawToolUse) {
    await logAndSend('O modelo não conseguiu gerar um plano estruturado. Tenta novamente.');
    return;
  }

  send({ type: 'stage', stage: 'a_validar_alimentos' });

  let parsed: any;
  try {
    parsed = JSON.parse(toolJson);
  } catch {
    await logAndSend('Resposta do modelo em formato inválido. Tenta gerar novamente.');
    return;
  }

  send({ type: 'stage', stage: 'a_verificar_alergenios' });

  const allowedIds = new Set(allowedFoods.map((f) => f.id));
  const result = validatePlan(parsed?.days, info.pAlergias, parsed?.avisos_ia, allowedIds);
  if ('error' in result) {
    await logAndSend(result.error);
    return;
  }

  await logAndSend(null, { type: 'result', days: result.days, warnings: result.warnings });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(req) });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return corsJson(req, { type: 'error', message: 'Não autenticado.' }, 401);

  let clientId: string | undefined;
  let planId: string | undefined;
  try {
    ({ clientId, planId } = await req.json());
  } catch {
    return corsJson(req, { type: 'error', message: 'Pedido inválido.' }, 400);
  }
  if (!clientId) return corsJson(req, { type: 'error', message: 'Falta clientId.' }, 400);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(clientId) || (planId !== undefined && !UUID_RE.test(planId))) {
    return corsJson(req, { type: 'error', message: 'Pedido inválido.' }, 400);
  }
  // const (não a "let clientId" original) para o tipo ficar garantidamente "string", não
  // "string | undefined" — a verificação acima já confirma isso, mas o TypeScript não
  // consegue confiar nesse estreitamento dentro do closure de stream.start() mais abaixo
  // sem esta cópia const.
  const validClientId: string = clientId;

  // Mesmo padrão do send-invite-email: reencaminha o Authorization de quem chama, a RLS
  // garante que só devolve o cliente se pertencer mesmo a este nutricionista.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  // Limite diário/mensal por PACIENTE (schema.sql secção 20) — verificado ANTES de gastar
  // qualquer chamada à Anthropic, para o caso de abuso nem chegar a custar nada. Corre antes
  // de confirmar que este clientId pertence mesmo a este nutricionista (isso só acontece a
  // seguir, na leitura de "clients") — inofensivo mesmo assim: a RLS de ai_generation_usage
  // só deixa ver linhas com profile_id = auth.uid(), por isso um clientId alheio devolve
  // sempre contagem 0 aqui, e a geração é bloqueada de qualquer forma pela leitura de
  // "clients" a seguir. Ajusta as constantes consoante o custo real observado (a tabela
  // guarda os tokens de cada geração para isso).
  const rateLimitError = await checkRateLimit(supabase, validClientId);
  if (rateLimitError) return corsJson(req, { type: 'error', message: rateLimitError }, 429);

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, info')
    .eq('id', clientId)
    .single();

  if (clientError || !client) {
    return corsJson(req, { type: 'error', message: 'Paciente não encontrado ou sem permissão.' }, 404);
  }

  const info = (client.info as Record<string, unknown>) || {};

  // Metas de macros são opcionais e vivem em "plans" (não em "clients.info") — mesmo padrão
  // de nunca confiar no payload do frontend para o que entra no prompt: relê-se aqui por
  // planId, com a mesma RLS a garantir que o plano pertence a este nutricionista. Se não vier
  // planId, ou o plano não tiver metas definidas, a IA simplesmente não recebe alvo numérico
  // (comportamento anterior, inalterado).
  let macroTargets: MacroTargets | null = null;
  if (planId) {
    const { data: plan } = await supabase
      .from('plans')
      .select('macro_targets')
      .eq('id', planId)
      .eq('client_id', clientId)
      .single();
    const mt = plan?.macro_targets as MacroTargets | null | undefined;
    if (mt && Number.isFinite(mt.kcal) && Number.isFinite(mt.prot) && Number.isFinite(mt.hc) && Number.isFinite(mt.lip)) {
      macroTargets = mt;
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await streamGeneration(controller, encoder, supabase, validClientId, info, macroTargets);
      } catch (e) {
        // O erro real (e) fica só nos logs da função — pode ser uma exceção
        // interna em inglês, não algo para mostrar tal e qual ao utilizador.
        console.error('Erro inesperado a gerar plano:', e);
        try {
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message: 'Ocorreu um erro inesperado. Tenta novamente.' }) + '\n'));
        } catch {
          // conexão já fechada do lado do cliente — nada a fazer
        }
      } finally {
        try { controller.close(); } catch { /* já fechado */ }
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeadersFor(req), 'Content-Type': 'application/x-ndjson' },
  });
});
