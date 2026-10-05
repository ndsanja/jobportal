# Karir Pro — Rencana Produk & Teknis (v1)

> **Status:** rencana, belum ada kode · **Tanggal:** 5 Oktober 2026
> **Repo:** `ndsanja/jobportal` (privat) · **Supabase:** project `jobportal` (`kmytmtqidmnxtdmrmyfs`), region `ap-southeast-1` (Singapura), Postgres 17, plan Free (org `parelabs`). Saat rencana ini ditulis belum ada tabel, migrasi, maupun edge function.

## 0. Ringkasan

**Bisa, dan stack ini cocok.** Next.js 16 + Bun + Supabase sudah mencakup hampir semua kebutuhan Karir Pro: web app & SEO, login, database, penyimpanan dokumen, keamanan per user (RLS), cron, full-text search (konfigurasi `indonesian` & `english` sudah tersedia di project), sampai vector search untuk rekomendasi. Yang perlu ditambahkan hanya tiga: **worker crawler** (Bun/TypeScript, berjalan di GitHub Actions lalu pindah ke VPS), **AI extraction** (OpenRouter/DeepSeek), dan **email** (Resend). Di tahap ini tidak perlu backend terpisah (Rust/Axum).

Empat prinsip yang membuat data **cepat, akurat, dan (hampir) gratis**:

1. **Sumber terstruktur dulu, AI belakangan.** API resmi, API publik ATS (career page), JSON-LD `JobPosting`, dan CSV pemerintah diproses tanpa AI. AI hanya membaca halaman yang **baru atau berubah**.
2. **Strategi berbeda per jenis data.** Beasiswa & aturan program (WHV, DAMA, G-to-G) jumlahnya sedikit tapi kritis, jadi **dikurasi admin lalu dipantau otomatis**. Lowongan jumlahnya banyak dan cepat basi, jadi **diambil otomatis dan dicek apakah masih buka**.
3. **Tidak pernah mengarang.** Setiap field kritis punya kutipan bukti dari sumber; tanggal perkiraan selalu diberi label "perkiraan"; label "WHV", "DAMA", atau "sponsor visa" hanya berasal dari aturan resmi atau pernyataan eksplisit di iklan.
4. **Matching berbasis aturan (deterministik)**, bukan tebakan AI. Hasilnya selalu bisa dijelaskan: "kenapa direkomendasikan" dan "apa yang masih kurang".

---

## 1. Kelayakan stack

| Kebutuhan | Solusi | Catatan |
|---|---|---|
| Web app, SEO, UI | Next.js 16.3 (App Router, RSC, Server Actions, Turbopack), React 19, Tailwind CSS v4, shadcn/ui | Di Next 16 `middleware.ts` diganti `proxy.ts`; `next lint` dihapus → pakai Biome |
| Package manager, script, test, runtime worker | Bun 1.3 (`bun install`, `bun test`, `bun run ingest`) | Next.js berjalan di runtime Node (default Vercel); Bun untuk install, script, test, dan worker — kombinasi paling stabil |
| Database | Supabase Postgres 17 | FTS `indonesian`/`english`, `pg_trgm`, `unaccent` |
| Login | Supabase Auth: Google + email OTP | `@supabase/ssr` 0.12, verifikasi sesi dengan `getClaims()` |
| Document Vault | Supabase Storage (bucket privat) + RLS per user | akses lewat signed URL berumur pendek |
| Jadwal & antrian | `pg_cron` (job SQL); `pgmq` bila perlu | |
| Notifikasi in-app | tabel `notifications` + Supabase Realtime | |
| Rekomendasi semantik (fase lanjut) | `pgvector` 0.8 (tersedia) | |
| Crawler / ingestion | Worker Bun di **GitHub Actions** (repo privat: 2.000 menit/bulan) → VPS kecil saat produksi | Edge Functions Supabase berjalan di Deno, CPU 2 detik/request, tanpa headless browser → hanya untuk tugas kecil |
| AI | OpenRouter (`deepseek/deepseek-v4.1-flash`), output JSON + validasi Zod | |
| Email | Resend (gratis 3.000 email/bulan) | |

**Batasan yang perlu diketahui**
- **Supabase Free:** DB 500 MB, storage 1 GB, 50k MAU, project **di-pause setelah 7 hari tanpa aktivitas**, tanpa backup → **upgrade ke Pro ($25/bulan) saat launch**.
- **Vercel Hobby tidak boleh dipakai komersial** → saat monetisasi pakai Vercel Pro ($20/bulan) atau self-host di VPS.
- **GitHub Actions:** jadwal cron bisa telat beberapa menit, dan workflow terjadwal **otomatis nonaktif jika repo publik 60 hari tanpa aktivitas**. Jika repo dijadikan privat, kuota gratisnya 2.000 menit/bulan.
- **Edge Functions:** wall-clock 150 detik (Free) / 400 detik (Pro), CPU 2 detik per request, memori 256 MB.

---

## 2. Sumber data — Source Registry v1

**Metode:** `API` · `ATS` (API publik career page) · `JSON-LD` (schema.org JobPosting di halaman) · `CSV` · `MONITOR` (pantau perubahan halaman HTML/PDF lalu ekstraksi) · `DEEPLINK` (hanya tombol "Cari di …", tanpa scraping). Semua gratis kecuali disebut lain.

### 2.1 WHV Australia (subclass 462)

| Sumber | Data | Metode | Catatan |
|---|---|---|---|
| Home Affairs — halaman visa 462 | Syarat: umur, pendidikan, bahasa Inggris, dana, dokumen | MONITOR → knowledge base dikurasi | sumber kebenaran syarat |
| Home Affairs — *WHM latest news* & *status of country caps* | Status kuota Indonesia & **ballot** | MONITOR harian | menjadi fitur **WHV Ballot Tracker** |
| Home Affairs — *specified work* + daftar postcode | Industri & wilayah yang dihitung untuk visa tahun ke-2/ke-3 | MONITOR/PDF → tabel `au_postcode_zones` | dasar badge "Specified work ✅" |
| Ditjen Imigrasi (SDUWHV) | Pengumuman surat dukungan | MONITOR | relevan selama masa transisi ke ballot |
| Fair Work Ombudsman (pay guide, *Working the Harvest Trail*) | Upah minimum per award | dikurasi | info "upah wajar", mencegah underpaid |
| Adzuna API (AU) | Lowongan farm, packing, hospitality, cleaning, warehouse | API | gratis 25/menit, 250/hari, 2.500/bulan; **pemakaian komersial butuh lisensi setelah masa trial**; wajib atribusi |
| Jooble API (AU) | idem | API | key gratis atas permintaan, limit per key, deskripsi terpotong → tautkan ke sumber |
| Career page employer (resort, hotel, agribisnis, ski resort, taman nasional) | Lowongan resmi | ATS / JSON-LD | paling akurat |
| Workforce Australia, SEEK, Indeed, Jora, Backpacker Job Board, Gumtree | — | DEEPLINK | ToS umumnya melarang scraping |

**Aturan label lowongan WHV**
- `whv_explicit`: iklan menyebut working holiday/backpacker/88 hari/visa tahun ke-2 → "Cocok untuk WHV".
- `whv_likely`: kerja kasual/musiman di sektor yang umum untuk WHV → "Kemungkinan cocok".
- `whv_unsuitable`: mensyaratkan PR/citizen/security clearance → disembunyikan dari daftar WHV.
- `specified_work`: dihitung dari **postcode + industri** sesuai daftar Home Affairs, bukan dari AI.

> **Kabar penting (per Oktober 2026, dari sumber sekunder yang mengutip Home Affairs — wajib dicek ulang di halaman resmi):** Australia mengumumkan sistem **ballot** untuk WHV Indonesia (kuota 5.000 visa pertama per tahun). Kuota tahun program 2026–27 dilaporkan sudah terisi per 18 Agustus 2026, tanggal pendaftaran ballot belum diumumkan, dan persyaratan SDUWHV akan dihapus setelah ballot berjalan. Notifikasi "ballot sudah dibuka" bisa menjadi magnet user pertama Karir Pro.

### 2.2 DAMA Australia

| Sumber | Data | Metode |
|---|---|---|
| Home Affairs — halaman DAMA | Daftar DAMA (13 per April 2026) + Designated Area Representative (DAR) | MONITOR |
| Website 13 DAR | Daftar okupasi, konsesi (mis. umur hingga 55, bahasa Inggris, gaji — bervariasi per DAMA), proses endorsement | MONITOR/PDF → AI extraction → review admin → `dama_occupations` |
| Adzuna / Jooble | Lowongan di wilayah DAMA dengan kata kunci "DAMA", "visa sponsorship", "482", "494" + nama okupasi dari daftar DAMA | API |
| Career page employer besar di wilayah DAMA (pengolahan daging, aged care, hospitality NT/FNQ, jasa tambang) | Lowongan resmi | ATS / JSON-LD |

**Aturan label (jujur)**
- `dama_explicit` — iklan menyebut DAMA → label **"DAMA"**.
- `sponsorship_mentioned` — iklan menyebut sponsor visa dan lokasinya di wilayah DAMA → "Sponsor visa · wilayah DAMA".
- `dama_occupation_match` — okupasi ada di daftar DAMA tetapi iklan tidak menyebut sponsor → "Berpotensi DAMA — tanyakan ke employer".

Daftar employer pemegang *labour agreement* DAMA umumnya tidak dipublikasikan, jadi Karir Pro tidak boleh mengklaim "pasti DAMA" tanpa pernyataan dari employer atau DAR.

### 2.3 Kerja profesional (Australia & global)

| Sumber | Data | Metode | Catatan |
|---|---|---|---|
| ATS publik: Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee, Personio | Lowongan resmi perusahaan | ATS | tanpa auth; cukup daftar `perusahaan → jenis ATS + slug` (bisa dideteksi otomatis dari HTML career page) |
| Career page lain | `JobPosting` JSON-LD | JSON-LD | tanpa AI |
| Adzuna / Jooble (AU, UK, DE, NL, NZ, CA, SG, …) | Discovery | API | |
| Jerman — API Jobsuche Bundesagentur für Arbeit (data yang juga dipakai *Make it in Germany*) | Lowongan Jerman | API | didokumentasikan komunitas (bund.dev), cek ketentuan |
| UK — *Register of licensed sponsors: workers* (GOV.UK) | Perusahaan yang boleh menyponsori visa | CSV (diperbarui harian) | badge "Sponsor terdaftar 🇬🇧" |
| Belanda — IND *public register* (recognised sponsors) | idem | MONITOR | badge "Recognised sponsor 🇳🇱" |
| Kanada — Job Bank open data + daftar employer LMIA positif (open.canada.ca) | Lowongan + riwayat sponsor | CSV | |
| AS — USCIS H-1B Employer Data Hub | Riwayat sponsor H-1B | CSV | **USAJOBS tidak relevan** (hampir semua posisinya mensyaratkan kewarganegaraan AS) |
| JSearch (RapidAPI) | Agregasi Google for Jobs | API **berbayar** | opsi fase lanjut jika butuh cakupan luas dengan cepat |
| LinkedIn, Indeed, SEEK | — | DEEPLINK | tanpa scraping |

### 2.4 Kerja luar negeri (program resmi Indonesia & lamar langsung)

| Sumber | Data | Metode | Catatan |
|---|---|---|---|
| KP2MI — **SISKOP2MI** (siskop2mi.bp2mi.go.id) | ±289 ribu lowongan luar negeri resmi (2026): kesehatan, manufaktur, hospitality, konstruksi, ABK, dll. | **spike** di Fase 1: cek akses publik & ToS | idealnya kerja sama data resmi |
| KP2MI — daftar P3MI berizin | Verifikasi agensi | MONITOR/CSV | badge "Agensi berizin ✅" + halaman **Cek Agensi** (anti-penipuan) |
| Program pemerintah: Korea EPS (jadwal EPS-TOPIK), Jepang (IJEPA perawat/caregiver; SSW/*Tokutei Ginou* lewat IPKOL Kemnaker & P3MI), Jerman (program perawat), G-to-P AS | Syarat & jadwal | MONITOR → peluang jenis `program` + timeline | |
| Kapal pesiar: career site cruise line + manning agency resmi di Indonesia | Lowongan & jalur rekrutmen | dikurasi | izin agensi dicek ke daftar resmi regulator |
| Jaringan hotel global (Marriott, Hilton, Accor, IHG, Hyatt, dll.) | Lowongan resmi | ATS / JSON-LD | |
| EURES | Lowongan Eropa | prioritas rendah | mayoritas untuk warga EU/EEA; tidak ada API publik |

### 2.5 Beasiswa (yang populer di Indonesia)

**Strategi:** admin mengkurasi ±30–40 program inti (1–2 hari kerja), lalu sistem memantau halaman resminya. Saat halaman berubah → AI mengusulkan perubahan field (dengan kutipan bukti) → admin menyetujui → user yang menyimpan program itu mendapat notifikasi.

| Program | Sumber resmi | Catatan |
|---|---|---|
| LPDP | lpdp.kemenkeu.go.id (jadwal, booklet PDF, daftar PT tujuan) | multi-tahap per batch |
| Australia Awards (AAS) | australiaawardsindo.or.id | situs khusus Indonesia |
| Erasmus Mundus | Katalog Erasmus Mundus (Erasmus+/EACEA) → website tiap program | ratusan program dengan deadline masing-masing (umumnya Okt–Jan) → ekstraksi AI massal sekali per siklus |
| DAAD | DAAD scholarship database + DAAD Jakarta | cek ToS database |
| Chevening | chevening.org | |
| UK lainnya | Beasiswa universitas, GREAT Scholarships | cek negara peserta setiap tahun |
| Fulbright | AMINEF (aminef.or.id) | kebijakan AS sedang dinamis → SLA verifikasi lebih ketat |
| Belanda | Study in NL (Nuffic), NL Scholarship, excellence scholarship kampus | |
| Korea — GKS | studyinkorea.go.kr (NIIED) | jalur Embassy vs University |
| Türkiye Bursları | turkiyeburslari.gov.tr | |
| Fase 2 | MEXT, Stipendium Hungaricum, Manaaki NZ, beasiswa kampus top | |

Catatan akurasi: **Commonwealth Scholarship tidak terbuka untuk WNI** (Indonesia bukan anggota Commonwealth), jadi tidak dimasukkan.

### 2.6 Komunitas — hanya untuk discovery
Instagram, Telegram, TikTok, Reddit, grup WA, dan kiriman user masuk ke **tip inbox** admin → dicari sumber resminya → baru dipublikasikan. Tidak pernah tampil langsung.

### 2.7 Etika & aspek legal crawling
- Hormati robots.txt & ToS; rate limit per domain (≥2–5 detik/request); User-Agent berisi kontak; gunakan `ETag`/`If-Modified-Since`.
- Simpan fakta terstruktur + ringkasan pendek + tautan sumber, bukan salinan deskripsi penuh.
- Patuhi kewajiban atribusi API (Adzuna, Jooble).

---

## 3. Arsitektur

```
 Sumber (API · ATS · JSON-LD · CSV · HTML/PDF)
                 │
                 ▼
 ┌──────── Worker Bun (GitHub Actions → VPS) ────────┐
 │ jadwal → fetch → deteksi perubahan → parse         │
 │ → AI extract (hanya jika berubah) → normalisasi    │
 │ → dedupe → verifikasi & skor → publish / review    │
 └───────────────────────┬────────────────────────────┘
                         │ secret key (server-only)
                         ▼
 ┌────────────────────── Supabase ─────────────────────┐
 │ Postgres 17 · RLS · Auth · Storage · Realtime        │
 │ pg_cron: tutup otomatis lewat deadline, tandai basi, │
 │          buat notifikasi                              │
 └───────────────────────┬─────────────────────────────┘
                         │ publishable key + sesi user
                         ▼
        Next.js 16 — web Karir Pro (Vercel)
        halaman publik di-cache · data user dinamis
        worker → POST /api/revalidate setelah data berubah
```

### 3.1 Pipeline ingestion (per run sumber)
1. **Jadwal** — `bun run ingest --due` mengambil sumber yang `next_run_at`-nya sudah lewat.
2. **Fetch** — conditional GET dan rate limit per domain; snapshot teks bersih (gzip) disimpan ke Storage.
3. **Deteksi perubahan** — hash teks bersih. Jika tidak berubah, cukup perbarui `last_checked_at`/`last_verified_at`. **Biaya AI = 0.**
4. **Parse** — adapter terstruktur (API/ATS/JSON-LD/CSV) langsung ke normalisasi; HTML/PDF tak terstruktur diteruskan ke AI.
5. **AI extraction** — output JSON sesuai skema; tiap field kritis (deadline, batas umur, skor bahasa, pendanaan) wajib menyertakan `evidence` (kutipan persis). Validator memastikan kutipan itu benar-benar ada di teks sumber; jika tidak, field dikosongkan dan masuk review.
6. **Normalisasi** — negara ISO-2, tanggal ISO + zona waktu, mata uang, jenjang studi, kategori.
7. **Dedupe** — `dedupe_key` (organisasi + judul + negara + kota) + kemiripan trigram; sumber dengan otoritas tertinggi menjadi *primary*, sumber lain dicatat di `opportunity_sources`.
8. **Verifikasi & skor** — hitung confidence. Jika field kritis berubah atau confidence di bawah ambang → **antrian review**; selain itu terbit otomatis.
9. **Publish** — upsert, catat diff di `opportunity_changes`, revalidate cache Next.js, buat notifikasi untuk user yang menyimpan.
10. **Cek "masih buka"** — lowongan ATS yang hilang dari feed → `closed`; tautan lowongan agregator dicek berkala; lewat deadline → `closed` (pg_cron).

**Frekuensi awal:** lowongan API/ATS tiap 6–24 jam · halaman aturan WHV/DAMA harian · halaman beasiswa harian saat periode buka, mingguan di luar itu · register sponsor mingguan · pengiriman notifikasi tiap jam.

### 3.2 Confidence & badge
- Skor dasar sesuai otoritas: pemerintah 95 · penyelenggara beasiswa/universitas 90 · employer 85 · agregator 65 · komunitas 40.
- Faktor metode: API/ATS/JSON-LD/CSV ×1,0 · HTML + AI dengan bukti tervalidasi ×0,9.
- +5 bila ≥2 sumber sepakat; turun bila melewati SLA verifikasi.
- Badge: 🟢 Terverifikasi · 🟡 Dari agregator · ⚠️ Perlu verifikasi ulang (lewat SLA: lowongan 7 hari; beasiswa 30 hari, atau 7 hari bila deadline < 60 hari; aturan program 7 hari) · 🔴 Ditutup.

### 3.3 Struktur repo (satu paket Bun, tanpa monorepo)
```
jobportal/
├─ src/
│  ├─ app/              # route (lihat §8)
│  ├─ components/       # UI (shadcn/ui)
│  ├─ features/         # explore, profile, vault, plan, timeline, admin
│  ├─ domain/           # TS murni, dipakai web & worker: tipe, skema Zod,
│  │                    #   evaluator syarat, skor, util tanggal
│  ├─ lib/supabase/     # server.ts, client.ts, admin.ts, database.types.ts
│  └─ proxy.ts          # refresh sesi Supabase (pengganti middleware di Next 16)
├─ ingest/
│  ├─ cli.ts            # bun run ingest --due | --source=<slug>
│  ├─ adapters/         # greenhouse, lever, ashby, smartrecruiters, jsonld, adzuna,
│  │                    #   jooble, ba-jobsuche, csv-register, html-monitor, pdf
│  ├─ pipeline/         # fetch, change-detect, extract-ai, normalize, dedupe, verify, publish
│  └─ __fixtures__/     # respons tersimpan untuk test
├─ supabase/
│  ├─ migrations/       # SQL = sumber kebenaran skema
│  └─ seed/             # countries, document_types, tracks, sources, step_templates
├─ .github/workflows/   # ci.yml, ingest.yml (cron), notify.yml (cron)
└─ docs/PLAN.md
```

### 3.4 Catatan Next.js 16 + Supabase
- `src/proxy.ts` me-refresh sesi; halaman privat dicek dengan `supabase.auth.getClaims()`.
- `cacheComponents: true`: halaman publik (daftar, detail, kalender) memakai `"use cache"` + `cacheTag("opp:<id>")`/`cacheLife`; worker memanggil `POST /api/revalidate` (dengan secret) → `revalidateTag(tag, "max")`. Data user (rencana, readiness) dirender dinamis di dalam `<Suspense>`.
- Di dalam scope `"use cache"` cookies tidak boleh dibaca, jadi data publik diambil dengan client Supabase tanpa sesi (publishable key).
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (server/worker saja), `OPENROUTER_API_KEY`, `ADZUNA_APP_ID`/`ADZUNA_APP_KEY`, `JOOBLE_API_KEY`, `RESEND_API_KEY`, `REVALIDATE_SECRET`. Semua secret hanya disimpan di env Vercel dan GitHub Actions secrets.

---

## 4. Model data (Supabase)

Semua tabel: PK `uuid`, `created_at`/`updated_at`, **RLS aktif**.

**Referensi**
- `countries`, `tracks` (`whv_au`, `dama_au`, `professional`, `overseas`, `scholarship`), `categories`
- `document_types` — paspor, KTP, KK, akta lahir, ijazah, transkrip, terjemahan tersumpah, IELTS/TOEFL/PTE, CV, motivation letter, surat rekomendasi, SKCK, medical check-up, rekening koran, sertifikat (RSA, White Card, First Aid), dll.
- `au_postcode_zones` (regional/northern/remote), `dama_regions`, `dama_occupations` (okupasi + konsesi)

**Ingestion**
- `sources` — slug, nama, `kind`, `authority`, `trust_score`, track, negara, `config` jsonb (endpoint/slug/selector), jadwal, `next_run_at`, status, catatan ToS & atribusi
- `source_pages` — url, `content_hash`, etag, `last_fetched_at`, `last_changed_at`, `snapshot_path`
- `ingest_runs` — statistik & error per run
- `extractions` — output AI, model, versi prompt, confidence, status review
- `tips` — kiriman komunitas

**Peluang**
- `organizations` — jenis, negara, website, logo, `verification` jsonb (izin P3MI, UK sponsor, IND, LMIA, …)
- `opportunities` — `kind` (`job` | `scholarship` | `program`), `tracks[]`, judul, slug, organisasi, negara[], kota, remote, kategori, `summary_id` (ringkasan Bahasa Indonesia), gaji/pendanaan, jenjang, bidang, bahasa, **`apply_url`**, **`official_url`**, `published_at`, `opens_at`, `closes_at`, `is_rolling`, `status`, `verification_status`, `confidence`, **`last_verified_at`**, `attributes` jsonb (`whv_signal`, `specified_work`, `dama_signal`, `visa_sponsorship`), `evidence` jsonb, `search` tsvector
- `opportunity_sources` — lineage: sumber, url, `external_id`, `first_seen_at`, `last_seen_at`, `is_primary`
- `opportunity_cycles` — siklus/intake (mis. "2027/28"), status, `is_estimated`
- `opportunity_events` — buka/tutup/tes/wawancara/pengumuman/ballot; tanggal mulai–selesai, presisi, `is_estimated`, sumber → **kalender beasiswa & program**
- `requirements` — milik **track** atau **opportunity**; `kind`, `rule` jsonb, label, wajib/opsional, `source_url` + `quote`, `last_verified_at`
- `opportunity_changes` — field, nilai lama → baru, waktu, sumber ("Deadline berubah: 30 Nov → 15 Des")

**User**
- `profiles` — tanggal lahir, kota, pendidikan, bidang, pengalaman, level bahasa Inggris, negara tujuan[], track[], target berangkat, status onboarding
- `profile_educations`, `profile_experiences`, `profile_certifications`
- `user_documents` — jenis, status (punya/sedang diurus/belum), `file_path` (opsional), tanggal terbit & kedaluwarsa, `fields` jsonb (mis. skor IELTS), asal isian (manual/AI), sudah dikonfirmasi user
- `goals` — mis. "Rencana WHV Australia 2027": track, negara, target tanggal
- `plan_items` — goal, peluang, `stage` (disimpan → persiapan → siap daftar → sudah daftar → wawancara → diterima/ditolak), catatan, pinned, cache readiness
- `tasks` — judul, `due_date`, `done_at`, asal (template/syarat/custom), jenis dokumen
- `step_templates` — langkah per track + durasi tipikal + dependensi (bahan generator timeline)
- `saved_searches`, `notifications`, `push_subscriptions`
- `partners`, `partner_offers` (target `gap_type`: english, cv, rsa, translation, …), `cta_events` (impresi/klik)

**RLS & Storage**
- Peluang & referensi: `select` publik (hanya yang sudah terbit); tulis hanya oleh worker (secret key) & admin.
- Data user: `user_id = (select auth.uid())`. Admin: klaim `app_metadata.role = 'admin'`.
- Bucket `user-documents` privat, path `{user_id}/{document_id}.{ext}`, maks 10 MB, MIME pdf/jpg/png/webp; policy `(storage.foldername(name))[1] = auth.uid()::text`.
- Ekstensi: `pg_trgm`, `unaccent`, `pg_cron` (Fase 1) · `vector` (Fase 4).
- Hemat kuota Free 500 MB: simpan ringkasan (bukan deskripsi penuh) dan arsipkan lowongan yang tutup > 90 hari.

---

## 5. Profil, Matching, Checklist & Timeline

### 5.1 Requirement Matrix
Syarat disimpan sebagai aturan yang bisa dievaluasi mesin. Contoh **format** (angka hanya ilustrasi; nilai asli diambil dari sumber resmi beserta kutipannya):

```json
{ "kind": "age",         "rule": { "min": 18, "max": 30, "at": "application_date" } }
{ "kind": "english",     "rule": { "any_of": [{ "test": "IELTS", "overall": 4.5 }] } }
{ "kind": "document",    "rule": { "doc_type": "passport", "valid_months_after": 6 } }
{ "kind": "certificate", "rule": { "cert": "RSA" } }
{ "kind": "funds",       "rule": { "amount": 5000, "currency": "AUD" } }
```

Evaluator (TypeScript murni di `src/domain`, diuji dengan `bun test`) menghasilkan status per syarat: **terpenuhi** · **belum** · **belum diketahui** · **akan kedaluwarsa** · **cek manual**. Syarat level track (mis. syarat visa WHV) otomatis berlaku untuk semua lowongan WHV; syarat level lowongan (RSA, pengalaman) ditambahkan di atasnya.

### 5.2 Readiness & rekomendasi
- **Readiness** = seberapa siap user mendaftar (bobot syarat wajib yang terpenuhi). Contoh: "WHV Australia — 82% siap · 3 hal perlu dilengkapi".
- **Rekomendasi** = filter keras (umur, kewarganegaraan, track/negara) → ranking (kecocokan kategori & pengalaman, readiness, kesegaran data, confidence) → alasan: "✓ negara tujuanmu ✓ cocok WHV ✓ umur ✓ dokumenmu".
- Fase 4: embedding (pgvector) untuk kemiripan semantik judul/skill.

### 5.3 Rencana (bookmark yang "hidup") & checklist gabungan
- Tombol **"Tambah ke Rencana"** memasukkan peluang ke sebuah goal (mis. "WHV Australia 2027") sebagai kartu kanban dengan stage.
- Checklist per goal = gabungan syarat track + semua peluang di rencana, di-dedupe per jenis dokumen: "Sudah punya: Paspor, CV · Kurang: IELTS, SKCK, sertifikat RSA" + "dipakai oleh: WHV, Hotel Staff Tasmania".
- Tiap kekurangan menampilkan: (a) panduan cara mendapatkannya, (b) tombol isi/unggah di Vault, (c) **CTA partner sesuai gap** — bahasa Inggris kurang → **PareLabs**; terjemahan → penerjemah tersumpah; RSA/White Card → kursus. Semua CTA dicatat di `cta_events` untuk mengukur konversi.

### 5.4 Timeline & countdown
- User menetapkan target (mis. berangkat Januari 2027) atau mem-pin peluang yang punya deadline → generator menjadwal mundur dari `step_templates` dan menandai **risiko** bila waktunya tidak cukup (mis. persiapan IELTS butuh 8 minggu, deadline tinggal 3 minggu).
- Event resmi (`opportunity_events`) otomatis masuk timeline; tanggal perkiraan selalu diberi label.
- Widget countdown + **feed kalender ICS pribadi** (bisa di-subscribe dari Google Calendar).

### 5.5 Notifikasi
- Kanal: in-app (Realtime) + email (Resend) + web push (PWA); WhatsApp/Telegram menyusul.
- Pemicu: peluang baru yang cocok dengan alert · deadline H-30/H-7/H-1 · data berubah pada item yang disimpan · dokumen kedaluwarsa sebelum target · **ballot WHV dibuka**.

---

## 6. Document Vault & privasi (UU PDP No. 27/2022)
- **Default tanpa upload:** user cukup mencentang "punya paspor, berlaku s/d …" — matching tetap berjalan.
- Upload bersifat opsional ke bucket privat. "Isi otomatis dengan AI" hanya dengan **persetujuan eksplisit per dokumen**; hanya field yang diperlukan yang diambil (paspor: tanggal kedaluwarsa & kewarganegaraan, nomor paspor tidak disimpan); hasil AI wajib dikonfirmasi user.
- SKCK (catatan kejahatan), rekening koran (keuangan), dan medical check-up (kesehatan) termasuk **data pribadi spesifik** → persetujuan tegas, enkripsi, log akses, hapus/ekspor kapan saja, kebijakan retensi. Siapkan Kebijakan Privasi & DPIA sebelum fitur upload dibuka untuk publik.
- Ungkapkan transfer lintas negara: data disimpan di Singapura (Supabase `ap-southeast-1`) dan diproses AI di luar negeri.

---

## 7. AI (OpenRouter)
**Dipakai untuk:** (1) ekstraksi halaman HTML/PDF yang berubah, (2) ringkasan Bahasa Indonesia — beasiswa/program saat terbit, lowongan secara *lazy* saat dibuka/disimpan, (3) ekstraksi dokumen user (opsional, dengan izin).

**Teknik:** output JSON Schema + validasi Zod · `evidence` per field + validasi kutipan · retry 1× lalu review admin · model dipin per versi.

**Model (diputuskan):** OpenRouter **`deepseek/deepseek-v4.1-flash`** — ±$0,15 / $0,60 per 1 jt token input/output (cek ulang di OpenRouter). Untuk 600 ekstraksi/bulan (10 rb input + 2 rb output) ≈ **$1,6/bulan**. Output selalu divalidasi Zod + validator kutipan; versi model dipin dan dicatat di `extractions`. Dokumen pribadi user tidak dikirim ke model kecuali dengan persetujuan eksplisit (Fase 4). Detail di `docs/DATA-SOURCES.md` §10b.

---

## 8. Halaman & navigasi

| Rute | Isi |
|---|---|
| `/` | Pencarian, deadline terdekat, rekomendasi (jika login) |
| `/whv` | Syarat WHV + readiness, status kuota/ballot, panduan specified work, lowongan WHV (filter negara bagian, industri, specified work) |
| `/dama`, `/dama/[wilayah]` | 13 wilayah, okupasi & konsesi, lowongan bersponsor |
| `/kerja` | Lowongan profesional (filter negara, kategori, sponsor visa) |
| `/luar-negeri`, `/cek-agensi` | Program resmi (G-to-G, EPS, SSW), lowongan hotel/kapal pesiar/dll., verifikasi agensi P3MI |
| `/beasiswa`, `/beasiswa/kalender` | Daftar + kalender (tampilan bulan/agenda), filter negara, jenjang, pendanaan |
| `/lowongan/[slug]`, `/beasiswa/[slug]`, `/program/[slug]` | Detail: fakta kunci, status & countdown, matriks syarat (+ readiness user), **sumber resmi**, **tombol daftar resmi**, terakhir diverifikasi, confidence, riwayat perubahan, "Tambah ke Rencana" |
| `/onboarding` | Profile Builder bertahap: tujuan → negara & target waktu → data dasar → dokumen yang sudah dimiliki |
| `/saya/{profil,dokumen,rencana,timeline,notifikasi}` | Ruang personal |
| `/admin/*` | Sumber & run, antrian review, editor peluang/program, tip inbox, partner & CTA |

**Mesin SEO:** halaman evergreen per program (mis. `/beasiswa/lpdp`) selalu menampilkan status siklus terbaru + countdown + tombol "Ingatkan saya". Halaman ini menangkap pencarian seperti "LPDP 2027 kapan dibuka" dan mengubahnya menjadi user terdaftar.

---

## 9. Roadmap

**Fase 0 — Fondasi (±1 minggu)**
- Scaffold `bunx create-next-app@latest` (Next 16, TypeScript, Tailwind v4, App Router, `src/`, Biome) + shadcn/ui + Zod.
- Supabase: `@supabase/ssr` + `src/proxy.ts`, Auth (Google + email OTP), migrasi awal (referensi, tracks, sources), seed negara & jenis dokumen.
- CI GitHub Actions: `bun install` → Biome → `tsc --noEmit` → `bun test` → `next build`. Deploy preview di Vercel.

**Fase 1 — Mesin data + Explore (±3 minggu)**
- Skema peluang + RLS + full-text search.
- Worker `ingest/` + adapter: Greenhouse, Lever, Ashby, SmartRecruiters, JSON-LD, Adzuna, Jooble, BA Jobsuche, CSV register, HTML monitor + AI extraction, PDF.
- Seed ±30 sumber (§2) + daftar employer target → deteksi ATS otomatis.
- Kurasi 30–40 beasiswa inti + knowledge base WHV & 13 DAMA (dengan kutipan sumber). Spike akses SISKOP2MI.
- Halaman publik §8, pencarian & filter, kalender beasiswa, halaman SEO evergreen.
- Admin: sumber & run, antrian review, editor. `pg_cron`: tutup otomatis & tandai data basi.

**Fase 2 — Profil & Matching (±3 minggu)**
- Onboarding Profile Builder + profil lengkap.
- Document Vault (centang/metadata dulu, upload opsional).
- Requirement Matrix + evaluator + readiness; rekomendasi + alasan.
- Rencana (kanban per goal), checklist dokumen gabungan, CTA partner (PareLabs).

**Fase 3 — Timeline & Notifikasi (±2 minggu)**
- Generator timeline, pin, countdown, feed ICS.
- Notifikasi in-app/email/web push, alert pencarian tersimpan, digest mingguan.
- Notifikasi perubahan data (mis. deadline bergeser) + **WHV Ballot Tracker**.

**Fase 4 — Pertumbuhan & monetisasi**
- AI Document Intelligence (dengan izin), CV builder/analyzer.
- Langganan Pro lewat Midtrans/Xendit (QRIS, VA, e-wallet); employer & P3MI terverifikasi bisa memasang lowongan; featured job.
- Rekomendasi semantik (pgvector), alert WhatsApp/Telegram.
- Kerja sama data (KP2MI, lisensi Adzuna); worker dipindah ke VPS.

---

## 10. Perkiraan biaya

| Komponen | Saat membangun / beta | Saat launch komersial |
|---|---|---|
| Supabase | Free ($0) | Pro $25/bulan (DB 8 GB, storage 100 GB, backup harian, tidak di-pause) |
| Hosting Next.js | Vercel Hobby ($0, non-komersial) | Vercel Pro $20/bulan **atau** VPS ±$5–10/bulan |
| Worker ingestion | GitHub Actions ($0, repo privat: 2.000 menit/bulan) | tetap, atau VPS yang sama |
| AI (DeepSeek via OpenRouter) | ±$2–5/bulan | sesuai volume |
| Email | Resend Free (3.000/bulan) | paket berbayar bila perlu |
| API lowongan | Adzuna/Jooble key gratis (trial) | lisensi Adzuna (negosiasi), JSearch opsional |
| Domain | ±Rp150–400 ribu/tahun | sama |
| **Total** | **±$0–10/bulan** | **±$50–60/bulan** |

---

## 11. Verifikasi & QA
- **Unit test (`bun test`):** evaluator syarat (batas umur, ekuivalensi skor, kedaluwarsa dokumen), parsing tanggal (format Indonesia/Inggris, zona waktu), dedupe, skor confidence, validator kutipan bukti.
- **Adapter test** dengan fixture tersimpan (`ingest/__fixtures__`) — CI tidak memanggil internet.
- **Database:** jalankan Supabase advisors (security & performance) setelah tiap migrasi; uji RLS dengan dua user (user A tidak bisa membaca dokumen user B).
- **E2E (Playwright):** onboarding → simpan peluang → checklist → timeline → notifikasi.
- **Dashboard kualitas data:** % data basi, % confidence rendah, sumber yang gagal, umur antrian review.
- **Audit akurasi mingguan:** sampel 50 peluang dibandingkan dengan sumber resmi; target ≥98% field kritis benar.

---

## 12. Keputusan

**Sudah diputuskan**
- AI: OpenRouter `deepseek/deepseek-v4.1-flash`.
- Repo **privat** → GitHub Actions 2.000 menit/bulan; anggaran job ±1.070 menit (lihat `DATA-SOURCES.md` §10a), pindah ke VPS bila mepet.
- Admin: `ndsanja@gmail.com` (klaim `app_metadata.role = 'admin'`).
- UI: Bahasa Indonesia.

**Masih terbuka**
1. Hosting saat launch: Vercel Pro atau VPS.
2. Kerja sama data: KP2MI (SISKOP2MI) dan lisensi komersial Adzuna.
3. Domain & brand: mis. karirpro.id / .com.

---

## 13. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Struktur situs sumber berubah | Utamakan adapter terstruktur; monitor berbasis hash + AI; alert jika run gagal ≥2× |
| AI salah ekstrak | Kutipan bukti wajib + validasi otomatis + review manusia untuk field kritis |
| Data basi | SLA verifikasi, cek "masih buka", badge ⚠️ |
| Penipuan kerja luar negeri | Hanya sumber resmi/terverifikasi, cek izin P3MI, edukasi "jangan bayar di muka" |
| ToS/legal scraping | API resmi dulu, deeplink untuk situs yang melarang, atribusi |
| Kebocoran dokumen | Bucket privat + RLS + signed URL + minimisasi data + default tanpa upload |
| Kebijakan visa berubah cepat (ballot WHV, kebijakan AS) | Monitor harian halaman resmi + notifikasi perubahan |
| Kuota free tier habis | Simpan ringkasan, arsipkan data lama, upgrade ke Pro saat launch |

---

## Lampiran — sumber riset (dicek 5 Oktober 2026)
- Ballot WHV Indonesia: [Onederland](https://onederland.com.au/indonesia-whv-system-update/), [Asia Pacific Group](https://asiapacificgroup.com/indonesia/working-holiday-visa-australia-for-indonesian-citizens-2026-guide/), [RACC](https://www.racc.net.au/working-holiday-visa-indonesia); halaman resmi untuk verifikasi: [Home Affairs — WHM latest news](https://immi.homeaffairs.gov.au/what-we-do/whm-program/latest-news), [Status of country caps](https://immi.homeaffairs.gov.au/what-we-do/whm-program/status-of-country-caps)
- DAMA: [Home Affairs](https://immi.homeaffairs.gov.au/visas/employing-and-sponsoring-someone/sponsoring-workers/nominating-a-position/labour-agreements/designated-area-migration-agreements), [daftar 13 DAMA 2026](https://oneplanetmigrationlaw.com.au/immigration-blog/dama-regions-australia-list/)
- Adzuna: [Terms of service](https://developer.adzuna.com/docs/terms_of_service), [ringkasan limit](https://jobspipe.dev/answers/how-to-use-adzuna-api) · Jooble: [ringkasan API](https://jobspipe.dev/blog/jooble-api)
- SISKOP2MI: [Investor Trust](https://investortrust.id/national/114968/mau-kerja-aman-di-luar-negeri-pantau-289000-lowongan-resmi-di-portal-siskop2mi), [Antara](https://www.antaranews.com/berita/5529353/kp2mi-catat-ada-258000-lowongan-kerja-tersedia-di-luar-negeri)
- Fair Work: [Working the Harvest Trail](https://horticulture.fairwork.gov.au/working-the-harvest-trail)
- Supabase: [Edge Function limits](https://supabase.com/docs/guides/functions/limits), [SSR Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs), [ringkasan harga 2026](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)
- Versi paket (npm, 5 Oktober 2026): next 16.3.8 · react 19.3.0 · tailwindcss 4.3.3 · @supabase/supabase-js 2.117.2 · @supabase/ssr 0.12.7 · @anthropic-ai/sdk 0.131.0 · Bun 1.3.14
