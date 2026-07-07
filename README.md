# CachosNutri

Webapp de planeamento alimentar para nutricionistas, com a base de dados TCA-INSA completa.

## Funcionalidades

- **1376 alimentos reais** da Tabela de Composição de Alimentos (BDCA v7.1 2026), INSA Portugal
- **Plano semanal** — 7 dias, refeições dinâmicas (adicionar/remover/renomear)
- **Pesquisa em tempo real** com filtro por categoria
- **Macros por porção** — ajuste de gramas com recálculo automático
- **Piechart** sempre visível com totais do dia (kcal, proteína, HC, lípidos)
- **Conta + sincronização (Supabase)** — dados de pacientes/planos/consultas guardados na cloud, com login por nutricionista e isolamento por RLS
- **Responsivo** — utilizável em telemóvel/tablet, com menu em drawer
- **Consentimento informado + exportação RGPD** — registo de consentimento por paciente e exportação de todos os dados em JSON
- **Impressão** — layout limpo para imprimir ou exportar para PDF, com nome e nº de cédula profissional do nutricionista

## Configuração (Supabase)

A app fala diretamente com o Supabase a partir do browser (sem servidor próprio):

1. Cria um projeto em [supabase.com](https://supabase.com).
2. Corre `supabase/schema.sql` no SQL Editor do projeto (tabelas + RLS).
3. Em `public/js/supabase-client.js`, atualiza `SUPABASE_URL` e `SUPABASE_ANON_KEY` com as chaves do teu projeto (Project Settings → API).
4. Abre `public/index.html` — não precisa de build nem de servidor para correr.

## Estrutura do projeto

```
public/          site estático servido em produção (Vercel) — index.html, css/, js/, img/
supabase/        schema.sql (tabelas + RLS)
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
