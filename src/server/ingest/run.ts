import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { type DiscoveryStats, runDiscovery } from "@/server/discovery/agent";
import {
  type AtsDiscoveryStats,
  runAtsDiscovery,
} from "@/server/discovery/ats";
import {
  type DamaEmployerStats,
  runDamaEmployerDiscovery,
} from "@/server/discovery/dama-employers";
import { type EnrichStats, runJobEnrichment } from "@/server/enrich/jobs";
import { type ResearchStats, runResearch } from "@/server/research/agent";
import {
  type OpportunityResearchStats,
  runOpportunityResearch,
} from "@/server/research/opportunities";
import { runAdapter } from "./adapters";
import { defaultFetch } from "./http";
import { type MonitorStats, runMonitor } from "./monitor";
import { type PublishStats, publishItems } from "./publish";
import type { FetchLike, IngestSource } from "./types";

type SourceRow = Database["public"]["Tables"]["sources"]["Row"];

const SCHEDULE_MS: Record<string, number | null> = {
  // Toleransi di bawah 20 menit agar tidak terlewat satu putaran cron karena selisih detik.
  "20m": 15 * 60 * 1000,
  hourly: 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
  manual: null,
};

/** Jenis sumber yang sudah punya adapter. Jenis lain dilewati sampai adapter-nya ada. */
const SUPPORTED_KINDS: SourceRow["kind"][] = ["api", "ats", "monitor"];
const FAILING_AFTER = 3;

export type RunOptions = {
  /** Kelompok sumber (config.group), default "jobs". Diabaikan bila `slug` diberikan. */
  group?: string;
  /** Jalankan satu sumber tertentu, tanpa memeriksa jadwal/status (untuk uji manual). */
  slug?: string;
  /** Uji kering semua sumber berstatus draft sekaligus (hanya bersama dryRun). */
  drafts?: boolean;
  dryRun?: boolean;
  /** Agen riset: hapus klaim hasil sistem subjek lalu bangun ulang dari nol (bukan dry-run). */
  reset?: boolean;
  /** Riset otomatis: slug peluang tertentu (abaikan jadwal) untuk uji manual. */
  target?: string;
  /** Epoch ms; sumber berikutnya tidak dimulai setelah batas ini. */
  deadlineMs: number;
  fetch?: FetchLike;
};

export type SourceOutcome = {
  slug: string;
  status: "success" | "partial" | "failed";
  stats?:
    | PublishStats
    | MonitorStats
    | ResearchStats
    | OpportunityResearchStats
    | DiscoveryStats
    | EnrichStats
    | AtsDiscoveryStats
    | DamaEmployerStats;
  error?: string;
};

export type RunSummary = {
  dryRun: boolean;
  processed: SourceOutcome[];
  /** Sumber jatuh tempo yang belum sempat diproses (diambil panggilan berikutnya). */
  deferred: number;
};

function toIngestSource(row: SourceRow): IngestSource {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    authority: row.authority,
    trustScore: row.trust_score,
    tracks: row.tracks,
    countryCode: row.country_code,
    attribution: row.attribution,
    config: row.config,
  };
}

const groupOf = (row: SourceRow): string => {
  const config = row.config as { group?: unknown } | null;
  return typeof config?.group === "string" ? config.group : "jobs";
};

const errorMessage = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 500);

export async function runDueSources(options: RunOptions): Promise<RunSummary> {
  const db = createAdminClient();
  const dryRun = options.dryRun ?? false;
  const group = options.group ?? "jobs";
  const now = new Date();

  let rows: SourceRow[];
  if (options.slug) {
    const { data, error } = await db
      .from("sources")
      .select("*")
      .eq("slug", options.slug);
    if (error) throw new Error(`Gagal membaca sumber: ${error.message}`);
    rows = data;
  } else if (options.drafts) {
    if (!dryRun) throw new Error("Mode drafts hanya boleh bersama dry_run.");
    const { data, error } = await db
      .from("sources")
      .select("*")
      .eq("status", "draft")
      .in("kind", SUPPORTED_KINDS)
      .order("slug")
      .limit(50);
    if (error) throw new Error(`Gagal membaca sumber: ${error.message}`);
    rows = data;
  } else {
    const { data, error } = await db
      .from("sources")
      .select("*")
      .in("status", ["active", "failing"]) // sumber failing dicoba lagi sesuai backoff
      .in("kind", SUPPORTED_KINDS)
      .or(`next_run_at.is.null,next_run_at.lte.${now.toISOString()}`)
      .order("next_run_at", { ascending: true, nullsFirst: true })
      .limit(100);
    if (error) throw new Error(`Gagal membaca sumber: ${error.message}`);
    rows = data.filter(
      (row) => groupOf(row) === group && SCHEDULE_MS[row.schedule] !== null,
    );
  }

  const summary: RunSummary = { dryRun, processed: [], deferred: 0 };

  for (const [index, row] of rows.entries()) {
    if (Date.now() > options.deadlineMs) {
      summary.deferred = rows.length - index;
      break;
    }
    summary.processed.push(
      await processSource(db, row, {
        dryRun,
        reset: options.reset ?? false,
        target: options.target,
        fetch: options.fetch ?? defaultFetch,
        deadlineMs: options.deadlineMs,
      }),
    );
  }

  return summary;
}

async function processSource(
  db: ReturnType<typeof createAdminClient>,
  row: SourceRow,
  options: {
    dryRun: boolean;
    reset?: boolean;
    target?: string;
    fetch: FetchLike;
    deadlineMs: number;
  },
): Promise<SourceOutcome> {
  const startedAt = new Date();
  const source = toIngestSource(row);

  let runId: string | null = null;
  if (!options.dryRun) {
    const { data } = await db
      .from("ingest_runs")
      .insert({ source_id: row.id, started_at: startedAt.toISOString() })
      .select("id")
      .single();
    runId = data?.id ?? null;
  }

  let outcome: SourceOutcome;
  try {
    if (row.kind === "monitor") {
      const env = {
        FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
      };
      const deps = { fetch: options.fetch, env };
      const researchOptions = {
        dryRun: options.dryRun,
        reset: options.reset ?? false,
        now: startedAt,
        deadlineMs: options.deadlineMs,
      };
      const provider = (row.config as { provider?: unknown } | null)?.provider;
      let stats: NonNullable<SourceOutcome["stats"]>;
      let failed = false;
      if (provider === "research_agent") {
        stats = await runResearch(db, source, deps, researchOptions);
      } else if (provider === "employer_registry") {
        stats = await runDamaEmployerDiscovery(db, source, deps, {
          dryRun: options.dryRun,
          now: startedAt,
          deadlineMs: options.deadlineMs,
        });
      } else if (provider === "ats_discovery") {
        stats = await runAtsDiscovery(db, source, deps, {
          dryRun: options.dryRun,
          now: startedAt,
          deadlineMs: options.deadlineMs,
        });
      } else if (provider === "job_enrichment") {
        stats = await runJobEnrichment(db, source, deps, {
          dryRun: options.dryRun,
          now: startedAt,
          deadlineMs: options.deadlineMs,
        });
      } else if (provider === "discovery_agent") {
        stats = await runDiscovery(db, source, deps, {
          dryRun: options.dryRun,
          now: startedAt,
          deadlineMs: options.deadlineMs,
        });
      } else if (provider === "opportunity_research") {
        const result = await runOpportunityResearch(db, source, deps, {
          ...researchOptions,
          target: options.target,
        });
        failed =
          result.processed.length > 0 &&
          result.processed.every((p) => p.status === "failed");
        stats = result;
      } else {
        stats = await runMonitor(db, source, deps, {
          dryRun: options.dryRun,
          now: startedAt,
        });
      }
      outcome = {
        slug: row.slug,
        status: failed
          ? "failed"
          : "partial" in stats && stats.partial
            ? "partial"
            : "success",
        stats,
        ...(failed ? { error: "Semua subjek riset gagal (lihat stats)." } : {}),
      };
    } else {
      const result = await runAdapter(source, {
        fetch: options.fetch,
        env: {
          ADZUNA_APP_ID: process.env.ADZUNA_APP_ID,
          ADZUNA_APP_KEY: process.env.ADZUNA_APP_KEY,
        },
      });
      const stats = await publishItems(db, source, result, {
        dryRun: options.dryRun,
        now: startedAt,
      });
      const mostlyBroken =
        stats.fetched + stats.skipped > 0 &&
        stats.skipped / (stats.fetched + stats.skipped) > 0.2;
      outcome = {
        slug: row.slug,
        status: mostlyBroken ? "partial" : "success",
        stats,
      };
    }
  } catch (error) {
    outcome = { slug: row.slug, status: "failed", error: errorMessage(error) };
  }

  if (!options.dryRun) {
    const failed = outcome.status === "failed";
    const failureCount = failed ? row.failure_count + 1 : 0;
    const interval = SCHEDULE_MS[row.schedule];
    // Setelah gagal, coba lagi paling cepat 1 jam kemudian (atau sesuai jadwal bila lebih lambat).
    const delay = failed
      ? Math.max(interval ?? 0, 60 * 60 * 1000)
      : (interval ?? 0);

    await db
      .from("sources")
      .update({
        last_run_at: startedAt.toISOString(),
        ...(failed ? {} : { last_success_at: startedAt.toISOString() }),
        failure_count: failureCount,
        status:
          failureCount >= FAILING_AFTER
            ? "failing"
            : row.status === "failing" && !failed
              ? "active"
              : row.status,
        next_run_at:
          interval === null
            ? null
            : new Date(startedAt.getTime() + delay).toISOString(),
      })
      .eq("id", row.id);

    if (runId) {
      await db
        .from("ingest_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: outcome.status,
          stats: (outcome.stats ?? {}) as never,
          error: outcome.error ?? null,
        })
        .eq("id", runId);
    }
  }

  return outcome;
}
