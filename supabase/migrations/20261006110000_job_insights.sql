-- Pengayaan lowongan: teks iklan (privat, hanya untuk diproses) dan penilaian AI kelayakan WNI
-- (publik, setiap alasan tegas berkutipan dari iklan).

create table public.opportunity_texts (
  opportunity_id uuid primary key references public.opportunities (id) on delete cascade,
  text text not null,
  text_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.opportunity_texts enable row level security;
create policy "opportunity_texts dibaca admin" on public.opportunity_texts
  for select to authenticated using ((select public.is_admin()));

create table public.opportunity_insights (
  opportunity_id uuid primary key references public.opportunities (id) on delete cascade,
  wni text not null check (wni in ('likely', 'possible', 'unlikely', 'unknown')),
  -- [{text, quote|null}]
  reasons jsonb not null default '[]'::jsonb,
  pathways text[] not null default '{}',
  requires_local_work_rights boolean,
  sponsorship text not null default 'unknown' check (sponsorship in ('offered', 'not_offered', 'unknown')),
  -- [{text, quote}]
  requirements jsonb not null default '[]'::jsonb,
  summary text,
  text_hash text not null,
  model text,
  prompt_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index opportunity_insights_wni_idx on public.opportunity_insights (wni);

create trigger opportunity_insights_set_updated_at
  before update on public.opportunity_insights
  for each row execute function public.set_updated_at();

alter table public.opportunity_insights enable row level security;
create policy "opportunity_insights dapat dibaca bila peluang terbit" on public.opportunity_insights
  for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.opportunities o where o.id = opportunity_id and o.is_published)
  );
create policy "opportunity_insights dikelola admin" on public.opportunity_insights
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

insert into public.sources (slug, name, kind, authority, trust_score, tracks, country_code, base_url, config, schedule, status, terms_note)
values
  ('enrich-jobs', 'Penilaian AI lowongan untuk WNI', 'monitor', 'institution', 70, '{overseas}', null,
   'https://jobportal-five-pi.vercel.app',
   '{"provider":"job_enrichment","group":"enrich","batch_size":8,"max_jobs":48,"concurrency":3}'::jsonb,
   'hourly', 'draft', 'Menilai kelayakan WNI, jalur visa, dan syarat kunci tiap lowongan dari teks iklan; alasan tegas wajib berkutipan.')
on conflict (slug) do nothing;
