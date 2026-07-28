-- Controle Financeiro Zênite — schema Supabase
-- Rode isto no SQL Editor do seu projeto Supabase.

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hourly_rate numeric default 0,
  total_hours_sold numeric default 0,
  client_name text,
  location text,
  client_contact text,
  created_at date default current_date
);

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  type text not null check (type in ('receita', 'gasto')),
  category text,
  amount numeric not null,
  date date not null,
  description text,
  -- extraído automaticamente da foto da nota fiscal (ou preenchido manualmente)
  city text,
  state text,
  receipt_url text
);

create table if not exists hours (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  date date not null,
  start_time text,
  end_time text,
  lunch boolean default true,
  hours numeric not null,
  description text
);

alter table projects enable row level security;
alter table entries enable row level security;
alter table hours enable row level security;

drop policy if exists "Somente usuario logado" on projects;
drop policy if exists "Somente usuario logado" on entries;
drop policy if exists "Somente usuario logado" on hours;

create policy "Somente usuario logado" on projects for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Somente usuario logado" on entries for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Somente usuario logado" on hours for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Bucket de storage para as fotos das notas fiscais (crie manualmente em
-- Storage > New bucket > "receipts", marcado como privado) e aplique:
-- create policy "Somente usuario logado" on storage.objects for all
--   using (bucket_id = 'receipts' and auth.role() = 'authenticated')
--   with check (bucket_id = 'receipts' and auth.role() = 'authenticated');
