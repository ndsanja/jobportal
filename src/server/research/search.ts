import type { FetchLike } from "@/server/ai/json-call";

export type SearchResult = { url: string; title: string };

// Platform sosial yang tidak bisa diambil secara sah/andal (dan tidak bisa diekstrak sebagai teks halaman).
const UNFETCHABLE_HOSTS = [
  "instagram.com",
  "tiktok.com",
  "facebook.com",
  "fb.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "youtu.be",
  "threads.net",
];

export const isFetchableUrl = (url: string): boolean => {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "https:" && protocol !== "http:") return false;
    const host = hostname.toLowerCase().replace(/^www\./, "");
    return !UNFETCHABLE_HOSTS.some(
      (blocked) => host === blocked || host.endsWith(`.${blocked}`),
    );
  } catch {
    return false;
  }
};

/** Parser toleran: Firecrawl mengembalikan `data` sebagai larik, atau objek `{ web: [...] }` pada versi baru. */
export function parseSearchResponse(body: unknown): SearchResult[] {
  const data = (body as { data?: unknown } | null)?.data;
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { web?: unknown } | null)?.web)
      ? (data as { web: unknown[] }).web
      : [];
  const results: SearchResult[] = [];
  for (const entry of list) {
    const item = entry as { url?: unknown; title?: unknown };
    if (typeof item.url === "string" && isFetchableUrl(item.url)) {
      results.push({
        url: item.url,
        title: typeof item.title === "string" ? item.title : item.url,
      });
    }
  }
  return results;
}

export type Recency = "day" | "week" | "month" | "year";
const TBS: Record<Recency, string> = {
  day: "qdr:d",
  week: "qdr:w",
  month: "qdr:m",
  year: "qdr:y",
};

/** Jeda minimum antar-pencarian dalam satu proses (menghindari batas kecepatan Firecrawl). */
const MIN_GAP_MS = 1_200;
let chain: Promise<void> = Promise.resolve();
let lastStart = 0;

/** Antrekan pencarian agar tidak beruntun terlalu cepat walau dipanggil paralel. */
function throttle(): Promise<void> {
  const next = chain.then(async () => {
    const wait = lastStart + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastStart = Date.now();
  });
  chain = next.catch(() => undefined);
  return next;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function searchWeb(
  query: string,
  options: {
    apiKey: string;
    limit: number;
    fetch: FetchLike;
    /** Batasi hasil ke periode terakhir (berguna untuk berita/pengumuman terbaru). */
    recency?: Recency;
    /** Untuk uji: tanpa antre/jeda. */
    noThrottle?: boolean;
  },
): Promise<SearchResult[]> {
  for (let attempt = 0; ; attempt += 1) {
    if (!options.noThrottle) await throttle();
    const response = await options.fetch(
      "https://api.firecrawl.dev/v1/search",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          limit: options.limit,
          ...(options.recency ? { tbs: TBS[options.recency] } : {}),
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );
    // Batas kecepatan: tunggu sesuai Retry-After (maks. 20 dtk) lalu coba lagi, paling banyak 3 kali.
    if (response.status === 429 && attempt < 3 && !options.noThrottle) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(
        Math.min(
          20_000,
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 3_000 * 2 ** attempt,
        ),
      );
      continue;
    }
    if (!response.ok)
      throw new Error(`Pencarian gagal: HTTP ${response.status}`);
    return parseSearchResponse(await response.json());
  }
}
