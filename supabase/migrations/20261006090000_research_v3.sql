-- Mesin riset v3: riwayat halaman per subjek, status riset per subjek, event kalender yang berasal
-- dari klaim resmi, dan sumber riset otomatis untuk semua beasiswa/program.

create table public.research_pages (
  subject_key text not null,
  url text not null,
  content_hash text not null,
  page_date date,
  outcome text,
  last_fetched_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  primary key (subject_key, url)
);

alter table public.research_pages enable row level security;
create policy "research_pages dibaca admin" on public.research_pages
  for select to authenticated using ((select public.is_admin()));

create table public.research_subjects (
  subject_key text primary key,
  subject_type text not null check (subject_type in ('opportunity', 'track')),
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  track public.track,
  profile text not null default 'scholarship'
    check (profile in ('visa_program', 'scholarship', 'job_program')),
  -- penyesuaian admin: description, queries, seed_urls, official_domains, max_pages, ...
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text check (last_status in ('success', 'partial', 'failed')),
  last_stats jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (subject_type = 'opportunity' and opportunity_id is not null and track is null)
    or (subject_type = 'track' and track is not null and opportunity_id is null)
  )
);

create index research_subjects_due_idx on public.research_subjects (next_run_at) where enabled;
create index research_subjects_opportunity_idx on public.research_subjects (opportunity_id)
  where opportunity_id is not null;

create trigger research_subjects_set_updated_at
  before update on public.research_subjects
  for each row execute function public.set_updated_at();

alter table public.research_subjects enable row level security;
create policy "research_subjects dikelola admin" on public.research_subjects
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Event kalender yang berasal dari klaim resmi (diperbarui otomatis oleh mesin riset).
alter table public.opportunity_events
  add column claim_id uuid references public.claims (id) on delete cascade;
create unique index opportunity_events_claim_idx on public.opportunity_events (claim_id)
  where claim_id is not null;
alter table public.opportunity_events drop constraint opportunity_events_kind_check;
alter table public.opportunity_events add constraint opportunity_events_kind_check
  check (kind in ('open', 'close', 'test', 'interview', 'announcement', 'ballot_open', 'ballot_close', 'start', 'other'));

-- Sumber riset otomatis: setiap beasiswa/program diriset sesuai jadwalnya (research_subjects).
insert into public.sources (slug, name, kind, authority, trust_score, tracks, country_code, base_url, config, schedule, status, terms_note)
values
  ('research-opportunities', 'Riset otomatis beasiswa & program', 'monitor', 'institution', 80, '{scholarship}', null,
   'https://jobportal-five-pi.vercel.app',
   '{"provider":"opportunity_research","group":"research","per_run":2,"parallel":2}'::jsonb,
   'hourly', 'draft',
   'Meriset setiap beasiswa/program yang jatuh tempo; fakta resmi (tenggat, status, pendanaan, jenjang) diterapkan ke listing.')
on conflict (slug) do nothing;

-- Agen riset per-beasiswa lama digantikan riset otomatis di atas.
update public.sources
set status = 'paused'
where config->>'provider' = 'research_agent'
  and config->'subject'->>'type' = 'opportunity';
