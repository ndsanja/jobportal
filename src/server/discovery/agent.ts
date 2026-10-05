import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type DiscoveredCandidate,
  findDuplicate,
  isInstitutionalHost,
  type KnownOpportunity,
  pageMentionsName,
  pickQueries,
  scoreCandidate,
} from "@/domain/discovery";
import { normalizeForMatch } from "@/domain/scholarship-extraction";
import type { Database, Json } from "@/lib/supabase/database.types";
import { DEFAULT_MODEL } from "@/server/ai/openrouter";
import { sourceConfigSchema } from "@/server/ingest/config";
import { fetchPageTextWithFallback } from "@/server/ingest/page-fetch";
import type { FetchLike, IngestSource } from "@/server/ingest/types";
import { searchWeb } from "@/server/research/search";
import { normalizeQueries } from "@/server/research/subject";
import { DISCOVERY_PROMPT_VERSION, extractCandidates } from "./extract";
import { fetchPageWithLinks } from "./fetch";

type Db = SupabaseClient<Database>;

export type DiscoveryStats = {
  queries: string[];
  pagesFound: number;
  pagesRead: number;
  pagesUnchanged: number;
  pagesFailed: number;
  candidatesFound: number;
  rejected: number;
  duplicates: number;
  newCandidates: number;
  updatedCandidates: number;
  linksVerified: number;
  /** Kandidat yang tidak diantrekan: tanpa tautan resmi atau skor di bawah `min_score`. */
  lowQuality: number;
  partial: boolean;
  errors: string[];
  timingsMs: { search: number; fetch: number; extract: number; verify: number };
  /** Hanya dry-run: kandidat yang akan masuk antrean admin. */
  preview?: Array<{
    name: string;
    organizer: string | null;
    country: string | null;
    officialUrl: string | null;
    linkVerified: boolean;
    openToIndonesia: string;
    deadline: string | null;
    score: number;
    duplicateOf: string | null;
    source: string;
  }>;
};

export type DiscoveryDeps = {
  fetch: FetchLike;
  env: {
    FIRECRAWL_API_KEY?: string;
    OPENROUTER_API_KEY?: string;
    OPENROUTER_MODEL?: string;
  };
};

const DAY_MS = 86_400_000;
const PAGE_CONCURRENCY = 4;
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const describeError = (error: unknown): string => {
  const name = (error as { name?: string } | null)?.name;
  const message = error instanceof Error ? error.message : String(error);
  if (name === "TimeoutError" || /aborted due to timeout/i.test(message))
    return "timeout";
  return message.slice(0, 140);
};

/** Menjalankan fungsi atas daftar item dengan konkurensi terbatas, berhenti bila waktu habis. */
async function pool<T>(
  items: T[],
  concurrency: number,
  deadlineMs: number,
  run: (item: T) => Promise<void>,
): Promise<boolean> {
  const queue = [...items];
  let cut = false;
  const worker = async () => {
    for (;;) {
      if (Date.now() > deadlineMs) {
        if (queue.length > 0) cut = true;
        return;
      }
      const item = queue.shift();
      if (item === undefined) return;
      await run(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return cut;
}

type Found = DiscoveredCandidate & {
  sources: Array<{ url: string; quote: string }>;
};

/**
 * Agen penemu: cari di web (kueri digilir) → baca halaman beserta tautannya → AI menemukan
 * kandidat program (kutipan & tautan resmi divalidasi) → buang duplikat peluang yang sudah ada →
 * periksa tautan resmi benar-benar menyebut programnya → simpan ke antrean admin dengan skor.
 */
export async function runDiscovery(
  db: Db,
  source: IngestSource,
  deps: DiscoveryDeps,
  options: { dryRun: boolean; now: Date; deadlineMs: number },
): Promise<DiscoveryStats> {
  const parsed = sourceConfigSchema.safeParse(source.config);
  if (!parsed.success || parsed.data.provider !== "discovery_agent") {
    throw new Error(`Konfigurasi agen penemu "${source.slug}" tidak valid.`);
  }
  const config = parsed.data;
  const { FIRECRAWL_API_KEY: firecrawlKey, OPENROUTER_API_KEY: apiKey } =
    deps.env;
  if (!firecrawlKey) throw new Error("FIRECRAWL_API_KEY belum diatur.");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY belum diatur.");
  const model = deps.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const now = options.now;
  const nowIso = now.toISOString();

  // Kueri boleh memuat {year} dan {next} agar tidak perlu diperbarui tiap tahun.
  const year = now.getUTCFullYear();
  const picked = pickQueries(
    normalizeQueries(config.queries),
    config.queries_per_run,
    now,
    DAY_MS,
  ).map((query) => ({
    ...query,
    q: query.q
      .replaceAll("{year}", String(year))
      .replaceAll("{next}", String(year + 1)),
  }));
  const stats: DiscoveryStats = {
    queries: picked.map((q) => q.q),
    pagesFound: 0,
    pagesRead: 0,
    pagesUnchanged: 0,
    pagesFailed: 0,
    candidatesFound: 0,
    rejected: 0,
    duplicates: 0,
    newCandidates: 0,
    updatedCandidates: 0,
    linksVerified: 0,
    lowQuality: 0,
    partial: false,
    errors: [],
    timingsMs: { search: 0, fetch: 0, extract: 0, verify: 0 },
  };
  const note = (message: string) => {
    if (stats.errors.length < 10) stats.errors.push(message);
  };

  // --- 1. Cari ---------------------------------------------------------------
  const urls: string[] = [];
  const searchStart = Date.now();
  for (const query of picked) {
    try {
      const results = await searchWeb(query.q, {
        apiKey: firecrawlKey,
        limit: config.results_per_query,
        fetch: deps.fetch,
        recency: query.recency,
      });
      for (const r of results) if (!urls.includes(r.url)) urls.push(r.url);
    } catch (error) {
      note(`cari "${query.q.slice(0, 40)}": ${describeError(error)}`);
    }
  }
  stats.timingsMs.search = Date.now() - searchStart;
  stats.pagesFound = urls.length;
  const pages = urls.slice(0, config.max_pages);

  const known = new Map<string, string>();
  if (!options.dryRun && pages.length > 0) {
    const { data } = await db
      .from("discovery_pages")
      .select("url, content_hash")
      .in("url", pages);
    for (const row of data ?? []) known.set(row.url, row.content_hash);
  }

  // --- 2. Baca & temukan kandidat ------------------------------------------
  const found = new Map<string, Found>();
  const readPages: Array<{ url: string; hash: string }> = [];
  const cutPages = await pool(
    pages,
    PAGE_CONCURRENCY,
    options.deadlineMs - 70_000,
    async (url) => {
      const host = new URL(url).host;
      let page: Awaited<ReturnType<typeof fetchPageWithLinks>>;
      const fetchStart = Date.now();
      try {
        page = await fetchPageWithLinks(url, {
          fetch: deps.fetch,
          firecrawlKey,
          maxChars: config.max_chars,
        });
      } catch (error) {
        stats.pagesFailed += 1;
        note(`baca ${host}: ${describeError(error)}`);
        return;
      } finally {
        stats.timingsMs.fetch += Date.now() - fetchStart;
      }
      const hash = sha256(
        `${DISCOVERY_PROMPT_VERSION}|${normalizeForMatch(page.text)}`,
      );
      if (known.get(url) === hash) {
        stats.pagesUnchanged += 1;
        return;
      }
      const extractStart = Date.now();
      try {
        const result = await extractCandidates(
          { ...page, url },
          config.target,
          {
            apiKey,
            model,
            fetch: deps.fetch,
            now,
          },
        );
        if (!result.ok) {
          stats.pagesFailed += 1;
          note(`temukan ${host}: ${result.error}`);
          return;
        }
        stats.pagesRead += 1;
        readPages.push({ url, hash });
        stats.rejected += result.rejected.length;
        stats.candidatesFound += result.candidates.length;
        for (const candidate of result.candidates) {
          // Gabungkan nama yang sama/mirip ("X" vs "X / CSC") atau bertautan resmi sama dalam satu run.
          const existing =
            found.get(candidate.nameKey) ??
            [...found.values()].find((other) =>
              findDuplicate(candidate, [
                {
                  id: other.nameKey,
                  title: other.name,
                  organizationName: null,
                  officialUrl: other.officialUrl,
                  applyUrl: null,
                },
              ]),
            );
          if (existing) {
            existing.sources.push({ url, quote: candidate.evidence });
            existing.officialUrl ??= candidate.officialUrl;
            existing.deadline ??= candidate.deadline;
            if (candidate.openToIndonesia === "yes")
              existing.openToIndonesia = "yes";
          } else {
            found.set(candidate.nameKey, {
              ...candidate,
              sources: [{ url, quote: candidate.evidence }],
            });
          }
        }
      } catch (error) {
        stats.pagesFailed += 1;
        note(`temukan ${host}: ${describeError(error)}`);
      } finally {
        stats.timingsMs.extract += Date.now() - extractStart;
      }
    },
  );
  if (cutPages) stats.partial = true;

  // --- 3. Duplikat terhadap peluang yang ada & kandidat sebelumnya ----------------
  const candidates = [...found.values()];
  const { data: opportunityRows } = await db
    .from("opportunities")
    .select("id, slug, title, official_url, apply_url, organizations(name)")
    .eq("kind", config.target)
    .limit(2000);
  const knownOpportunities: Array<KnownOpportunity & { slug: string }> = (
    opportunityRows ?? []
  ).map((o) => ({
    id: o.id,
    slug: o.slug,
    title: o.title,
    organizationName:
      (o.organizations as { name: string } | null)?.name ?? null,
    officialUrl: o.official_url,
    applyUrl: o.apply_url,
  }));
  const { data: previous } =
    candidates.length > 0
      ? await db
          .from("discovery_candidates")
          .select(
            "id, name_key, status, seen_count, evidence, official_url, link_verified",
          )
          .in(
            "name_key",
            candidates.map((c) => c.nameKey),
          )
      : { data: [] };
  const previousByKey = new Map((previous ?? []).map((p) => [p.name_key, p]));
  const { data: countryRows } = await db.from("countries").select("code");
  const countryCodes = new Set((countryRows ?? []).map((c) => c.code));

  const fresh: Array<Found & { duplicateOf: string | null }> = [];
  for (const candidate of candidates) {
    const duplicate = findDuplicate(candidate, knownOpportunities);
    if (duplicate) {
      stats.duplicates += 1;
      if (options.dryRun)
        fresh.push({
          ...candidate,
          duplicateOf: (duplicate as { slug?: string }).slug ?? duplicate.id,
        });
      continue;
    }
    fresh.push({ ...candidate, duplicateOf: null });
  }

  // --- 4. Periksa tautan resmi kandidat baru ------------------------------------
  const verified = new Map<string, boolean>();
  const toVerify = fresh
    .filter(
      (c) => !c.duplicateOf && c.officialUrl && !previousByKey.has(c.nameKey),
    )
    .slice(0, config.verify_links);
  const verifyStart = Date.now();
  const cutVerify = await pool(
    toVerify,
    PAGE_CONCURRENCY,
    options.deadlineMs - 20_000,
    async (candidate) => {
      try {
        const page = await fetchPageTextWithFallback(
          candidate.officialUrl as string,
          { fetch: deps.fetch, firecrawlKey, maxChars: 20_000 },
        );
        const ok = pageMentionsName(page.text, candidate.name);
        verified.set(candidate.nameKey, ok);
        if (ok) stats.linksVerified += 1;
      } catch (error) {
        verified.set(candidate.nameKey, false);
        note(
          `periksa ${hostOf(candidate.officialUrl)}: ${describeError(error)}`,
        );
      }
    },
  );
  stats.timingsMs.verify = Date.now() - verifyStart;
  if (cutVerify) stats.partial = true;

  const scored = fresh.map((c) => {
    const prior = previousByKey.get(c.nameKey);
    const linkVerified =
      verified.get(c.nameKey) ?? prior?.link_verified ?? false;
    const seenCount = (prior?.seen_count ?? 0) + c.sources.length;
    return {
      ...c,
      linkVerified,
      seenCount,
      score: scoreCandidate({
        linkVerified,
        institutional: isInstitutionalHost(c.officialUrl),
        openToIndonesia: c.openToIndonesia,
        deadline: c.deadline,
        seenCount,
        now,
      }),
    };
  });

  // Antrean admin hanya menerima kandidat bertautan resmi dengan skor cukup (kandidat lama tetap diperbarui).
  const queued = scored.filter(
    (c) =>
      previousByKey.has(c.nameKey) ||
      c.duplicateOf ||
      (c.officialUrl !== null && c.score >= config.min_score),
  );
  stats.lowQuality = scored.length - queued.length;

  if (options.dryRun) {
    stats.preview = queued
      .sort((a, b) => b.score - a.score)
      .map((c) => ({
        name: c.name,
        organizer: c.organizer,
        country: c.countryCode,
        officialUrl: c.officialUrl,
        linkVerified: c.linkVerified,
        openToIndonesia: c.openToIndonesia,
        deadline: c.deadline,
        score: c.score,
        duplicateOf: c.duplicateOf,
        source: c.sources[0]?.url ?? "",
      }));
    stats.newCandidates = queued.filter(
      (c) => !c.duplicateOf && !previousByKey.has(c.nameKey),
    ).length;
    return stats;
  }

  // --- 5. Simpan ke antrean admin ----------------------------------------------
  for (const c of queued) {
    const prior = previousByKey.get(c.nameKey);
    if (prior) {
      const evidence = [
        ...((prior.evidence as Array<{ url: string; quote: string }>) ?? []),
        ...c.sources,
      ].filter(
        (e, index, all) => all.findIndex((x) => x.url === e.url) === index,
      );
      await db
        .from("discovery_candidates")
        .update({
          seen_count: c.seenCount,
          last_seen_at: nowIso,
          evidence: evidence.slice(0, 8) as unknown as Json,
          official_url: prior.official_url ?? c.officialUrl,
          score: c.score,
        })
        .eq("id", prior.id);
      stats.updatedCandidates += 1;
      continue;
    }
    const { error } = await db.from("discovery_candidates").insert({
      name: c.name,
      name_key: c.nameKey,
      kind: c.kind,
      organizer: c.organizer,
      country_code:
        c.countryCode && countryCodes.has(c.countryCode) ? c.countryCode : null,
      levels: c.levels,
      official_url: c.officialUrl,
      link_verified: c.linkVerified,
      open_to_indonesia: c.openToIndonesia,
      deadline: c.deadline,
      summary: c.summary,
      evidence: c.sources.slice(0, 8) as unknown as Json,
      score: c.score,
      seen_count: c.seenCount,
      source_id: source.id,
      model,
    });
    if (error) note(`simpan "${c.name.slice(0, 40)}": ${error.message}`);
    else stats.newCandidates += 1;
  }

  if (readPages.length > 0) {
    await db.from("discovery_pages").upsert(
      readPages.map((p) => ({
        url: p.url,
        content_hash: p.hash,
        last_fetched_at: nowIso,
        source_id: source.id,
      })),
      { onConflict: "url" },
    );
  }
  return stats;
}

function hostOf(url: string | null): string {
  try {
    return url ? new URL(url).host : "?";
  } catch {
    return "?";
  }
}
