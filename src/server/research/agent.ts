import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BriefContent } from "@/domain/brief";
import {
  type ClaimEvidence,
  DEFAULT_REPUTABLE_DOMAINS,
  FIELD_PROFILES,
  type FieldProfile,
  quoteKey,
  type SourceTier,
} from "@/domain/claims";
import type { FactClaim } from "@/domain/facts";
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
import { searchWeb } from "./search";
import {
  normalizeQueries,
  type ResearchSpec,
  type ResearchSubject,
} from "./subject";
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
  /** Ditolak validasi kutipan/skema/angka. */
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

export type ResearchOptions = {
  dryRun: boolean;
  now: Date;
  deadlineMs: number;
  reset?: boolean;
};

/** Hasil riset satu subjek: statistik + klaim akhir (diterima/belum resmi) untuk diterapkan ke listing. */
export type ResearchResult = { stats: ResearchStats; final: FactClaim[] };

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
  url: string;
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

const emptyStats = (): ResearchStats => ({
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
});

/** Ringkasan statistik yang disimpan di research_subjects (tanpa larik besar). */
export const compactStats = (stats: ResearchStats) => ({
  queries: stats.queries,
  pagesRead: stats.pagesRead,
  pagesSkipped: stats.pagesSkipped,
  pagesUnchanged: stats.pagesUnchanged,
  pagesFailed: stats.pagesFailed,
  claimsExtracted: stats.claimsExtracted,
  claimsRejected: stats.claimsRejected,
  claimsDropped: stats.claimsDropped,
  accepted: stats.accepted,
  disputed: stats.disputed,
  proposed: stats.proposed,
  partial: stats.partial,
  errors: stats.errors,
  timingsMs: stats.timingsMs,
  brief: stats.brief,
});

/**
 * Mesin riset untuk SATU subjek: cari di web → baca halaman (resmi lebih dulu) → model mengekstrak
 * klaim berkutipan (angka & tanggal wajib tertulis di kutipan) → pemeriksa fakta menyaring yang
 * usang/bukan untuk Indonesia/bertentangan → simpan klaim + bukti → hitung status & keyakinan →
 * susun panduan akhir. Fakta hanya `accepted` bila didukung sumber resmi yang masih berlaku.
 */
export async function researchSubject(
  db: Db,
  spec: ResearchSpec,
  deps: ResearchDeps,
  options: ResearchOptions,
): Promise<ResearchResult> {
  const { FIRECRAWL_API_KEY: firecrawlKey, OPENROUTER_API_KEY: apiKey } =
    deps.env;
  if (!firecrawlKey) throw new Error("FIRECRAWL_API_KEY belum diatur.");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY belum diatur.");
  const model = deps.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const nowIso = options.now.toISOString();
  const subject = spec.subject;
  const rules = {
    officialDomains: spec.officialDomains,
    reputableDomains: spec.reputableDomains,
  };
  const recencyOf = new Map(spec.queries.map((q) => [q.q, q.recency]));

  const stats = emptyStats();
  const note = (message: string) => {
    if (stats.errors.length < 8) stats.errors.push(message);
  };

  // --- 1-2. Kumpulkan: cari → baca → ekstrak (tahan banting; lihat gather.ts) ----
  const doFetch = deps.fetch;
  const gatheredResult = await gatherClaims({
    queries: spec.queries.map((q) => q.q),
    seedUrls: spec.seedUrls,
    maxPages: spec.maxPages,
    rules,
    // Sisakan waktu untuk pemeriksaan fakta & penyusunan panduan.
    deadlineMs: options.deadlineMs - POST_GATHER_RESERVE_MS,
    hashSalt: RESEARCH_PROMPT_VERSION,
    search: (query) =>
      searchWeb(query, {
        apiKey: firecrawlKey,
        limit: spec.resultsPerQuery,
        fetch: doFetch,
        recency: recencyOf.get(query),
      }),
    loadKnownHashes: async (urls) => {
      // Dry-run tidak menyimpan apa pun, dan reset membangun ulang: keduanya wajib membaca ulang semua halaman.
      if (options.dryRun || options.reset) return new Map<string, string>();
      const { data, error } = await db
        .from("research_pages")
        .select("url, content_hash")
        .eq("subject_key", subject.subject_key)
        .in("url", urls);
      if (error)
        throw new Error(`Gagal membaca riwayat halaman: ${error.message}`);
      return new Map((data ?? []).map((p) => [p.url, p.content_hash] as const));
    },
    fetchPage: async (url) =>
      (
        await fetchPageTextWithFallback(url, {
          fetch: doFetch,
          firecrawlKey,
          maxChars: spec.maxChars,
        })
      ).text,
    extract: (text) =>
      extractClaims(
        text,
        { description: spec.description, fields: spec.fields },
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
        { description: spec.description },
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

  const composeBrief = async (claims: BriefClaim[]) => {
    const started = Date.now();
    const guide = await synthesizeBrief(
      claims,
      { description: spec.description },
      { apiKey, model, fetch: doFetch, now: options.now },
    ).catch((e: unknown) => ({
      ok: false as const,
      error: e instanceof Error ? e.message.slice(0, 120) : "gagal",
    }));
    stats.timingsMs.brief = Date.now() - started;
    return guide;
  };

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
      const evidence = group.items.map((i) => ({
        url: i.url,
        domain: i.domain,
        tier: i.tier,
        quote: i.quote,
        asOf: i.asOf,
      }));
      return {
        id: group.row.id,
        field: group.row.field,
        value: group.items[0]?.value,
        summary: group.items[0]?.summary ?? "",
        status: update?.status ?? "proposed",
        confidence: update?.confidence ?? 0,
        evidenceRows: evidence,
        ...summarizeEvidence(evidence),
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
      const guide = await composeBrief(briefClaims);
      if (guide.ok) {
        stats.guide = guide.value;
        stats.brief = "dibuat (dry-run, tidak disimpan)";
      } else {
        stats.brief = `gagal: ${guide.error}`;
      }
    }
    const final: FactClaim[] = decided.map((d) => ({
      id: d.id,
      field: d.field,
      value: d.value,
      status: d.status,
      confidence: d.confidence,
      evidence: d.evidenceRows.map((e) => ({
        url: e.url,
        tier: e.tier,
        asOf: e.asOf,
      })),
    }));
    return { stats, final };
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
    const reportByUrl = new Map(reports.map((r) => [r.url, r]));
    must(
      await db.from("research_pages").upsert(
        readPages.map((p) => ({
          subject_key: subject.subject_key,
          url: p.url,
          content_hash: p.hash,
          page_date: reportByUrl.get(p.url)?.lastUpdated ?? null,
          outcome: reportByUrl.get(p.url)?.outcome ?? "read",
          last_fetched_at: nowIso,
          last_changed_at: nowIso,
        })),
        { onConflict: "subject_key,url" },
      ),
      "Gagal menyimpan riwayat halaman",
    );
  }

  // Halaman yang tidak berubah → klaim yang bersumber darinya dianggap terverifikasi ulang.
  if (unchangedUrls.length > 0) {
    await db
      .from("research_pages")
      .update({ last_fetched_at: nowIso })
      .eq("subject_key", subject.subject_key)
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
        "id, field, value, summary, value_key, status, confidence, decided_by, claim_evidence(source_url, source_domain, source_tier, stance, quote, page_date)",
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
  const orphanSet = new Set(orphanIds);
  const live = all.filter((row) => !orphanSet.has(row.id));

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

  const finalById = new Map(updates.map((u) => [u.id, u]));
  const final: FactClaim[] = live.map((row) => {
    const update = finalById.get(row.id);
    return {
      id: row.id,
      field: row.field,
      value: row.value,
      status: update?.status ?? row.status,
      confidence: update?.confidence ?? row.confidence,
      evidence: row.claim_evidence.map((e) => ({
        url: e.source_url,
        tier: e.source_tier as SourceTier,
        asOf: e.page_date,
      })),
    };
  });

  // --- 5. Panduan akhir: disusun ulang hanya bila klaim berubah -----------------
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
            url: e.source_url,
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
      const guide = await composeBrief(briefClaims);
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
  return { stats, final };
}

function tally(stats: ResearchStats, updates: Array<{ status: string }>) {
  for (const update of updates) {
    if (update.status === "accepted") stats.accepted += 1;
    else if (update.status === "disputed") stats.disputed += 1;
    else stats.proposed += 1;
  }
}

/** Menyimpan jejak run per subjek (untuk pemantauan admin dan penjadwalan riset ulang). */
export async function recordSubjectState(
  db: Db,
  subject: ResearchSubject,
  profile: FieldProfile,
  outcome: {
    status: "success" | "partial" | "failed";
    stats?: ResearchStats;
    error?: string;
  },
  now: Date,
  nextRunAt: Date | null,
): Promise<void> {
  await db.from("research_subjects").upsert(
    {
      subject_key: subject.subject_key,
      subject_type: subject.subject_type,
      track: subject.track,
      opportunity_id: subject.opportunity_id,
      profile,
      last_run_at: now.toISOString(),
      last_status: outcome.status,
      last_stats: (outcome.stats
        ? compactStats(outcome.stats)
        : { error: outcome.error ?? null }) as unknown as Json,
      next_run_at: nextRunAt?.toISOString() ?? null,
    },
    { onConflict: "subject_key" },
  );
}

/**
 * Sumber `research_agent`: subjek & kueri ditetapkan di config sumber (mis. WHV 462, DAMA).
 * Subjek peluang (beasiswa/program) umumnya diriset otomatis oleh `opportunity_research`.
 */
export async function runResearch(
  db: Db,
  source: IngestSource,
  deps: ResearchDeps,
  options: ResearchOptions,
): Promise<ResearchStats> {
  const parsed = sourceConfigSchema.safeParse(source.config);
  if (!parsed.success || parsed.data.provider !== "research_agent") {
    throw new Error(`Konfigurasi agen riset "${source.slug}" tidak valid.`);
  }
  const config = parsed.data;

  let subject: ResearchSubject;
  let profile: FieldProfile;
  if (config.subject.type === "track") {
    subject = {
      subject_type: "track",
      subject_key: `track:${config.subject.track}`,
      track: config.subject.track,
      opportunity_id: null,
    };
    profile = config.profile ?? "visa_program";
  } else {
    const { data, error } = await db
      .from("opportunities")
      .select("id, kind")
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
    profile =
      config.profile ??
      (data.kind === "scholarship" ? "scholarship" : "job_program");
  }

  const spec: ResearchSpec = {
    subject,
    profile,
    description: config.description,
    queries: normalizeQueries(config.queries),
    seedUrls: config.seed_urls,
    officialDomains: config.official_domains,
    reputableDomains: config.reputable_domains ?? DEFAULT_REPUTABLE_DOMAINS,
    fields: config.fields ?? FIELD_PROFILES[profile],
    maxPages: config.max_pages,
    resultsPerQuery: config.results_per_query,
    maxChars: config.max_chars,
  };
  const { stats } = await researchSubject(db, spec, deps, options);
  if (!options.dryRun) {
    await recordSubjectState(
      db,
      subject,
      profile,
      { status: stats.partial ? "partial" : "success", stats },
      options.now,
      null,
    );
  }
  return stats;
}
