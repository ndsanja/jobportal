import {
  CLAIM_FIELD_NAMES,
  type ClaimField,
  isClaimField,
  parseClaimValue,
} from "@/domain/claims";
import { DOCUMENT_TYPE_CODES } from "@/domain/documents";
import {
  evidenceInText,
  type Rejection,
} from "@/domain/scholarship-extraction";
import { callJsonModel, type FetchLike } from "@/server/ai/json-call";

export const RESEARCH_PROMPT_VERSION = "claims-v1";

export type CandidateClaim = {
  field: ClaimField;
  value: unknown;
  summary: string;
  evidence: string;
};

const SYSTEM_PROMPT = `Anda adalah mesin pengekstrak SYARAT dari teks halaman web untuk sebuah subjek (program/visa/beasiswa). Balas HANYA dengan satu objek JSON.

Aturan ketat:
- Ekstrak hanya syarat/ketentuan yang BERLAKU UNTUK SUBJEK yang disebutkan, bagi pemohon dari Indonesia bila halaman membedakan negara. Abaikan visa/program/negara lain.
- Gunakan hanya informasi yang tertulis di teks. Jangan menebak, jangan mengira-ngira, jangan memakai pengetahuan di luar teks.
- Setiap klaim WAJIB punya "evidence": salinan PERSIS (kata per kata) satu kalimat/frasa dari teks yang memuat klaim itu.
- Satu klaim = satu fakta. Pisahkan syarat yang berbeda menjadi klaim terpisah.
- Jika tidak ada syarat yang relevan, kembalikan {"claims": []}.

Bidang yang diizinkan dan bentuk "value":
- requirement.age: {"min": angka atau null, "max": angka atau null}
- requirement.english: {"tests": [{"test": "IELTS|TOEFL_IBT|PTE|TOEFL_ITP|OTHER", "min_overall": angka atau null}], "note": "opsional"}
- requirement.document: {"doc_type": "<kode>", "note": "opsional"}  kode: ${DOCUMENT_TYPE_CODES.join(", ")}
- requirement.funds: {"amount": angka, "currency": "AUD"}
- requirement.experience_years: {"min": angka}
- requirement.education: {"min_level": "sma|d3|d4|s1|s2|s3"}
- requirement.nationality: {"countries": ["ID"]}
- requirement.other: {"text": "syarat lain yang tidak masuk bidang di atas"}

Format keluaran:
{"claims": [{"field": "requirement.age", "value": {"min": 18, "max": 30}, "summary": "Ringkasan Bahasa Indonesia (maks 200 karakter)", "evidence": "kutipan persis dari teks"}]}`;

export type ClaimExtraction =
  | { ok: true; claims: CandidateClaim[]; rejected: Rejection[]; model: string }
  | { ok: false; error: string };

/** Memvalidasi satu daftar mentah klaim: bidang, bentuk nilai, kode dokumen, dan kutipan bukti. */
export function validateClaims(
  json: unknown,
  pageText: string,
  allowedFields: ClaimField[],
): { claims: CandidateClaim[]; rejected: Rejection[] } | { error: string } {
  const list = (json as { claims?: unknown } | null)?.claims;
  if (!Array.isArray(list))
    return { error: 'Objek harus memuat larik "claims"' };

  const claims: CandidateClaim[] = [];
  const rejected: Rejection[] = [];

  list.slice(0, 40).forEach((raw, index) => {
    const path = `claims.${index}`;
    const item = raw as {
      field?: unknown;
      value?: unknown;
      summary?: unknown;
      evidence?: unknown;
    };
    if (
      typeof item.field !== "string" ||
      !isClaimField(item.field) ||
      !allowedFields.includes(item.field)
    ) {
      rejected.push({ path, reason: "Bidang tidak diizinkan" });
      return;
    }
    if (
      typeof item.evidence !== "string" ||
      !evidenceInText(item.evidence, pageText)
    ) {
      rejected.push({
        path,
        reason: "Kutipan bukti tidak ditemukan di halaman",
      });
      return;
    }
    const value = parseClaimValue(item.field, item.value);
    if (!value.ok) {
      rejected.push({ path, reason: `Nilai tidak valid: ${value.error}` });
      return;
    }
    if (item.field === "requirement.document") {
      const code = (value.value as { doc_type: string }).doc_type;
      if (!(DOCUMENT_TYPE_CODES as readonly string[]).includes(code)) {
        rejected.push({ path, reason: `Kode dokumen tidak dikenal: ${code}` });
        return;
      }
    }
    const summary =
      typeof item.summary === "string" ? item.summary.trim().slice(0, 300) : "";
    if (summary.length < 5) {
      rejected.push({ path, reason: "Ringkasan kosong" });
      return;
    }
    claims.push({
      field: item.field,
      value: value.value,
      summary,
      evidence: item.evidence.trim().slice(0, 600),
    });
  });

  return { claims, rejected };
}

/** Meminta model mengekstrak klaim dari satu halaman; semua klaim tervalidasi sebelum dikembalikan. */
export async function extractClaims(
  pageText: string,
  subject: { description: string; fields?: ClaimField[] },
  deps: { apiKey: string; model: string; fetch?: FetchLike; now?: Date },
): Promise<ClaimExtraction> {
  const now = deps.now ?? new Date();
  const fields = subject.fields?.length ? subject.fields : CLAIM_FIELD_NAMES;

  const result = await callJsonModel(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Subjek: ${subject.description}\nHari ini: ${now.toISOString().slice(0, 10)}\n\nTEKS HALAMAN:\n"""\n${pageText}\n"""`,
      },
    ],
    {
      apiKey: deps.apiKey,
      model: deps.model,
      fetch: deps.fetch,
      maxTokens: 4000,
    },
    (json) => {
      const checked = validateClaims(json, pageText, fields);
      return "error" in checked
        ? { ok: false, error: checked.error }
        : { ok: true, value: checked };
    },
  );

  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    claims: result.value.claims,
    rejected: result.value.rejected,
    model: deps.model,
  };
}
