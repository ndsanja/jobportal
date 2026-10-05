# Karir Pro — Runbook Ingestion (Fase 1)

Status: kode sudah ada, **belum pernah dijalankan terhadap internet/database sungguhan** (sandbox pengembangan tidak punya akses jaringan ke Supabase). Jalankan langkah di bawah berurutan setelah deploy ke Vercel.

## Alur singkat
`pg_cron` → `pg_net` POST `/api/ingest/run?group=jobs` (Bearer `CRON_SECRET`) → untuk tiap sumber jatuh tempo: adapter ambil data → validasi Zod → sinyal teks (WHV/DAMA/sponsor) → dedupe (hash) → upsert `organizations`/`opportunities`/`opportunity_sources` → catat `opportunity_changes` → tutup lowongan yang hilang dari feed lengkap → `ingest_runs` + jadwal berikutnya.

## 1. Environment (Vercel)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CRON_SECRET` (string acak panjang), `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`. Opsional: `INGEST_USER_AGENT`.

## 2. Menambah sumber
Sumber disimpan di tabel `sources` (RLS: admin). Contoh career page ATS (ganti token/perusahaan dengan yang **sudah Anda cek benar-benar ada**):

```sql
insert into public.sources (slug, name, kind, authority, trust_score, tracks, country_code, base_url, config, schedule, status)
values (
  'ats-contoh-greenhouse', 'Contoh Perusahaan (Greenhouse)', 'ats', 'employer', 85, '{professional}', null,
  'https://boards.greenhouse.io/contoh',
  '{"provider":"greenhouse","token":"contoh","company":"Contoh Perusahaan","default_country":"AU","group":"jobs"}',
  'daily', 'draft'
);
```
`provider`: `greenhouse` | `lever` | `ashby` (ATS, feed lengkap → lowongan yang hilang ditutup otomatis) | `adzuna` (agregator, tidak menutup otomatis). Sumber baru dibuat `draft`; ubah ke `active` setelah dry-run bersih.

## 2b. Sumber bawaan yang sudah ada (status draft sampai diuji)
- 10 career page (Greenhouse, Lever, SmartRecruiters) dan 10 pemantau halaman beasiswa (`page-*`). Uji semuanya sekaligus:
```bash
curl -s -X POST "https://<domain>/api/ingest/run?drafts=1&dry_run=1" -H "Authorization: Bearer $CRON_SECRET"
```
  Mode ini hanya untuk sumber `draft` dan wajib `dry_run=1`. Bila `deferred` > 0 (waktu habis), uji sisanya satu per satu dengan `?slug=`. Sumber yang bersih diaktifkan dengan `update public.sources set status='active' where slug='...'`.

## 3. Uji kering satu sumber (tanpa menulis apa pun)
```bash
curl -s -X POST "https://<domain>/api/ingest/run?slug=<slug-sumber>&dry_run=1" \
  -H "Authorization: Bearer $CRON_SECRET"
```
Periksa `fetched`, `skipped` (harus kecil), `created`, `updated`, `closed`, `closeSkipped`. Jalankan tanpa `dry_run` untuk run nyata pertama, lalu cek `/lowongan`.

## 4. Penjadwalan (jalankan SETELAH deploy dan dry-run bersih)
```sql
create extension if not exists pg_net with schema extensions;
select vault.create_secret('<CRON_SECRET>', 'cron_secret');
select vault.create_secret('https://<domain>', 'app_base_url');

select cron.schedule('ingest-jobs', '0 */12 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/ingest/run?group=jobs',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
$$);
```
`pg_net` berjalan asinkron; hasil permintaan ada di `net._http_response`. Penutupan otomatis lewat deadline (`close-expired-opportunities`) **sudah terjadwal** di database.

## 5. Pemantau halaman beasiswa & antrean review
Sumber `kind = 'monitor'` (config `provider: page_monitor`) mengambil satu halaman resmi (`fetcher`: `fetch` atau `firecrawl` untuk halaman JavaScript/PDF), menghitung hash teks, dan **hanya jika berubah** memanggil model (`OPENROUTER_MODEL`, default `openai/gpt-6-luna`). Setiap fakta (tanggal, pendanaan, jenjang, status) wajib membawa kutipan persis dari halaman; kutipan yang tidak ada di teks atau tanggal yang tidak wajar dibuang otomatis. Hasilnya masuk **`/admin/review`**: admin mencocokkan kutipan, lalu *Setujui & terapkan* (memperbarui peluang, mengganti jadwal dari halaman itu, mencatat `opportunity_changes`, dan menandai terverifikasi) atau *Tolak*. Tidak ada yang tampil sebagai "Terverifikasi" tanpa persetujuan admin.

Jadwal pemantau (pasang setelah uji kering bersih), sama seperti §4 tetapi dengan `?group=pages`:
```sql
select cron.schedule('monitor-pages', '30 1 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/ingest/run?group=pages',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 300000);
$$);
```

## 6. Agen riset (syarat WHV & beasiswa) — mencari, membandingkan, memverifikasi
Sumber `provider: research_agent` bekerja seperti peneliti: **cari di web (Firecrawl) → baca halaman (resmi dulu) → model mengekstrak klaim + kutipan → simpan sebagai klaim dan bukti → hitung status dan keyakinan**.

- **Tingkat sumber:** `official` (daftar domain resmi per sumber + pola pemerintah `.gov`, `.go.id`, `.europa.eu`, …), `reputable` (media/lembaga tepercaya), `community` (blog, forum, lainnya). Platform sosial (Instagram/TikTok/Facebook/X/YouTube) tidak diambil.
- **Keyakinan (bisa dijelaskan):** resmi 90–99 · 2+ sumber tepercaya 75 · 1 tepercaya 55 · komunitas 30/45/55 (1/2/3+ domain independen). Domain yang sama tidak dihitung dua kali; bukti yang menyanggah menurunkan skor.
- **Status:** `accepted` hanya bila ada sumber resmi (atau ditetapkan admin) · `disputed` = tampil publik berlabel **"belum resmi"** (keyakinan ≥ 55 atau bersaing dengan nilai resmi) · `proposed` = terlalu lemah, disembunyikan.
- **Tidak pernah dipercaya tanpa bukti:** klaim tanpa kutipan yang cocok dengan teks halaman, nilai di luar skema, atau kode dokumen asing dibuang otomatis.
- **Admin menang:** `/admin/claims` untuk menetapkan *Resmi*, *Tolak*, atau mengembalikan ke *Otomatis*.
- **Tampil di:** `/whv` (syarat WHV + kesiapan pengguna yang login) dan bagian "Syarat" pada `/beasiswa/[slug]`.

Uji kering satu agen (tidak menulis; menampilkan `preview` klaim): 
```bash
curl -s -X POST "https://<domain>/api/ingest/run?slug=research-whv-462&dry_run=1" -H "Authorization: Bearer $CRON_SECRET"
```
Jadwal mingguan: seperti §4 dengan `?group=research`.

Hasil dry-run memuat `errors` (galat per tahap, mis. `ekstrak homeaffairs.gov.au: timeout`) dan `timingsMs` (total waktu cari/baca/ekstrak). Satu kueri/halaman yang gagal atau timeout dilewati dan dicatat; run tetap selesai dengan hasil sebagian (`partial: true` bila waktu habis). Bila `extract` selalu timeout, coba model lain lewat environment `OPENROUTER_MODEL`.

**Mesin riset v2 (akurasi & panduan akhir).** Alur: cari (query `site:` ke domain resmi, query berkala `recency`, dan `seed_urls` halaman resmi utama) → baca halaman paralel → ekstraksi (prompt `claims-v2`: model juga melaporkan apakah halaman tentang subjek, berlaku untuk Indonesia, tanggal pembaruan yang dikutip persis, dan apakah usang; halaman usang/negara lain dilewati) → **pemeriksa fakta** (`verify.ts`: membuang klaim yang tidak didukung kutipan, bukan untuk Indonesia, usang, atau bertentangan dengan sumber resmi lebih baru) → keputusan status. Bukti dari halaman yang diperbarui >2 tahun lalu tidak dihitung; bila dua nilai resmi sama kuat, yang halamannya lebih baru menang. Bidang proses (`process.application_mode` = ballot/open, `process.ballot`, `process.step`, `process.timeline`, `fee.application`, `condition.stay`) ikut diekstrak. Terakhir, **panduan** (`brief.ts`) disusun dari klaim `accepted`/`disputed`: tiap butir wajib merujuk klaim (butir tanpa rujukan dibuang), klaim `disputed` hanya muncul di "Yang belum pasti". Panduan disimpan di `subject_briefs` dan hanya disusun ulang bila klaim berubah.

- Dry-run kini memuat `pages` (dibaca/dilewati + alasan + tanggal pembaruan), `claims` (semua klaim + status), `dropped` (dibuang pemeriksa fakta), dan `guide` (panduan akhir).
- `?reset=1` (bukan dry-run) menghapus klaim hasil sistem subjek itu lalu membangunnya ulang; keputusan admin tidak disentuh. Pakai sekali setelah pembaruan mesin untuk membuang klaim usang lama.


## 7. Riset otomatis semua beasiswa & program (`opportunity_research`)
Sumber `research-opportunities` memilih peluang yang jatuh tempo (belum pernah diriset → tenggat terdekat → jadwal rutin), menyusun rencana riset otomatis (domain resmi dari URL resmi/situs penyelenggara, halaman resmi sebagai benih, kueri Inggris + Indonesia termasuk `site:` dan berita setahun terakhir), menjalankan mesin riset, lalu **menerapkan fakta resmi ke listing**: tenggat (WIB, jam pasti bila tertulis), status buka/tutup/segera, pendanaan, jenjang, status verifikasi (≥3 fakta resmi → "Terverifikasi"), dan jadwal kalender (dengan tautan sumber). Semua perubahan tercatat di `opportunity_changes`. Penyesuaian per peluang (kueri, domain resmi, benih) disimpan di `research_subjects.config`; `enabled = false` menghentikan riset untuk peluang itu.

```bash
# uji satu peluang tanpa menulis (lihat research.claims, research.guide, applied)
curl -s -X POST "https://<domain>/api/ingest/run?slug=research-opportunities&opportunity=chevening-indonesia&dry_run=1" -H "Authorization: Bearer $CRON_SECRET"
# jalankan sungguhan untuk satu peluang
curl -s -X POST "https://<domain>/api/ingest/run?slug=research-opportunities&opportunity=chevening-indonesia" -H "Authorization: Bearer $CRON_SECRET"
```
Agen riset per-beasiswa lama (`research-chevening`, `research-lpdp`, `research-aas`, `research-gks`) dijeda karena digantikan sumber ini.

## 8. Agen penemu (`discovery_agent`)
`discover-scholarships` dan `discover-programs` mencari program BARU (kueri digilir 4 per run; `{year}`/`{next}` diganti otomatis), membaca halaman beserta tautannya, lalu AI mengusulkan kandidat yang wajib membawa kutipan dari halaman dan nomor tautan resmi dari daftar tautan halaman. Kandidat yang duplikat dengan peluang yang ada dibuang; tautan resmi dibuka dan harus menyebut nama programnya (✓). Hasil masuk **`/admin/temuan`** berurut skor: *Setujui & riset otomatis* (membuat organisasi + peluang "perlu ditinjau" dan menjadwalkan riset segera), *Duplikat*, atau *Tolak*.
```bash
curl -s -X POST "https://<domain>/api/ingest/run?slug=discover-scholarships&dry_run=1" -H "Authorization: Bearer $CRON_SECRET"
```

## 9. Penilaian lowongan untuk WNI (`job_enrichment`)
Saat ingest, teks iklan disimpan privat (`opportunity_texts`, tidak pernah ditampilkan). `enrich-jobs` menilai lowongan yang baru/berubah per 8 lowongan per panggilan: peluang WNI (besar/mungkin/kecil/belum jelas), jalur visa, sponsor, syarat kunci, dan ringkasan Bahasa Indonesia. Kesimpulan tegas wajib berkutipan dari iklan; sinyal deterministik (syarat warga/PR, "no sponsorship", WHV/sponsor disebut) mengoreksi model. Hasil tampil sebagai badge + filter "Hanya yang bisa untuk WNI" di `/lowongan` dan bagian "Untuk pelamar dari Indonesia" di detail lowongan.
```bash
curl -s -X POST "https://<domain>/api/ingest/run?slug=enrich-jobs&dry_run=1" -H "Authorization: Bearer $CRON_SECRET"
```

## 10. Aktivasi & jadwal lengkap
Setelah dry-run tiap sumber bersih:
```sql
update public.sources set status = 'active'
where slug in ('research-whv-462', 'research-dama-au', 'research-opportunities',
               'discover-scholarships', 'discover-programs', 'enrich-jobs');

-- (vault: cron_secret & app_base_url seperti §4)
select cron.schedule('research', '*/20 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/ingest/run?group=research',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 300000);
$$);
select cron.schedule('enrich-jobs', '20 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/ingest/run?group=enrich',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 300000);
$$);
select cron.schedule('discovery', '10 2 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/ingest/run?group=discovery',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 300000);
$$);
```
Satu pemanggilan memproses sumber jatuh tempo sampai batas waktu (240 detik); sisanya diambil pemanggilan berikutnya. Arsitektur & pengaman akurasi: [`ENGINE.md`](./ENGINE.md).

## 11. Penemu career page (`ats_discovery`) dan sumber lowongan tambahan
- `discover-ats-au` (harian, grup `discovery`) mencari board ATS publik (Greenhouse, Lever, Ashby, SmartRecruiters) perusahaan di Australia, dengan fokus wilayah DAMA. Board baru diuji lewat API publiknya: aktif bila ≥50% lowongannya di Australia; draft bila board global; ditolak bila tanpa lowongan Australia. Deskripsi ATS lengkap, jadi label DAMA/sponsor lebih tajam daripada cuplikan Adzuna.
- Sumber Adzuna tambahan: `adzuna-au-dama` (DAMA/482/494) dan `adzuna-{nz,gb,ca,de,nl,sg}-sponsor` (lowongan bersponsor visa, jalur "Luar negeri"). Jalur DAMA tetap hanya diberikan bila iklan menyebut DAMA secara eksplisit.
- Tautan klik Adzuna (`redirect_url`) tidak diambil otomatis: membukanya akan memalsukan klik pada pelacakan Adzuna.

## Pengaman bawaan
- Endpoint hanya menerima `POST` + Bearer `CRON_SECRET` (503 bila secret belum diatur — tidak pernah terbuka).
- Lowongan hilang dari feed ATS → ditutup, **kecuali** >50% hilang sekaligus (dianggap feed parsial; `closeSkipped: true`).
- Feed kosong tidak pernah menutup apa pun.
- Moderasi admin (`is_published`) dan `first_seen_at` tidak tertimpa ingestion.
- Pesan error tidak memuat kunci API (hanya host + status HTTP).
- Fakta hasil AI tanpa kutipan yang cocok dengan halaman tidak pernah disimpan; angka & tanggal wajib tertulis di kutipannya.
- Halaman yang tidak berubah tidak memanggil AI; "terakhir diverifikasi" hanya diperbarui bila isi halaman yang sama pernah disetujui admin.
- Sumber gagal 3× berturut-turut → `failing` (tetap dicoba ulang dengan backoff ≥ 1 jam).

## Keterbatasan yang diketahui
- Data awal 10 beasiswa disusun dari halaman resmi penyelenggara dan berstatus `needs_review` (badge "Menunggu verifikasi") sampai pemantau + admin memverifikasinya. Tanggal LPDP/Chevening berasal dari ringkasan halaman resmi dan belum dicocokkan langsung oleh sistem.
- SmartRecruiters: daftar lowongan tanpa deskripsi, jadi sinyal WHV/sponsor hanya dari judul.
- Pemantau memakai teks halaman utuh (dipotong di `max_chars`); halaman yang kontennya dinamis (jam, hitungan) bisa memicu ekstraksi berulang.
- Pemilihan sumber utama bila satu peluang punya >1 sumber belum ada (semua `is_primary = true`).
- Label `specified_work` (WHV) menunggu tabel postcode Home Affairs.
- Penutupan otomatis belum mempertimbangkan peluang yang punya lebih dari satu sumber.
- Fixture adapter dibuat dari bentuk respons yang didokumentasikan penyedia, belum dicocokkan dengan respons langsung.
