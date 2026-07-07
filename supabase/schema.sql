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

create policy "nutricionista gere os seus próprios convites"
  on nutricionista_paciente_links for all
  using (nutricionista_id = auth.uid())
  with check (nutricionista_id = auth.uid());

create policy "paciente vê convites endereçados a si"
  on nutricionista_paciente_links for select
  using (paciente_id = auth.uid());

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

create policy "nutricionista gere os seus próprios clientes"
  on clients for all
  using (nutricionista_id = auth.uid())
  with check (nutricionista_id = auth.uid());

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

create policy "nutricionista vê logs de água dos seus clientes"
  on daily_water_logs for select
  using (exists (
    select 1 from clients c
    where c.id = daily_water_logs.client_id and c.nutricionista_id = auth.uid()
  ));

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

create policy "nutricionista vê logs de refeições dos seus clientes"
  on meal_logs for select
  using (exists (
    select 1 from clients c
    where c.id = meal_logs.client_id and c.nutricionista_id = auth.uid()
  ));

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

create policy "nutricionista vê fotos de progresso dos seus clientes"
  on progress_photos for select
  using (exists (
    select 1 from clients c
    where c.id = progress_photos.client_id and c.nutricionista_id = auth.uid()
  ));

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
