-- Sumber lowongan tambahan: DAMA/sponsor regional Australia dan lowongan bersponsor visa di 6 negara tujuan.
-- Jalur DAMA hanya diberikan bila iklan menyebut DAMA secara eksplisit (lihat deriveTracks).
insert into public.sources (slug, name, kind, authority, trust_score, tracks, country_code, base_url, config, schedule, status, terms_note, attribution)
values
  ('adzuna-au-dama', 'Adzuna Australia — DAMA & sponsor regional', 'api', 'aggregator', 65, '{professional}', 'AU',
   'https://api.adzuna.com/v1/api/jobs/au/search',
   '{"provider": "adzuna", "group": "jobs", "country": "au", "default_country": "AU", "pages": 1, "queries": [{"what": "DAMA"}, {"what": "designated area migration agreement"}, {"what": "labour agreement visa"}, {"what": "482 visa sponsorship"}, {"what": "494 regional visa"}]}'::jsonb, '12h', 'active',
   'Batas Adzuna 250/hari, 2.500/bulan (trial).', 'Jobs by Adzuna'),
  ('adzuna-nz-sponsor', 'Adzuna Selandia Baru — lowongan dengan sponsor visa', 'api', 'aggregator', 65, '{overseas}', 'NZ',
   'https://api.adzuna.com/v1/api/jobs/nz/search',
   '{"provider": "adzuna", "group": "jobs", "country": "nz", "default_country": "NZ", "pages": 1, "queries": [{"what": "visa sponsorship"}, {"what": "sponsorship visa relocation"}]}'::jsonb, 'daily', 'active',
   'Batas Adzuna 250/hari, 2.500/bulan (trial).', 'Jobs by Adzuna'),
  ('adzuna-gb-sponsor', 'Adzuna Inggris — lowongan dengan sponsor visa', 'api', 'aggregator', 65, '{overseas}', 'GB',
   'https://api.adzuna.com/v1/api/jobs/gb/search',
   '{"provider": "adzuna", "group": "jobs", "country": "gb", "default_country": "GB", "pages": 1, "queries": [{"what": "visa sponsorship"}, {"what": "sponsorship visa relocation"}]}'::jsonb, 'daily', 'active',
   'Batas Adzuna 250/hari, 2.500/bulan (trial).', 'Jobs by Adzuna'),
  ('adzuna-ca-sponsor', 'Adzuna Kanada — lowongan dengan sponsor visa', 'api', 'aggregator', 65, '{overseas}', 'CA',
   'https://api.adzuna.com/v1/api/jobs/ca/search',
   '{"provider": "adzuna", "group": "jobs", "country": "ca", "default_country": "CA", "pages": 1, "queries": [{"what": "visa sponsorship"}, {"what": "sponsorship visa relocation"}]}'::jsonb, 'daily', 'active',
   'Batas Adzuna 250/hari, 2.500/bulan (trial).', 'Jobs by Adzuna'),
  ('adzuna-de-sponsor', 'Adzuna Jerman — lowongan dengan sponsor visa', 'api', 'aggregator', 65, '{overseas}', 'DE',
   'https://api.adzuna.com/v1/api/jobs/de/search',
   '{"provider": "adzuna", "group": "jobs", "country": "de", "default_country": "DE", "pages": 1, "queries": [{"what": "visa sponsorship"}, {"what": "sponsorship visa relocation"}]}'::jsonb, 'daily', 'active',
   'Batas Adzuna 250/hari, 2.500/bulan (trial).', 'Jobs by Adzuna'),
  ('adzuna-nl-sponsor', 'Adzuna Belanda — lowongan dengan sponsor visa', 'api', 'aggregator', 65, '{overseas}', 'NL',
   'https://api.adzuna.com/v1/api/jobs/nl/search',
   '{"provider": "adzuna", "group": "jobs", "country": "nl", "default_country": "NL", "pages": 1, "queries": [{"what": "visa sponsorship"}, {"what": "sponsorship visa relocation"}]}'::jsonb, 'daily', 'active',
   'Batas Adzuna 250/hari, 2.500/bulan (trial).', 'Jobs by Adzuna'),
  ('adzuna-sg-sponsor', 'Adzuna Singapura — lowongan dengan sponsor visa', 'api', 'aggregator', 65, '{overseas}', 'SG',
   'https://api.adzuna.com/v1/api/jobs/sg/search',
   '{"provider": "adzuna", "group": "jobs", "country": "sg", "default_country": "SG", "pages": 1, "queries": [{"what": "visa sponsorship"}, {"what": "sponsorship visa relocation"}]}'::jsonb, 'daily', 'active',
   'Batas Adzuna 250/hari, 2.500/bulan (trial).', 'Jobs by Adzuna')
on conflict (slug) do nothing;
