create table if not exists public.realms (
  id smallint primary key,
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.realms (id, name)
values
  (0, 'Magnates'),
  (1, 'Entrepreneurs')
on conflict (id) do update set name = excluded.name;

create table if not exists public.resources (
  realm_id smallint not null references public.realms(id),
  resource_id integer not null,
  name text not null,
  is_research boolean,
  transportation numeric,
  produced_an_hour numeric,
  inputs jsonb not null default '{}'::jsonb,
  retail_info jsonb,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (realm_id, resource_id)
);

create table if not exists public.market_daily (
  realm_id smallint not null references public.realms(id),
  resource_id integer not null,
  resource_name text not null,
  quality integer not null,
  date date not null,
  close numeric,
  vwap numeric not null,
  vwap_change_percent numeric,
  volume numeric not null,
  market_value numeric not null,
  raw jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  primary key (realm_id, resource_id, quality, date)
);

create table if not exists public.index_definitions (
  code text primary key,
  name text not null,
  description text not null,
  weighting_method text not null,
  created_at timestamptz not null default now()
);

insert into public.index_definitions (code, name, description, weighting_method)
values
  ('total_market', 'Total Market', 'All tracked resource-quality pairs weighted by daily activity.', 'market_value'),
  ('sc_10', 'SC-10', 'The 10 largest resource-quality pairs by daily market value.', 'market_value'),
  ('sc_30', 'SC-30', 'The 30 largest resource-quality pairs by daily market value.', 'market_value'),
  ('sc_50', 'SC-50', 'The 50 largest resource-quality pairs by daily market value.', 'market_value'),
  ('research_only', 'Research Only', 'Research resources weighted by daily market activity.', 'market_value'),
  ('food_only', 'Food Only', 'Food and beverage resources weighted by daily market activity.', 'market_value'),
  ('construction_only', 'Construction Only', 'Construction-chain resources weighted by daily market activity.', 'market_value'),
  ('equal_weight_market', 'Equal Weight Market', 'All tracked resource-quality pairs weighted equally.', 'equal_weight')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  weighting_method = excluded.weighting_method;

create table if not exists public.index_values (
  index_code text not null references public.index_definitions(code),
  realm_id smallint not null references public.realms(id),
  date date not null,
  value numeric not null,
  component_count integer not null,
  total_market_value numeric not null,
  created_at timestamptz not null default now(),
  primary key (index_code, realm_id, date)
);

create table if not exists public.index_components (
  index_code text not null references public.index_definitions(code),
  realm_id smallint not null references public.realms(id),
  date date not null,
  resource_id integer not null,
  resource_name text not null,
  quality integer not null,
  weight numeric not null,
  vwap numeric not null,
  volume numeric not null,
  market_value numeric not null,
  created_at timestamptz not null default now(),
  primary key (index_code, realm_id, date, resource_id, quality)
);

create index if not exists market_daily_realm_date_idx
  on public.market_daily (realm_id, date desc);

create index if not exists index_values_lookup_idx
  on public.index_values (realm_id, index_code, date);

create index if not exists index_components_lookup_idx
  on public.index_components (realm_id, index_code, date, weight desc);

alter table public.realms enable row level security;
alter table public.resources enable row level security;
alter table public.market_daily enable row level security;
alter table public.index_definitions enable row level security;
alter table public.index_values enable row level security;
alter table public.index_components enable row level security;

drop policy if exists "public read realms" on public.realms;
drop policy if exists "public read resources" on public.resources;
drop policy if exists "public read market daily" on public.market_daily;
drop policy if exists "public read index definitions" on public.index_definitions;
drop policy if exists "public read index values" on public.index_values;
drop policy if exists "public read index components" on public.index_components;

create policy "public read realms"
  on public.realms for select
  using (true);

create policy "public read resources"
  on public.resources for select
  using (true);

create policy "public read market daily"
  on public.market_daily for select
  using (true);

create policy "public read index definitions"
  on public.index_definitions for select
  using (true);

create policy "public read index values"
  on public.index_values for select
  using (true);

create policy "public read index components"
  on public.index_components for select
  using (true);
