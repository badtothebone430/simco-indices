create table if not exists public.realm_government_orders (
  realm_id smallint not null references public.realms(id),
  order_id integer not null,
  project_name text not null,
  resource_id integer not null,
  resource_name text not null,
  quality integer not null,
  days_to_fulfill integer,
  created_at timestamptz not null,
  due_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (realm_id, order_id, resource_id, quality)
);

create index if not exists realm_government_orders_range_idx
  on public.realm_government_orders (realm_id, created_at, due_at, resource_id);

alter table public.realm_government_orders enable row level security;

drop policy if exists "public read realm government orders" on public.realm_government_orders;

create policy "public read realm government orders"
  on public.realm_government_orders for select
  using (true);
