# Backlog CachosNutri — Pré-lançamento MVP

> Última atualização: 20 julho 2026
> Formato: checklist markdown, um ficheiro, editável em qualquer editor de texto.
> Como usar: marca `[x]` quando terminares uma tarefa. As secções "Notas" servem para registar decisões, datas e obstáculos — não apagues, só acrescenta.

---

## Como está organizado

- **P0** — bloqueia lançamento. Não avances para P1 sem estes fechados.
- **P1** — antes de escalar para mais utilizadores.
- **P2** — reduz risco a baixo custo, podes intercalar com P0/P1 se surgir tempo livre.
- **P3** — limpeza técnica, sem pressão de data.

Ordem de arranque recomendada dentro do P0: **IA (limite + caching) → política de estudantes → auditoria RLS → optimistic locking.**

Nota de capacidade: sendo só tu a trabalhar nisto, os dois P0 mais pesados (Auditoria RLS e Optimistic locking) tocam nas mesmas tabelas e vão competir pelo mesmo tempo — trata-os como sequenciais, não em paralelo. Estimativa realista total: **6-7 semanas**, não a soma otimista dos dias.

---

## P0 — Bloqueia lançamento

### [x] Limite de uso da IA por conta + prompt caching
- **Estimativa:** 3-4 dias
- **Onde:** Edge Function `generate-meal-plan`
- **Dependências:** suporte a prompt caching da API Anthropic
- **Critério de pronto:**
  - [x] Limite diário/mensal por conta implementado e testado
  - [ ] Prompt caching do bloco estático (lista TCA filtrada + instruções) confirmado a reduzir tokens de input — **testado em produção e revertido de propósito**, ver notas
  - [x] Custo médio por geração medido antes e depois da mudança
- **Notas:**
  - **20 jul 2026** — Implementado e testado em produção (dados reais de `ai_generation_usage`):
    - Tabela `ai_generation_usage` (schema.sql secção 20) — uma linha por chamada real à Anthropic (`input_tokens`/`output_tokens`/`cache_creation_input_tokens`/`cache_read_input_tokens`/`error_message`), RLS só select/insert das próprias linhas, sem update/delete (para não dar forma de "resetar" o contador).
    - **Limite por PACIENTE** (pedido explícito do utilizador, não por conta — um nutricionista com muitos pacientes tem de conseguir gerar para cada um), em dois níveis, contados por `client_id`:
      - Planos (só gerações que terminam com sucesso): 3/dia, 10/mês.
      - Tentativas (sucesso + falha): 6/dia, 20/mês — descoberto em uso real que uma geração pode gastar tokens e falhar na validação desta function (ex.: "alimento inexistente"), o que sem este segundo nível gastava uma das 3 tentativas "boas" do dia sem dar plano nenhum ao nutricionista.
    - **Prompt caching — tentado, medido, revertido**: o código já tinha uma tentativa anterior rejeitada por raciocínio teórico (lista de alimentos filtrada por paciente, pouca reutilização esperada entre pacientes diferentes). Voltou a tentar-se aqui, separando o prompt em instruções estáticas + tabela do paciente com `cache_control` na tabela — posto em produção, o **custo real subiu de ~6 para ~10 cêntimos na 1ª geração de um paciente** (paga o preço de escrita em cache), caindo para **~3 cêntimos numa 2ª geração do mesmo paciente pouco depois** (lê em cache). Confirma a teoria com números reais: só compensa quando o mesmo paciente é regenerado dentro da janela de cache; para uma geração única por paciente (o caso mais comum observado) sai pior. Revertido a pedido do utilizador — código atual não usa `cache_control`, com nota inline a registar este resultado para não se tentar outra vez sem dados de reutilização reais.

---

### [x] Política de estudantes — opção 1 (aviso visível), assumida temporariamente
- **Estimativa:** 2-3 dias
- **Onde:** Portal do paciente, PDF exportado, Termos de Serviço
- **Dependências:** texto legal atualizado
- **Critério de pronto:**
  - [x] Aviso visível ao paciente implementado no portal
  - [x] Aviso visível incluído no PDF exportado do plano
  - [x] Métrica "% planos publicados por conta de estudante vs. nutricionista" a ser registada
  - [x] Métrica visível no dashboard de admin
- **Ponto de reavaliação:** 2-3 meses após lançamento, ou quando houver volume suficiente para a métrica ser significativa. Se os dados justificarem, subir para opção 2 (revisão por nutricionista supervisor).
- **Notas:**
  - **20 jul 2026** — Implementado:
    - Portal (`portal.js`): banner não-dispensável no topo de "Plano de hoje" quando `clients.nutricionista_id` aponta para uma conta `role='estudante'` — nova RLS ("paciente vê o profile do seu nutricionista", schema.sql secção 21) e um segundo embed (`nutri_profile:profiles!nutricionista_id(role)`) na mesma query que já ia buscar os dados do paciente, sem pedido extra.
    - PDF (`app.js` `generatePdf()`): mesmo aviso, condicional a `appProfile.role === 'estudante'` (agora populado em `initApp()` a partir do profile já lido para o gate de verificação) — necessário porque o paciente pode imprimir/guardar o PDF e nunca mais abrir o portal.
    - Métrica: nova RPC `admin_get_student_plan_stats()` (security definer, só admin) devolve só contagens agregadas (`total_plans`/`student_plans`) — nunca linhas de `plans`/`clients` a título individual, para não expor dados clínicos ao admin nem agregados por trás. Cartão novo no topo do `admin.html` com a percentagem.
    - Termos de Serviço: novo parágrafo na secção 1 (quem pode usar) a explicar o estatuto de estudante e que os planos ficam identificados; secção 2 ajustada para refletir que a responsabilidade clínica é de quem elabora o plano, não só do "nutricionista".
  - **Falta antes de considerar isto em produção**: correr a secção 21 nova do `schema.sql` no SQL Editor (idempotente, só acrescenta — o resto do ficheiro já está deployado).
- **Notas:**

---

### [ ] Auditoria RLS de escrita — tabelas + Storage
- **Estimativa:** 5-7 dias
- **Onde:** todas as tabelas Postgres + `storage.objects` (buckets `verification-documents` e `meal-photos`)
- **Dependências:** políticas atuais de SELECT como ponto de partida
- **Critério de pronto:**
  - [ ] Políticas INSERT/UPDATE/DELETE revistas tabela a tabela
  - [ ] Políticas de `storage.objects` revistas para ambos os buckets
  - [ ] Testes automatizados de isolamento entre contas adicionados à suite
- **Notas:**

---

### [ ] Optimistic locking / concorrência de escrita
- **Estimativa:** 5-7 dias
- **Onde:** `clients`, `plans`, `consultations`, `meal_logs`
- **Dependências:** coluna `updated_at`/versão nas 4 tabelas
- **Critério de pronto:**
  - [ ] Deteção de conflito ativa nas 4 tabelas
  - [ ] UX de resolução de conflito implementada em cada superfície de edição (recarregar vs. sobrescrever)
- **Notas:**

---

## P1 — Antes de escalar utilizadores

### [ ] Rate limiting em login, reset de password e convites
- **Estimativa:** 2-3 dias
- **Onde:** Supabase Auth + lógica de convite de 6 caracteres
- **Critério de pronto:**
  - [ ] Limites configurados e testados (ex.: N tentativas/hora)
  - [ ] Mensagens de erro claras
  - [ ] Confirmado sem falsos positivos em uso legítimo
- **Notas:**

---

### [ ] Idempotência nas Edge Functions
- **Estimativa:** 3-4 dias
- **Onde:** `send-invite-email`, `generate-meal-plan`, `notify-verification-status`, `cleanup-meal-photos`
- **Critério de pronto:**
  - [ ] Cada função tratada com chave/verificação de idempotência
  - [ ] Testado com chamadas duplicadas sem efeito duplicado
- **Notas:**

---

### [ ] Paginação nas listagens de pacientes e admin
- **Estimativa:** 3 dias
- **Onde:** listagens do dashboard de nutricionista e do admin
- **Critério de pronto:**
  - [ ] Listas paginadas (cursor ou offset)
  - [ ] Testado com 200+ registos sem degradação percetível
- **Notas:**

---

### [ ] Log append-only das decisões do admin
- **Estimativa:** 2 dias
- **Onde:** nova tabela de auditoria dedicada
- **Critério de pronto:**
  - [ ] Toda aprovação/rejeição registada de forma imutável, com timestamp e autor
  - [ ] Consultável no dashboard de admin
- **Notas:**

---

## P2 — Reduz risco a baixo custo

### [ ] Log amplo de eventos de negócio
- **Estimativa:** 3-4 dias
- **Onde:** convite emitido/consumido, plano gerado/editado, comentário clínico
- **Dependências:** auditoria de admin (P1) como base
- **Critério de pronto:**
  - [ ] Eventos-chave registados
  - [ ] Consultáveis
- **Notas:**

---

### [ ] Mover foto de perfil de `profiles` para Storage
- **Estimativa:** 1 dia
- **Onde:** bucket privado existente
- **Critério de pronto:**
  - [ ] Campo `data-URI` migrado
  - [ ] Upload/leitura via Storage
  - [ ] Sem regressão visual
- **Notas:**

---

### [ ] MFA para nutricionistas e admin
- **Estimativa:** 1-2 dias
- **Onde:** Supabase Auth
- **Critério de pronto:**
  - [ ] MFA disponível para nutricionistas
  - [ ] MFA obrigatório para admin
  - [ ] Fluxo de ativação testado
- **Notas:**

---

### [ ] Sanitização anti-XSS de texto livre
- **Estimativa:** 3 dias
- **Onde:** `app.html`, `portal.html`, `admin.html`
- **Critério de pronto:**
  - [ ] Todos os pontos de inserção de texto de utilizador no DOM auditados manualmente
  - [ ] Confirmados como escapados
  - [ ] Teste de regressão com payload XSS básico
- **Notas:**

---

## P3 — Limpeza técnica

### [ ] Automatizar geração da cópia recortada da TCA
- **Estimativa:** 1-2 dias
- **Onde:** fonte única `tca_data.js` → cópia da Edge Function
- **Critério de pronto:**
  - [ ] Script de build gera a cópia automaticamente
  - [ ] Passo manual eliminado
  - [ ] Verificado em CI
- **Notas:**

---

### [ ] Isolar suite Playwright de projeto Supabase partilhado
- **Estimativa:** 3-4 dias
- **Onde:** suite de testes E2E
- **Critério de pronto:**
  - [ ] Suite corre contra projeto de teste dedicado
  - [ ] Seed/teardown automatizado
  - [ ] Zero impacto em dados reais
- **Notas:**

---

## Registo de decisões

Usa esta secção para guardar decisões importantes que não cabem numa tarefa específica.

- **20 jul 2026** — Política de estudantes fechada como opção 1 (aviso visível), com métrica de adoção e gatilho de reavaliação a 2-3 meses.
- **20 jul 2026** — Backlog consolidado a partir de auditoria completa da app (arquitetura, segurança, IA/custos).
- **20 jul 2026** — Limites de IA definidos sem dados reais (20/dia, 100/mês por conta) — revisitar assim que houver uso real registado em `ai_generation_usage`.
