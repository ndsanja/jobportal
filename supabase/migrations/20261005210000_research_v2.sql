-- Mesin riset v2: tanggal pembaruan halaman sebagai bukti, panduan hasil sintesis AI per subjek,
-- dan pencarian WHV 462 yang lebih tepat (ballot, domain resmi, halaman utama Home Affairs).

alter table public.claim_evidence add column page_date date;

create table public.subject_briefs (
  subject_key text primary key,
  subject_type text not null check (subject_type in ('opportunity', 'track')),
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  track public.track,
  -- BriefContent (lihat src/domain/brief.ts): headline, summary, sections, uncertainties.
  content jsonb not null,
  -- hash klaim masukan: panduan hanya disusun ulang bila klaim berubah
  input_hash text not null,
  model text,
  prompt_version text,
  generated_at timestamptz not null default now(),
  check (
    (subject_type = 'opportunity' and opportunity_id is not null and track is null)
    or (subject_type = 'track' and track is not null and opportunity_id is null)
  )
);

create index subject_briefs_opportunity_idx on public.subject_briefs (opportunity_id)
  where opportunity_id is not null;

alter table public.subject_briefs enable row level security;

create policy "subject_briefs dapat dibaca" on public.subject_briefs
  for select to anon, authenticated using (true);
create policy "subject_briefs dibuat admin" on public.subject_briefs
  for insert to authenticated with check ((select public.is_admin()));
create policy "subject_briefs diubah admin" on public.subject_briefs
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "subject_briefs dihapus admin" on public.subject_briefs
  for delete to authenticated using ((select public.is_admin()));

update public.sources
set config = $j${"provider":"research_agent","group":"research","subject":{"type":"track","track":"whv_au"},
  "description":"Work and Holiday visa (subclass 462) Australia untuk pemegang paspor Indonesia: cara mendaftar (termasuk ballot), syarat kelayakan, biaya, jadwal, dan dokumen",
  "queries":[
    "Work and Holiday visa subclass 462 Indonesia ballot",
    "site:immi.homeaffairs.gov.au Work and Holiday visa 462 ballot Indonesia",
    "site:immi.homeaffairs.gov.au Work and Holiday visa subclass 462 eligibility requirements",
    "site:indonesia.embassy.gov.au Work and Holiday visa 462",
    {"q":"Work and Holiday visa 462 Indonesia ballot 2026 announcement","recency":"year"},
    {"q":"visa Work and Holiday 462 Indonesia ballot pendaftaran syarat","recency":"year"},
    "Work and Holiday visa 462 fee evidence of funds functional English Indonesia"
  ],
  "seed_urls":["https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-462"],
  "official_domains":["immi.homeaffairs.gov.au","homeaffairs.gov.au","indonesia.embassy.gov.au","imigrasi.go.id","dfat.gov.au"],
  "max_pages":10,"results_per_query":5}$j$::jsonb
where slug = 'research-whv-462';
