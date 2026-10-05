import { createHash } from "node:crypto";
import {
  classifyTier,
  domainOf,
  type SourceTier,
  type TierRules,
  valueKey,
} from "@/domain/claims";
import { normalizeForMatch } from "@/domain/scholarship-extraction";
import type { ClaimExtraction } from "./extract";
import type { SearchResult } from "./search";

export type Collected = {
  field: string;
  value: unknown;
  valueKey: string;
  summary: string;
  quote: string;
  url: string;
  domain: string;
  tier: SourceTier;
  pageHash: string;
};

export type GatherStats = {
  queries: number;
  pagesFound: number;
  pagesRead: number;
  pagesUnchanged: number;
  pagesFailed: number;
  claimsExtracted: number;
  claimsRejected: number;
  partial: boolean;
  /** Galat per tahap (tanpa kunci/URL penuh) agar mudah didiagnosis. Maks. 8. */
  errors: string[];
  /** Total waktu per tahap (ms). */
  timingsMs: { search: number; fetch: number; extract: number };
};

export type GatherParams = {
  queries: string[];
  maxPages: number;
  rules: TierRules;
  deadlineMs: number;
  search: (query: string) => Promise<SearchResult[]>;
  loadKnownHashes: (urls: string[]) => Promise<Map<string, string>>;
  fetchPage: (url: string) => Promise<string>;
  extract: (text: string) => Promise<ClaimExtraction>;
  now?: () => number;
};

const TIER_ORDER: Record<SourceTier, number> = {
  official: 0,
  reputable: 1,
  community: 2,
};
const MAX_ERRORS = 8;

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const describeError = (error: unknown): string => {
  const name = (error as { name?: string } | null)?.name;
  const message = error instanceof Error ? error.message : String(error);
  if (
    name === "TimeoutError" ||
    name === "AbortError" ||
    /aborted due to timeout/i.test(message)
  )
    return "timeout";
  return message.slice(0, 160);
};

/**
 * Tahap pengumpulan: cari → urutkan (resmi dulu) → baca → ekstrak. Kegagalan satu kueri/halaman
 * (termasuk timeout) dicatat dan dilewati; tidak pernah menjatuhkan seluruh run.
 */
export async function gatherClaims(params: GatherParams): Promise<{
  collected: Collected[];
  readPages: Array<{ url: string; hash: string }>;
  unchangedUrls: string[];
  stats: GatherStats;
}> {
  const clock = params.now ?? Date.now;
  const stats: GatherStats = {
    queries: 0,
    pagesFound: 0,
    pagesRead: 0,
    pagesUnchanged: 0,
    pagesFailed: 0,
    claimsExtracted: 0,
    claimsRejected: 0,
    partial: false,
    errors: [],
    timingsMs: { search: 0, fetch: 0, extract: 0 },
  };
  const note = (message: string) => {
    if (stats.errors.length < MAX_ERRORS) stats.errors.push(message);
  };
  const timed = async <T>(
    stage: keyof GatherStats["timingsMs"],
    run: () => Promise<T>,
  ): Promise<T> => {
    const start = clock();
    try {
      return await run();
    } finally {
      stats.timingsMs[stage] += clock() - start;
    }
  };

  // 1. Cari
  const found = new Map<string, number>();
  for (const [index, query] of params.queries.entries()) {
    if (clock() > params.deadlineMs) {
      stats.partial = true;
      break;
    }
    try {
      const results = await timed("search", () => params.search(query));
      stats.queries += 1;
      for (const result of results)
        if (!found.has(result.url)) found.set(result.url, found.size);
    } catch (error) {
      note(`cari #${index + 1}: ${describeError(error)}`);
    }
  }
  stats.pagesFound = found.size;

  const pages = [...found.entries()]
    .map(([url, order]) => ({
      url,
      order,
      tier: classifyTier(url, params.rules),
    }))
    .sort(
      (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.order - b.order,
    )
    .slice(0, params.maxPages);

  const known =
    pages.length > 0
      ? await params.loadKnownHashes(pages.map((p) => p.url))
      : new Map<string, string>();

  // 2. Baca & ekstrak
  const collected: Collected[] = [];
  const readPages: Array<{ url: string; hash: string }> = [];
  const unchangedUrls: string[] = [];

  for (const page of pages) {
    if (clock() > params.deadlineMs) {
      stats.partial = true;
      break;
    }
    const host = domainOf(page.url);

    let text: string;
    try {
      text = await timed("fetch", () => params.fetchPage(page.url));
    } catch (error) {
      stats.pagesFailed += 1;
      note(`baca ${host}: ${describeError(error)}`);
      continue;
    }

    const hash = sha256(normalizeForMatch(text));
    if (known.get(page.url) === hash) {
      stats.pagesUnchanged += 1;
      unchangedUrls.push(page.url);
      continue;
    }

    let extraction: ClaimExtraction;
    try {
      extraction = await timed("extract", () => params.extract(text));
    } catch (error) {
      stats.pagesFailed += 1;
      note(`ekstrak ${host}: ${describeError(error)}`);
      continue;
    }
    if (!extraction.ok) {
      stats.pagesFailed += 1;
      note(`ekstrak ${host}: ${extraction.error}`);
      continue;
    }

    stats.pagesRead += 1;
    stats.claimsExtracted += extraction.claims.length;
    stats.claimsRejected += extraction.rejected.length;
    readPages.push({ url: page.url, hash });
    for (const claim of extraction.claims) {
      collected.push({
        field: claim.field,
        value: claim.value,
        valueKey: valueKey(claim.value),
        summary: claim.summary,
        quote: claim.evidence,
        url: page.url,
        domain: host,
        tier: page.tier,
        pageHash: hash,
      });
    }
  }

  return { collected, readPages, unchangedUrls, stats };
}
