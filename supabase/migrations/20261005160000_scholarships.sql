-- Karir Pro — Beasiswa: label event, antrean review ekstraksi AI, 10 program awal + sumber pemantauan.
-- Ringkasan & tanggal awal diambil dari halaman resmi penyelenggara (lihat source_url) dan WAJIB
-- diverifikasi sistem pemantau/admin: semua baris seed berstatus verification_status = 'needs_review'.

alter table public.opportunity_events add column label text;

create table public.extractions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  page_url text not null,
  content_hash text not null,
  model text not null,
  prompt_version text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null
);

create index extractions_status_idx on public.extractions (status, created_at desc);
create unique index extractions_source_hash_idx on public.extractions (source_id, content_hash);

alter table public.extractions enable row level security;
create policy "extractions dikelola admin" on public.extractions
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Organisasi penyelenggara
insert into public.organizations (name, normalized_name, slug, kind, country_code, website) values
  ('LPDP', 'lpdp', 'lpdp', 'government', 'ID', 'https://lpdp.kemenkeu.go.id'),
  ('Australia Awards Indonesia', 'australia awards indonesia', 'australia-awards-indonesia', 'government', 'AU', 'https://www.australiaawardsindonesia.org'),
  ('Chevening', 'chevening', 'chevening', 'government', 'GB', 'https://www.chevening.org'),
  ('Study in Korea (NIIED)', 'study in korea niied', 'study-in-korea-niied', 'government', 'KR', 'https://www.studyinkorea.go.kr'),
  ('Erasmus+ (Uni Eropa)', 'erasmus uni eropa', 'erasmus-uni-eropa', 'government', null, 'https://erasmus-plus.ec.europa.eu'),
  ('DAAD', 'daad', 'daad', 'foundation', 'DE', 'https://www.daad.de'),
  ('Nuffic / Study in NL', 'nuffic study in nl', 'nuffic-study-in-nl', 'government', 'NL', 'https://www.studyinnl.org'),
  ('Türkiye Bursları', 'turkiye burslari', 'turkiye-burslari', 'government', 'TR', 'https://www.turkiyeburslari.gov.tr'),
  ('Stipendium Hungaricum', 'stipendium hungaricum', 'stipendium-hungaricum', 'government', 'HU', 'https://stipendiumhungaricum.hu'),
  ('AMINEF (Fulbright Indonesia)', 'aminef fulbright indonesia', 'aminef-fulbright-indonesia', 'foundation', 'ID', 'https://www.aminef.or.id');

-- Program beasiswa (peluang jenis scholarship)
insert into public.opportunities
  (kind, tracks, title, slug, organization_id, country_code, region, summary, funding, study_levels,
   apply_url, official_url, closes_at, status, verification_status, confidence, attributes, dedupe_key, is_rolling)
values
  ('scholarship', '{scholarship}', 'Beasiswa LPDP', 'lpdp', (select id from public.organizations where normalized_name = 'lpdp'),
   null, 'Dalam & luar negeri',
   'Beasiswa Pemerintah Indonesia (LPDP, Kementerian Keuangan) untuk jenjang magister dan doktor di dalam maupun luar negeri, dengan beberapa skema (mis. STEM Industri Strategis, kemitraan, double/joint degree). Jadwal dan syarat berbeda tiap tahap; cek halaman resmi.',
   'Penuh', '{master,doctoral}',
   'https://lpdp.kemenkeu.go.id/en/beasiswa/pendaftaran-beasiswa/', 'https://lpdp.kemenkeu.go.id', null,
   'upcoming', 'needs_review', 40, '{"seed":true,"data_note":"Tahap II 2026: pendaftaran 30 Jun–31 Jul 2026 sudah ditutup; tahap seleksi lanjutan sedang berjalan."}', 'seed:lpdp', false),
  ('scholarship', '{scholarship}', 'Australia Awards Scholarships (Indonesia)', 'australia-awards-indonesia', (select id from public.organizations where normalized_name = 'australia awards indonesia'),
   'AU', null,
   'Beasiswa Pemerintah Australia untuk studi magister atau doktor di perguruan tinggi Australia, dengan bidang prioritas dan dukungan bagi kelompok target kesetaraan. Pendaftaran lewat Australia Awards Indonesia; periode terakhir ditutup 30 April 2026 pukul 11.00 WIB.',
   'Penuh', '{master,doctoral}',
   'https://www.australiaawardsindonesia.org/content/35/12/how-to-apply?sub=true', 'https://www.australiaawardsindonesia.org', null,
   'upcoming', 'needs_review', 40, '{"seed":true,"data_note":"Periode berikutnya belum diumumkan."}', 'seed:australia-awards-indonesia', false),
  ('scholarship', '{scholarship}', 'Chevening Scholarships — Indonesia', 'chevening-indonesia', (select id from public.organizations where normalized_name = 'chevening'),
   'GB', null,
   'Beasiswa Pemerintah Inggris untuk program magister satu tahun di universitas Inggris. Syarat umum: pengalaman kerja minimal dua tahun (±2.800 jam), bersedia kembali ke Indonesia minimal dua tahun setelah studi, dan mendaftar ke tiga program studi di Inggris.',
   'Penuh', '{master}',
   'https://www.chevening.org/scholarship/indonesia/', 'https://www.chevening.org/scholarships/application-timeline/', '2026-10-06T11:00:00Z',
   'open', 'needs_review', 40, '{"seed":true,"data_note":"Penutupan siklus 2027–2028: 6 Oktober 2026 pukul 11.00 UTC (18.00 WIB). Verifikasi di halaman resmi."}', 'seed:chevening-indonesia', false),
  ('scholarship', '{scholarship}', 'Global Korea Scholarship (GKS)', 'gks-korea', (select id from public.organizations where normalized_name = 'study in korea niied'),
   'KR', null,
   'Beasiswa Pemerintah Korea Selatan (NIIED) untuk jenjang sarjana dan pascasarjana. Tersedia jalur Embassy (mendaftar lewat Kedutaan Korea) dan jalur University (mendaftar langsung ke universitas). Batas usia dan IPK berbeda tiap jenjang.',
   'Penuh', '{bachelor,master,doctoral}',
   'https://www.studyinkorea.go.kr/en/plan/scholarship.do?tab=gks-tab1', 'https://www.studyinkorea.go.kr', null,
   'upcoming', 'needs_review', 40, '{"seed":true,"data_note":"Pola umum: pengumuman September, pendaftaran September–November. Cek pengumuman tahun berjalan."}', 'seed:gks-korea', false),
  ('scholarship', '{scholarship}', 'Erasmus Mundus Joint Masters', 'erasmus-mundus-joint-masters', (select id from public.organizations where normalized_name = 'erasmus uni eropa'),
   null, 'Eropa (beberapa negara)',
   'Program magister gabungan dari konsorsium universitas Eropa, dengan beasiswa penuh bagi pendaftar peringkat terbaik. Pendaftaran langsung ke masing-masing program (170+ program di katalog); umumnya dibuka pada musim gugur untuk masuk September tahun berikutnya.',
   'Penuh (untuk pendaftar peringkat terbaik)', '{master}',
   'https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/erasmus-mundus-joint-masters', 'https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/erasmus-mundus-joint-masters', null,
   'upcoming', 'needs_review', 40, '{"seed":true,"data_note":"Tenggat berbeda di tiap program; cek halaman program masing-masing."}', 'seed:erasmus-mundus-joint-masters', false),
  ('scholarship', '{scholarship}', 'Beasiswa DAAD (Jerman)', 'daad-jerman', (select id from public.organizations where normalized_name = 'daad'),
   'DE', null,
   'Lembaga pertukaran akademik Jerman dengan banyak program beasiswa magister dan doktor; syarat dan pendanaan berbeda per program. Gunakan basis data beasiswa DAAD untuk memfilter berdasarkan negara asal dan jenjang.',
   'Bervariasi per program', '{master,doctoral}',
   'https://www2.daad.de/deutschland/stipendium/datenbank/en/21148-scholarship-database/', 'https://www.daad.de/en/study-and-research-in-germany/scholarships/daad-scholarships/', null,
   'upcoming', 'needs_review', 40, '{"seed":true}', 'seed:daad-jerman', false),
  ('scholarship', '{scholarship}', 'NL Scholarship (Belanda)', 'nl-scholarship', (select id from public.organizations where normalized_name = 'nuffic study in nl'),
   'NL', null,
   'Beasiswa EUR 5.000 (tahun pertama) untuk mahasiswa non-EEA program sarjana atau magister penuh waktu di institusi Belanda yang berpartisipasi. Bukan beasiswa biaya kuliah penuh; pendaftaran lewat institusi tujuan.',
   'Parsial (EUR 5.000, tahun pertama)', '{bachelor,master}',
   'https://www.studyinnl.org/finances/nl-scholarship', 'https://www.nuffic.nl/en/nl-scholarship', null,
   'upcoming', 'needs_review', 40, '{"seed":true,"data_note":"Tenggat ditentukan tiap institusi peserta."}', 'seed:nl-scholarship', false),
  ('scholarship', '{scholarship}', 'Türkiye Scholarships (Türkiye Bursları)', 'turkiye-burslari', (select id from public.organizations where normalized_name = 'turkiye burslari'),
   'TR', null,
   'Beasiswa Pemerintah Turki yang mencakup penempatan kampus dan jurusan, biaya kuliah, tunjangan bulanan, asuransi kesehatan, akomodasi, kursus bahasa Turki, dan tiket pesawat sekali. Jenjang: sarjana, magister, doktor. Pendaftaran 2026 dibuka 10 Januari–20 Februari 2026.',
   'Penuh', '{bachelor,master,doctoral}',
   'https://www.turkiyeburslari.gov.tr/', 'https://www.turkiyeburslari.gov.tr/calendar', null,
   'upcoming', 'needs_review', 40, '{"seed":true,"data_note":"Periode berikutnya belum diumumkan."}', 'seed:turkiye-burslari', false),
  ('scholarship', '{scholarship}', 'Stipendium Hungaricum (Hungaria)', 'stipendium-hungaricum', (select id from public.organizations where normalized_name = 'stipendium hungaricum'),
   'HU', null,
   'Beasiswa Pemerintah Hungaria: biaya kuliah ditanggung, bantuan akomodasi, dan tunjangan bulanan. Tersedia untuk jenjang sarjana, magister, dan doktor dengan banyak program berbahasa Inggris. Indonesia termasuk negara mitra.',
   'Penuh (biaya kuliah + tunjangan)', '{bachelor,master,doctoral}',
   'https://apply.stipendiumhungaricum.hu/', 'https://stipendiumhungaricum.hu/country/indonesia/', null,
   'upcoming', 'needs_review', 40, '{"seed":true,"data_note":"Panggilan 2026/27 sudah dibuka; periode berikutnya cek situs resmi."}', 'seed:stipendium-hungaricum', false),
  ('scholarship', '{scholarship}', 'Fulbright (AMINEF) — Magister & Doktor', 'fulbright-aminef', (select id from public.organizations where normalized_name = 'aminef fulbright indonesia'),
   'US', null,
   'Beasiswa Fulbright untuk WNI melalui AMINEF untuk studi magister dan doktor di Amerika Serikat. Tenggat tahunan biasanya sekitar pertengahan Februari; cek halaman resmi untuk tahun berjalan.',
   'Penuh', '{master,doctoral}',
   'https://www.aminef.or.id/grants-for-indonesians/fulbright-programs/scholarship/', 'https://www.aminef.or.id/grants-for-indonesians/fulbright-programs/scholarship/', null,
   'upcoming', 'needs_review', 40, '{"seed":true}', 'seed:fulbright-aminef', false);

-- Event tanggal yang sudah tertulis di halaman resmi (menunggu verifikasi sistem)
insert into public.opportunity_events (opportunity_id, kind, label, starts_on, ends_on, date_precision, is_estimated, source_url)
values
  ((select id from public.opportunities where slug = 'chevening-indonesia'), 'close',
   'Penutupan pendaftaran siklus 2027–2028 (11.00 UTC / 18.00 WIB)', '2026-10-06', null, 'day', false,
   'https://www.chevening.org/scholarships/application-timeline/'),
  ((select id from public.opportunities where slug = 'lpdp'), 'announcement',
   'Pengumuman hasil Seleksi Bakat Skolastik (Tahap II 2026)', '2026-10-09', null, 'day', false,
   'https://lpdp.kemenkeu.go.id/en/beasiswa/pendaftaran-beasiswa/'),
  ((select id from public.opportunities where slug = 'lpdp'), 'test',
   'Seleksi Substansi (Tahap II 2026)', '2026-10-14', '2026-11-20', 'day', false,
   'https://lpdp.kemenkeu.go.id/en/beasiswa/pendaftaran-beasiswa/');

-- Sumber pemantauan halaman resmi (draft sampai uji kering bersih)
insert into public.sources (slug, name, kind, authority, trust_score, tracks, country_code, base_url, config, schedule, status, terms_note)
values
  ('page-lpdp', 'Halaman jadwal LPDP', 'monitor', 'government', 90, '{scholarship}', 'ID',
   'https://lpdp.kemenkeu.go.id/en/beasiswa/pendaftaran-beasiswa/',
   '{"provider":"page_monitor","url":"https://lpdp.kemenkeu.go.id/en/beasiswa/pendaftaran-beasiswa/","opportunity_slug":"lpdp","group":"pages"}', 'daily', 'draft', 'Halaman resmi pemerintah.'),
  ('page-chevening', 'Timeline aplikasi Chevening', 'monitor', 'government', 90, '{scholarship}', 'GB',
   'https://www.chevening.org/scholarships/application-timeline/',
   '{"provider":"page_monitor","url":"https://www.chevening.org/scholarships/application-timeline/","opportunity_slug":"chevening-indonesia","group":"pages"}', 'daily', 'draft', 'Halaman resmi.'),
  ('page-aas', 'Cara mendaftar Australia Awards Indonesia', 'monitor', 'government', 90, '{scholarship}', 'AU',
   'https://www.australiaawardsindonesia.org/content/35/12/how-to-apply?sub=true',
   '{"provider":"page_monitor","url":"https://www.australiaawardsindonesia.org/content/35/12/how-to-apply?sub=true","opportunity_slug":"australia-awards-indonesia","group":"pages"}', 'weekly', 'draft', 'Halaman resmi.'),
  ('page-gks', 'GKS — Study in Korea', 'monitor', 'government', 90, '{scholarship}', 'KR',
   'https://www.studyinkorea.go.kr/en/plan/scholarship.do?tab=gks-tab1',
   '{"provider":"page_monitor","url":"https://www.studyinkorea.go.kr/en/plan/scholarship.do?tab=gks-tab1","opportunity_slug":"gks-korea","fetcher":"firecrawl","group":"pages"}', 'weekly', 'draft', 'Halaman resmi; kemungkinan dirender JavaScript (memakai Firecrawl).'),
  ('page-erasmus-mundus', 'Erasmus Mundus Joint Masters (mahasiswa)', 'monitor', 'government', 90, '{scholarship}', null,
   'https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/erasmus-mundus-joint-masters',
   '{"provider":"page_monitor","url":"https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/erasmus-mundus-joint-masters","opportunity_slug":"erasmus-mundus-joint-masters","group":"pages"}', 'weekly', 'draft', 'Halaman resmi Komisi Eropa.'),
  ('page-daad', 'DAAD — ikhtisar beasiswa', 'monitor', 'institution', 90, '{scholarship}', 'DE',
   'https://www.daad.de/en/study-and-research-in-germany/scholarships/daad-scholarships/',
   '{"provider":"page_monitor","url":"https://www.daad.de/en/study-and-research-in-germany/scholarships/daad-scholarships/","opportunity_slug":"daad-jerman","group":"pages"}', 'weekly', 'draft', 'Halaman resmi.'),
  ('page-nl-scholarship', 'NL Scholarship (Study in NL)', 'monitor', 'government', 90, '{scholarship}', 'NL',
   'https://www.studyinnl.org/finances/nl-scholarship',
   '{"provider":"page_monitor","url":"https://www.studyinnl.org/finances/nl-scholarship","opportunity_slug":"nl-scholarship","group":"pages"}', 'weekly', 'draft', 'Halaman resmi.'),
  ('page-turkiye', 'Türkiye Bursları — kalender', 'monitor', 'government', 90, '{scholarship}', 'TR',
   'https://www.turkiyeburslari.gov.tr/calendar',
   '{"provider":"page_monitor","url":"https://www.turkiyeburslari.gov.tr/calendar","opportunity_slug":"turkiye-burslari","group":"pages"}', 'weekly', 'draft', 'Halaman resmi.'),
  ('page-stipendium-hungaricum', 'Stipendium Hungaricum — Indonesia', 'monitor', 'government', 90, '{scholarship}', 'HU',
   'https://stipendiumhungaricum.hu/country/indonesia/',
   '{"provider":"page_monitor","url":"https://stipendiumhungaricum.hu/country/indonesia/","opportunity_slug":"stipendium-hungaricum","group":"pages"}', 'weekly', 'draft', 'Halaman resmi.'),
  ('page-fulbright-aminef', 'Fulbright — AMINEF', 'monitor', 'institution', 90, '{scholarship}', 'US',
   'https://www.aminef.or.id/grants-for-indonesians/fulbright-programs/scholarship/',
   '{"provider":"page_monitor","url":"https://www.aminef.or.id/grants-for-indonesians/fulbright-programs/scholarship/","opportunity_slug":"fulbright-aminef","group":"pages"}', 'weekly', 'draft', 'Halaman resmi.');
