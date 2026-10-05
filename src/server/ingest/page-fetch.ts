import { htmlToText } from "@/domain/text";
import type { FetchLike } from "./types";

export type PageText = { text: string; truncated: boolean };

const HTML_ACCEPT = "text/html,application/xhtml+xml";

/**
 * Mengambil teks halaman. `fetch` biasa untuk halaman HTML statis; `firecrawl` untuk halaman yang
 * dirender JavaScript atau berupa PDF (mengembalikan markdown).
 */
export async function fetchPageText(
  url: string,
  options: {
    fetcher: "fetch" | "firecrawl";
    fetch: FetchLike;
    firecrawlKey?: string;
    maxChars: number;
  },
): Promise<PageText> {
  const host = new URL(url).host;
  let text: string;

  if (options.fetcher === "firecrawl") {
    if (!options.firecrawlKey)
      throw new Error("FIRECRAWL_API_KEY belum diatur.");
    const response = await options.fetch(
      "https://api.firecrawl.dev/v1/scrape",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: true,
        }),
      },
    );
    if (!response.ok)
      throw new Error(`Firecrawl gagal untuk ${host}: HTTP ${response.status}`);
    const body = (await response.json()) as {
      success?: boolean;
      data?: { markdown?: string };
    };
    if (!body.success || !body.data?.markdown)
      throw new Error(`Firecrawl tidak mengembalikan konten untuk ${host}`);
    text = body.data.markdown;
  } else {
    const response = await options.fetch(url, {
      headers: { Accept: HTML_ACCEPT },
    });
    if (!response.ok)
      throw new Error(`Permintaan ke ${host} gagal: HTTP ${response.status}`);
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("pdf"))
      throw new Error(
        `${host} mengembalikan PDF; gunakan fetcher "firecrawl".`,
      );
    text = htmlToText(await response.text());
  }

  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length < 200)
    throw new Error(
      `Konten ${host} terlalu pendek (${text.length} karakter); mungkin dirender JavaScript.`,
    );

  const truncated = text.length > options.maxChars;
  return {
    text: truncated ? text.slice(0, options.maxChars) : text,
    truncated,
  };
}

/** Coba `fetch` biasa dulu (gratis); bila gagal/terlalu pendek/PDF dan ada kunci, ulangi lewat Firecrawl. */
export async function fetchPageTextWithFallback(
  url: string,
  options: { fetch: FetchLike; firecrawlKey?: string; maxChars: number },
): Promise<PageText> {
  try {
    return await fetchPageText(url, {
      fetcher: "fetch",
      fetch: options.fetch,
      maxChars: options.maxChars,
    });
  } catch (error) {
    if (!options.firecrawlKey) throw error;
    return fetchPageText(url, {
      fetcher: "firecrawl",
      fetch: options.fetch,
      firecrawlKey: options.firecrawlKey,
      maxChars: options.maxChars,
    });
  }
}
