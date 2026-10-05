-- Agen penemu career page: mencari board ATS publik perusahaan di Australia (fokus wilayah DAMA)
-- dan mendaftarkan board dengan lowongan Australia sebagai sumber resmi pemberi kerja.
insert into public.sources (slug, name, kind, authority, trust_score, tracks, country_code, base_url, config, schedule, status, terms_note)
values
  ('discover-ats-au', 'Penemu career page perusahaan Australia (wilayah DAMA)', 'monitor', 'aggregator', 50, '{professional}', 'AU',
   'https://jobportal-five-pi.vercel.app',
   $j${"provider":"ats_discovery","group":"discovery","queries_per_run":6,"max_new":8,"min_au_share":0.5,
   "queries":[
     "site:boards.greenhouse.io Darwin",
     "site:job-boards.greenhouse.io Northern Territory",
     "site:jobs.lever.co Darwin",
     "site:jobs.smartrecruiters.com Darwin",
     "site:jobs.smartrecruiters.com Alice Springs",
     "site:jobs.smartrecruiters.com Kalgoorlie",
     "site:boards.greenhouse.io Kalgoorlie OR Pilbara",
     "site:jobs.smartrecruiters.com Cairns",
     "site:boards.greenhouse.io Townsville",
     "site:jobs.lever.co Adelaide",
     "site:jobs.smartrecruiters.com Dubbo OR Orange NSW",
     "site:jobs.smartrecruiters.com Warrnambool",
     "site:job-boards.greenhouse.io Australia visa sponsorship",
     "site:jobs.lever.co Australia visa sponsorship",
     "site:jobs.ashbyhq.com Australia visa sponsorship",
     "DAMA labour agreement careers site:jobs.smartrecruiters.com"
   ]}$j$::jsonb,
   'daily', 'active', 'Board baru hanya aktif bila ≥50% lowongannya di Australia; lainnya draft untuk ditinjau.')
on conflict (slug) do nothing;
