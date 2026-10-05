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

export async function searchWeb(
  query: string,
  options: { apiKey: string; limit: number; fetch: FetchLike },
): Promise<SearchResult[]> {
  const response = await options.fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, limit: options.limit }),
  });
  if (!response.ok) throw new Error(`Pencarian gagal: HTTP ${response.status}`);
  return parseSearchResponse(await response.json());
}
