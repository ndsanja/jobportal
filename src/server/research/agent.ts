import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CLAIM_FIELD_NAMES,
  type ClaimEvidence,
  classifyTier,
  DEFAULT_REPUTABLE_DOMAINS,
  domainOf,
  quoteKey,
  type SourceTier,
  valueKey,
} from "@/domain/claims";
import { normalizeForMatch } from "@/domain/scholarship-extraction";
import type { Database, Json } from "@/lib/supabase/database.types";
import { DEFAULT_MODEL } from "@/server/ai/openrouter";
import { sourceConfigSchema } from "@/server/ingest/config";
import { fetchPageTextWithFallback } from "@/server/ingest/page-fetch";
import type { FetchLike, IngestSource } from "@/server/ingest/types";
import { decideSubject, type SubjectClaimRow } from "./decide";
import { extractClaims } from "./extract";
import { type Collected, gatherClaims } from "./gather";
import { searchWeb } from "./search";

type Db = SupabaseClient<Database>;

export type ResearchStats = {
  queries: number;
  pagesFound: number;
  pagesRead: number;
  pagesUnchanged: number;
  pagesFailed: number;
  claimsExtracted: number;
  claimsRejected: number;
  accepted: number;
  disputed: number;
  proposed: number;
  /** true bila waktu habis sebelum semua halaman terbaca. */
  partial: boolean;
  errors: string[];
  timingsMs: { search: number; fetch: number; extract: number };
  /** Hanya pada dry-run: contoh klaim hasil ekstraksi untuk diperiksa manusia. */
  preview?: Array<{
    field: string;
    summary: string;
    tier: SourceTier;
    domain: string;
  }>;
};

export type ResearchDeps = {
  fetch: FetchLike;
  env: {
    FIRECRAWL_API_KEY?: string;
    OPENROUTER_API_KEY?: string;
    OPENROUTER_MODEL?: string;
  };
};

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const TIER_ORDER: Record<SourceTier, number> = {
  official: 0,
  reputable: 1,
  community: 2,
};

function must<T>(
  result: { data: T | null; error: { message: string } | null },
  action: string,
): T {
  if (result.error) throw new Error(`${action}: ${result.error.message}`);
  return result.data as T;
}

/**
 * Agen riset: cari di web → baca halaman (resmi lebih dulu) → model mengekstrak klaim dengan
 * kutipan → simpan klaim + bukti → hitung status & keyakinan. Hasil pada bidang "requirement.*"
 * hanya menjadi `accepted` bila ada sumber resmi; sumber lain tampil berlabel "belum resmi".
 */
export async function runResearch(
  db: Db,
  source: IngestSource,
  deps: ResearchDeps,
  options: { dryRun: boolean; now: Date; deadlineMs: number },
): Promise<ResearchStats> {
  const parsed = sourceConfigSchema.safeParse(source.config);
  if (!parsed.success || parsed.data.provider !== "research_agent") {
    throw new Error(`Konfigurasi agen riset "${source.slug}" tidak valid.`);
  }
  const config = parsed.data;
  const { FIRECRAWL_API_KEY: firecrawlKey, OPENROUTER_API_KEY: apiKey } =
    deps.env;
  if (!firecrawlKey) throw new Error("FIRECRAWL_API_KEY belum diatur.");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY belum diatur.");
  const model = deps.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const nowIso = options.now.toISOString();
  const rules = {
    officialDomains: config.official_domains,
    reputableDomains: config.reputable_domains ?? DEFAULT_REPUTABLE_DOMAINS,
  };

  // --- Subjek -------------------------------------------------------------
  let subject: {
    subject_type: "track" | "opportunity";
    subject_key: string;
    track: Database["public"]["Enums"]["track"] | null;
    opportunity_id: string | null;
  };
  if (config.subject.type === "track") {
    subject = {
      subject_type: "track",
      subject_key: `track:${config.subject.track}`,
      track: config.subject.track,
      opportunity_id: null,
    };
  } else {
    const { data, error } = await db
      .from("opportunities")
      .select("id")
      .eq("slug", config.subject.opportunity_slug)
      .maybeSingle();
    if (error) throw new Error(`Gagal membaca peluang: ${error.message}`);
    if (!data)
      throw new Error(
        `Peluang "${config.subject.opportunity_slug}" tidak ditemukan.`,
      );
    subject = {
      subject_type: "opportunity",
      subject_key: `opportunity:${data.id}`,
      track: null,
      opportunity_id: data.id,
    };
  }

  const stats: ResearchStats = {
    queries: 0,
    pagesFound: 0,
    pagesRead: 0,
    pagesUnchanged: 0,
    pagesFailed: 0,
    claimsExtracted: 0,
    claimsRejected: 0,
    accepted: 0,
    disputed: 0,
    proposed: 0,
    partial: false,
    errors: [],
    timingsMs: { search: 0, fetch: 0, extract: 0 },
  };

  // --- 1-2. Kumpulkan: cari → baca → ekstrak (tahan banting; lihat gather.ts) ----
  const doFetch = deps.fetch;
  const {
    collected,
    readPages,
    unchangedUrls,
    stats: gathered,
  } = await gatherClaims({
    queries: config.queries,
    maxPages: config.max_pages,
    rules,
    // Sisakan ruang agar satu panggilan lambat tidak melewati batas fungsi (300 dtk).
    deadlineMs: options.deadlineMs - 75_000,
    search: (query) =>
      searchWeb(query, {
        apiKey: firecrawlKey,
        limit: config.results_per_query,
        fetch: doFetch,
      }),
    loadKnownHashes: async (urls) => {
      const { data, error } = await db
        .from("source_pages")
        .select("url, content_hash")
        .eq("source_id", source.id)
        .in("url", urls);
      if (error)
        throw new Error(`Gagal membaca riwayat halaman: ${error.message}`);
      return new Map(
        (data ?? []).flatMap((p) =>
          p.content_hash ? [[p.url, p.content_hash] as const] : [],
        ),
      );
    },
    fetchPage: async (url) =>
      (
        await fetchPageTextWithFallback(url, {
          fetch: doFetch,
          firecrawlKey,
          maxChars: config.max_chars,
        })
      ).text,
    extract: (text) =>
      extractClaims(
        text,
        {
          description: config.description,
          fields: config.fields ?? CLAIM_FIELD_NAMES,
        },
        { apiKey, model, fetch: doFetch, now: options.now },
      ),
  });
  Object.assign(stats, gathered);

  // --- 3a. Dry-run: nilai di memori saja ------------------------------------
  if (options.dryRun) {
    const rows = new Map<string, SubjectClaimRow>();
    for (const c of collected) {
      const id = `${c.field}|${c.valueKey}`;
      const row = rows.get(id) ?? {
        id,
        field: c.field,
        value_key: c.valueKey,
        status: "proposed",
        decided_by: "system" as const,
        evidence: [] as ClaimEvidence[],
      };
      row.evidence.push({ domain: c.domain, tier: c.tier, stance: "supports" });
      rows.set(id, row);
    }
    tally(stats, decideSubject([...rows.values()]));
    stats.preview = collected.slice(0, 12).map((c) => ({
      field: c.field,
      summary: c.summary,
      tier: c.tier,
      domain: c.domain,
    }));
    return stats;
  }

  // --- 3b. Simpan klaim + bukti ---------------------------------------------
  const touchedClaimIds = new Set<string>();
  if (collected.length > 0) {
    const unique = new Map<string, Collected>();
    for (const c of collected) unique.set(`${c.field}|${c.valueKey}`, c);

    must(
      await db.from("claims").upsert(
        [...unique.values()].map((c) => ({
          subject_type: subject.subject_type,
          subject_key: subject.subject_key,
          opportunity_id: subject.opportunity_id,
          track: subject.track,
          field: c.field,
          value: c.value as Json,
          value_key: c.valueKey,
          summary: c.summary,
        })),
        { onConflict: "subject_key,field,value_key", ignoreDuplicates: true },
      ),
      "Gagal menyimpan klaim",
    );

    const ids = new Map<string, string>();
    const existing = must(
      await db
        .from("claims")
        .select("id, field, value_key")
        .eq("subject_key", subject.subject_key),
      "Gagal membaca klaim",
    );
    for (const row of existing)
      ids.set(`${row.field}|${row.value_key}`, row.id);

    const evidenceRows = collected.flatMap((c) => {
      const claimId = ids.get(`${c.field}|${c.valueKey}`);
      if (!claimId) return [];
      touchedClaimIds.add(claimId);
      return [
        {
          claim_id: claimId,
          source_url: c.url,
          source_domain: c.domain,
          source_tier: c.tier,
          stance: "supports",
          quote: c.quote,
          quote_key: quoteKey(c.quote),
          page_hash: c.pageHash,
          model,
          retrieved_at: nowIso,
        },
      ];
    });
    for (let i = 0; i < evidenceRows.length; i += 50) {
      must(
        await db.from("claim_evidence").upsert(evidenceRows.slice(i, i + 50), {
          onConflict: "claim_id,source_url,quote_key",
          ignoreDuplicates: true,
        }),
        "Gagal menyimpan bukti",
      );
    }
  }

  if (readPages.length > 0) {
    must(
      await db.from("source_pages").upsert(
        readPages.map((p) => ({
          source_id: source.id,
          url: p.url,
          content_hash: p.hash,
          last_fetched_at: nowIso,
          last_changed_at: nowIso,
        })),
        { onConflict: "source_id,url" },
      ),
      "Gagal menyimpan riwayat halaman",
    );
  }

  // Halaman yang tidak berubah → klaim yang bersumber darinya dianggap terverifikasi ulang.
  if (unchangedUrls.length > 0) {
    await db
      .from("source_pages")
      .update({ last_fetched_at: nowIso })
      .eq("source_id", source.id)
      .in("url", unchangedUrls);
    const { data: rows } = await db
      .from("claim_evidence")
      .select("claim_id, claims!inner(subject_key)")
      .in("source_url", unchangedUrls)
      .eq("claims.subject_key", subject.subject_key);
    for (const row of rows ?? []) touchedClaimIds.add(row.claim_id);
  }
  if (touchedClaimIds.size > 0) {
    await db
      .from("claims")
      .update({ last_verified_at: nowIso })
      .in("id", [...touchedClaimIds]);
  }

  // --- 4. Hitung ulang status & keyakinan seluruh klaim subjek ---------------
  const all = must(
    await db
      .from("claims")
      .select(
        "id, field, value_key, status, decided_by, claim_evidence(source_domain, source_tier, stance)",
      )
      .eq("subject_key", subject.subject_key),
    "Gagal membaca klaim subjek",
  );
  const rows: SubjectClaimRow[] = all.map((row) => ({
    id: row.id,
    field: row.field,
    value_key: row.value_key,
    status: row.status,
    decided_by: row.decided_by as "system" | "admin",
    evidence: row.claim_evidence.map((e) => ({
      domain: e.source_domain,
      tier: e.source_tier as SourceTier,
      stance: e.stance as "supports" | "contradicts",
    })),
  }));
  const updates = decideSubject(rows);
  for (const update of updates) {
    await db
      .from("claims")
      .update({
        status: update.status,
        confidence: update.confidence,
        evidence_count: update.evidence_count,
      })
      .eq("id", update.id);
  }
  tally(stats, updates);
  return stats;
}

function tally(stats: ResearchStats, updates: Array<{ status: string }>) {
  for (const update of updates) {
    if (update.status === "accepted") stats.accepted += 1;
    else if (update.status === "disputed") stats.disputed += 1;
    else stats.proposed += 1;
  }
}
