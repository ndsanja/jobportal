import { findHtmlMetaDate } from "@/domain/page-date";
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
  let metaDate: string | null = null;

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
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok)
      throw new Error(`Firecrawl gagal untuk ${host}: HTTP ${response.status}`);
    const body = (await response.json()) as {
      success?: boolean;
      data?: {
        markdown?: string;
        metadata?: Record<string, unknown>;
      };
    };
    if (!body.success || !body.data?.markdown)
      throw new Error(`Firecrawl tidak mengembalikan konten untuk ${host}`);
    text = body.data.markdown;
    const meta = body.data.metadata ?? {};
    const raw = [
      meta.modifiedTime,
      meta["article:modified_time"],
      meta["og:updated_time"],
      meta.dateModified,
    ].find((v): v is string => typeof v === "string");
    metaDate = raw && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
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
    const html = await response.text();
    metaDate = findHtmlMetaDate(html);
    text = htmlToText(html);
  }

  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Metadata tanggal (tidak ikut dalam teks hasil konversi) ditaruh di awal agar bisa dikutip sebagai bukti.
  if (metaDate) text = `Page last modified (metadata): ${metaDate}\n\n${text}`;
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
