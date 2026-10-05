-- Karir Pro — Fase 1: skema peluang (lowongan, beasiswa, program) dan jejak ingestion

create type public.opportunity_kind as enum ('job', 'scholarship', 'program');
create type public.opportunity_status as enum ('upcoming', 'open', 'closed', 'archived');
create type public.verification_status as enum ('verified', 'aggregated', 'needs_review', 'community');

-- ---------------------------------------------------------------------------
-- Organisasi
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  slug text not null unique,
  kind text not null default 'employer'
    check (kind in ('employer', 'university', 'government', 'agency', 'foundation', 'other')),
  country_code char(2) references public.countries (code),
  website text,
  logo_url text,
  verification jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Peluang
-- ---------------------------------------------------------------------------

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  kind public.opportunity_kind not null,
  tracks public.track[] not null default '{}',
  title text not null,
  slug text not null unique,
  organization_id uuid references public.organizations (id) on delete set null,
  country_code char(2) references public.countries (code),
  city text,
  region text,
  postcode text,
  is_remote boolean not null default false,
  category text,
  employment_type text,
  summary text,
  salary_min numeric,
  salary_max numeric,
  salary_currency char(3),
  salary_period text check (salary_period in ('hour', 'day', 'week', 'month', 'year')),
  funding text,
  study_levels text[] not null default '{}',
  apply_url text not null,
  official_url text,
  published_at timestamptz,
  opens_at timestamptz,
  closes_at timestamptz,
  is_rolling boolean not null default false,
  status public.opportunity_status not null default 'open',
  verification_status public.verification_status not null default 'aggregated',
  confidence smallint not null default 50 check (confidence between 0 and 100),
  attributes jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  is_published boolean not null default true,
  search tsvector generated always as (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(city, '') || ' ' || coalesce(region, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();

create index opportunities_search_idx on public.opportunities using gin (search);
create index opportunities_title_trgm_idx on public.opportunities using gin (title extensions.gin_trgm_ops);
create index opportunities_tracks_idx on public.opportunities using gin (tracks);
create index opportunities_listing_idx on public.opportunities (is_published, status, last_verified_at desc);
create index opportunities_country_idx on public.opportunities (country_code);
create index opportunities_closes_at_idx on public.opportunities (closes_at) where closes_at is not null;
create index opportunities_organization_idx on public.opportunities (organization_id);

-- ---------------------------------------------------------------------------
-- Lineage sumber (satu peluang bisa punya beberapa sumber)
-- ---------------------------------------------------------------------------

create table public.opportunity_sources (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  external_id text not null,
  source_url text not null,
  is_primary boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create index opportunity_sources_opportunity_idx on public.opportunity_sources (opportunity_id);

-- ---------------------------------------------------------------------------
-- Event tanggal (basis kalender) dan riwayat perubahan
-- ---------------------------------------------------------------------------

create table public.opportunity_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  kind text not null
    check (kind in ('open', 'close', 'test', 'interview', 'announcement', 'ballot_open', 'ballot_close', 'start')),
  starts_on date not null,
  ends_on date,
  date_precision text not null default 'day' check (date_precision in ('day', 'month', 'year')),
  is_estimated boolean not null default false,
  source_url text,
  created_at timestamptz not null default now()
);

create index opportunity_events_calendar_idx on public.opportunity_events (starts_on);
create index opportunity_events_opportunity_idx on public.opportunity_events (opportunity_id);

create table public.opportunity_changes (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  field text not null,
  old_value jsonb,
  new_value jsonb,
  source_id uuid references public.sources (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index opportunity_changes_opportunity_idx on public.opportunity_changes (opportunity_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Jejak ingestion
-- ---------------------------------------------------------------------------

create table public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  stats jsonb not null default '{}'::jsonb,
  error text
);

create index ingest_runs_source_idx on public.ingest_runs (source_id, started_at desc);

create table public.source_pages (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id) on delete cascade,
  url text not null,
  content_hash text,
  etag text,
  last_modified text,
  last_fetched_at timestamptz,
  last_changed_at timestamptz,
  snapshot_path text,
  unique (source_id, url)
);

-- ---------------------------------------------------------------------------
-- Tutup otomatis peluang yang lewat deadline (dijalankan pg_cron)
-- ---------------------------------------------------------------------------

create or replace function public.close_expired_opportunities()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.opportunities
     set status = 'closed'
   where status = 'open'
     and not is_rolling
     and closes_at is not null
     and closes_at < now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke execute on function public.close_expired_opportunities() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'close-expired-opportunities',
  '*/30 * * * *',
  $cron$select public.close_expired_opportunities();$cron$
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_sources enable row level security;
alter table public.opportunity_events enable row level security;
alter table public.opportunity_changes enable row level security;
alter table public.ingest_runs enable row level security;
alter table public.source_pages enable row level security;

create policy "organizations dapat dibaca publik" on public.organizations
  for select to anon, authenticated using (true);
create policy "organizations dikelola admin" on public.organizations
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "opportunities terbit dapat dibaca publik" on public.opportunities
  for select to anon, authenticated using (is_published);
create policy "opportunities dikelola admin" on public.opportunities
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "opportunity_sources dapat dibaca bila peluang terbit" on public.opportunity_sources
  for select to anon, authenticated
  using (exists (select 1 from public.opportunities o where o.id = opportunity_id and o.is_published));
create policy "opportunity_sources dikelola admin" on public.opportunity_sources
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "opportunity_events dapat dibaca bila peluang terbit" on public.opportunity_events
  for select to anon, authenticated
  using (exists (select 1 from public.opportunities o where o.id = opportunity_id and o.is_published));
create policy "opportunity_events dikelola admin" on public.opportunity_events
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "opportunity_changes dapat dibaca bila peluang terbit" on public.opportunity_changes
  for select to anon, authenticated
  using (exists (select 1 from public.opportunities o where o.id = opportunity_id and o.is_published));
create policy "opportunity_changes dikelola admin" on public.opportunity_changes
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "ingest_runs dikelola admin" on public.ingest_runs
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "source_pages dikelola admin" on public.source_pages
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Sumber awal (draft sampai kunci API tersedia)
-- ---------------------------------------------------------------------------

insert into public.sources (slug, name, kind, authority, trust_score, tracks, country_code, base_url, config, schedule, status, terms_note, attribution)
values (
  'adzuna-au-whv',
  'Adzuna Australia — pekerjaan umum untuk WHV',
  'api',
  'aggregator',
  65,
  '{whv_au}',
  'AU',
  'https://api.adzuna.com/v1/api/jobs/au/search',
  '{
    "provider": "adzuna",
    "group": "jobs",
    "country": "au",
    "default_country": "AU",
    "pages": 1,
    "queries": [
      {"what": "farm hand"}, {"what": "fruit picker"}, {"what": "packer"},
      {"what": "housekeeper"}, {"what": "kitchen hand"}, {"what": "cleaner"},
      {"what": "working holiday"}
    ]
  }'::jsonb,
  '12h',
  'draft',
  'Batas default 25/menit, 250/hari, 2.500/bulan. Pemakaian komersial butuh lisensi setelah masa trial.',
  'Jobs by Adzuna'
);
