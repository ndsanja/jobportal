import {
  type Rejection,
  type ValidatedExtraction,
  validateExtraction,
} from "@/domain/scholarship-extraction";

export const PROMPT_VERSION = "scholarship-v1";
export const DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

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

function parseJsonLoose(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

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
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? new Date();

  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Hari ini: ${now.toISOString().slice(0, 10)}.\n\nTEKS HALAMAN:\n"""\n${pageText}\n"""`,
    },
  ];

  let lastError = "Tidak ada respons";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await doFetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deps.apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "Karir Pro",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0,
          max_tokens: 3000,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );

    if (!response.ok) {
      // Tidak menyertakan isi respons/URL agar tidak membocorkan apa pun.
      throw new Error(`OpenRouter gagal: HTTP ${response.status}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      lastError = "Respons model kosong";
      continue;
    }

    let json: unknown;
    try {
      json = parseJsonLoose(content);
    } catch {
      lastError = "Keluaran model bukan JSON";
      messages.push(
        { role: "assistant", content },
        {
          role: "user",
          content:
            "Keluaran bukan JSON valid. Balas ulang hanya dengan objek JSON sesuai skema.",
        },
      );
      continue;
    }

    const validated = validateExtraction(json, pageText, now);
    if ("error" in validated) {
      lastError = `Skema tidak valid: ${validated.error}`;
      messages.push(
        { role: "assistant", content },
        {
          role: "user",
          content: `Skema tidak valid (${validated.error}). Perbaiki dan balas ulang hanya dengan JSON.`,
        },
      );
      continue;
    }
    return {
      ok: true,
      accepted: validated.accepted,
      rejected: validated.rejected,
      model,
    };
  }

  return { ok: false, error: lastError };
}
