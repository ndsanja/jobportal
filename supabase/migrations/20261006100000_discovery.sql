-- Agen penemu: kandidat peluang BARU yang ditemukan AI di web, menunggu persetujuan admin.

create table public.discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 160),
  -- token nama bermakna, diurutkan (lihat src/domain/discovery.ts → nameKey)
  name_key text not null unique,
  kind public.opportunity_kind not null,
  organizer text,
  country_code char(2) references public.countries (code),
  levels text[] not null default '{}',
  official_url text,
  -- halaman resmi benar-benar dibuka dan menyebut nama program
  link_verified boolean not null default false,
  open_to_indonesia text not null default 'unknown' check (open_to_indonesia in ('yes', 'unknown')),
  deadline date,
  summary text,
  -- [{url, quote}] halaman tempat program ditemukan beserta kutipannya
  evidence jsonb not null default '[]'::jsonb,
  score smallint not null default 0 check (score between 0 and 100),
  seen_count integer not null default 1,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'duplicate')),
  opportunity_id uuid references public.opportunities (id) on delete set null,
  source_id uuid references public.sources (id) on delete set null,
  model text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null
);

create index discovery_candidates_queue_idx on public.discovery_candidates (status, score desc);
create index discovery_candidates_opportunity_idx on public.discovery_candidates (opportunity_id)
  where opportunity_id is not null;
create index discovery_candidates_source_idx on public.discovery_candidates (source_id);

alter table public.discovery_candidates enable row level security;
create policy "discovery_candidates dikelola admin" on public.discovery_candidates
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create table public.discovery_pages (
  url text primary key,
  content_hash text not null,
  source_id uuid references public.sources (id) on delete cascade,
  last_fetched_at timestamptz not null default now()
);

create index discovery_pages_source_idx on public.discovery_pages (source_id);

alter table public.discovery_pages enable row level security;
create policy "discovery_pages dibaca admin" on public.discovery_pages
  for select to authenticated using ((select public.is_admin()));

-- Dua agen penemu awal (draft). Kueri digilir 4 per run; {year}/{next} diganti otomatis.
insert into public.sources (slug, name, kind, authority, trust_score, tracks, country_code, base_url, config, schedule, status, terms_note)
values
  ('discover-scholarships', 'Penemu beasiswa luar negeri', 'monitor', 'aggregator', 50, '{scholarship}', null,
   'https://jobportal-five-pi.vercel.app',
   $j${"provider":"discovery_agent","group":"discovery","target":"scholarship","queries_per_run":4,
   "queries":[
     "fully funded scholarships {next} for Indonesian students",
     {"q":"beasiswa luar negeri {next} fully funded dibuka","recency":"month"},
     "government scholarships for international students {next} Indonesia eligible",
     "master's degree scholarships {next} developing countries fully funded",
     "PhD scholarships {next} international students fully funded stipend",
     "undergraduate scholarships {next} international students Asia fully funded",
     {"q":"beasiswa S2 luar negeri {next} pendaftaran dibuka","recency":"month"},
     "Japan scholarships {next} international students MEXT JASSO university",
     "scholarships Europe {next} non-EU students fully funded",
     "ASEAN scholarships {next} Singapore Malaysia Thailand Brunei international students",
     "short course fellowship {next} Indonesian professionals fully funded",
     {"q":"beasiswa pemerintah luar negeri {next} untuk WNI","recency":"month"},
     "Korea Taiwan China government scholarships {next} international students",
     "Australia New Zealand scholarships {next} international students fully funded",
     "Middle East scholarships {next} international students fully funded Saudi Qatar Turkey",
     "Canada USA scholarships {next} international students fully funded"
   ],
   "max_pages":8,"results_per_query":6,"verify_links":12}$j$::jsonb,
   'daily', 'draft', 'Menemukan program baru; kandidat hanya tampil publik setelah disetujui admin dan diriset dari sumber resmi.'),
  ('discover-programs', 'Penemu program kerja luar negeri resmi', 'monitor', 'aggregator', 50, '{overseas}', null,
   'https://jobportal-five-pi.vercel.app',
   $j${"provider":"discovery_agent","group":"discovery","target":"program","queries_per_run":4,
   "queries":[
     {"q":"program penempatan pekerja migran Indonesia resmi KP2MI {year}","recency":"month"},
     {"q":"G to G Korea EPS-TOPIK Indonesia {year} pendaftaran","recency":"year"},
     "Specified Skilled Worker Japan Indonesia {year} official recruitment program",
     "Germany skilled worker programme Indonesian nurses caregivers Triple Win {year}",
     "Taiwan official recruitment program Indonesian workers {year}",
     {"q":"program magang Jepang Kemnaker IM Japan {year} pendaftaran","recency":"year"},
     {"q":"program pemagangan luar negeri resmi Kemnaker {year}","recency":"year"},
     "working holiday visa agreement Indonesia countries {year}",
     "Saudi Arabia skilled worker program Indonesia official {year}",
     "Australia employer sponsored visa program regional skilled workers Indonesia {year}",
     {"q":"lowongan kerja luar negeri resmi pemerintah {year} Kemnaker KP2MI","recency":"month"},
     "Netherlands Europe skilled migration program Asian workers {year} official"
   ],
   "max_pages":8,"results_per_query":6,"verify_links":12}$j$::jsonb,
   'daily', 'draft', 'Hanya jalur resmi/legal; kandidat ditinjau admin sebelum tampil.')
on conflict (slug) do nothing;
