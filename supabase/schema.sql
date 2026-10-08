-- Filo Yönetim V2
-- Tek kullanıcı/tek şirket senaryosu için hazırlanmıştır.
-- Güvenlik: Supabase Auth + RLS.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  phone text,
  license_no text,
  license_expiry date,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  plate text not null,
  brand text,
  model text,
  year integer,
  vin text,
  fuel_type text,
  current_km numeric(12,1) not null default 0,
  status text not null default 'active',
  inspection_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, plate)
);

create table if not exists public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  policy_type text not null check (policy_type in ('insurance','casco')),
  start_date date,
  end_date date,
  cost numeric(12,2) not null default 0,
  policy_no text,
  provider text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.fuel_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  date date not null,
  liters numeric(10,2),
  cost numeric(12,2) not null default 0,
  km numeric(12,1),
  station text,
  fuel_type text,
  receipt_no text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.hgs_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  date date not null,
  type text not null default 'passage' check (type in ('topup','passage','refund','other')),
  amount numeric(12,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.km_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  date date not null,
  km numeric(12,1) not null,
  source text not null default 'manual',
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  date date not null,
  km numeric(12,1),
  description text not null,
  category text,
  cost numeric(12,2) not null default 0,
  service_name text,
  invoice_no text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  name text not null,
  interval_km numeric(12,1),
  interval_days integer,
  last_km numeric(12,1),
  last_date date,
  next_km numeric(12,1),
  next_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tire_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  position text,
  brand text,
  model text,
  size text,
  dot text,
  season text,
  installed_date date,
  installed_km numeric(12,1),
  tread_depth numeric(5,2),
  cost numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.accidents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  date date not null,
  location text,
  description text,
  fault_rate numeric(5,2),
  damage_cost numeric(12,2) not null default 0,
  insurance_file_no text,
  status text not null default 'open',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.fines (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  date date not null,
  reason text,
  amount numeric(12,2) not null default 0,
  paid boolean not null default false,
  paid_date date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  document_type text not null,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  expires_at date,
  created_at timestamptz not null default now()
);

create index if not exists idx_companies_owner on public.companies(owner_id);
create index if not exists idx_vehicles_company on public.vehicles(company_id);
create index if not exists idx_fuel_vehicle_date on public.fuel_records(vehicle_id, date desc);
create index if not exists idx_hgs_vehicle_date on public.hgs_records(vehicle_id, date desc);
create index if not exists idx_km_vehicle_date on public.km_records(vehicle_id, date desc);
create index if not exists idx_maintenance_vehicle_date on public.maintenance_records(vehicle_id, date desc);
create index if not exists idx_fines_vehicle_date on public.fines(vehicle_id, date desc);
create index if not exists idx_documents_vehicle on public.documents(vehicle_id);

-- Yardımcı fonksiyon: giriş yapan kullanıcı bu şirkete erişebiliyor mu?
create or replace function public.is_company_owner(company_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.companies c
    where c.id = company_uuid and c.owner_id = auth.uid()
  );
$$;

-- RLS
alter table public.companies enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;
alter table public.insurance_policies enable row level security;
alter table public.fuel_records enable row level security;
alter table public.hgs_records enable row level security;
alter table public.km_records enable row level security;
alter table public.maintenance_records enable row level security;
alter table public.maintenance_schedules enable row level security;
alter table public.tire_records enable row level security;
alter table public.accidents enable row level security;
alter table public.fines enable row level security;
alter table public.documents enable row level security;

-- Companies
create policy "owner can manage companies" on public.companies
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Company child tables
create policy "owner can manage drivers" on public.drivers
for all using (public.is_company_owner(company_id)) with check (public.is_company_owner(company_id));

create policy "owner can manage vehicles" on public.vehicles
for all using (public.is_company_owner(company_id)) with check (public.is_company_owner(company_id));

create policy "owner can manage insurance" on public.insurance_policies
for all using (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)))
with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)));

create policy "owner can manage fuel" on public.fuel_records
for all using (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)))
with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)));

create policy "owner can manage hgs" on public.hgs_records
for all using (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)))
with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)));

create policy "owner can manage km" on public.km_records
for all using (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)))
with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)));

create policy "owner can manage maintenance" on public.maintenance_records
for all using (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)))
with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)));

create policy "owner can manage schedules" on public.maintenance_schedules
for all using (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)))
with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)));

create policy "owner can manage tires" on public.tire_records
for all using (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)))
with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)));

create policy "owner can manage accidents" on public.accidents
for all using (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)))
with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)));

create policy "owner can manage fines" on public.fines
for all using (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)))
with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)));

create policy "owner can manage documents" on public.documents
for all using (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)))
with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.is_company_owner(v.company_id)));

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at before update on public.companies for each row execute function public.set_updated_at();
drop trigger if exists trg_vehicles_updated_at on public.vehicles;
create trigger trg_vehicles_updated_at before update on public.vehicles for each row execute function public.set_updated_at();
drop trigger if exists trg_drivers_updated_at on public.drivers;
create trigger trg_drivers_updated_at before update on public.drivers for each row execute function public.set_updated_at();
drop trigger if exists trg_schedules_updated_at on public.maintenance_schedules;
create trigger trg_schedules_updated_at before update on public.maintenance_schedules for each row execute function public.set_updated_at();
