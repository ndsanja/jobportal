import {
  type Rejection,
  type ValidatedExtraction,
  validateExtraction,
} from "@/domain/scholarship-extraction";
import { callJsonModel, type FetchLike } from "./json-call";

export const PROMPT_VERSION = "scholarship-v1";
export const DEFAULT_MODEL = "openai/gpt-6-luna";

const SYSTEM_PROMPT = `Anda mengekstrak fakta beasiswa dari TEKS HALAMAN RESMI. Balas HANYA dengan satu objek JSON.
Aturan ketat:
- Gunakan hanya informasi yang tertulis di teks. Jangan menebak, jangan menghitung tanggal sendiri.
- Setiap fakta wajib punya "evidence": salinan PERSIS (kata per kata) satu kalimat/frasa dari teks yang memuat fakta itu.
- Tanggal ditulis YYYY-MM-DD. Bila tahun tidak tertulis dan tidak bisa dipastikan dari teks, jangan masukkan tanggalnya.
- Jika suatu fakta tidak ada di teks, hilangkan field-nya. Daftar kosong lebih baik daripada fakta yang tidak pasti.
Skema:
{
  "dates": [{"kind": "open|close|test|interview|announcement|start", "label": "deskripsi singkat (Bahasa Indonesia)", "starts_on": "YYYY-MM-DD", "ends_on": "YYYY-MM-DD atau null", "evidence": "kutipan persis"}],
  "funding": {"text": "ringkasan pendanaan (Bahasa Indonesia)", "evidence": "kutipan persis"},
  "study_levels": {"values": ["bachelor|master|doctoral|non_degree"], "evidence": "kutipan persis"},
  "application_status": {"value": "open|closed|upcoming", "evidence": "kutipan persis"}
}`;

export type ExtractionResult =
  | {
      ok: true;
      accepted: ValidatedExtraction;
      rejected: Rejection[];
      model: string;
    }
  | { ok: false; error: string };

/**
 * Meminta model mengekstrak fakta dari teks halaman, lalu memvalidasi (skema + kutipan bukti +
 * tanggal). Satu kali coba ulang bila keluaran bukan JSON/skema valid.
 */
export async function extractScholarshipFacts(
  pageText: string,
  deps: { apiKey: string; model?: string; fetch?: FetchLike; now?: Date },
): Promise<ExtractionResult> {
  const model = deps.model ?? DEFAULT_MODEL;
  const now = deps.now ?? new Date();

  const result = await callJsonModel(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Hari ini: ${now.toISOString().slice(0, 10)}.\n\nTEKS HALAMAN:\n"""\n${pageText}\n"""`,
      },
    ],
    { apiKey: deps.apiKey, model, fetch: deps.fetch },
    (json) => {
      const validated = validateExtraction(json, pageText, now);
      return "error" in validated
        ? { ok: false, error: `Skema tidak valid: ${validated.error}` }
        : { ok: true, value: validated };
    },
  );

  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    accepted: result.value.accepted,
    rejected: result.value.rejected,
    model,
  };
}
