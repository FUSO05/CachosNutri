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
-- 6. profiles — cédula profissional, data de nascimento e sexo (perfil do
--    nutricionista sincronizado entre dispositivos; foto guardada em
--    photo_url, já existente). Guarda-se a data de nascimento, não a idade
--    (que muda com o tempo) — a idade é sempre calculada a partir dela,
--    tal como já é feito para os pacientes.
-- ============================================================
alter table profiles add column if not exists cedula text;
alter table profiles add column if not exists data_nascimento date;
alter table profiles add column if not exists sexo text;
