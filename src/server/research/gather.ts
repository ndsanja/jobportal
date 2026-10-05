import { createHash } from "node:crypto";
import {
  classifyTier,
  domainOf,
  isStaleEvidence,
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
  /** Tanggal pembaruan halaman (YYYY-MM-DD) bila tertulis di halaman. */
  asOf: string | null;
};

export type PageReport = {
  url: string;
  domain: string;
  tier: SourceTier;
  /** read = diekstrak; skipped = dilewati (bukan subjek/usang/negara lain); unchanged; failed. */
  outcome: "read" | "skipped" | "unchanged" | "failed";
  lastUpdated: string | null;
  note: string;
  claims: number;
};

export type GatherStats = {
  queries: number;
  pagesFound: number;
  pagesRead: number;
  pagesUnchanged: number;
  pagesFailed: number;
  /** Halaman dibaca tetapi dilewati: bukan tentang subjek, khusus negara lain, atau usang. */
  pagesSkipped: number;
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
  /** URL yang selalu dibaca (mis. halaman resmi utama), tanpa bergantung pada pencarian. */
  seedUrls?: string[];
  maxPages: number;
  rules: TierRules;
  deadlineMs: number;
  search: (query: string) => Promise<SearchResult[]>;
  loadKnownHashes: (urls: string[]) => Promise<Map<string, string>>;
  fetchPage: (url: string) => Promise<string>;
  extract: (text: string) => Promise<ClaimExtraction>;
  now?: () => number;
  /** Ditambahkan ke hash isi halaman agar ekstraksi ulang bila versi prompt berubah. */
  hashSalt?: string;
};

const TIER_ORDER: Record<SourceTier, number> = {
  official: 0,
  reputable: 1,
  community: 2,
};
const MAX_ERRORS = 8;
const PAGE_CONCURRENCY = 4;

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
  reports: PageReport[];
  stats: GatherStats;
}> {
  const clock = params.now ?? Date.now;
  const stats: GatherStats = {
    queries: 0,
    pagesFound: 0,
    pagesRead: 0,
    pagesUnchanged: 0,
    pagesFailed: 0,
    pagesSkipped: 0,
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
  for (const url of params.seedUrls ?? []) found.set(url, found.size);
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
  const reports: PageReport[] = [];
  const report = (
    page: { url: string; tier: SourceTier },
    outcome: PageReport["outcome"],
    extra: Partial<Pick<PageReport, "lastUpdated" | "note" | "claims">> = {},
  ) =>
    reports.push({
      url: page.url,
      domain: domainOf(page.url),
      tier: page.tier,
      outcome,
      lastUpdated: extra.lastUpdated ?? null,
      note: extra.note ?? "",
      claims: extra.claims ?? 0,
    });

  const processPage = async (page: (typeof pages)[number]) => {
    const host = domainOf(page.url);

    let text: string;
    try {
      text = await timed("fetch", () => params.fetchPage(page.url));
    } catch (error) {
      stats.pagesFailed += 1;
      note(`baca ${host}: ${describeError(error)}`);
      report(page, "failed", { note: describeError(error) });
      return;
    }

    const hash = sha256(`${params.hashSalt ?? ""}|${normalizeForMatch(text)}`);
    if (known.get(page.url) === hash) {
      stats.pagesUnchanged += 1;
      unchangedUrls.push(page.url);
      report(page, "unchanged");
      return;
    }

    let extraction: ClaimExtraction;
    try {
      extraction = await timed("extract", () => params.extract(text));
    } catch (error) {
      stats.pagesFailed += 1;
      note(`ekstrak ${host}: ${describeError(error)}`);
      report(page, "failed", { note: describeError(error) });
      return;
    }
    if (!extraction.ok) {
      stats.pagesFailed += 1;
      note(`ekstrak ${host}: ${extraction.error}`);
      report(page, "failed", { note: extraction.error });
      return;
    }

    const meta = extraction.page;
    const skipReason = !meta.aboutSubject
      ? "bukan tentang subjek"
      : meta.indonesia === "no"
        ? "khusus negara lain"
        : meta.outdated
          ? "halaman menyatakan usang/arsip"
          : isStaleEvidence(meta.lastUpdated, new Date(clock()))
            ? `usang (diperbarui ${meta.lastUpdated})`
            : null;
    if (skipReason) {
      stats.pagesSkipped += 1;
      // Tetap catat hash agar halaman yang tidak berubah tidak diproses ulang.
      readPages.push({ url: page.url, hash });
      report(page, "skipped", {
        lastUpdated: meta.lastUpdated,
        note: skipReason,
      });
      return;
    }

    stats.pagesRead += 1;
    stats.claimsExtracted += extraction.claims.length;
    stats.claimsRejected += extraction.rejected.length;
    readPages.push({ url: page.url, hash });
    report(page, "read", {
      lastUpdated: meta.lastUpdated,
      note: meta.note,
      claims: extraction.claims.length,
    });
    for (const claim of extraction.claims) {
      collected.push({
        field: claim.field,
        value: claim.value,
        valueKey: valueKey(claim.value, claim.field),
        summary: claim.summary,
        quote: claim.evidence,
        url: page.url,
        domain: host,
        tier: page.tier,
        pageHash: hash,
        asOf: meta.lastUpdated,
      });
    }
  };

  // Halaman diproses paralel (kolam pekerja) karena ekstraksi LLM adalah tahap paling lambat.
  const queue = [...pages];
  const worker = async () => {
    for (;;) {
      if (clock() > params.deadlineMs) {
        if (queue.length > 0) stats.partial = true;
        return;
      }
      const page = queue.shift();
      if (!page) return;
      await processPage(page);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(PAGE_CONCURRENCY, pages.length) }, worker),
  );

  // Urutan hasil deterministik: resmi dulu, sama seperti urutan halaman.
  const rank = new Map(pages.map((page, index) => [page.url, index]));
  collected.sort((a, b) => (rank.get(a.url) ?? 0) - (rank.get(b.url) ?? 0));

  return { collected, readPages, unchangedUrls, reports, stats };
}
