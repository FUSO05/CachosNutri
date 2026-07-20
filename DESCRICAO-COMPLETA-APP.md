# CachosNutri — Descrição Completa da Aplicação

> Documento de contexto exaustivo, escrito para ser fornecido a uma IA que vai analisar o projeto. Cobre todas as funcionalidades da aplicação, sem exceção, à data de escrita.

## O que é

CachosNutri é uma webapp SaaS de planeamento alimentar profissional, em português, dirigida a nutricionistas (e, mais recentemente, a estudantes de nutrição). Permite ao nutricionista criar e gerir fichas de pacientes, montar planos alimentares semanais com cálculo automático de macronutrientes a partir da tabela oficial de composição de alimentos do INSA (Instituto Nacional de Saúde Doutor Ricardo Jorge, versão BDCA 7.1), e acompanhar a evolução clínica dos pacientes ao longo do tempo. Cada paciente tem acesso a um portal próprio, instalável como PWA, onde segue o seu plano do dia, regista água e refeições, envia fotos das refeições, e acompanha a sua própria evolução. Tudo é sincronizado na cloud via Supabase, sem servidor próprio nem instalação — o frontend é HTML/CSS/JavaScript vanilla, sem build nem framework.

Atualmente a aplicação é gratuita (sem sistema de pagamentos implementado). Não é um dispositivo médico nem substitui aconselhamento médico — isso é explicitado nos Termos de Serviço.

## Stack técnica

- **Frontend**: HTML/CSS/JavaScript vanilla, sem build nem framework, corre diretamente no browser. Bibliotecas externas via CDN: Chart.js (gráficos), Supabase JS SDK.
- **Backend**: Supabase — Postgres (base de dados + Row Level Security para isolamento entre contas), Auth (autenticação), Storage (ficheiros privados), Edge Functions (Deno, lógica de servidor).
- **IA**: Anthropic Claude Haiku 4.5, usado para gerar rascunhos de planos alimentares.
- **Email transacional**: Resend, para convites de pacientes e notificações de aprovação/rejeição de contas.
- **Alojamento**: Vercel (site estático).
- **Testes**: Playwright (end-to-end, contra um projeto Supabase real, sem mocks).

## Perfis de utilizador, autenticação e verificação

Existem 4 tipos de conta, todas geridas na mesma tabela `profiles`, distinguidas por `role`: **nutricionista**, **estudante**, **paciente** e **admin**.

### Nutricionista

Regista-se em `login.html` (separador "Registar") com nome, email, password, país de atuação (Portugal ou Brasil — deriva automaticamente o "corpo profissional": ON = Ordem dos Nutricionistas para PT, CRN = Conselho Regional de Nutricionistas para BR) e nº de cédula profissional. A conta nasce com `status = pending_verification` e **não tem acesso à aplicação** até ser aprovada. Depois de confirmar o email (se a confirmação estiver ativa no projeto Supabase), ao entrar pela primeira vez é apresentado a um ecrã de gate que pede o upload de 2 documentos — comprovativo da ordem/conselho profissional e documento de identificação (Cartão de Cidadão/RG) — guardados num bucket privado do Storage (`verification-documents`). Depois de submeter os dois documentos, fica num ecrã de "a aguardar verificação" até um admin decidir. Se for rejeitada, vê o motivo e pode corrigir os dados/reenviar os documentos, o que a devolve ao estado pendente.

### Estudante de nutrição

Regista-se pelo mesmo formulário, com um seletor "Sou nutricionista"/"Sou estudante" que troca os campos pedidos: em vez de país/cédula, pede Instituição de Ensino e Ano previsto de conclusão. Existe um modelo híbrido de validação:

- **Fluxo automático** (email académico): se o domínio do email coincidir com padrões típicos de instituições de ensino (`alunos.`, `aluno.`, `estudantes.`, `student.`, `campus.`, `discente.`, `.edu`, `.edu.br`, `.ac.uk`, etc.), a conta fica `pending_email_confirmation`. Quando o utilizador confirma o email (clique no link enviado pelo Supabase Auth), uma trigger na base de dados deteta essa confirmação e aprova a conta automaticamente — sem qualquer intervenção do admin — definindo a validade por 1 ano (`expira_em = agora + 365 dias`). A deteção do "email académico" corre sempre no servidor, nunca é confiada ao cliente.
- **Fluxo manual** (email pessoal): se o email não parecer académico, a conta fica `pending_manual_verification` e é pedido o upload de 1 documento — comprovativo de matrícula do ano letivo vigente — revisto por um admin da mesma forma que os nutricionistas.

Uma conta de estudante aprovada tem exatamente o mesmo acesso à aplicação que um nutricionista aprovado (gere pacientes, planos, etc. — não há atualmente nenhuma restrição de funcionalidades nem sistema de "desconto" implementado). A validade expira ao fim de 1 ano; a expiração não é aplicada por nenhum cron job — é calculada em tempo real (comparando `expira_em` a "agora") tanto na proteção de acesso à base de dados como no ecrã que o utilizador vê. Quando expira, o estudante vê um ecrã com duas opções: **renovar** (reenviar novo comprovativo de matrícula, volta a `pending_manual_verification`) ou **tornar-se nutricionista** (preenche país/cédula/corpo profissional e passa a precisar de verificação profissional completa, como qualquer nutricionista novo — o histórico de estudante não isenta de verificação).

### Paciente

Nunca se regista livremente — a conta é criada pelo nutricionista (uma "ficha de cliente") e o paciente "reivindica" o acesso ao portal através de um código de convite de 6 caracteres (alfabeto sem ambiguidades, ~1 mil milhões de combinações, expira ao fim de 7 dias) enviado por email ou partilhado manualmente. Ao aceitar o convite, os dados de identidade já preenchidos na ficha (data de nascimento, género, telefone) são migrados automaticamente para o perfil do paciente, se ainda não estiverem definidos.

### Admin

Não tem nenhum formulário de registo — é criado manualmente por SQL diretamente na base de dados (`update profiles set role='admin'`), precisamente para não existir nenhuma superfície de ataque de auto-promoção. Acede a um dashboard próprio (`admin.html`), não ligado a nenhum menu da aplicação, só acessível por URL direta.

### Segurança do modelo de verificação

Existe uma trigger na base de dados (`prevent_self_privilege_escalation`) que bloqueia qualquer utilizador de alterar o seu próprio `role` ou `status` diretamente (o que, sem isto, seria possível via uma chamada direta à API com a chave pública) — só permite as transições muito específicas descritas acima (reenvio depois de rejeição, renovação/conversão depois de expirar), todas o resto é recusado ao nível da base de dados, não só da interface. As aprovações/rejeições feitas pelo admin passam por uma função RPC dedicada (não por uma permissão de escrita larga), que verifica que quem chama é mesmo admin, que a transição de estado é válida, e nunca deixa um admin agir sobre a sua própria conta por essa via.

## Landing page (`index.html`)

Página pública de marketing, sem necessidade de sessão. Inclui: navegação com link para a Área do Paciente e "Entrar"; secção de destaque (hero) com selos de confiança (RGPD, dados sincronizados, base TCA-INSA oficial); tira de estatísticas (4 fórmulas de TMB, 1.376 alimentos, 7 dias por semana, 100% sincronizado); grelha de 5 funcionalidades principais; duas secções de destaque com imagem (rigor clínico — equivalências algorítmicas, antropometria ISAK, classificação de IMC automática — e sincronização entre dispositivos); passos "Como funciona" (criar ficha → montar plano → acompanhar evolução); galeria de imagens; chamada final para ação; rodapé com ligações para Termos, Privacidade e Reembolso. Não tem secção de preços, testemunhos nem FAQ — é uma única oferta gratuita. Tem alternância de tema claro/escuro e um efeito de brilho que segue o rato nos cartões.

## Área do nutricionista (`app.html`)

### Estrutura geral

Barra lateral fixa (colapsa numa gaveta em mobile) com acesso ao Dashboard, alternância de tema, botão de perfil e logout. Antes de mostrar qualquer conteúdo, verifica se a conta está aprovada (ver secção de verificação acima) — se não estiver, mostra o ecrã de gate correspondente em vez da aplicação.

### Dashboard / início

Saudação personalizada, data atual, 4 cartões de estatísticas (pacientes ativos, planos criados, e dois números fixos de marketing: "4 fórmulas de TMB" e "1.376 alimentos TCA"), painel de destaque com botão "Adicionar paciente", e uma lista de pacientes pesquisável e filtrável (cartões com avatar/iniciais, nome, data de criação, nº de planos, botão de eliminar).

### Ficha do paciente — separador Informações

Registo clínico completo, organizado em cartões:
- **Dados pessoais**: nome, data de nascimento (idade calculada automaticamente), género, email, telefone, e uma caixa de confirmação de "consentimento registado presencialmente" com data. Se o paciente já tiver conta ligada ao portal, estes campos ficam só de leitura (passam a espelhar o que o próprio paciente define no seu perfil).
- **Avaliação antropométrica**: altura, peso atual, IMC (calculado automaticamente, com classificação: abaixo do peso / peso normal / pré-obesidade / obesidade grau I a III), peso de referência, peso objetivo, % de massa gorda, massa isenta de gordura (calculada).
- **Pregas cutâneas** (mm): tricipital, bicipital, subescapular, abdominal, supraespinal, ileocristal, crural, geminal, com somatório automático.
- **Perímetros** (cm): cefálico, braço, cintura (ISAK), anca, crural, geminal.
- **Atividade e energia**: seletor de fórmula de TMB (Harris-Benedict, ten Haaf, De Lorenzo, Cunningham — todas implementadas com as fórmulas reais), nível de atividade física/PAL (escala EFSA: sedentário 1.4, moderado 1.6, ativo 1.8, muito ativo 2.0), objetivo principal (perda/manutenção/ganho de peso/saúde/outro), TMB e Gasto Energético Total calculados automaticamente.
- **Informações clínicas**: alergias/intolerâncias, patologias/condições, medicação atual — todos campos de texto livre.
- **Observações e notas**: texto livre.
- **Portal do paciente**: widget de gestão do convite (ver abaixo).
- Ações: exportar todos os dados do paciente em JSON (portabilidade RGPD), guardar (sincronização automática com debounce e reenvio em caso de falha, com indicador de estado na barra lateral).

O convite ao portal gera um código de 6 caracteres e um link partilhável, envia por email via a Edge Function `send-invite-email` (com aviso se o envio falhar, mas o link continua disponível para copiar manualmente), e mostra o estado do convite (nenhum / pendente com opção de reenviar ou cancelar / associado com opção de remover acesso).

### Ficha do paciente — separador Planos

Lista de planos do paciente (cartões com nome, data, indicadores de atividade por dia da semana, nº de refeições), painel de resumo (dias planeados, adesão semanal %, veredito de equilíbrio de macros), distribuição média diária de macronutrientes, informações adicionais (objetivo, atividade, GET, nº de alimentos distintos, dias sem refeições).

**Editor de planos**: 7 separadores de dia (lista suspensa em mobile), cartões de refeição editáveis (nome, hora, alimentos com quantidade em gramas e macros calculados em tempo real, botão de trocar por equivalente, remover). Pesquisa de alimentos com debounce sobre os 1.376 itens da tabela TCA, filtro por categoria, pré-visualização de macros antes de adicionar. Painel lateral com gráfico circular (Chart.js) da distribuição de macros do dia, metas diárias configuráveis com barras de progresso, e meta de água diária. Sistema de equivalências algorítmico (sugere até 6 alimentos alternativos com calorias semelhantes e perfil de macros mais próximo). Função de copiar um dia inteiro para outro. 10 templates pré-definidos de planos de 7 dias (défice calórico, hipertrofia, vegetariano, sem glúten, sem lactose, baixo teor de carboidratos, baixo teor de fibra, hiperproteico, baixo FODMAP, ovolactovegetariano) mais templates personalizados guardáveis pelo próprio nutricionista.

**Geração de plano com IA**: botão que abre um modal de metas de macros (opcional), depois transmite em streaming o progresso da geração (a gerar → a validar alimentos → a verificar alergénios) através da Edge Function `generate-meal-plan`. O rascunho gerado nunca é guardado automaticamente — fica editável, com uma barra a exigir confirmação explícita ("Confirmo que revi alergias, patologias, medicação...") antes de permitir gravar.

**Exportação para PDF**: layout de impressão dedicado, um dia (retrato) ou vários dias (paisagem, tabela semanal), com nome e cédula do nutricionista.

### Ficha do paciente — separador Evolução

Cartões de adesão dos últimos 7 dias (água média vs. meta, % de refeições cumpridas), tabela diária detalhada com estado por refeição (feita/saltada/modificada/nenhuma) e um modal de detalhe por refeição onde o nutricionista pode ler a nota do paciente e escrever/editar/apagar um comentário visível ao paciente. Timeline de fotos das refeições dos últimos 2 dias (com visualizador em formato "stories"), mais um calendário mensal completo para navegar fotos de qualquer data. Gráficos de evolução (peso, % massa gorda, IMC) a partir do histórico de consultas. Registo de consultas (cria um "instantâneo" datado dos valores atuais do formulário) com histórico paginado e exportável para CSV.

### Perfil do nutricionista

Modal de definições: foto (redimensionada no browser, guardada como data-URI, sem bucket de Storage), nome, data de nascimento (bloqueada após a primeira gravação), género, email, nº de cédula, alteração de password, e ligações para Termos/Privacidade e pedido de exportação/eliminação de dados por email.

## Portal do paciente (`portal.html`)

Ponto de entrada separado, instalável como PWA (manifest + service worker próprios, com aviso de instalação adaptado a Android e iOS).

**Autenticação**: registo exige o código de convite (pré-preenchido se vier de um link, ou introduzido manualmente); o código é guardado em localStorage para sobreviver ao intervalo até à confirmação do email, e consumido automaticamente no primeiro login.

**Gate de consentimento**: no primeiro acesso, um modal não dispensável (sem X, sem fechar ao clicar fora) exige aceitar os termos de consentimento antes de continuar; só a opção de sair fica disponível como alternativa.

**Separador "Plano de hoje"**: navegação entre os 7 dias da semana; resumo nutricional do dia (kcal, proteína, hidratos, gordura); registo de água com botões rápidos (+250ml/+500ml) e valor personalizado; navegação entre refeições com, apenas no dia de hoje, ações de marcar feita/saltada, adicionar nota (com hora real em que comeu), tirar/carregar foto (comprimida no browser antes do envio) e ver comentários que o nutricionista tenha deixado.

**Separador Evolução**: espelho de leitura dos gráficos e histórico de consultas do lado do nutricionista, sem edição.

**Separador Fotos**: calendário mensal estilo Instagram com indicação dos dias com fotos, visualizador em formato "stories".

**Definições**: edição de perfil (foto, nome, email, data de nascimento bloqueada após definida, género, telefone), alteração de password, alternância de tema, estado do consentimento, pedidos RGPD por email.

## Dashboard de admin (`admin.html`)

Não acessível por nenhum menu, só por URL direta. Login próprio que verifica `role = admin`. Quatro filtros (Pendentes, Aprovados, Rejeitados, Todos — "Pendentes" agrupa tanto nutricionistas como estudantes com pedidos por rever). Lista de cartões com nome, badge de tipo de conta, email, badge de estado, campos específicos por tipo (cédula/país/corpo para nutricionista; instituição/ano de conclusão para estudante), data de criação, ligações para ver os documentos submetidos (URLs assinadas e temporárias do Storage), e botões de Aprovar/Rejeitar (rejeitar exige motivo). Depois de decidir, dispara uma notificação por email de cortesia (a decisão em si já ficou gravada na base de dados antes disso).

## Base de dados (visão geral das tabelas)

- **profiles** — uma linha por utilizador autenticado: tipo de conta, estado de verificação e todos os campos associados (motivo de rejeição, documentos submetidos, país/corpo profissional/cédula, instituição/ano de conclusão, datas de validação/expiração), e dados de perfil partilhados entre nutricionista e paciente (nome, email, foto, data de nascimento, género, telefone).
- **nutricionista_paciente_links** — sistema de convites: código, email de destino, estado (pendente/ativo/revogado), a que ficha de cliente pertence.
- **clients** — uma ficha de paciente por linha: quem é o nutricionista dono, o paciente ligado (se já reivindicado), nome, e um grande registo de todos os campos clínicos/antropométricos.
- **plans** — um plano semanal por linha, associado a uma ficha: estrutura de 7 dias com refeições e alimentos, metas de macros, meta de água.
- **consultations** — uma consulta/avaliação registada por linha.
- **daily_water_logs** — um registo de água bebida por linha.
- **meal_logs** — histórico de refeições marcadas como feitas/saltadas/modificadas pelo paciente.
- **progress_photos** — uma foto de refeição por linha (caminho no Storage, data, refeição).
- **patient_consents** — registo de que o próprio paciente aceitou o consentimento no portal.
- **meal_comments** — comentários do nutricionista sobre refeições específicas, visíveis ao paciente.

Todas as tabelas têm Row Level Security ativa, isolando cada nutricionista aos seus próprios pacientes e cada paciente aos seus próprios dados.

## Storage (ficheiros)

- **meal-photos** (privado, 5MB, jpeg/png/webp) — fotos de refeições dos pacientes.
- **verification-documents** (privado, 8MB, pdf/jpeg/png) — documentos de verificação profissional/identidade/matrícula.

Nunca há URLs públicos — todo o acesso passa por políticas de RLS ou por links assinados temporários.

## Edge Functions (lógica de servidor)

- **send-invite-email** — envia o email de convite ao paciente via Resend, depois de confirmar por RLS que o convite pertence mesmo ao nutricionista que está a chamar.
- **cleanup-meal-photos** — função agendada (cron diário, protegida por um cabeçalho secreto próprio) que apaga fotos de refeições com mais de 45 dias, tanto do Storage como da base de dados.
- **generate-meal-plan** — gera um rascunho de plano semanal com Claude Haiku 4.5: filtra a lista de alimentos permitidos (remove alergénios por expansão de sinónimos, contraindicações por patologia a partir de uma base de conhecimento de ~65 condições, alimentos crus arriscados), pede à IA um plano completo usando só IDs de alimentos válidos, valida o resultado (IDs reais, quantidades mínimas realistas, nova verificação de alergénios) e devolve avisos — nunca escreve na base de dados.
- **notify-verification-status** — envia o email de aprovação/rejeição depois de uma decisão do admin, com texto diferente consoante o tipo de conta (nutricionista/estudante) e o resultado.

## Base de dados de alimentos (TCA/INSA)

1.376 alimentos, 15 categorias (Frutas, Peixes, Hortícolas, Açúcares e doces, Bebidas, Leguminosas, Carnes, Pratos compostos, Outros, Cereais, Laticínios, Gorduras, Tubérculos, Temperos, Ovos), cada um com painel nutricional completo por 100g (energia, todos os macronutrientes, vitaminas, minerais — cerca de 49 campos por alimento), embutido diretamente no frontend (`public/js/data/tca_data.js`). Fonte: INSA — Instituto Nacional de Saúde Doutor Ricardo Jorge, Tabela de Composição de Alimentos (BDCA), versão 7.1. Uma cópia recortada (só os campos essenciais para cálculo de macros) é mantida em separado para a Edge Function de IA, gerada por um script sempre que a tabela original muda.

## Funcionalidades transversais

- **Tema claro/escuro** em todas as páginas, persistido, com deteção da preferência do sistema, aplicado sem flash inicial, incluindo as cores dos gráficos.
- **Responsividade mobile** testada (menu em gaveta, seletores em vez de separadores em ecrãs estreitos).
- **PWA** no portal do paciente (instalável, funciona com cache de recursos estáticos, atualização automática de versão).
- **Importação de dados locais**: dados antigos guardados só no browser (antes de existir conta Supabase) podem ser importados uma vez para a conta na cloud.
- **Exportações**: dados do paciente em JSON, histórico de consultas em CSV, planos em PDF.
- **RGPD**: consentimento explícito do paciente, exportação/eliminação de dados por pedido, política de privacidade dedicada (secções sobre onde os dados ficam armazenados, fotos de refeições, prazo de retenção, direitos do titular, cookies).
- **Páginas legais**: Termos de Serviço, Política de Privacidade, Política de Reembolso — todas com a mesma navegação/rodapé da landing page.
- **Segurança**: mensagens de erro genéricas em qualquer tentativa de login com o tipo de conta errado (nunca revela se a conta existe nem que tipo é); códigos de convite expiram ao fim de 7 dias; todos os buckets de Storage são privados; CORS restrito por origem (nunca `*`) em todas as Edge Functions; a função de limpeza de fotos exige um cabeçalho secreto próprio, além da autenticação Supabase normal.

## Testes automatizados

Suite Playwright, end-to-end, contra um projeto Supabase real (sem mocks): autenticação (navegação livre na landing, troca de separadores, mensagens de erro em credenciais inválidas), CRUD de pacientes (sincronização entre sessões/dispositivos), importação de dados locais (só quando a conta remota está vazia), responsividade mobile (sem overflow horizontal, gaveta lateral, ficha de paciente), e isolamento entre contas via RLS (um nutricionista nunca vê pacientes de outro).
