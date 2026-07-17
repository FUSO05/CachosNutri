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
