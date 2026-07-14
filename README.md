# CachosNutri

Webapp de planeamento alimentar para nutricionistas, com a base de dados TCA-INSA completa.

## Funcionalidades

- **1376 alimentos reais** da Tabela de Composição de Alimentos (BDCA v7.1 2026), INSA Portugal
- **Plano semanal** — 7 dias, refeições dinâmicas (adicionar/remover/renomear)
- **Pesquisa em tempo real** com filtro por categoria
- **Macros por porção** — ajuste de gramas com recálculo automático
- **Piechart** sempre visível com totais do dia (kcal, proteína, HC, lípidos)
- **Conta + sincronização (Supabase)** — dados de pacientes/planos/consultas guardados na cloud, com login por nutricionista e isolamento por RLS
- **Portal do Paciente** (`public/portal.html`) — convite por email (nutricionista → paciente), plano do dia interativo (água, refeições feitas/saltadas com notas), timeline "story" de fotos das refeições por categoria, e vista da evolução do próprio paciente
- **Responsivo** — utilizável em telemóvel/tablet, com menu em drawer
- **Consentimento informado + exportação RGPD** — registo de consentimento por paciente e exportação de todos os dados em JSON
- **Impressão** — layout limpo para imprimir ou exportar para PDF, com nome e nº de cédula profissional do nutricionista

## Configuração (Supabase)

A app fala diretamente com o Supabase a partir do browser (sem servidor próprio):

1. Cria um projeto em [supabase.com](https://supabase.com).
2. Corre `supabase/schema.sql` no SQL Editor do projeto (tabelas + RLS).
3. Em `public/js/supabase-client.js`, atualiza `SUPABASE_URL` e `SUPABASE_ANON_KEY` com as chaves do teu projeto (Project Settings → API).
4. Abre `public/index.html` — não precisa de build nem de servidor para correr.

### Convite por email do Portal do Paciente

O envio do email de convite (`public/js/app.js`: `sendInvite`/`resendInvite`) usa uma
Edge Function do Supabase que fala com a [Resend](https://resend.com):

1. Cria uma conta em [resend.com](https://resend.com) e gera uma API key.
2. Instala a [Supabase CLI](https://supabase.com/docs/guides/cli) e faz login (`supabase login`).
3. Configura os secrets da function (a partir da raiz do projeto):
   ```bash
   supabase link --project-ref <o-teu-project-ref>
   supabase secrets set RESEND_API_KEY=re_xxxxxxxx
   supabase secrets set PORTAL_URL=https://o-teu-dominio.vercel.app
   # opcional — por omissão usa o domínio de teste da Resend:
   supabase secrets set INVITE_FROM_EMAIL="CachosNutri <onboarding@resend.dev>"
   ```
4. Publica a function:
   ```bash
   supabase functions deploy send-invite-email
   ```

Sem isto configurado, o convite continua a ser criado normalmente (código + link ficam
visíveis na ficha do paciente para copiar e enviar manualmente) — só o envio automático
por email é que falha, com aviso na interface.

### Fotos de refeições — bucket e limpeza automática

As fotos de refeições (tab "Fotos" do portal do paciente) usam o Supabase Storage:

1. Corre `supabase/schema.sql` novamente após o `git pull` (a secção 7 cria o bucket
   `meal-photos` e as políticas de RLS de `storage.objects` — é idempotente, seguro repetir).
2. Cada foto é comprimida no browser antes do upload (800×800px, JPEG a 70%), por isso o
   armazenamento cresce devagar — mas fotos de comida não precisam de ficar para sempre, por
   isso há uma Edge Function que as apaga automaticamente passados 45 dias:
   ```bash
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<a-tua-service-role-key>   # Project Settings → API
   supabase secrets set CRON_SECRET=<uma-string-aleatoria-a-tua-escolha>
   supabase functions deploy cleanup-meal-photos
   ```
   O `CRON_SECRET` é exigido pela function (cabeçalho `x-cron-secret`) para que só o cron job
   consiga invocá-la — sem isto, qualquer pessoa com a anon key pública conseguiria disparar a
   limpeza fora do horário.
3. Agenda a function para correr 1×/dia no dashboard do Supabase: **Database → Cron Jobs →
   Create a new cron job → tipo "Supabase Edge Function"** → escolhe `cleanup-meal-photos` →
   adiciona o cabeçalho HTTP `x-cron-secret` com o mesmo valor do `CRON_SECRET`.
   Isto fica-se pelo dashboard (não em SQL committed) para nunca escrever a service-role key
   em controlo de versão.

Sem o passo 3, a app continua a funcionar normalmente — só o armazenamento deixa de se
reciclar sozinho, o que só importa a longo prazo (o limite gratuito do Supabase é 1GB).

### Gerar plano com IA

Botão "✨ Gerar com IA" no editor de planos (`public/js/app.js`: `generatePlanWithAI`) — cria
um rascunho de plano semanal usando o modelo Claude Haiku 4.5 (Anthropic), a partir do
objetivo/alergias/patologias/medicação/notas já guardados na ficha do paciente. Nunca é
guardado automaticamente — fica como rascunho editável até o nutricionista clicar em "Guardar
plano" ou fazer qualquer edição normal.

1. Cria uma chave em [console.anthropic.com](https://console.anthropic.com).
2. Configura o secret e publica a function:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
   supabase functions deploy generate-meal-plan --no-verify-jwt
   ```
   O `--no-verify-jwt` é necessário porque esta function faz streaming e responde a um pedido
   `OPTIONS` (preflight de CORS) antes de qualquer `Authorization` — a verificação de JWT da
   gateway do Supabase corre antes do código da function e bloqueia esse preflight. A function
   já verifica a autenticação sozinha (linha do `Authorization`), por isso continua segura sem
   esse passo automático da gateway.

`supabase/functions/generate-meal-plan/tca_data.json` é uma cópia recortada e commitada de
`public/js/data/tca_data.js` (só `id/nome/cat/kcal/prot/hc/lip/agtrans/na`, sem os restantes
campos de vitaminas/minerais) — a Edge Function (Deno) não consegue importar o ficheiro do frontend em
runtime, por isso esta cópia existe à parte e **não se sincroniza sozinha**. Sempre que
`tca_data.js` mudar (novos alimentos, correções), corre:
```bash
node scripts/generate-tca-trimmed.mjs
```
e volta a publicar a function.

Sem `ANTHROPIC_API_KEY` configurado, o botão "Gerar com IA" mostra um erro claro ao
nutricionista — o resto da app continua a funcionar normalmente.

## Estrutura do projeto

```
public/          site estático servido em produção (Vercel)
  index.html       landing page pública
  login.html       login/registo do nutricionista
  app.html         aplicação do nutricionista (autenticado)
  portal.html      portal do paciente (autenticado, read-only)
  css/, js/, img/
supabase/
  schema.sql               tabelas + RLS + bucket de Storage
  functions/send-invite-email/      Edge Function do convite por email
  functions/cleanup-meal-photos/    Edge Function agendada — apaga fotos de refeições >45 dias
  functions/generate-meal-plan/     Edge Function do botão "Gerar com IA" (rascunho de plano)
scripts/
  generate-tca-trimmed.mjs  gera supabase/functions/generate-meal-plan/tca_data.json a partir
                            de public/js/data/tca_data.js (correr manualmente quando este mudar)
tests/           suite Playwright (ver secção abaixo)
```

## Testes automatizados

Testes end-to-end com Playwright, correndo contra um projeto Supabase real (não há mocks).

```bash
npm install
npx playwright install chromium   # só na primeira vez
npm test
```

Os testes de autenticação (`tests/auth.spec.js`) correm sempre. Os restantes (CRUD, importação, mobile, isolamento entre contas) precisam de uma conta de teste já existente no Supabase — cria-a manualmente em *Authentication → Users → Add user* (com "Auto Confirm User") e exporta:

```bash
export TEST_NUTRI_EMAIL="teste@exemplo.com"
export TEST_NUTRI_PASSWORD="a-tua-password"
# opcional, só para o teste de isolamento entre contas (tests/rls.spec.js):
export TEST_NUTRI2_EMAIL="teste2@exemplo.com"
export TEST_NUTRI2_PASSWORD="outra-password"
```

Sem estas variáveis definidas, esses testes aparecem como *skipped* — nunca falham por falta de credenciais. Os testes limpam os pacientes que criam no fim de cada execução (`deleteAllClients`), para a conta de teste ficar sempre vazia entre execuções.

## Fonte dos dados

**INSA — Instituto Nacional de Saúde Doutor Ricardo Jorge**  
Tabela de Composição de Alimentos (BDCA), versão 7.1, 2026  
https://portfir.insa.min-saude.pt/

Campos incluídos por alimento: energia (kcal/kJ), lípidos, ácidos gordos saturados, hidratos de carbono, açúcares, sal, fibra, proteínas, colesterol, água.


## TO DO'S

Prompt: Cria uma CI/CD pipeline para testar as várias fases de desenvolvimento


Prompt: **Fase 4 (prioridade do utilizador)**: Engagement — registo diário de água (`daily_water_logs`), refeições feitas vs. planeadas (`meal_logs`), fotos de progresso (Supabase Storage), lembretes (Notification API local primeiro; push via Edge Function depois). Indicadores de adesão visíveis ao nutricionista na tab "Evolução".
