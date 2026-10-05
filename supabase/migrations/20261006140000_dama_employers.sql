-- Daftar pemberi kerja yang dinyatakan punya perjanjian/endorsement DAMA, dikumpulkan dari situs
-- representatif wilayah (pemerintah) dan pihak ketiga, masing-masing dengan kutipan dan sumber.

create table public.dama_employers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text not null unique,
  region text,
  industry text,
  website text,
  careers_url text,
  -- [{url, quote, tier}]
  evidence jsonb not null default '[]'::jsonb,
  -- resmi (situs pemerintah/DAR) atau ≥2 domain independen
  verified boolean not null default false,
  is_published boolean not null default true,
  source_id uuid references public.sources (id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index dama_employers_source_idx on public.dama_employers (source_id);

alter table public.dama_employers enable row level security;
create policy "dama_employers dapat dibaca" on public.dama_employers
  for select to anon, authenticated using (is_published or (select public.is_admin()));
create policy "dama_employers dikelola admin" on public.dama_employers
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

insert into public.sources (slug, name, kind, authority, trust_score, tracks, country_code, base_url, config, schedule, status, terms_note)
values
  ('discover-dama-employers', 'Penemu daftar perusahaan DAMA', 'monitor', 'aggregator', 50, '{dama_au}', 'AU',
   'https://jobportal-five-pi.vercel.app',
   $j${"provider":"employer_registry","group":"discovery","queries_per_run":5,"max_pages":8,
   "queries":[
     "DAMA endorsed employers list",
     "list of businesses with DAMA labour agreement",
     "Great South Coast DAMA businesses labour agreement list",
     "Northern Territory DAMA endorsed employers",
     "Goldfields DAMA endorsed businesses Kalgoorlie Boulder",
     "Orana DAMA employers list Dubbo",
     "Far North Queensland DAMA employers Cairns sponsor",
     "Townsville DAMA endorsed employers",
     "South Australia DAMA endorsed employers",
     "Pilbara DAMA employers sponsor",
     "East Kimberley DAMA employers",
     "Goulburn Valley DAMA employers list",
     "\"DAMA labour agreement\" employer hiring overseas workers",
     "DAMA sponsor company jobs regional Australia list"
   ]}$j$::jsonb,
   'daily', 'active', 'Perusahaan hanya dicatat bila halaman sumber menyebutnya eksplisit terkait DAMA (kutipan persis).')
on conflict (slug) do nothing;
