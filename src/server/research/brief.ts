import { createHash } from "node:crypto";
import {
  BRIEF_SECTIONS,
  type BriefContent,
  validateBrief,
} from "@/domain/brief";
import {
  CLAIM_FIELD_LABEL,
  type ClaimField,
  type SourceTier,
} from "@/domain/claims";
import { callJsonModel, type FetchLike } from "@/server/ai/json-call";

export const BRIEF_PROMPT_VERSION = "brief-v1";

export type BriefClaim = {
  id: string;
  field: string;
  value: unknown;
  summary: string;
  status: "accepted" | "disputed";
  confidence: number;
  tier: SourceTier;
  domains: string[];
  asOf: string | null;
  quote: string;
};

const SECTION_GUIDE = BRIEF_SECTIONS.map((s) => `- ${s.id}: ${s.heading}`).join(
  "\n",
);

const SYSTEM_PROMPT = `Anda adalah penyusun PANDUAN untuk calon pemohon dari Indonesia, berdasarkan klaim yang sudah dikumpulkan dan diverifikasi mesin riset. Balas HANYA dengan satu objek JSON.

Tujuan: panduan Bahasa Indonesia yang selengkap dan seinformatif mungkin, tetapi 100% bersandar pada klaim yang diberikan.

Aturan ketat:
1. Setiap butir WAJIB mencantumkan "claim_ids" (rujukan seperti "c3") dari klaim yang mendasarinya. Butir tanpa rujukan akan dibuang. Dilarang menambah fakta dari luar daftar klaim, termasuk angka dan tanggal.
2. Klaim berstatus "accepted" boleh dinyatakan sebagai fakta. Klaim "disputed" (belum resmi/berbeda) JANGAN dinyatakan sebagai fakta: taruh di "uncertainties" dengan kalimat yang jelas berlabel belum resmi.
3. Gabungkan klaim yang maknanya sama menjadi satu butir (cantumkan semua rujukannya). Jangan menghilangkan detail penting: angka, batas usia, biaya, tanggal, syarat khusus, pengecualian.
4. Bila dua klaim saling bertentangan, utamakan yang accepted/lebih tinggi keyakinannya/lebih baru, dan sebutkan pertentangannya di "uncertainties".
5. Urutan butir dalam bagian harus logis (alur: langkah awal → akhir). Kalimat ringkas, langsung, ramah, tanpa basa-basi.
6. "headline": satu kalimat inti yang paling penting bagi pemohon (mis. apakah harus ikut ballot). "summary": 2–4 kalimat ringkasan menyeluruh.
7. Di "uncertainties" juga sebutkan informasi penting yang TIDAK ditemukan (mis. "Tanggal pembukaan ballot belum ditemukan di sumber") bila relevan dengan bagian yang kosong; butir ini tetap harus merujuk ke klaim terkait.

Bagian yang tersedia (id: judul), pakai yang relevan saja:
${SECTION_GUIDE}

Petunjuk bidang → bagian: process.application_mode/process.ballot/process.step → cara_daftar; requirement.* → syarat (requirement.document → dokumen); fee.application → biaya; process.timeline → jadwal; condition.stay → ketentuan.

Format: {"headline": "...", "summary": "...", "sections": [{"id": "cara_daftar", "items": [{"text": "...", "claim_ids": ["c1","c4"]}]}], "uncertainties": [{"text": "...", "claim_ids": ["c7"]}]}`;

export const briefInputHash = (claims: BriefClaim[]): string =>
  createHash("sha256")
    .update(
      JSON.stringify(
        [...claims]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((c) => [c.id, c.status, c.confidence, c.summary, c.domains]),
      ),
    )
    .digest("hex");

/** Menyusun panduan akhir dari klaim yang sudah diputuskan. Hasil divalidasi: butir tanpa rujukan klaim dibuang. */
export async function synthesizeBrief(
  claims: BriefClaim[],
  subject: { description: string },
  deps: { apiKey: string; model: string; fetch?: FetchLike; now: Date },
): Promise<{ ok: true; value: BriefContent } | { ok: false; error: string }> {
  if (claims.length === 0)
    return { ok: false, error: "Belum ada klaim untuk disusun" };

  const refs = new Map<string, string>();
  const lines = claims.map((claim, index) => {
    const ref = `c${index + 1}`;
    refs.set(ref, claim.id);
    return JSON.stringify({
      ref,
      bidang: CLAIM_FIELD_LABEL[claim.field as ClaimField] ?? claim.field,
      field: claim.field,
      status: claim.status,
      keyakinan: claim.confidence,
      tingkat: claim.tier,
      sumber: claim.domains,
      diperbarui: claim.asOf,
      nilai: claim.value,
      ringkasan: claim.summary,
      kutipan: claim.quote.slice(0, 280),
    });
  });

  return callJsonModel(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Subjek: ${subject.description}\nHari ini: ${deps.now.toISOString().slice(0, 10)}\n\nKLAIM:\n${lines.join("\n")}`,
      },
    ],
    {
      apiKey: deps.apiKey,
      model: deps.model,
      fetch: deps.fetch,
      maxTokens: 6000,
    },
    (json) => validateBrief(json, refs),
  );
}
