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

## Pengaman bawaan
- Endpoint hanya menerima `POST` + Bearer `CRON_SECRET` (503 bila secret belum diatur — tidak pernah terbuka).
- Lowongan hilang dari feed ATS → ditutup, **kecuali** >50% hilang sekaligus (dianggap feed parsial; `closeSkipped: true`).
- Feed kosong tidak pernah menutup apa pun.
- Moderasi admin (`is_published`) dan `first_seen_at` tidak tertimpa ingestion.
- Pesan error tidak memuat kunci API (hanya host + status HTTP).
- Fakta hasil AI tanpa kutipan yang cocok dengan halaman tidak pernah disimpan.
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
