// One-off script — NÃO corre automaticamente em deploy nenhum. Gera uma cópia
// recortada da TCA (só os campos que a geração de planos por IA precisa) para
// dentro da pasta da Edge Function generate-meal-plan, já que o Deno não
// consegue importar public/js/data/tca_data.js do frontend em runtime.
//
// Corre manualmente sempre que public/js/data/tca_data.js mudar:
//   node scripts/generate-tca-trimmed.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC  = join(__dirname, '..', 'public', 'js', 'data', 'tca_data.js');
const DEST = join(__dirname, '..', 'supabase', 'functions', 'generate-meal-plan', 'tca_data.json');

const src = readFileSync(SRC, 'utf8');
const match = src.match(/const TCA = (\[[\s\S]*\]);/);
if (!match) throw new Error('Não encontrei "const TCA = [...]" em ' + SRC);

// eslint-disable-next-line no-new-func -- é JS (não JSON estrito), corre só localmente, nunca em produção.
const TCA = new Function('return ' + match[1])();

const trimmed = TCA.map(f => ({
  id: f.id,
  nome: f.nome,
  cat: f.cat,
  kcal: f.kcal,
  prot: f.prot,
  hc: f.hc,
  lip: f.lip,
  // Não vai para a tabela mostrada ao modelo (custaria tokens à toa) — só serve para o
  // filtro de "gordura trans" de patologias como hipercolesterolemia/psoríase/artrite
  // reumatoide excluir alimentos como a margarina (2.4g/100g neste valor real da TCA).
  agtrans: f.agtrans ?? null,
  // Sódio (mg/100g) — ao contrário do agtrans, este VAI para a tabela mostrada ao modelo
  // (custo mínimo confirmado: ~+6% de tokens da tabela) porque também serve restrições só
  // em texto livre (pNotas), não só patologias reconhecidas — nesses casos não há filtro
  // rígido possível, só o modelo a decidir com o valor real à vista.
  na: f.na ?? null,
})).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

writeFileSync(DEST, JSON.stringify(trimmed), 'utf8');
console.log(`Escrevi ${trimmed.length} alimentos em ${DEST}`);
