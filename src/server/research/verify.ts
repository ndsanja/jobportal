import { callJsonModel, type FetchLike } from "@/server/ai/json-call";
import type { Collected } from "./gather";

export const VERIFY_PROMPT_VERSION = "verify-v1";
const CHUNK = 40;

export type Verdict = { valid: boolean; reason: string };

const SYSTEM_PROMPT = `Anda adalah PEMERIKSA FAKTA. Anda menerima daftar klaim bernomor yang diekstrak dari halaman web untuk sebuah subjek, masing-masing dengan nilai terstruktur, ringkasan, kutipan sumber, domain, tingkat sumber (official/reputable/community), dan tanggal pembaruan halaman (bila ada). Balas HANYA dengan satu objek JSON.

Untuk setiap klaim, putuskan valid true/false. Tandai valid=false bila:
1. Kutipan TIDAK secara langsung mendukung ringkasan/nilai (nilai angka berbeda dari kutipan, kutipan hanya menyebut hal lain).
2. Klaim bukan untuk subjek, atau hanya berlaku untuk negara/kebangsaan lain, bukan pemohon dari Indonesia.
3. Klaim sudah usang: kutipan menyebut tanggal yang telah lewat, "sebelumnya", "hingga 2023", dsb., atau BERTENTANGAN dengan klaim lain di daftar yang berasal dari sumber yang lebih resmi atau lebih baru. Contoh: satu halaman menyebut pemohon langsung mengajukan visa, sementara halaman resmi lain yang lebih baru menyebut pemohon Indonesia wajib mengikuti ballot → klaim yang usang valid=false, alasan menyebut nomor klaim yang menggantikannya.
4. Klaim terlalu umum/bukan fakta yang berguna bagi pemohon (mis. kalimat promosi).

Jangan menandai valid=false hanya karena Anda tidak tahu faktanya dari pengetahuan sendiri. Nilai hanya dari konsistensi kutipan, subjek, negara, dan waktu. "Hari ini" diberikan.

Format: {"verdicts": [{"i": 0, "valid": true, "reason": "maks 120 karakter"}]}. Sertakan SEMUA nomor.`;

const describe = (c: Collected, index: number) =>
  JSON.stringify({
    i: index,
    field: c.field,
    value: c.value,
    summary: c.summary,
    quote: c.quote,
    domain: c.domain,
    tier: c.tier,
    page_updated: c.asOf,
  });

/** Memeriksa silang klaim hasil ekstraksi. Gagal → klaim dibiarkan lolos (tetap diputuskan oleh tingkat sumber). */
export async function verifyClaims(
  collected: Collected[],
  subject: { description: string },
  deps: { apiKey: string; model: string; fetch?: FetchLike; now: Date },
): Promise<{ verdicts: Verdict[]; error: string | null }> {
  const verdicts: Verdict[] = collected.map(() => ({
    valid: true,
    reason: "",
  }));
  if (collected.length === 0) return { verdicts, error: null };

  // Seluruh klaim dilihat model sekaligus agar pertentangan antar-sumber terdeteksi; chunk hanya bila sangat banyak.
  const chunks: number[][] = [];
  for (let start = 0; start < collected.length; start += CHUNK * 2)
    chunks.push(
      Array.from(
        { length: Math.min(CHUNK * 2, collected.length - start) },
        (_, k) => start + k,
      ),
    );

  let error: string | null = null;
  await Promise.all(
    chunks.map(async (indexes) => {
      try {
        const result = await callJsonModel(
          [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Subjek: ${subject.description}\nHari ini: ${deps.now.toISOString().slice(0, 10)}\n\nKLAIM:\n${indexes.map((i) => describe(collected[i] as Collected, i)).join("\n")}`,
            },
          ],
          {
            apiKey: deps.apiKey,
            model: deps.model,
            fetch: deps.fetch,
            maxTokens: 5000,
          },
          (json) =>
            Array.isArray((json as { verdicts?: unknown })?.verdicts)
              ? {
                  ok: true,
                  value: (json as { verdicts: unknown[] }).verdicts,
                }
              : { ok: false, error: 'Objek harus memuat larik "verdicts"' },
        );
        if (!result.ok) {
          error = result.error;
          return;
        }
        for (const raw of result.value) {
          const item = raw as {
            i?: unknown;
            valid?: unknown;
            reason?: unknown;
          };
          if (
            typeof item.i !== "number" ||
            !indexes.includes(item.i) ||
            typeof item.valid !== "boolean"
          )
            continue;
          verdicts[item.i] = {
            valid: item.valid,
            reason:
              typeof item.reason === "string" ? item.reason.slice(0, 160) : "",
          };
        }
      } catch (e) {
        error = e instanceof Error ? e.message.slice(0, 120) : "gagal";
      }
    }),
  );
  return { verdicts, error };
}
