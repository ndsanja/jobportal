# Karir Pro — Peta Sumber Data & Cara Mendapatkannya

> Pendamping `docs/PLAN.md`. Dokumen ini menjawab satu pertanyaan: **untuk setiap data yang dibutuhkan alur Karir Pro, datanya diambil dari mana, dengan cara apa, seberapa sering, dan siapa yang memverifikasi.**
> Diperbarui 5 Oktober 2026. Keputusan yang dipakai: hosting **Vercel** (tim `ndsanjas-projects`), scraping halaman sulit lewat **Firecrawl**, AI lewat **OpenRouter `deepseek/deepseek-v4.1-flash`**, repo **privat**, admin **ndsanja@gmail.com**, UI **Bahasa Indonesia**.

---

## 0. Alur yang harus "diberi makan" data

```
DISCOVER                     PREPARE                          APPLY
Explore (WHV/DAMA/Kerja/     Profil → Requirement Matrix →    Rencana (kanban) → Timeline
Luar Negeri/Beasiswa)        Readiness → Checklist dokumen →  → Countdown → Notifikasi
+ Kalender beasiswa          CTA (PareLabs, dll.)             → Tombol daftar resmi
```

Setiap layar di atas butuh data dari **5 lapisan**:

| Lapisan | Contoh data | Asal |
|---|---|---|
| **L1. Peluang** | lowongan, beasiswa, program (WHV, EPS, SSW) | sumber eksternal (§1–§5) |
| **L2. Aturan & syarat** | syarat WHV, konsesi DAMA, syarat beasiswa, syarat lowongan | sumber resmi + ekstraksi (§6) |
| **L3. Referensi pendukung** | jenis dokumen & cara mengurusnya, lama proses, ekuivalensi tes bahasa, kurs, postcode, kode okupasi | sumber resmi Indonesia & negara tujuan (§7) |
| **L4. Data user** | profil, dokumen, rencana, progres | user sendiri (§8) |
| **L5. Data bisnis** | penawaran partner (PareLabs, kursus, penerjemah) | admin (§9) |

Prinsip urutan metode untuk setiap sumber (dari yang paling murah & akurat):

1. **API resmi / API publik ATS** → JSON terstruktur, tanpa AI.
2. **File resmi (CSV/XLSX/PDF tabel)** → parser, tanpa AI.
3. **JSON-LD `JobPosting`** di halaman → parser, tanpa AI.
4. **Sitemap / RSS** → untuk menemukan URL baru.
5. **Pantau halaman HTML (hash)** → AI hanya jika teks berubah.
6. **Kurasi manual oleh admin** → untuk data sedikit tapi kritis.
7. **Deeplink** → kalau ToS melarang pengambilan data (SEEK, Indeed, LinkedIn).

---

## 1. WHV Australia (subclass 462)

### 1a. Aturan & status program (L2)
| Data | Sumber | Cara | Frekuensi | Verifikasi |
|---|---|---|---|---|
| Syarat visa 462 untuk WNI (umur, pendidikan, bahasa Inggris, dana, dokumen, kesehatan) | Home Affairs — halaman *Work and Holiday visa (subclass 462)* | Kurasi awal oleh admin → tersimpan sebagai `requirements` (track `whv_au`) dengan kutipan; halaman dipantau hash | harian | admin menyetujui setiap perubahan |
| Kuota & **ballot** Indonesia (buka/tutup registrasi, biaya, periode seleksi) | Home Affairs — *WHM latest news* & *status of country caps* | Pantau hash → AI mengekstrak event (`opportunity_events`: `ballot_open`, `ballot_close`) | harian | admin; perubahan memicu notifikasi "Ballot WHV dibuka" |
| Surat dukungan SDUWHV (selama masih berlaku) | Ditjen Imigrasi (imigrasi.go.id / pengumuman WHV) | Pantau hash | harian | admin |
| *Specified work* (industri yang dihitung untuk visa tahun ke-2/3) | Home Affairs — halaman *specified work* 462 | Kurasi → tabel `whv_specified_industries` | mingguan | admin |
| Daftar **postcode** regional/northern/remote | Home Affairs (daftar postcode di halaman specified work/regional) | Unduh/parse daftar → `au_postcode_zones` | bulanan | otomatis + cek selisih jumlah baris |
| Lama proses visa | Home Affairs — *global visa processing times* | Pantau → `step_templates` (durasi) | bulanan | admin |

### 1b. Lowongan untuk pemegang WHV (L1)
| Sumber | Cara mendapatkan | Catatan |
|---|---|---|
| **Adzuna API** (`api.adzuna.com/v1/api/jobs/au/search`) | Daftar di developer.adzuna.com → `app_id` + `app_key`. Query per kombinasi *kata kunci WHV* × *negara bagian*: `farm hand`, `fruit picker`, `packer`, `harvest`, `housekeeping`, `kitchen hand`, `barista`, `waiter`, `cleaner`, `labourer`, `working holiday`, `backpacker`, `88 days` | 250 hit/hari cukup untuk ±40 query × 2 halaman/hari. Untuk komersial perlu lisensi (hubungi Adzuna setelah trial). Atribusi "Jobs by Adzuna". |
| **Jooble API** (`POST jooble.org/api/<key>`) | Minta key di jooble.org/api/about; query sama | Deskripsi terpotong → tampilkan ringkasan + tombol ke sumber |
| **Career page employer WHV-friendly** | Admin menyusun daftar ±50 employer (resort di wilayah remote, perusahaan agribisnis besar, ski resort, operator taman nasional, jaringan hotel). Worker mendeteksi ATS-nya (§3) | Paling akurat; lowongan hilang dari feed = tutup |
| **Fair Work pay guides** | Kurasi tabel upah minimum per award (Horticulture, Hospitality, Cleaning) | Ditampilkan sebagai "upah minimum wajar" di halaman lowongan |
| SEEK, Indeed, Jora, Workforce Australia, Backpacker Job Board, Gumtree | **Deeplink** saja: tombol "Cari juga di SEEK" dengan URL pencarian yang sudah diisi kata kunci & lokasi | Tidak di-scrape |

**Cara memberi label otomatis (tanpa menebak):**
- `whv_signal`: dari teks iklan (kata kunci WHV/backpacker/88 days/2nd year visa = `explicit`; kerja kasual/musiman sektor umum = `likely`; "must be citizen/PR" = `unsuitable`).
- `specified_work`: **postcode lowongan × industri** dicocokkan ke tabel resmi (§1a). Postcode diambil dari field lokasi API; jika kosong, geocode kota → postcode (dataset postcode Australia gratis) → jika masih ragu, label tidak ditampilkan.

---

## 2. DAMA Australia

| Data | Sumber | Cara | Frekuensi |
|---|---|---|---|
| Daftar 13 DAMA + DAR + kontak | Home Affairs — halaman *Designated area migration agreements* | Kurasi → `dama_regions` | pantau mingguan |
| Daftar okupasi per DAMA + konsesi (umur, bahasa Inggris, gaji) | Website masing-masing DAR (13 situs; sebagian berupa PDF/XLSX) | Unduh file → parser tabel (PDF/XLSX) bila rapi; jika tidak, AI ekstraksi → admin review → `dama_occupations` (dengan kode ANZSCO) | pantau mingguan |
| Kode & nama okupasi standar | ABS — klasifikasi **ANZSCO/OSCA** | Unduh sekali → `occupations` | tahunan |
| Lowongan di wilayah DAMA | Adzuna/Jooble: lokasi = kota/region DAMA, kata kunci = nama okupasi dari daftar DAMA + "visa sponsorship"/"DAMA"/"482"/"494" | API | harian |
| Lowongan employer besar di wilayah DAMA | Career page (ATS) — daftar disusun admin dari iklan yang menyebut DAMA | ATS/JSON-LD | harian |

**Label:** `dama_explicit` (iklan menyebut DAMA) · `sponsorship_mentioned` (sebut sponsor + wilayah DAMA) · `dama_occupation_match` (okupasi cocok, sponsor tidak disebut → "Berpotensi DAMA, tanyakan ke employer"). Daftar employer pemegang agreement umumnya tidak publik, jadi tidak ada label "pasti DAMA" tanpa bukti.

---

## 3. Kerja profesional (Australia & global)

### 3a. Career page perusahaan lewat API publik ATS (sumber utama, gratis, resmi)
Admin cukup mengisi **nama perusahaan + URL career page**. Worker mendeteksi ATS dari HTML/redirect, lalu memakai endpoint publiknya:

| ATS | Endpoint publik (tanpa auth) | Deteksi dari URL/HTML |
|---|---|---|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | `boards.greenhouse.io`, `job-boards.greenhouse.io` |
| Lever | `api.lever.co/v0/postings/{company}?mode=json` | `jobs.lever.co` |
| Ashby | `api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true` | `jobs.ashbyhq.com` |
| SmartRecruiters | `api.smartrecruiters.com/v1/companies/{id}/postings` | `jobs.smartrecruiters.com` |
| Workable | `apply.workable.com/api/v1/widget/accounts/{subdomain}` | `apply.workable.com` |
| Recruitee | `{company}.recruitee.com/api/offers/` | `*.recruitee.com` |
| Personio | `{company}.jobs.personio.de/xml` | `*.jobs.personio.*` |
| Lainnya (Workday, SuccessFactors, iCIMS, Taleo, situs custom) | Ambil **JSON-LD `JobPosting`** dari halaman lowongan (via sitemap/daftar link) | `application/ld+json` |

Workday punya endpoint internal (`/wday/cxs/...`) yang sering dipakai, tetapi tidak resmi → pakai JSON-LD atau deeplink.

**Cara menyusun daftar perusahaan (gratis):**
1. Mulai dari perusahaan yang **terbukti menyponsori visa** (register §3c) di sektor IT, engineering, kesehatan, hospitality.
2. Tambah perusahaan yang sering muncul di hasil Adzuna/Jooble dengan kata "visa sponsorship".
3. Tambah perusahaan dari kiriman user/employer (moderasi admin).

### 3b. Agregator & API pemerintah
| Sumber | Cakupan | Cara | Catatan |
|---|---|---|---|
| Adzuna API | AU, UK, DE, NL, NZ, CA, SG, AT, PL, US, dll. | query kategori × negara + "visa sponsorship" | lisensi untuk komersial |
| Jooble API | 60+ negara | idem | key per negara/domain |
| Bundesagentur für Arbeit — Jobsuche API (`rest.arbeitsagentur.de/jobboerse/jobsuche-service`) | Jerman (data yang juga dipakai *Make it in Germany*) | header `X-API-Key: jobboerse-jobsuche` (didokumentasikan di jobsuche.api.bund.dev) | filter bahasa Inggris & bidang yang butuh tenaga asing; cek ketentuan |
| Job Bank Kanada (open.canada.ca, dataset lowongan) | Kanada | unduh dataset berkala | data tidak real-time |

### 3c. Verifikasi "perusahaan ini bisa sponsor visa" (gratis, resmi)
| Negara | Sumber | Format | Dipakai untuk |
|---|---|---|---|
| UK | GOV.UK — *Register of licensed sponsors: workers* | CSV, diperbarui harian | badge "Sponsor terdaftar 🇬🇧" + seed daftar perusahaan |
| Belanda | IND — *Public register regular labour and highly skilled migrants* | halaman/daftar publik | badge "Recognised sponsor 🇳🇱" |
| Kanada | ESDC — daftar employer LMIA positif (open.canada.ca) | CSV/XLSX per kuartal | "Pernah mendapat LMIA" |
| AS | USCIS — H-1B Employer Data Hub | CSV per tahun fiskal | "Pernah sponsor H-1B" |
| Australia | tidak ada daftar sponsor publik | — | andalkan pernyataan iklan |

Pencocokan nama perusahaan: normalisasi (huruf kecil, buang "Ltd/Pty/GmbH/B.V."), lalu trigram similarity ≥0,9; di bawah itu masuk review admin.

---

## 4. Kerja luar negeri (program Indonesia, hospitality, kapal pesiar)

| Data | Sumber | Cara | Catatan |
|---|---|---|---|
| Lowongan luar negeri resmi (±289 ribu, 2026) | KP2MI — **SISKOP2MI** (siskop2mi.bp2mi.go.id) | **Langkah 1 (minggu 1):** cek apakah daftar lowongan bisa dibuka tanpa login, ada API/JSON di balik halaman, dan ToS-nya. **Langkah 2:** jika boleh → adapter terjadwal; jika tidak → ajukan **kerja sama data** resmi ke KP2MI (surat permohonan + MoU), sementara itu deeplink ke SISKOP2MI | sumber paling bernilai untuk kategori ini |
| Daftar agensi P3MI berizin | KP2MI (daftar P3MI) | unduh/parse berkala → `organizations.verification.p3mi` | dasar fitur **Cek Agensi** |
| Program G-to-G Korea (EPS-TOPIK) | HRD Korea (eps.go.kr) + pengumuman KP2MI | pantau hash → `program` + `opportunity_events` (registrasi, tes, pengumuman) | jadwal tahunan |
| Program Jepang (IJEPA perawat/caregiver, SSW/Tokutei Ginou) | KP2MI, Kemnaker (IPKOL), situs SSW Jepang | pantau hash + kurasi | |
| Program Jerman (perawat, Ausbildung, Chancenkarte) | KP2MI, *Make it in Germany* | kurasi + pantau | |
| Lowongan hotel global | Career page Marriott, Hilton, Accor, IHG, Hyatt, Jumeirah, dll. | ATS/JSON-LD (§3a) | filter negara tujuan |
| Kapal pesiar | Career site cruise line + daftar manning agency resminya di Indonesia | kurasi admin; izin agensi dicek ke daftar regulator | banyak penipuan → hanya jalur resmi |
| Lowongan Eropa | EURES | deeplink saja | mayoritas untuk warga EU |

---

## 5. Beasiswa & kalender

### 5a. Program yang dimasukkan (Fase 1)
| Program | Halaman resmi yang dipantau | Bentuk data |
|---|---|---|
| LPDP | lpdp.kemenkeu.go.id — jadwal, booklet/buku panduan (PDF), daftar PT tujuan | HTML + PDF |
| Australia Awards | australiaawardsindo.or.id — intake, policy handbook | HTML + PDF |
| Erasmus Mundus | Katalog Erasmus Mundus (Erasmus+/EACEA) → **website tiap program** | HTML, ratusan halaman |
| DAAD | daad.de scholarship database + daad.id | HTML |
| Chevening | chevening.org (timeline, eligibility) | HTML |
| UK lain | GREAT Scholarships (British Council), beasiswa kampus | HTML |
| Fulbright | aminef.or.id | HTML |
| Belanda | studyinnl.org (NL Scholarship & daftar beasiswa), excellence scholarship kampus | HTML |
| Korea — GKS | studyinkorea.go.kr (pengumuman GKS-G & GKS-U, PDF guideline) | HTML + PDF |
| Türkiye Bursları | turkiyeburslari.gov.tr | HTML |

### 5b. Cara mengisi data (cepat & akurat)
1. **Seed manual (hari 1–2):** admin mengisi ±30–40 program di editor admin: nama, penyelenggara, negara, jenjang, pendanaan, `official_url`, `apply_url`, syarat (dengan kutipan), dan siklus terbaru.
2. **Siklus & event:** setiap program punya `opportunity_cycles` (mis. "2027/28") dan `opportunity_events` (buka, tutup, tes, wawancara, pengumuman).
3. **Tanggal belum diumumkan?** Sistem menghitung **perkiraan** dari siklus 2–3 tahun sebelumnya (median bulan buka/tutup) dan menampilkannya dengan label "Perkiraan". Data siklus lama diisi admin sekali dari arsip pengumuman resmi (Wayback Machine boleh dipakai sebagai referensi tanggal).
4. **Pemantauan:** worker memantau halaman resmi (hash teks bersih). Begitu berubah → AI mengekstrak field baru + kutipan → diff → **review admin** → terbit → notifikasi ke user yang menyimpan.
5. **Erasmus Mundus (volume besar):** sekali per siklus (Sept–Okt), worker mengambil semua link program dari katalog, lalu AI mengekstrak deadline, beasiswa, syarat, dan link aplikasi dari website tiap program; hasil dengan confidence rendah masuk review.

### 5c. Kalender
Tidak butuh sumber terpisah: kalender = query `opportunity_events` (+ event perkiraan) yang difilter negara/jenjang/pendanaan, ditampilkan per bulan, bisa diekspor sebagai **feed ICS** pribadi.

---

## 6. Requirement Matrix (syarat yang dipakai matching & checklist)

| Tingkat | Contoh | Sumber | Cara |
|---|---|---|---|
| Track/program | syarat WHV, konsesi DAMA, syarat EPS, syarat LPDP/AAS/Chevening | halaman resmi (§1–§5) | **kurasi admin** dengan kutipan; dipantau |
| Lowongan dari ATS/JSON-LD | "RSA required", "2 years experience", "driver licence", "German B2" | deskripsi lowongan | **AI ekstraksi** saat lowongan disimpan/dibuka user (lazy) → `requirements` dengan kutipan; tanpa kutipan = tidak dipakai |
| Lowongan agregator (deskripsi terpotong) | — | — | ditandai "Syarat lengkap: cek di sumber"; hanya syarat track yang dievaluasi |

Hasil evaluasi per syarat: terpenuhi · belum · belum diketahui · akan kedaluwarsa · cek manual.

---

## 7. Data referensi pendukung (Checklist, Timeline, CTA)

| Data | Dipakai di | Sumber | Cara |
|---|---|---|---|
| **Katalog jenis dokumen** (paspor, KTP, KK, akta, ijazah, transkrip, terjemahan tersumpah, legalisasi, SKCK, MCU, rekening koran, sertifikat bahasa, CV, motivation letter, LoR, RSA/White Card/First Aid) | Vault, checklist | disusun admin | seed SQL (`document_types`) |
| **Cara mengurus dokumen + lama proses + biaya** | panduan "cara melengkapi", timeline | Paspor: Ditjen Imigrasi / aplikasi M-Paspor · SKCK: Polri (layanan SKCK online) · Legalisasi ijazah: kampus/Kemendikbud · Terjemahan tersumpah: daftar penerjemah tersumpah · MCU: klinik yang ditunjuk negara tujuan (Home Affairs/panel physician) | kurasi admin + pantau halaman resmi bulanan |
| **Tes bahasa: skor minimum & ekuivalensi** (IELTS/TOEFL/PTE) | evaluator syarat bahasa | halaman resmi tiap program (Home Affairs untuk WHV, tiap beasiswa) — **jangan pakai tabel umum** | disimpan per program di `requirements.rule.any_of` |
| **Jadwal & lama hasil tes bahasa** | timeline (mis. "hasil IELTS ±3–5 hari") | IDP Indonesia, British Council Indonesia, ETS, Pearson | kurasi; tanggal tes cukup deeplink |
| **Lama proses visa** | timeline | Home Affairs *global visa processing times*; kedutaan negara lain | pantau bulanan |
| **Template langkah per track** (WHV, DAMA, beasiswa, G-to-G) | generator timeline | disusun admin dari §1–§5 | seed `step_templates` |
| **Kurs mata uang** (syarat dana AUD 5.000 ≈ Rp…) | readiness syarat dana | API kurs ECB gratis (mis. frankfurter.app) atau JISDOR Bank Indonesia | harian |
| **Postcode Australia & zona** | specified work, lokasi DAMA | Home Affairs (zona) + dataset postcode gratis (lat/long) | bulanan |
| **Kode okupasi** (ANZSCO/OSCA, ISCO) | DAMA, matching kategori | ABS, ILO | sekali + tahunan |
| **Negara, bendera, mata uang** | semua | ISO 3166 / ISO 4217 | seed sekali |
| **Upah minimum** | halaman lowongan WHV | Fair Work pay guides | kurasi per tahun (1 Juli) |

---

## 8. Data user (L4) — selalu dari user

| Data | Cara masuk | Catatan |
|---|---|---|
| Tujuan, negara, target berangkat | Onboarding bertahap | menentukan track & goal awal |
| Tanggal lahir, pendidikan, pengalaman, level bahasa | Onboarding + profil | dasar filter keras & readiness |
| Dokumen | **Default: centang + isi metadata** (punya/tidak, tanggal kedaluwarsa, skor) — tanpa upload | upload opsional ke bucket privat |
| Isi otomatis dari dokumen | **Fase 4**, opsional, dengan persetujuan per dokumen; hasil wajib dikonfirmasi | lihat catatan privasi AI di §10 |
| Rencana, stage, catatan, tugas | aksi user | |

Admin: `ndsanja@gmail.com` mendapat klaim `app_metadata.role = 'admin'` setelah login pertama (diset lewat SQL/migrasi dengan secret key).

---

## 9. Data bisnis (L5) — CTA partner

| Data | Sumber | Cara |
|---|---|---|
| Penawaran PareLabs (kelas IELTS/PTE, English for Work/WHV, link, UTM, harga) | admin | `/admin/partner` → `partners`, `partner_offers` dengan `gap_type = english` |
| Partner lain (penerjemah tersumpah, kursus RSA/White Card, MCU, CV review) | admin / kerja sama | `gap_type` sesuai jenis kekurangan |
| Performa CTA | otomatis | `cta_events` (impresi, klik) → laporan admin |

---

## 10. Mesin pengambil data — implementasi dengan keputusan terbaru

### 10a. Worker (repo privat → kuota GitHub Actions 2.000 menit/bulan)
| Job | Isi | Jadwal | Perkiraan menit/bulan |
|---|---|---|---|
| `ingest-jobs` | Adzuna, Jooble, ATS, BA Jobsuche | 2× sehari, ±8 menit | ±480 |
| `monitor-pages` | Hash halaman resmi WHV/DAMA/beasiswa/program + AI bila berubah | 1× sehari, ±6 menit | ±180 |
| `liveness` | cek lowongan masih buka | 1× sehari, ±5 menit | ±150 |
| `registers` | UK/NL/CA/US sponsor, P3MI, postcode | 1× seminggu, ±5 menit | ±20 |
| `notify` | kirim email notifikasi tertunda | tiap 3 jam, ±1 menit | ±240 |
| **Total** | | | **±1.070 (aman di bawah 2.000)** |

Tugas yang murni SQL (tutup otomatis setelah deadline, tandai data basi, membuat baris notifikasi) dijalankan `pg_cron` di Supabase — tidak memakai menit GitHub. Jika kuota mulai mepet, pindahkan worker ke VPS kecil (±$5/bulan) tanpa mengubah kode (`bun run ingest --due`).

### 10b. AI via OpenRouter — `deepseek/deepseek-v4.1-flash`
- **Harga (cek ulang di halaman model OpenRouter):** ±$0,15 / 1 jt token input, ±$0,60 / 1 jt token output. Untuk 600 ekstraksi/bulan (10 rb input + 2 rb output): ±**$1,6/bulan**.
- **Dipakai untuk:** ekstraksi halaman yang berubah (§1–§5), ekstraksi syarat lowongan secara lazy (§6), ringkasan Bahasa Indonesia.
- **Cara pakai:** endpoint OpenAI-compatible OpenRouter (`https://openrouter.ai/api/v1/chat/completions`) dengan `response_format` JSON Schema bila didukung provider; **selalu validasi ulang dengan Zod** + validator kutipan bukti; jika gagal, ulangi 1× lalu kirim ke review.
- **Kunci versi model:** simpan `model` & `prompt_version` di tabel `extractions`; pakai slug yang dipin (bukan "latest") agar hasil konsisten.
- **Privasi:** jangan kirim scan paspor/KTP/SKCK ke model publik. Untuk fitur isi-otomatis dokumen (Fase 4) gunakan pengaturan provider OpenRouter yang menolak penyimpanan data (`provider.data_collection: "deny"`) dan minta persetujuan eksplisit user; default tetap input manual.

### 10c. Firecrawl — dipakai untuk lapisan "halaman sulit"
Firecrawl (API scraping: `scrape`, `map`, `crawl`, `extract`) **membantu**, tapi hanya untuk sebagian sumber:

| Kasus | Pakai Firecrawl? | Alasan |
|---|---|---|
| Adzuna, Jooble, ATS (Greenhouse/Lever/…), BA Jobsuche, CSV register | **Tidak** | sudah JSON/CSV terstruktur; Firecrawl hanya menambah biaya |
| Halaman resmi statis (Home Affairs, LPDP, Chevening, AAS) | Opsional | `fetch` + parser biasa cukup; Firecrawl berguna untuk output **markdown bersih** (hemat token AI, hash lebih stabil) |
| Situs berat JavaScript / SPA (sebagian situs DAR DAMA, website program Erasmus Mundus, portal kampus, SISKOP2MI bila dirender JS) | **Ya** | merender JS tanpa kita menjalankan Playwright → hemat menit GitHub Actions |
| PDF (booklet LPDP, guideline GKS, daftar okupasi DAMA) | **Ya** | mengubah PDF ke markdown/teks |
| Menemukan semua link program (katalog Erasmus Mundus, daftar beasiswa kampus) | **Ya** — `map` | daftar URL satu situs dalam satu panggilan |
| SEEK, Indeed, LinkedIn, situs yang ToS-nya melarang scraping | **Tidak** | larangan ToS tetap berlaku walau lewat Firecrawl |

**Cara pakai di pipeline:** adapter `html-monitor` punya dua mode — `fetch` (default, gratis) dan `firecrawl` (diset per sumber di `sources.config.fetcher`). Firecrawl dipakai untuk mengambil **markdown**; ekstraksi field tetap oleh DeepSeek + Zod + validator kutipan (bukan endpoint `extract` Firecrawl), supaya satu jalur validasi dan biaya AI tetap murah.

**Biaya (cek ulang di firecrawl.dev/pricing):** Free ±1.000 kredit/bulan; Hobby ±$16/bulan untuk 5.000 kredit. Perkiraan pemakaian: ±60–100 halaman sulit dipantau harian (~2.000–3.000 kredit/bulan) + Erasmus Mundus massal sekali per siklus (±200–300 kredit) → **Free cukup untuk awal, Hobby setelah sumber bertambah**. Firecrawl juga open-source (bisa self-host di VPS bila volume besar).

---

## 11. Playbook menambah sumber baru (dipakai admin & developer)

1. **Cek legal:** baca ToS & robots.txt. Melarang? → jadikan **deeplink** saja.
2. **Cari jalur terstruktur** (urut): API resmi → ATS publik → file CSV/XLSX/PDF → JSON-LD → sitemap/RSS → HTML (`fetch`; pakai Firecrawl hanya jika halaman dirender JavaScript atau berupa PDF sulit).
3. **Daftarkan di `sources`:** `kind`, `authority`, `trust_score`, `config` (endpoint/slug/selector), jadwal, catatan atribusi.
4. **Simpan fixture** (contoh respons) di `ingest/__fixtures__/` dan tulis test adapter.
5. **Uji kering:** `bun run ingest --source=<slug> --dry-run` → cek hasil normalisasi.
6. **Aktifkan** → pantau 1 minggu di dashboard admin (jumlah item, error, confidence).

---

## 12. Urutan kerja agar data cepat terkumpul

| Minggu | Target data | Hasil yang terlihat di app |
|---|---|---|
| 1 | Seed referensi (§7) + knowledge base WHV & 13 DAMA (kurasi) + daftar 30–40 beasiswa | Halaman `/whv`, `/dama`, `/beasiswa` + kalender sudah berisi |
| 2 | Adapter Adzuna, Jooble, 7 ATS, JSON-LD; daftar 50–100 employer awal | Ribuan lowongan WHV/profesional/hotel tanpa AI |
| 3 | Register sponsor UK/NL/CA/US, P3MI, BA Jobsuche; spike SISKOP2MI; monitor halaman + AI | Badge sponsor & agensi, update otomatis beasiswa, review queue jalan |
| 4 | Ekstraksi DAMA occupation list + Erasmus Mundus massal; liveness check | `/dama/[wilayah]` lengkap, ratusan program Erasmus di kalender |

Setelah itu data siap dipakai alur Profil → Readiness → Checklist → Rencana → Timeline (Fase 2–3 di `PLAN.md`).

---

## 13. Yang tetap butuh tangan manusia (dan berapa lama)
- **Seed awal:** ±3–4 hari kerja admin (beasiswa, WHV, DAMA, referensi dokumen, step templates).
- **Review harian:** ±30–60 menit (perubahan field kritis, ekstraksi confidence rendah, tip komunitas, pencocokan nama perusahaan).
- **Kerja sama:** surat ke KP2MI (data SISKOP2MI) dan Adzuna (lisensi komersial) — sebaiknya dikirim di minggu pertama karena prosesnya lama.

---

## Sumber
- OpenRouter DeepSeek: [deepseek-v4.1-flash (LLM Reference)](https://www.llmreference.com/model/deepseek-v4.1-flash/openrouter), [deepseek-v4-flash-latest](https://openrouter.ai/~deepseek/deepseek-v4-flash-latest)
- Firecrawl: [ringkasan harga 2026](https://www.eesel.ai/blog/firecrawl-pricing), [costbench free plan](https://www.costbench.com/software/web-scraping/firecrawl/free-plan/)
- Sumber lain: lihat lampiran `docs/PLAN.md`.
