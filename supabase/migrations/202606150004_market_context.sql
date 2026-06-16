create table if not exists public.realm_phases (
  realm_id smallint not null references public.realms(id),
  phase text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  days integer,
  weeks integer,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (realm_id, start_at, end_at)
);

create table if not exists public.realm_events (
  realm_id smallint not null references public.realms(id),
  event_id integer not null,
  resource_id integer not null,
  resource_name text not null,
  speed_modifier integer not null,
  since timestamptz not null,
  until timestamptz not null,
  produced_at text,
  produced_at_name text,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (realm_id, event_id)
);

create table if not exists public.realm_contests (
  realm_id smallint not null references public.realms(id),
  contest_id integer not null,
  name text not null,
  resource_id integer,
  resource_name text,
  building_id text,
  building_name text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (realm_id, contest_id)
);

create index if not exists realm_phases_range_idx
  on public.realm_phases (realm_id, start_at, end_at);

create index if not exists realm_events_range_idx
  on public.realm_events (realm_id, since, until, resource_id);

create index if not exists realm_contests_range_idx
  on public.realm_contests (realm_id, start_at, end_at, resource_id);

alter table public.realm_phases enable row level security;
alter table public.realm_events enable row level security;
alter table public.realm_contests enable row level security;

drop policy if exists "public read realm phases" on public.realm_phases;
drop policy if exists "public read realm events" on public.realm_events;
drop policy if exists "public read realm contests" on public.realm_contests;

create policy "public read realm phases"
  on public.realm_phases for select
  using (true);

create policy "public read realm events"
  on public.realm_events for select
  using (true);

create policy "public read realm contests"
  on public.realm_contests for select
  using (true);
