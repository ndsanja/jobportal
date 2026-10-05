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

## Pengaman bawaan
- Endpoint hanya menerima `POST` + Bearer `CRON_SECRET` (503 bila secret belum diatur — tidak pernah terbuka).
- Lowongan hilang dari feed ATS → ditutup, **kecuali** >50% hilang sekaligus (dianggap feed parsial; `closeSkipped: true`).
- Feed kosong tidak pernah menutup apa pun.
- Moderasi admin (`is_published`) dan `first_seen_at` tidak tertimpa ingestion.
- Pesan error tidak memuat kunci API (hanya host + status HTTP).
- Sumber gagal 3× berturut-turut → `failing` (tetap dicoba ulang dengan backoff ≥ 1 jam).

## Keterbatasan yang diketahui
- Pemilihan sumber utama bila satu peluang punya >1 sumber belum ada (semua `is_primary = true`).
- Label `specified_work` (WHV) menunggu tabel postcode Home Affairs.
- Penutupan otomatis belum mempertimbangkan peluang yang punya lebih dari satu sumber.
- Fixture adapter dibuat dari bentuk respons yang didokumentasikan penyedia, belum dicocokkan dengan respons langsung.
