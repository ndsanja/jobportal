import {
  extractHtmlLinks,
  extractMarkdownLinks,
  type PageLink,
} from "@/domain/discovery";
import { findHtmlMetaDate } from "@/domain/page-date";
import { htmlToText } from "@/domain/text";
import type { FetchLike } from "@/server/ingest/types";

export type PageWithLinks = {
  text: string;
  links: PageLink[];
  via: "fetch" | "firecrawl";
};

const tidy = (text: string, maxChars: number) =>
  text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxChars);

/**
 * Mengambil teks halaman BESERTA tautannya (agen penemu butuh tautan ke situs resmi tiap program).
 * `fetch` biasa dulu (gratis); halaman yang dirender JavaScript/terlalu pendek diulang lewat Firecrawl.
 */
export async function fetchPageWithLinks(
  url: string,
  options: { fetch: FetchLike; firecrawlKey?: string; maxChars: number },
): Promise<PageWithLinks> {
  const host = new URL(url).host;
  let plainError: unknown = null;
  try {
    const response = await options.fetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok)
      throw new Error(`Permintaan ke ${host} gagal: HTTP ${response.status}`);
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("html")) throw new Error(`${host} bukan halaman HTML`);
    const html = await response.text();
    const metaDate = findHtmlMetaDate(html);
    const text = tidy(
      `${metaDate ? `Page last modified (metadata): ${metaDate}\n\n` : ""}${htmlToText(html)}`,
      options.maxChars,
    );
    if (text.length >= 500)
      return { text, links: extractHtmlLinks(html, url), via: "fetch" };
    plainError = new Error(`Konten ${host} terlalu pendek`);
  } catch (error) {
    plainError = error;
  }

  if (!options.firecrawlKey) throw plainError;
  const response = await options.fetch("https://api.firecrawl.dev/v1/scrape", {
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
  });
  if (!response.ok)
    throw new Error(`Firecrawl gagal untuk ${host}: HTTP ${response.status}`);
  const body = (await response.json()) as {
    success?: boolean;
    data?: { markdown?: string };
  };
  const markdown = body.data?.markdown;
  if (!body.success || !markdown)
    throw new Error(`Firecrawl tidak mengembalikan konten untuk ${host}`);
  return {
    // Teks untuk model & validasi kutipan: tautan markdown diganti teksnya saja.
    text: tidy(
      markdown.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1"),
      options.maxChars,
    ),
    links: extractMarkdownLinks(markdown, url),
    via: "firecrawl",
  };
}
