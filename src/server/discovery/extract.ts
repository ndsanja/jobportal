import {
  type DiscoveredCandidate,
  type PageLink,
  validateCandidates,
} from "@/domain/discovery";
import { callJsonModel, type FetchLike } from "@/server/ai/json-call";

export const DISCOVERY_PROMPT_VERSION = "discover-v1";
const MAX_LINKS = 150;

const TARGET_LABEL = {
  scholarship: "beasiswa (studi/riset/kursus singkat) di luar negeri",
  program:
    "program kerja/magang luar negeri yang RESMI dan legal (G2G, program pemerintah, skema visa kerja resmi, pemagangan resmi)",
} as const;

const systemPrompt = (
  target: "scholarship" | "program",
) => `Anda adalah agen PENEMU peluang untuk warga Indonesia. Dari teks SATU halaman web dan daftar tautannya, temukan setiap ${TARGET_LABEL[target]} yang disebut. Balas HANYA dengan satu objek JSON.

Aturan ketat:
1. Hanya program nyata yang disebut namanya di teks (mis. "MEXT Scholarship", "EPS-TOPIK"), bukan kategori umum ("beasiswa S2 di Eropa").
2. ${target === "program" ? "Hanya jalur resmi/legal. Abaikan lowongan individual, agen/calo tanpa izin, atau tawaran yang meminta biaya mencurigakan." : "Abaikan pinjaman pendidikan, lomba, dan diskon biaya kuliah biasa."}
3. open_to_indonesia: "yes" bila teks menyebut Indonesia/WNI memenuhi syarat atau program terbuka untuk semua negara; "no" bila teks jelas mengecualikan Indonesia (mis. hanya warga Uni Eropa); selain itu "unknown".
4. official_link: NOMOR tautan dari daftar yang mengarah ke situs RESMI penyelenggara program itu (bukan artikel/blog/agregator lain); null bila tidak ada.
5. deadline: tanggal penutupan "YYYY-MM-DD" hanya bila tertulis lengkap di kutipan evidence; selain itu null. Jangan menebak tahun.
6. evidence: salinan PERSIS satu kalimat dari teks yang menyebut program itu (validator otomatis menolak kutipan yang tidak ada).
7. summary: 1–2 kalimat Bahasa Indonesia: apa programnya, untuk siapa, dan cakupannya. Jangan menambah fakta di luar teks.
8. country: kode ISO 2 huruf negara tujuan bila jelas; selain itu null. levels: jenjang yang disebut (bachelor, master, doctoral, postdoc, non_degree, vocational).
9. Jika tidak ada, kembalikan {"candidates": []}.

Format: {"candidates": [{"name": "...", "organizer": "... atau null", "kind": "${target}", "country": "JP", "levels": ["master"], "official_link": 3, "open_to_indonesia": "yes", "deadline": null, "summary": "...", "evidence": "..."}]}`;

export type CandidateExtraction =
  | {
      ok: true;
      candidates: DiscoveredCandidate[];
      rejected: Array<{ name: string; reason: string }>;
    }
  | { ok: false; error: string };

/** Meminta model menemukan kandidat peluang di satu halaman; hasil divalidasi ketat sebelum dipakai. */
export async function extractCandidates(
  page: { text: string; links: PageLink[]; url?: string },
  target: "scholarship" | "program",
  deps: { apiKey: string; model: string; fetch?: FetchLike; now: Date },
): Promise<CandidateExtraction> {
  const links = page.links.slice(0, MAX_LINKS);
  const linkList = links
    .map((link, index) => `${index + 1}. ${link.text} — ${link.url}`)
    .join("\n");
  const result = await callJsonModel(
    [
      { role: "system", content: systemPrompt(target) },
      {
        role: "user",
        content: `Hari ini: ${deps.now.toISOString().slice(0, 10)}\n\nTEKS HALAMAN:\n"""\n${page.text}\n"""\n\nTAUTAN DI HALAMAN:\n${linkList || "(tidak ada)"}`,
      },
    ],
    {
      apiKey: deps.apiKey,
      model: deps.model,
      fetch: deps.fetch,
      maxTokens: 6000,
    },
    (json) => {
      const checked = validateCandidates(
        json,
        { text: page.text, links, url: page.url },
        target,
        deps.now,
      );
      return "error" in checked
        ? { ok: false, error: checked.error }
        : { ok: true, value: checked };
    },
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, ...result.value };
}
