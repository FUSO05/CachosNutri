-- CachosNutri — schema inicial (Fase 0 + Fase 1)
-- Corre este ficheiro completo no Supabase Dashboard: SQL Editor -> New query -> cola tudo -> Run.

-- ============================================================
-- 1. profiles — 1 linha por utilizador de auth.users
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('nutricionista', 'paciente')),
  nome text,
  email text,
  photo_url text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "utilizador vê e edita o seu próprio perfil" on profiles;
create policy "utilizador vê e edita o seu próprio perfil"
  on profiles for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- Cria automaticamente uma linha em profiles quando alguém regista conta.
-- role/nome vêm de options.data no signUp() do lado do cliente.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, nome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'nutricionista'),
    new.raw_user_meta_data->>'nome',
    new.email
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- 2. nutricionista_paciente_links — fluxo de convite (Fase 3)
-- ============================================================
create table if not exists nutricionista_paciente_links (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references profiles(id) on delete cascade,
  paciente_id uuid references profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'active', 'revoked')) default 'pending',
  invited_at timestamptz not null default now(),
  accepted_at timestamptz
);

alter table nutricionista_paciente_links enable row level security;

drop policy if exists "nutricionista gere os seus próprios convites" on nutricionista_paciente_links;
create policy "nutricionista gere os seus próprios convites"
  on nutricionista_paciente_links for all
  using (nutricionista_id = auth.uid())
  with check (nutricionista_id = auth.uid());

drop policy if exists "paciente vê convites endereçados a si" on nutricionista_paciente_links;
create policy "paciente vê convites endereçados a si"
  on nutricionista_paciente_links for select
  using (paciente_id = auth.uid());

-- Colunas adicionadas na Fase 3: cada convite refere-se a um cliente específico
-- (client_id) e usa um código curto partilhável (code) para o paciente reivindicar
-- o acesso via accept_invite(), abaixo.
alter table nutricionista_paciente_links add column if not exists client_id uuid references clients(id) on delete cascade;
alter table nutricionista_paciente_links add column if not exists code text;
alter table nutricionista_paciente_links add column if not exists email text;

create unique index if not exists nutricionista_paciente_links_code_idx
  on nutricionista_paciente_links(code) where code is not null;

-- ============================================================
-- 2b. accept_invite — paciente reivindica um convite pelo código
-- ============================================================
-- security definer: o paciente autenticado não tem (nem deve ter) permissão RLS
-- direta para editar nutricionista_paciente_links ou clients de outra pessoa. Esta
-- function corre com privilégios elevados mas só age sobre o link cujo código
-- corresponde exatamente ao fornecido, e só escreve auth.uid() do próprio chamador.
create or replace function accept_invite(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link nutricionista_paciente_links%rowtype;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'Código de convite inválido.';
  end if;

  -- "for update" bloqueia a linha até esta transação terminar — se duas
  -- pessoas submeterem o mesmo código ao mesmo tempo, a segunda espera pela
  -- primeira e, ao acordar, já não encontra o convite como "pending" (a
  -- condição where deixa de bater certo), garantindo uso único mesmo em corrida.
  select * into v_link
  from nutricionista_paciente_links
  where code = upper(trim(p_code)) and status = 'pending'
  limit 1
  for update;

  if not found then
    raise exception 'Convite inválido ou já utilizado.';
  end if;

  update nutricionista_paciente_links
    set paciente_id = auth.uid(), status = 'active', accepted_at = now()
    where id = v_link.id;

  update clients set paciente_id = auth.uid() where id = v_link.client_id;

  return json_build_object('ok', true, 'client_id', v_link.client_id, 'nutricionista_id', v_link.nutricionista_id);
end;
$$;

grant execute on function accept_invite(text) to authenticated;

-- ============================================================
-- 3. clients — substitui appData.clients[] do localStorage
-- ============================================================
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references profiles(id) on delete cascade,
  paciente_id uuid references profiles(id) on delete set null,
  nome text not null,
  info jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table clients enable row level security;

drop policy if exists "nutricionista gere os seus próprios clientes" on clients;
create policy "nutricionista gere os seus próprios clientes"
  on clients for all
  using (nutricionista_id = auth.uid())
  with check (nutricionista_id = auth.uid());

drop policy if exists "paciente vê o seu próprio registo de cliente" on clients;
create policy "paciente vê o seu próprio registo de cliente"
  on clients for select
  using (paciente_id = auth.uid());

-- ============================================================
-- 4. plans — corresponde a client.plans[] atual
-- ============================================================
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  nome text not null,
  macro_targets jsonb,
  water_ml int,
  days jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table plans enable row level security;

drop policy if exists "nutricionista gere planos dos seus clientes" on plans;
create policy "nutricionista gere planos dos seus clientes"
  on plans for all
  using (exists (
    select 1 from clients c
    where c.id = plans.client_id and c.nutricionista_id = auth.uid()
  ))
  with check (exists (
    select 1 from clients c
    where c.id = plans.client_id and c.nutricionista_id = auth.uid()
  ));

drop policy if exists "paciente vê os seus próprios planos" on plans;
create policy "paciente vê os seus próprios planos"
  on plans for select
  using (exists (
    select 1 from clients c
    where c.id = plans.client_id and c.paciente_id = auth.uid()
  ));

-- ============================================================
-- 5. consultations — corresponde a client.consultations[] atual
-- ============================================================
create table if not exists consultations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  date timestamptz not null default now(),
  peso numeric,
  altura numeric,
  imc numeric,
  massa_gorda numeric,
  mig numeric,
  somatorio_pregas numeric,
  per_cintura_isak numeric,
  per_anca numeric,
  per_braco numeric,
  notes text,
  created_at timestamptz not null default now()
);

alter table consultations enable row level security;

drop policy if exists "nutricionista gere consultas dos seus clientes" on consultations;
create policy "nutricionista gere consultas dos seus clientes"
  on consultations for all
  using (exists (
    select 1 from clients c
    where c.id = consultations.client_id and c.nutricionista_id = auth.uid()
  ))
  with check (exists (
    select 1 from clients c
    where c.id = consultations.client_id and c.nutricionista_id = auth.uid()
  ));

drop policy if exists "paciente vê as suas próprias consultas" on consultations;
create policy "paciente vê as suas próprias consultas"
  on consultations for select
  using (exists (
    select 1 from clients c
    where c.id = consultations.client_id and c.paciente_id = auth.uid()
  ));

-- ============================================================
-- 6. Tabelas de engagement (schema preparado já, usado na Fase 4)
-- ============================================================
create table if not exists daily_water_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  logged_at timestamptz not null default now(),
  amount_ml int not null
);

alter table daily_water_logs enable row level security;

drop policy if exists "nutricionista vê logs de água dos seus clientes" on daily_water_logs;
create policy "nutricionista vê logs de água dos seus clientes"
  on daily_water_logs for select
  using (exists (
    select 1 from clients c
    where c.id = daily_water_logs.client_id and c.nutricionista_id = auth.uid()
  ));

drop policy if exists "paciente regista e vê a sua própria água" on daily_water_logs;
create policy "paciente regista e vê a sua própria água"
  on daily_water_logs for all
  using (exists (
    select 1 from clients c
    where c.id = daily_water_logs.client_id and c.paciente_id = auth.uid()
  ))
  with check (exists (
    select 1 from clients c
    where c.id = daily_water_logs.client_id and c.paciente_id = auth.uid()
  ));

create table if not exists meal_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  plan_id uuid references plans(id) on delete cascade,
  day_index int not null,
  meal_index int not null,
  status text not null check (status in ('done', 'skipped', 'modified')),
  logged_at timestamptz not null default now(),
  note text
);

alter table meal_logs enable row level security;

drop policy if exists "nutricionista vê logs de refeições dos seus clientes" on meal_logs;
create policy "nutricionista vê logs de refeições dos seus clientes"
  on meal_logs for select
  using (exists (
    select 1 from clients c
    where c.id = meal_logs.client_id and c.nutricionista_id = auth.uid()
  ));

drop policy if exists "paciente regista e vê as suas próprias refeições" on meal_logs;
create policy "paciente regista e vê as suas próprias refeições"
  on meal_logs for all
  using (exists (
    select 1 from clients c
    where c.id = meal_logs.client_id and c.paciente_id = auth.uid()
  ))
  with check (exists (
    select 1 from clients c
    where c.id = meal_logs.client_id and c.paciente_id = auth.uid()
  ));

create table if not exists progress_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  storage_path text not null,
  taken_at timestamptz not null default now(),
  note text
);

alter table progress_photos enable row level security;

drop policy if exists "nutricionista vê fotos de progresso dos seus clientes" on progress_photos;
create policy "nutricionista vê fotos de progresso dos seus clientes"
  on progress_photos for select
  using (exists (
    select 1 from clients c
    where c.id = progress_photos.client_id and c.nutricionista_id = auth.uid()
  ));

drop policy if exists "paciente gere as suas próprias fotos de progresso" on progress_photos;
create policy "paciente gere as suas próprias fotos de progresso"
  on progress_photos for all
  using (exists (
    select 1 from clients c
    where c.id = progress_photos.client_id and c.paciente_id = auth.uid()
  ))
  with check (exists (
    select 1 from clients c
    where c.id = progress_photos.client_id and c.paciente_id = auth.uid()
  ));

-- ============================================================
-- 7. Fotos de refeições (por refeição real do plano) + Storage (Fase 4, feature 3)
-- ============================================================
-- progress_photos passa a modelar 1 foto por (cliente, dia, refeição real do plano —
-- meal_index, tal como em meal_logs). Não há categorias fixas: o nutricionista pode ter
-- qualquer número de refeições por dia, por isso a foto liga-se ao índice real da refeição,
-- não a um enum. meal_name fica guardado em duplicado (denormalizado) para a legenda da
-- timeline continuar correta mesmo que a estrutura do plano mude mais tarde (mesma
-- imprecisão de meal_index já aceite para meal_logs). Uma nova foto na mesma refeição/dia
-- substitui a anterior (caminho determinístico no Storage + upsert), por isso a unique
-- constraint permite usar upsert(...).onConflict(...).
alter table progress_photos add column if not exists meal_index int;
alter table progress_photos add column if not exists meal_name text;
alter table progress_photos add column if not exists photo_date date default current_date;

alter table progress_photos drop constraint if exists progress_photos_meal_category_check;
alter table progress_photos drop column if exists meal_category;

alter table progress_photos alter column meal_index set not null;
alter table progress_photos alter column meal_name set not null;
alter table progress_photos alter column photo_date set not null;

alter table progress_photos drop constraint if exists progress_photos_client_date_category_key;
alter table progress_photos drop constraint if exists progress_photos_client_date_meal_key;
alter table progress_photos add constraint progress_photos_client_date_meal_key
  unique (client_id, photo_date, meal_index);

-- Bucket privado — o acesso é sempre via RLS de storage.objects abaixo, nunca servido publicamente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Caminho: {client_id}/{yyyy-mm-dd}/meal-{meal_index}.jpg — storage.foldername(name)[1] = client_id.
drop policy if exists "paciente gere as suas fotos de refeições" on storage.objects;
create policy "paciente gere as suas fotos de refeições"
  on storage.objects for all
  using (
    bucket_id = 'meal-photos'
    and exists (
      select 1 from clients c
      where c.id::text = (storage.foldername(name))[1] and c.paciente_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'meal-photos'
    and exists (
      select 1 from clients c
      where c.id::text = (storage.foldername(name))[1] and c.paciente_id = auth.uid()
    )
  );

drop policy if exists "nutricionista vê fotos de refeições dos seus clientes" on storage.objects;
create policy "nutricionista vê fotos de refeições dos seus clientes"
  on storage.objects for select
  using (
    bucket_id = 'meal-photos'
    and exists (
      select 1 from clients c
      where c.id::text = (storage.foldername(name))[1] and c.nutricionista_id = auth.uid()
    )
  );

-- ============================================================
-- 8. profiles — cédula profissional, data de nascimento e sexo (perfil do
--    nutricionista sincronizado entre dispositivos; foto guardada em
--    photo_url, já existente). Guarda-se a data de nascimento, não a idade
--    (que muda com o tempo) — a idade é sempre calculada a partir dela,
--    tal como já é feito para os pacientes.
-- ============================================================
alter table profiles add column if not exists cedula text;
alter table profiles add column if not exists data_nascimento date;
alter table profiles add column if not exists sexo text;

-- ============================================================
-- 9. patient_consents — consentimento RGPD dado pelo próprio paciente no
--    portal (não pelo nutricionista em seu nome). O campo pConsentimento em
--    clients.info continua a existir para registo manual/presencial de
--    pacientes que nunca usam o portal; esta tabela é a prova de que o
--    próprio titular dos dados consentiu diretamente.
-- ============================================================
create table if not exists patient_consents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references clients(id) on delete cascade,
  consented_at timestamptz not null default now()
);

alter table patient_consents enable row level security;

drop policy if exists "paciente regista o seu próprio consentimento" on patient_consents;
create policy "paciente regista o seu próprio consentimento"
  on patient_consents for all
  using (exists (
    select 1 from clients c where c.id = patient_consents.client_id and c.paciente_id = auth.uid()
  ))
  with check (exists (
    select 1 from clients c where c.id = patient_consents.client_id and c.paciente_id = auth.uid()
  ));

drop policy if exists "nutricionista vê o consentimento dos seus pacientes" on patient_consents;
create policy "nutricionista vê o consentimento dos seus pacientes"
  on patient_consents for select
  using (exists (
    select 1 from clients c where c.id = patient_consents.client_id and c.nutricionista_id = auth.uid()
  ));

-- ============================================================
-- 10. hora real da refeição (registada pelo paciente, distinta da hora
--     prevista em plans.days[].meals[].hora) + meal_comments — comentário do
--     nutricionista a uma refeição real do paciente (dia real + meal_index,
--     a mesma identidade já usada por progress_photos.photo_date). Nem
--     meal_logs (log append-only) nem progress_photos (só existe quando há
--     foto) servem de dono natural de um comentário que deve valer tanto
--     para a nota como para a foto — por isso uma tabela isolada, com
--     unique(client_id, log_date, meal_index) para permitir upsert (um
--     comentário único e editável por refeição, não um histórico).
-- ============================================================
alter table meal_logs add column if not exists hora_real text;

create table if not exists meal_comments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  log_date date not null,
  meal_index int not null,
  comment text not null,
  commented_at timestamptz not null default now(),
  unique (client_id, log_date, meal_index)
);

alter table meal_comments enable row level security;

drop policy if exists "nutricionista gere comentários dos seus clientes" on meal_comments;
create policy "nutricionista gere comentários dos seus clientes"
  on meal_comments for all
  using (exists (
    select 1 from clients c where c.id = meal_comments.client_id and c.nutricionista_id = auth.uid()
  ))
  with check (exists (
    select 1 from clients c where c.id = meal_comments.client_id and c.nutricionista_id = auth.uid()
  ));

drop policy if exists "paciente vê os comentários das suas refeições" on meal_comments;
create policy "paciente vê os comentários das suas refeições"
  on meal_comments for select
  using (exists (
    select 1 from clients c where c.id = meal_comments.client_id and c.paciente_id = auth.uid()
  ));

-- ============================================================
-- 11. Índices em falta — foreign keys não são indexadas automaticamente
--     pelo Postgres (só chave primária e colunas/constraints unique o são).
--     Sem estes índices, queries que filtram diretamente por estas colunas
--     fazem sequential scan à tabela inteira, o que prende a ligação à BD
--     mais tempo do que o necessário (ver INDEXES.md).
--     progress_photos, meal_comments e patient_consents já estão cobertas
--     pelos seus próprios unique constraints (client_id é a primeira coluna),
--     por isso não precisam de índice extra aqui.
-- ============================================================
create index if not exists clients_nutricionista_id_idx on clients(nutricionista_id);
create index if not exists clients_paciente_id_idx on clients(paciente_id);

create index if not exists plans_client_id_idx on plans(client_id);
create index if not exists consultations_client_id_idx on consultations(client_id);

create index if not exists daily_water_logs_client_id_logged_at_idx on daily_water_logs(client_id, logged_at desc);
create index if not exists meal_logs_client_id_logged_at_idx on meal_logs(client_id, logged_at desc);

create index if not exists npl_client_id_idx on nutricionista_paciente_links(client_id);
create index if not exists npl_nutricionista_id_idx on nutricionista_paciente_links(nutricionista_id);
create index if not exists npl_paciente_id_idx on nutricionista_paciente_links(paciente_id);

-- ============================================================
-- 12. get_latest_meal_status — evita paginar/trazer o histórico inteiro de
--     meal_logs (append-only) só para saber o estado mais recente de cada
--     combinação (day_index, meal_index) de um plano. O PostgREST/supabase-js
--     não expõe "distinct on" na API fluente, por isso esta lógica só é
--     possível numa função — devolve só ~15-40 linhas (uma por combinação)
--     em vez de todo o histórico de meses/anos de edições (ver PAGINATION.md).
--     Não é "security definer": corre com o papel de quem chama, por isso
--     continua sujeita à RLS já existente em meal_logs (um paciente só
--     consegue mesmo ler os seus próprios logs, tal como antes).
--
--     log_date (coluna nova) + p_week_start/p_week_end: day_index é um ciclo
--     "dia da semana" (0-6) que se repete todas as semanas — sem isto, marcar
--     sexta-feira como feita numa semana fazia essa refeição aparecer
--     permanentemente verde em TODAS as sextas-feiras futuras (bug reportado
--     pelo utilizador: hoje quinta, ao navegar para sexta — que ainda não
--     tinha chegado — o cartão já aparecia como feito, por causa da sexta da
--     semana passada). log_date guarda a data real do dia em que o estado foi
--     registado (logMealStatus só regista sempre para "hoje", nunca para
--     outro dia — por isso log_date = data real de hoje no momento do
--     insert). A função só considera logs entre p_week_start (incluído) e
--     p_week_end (excluído), por isso um dia futuro desta semana ainda sem
--     log próprio simplesmente não aparece — não herda o estado de uma
--     semana anterior.
-- ============================================================
alter table meal_logs add column if not exists log_date date;
update meal_logs set log_date = logged_at::date where log_date is null;

-- drop da assinatura antiga (2 argumentos, sem janela de semana) — "create or replace"
-- não substitui uma função quando a lista de parâmetros muda, ficaria como um
-- overload solto se esta secção já tiver corrido antes com a versão anterior.
drop function if exists get_latest_meal_status(uuid, uuid);

create or replace function get_latest_meal_status(p_client_id uuid, p_plan_id uuid, p_week_start date, p_week_end date)
returns table (day_index int, meal_index int, status text, note text, hora_real text, logged_at timestamptz)
language sql
stable
as $$
  select distinct on (meal_logs.day_index, meal_logs.meal_index)
    meal_logs.day_index, meal_logs.meal_index, meal_logs.status, meal_logs.note,
    meal_logs.hora_real, meal_logs.logged_at
  from meal_logs
  where meal_logs.client_id = p_client_id and meal_logs.plan_id = p_plan_id
    and meal_logs.log_date >= p_week_start and meal_logs.log_date < p_week_end
  order by meal_logs.day_index, meal_logs.meal_index, meal_logs.logged_at desc;
$$;

grant execute on function get_latest_meal_status(uuid, uuid, date, date) to authenticated;

-- Índice desenhado para este "distinct on" — cobre o filtro de igualdade
-- (client_id, plan_id), depois o filtro de intervalo (log_date), e só depois
-- a ordem que a função usa para escolher a linha mais recente por grupo.
drop index if exists meal_logs_client_plan_day_meal_idx;
create index if not exists meal_logs_client_plan_date_day_meal_idx
  on meal_logs(client_id, plan_id, log_date, day_index, meal_index, logged_at desc);

-- ============================================================
-- 13. profiles — nutricionista lê o perfil dos seus pacientes ligados
--     (nome/email/foto). Necessário para a área de Definições do paciente
--     no portal: uma vez que a conta está ligada (clients.paciente_id
--     definido), o nutricionista passa a ver na ficha do cliente o
--     nome/email/foto que o próprio paciente define no seu perfil, em vez
--     dos campos manuais anteriores — isto exige que o nutricionista
--     consiga mesmo ler essa linha de profiles, o que a policy única
--     existente (id = auth.uid()) não permite.
-- ============================================================
drop policy if exists "nutricionista vê perfil dos seus pacientes" on profiles;
create policy "nutricionista vê perfil dos seus pacientes"
  on profiles for select
  using (
    exists (
      select 1 from clients
      where clients.paciente_id = profiles.id
        and clients.nutricionista_id = auth.uid()
    )
  );

-- ============================================================
-- 14. profiles — telefone do paciente, migração inicial de dados de
--     identidade ao ligar a conta, e bloqueio permanente da data de
--     nascimento depois de definida uma primeira vez.
-- ============================================================
alter table profiles add column if not exists telefone text;

-- Uma vez definida, a data de nascimento nunca mais muda (nutricionista OU
-- paciente) — pedido explícito do utilizador, para não desalinhar cálculos
-- de idade já feitos. Só bloqueia mudanças reais (o mesmo valor reenviado
-- no mesmo update, ex: ao gravar outros campos do perfil, passa sempre).
create or replace function prevent_birthdate_change()
returns trigger
language plpgsql
as $$
begin
  if OLD.data_nascimento is not null and NEW.data_nascimento is distinct from OLD.data_nascimento then
    raise exception 'A data de nascimento não pode ser alterada depois de definida.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_lock_birthdate on profiles;
create trigger profiles_lock_birthdate
  before update on profiles
  for each row execute function prevent_birthdate_change();

-- accept_invite (substitui a versão da secção 2b): ao ligar a conta, o nome
-- fica sempre o que o paciente já escolheu no registo (profiles.nome,
-- preenchido pelo signUp) — não se copia clients.nome por cima. Mas
-- nascimento/género/telefone só existem do lado do nutricionista até aqui
-- (client.info.pNascimento/pGenero/pTelefone, preenchidos antes de o
-- paciente ter conta) — por isso esses migram uma única vez para profiles,
-- servindo de ponto de partida; a partir daqui o paciente é que os edita
-- nas suas Definições.
create or replace function accept_invite(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link nutricionista_paciente_links%rowtype;
  v_client clients%rowtype;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'Código de convite inválido.';
  end if;

  select * into v_link
  from nutricionista_paciente_links
  where code = upper(trim(p_code)) and status = 'pending'
  limit 1
  for update;

  if not found then
    raise exception 'Convite inválido ou já utilizado.';
  end if;

  update nutricionista_paciente_links
    set paciente_id = auth.uid(), status = 'active', accepted_at = now()
    where id = v_link.id;

  update clients set paciente_id = auth.uid() where id = v_link.client_id;

  select * into v_client from clients where id = v_link.client_id;

  update profiles set
    data_nascimento = coalesce(data_nascimento, nullif(v_client.info->>'pNascimento', '')::date),
    sexo            = coalesce(nullif(sexo, ''), nullif(v_client.info->>'pGenero', '')),
    telefone        = coalesce(nullif(telefone, ''), nullif(v_client.info->>'pTelefone', ''))
  where id = auth.uid();

  return json_build_object('ok', true, 'client_id', v_link.client_id, 'nutricionista_id', v_link.nutricionista_id);
end;
$$;

grant execute on function accept_invite(text) to authenticated;

-- ============================================================
-- 15. profiles — o bloqueio da data de nascimento (secção 14) só se aplica
--     a pedidos autenticados da app (nutricionista/paciente através do
--     PostgREST) — corrigir manualmente no Supabase Dashboard (SQL Editor
--     ou Table Editor) continua sempre possível, porque essas ligações não
--     passam por auth.uid() (não há request.jwt.claims nessa sessão, só
--     existe quando o pedido vem autenticado via PostgREST).
-- ============================================================
create or replace function prevent_birthdate_change()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
     and OLD.data_nascimento is not null
     and NEW.data_nascimento is distinct from OLD.data_nascimento then
    raise exception 'A data de nascimento não pode ser alterada depois de definida.';
  end if;
  return NEW;
end;
$$;

-- ============================================================
-- 16. accept_invite — expiração de convites (substitui a versão da secção
--     14). Um código "pending" ficava válido para sempre; com 32^6 (~1 mil
--     milhões) de combinações não é praticamente explorável por força
--     bruta, mas por higiene de segurança (achado da auditoria Wolf Hub)
--     passa a expirar 7 dias depois de criado. Um convite expirado
--     devolve exatamente o mesmo erro genérico de sempre ("Convite
--     inválido ou já utilizado.") — não distingue "não existe" de
--     "expirou", para não dar pistas extra a quem estiver a tentar
--     códigos ao acaso.
-- ============================================================
create or replace function accept_invite(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link nutricionista_paciente_links%rowtype;
  v_client clients%rowtype;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'Código de convite inválido.';
  end if;

  select * into v_link
  from nutricionista_paciente_links
  where code = upper(trim(p_code))
    and status = 'pending'
    and invited_at > now() - interval '7 days'
  limit 1
  for update;

  if not found then
    raise exception 'Convite inválido ou já utilizado.';
  end if;

  update nutricionista_paciente_links
    set paciente_id = auth.uid(), status = 'active', accepted_at = now()
    where id = v_link.id;

  update clients set paciente_id = auth.uid() where id = v_link.client_id;

  select * into v_client from clients where id = v_link.client_id;

  update profiles set
    data_nascimento = coalesce(data_nascimento, nullif(v_client.info->>'pNascimento', '')::date),
    sexo            = coalesce(nullif(sexo, ''), nullif(v_client.info->>'pGenero', '')),
    telefone        = coalesce(nullif(telefone, ''), nullif(v_client.info->>'pTelefone', ''))
  where id = auth.uid();

  return json_build_object('ok', true, 'client_id', v_link.client_id, 'nutricionista_id', v_link.nutricionista_id);
end;
$$;

grant execute on function accept_invite(text) to authenticated;

-- ============================================================
-- 17. profiles — verificação profissional do nutricionista + admin (Fase 5)
--
--     Duas frentes, aditivas:
--     a) Novo estado de conta: status ('pending_verification' | 'approved' |
--        'rejected'). Contas de nutricionista já existentes ficam 'approved'
--        automaticamente — o próprio DEFAULT do ALTER TABLE preenche as linhas
--        já existentes, não é preciso nenhum UPDATE em separado. Contas de
--        paciente também recebem 'approved' (o campo não tem significado
--        para elas, mas mantém-se NOT NULL em toda a tabela por simplicidade).
--     b) Novo role 'admin' — só criado manualmente via SQL Editor (ver
--        README), nunca por signup. is_admin() e a policy de leitura em
--        profiles asseguram que só quem tem essa linha consegue rever
--        pedidos de verificação de outros utilizadores.
--
--     cedula (secção 8) é reaproveitada como o nº de cédula profissional
--     capturado no registo — não se cria um campo novo para o mesmo conceito.
--     pais_atuacao/corpo_profissional são novos porque não existia nada
--     equivalente. documentos_verificacao guarda só os 2 caminhos mais
--     recentes no Storage (não há histórico de submissões antigas — uma
--     resubmissão substitui a anterior, tal como já acontece com
--     progress_photos).
-- ============================================================

-- 17a. role — adiciona 'admin' à constraint existente. Nome da constraint é o
--      default do Postgres para um "check" inline sem nome; se este DROP não
--      apanhar nada, confirma o nome real com:
--        select conname from pg_constraint where conrelid = 'profiles'::regclass and contype = 'c';
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('nutricionista', 'paciente', 'admin'));

-- 17b. Novas colunas. status com DEFAULT 'approved' faz o backfill de todas as
--      linhas existentes (nutricionistas reais em produção não ficam bloqueados).
alter table profiles add column if not exists status text not null default 'approved'
  check (status in ('pending_verification', 'approved', 'rejected'));
alter table profiles add column if not exists motivo_rejeicao text;
alter table profiles add column if not exists pais_atuacao text check (pais_atuacao in ('PT', 'BR'));
alter table profiles add column if not exists corpo_profissional text check (corpo_profissional in ('ON', 'CRN'));
alter table profiles add column if not exists documentos_verificacao jsonb not null default '{}';

create index if not exists profiles_status_idx on profiles(status) where role = 'nutricionista';

-- 17c. handle_new_user — substitui a versão da secção 1. Nutricionistas novos
--      nascem 'pending_verification'; pacientes continuam 'approved' (nunca
--      precisaram de verificação). País/cédula/corpo profissional vêm do
--      próprio signUp() (options.data), tal como role/nome já vinham.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, nome, email, status, cedula, pais_atuacao, corpo_profissional)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'nutricionista'),
    new.raw_user_meta_data->>'nome',
    new.email,
    case when coalesce(new.raw_user_meta_data->>'role', 'nutricionista') = 'nutricionista'
      then 'pending_verification' else 'approved' end,
    new.raw_user_meta_data->>'cedula',
    new.raw_user_meta_data->>'pais_atuacao',
    new.raw_user_meta_data->>'corpo_profissional'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 17d. is_admin() — helper reutilizado pela policy de leitura em profiles, pela
--      RPC de aprovação/rejeição e pela policy do bucket de documentos.
--      security definer: corre com privilégio elevado só para esta verificação
--      pontual (evita qualquer risco de recursão da RLS de profiles sobre si
--      própria ao ser chamada a partir de uma policy de profiles).
--      Tem de ser "language plpgsql", não "language sql" — uma function SQL
--      simples de uma única instrução pode ser inlined pelo planner mesmo
--      sendo security definer, o que troca a chamada por uma referência
--      literal a "profiles" dentro da própria policy de profiles e dispara
--      "infinite recursion detected in policy for relation profiles"
--      (42P17) em qualquer select à tabela. plpgsql nunca é inlined.
create or replace function is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin') into v_is_admin;
  return v_is_admin;
end;
$$;

grant execute on function is_admin() to authenticated;

-- 17e. Bloqueio de auto-promoção — sem isto, a policy de auto-edição de perfil
--      ("id = auth.uid()", secção 1, sem restrição de colunas) permite hoje a
--      QUALQUER utilizador autenticado fazer
--      supabase.from('profiles').update({ role: 'admin', status: 'approved' })
--      sobre a sua própria linha. Isto já era verdade antes desta funcionalidade
--      (role nutricionista/paciente), mas passa a ser crítico agora que existe
--      um terceiro role privilegiado e um status que decide acesso à app.
--      A única transição que o próprio utilizador pode fazer a si mesmo é
--      "rejected" -> "pending_verification" (reenviar documentos depois de
--      uma rejeição), sempre a limpar motivo_rejeicao ao mesmo tempo.
create or replace function prevent_self_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and NEW.id = auth.uid() then
    if NEW.role is distinct from OLD.role then
      raise exception 'Não pode alterar a sua própria função de acesso.';
    end if;
    if NEW.status is distinct from OLD.status then
      if not (OLD.status = 'rejected' and NEW.status = 'pending_verification') then
        raise exception 'Não pode alterar o estado da sua própria verificação.';
      end if;
      if NEW.motivo_rejeicao is not null then
        raise exception 'O motivo de rejeição tem de ficar vazio ao reenviar.';
      end if;
    elsif NEW.motivo_rejeicao is distinct from OLD.motivo_rejeicao then
      raise exception 'Não pode alterar o motivo de rejeição do seu próprio perfil.';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_prevent_self_privilege_escalation on profiles;
create trigger profiles_prevent_self_privilege_escalation
  before update on profiles
  for each row execute function prevent_self_privilege_escalation();

-- 17f. admin_set_verification_status — único caminho de escrita que um admin
--      tem sobre o status/motivo de outro utilizador (a RLS de profiles NÃO
--      dá update grant a admins — só select, ver 17g). Só aceita a transição
--      pending_verification -> approved/rejected (não permite "desaprovar"
--      uma conta já aprovada por esta via, nem um admin agir sobre si próprio).
create or replace function admin_set_verification_status(p_profile_id uuid, p_status text, p_reason text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row profiles%rowtype;
begin
  if not is_admin() then
    raise exception 'Não autorizado.';
  end if;
  if p_profile_id = auth.uid() then
    raise exception 'Um admin não pode alterar o seu próprio estado de verificação por esta via.';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Estado inválido.';
  end if;
  if p_status = 'rejected' and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'É obrigatório indicar um motivo de rejeição.';
  end if;

  select * into v_row from profiles
  where id = p_profile_id and role = 'nutricionista' and status = 'pending_verification'
  for update;

  if not found then
    raise exception 'Este pedido já não está pendente ou não existe.';
  end if;

  update profiles set
    status = p_status,
    motivo_rejeicao = case when p_status = 'rejected' then trim(p_reason) else null end
  where id = p_profile_id;

  return json_build_object('ok', true, 'profile_id', p_profile_id, 'status', p_status,
    'email', v_row.email, 'nome', v_row.nome);
end;
$$;

grant execute on function admin_set_verification_status(uuid, text, text) to authenticated;

-- 17g. RLS — admin lê perfis de nutricionistas (para rever pedidos), nunca
--      perfis de pacientes (não é necessário para esta funcionalidade — leitura
--      alargada desnecessariamente seria mais dados sensíveis expostos do que
--      o preciso).
drop policy if exists "admin vê perfis de nutricionistas" on profiles;
create policy "admin vê perfis de nutricionistas"
  on profiles for select
  using (is_admin() and role = 'nutricionista');

-- 17h. RLS — gating real (não só de UX) das tabelas onde o nutricionista tem
--      hoje acesso de escrita "for all" por posse direta. plans/consultations/
--      meal_comments/daily_water_logs/meal_logs/progress_photos/
--      patient_consents e o storage de meal-photos acedem sempre via
--      exists(select ... from clients where nutricionista_id = auth.uid()),
--      e a RLS de clients corre também dentro desse subquery — por isso
--      herdam o gate automaticamente assim que clients nega visibilidade a
--      um nutricionista não aprovado, sem precisar de alteração própria.
--
--      is_approved_nutricionista() (plpgsql, security definer, nunca
--      inlined) em vez de "exists (select ... from profiles ...)" inline
--      aqui é obrigatório, não só estilo: a policy 13 de profiles já lê de
--      clients (nutricionista vê perfil dos seus pacientes), e clients ler
--      profiles de volta na mesma cláusula criava um ciclo profiles ->
--      clients -> profiles -> clients -> ... ("infinite recursion detected
--      in policy for relation profiles", 42P17) em qualquer select a
--      qualquer uma das duas tabelas. Como function owner == table owner
--      (profiles), a leitura dentro da function ignora RLS em vez de a
--      reavaliar, quebrando o ciclo.
create or replace function is_approved_nutricionista()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_approved boolean;
begin
  select (status = 'approved') into v_approved from profiles where id = auth.uid();
  return coalesce(v_approved, false);
end;
$$;

grant execute on function is_approved_nutricionista() to authenticated;

drop policy if exists "nutricionista gere os seus próprios clientes" on clients;
create policy "nutricionista gere os seus próprios clientes"
  on clients for all
  using (nutricionista_id = auth.uid() and is_approved_nutricionista())
  with check (nutricionista_id = auth.uid() and is_approved_nutricionista());

drop policy if exists "nutricionista gere os seus próprios convites" on nutricionista_paciente_links;
create policy "nutricionista gere os seus próprios convites"
  on nutricionista_paciente_links for all
  using (nutricionista_id = auth.uid() and is_approved_nutricionista())
  with check (nutricionista_id = auth.uid() and is_approved_nutricionista());

-- ============================================================
-- 18. verification-documents — bucket + RLS de storage.objects para os 2
--     documentos de verificação (comprovativo do corpo profissional +
--     documento de identificação). Caminho: {user_id}/professional-proof.<ext>
--     e {user_id}/id-document.<ext> — determinístico, permite upsert (uma
--     resubmissão substitui o ficheiro anterior, tal como meal-photos).
--     8MB por ficheiro (scans/PDFs são maiores que fotos comprimidas de
--     comida) — pdf + jpeg + png.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification-documents', 'verification-documents', false, 8388608,
  array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "nutricionista gere os seus documentos de verificação" on storage.objects;
create policy "nutricionista gere os seus documentos de verificação"
  on storage.objects for all
  using (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "admin vê documentos de verificação" on storage.objects;
create policy "admin vê documentos de verificação"
  on storage.objects for select
  using (bucket_id = 'verification-documents' and is_admin());

-- ============================================================
-- 19. profiles — registo e validação de estudantes de nutrição (Fase 2)
-- ============================================================

-- 19a. role — adiciona 'estudante'.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('nutricionista', 'paciente', 'admin', 'estudante'));

-- 19b. status — adiciona os 3 estados próprios do fluxo de estudante.
--      'expired' fica na lista por completude/vocabulário da spec, mas
--      como a expiração é lazy (sem cron — decisão explícita), nada
--      escreve este valor automaticamente hoje; é só reservado para o
--      caso de um cron vir a ser adicionado no futuro.
alter table profiles drop constraint if exists profiles_status_check;
alter table profiles add constraint profiles_status_check
  check (status in (
    'pending_verification', 'approved', 'rejected',
    'pending_email_confirmation', 'pending_manual_verification', 'expired'
  ));

-- 19c. Novas colunas. documentos_verificacao (jsonb, já existe da Fase 1)
--      é reaproveitada — estudante usa só a chave "matricula".
alter table profiles add column if not exists instituicao_ensino text;
alter table profiles add column if not exists ano_conclusao_previsto int;
alter table profiles add column if not exists validado_em timestamptz;
alter table profiles add column if not exists expira_em timestamptz;

-- 19d. is_academic_email() — replica o algoritmo já fornecido (lista de
--      padrões testados como substring do domínio, tal como o
--      .includes() original). language sql simples: não acede a nenhuma
--      tabela, por isso não tem risco de recursão de RLS.
create or replace function is_academic_email(p_email text)
returns boolean
language sql
immutable
as $$
  select p_email is not null and exists (
    select 1 from unnest(array[
      'alunos.', 'aluno.', 'estudantes.', 'estudante.',
      'student.', 'campus.', 'discente.', '.edu.br', '.edu', '.ac.uk'
    ]) as pattern
    where lower(split_part(p_email, '@', 2)) like '%' || pattern || '%'
  );
$$;

-- 19e. handle_new_user — substitui a versão da secção 17c. Nutricionistas
--      continuam pending_verification; pacientes/admin continuam
--      approved; estudantes ficam pending_email_confirmation (se o email
--      "parecer" académico) ou pending_manual_verification (caso
--      contrário) — a decisão real de aprovar sozinho só acontece depois,
--      em 19f, quando o email é mesmo confirmado.
create or replace function handle_new_user()
returns trigger as $$
declare
  v_role   text := coalesce(new.raw_user_meta_data->>'role', 'nutricionista');
  v_status text;
begin
  if v_role = 'estudante' then
    v_status := case when is_academic_email(new.email)
      then 'pending_email_confirmation' else 'pending_manual_verification' end;
  elsif v_role = 'nutricionista' then
    v_status := 'pending_verification';
  else
    v_status := 'approved';
  end if;

  insert into public.profiles (
    id, role, nome, email, status, cedula, pais_atuacao, corpo_profissional,
    instituicao_ensino, ano_conclusao_previsto
  )
  values (
    new.id, v_role, new.raw_user_meta_data->>'nome', new.email, v_status,
    new.raw_user_meta_data->>'cedula',
    new.raw_user_meta_data->>'pais_atuacao',
    new.raw_user_meta_data->>'corpo_profissional',
    new.raw_user_meta_data->>'instituicao_ensino',
    nullif(new.raw_user_meta_data->>'ano_conclusao_previsto', '')::int
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 19f. Aprovação automática (Fluxo A) — reage à confirmação real do email
--      pelo Supabase Auth (email_confirmed_at nulo -> preenchido). Nunca
--      confia em nada vindo do signup: re-verifica is_academic_email()
--      sobre o email efetivamente confirmado.
create or replace function handle_student_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.email_confirmed_at is null and NEW.email_confirmed_at is not null then
    update profiles set
      status = 'approved',
      validado_em = now(),
      expira_em = now() + interval '365 days'
    where id = NEW.id
      and role = 'estudante'
      and status = 'pending_email_confirmation'
      and is_academic_email(NEW.email);
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update on auth.users
  for each row execute function handle_student_email_confirmed();

-- 19g. is_approved_professional() — substitui is_approved_nutricionista()
--      (Fase 1, secção 17h) como helper usado pelas policies de clients/
--      nutricionista_paciente_links. Estudante só conta como aprovado se
--      ainda não tiver passado expira_em — é aqui, não numa coluna
--      "expired" escrita por cron, que a expiração é realmente aplicada.
create or replace function is_approved_professional()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row profiles%rowtype;
begin
  select * into v_row from profiles where id = auth.uid();
  if v_row.id is null then return false; end if;
  if v_row.role = 'nutricionista' then return v_row.status = 'approved'; end if;
  if v_row.role = 'estudante' then
    return v_row.status = 'approved' and (v_row.expira_em is null or v_row.expira_em > now());
  end if;
  return false;
end;
$$;
grant execute on function is_approved_professional() to authenticated;

drop policy if exists "nutricionista gere os seus próprios clientes" on clients;
create policy "profissional aprovado gere os seus próprios clientes"
  on clients for all
  using (nutricionista_id = auth.uid() and is_approved_professional())
  with check (nutricionista_id = auth.uid() and is_approved_professional());

drop policy if exists "nutricionista gere os seus próprios convites" on nutricionista_paciente_links;
create policy "profissional aprovado gere os seus próprios convites"
  on nutricionista_paciente_links for all
  using (nutricionista_id = auth.uid() and is_approved_professional())
  with check (nutricionista_id = auth.uid() and is_approved_professional());

drop function if exists is_approved_nutricionista();

-- 19h. RLS — admin passa a ver também perfis de estudante (para rever
--      Fluxo B), nunca pacientes.
drop policy if exists "admin vê perfis de nutricionistas" on profiles;
create policy "admin vê perfis de nutricionistas e estudantes"
  on profiles for select
  using (is_admin() and role in ('nutricionista', 'estudante'));

-- 19i. admin_set_verification_status — substitui a versão da secção 17f.
--      Mesmo nome/assinatura, generalizado para also aceitar estudantes
--      em pending_manual_verification; só preenche validado_em/expira_em
--      quando aprova um estudante (nutricionista não usa estes campos).
create or replace function admin_set_verification_status(p_profile_id uuid, p_status text, p_reason text default null)
returns json language plpgsql security definer set search_path = public
as $$
declare v_row profiles%rowtype;
begin
  if not is_admin() then raise exception 'Não autorizado.'; end if;
  if p_profile_id = auth.uid() then
    raise exception 'Um admin não pode alterar o seu próprio estado de verificação por esta via.';
  end if;
  if p_status not in ('approved', 'rejected') then raise exception 'Estado inválido.'; end if;
  if p_status = 'rejected' and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'É obrigatório indicar um motivo de rejeição.';
  end if;

  select * into v_row from profiles
  where id = p_profile_id and (
    (role = 'nutricionista' and status = 'pending_verification') or
    (role = 'estudante' and status = 'pending_manual_verification')
  )
  for update;
  if not found then raise exception 'Este pedido já não está pendente ou não existe.'; end if;

  update profiles set
    status = p_status,
    motivo_rejeicao = case when p_status = 'rejected' then trim(p_reason) else null end,
    validado_em = case when p_status = 'approved' and v_row.role = 'estudante' then now() else validado_em end,
    expira_em   = case when p_status = 'approved' and v_row.role = 'estudante' then now() + interval '365 days' else expira_em end
  where id = p_profile_id;

  return json_build_object('ok', true, 'profile_id', p_profile_id, 'status', p_status,
    'email', v_row.email, 'nome', v_row.nome, 'role', v_row.role);
end;
$$;

-- 19j. prevent_self_privilege_escalation — substitui a versão da secção
--      17e. Acrescenta 2 transições permitidas (lista continua fechada,
--      tudo o resto continua bloqueado): estudante rejeitado reenviar, e
--      estudante "expirado" (approved na BD mas expira_em já passou)
--      renovar ou converter-se a nutricionista. A conversão de role só é
--      permitida nesta condição exata — chamada pela RPC 19k, nunca por
--      um update direto vindo do cliente.
create or replace function prevent_self_privilege_escalation()
returns trigger language plpgsql as $$
declare
  v_estudante_expirado boolean := (OLD.role = 'estudante' and OLD.status = 'approved' and OLD.expira_em < now());
begin
  if auth.uid() is not null and NEW.id = auth.uid() then
    if NEW.role is distinct from OLD.role then
      if not (v_estudante_expirado and NEW.role = 'nutricionista' and NEW.status = 'pending_verification') then
        raise exception 'Não pode alterar a sua própria função de acesso.';
      end if;
    end if;
    if NEW.status is distinct from OLD.status then
      if not (
        (OLD.status = 'rejected' and NEW.status = 'pending_verification') or
        (OLD.status = 'rejected' and NEW.status = 'pending_manual_verification') or
        (v_estudante_expirado and NEW.status = 'pending_manual_verification' and NEW.role = 'estudante') or
        (v_estudante_expirado and NEW.status = 'pending_verification' and NEW.role = 'nutricionista')
      ) then
        raise exception 'Não pode alterar o estado da sua própria verificação.';
      end if;
    elsif NEW.motivo_rejeicao is distinct from OLD.motivo_rejeicao then
      raise exception 'Não pode alterar o motivo de rejeição do seu próprio perfil.';
    end if;
  end if;
  return NEW;
end;
$$;

-- 19k. convert_estudante_to_nutricionista — único caminho para um
--      estudante expirado passar a nutricionista. Fica pending_verification
--      como qualquer nutricionista novo — tem de submeter os 2 documentos
--      profissionais como qualquer outro, o histórico de estudante não
--      isenta verificação profissional.
create or replace function convert_estudante_to_nutricionista(p_cedula text, p_pais_atuacao text, p_corpo_profissional text)
returns json language plpgsql security definer set search_path = public
as $$
declare v_row profiles%rowtype;
begin
  select * into v_row from profiles where id = auth.uid();
  if v_row.id is null or v_row.role != 'estudante' then
    raise exception 'Só contas de estudante podem fazer esta transição.';
  end if;
  if v_row.status != 'approved' or v_row.expira_em is null or v_row.expira_em >= now() then
    raise exception 'Só disponível depois do estatuto de estudante expirar.';
  end if;
  if p_pais_atuacao not in ('PT', 'BR') or p_corpo_profissional not in ('ON', 'CRN') then
    raise exception 'País/corpo profissional inválido.';
  end if;
  if p_cedula is null or length(trim(p_cedula)) = 0 then
    raise exception 'Indique o nº de cédula profissional.';
  end if;

  update profiles set
    role = 'nutricionista', status = 'pending_verification',
    cedula = trim(p_cedula), pais_atuacao = p_pais_atuacao, corpo_profissional = p_corpo_profissional,
    documentos_verificacao = '{}', motivo_rejeicao = null
  where id = auth.uid();

  return json_build_object('ok', true);
end;
$$;
grant execute on function convert_estudante_to_nutricionista(text, text, text) to authenticated;

-- ============================================================
-- 20. ai_generation_usage — limite de uso da IA por PACIENTE + observabilidade
--     de custo (backlog P0 "Limite de uso da IA por conta + prompt caching" —
--     pedido explícito do utilizador para ser por paciente, não por conta, já
--     que um nutricionista com muitos pacientes precisa de conseguir gerar
--     para cada um deles). Uma linha por chamada real à Anthropic feita pela
--     Edge Function generate-meal-plan (só depois de a Anthropic responder com
--     tokens consumidos — nunca antes de gastar, nunca para pedidos que nem
--     chegaram a ser aceites pelo limite). profile_id usa DEFAULT auth.uid()
--     em vez de vir explícito no insert — a Edge Function já corre com o
--     Authorization de quem chama, por isso não precisa de um pedido extra só
--     para saber quem é antes de gravar. client_id vem explícito (é o
--     paciente para quem a geração foi pedida, já confirmado por RLS de
--     "clients" como pertencente a este nutricionista antes deste ponto).
-- ============================================================
create table if not exists ai_generation_usage (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  input_tokens integer,
  output_tokens integer,
  cache_creation_input_tokens integer,
  cache_read_input_tokens integer
);

-- Acrescentada depois de a tabela já ter sido criada em produção (por isso "alter... add
-- column", não editada dentro do "create table" acima — isso seria um no-op numa tabela já
-- existente). null = geração terminou em sucesso (deu um plano usável); texto = motivo exato
-- da falha (ex.: "O modelo incluiu um alimento inexistente..."). É o que permite a
-- checkRateLimit() distinguir "planos realmente obtidos" (o que os limites de 3/dia e 10/mês
-- querem dizer) de "tentativas" (sucesso + falha, com um teto mais alto à parte) — sem isto,
-- uma geração que gastou tokens reais mas falhou na validação (alimento inexistente, etc.)
-- consumia uma das 3 tentativas do dia sem nunca dar ao nutricionista um plano.
alter table ai_generation_usage add column if not exists error_message text;

alter table ai_generation_usage enable row level security;

create index if not exists ai_generation_usage_profile_created_idx
  on ai_generation_usage(profile_id, created_at);
create index if not exists ai_generation_usage_client_created_idx
  on ai_generation_usage(client_id, created_at);

-- Sem policy de update/delete de propósito — este registo tem de ser
-- imutável, senão o próprio utilizador conseguiria apagar as suas linhas
-- mais antigas para "resetar" o contador do limite diário/mensal (a
-- verificação de limite em checkRateLimit() conta linhas diretamente desta
-- tabela). Só select/insert das suas próprias linhas.
drop policy if exists "utilizador vê o seu próprio uso de IA" on ai_generation_usage;
create policy "utilizador vê o seu próprio uso de IA"
  on ai_generation_usage for select
  using (profile_id = auth.uid());

drop policy if exists "utilizador regista o seu próprio uso de IA" on ai_generation_usage;
create policy "utilizador regista o seu próprio uso de IA"
  on ai_generation_usage for insert
  with check (profile_id = auth.uid());

-- ============================================================
-- 21. Política de estudantes — opção 1 (aviso visível), backlog P0.
--
--     21a: o paciente passa a poder ler o "role" (só isso é pedido pelo
--     frontend, embora a policy — como todas as outras deste ficheiro — dê
--     acesso à linha toda) do profile do seu próprio nutricionista/estudante
--     ligado, para o portal conseguir mostrar um aviso quando o plano foi
--     feito por uma conta de estudante em formação, não por um nutricionista
--     com cédula. Não existia nenhuma policy de profiles nesta direção
--     (paciente -> profile de quem o segue) até agora.
--
--     21b: admin_get_student_plan_stats() — métrica "% planos por conta de
--     estudante vs. nutricionista" pedida no critério de pronto, visível no
--     dashboard de admin. Devolve só contagens agregadas (nunca linhas de
--     "plans"/"clients" em si — dados clínicos não são para o admin ver,
--     mesmo agregados por trás de uma function, o objetivo aqui é só a
--     percentagem, não o conteúdo).
-- ============================================================
drop policy if exists "paciente vê o profile do seu nutricionista" on profiles;
create policy "paciente vê o profile do seu nutricionista"
  on profiles for select
  using (
    exists (
      select 1 from clients
      where clients.nutricionista_id = profiles.id
        and clients.paciente_id = auth.uid()
    )
  );

create or replace function admin_get_student_plan_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_student int;
begin
  if not is_admin() then
    raise exception 'Não autorizado.';
  end if;

  select count(*) into v_total from plans;
  select count(*) into v_student
    from plans p
    join clients c on c.id = p.client_id
    join profiles pr on pr.id = c.nutricionista_id
    where pr.role = 'estudante';

  return json_build_object('total_plans', v_total, 'student_plans', v_student);
end;
$$;

grant execute on function admin_get_student_plan_stats() to authenticated;
