# Karir Pro — Mesin Kurasi Peluang (AI)

> Diperbarui 6 Oktober 2026. Dokumen ini menjelaskan cara sistem **mencari, membandingkan, mengkurasi, dan menyajikan** informasi lowongan kerja & beasiswa luar negeri untuk WNI, dan bagaimana akurasinya dijaga. Runbook operasional ada di [`INGESTION.md`](./INGESTION.md).

## 1. Prinsip

1. **Akurasi di atas kelengkapan.** Lebih baik "belum ditemukan" daripada fakta yang salah.
2. **AI mengusulkan, bukti & aturan yang memutuskan.** Model hanya mengekstrak/menyusun. Status sebuah fakta ditentukan aturan yang bisa dijelaskan: tingkat sumber, kutipan, tanggal, dan kesepakatan antar-sumber.
3. **Setiap fakta punya sumber.** Kutipan persis, URL halaman, tingkat sumber (resmi/tepercaya/komunitas), tanggal pembaruan halaman, dan kapan terakhir dicek.
4. **Resmi menang, baru menang.** Hanya sumber resmi yang masih berlaku yang bisa membuat fakta "diterima". Bila dua sumber resmi berbeda, yang lebih baru menang. Laporan lain tampil berlabel "belum resmi".
5. **Admin menang atas mesin.** Keputusan admin tidak pernah ditimpa sistem.
6. **Sumber sah saja.** Situs yang melarang scraping dan platform sosial (LinkedIn, Instagram, TikTok, Facebook, X, YouTube) tidak diambil. Pencarian memakai Firecrawl, dan data lowongan memakai API/feed resmi (Adzuna, ATS publik).

## 2. Alur besar

```
                ┌───────────────────────────── AGEN PENEMU (discovery_agent) ─────────────────────────────┐
 web (Firecrawl) │ kueri digilir → baca halaman + tautan → AI: kandidat program (kutipan + tautan resmi)   │
                 │ → buang duplikat → buka tautan resmi & pastikan menyebut nama program → skor → antrean   │
                 └───────────────────────────────────────────┬───────────────────────────────────────────────┘
                                                             ▼ admin setujui (/admin/temuan)
 seed/admin ─────────────────────────────────────────► PELUANG (beasiswa / program kerja resmi)
                                                             │ jatuh tempo (research_subjects)
                 ┌───────────────────────────── RISET OTOMATIS (opportunity_research) ──────────────────────┐
                 │ rencana riset otomatis: domain resmi, halaman benih, kueri EN+ID, `site:`, berita terbaru │
                 │ cari → baca (resmi dulu, paralel) → AI ekstrak klaim berkutipan (profil bidang)          │
                 │ → validator deterministik (kutipan ada di halaman; angka & tanggal tertulis di kutipan)   │
                 │ → halaman usang/negara lain dilewati → pemeriksa fakta AI (silang antar-sumber)          │
                 │ → keputusan status & keyakinan → panduan AI (setiap kalimat merujuk klaim)              │
                 │ → TERAPKAN fakta resmi ke listing: tenggat (WIB), status, pendanaan, jenjang, jadwal    │
                 └──────────────────────────────────────────────────────────────────────────────────────────┘
                                                             ▼
         TAMPILAN: panduan + bukti, perbandingan beasiswa, skor keandalan, kesiapan pengguna, kalender

 API/ATS ─► adapter ─► publish (dedupe, sinyal regex) ─► teks iklan privat ─► PENILAIAN WNI (job_enrichment)
            Adzuna, Greenhouse, Lever, Ashby, SmartRecruiters          kelayakan WNI, jalur visa, syarat kunci (berkutipan)

 Jalur (WHV 462, DAMA) ─► research_agent dengan kueri khusus ─► panduan /whv, /dama
```

## 3. Pengaman akurasi

| Lapisan | Apa yang dicegah | Di mana |
|---|---|---|
| Kutipan wajib ada di teks halaman | Fakta karangan | `validateClaims`, `validateCandidates`, `validateInsight` |
| **Angka & tanggal wajib tertulis di kutipan** (5.000 / 5,000 / "5 juta" / "two years"; "under 31" → maks 30) | Usia, biaya, IPK, tenggat yang salah | `src/domain/grounding.ts` |
| Tanggal jadwal: −6 tahun s.d. +3 tahun; tanggal lampau disimpan sebagai **riwayat**, bukan tenggat aktif | Tenggat tahun lama tampil sebagai aktif | `extract.ts`, `timeline.ts` |
| Halaman usang/arsip/khusus negara lain dilewati; tanggal pembaruan dibaca deterministik (teks & metadata HTML) | Info kedaluwarsa | `page-date.ts`, `gather.ts` |
| Bukti dari halaman >2 tahun tidak dihitung | Fakta lama menang | `isStaleEvidence` |
| Pemeriksa fakta AI melihat semua klaim sekaligus | Pertentangan antar-sumber (mis. "daftar langsung" vs "wajib ballot") | `verify.ts` |
| Status: `accepted` hanya dengan sumber resmi; `disputed` berlabel; `proposed` disembunyikan | Opini/rumor tampil sebagai fakta | `decideClaims` |
| Panduan: kalimat tanpa rujukan klaim dibuang; klaim belum resmi hanya di "Yang belum pasti" | Halusinasi di ringkasan | `validateBrief` |
| Tautan resmi kandidat temuan dibuka dan harus menyebut nama program | Program palsu/tautan salah | `pageMentionsName` |
| Penilaian lowongan: kesimpulan tegas wajib berkutipan; sinyal regex mengoreksi model | "Bisa untuk WNI" yang keliru | `job-insight.ts` |
| Tenggat tanpa jam dihitung 23.59 WIB dan diberi catatan | Hitung mundur terlalu optimis | `deadlineInstant` |

## 4. Peta komponen

| Komponen | Berkas | Tabel |
|---|---|---|
| Katalog fakta & profil bidang (visa, beasiswa, program kerja) | `src/domain/claims.ts` | `claims`, `claim_evidence` |
| Mesin riset satu subjek | `src/server/research/agent.ts` (`researchSubject`) | `research_pages`, `subject_briefs` |
| Rencana riset otomatis per peluang | `src/server/research/subject.ts` | `research_subjects` |
| Penerapan fakta ke listing | `src/domain/facts.ts`, `src/server/research/opportunities.ts` | `opportunities`, `opportunity_events`, `opportunity_changes` |
| Agen penemu | `src/domain/discovery.ts`, `src/server/discovery/*` | `discovery_candidates`, `discovery_pages` |
| Penilaian lowongan untuk WNI | `src/domain/job-insight.ts`, `src/server/enrich/jobs.ts` | `opportunity_texts` (privat), `opportunity_insights` |
| Skor keandalan data | `src/domain/quality.ts` | — |
| Perbandingan beasiswa | `src/app/beasiswa/bandingkan/page.tsx` | — |
| Antrean admin | `/admin/temuan`, `/admin/claims`, `/admin/review` | — |

## 5. Biaya & jadwal (perkiraan)

| Pekerjaan | Frekuensi | Panggilan model per run |
|---|---|---|
| Riset otomatis peluang | tiap jam, 2 subjek | ±6 halaman → 6 ekstraksi + 1 pemeriksa + 1 panduan per subjek (panduan dilewati bila klaim tidak berubah; halaman yang tidak berubah tidak diekstrak ulang) |
| Riset jalur WHV/DAMA | mingguan | ±10 halaman |
| Agen penemu | harian ×2 | ±8 halaman |
| Penilaian lowongan | tiap jam | 8 lowongan per panggilan, hanya yang baru/berubah |

Jadwal riset ulang per peluang: 2 hari bila tenggat < 30 hari, 7 hari normal, 30 hari bila sudah tutup, 1 hari setelah gagal.

## 6. Perluasan ke lowongan & beasiswa dalam negeri

Rancangannya sudah generik:
- Peluang dalam negeri cukup `country_code = 'ID'`. Domain `.go.id`/`.ac.id` otomatis dianggap resmi/institusional.
- Agen penemu bisa diberi sumber baru dengan kueri dalam negeri (mis. "beasiswa S1 dalam negeri {year}", "rekrutmen CPNS/BUMN {year}") tanpa kode baru.
- Profil bidang baru (mis. `domestic_job`) cukup ditambahkan di `FIELD_PROFILES` beserta panduan bidangnya di `extract.ts`.
- Penilaian lowongan: label "untuk WNI" diganti kriteria lain (mis. domisili/kualifikasi) lewat prompt & validator terpisah.
- Yang perlu ditambahkan nanti: track `domestic`, filter negara "Indonesia" di UI, dan sumber lowongan dalam negeri yang sah (API resmi/ATS perusahaan).

## 7. Batasan yang jujur

- Mesin hanya sebaik sumber yang bisa dibaca. Halaman resmi yang memblokir bot atau berupa gambar/PDF hasil pindai bisa terlewat (Firecrawl membantu untuk JavaScript/PDF).
- Pemeriksa fakta menilai konsistensi kutipan, negara, dan waktu, bukan kebenaran di dunia nyata. Kebenaran tetap bersandar pada sumber resmi.
- Teks iklan Adzuna berupa cuplikan pendek, sehingga penilaian WNI untuk lowongan Adzuna sering "mungkin"/"belum jelas". Sumber ATS (deskripsi lengkap) memberi hasil lebih tajam.
- **Daftar perusahaan DAMA:** situs resmi wilayah DAMA umumnya tidak memublikasikan nama perusahaan berperjanjian. Sumber utama karena itu adalah iklan lowongan yang menyebut DAMA secara eksplisit (label "Iklan menyebut DAMA", sering lewat agen rekrutmen), ditambah halaman resmi/pihak ketiga bila ada. "Terverifikasi" hanya bila situs resmi atau ≥2 domain web berbeda menyebutnya.
- **Prediksi siklus berikutnya** dihitung dari tanggal siklus-siklus sebelumnya yang berkutipan; ini perkiraan, bukan pengumuman.
- Paket Firecrawl membatasi kecepatan pencarian (HTTP 429), sehingga riset dibatasi 2 peluang per run dan dijeda 4 detik per pencarian.
- Agen penemu butuh persetujuan admin sebelum program baru tampil (sengaja, demi akurasi).
