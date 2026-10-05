import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BriefContent } from "@/domain/brief";
import {
  CLAIM_FIELD_NAMES,
  type ClaimEvidence,
  DEFAULT_REPUTABLE_DOMAINS,
  quoteKey,
  type SourceTier,
} from "@/domain/claims";
import type { Database, Json } from "@/lib/supabase/database.types";
import { DEFAULT_MODEL } from "@/server/ai/openrouter";
import { sourceConfigSchema } from "@/server/ingest/config";
import { fetchPageTextWithFallback } from "@/server/ingest/page-fetch";
import type { FetchLike, IngestSource } from "@/server/ingest/types";
import {
  BRIEF_PROMPT_VERSION,
  type BriefClaim,
  briefInputHash,
  synthesizeBrief,
} from "./brief";
import { decideSubject, type SubjectClaimRow } from "./decide";
import { extractClaims, RESEARCH_PROMPT_VERSION } from "./extract";
import { type Collected, gatherClaims, type PageReport } from "./gather";
import { type Recency, searchWeb } from "./search";
import { verifyClaims } from "./verify";

type Db = SupabaseClient<Database>;

export type ResearchStats = {
  queries: number;
  pagesFound: number;
  pagesRead: number;
  pagesUnchanged: number;
  pagesFailed: number;
  pagesSkipped: number;
  claimsExtracted: number;
  /** Ditolak validasi kutipan/skema. */
  claimsRejected: number;
  /** Dibuang pemeriksa fakta (usang, negara lain, tidak didukung kutipan, dsb.). */
  claimsDropped: number;
  accepted: number;
  disputed: number;
  proposed: number;
  /** true bila waktu habis sebelum semua halaman terbaca. */
  partial: boolean;
  errors: string[];
  timingsMs: {
    search: number;
    fetch: number;
    extract: number;
    verify: number;
    brief: number;
  };
  /** Status panduan akhir: dibuat / tidak berubah / gagal / dilewati. */
  brief: string;
  /** Laporan per halaman: dibaca, dilewati (beserta alasannya), tanggal pembaruan. */
  pages: PageReport[];
  /** Hanya dry-run: seluruh klaim hasil keputusan, klaim yang dibuang, dan panduan akhir. */
  claims?: Array<{
    field: string;
    summary: string;
    status: string;
    confidence: number;
    tier: SourceTier;
    domains: string[];
    asOf: string | null;
  }>;
  dropped?: Array<{ summary: string; domain: string; reason: string }>;
  guide?: BriefContent;
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
/** Sisa waktu (ms) sebelum batas yang dibutuhkan untuk pemeriksaan fakta & penyusunan panduan. */
const POST_GATHER_RESERVE_MS = 120_000;

function must<T>(
  result: { data: T | null; error: { message: string } | null },
  action: string,
): T {
  if (result.error) throw new Error(`${action}: ${result.error.message}`);
  return result.data as T;
}

const chunked = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
};

type EvidenceLike = {
  domain: string;
  tier: SourceTier;
  quote: string;
  asOf: string | null;
};

/** Ringkas bukti sebuah klaim untuk panduan: tingkat terbaik, domain unik, tanggal terbaru, kutipan resmi dulu. */
function summarizeEvidence(evidence: EvidenceLike[]) {
  const sorted = [...evidence].sort(
    (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier],
  );
  return {
    tier: (sorted[0]?.tier ?? "community") as SourceTier,
    domains: [...new Set(sorted.map((e) => e.domain))],
    asOf:
      evidence
        .map((e) => e.asOf)
        .filter((d): d is string => Boolean(d))
        .sort()
        .at(-1) ?? null,
    quote: sorted[0]?.quote ?? "",
  };
}

/**
 * Agen riset: cari di web → baca halaman (resmi lebih dulu) → model mengekstrak klaim dengan
 * kutipan → pemeriksa fakta menyaring yang usang/bukan untuk Indonesia/tidak didukung kutipan →
 * simpan klaim + bukti → hitung status & keyakinan → susun panduan akhir yang informatif.
 * Hasil pada bidang "requirement.*" hanya menjadi `accepted` bila ada sumber resmi yang masih
 * berlaku; sumber lain tampil berlabel "belum resmi".
 */
export async function runResearch(
  db: Db,
  source: IngestSource,
  deps: ResearchDeps,
  options: {
    dryRun: boolean;
    now: Date;
    deadlineMs: number;
    reset?: boolean;
  },
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
  const recencyOf = new Map<string, Recency | undefined>();
  const queries = config.queries.map((entry) => {
    const q = typeof entry === "string" ? entry : entry.q;
    recencyOf.set(q, typeof entry === "string" ? undefined : entry.recency);
    return q;
  });

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
    pagesSkipped: 0,
    claimsExtracted: 0,
    claimsRejected: 0,
    claimsDropped: 0,
    accepted: 0,
    disputed: 0,
    proposed: 0,
    partial: false,
    errors: [],
    timingsMs: { search: 0, fetch: 0, extract: 0, verify: 0, brief: 0 },
    brief: "dilewati",
    pages: [],
  };
  const note = (message: string) => {
    if (stats.errors.length < 8) stats.errors.push(message);
  };

  // --- 1-2. Kumpulkan: cari → baca → ekstrak (tahan banting; lihat gather.ts) ----
  const doFetch = deps.fetch;
  const gatheredResult = await gatherClaims({
    queries,
    seedUrls: config.seed_urls,
    maxPages: config.max_pages,
    rules,
    // Sisakan waktu untuk pemeriksaan fakta & penyusunan panduan.
    deadlineMs: options.deadlineMs - POST_GATHER_RESERVE_MS,
    hashSalt: RESEARCH_PROMPT_VERSION,
    search: (query) =>
      searchWeb(query, {
        apiKey: firecrawlKey,
        limit: config.results_per_query,
        fetch: doFetch,
        recency: recencyOf.get(query),
      }),
    loadKnownHashes: async (urls) => {
      // Dry-run tidak menyimpan apa pun, dan reset membangun ulang: keduanya wajib membaca ulang semua halaman.
      if (options.dryRun || options.reset) return new Map<string, string>();
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
  const { readPages, unchangedUrls, reports, stats: gathered } = gatheredResult;
  Object.assign(stats, gathered);
  stats.timingsMs = { ...gathered.timingsMs, verify: 0, brief: 0 };
  stats.pages = reports;

  // --- 2b. Pemeriksa fakta: saring klaim usang/bukan untuk Indonesia/tak didukung kutipan ----
  let collected: Collected[] = gatheredResult.collected;
  const dropped: NonNullable<ResearchStats["dropped"]> = [];
  if (collected.length > 0) {
    if (Date.now() > options.deadlineMs - 60_000) {
      note("pemeriksaan fakta dilewati (waktu hampir habis)");
      stats.partial = true;
    } else {
      const started = Date.now();
      const check = await verifyClaims(
        collected,
        { description: config.description },
        { apiKey, model, fetch: doFetch, now: options.now },
      );
      stats.timingsMs.verify = Date.now() - started;
      if (check.error) note(`pemeriksa fakta: ${check.error}`);
      collected = collected.filter((claim, index) => {
        const verdict = check.verdicts[index];
        if (verdict?.valid !== false) return true;
        dropped.push({
          summary: claim.summary,
          domain: claim.domain,
          reason: verdict.reason || "ditolak pemeriksa fakta",
        });
        return false;
      });
      stats.claimsDropped = dropped.length;
    }
  }

  // --- 3a. Dry-run: nilai di memori saja ------------------------------------
  if (options.dryRun) {
    const groups = new Map<
      string,
      { row: SubjectClaimRow; items: Collected[] }
    >();
    for (const c of collected) {
      const id = `${c.field}|${c.valueKey}`;
      const group = groups.get(id) ?? {
        row: {
          id,
          field: c.field,
          value_key: c.valueKey,
          status: "proposed",
          decided_by: "system" as const,
          evidence: [] as ClaimEvidence[],
        },
        items: [] as Collected[],
      };
      group.row.evidence.push({
        domain: c.domain,
        tier: c.tier,
        stance: "supports",
        asOf: c.asOf,
      });
      group.items.push(c);
      groups.set(id, group);
    }
    const updates = decideSubject(
      [...groups.values()].map((g) => g.row),
      options.now,
    );
    tally(stats, updates);

    const decided = [...groups.values()].map((group) => {
      const update = updates.find((u) => u.id === group.row.id);
      const evidence = summarizeEvidence(
        group.items.map((i) => ({
          domain: i.domain,
          tier: i.tier,
          quote: i.quote,
          asOf: i.asOf,
        })),
      );
      return {
        id: group.row.id,
        field: group.row.field,
        value: group.items[0]?.value,
        summary: group.items[0]?.summary ?? "",
        status: update?.status ?? "proposed",
        confidence: update?.confidence ?? 0,
        ...evidence,
      };
    });
    stats.claims = decided
      .map(({ field, summary, status, confidence, tier, domains, asOf }) => ({
        field,
        summary,
        status,
        confidence,
        tier,
        domains,
        asOf,
      }))
      .sort((a, b) => a.field.localeCompare(b.field));
    stats.dropped = dropped.slice(0, 25);

    const briefClaims: BriefClaim[] = decided.flatMap((d) =>
      d.status === "accepted" || d.status === "disputed"
        ? [{ ...d, status: d.status }]
        : [],
    );
    if (briefClaims.length > 0 && Date.now() < options.deadlineMs - 15_000) {
      const started = Date.now();
      const guide = await synthesizeBrief(
        briefClaims,
        { description: config.description },
        { apiKey, model, fetch: doFetch, now: options.now },
      ).catch((e: unknown) => ({
        ok: false as const,
        error: e instanceof Error ? e.message.slice(0, 120) : "gagal",
      }));
      stats.timingsMs.brief = Date.now() - started;
      if (guide.ok) {
        stats.guide = guide.value;
        stats.brief = "dibuat (dry-run, tidak disimpan)";
      } else {
        stats.brief = `gagal: ${guide.error}`;
      }
    }
    return stats;
  }

  // --- 3b. Simpan klaim + bukti ---------------------------------------------
  const touchedClaimIds = new Set<string>();
  if (readPages.length > 0) {
    // Halaman yang dibaca ulang menggantikan bukti lamanya (isi/versi prompt bisa berbeda).
    const readUrls = new Set(readPages.map((p) => p.url));
    const subjectClaimIds = must(
      await db
        .from("claims")
        .select("id")
        .eq("subject_key", subject.subject_key),
      "Gagal membaca klaim",
    ).map((row) => row.id);
    for (const idChunk of chunked(subjectClaimIds, 50)) {
      const stale = must(
        await db
          .from("claim_evidence")
          .select("id, source_url")
          .in("claim_id", idChunk),
        "Gagal membaca bukti lama",
      )
        .filter((e) => readUrls.has(e.source_url))
        .map((e) => e.id);
      for (const evChunk of chunked(stale, 50)) {
        must(
          await db.from("claim_evidence").delete().in("id", evChunk),
          "Gagal menghapus bukti lama",
        );
      }
    }
  }

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
          page_date: c.asOf,
          model,
          retrieved_at: nowIso,
        },
      ];
    });
    for (const rowsChunk of chunked(evidenceRows, 50)) {
      must(
        await db.from("claim_evidence").upsert(rowsChunk, {
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
    for (const idChunk of chunked([...touchedClaimIds], 50)) {
      await db
        .from("claims")
        .update({ last_verified_at: nowIso })
        .in("id", idChunk);
    }
  }

  // --- 4. Bersihkan klaim sistem tanpa bukti, lalu hitung ulang status & keyakinan ----
  const all = must(
    await db
      .from("claims")
      .select(
        "id, field, value, summary, value_key, status, confidence, decided_by, claim_evidence(source_domain, source_tier, stance, quote, page_date)",
      )
      .eq("subject_key", subject.subject_key),
    "Gagal membaca klaim subjek",
  );
  // Reset: klaim sistem yang tidak ditemukan lagi pada run ini ikut dibuang, tetapi hanya bila run lengkap
  // (tidak partial, tanpa halaman gagal) agar run yang terpotong tidak mengosongkan halaman publik.
  const complete = !stats.partial && stats.pagesFailed === 0;
  const orphanIds = all
    .filter(
      (row) =>
        row.decided_by === "system" &&
        (row.claim_evidence.length === 0 ||
          (options.reset && complete && !touchedClaimIds.has(row.id))),
    )
    .map((row) => row.id);
  for (const idChunk of chunked(orphanIds, 50)) {
    must(
      await db.from("claims").delete().in("id", idChunk),
      "Gagal membersihkan klaim tanpa bukti",
    );
  }
  const live = all.filter((row) => !orphanIds.includes(row.id));

  const rows: SubjectClaimRow[] = live.map((row) => ({
    id: row.id,
    field: row.field,
    value_key: row.value_key,
    status: row.status,
    decided_by: row.decided_by as "system" | "admin",
    evidence: row.claim_evidence.map((e) => ({
      domain: e.source_domain,
      tier: e.source_tier as SourceTier,
      stance: e.stance as "supports" | "contradicts",
      asOf: e.page_date,
    })),
  }));
  const updates = decideSubject(rows, options.now);
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

  // --- 5. Panduan akhir: disusun ulang hanya bila klaim berubah -----------------
  const finalById = new Map(updates.map((u) => [u.id, u]));
  const briefClaims: BriefClaim[] = live.flatMap((row) => {
    const update = finalById.get(row.id);
    const status = update?.status ?? row.status;
    if (status !== "accepted" && status !== "disputed") return [];
    return [
      {
        id: row.id,
        field: row.field,
        value: row.value,
        summary: row.summary,
        status,
        confidence: update?.confidence ?? row.confidence,
        ...summarizeEvidence(
          row.claim_evidence.map((e) => ({
            domain: e.source_domain,
            tier: e.source_tier as SourceTier,
            quote: e.quote,
            asOf: e.page_date,
          })),
        ),
      },
    ];
  });

  if (briefClaims.length === 0) {
    stats.brief = "tidak ada klaim publik";
  } else if (Date.now() > options.deadlineMs - 15_000) {
    stats.brief = "dilewati (waktu habis; disusun pada run berikutnya)";
  } else {
    const hash = sha256(
      `${BRIEF_PROMPT_VERSION}|${model}|${briefInputHash(briefClaims)}`,
    );
    const { data: current } = await db
      .from("subject_briefs")
      .select("input_hash")
      .eq("subject_key", subject.subject_key)
      .maybeSingle();
    if (current?.input_hash === hash) {
      stats.brief = "tidak berubah";
    } else {
      const started = Date.now();
      const guide = await synthesizeBrief(
        briefClaims,
        { description: config.description },
        { apiKey, model, fetch: doFetch, now: options.now },
      ).catch((e: unknown) => ({
        ok: false as const,
        error: e instanceof Error ? e.message.slice(0, 120) : "gagal",
      }));
      stats.timingsMs.brief = Date.now() - started;
      if (guide.ok) {
        must(
          await db.from("subject_briefs").upsert(
            {
              subject_key: subject.subject_key,
              subject_type: subject.subject_type,
              opportunity_id: subject.opportunity_id,
              track: subject.track,
              content: guide.value as unknown as Json,
              input_hash: hash,
              model,
              prompt_version: BRIEF_PROMPT_VERSION,
              generated_at: nowIso,
            },
            { onConflict: "subject_key" },
          ),
          "Gagal menyimpan panduan",
        );
        stats.brief = "dibuat";
      } else {
        stats.brief = `gagal: ${guide.error}`;
        note(`panduan: ${guide.error}`);
      }
    }
  }
  return stats;
}

function tally(stats: ResearchStats, updates: Array<{ status: string }>) {
  for (const update of updates) {
    if (update.status === "accepted") stats.accepted += 1;
    else if (update.status === "disputed") stats.disputed += 1;
    else stats.proposed += 1;
  }
}
