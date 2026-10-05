import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AtsBoard,
  type AtsProvider,
  isAustralianLocation,
  parseAtsBoard,
} from "@/domain/ats-discovery";
import { pickQueries } from "@/domain/discovery";
import type { Database, Json } from "@/lib/supabase/database.types";
import { fetchAshby } from "@/server/ingest/adapters/ashby";
import { fetchGreenhouse } from "@/server/ingest/adapters/greenhouse";
import { fetchLever } from "@/server/ingest/adapters/lever";
import { fetchSmartRecruiters } from "@/server/ingest/adapters/smartrecruiters";
import { type AtsConfig, sourceConfigSchema } from "@/server/ingest/config";
import type {
  AdapterResult,
  FetchLike,
  IngestSource,
} from "@/server/ingest/types";
import { searchWeb } from "@/server/research/search";

type Db = SupabaseClient<Database>;

const FETCHERS: Record<
  AtsProvider,
  (config: AtsConfig, fetch: FetchLike) => Promise<AdapterResult>
> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
  smartrecruiters: fetchSmartRecruiters,
};

export type AtsDiscoveryStats = {
  queries: string[];
  boardsFound: number;
  alreadyKnown: number;
  validated: number;
  activated: number;
  drafted: number;
  rejected: number;
  partial: boolean;
  errors: string[];
  boards: Array<{
    provider: AtsProvider;
    token: string;
    jobs: number;
    auJobs: number;
    damaMentions: number;
    outcome: "aktif" | "draft" | "ditolak" | "gagal";
  }>;
};

const prettyName = (token: string) =>
  token
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/**
 * Sumber `ats_discovery`: cari board ATS publik (Greenhouse/Lever/Ashby/SmartRecruiters) lewat
 * pencarian web, lalu panggil API publik board itu. Board dengan lowongan Australia yang cukup
 * didaftarkan aktif sebagai sumber resmi pemberi kerja (deskripsi lengkap → label DAMA/sponsor tajam).
 */
export async function runAtsDiscovery(
  db: Db,
  source: IngestSource,
  deps: { fetch: FetchLike; env: { FIRECRAWL_API_KEY?: string } },
  options: { dryRun: boolean; now: Date; deadlineMs: number },
): Promise<AtsDiscoveryStats> {
  const parsed = sourceConfigSchema.safeParse(source.config);
  if (!parsed.success || parsed.data.provider !== "ats_discovery") {
    throw new Error(
      `Konfigurasi penemu career page "${source.slug}" tidak valid.`,
    );
  }
  const config = parsed.data;
  const firecrawlKey = deps.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) throw new Error("FIRECRAWL_API_KEY belum diatur.");

  const queries = pickQueries(
    config.queries,
    config.queries_per_run,
    options.now,
    86_400_000,
  );
  const stats: AtsDiscoveryStats = {
    queries,
    boardsFound: 0,
    alreadyKnown: 0,
    validated: 0,
    activated: 0,
    drafted: 0,
    rejected: 0,
    partial: false,
    errors: [],
    boards: [],
  };
  const note = (m: string) => {
    if (stats.errors.length < 8) stats.errors.push(m.slice(0, 160));
  };

  const boards = new Map<string, AtsBoard>();
  for (const q of queries) {
    try {
      const results = await searchWeb(q, {
        apiKey: firecrawlKey,
        limit: config.results_per_query,
        fetch: deps.fetch,
      });
      for (const r of results) {
        const board = parseAtsBoard(r.url);
        if (board) boards.set(`${board.provider}:${board.token}`, board);
      }
    } catch (e) {
      note(
        `cari "${q.slice(0, 40)}": ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  stats.boardsFound = boards.size;

  const { data: existing } = await db
    .from("sources")
    .select("config")
    .eq("kind", "ats");
  const known = new Set(
    (existing ?? []).map((s) => {
      const c = s.config as { provider?: string; token?: string } | null;
      return `${c?.provider}:${String(c?.token ?? "").toLowerCase()}`;
    }),
  );
  const fresh = [...boards.entries()].filter(([key]) => !known.has(key));
  stats.alreadyKnown = boards.size - fresh.length;

  for (const [, board] of fresh.slice(0, config.max_new)) {
    if (Date.now() > options.deadlineMs - 20_000) {
      stats.partial = true;
      break;
    }
    const atsConfig = {
      provider: board.provider,
      token: board.token,
      company: prettyName(board.token),
      group: "jobs",
    } as AtsConfig;
    let result: AdapterResult;
    try {
      result = await FETCHERS[board.provider](atsConfig, deps.fetch);
    } catch (e) {
      stats.boards.push({
        provider: board.provider,
        token: board.token,
        jobs: 0,
        auJobs: 0,
        damaMentions: 0,
        outcome: "gagal",
      });
      note(
        `${board.provider}/${board.token}: ${e instanceof Error ? e.message : String(e)}`,
      );
      continue;
    }
    stats.validated += 1;
    const jobs = result.items.length;
    const auJobs = result.items.filter(
      (i) =>
        i.countryCode === "AU" ||
        isAustralianLocation(`${i.city ?? ""} ${i.region ?? ""}`),
    ).length;
    const damaMentions = result.items.filter((i) =>
      /\bDAMA\b|designated area migration/i.test(
        `${i.title}\n${i.descriptionText}`,
      ),
    ).length;
    const share = jobs > 0 ? auJobs / jobs : 0;
    const outcome: AtsDiscoveryStats["boards"][number]["outcome"] =
      auJobs === 0
        ? "ditolak"
        : share >= config.min_au_share
          ? "aktif"
          : "draft";
    stats.boards.push({
      provider: board.provider,
      token: board.token,
      jobs,
      auJobs,
      damaMentions,
      outcome,
    });
    if (outcome === "ditolak") {
      stats.rejected += 1;
      continue;
    }
    if (options.dryRun) continue;

    const { error } = await db.from("sources").insert({
      slug: `ats-${board.provider}-${board.token}`
        .replace(/[^a-z0-9-]/g, "-")
        .slice(0, 80),
      name: `${prettyName(board.token)} (career page ${board.provider})`,
      kind: "ats",
      authority: "employer",
      trust_score: 80,
      tracks: ["professional"],
      country_code: "AU",
      base_url: board.boardUrl,
      config: {
        provider: board.provider,
        token: board.token,
        company: prettyName(board.token),
        // Board yang mayoritas lowongannya di Australia: lokasi tanpa negara dianggap Australia.
        ...(outcome === "aktif" ? { default_country: "AU" } : {}),
        group: "jobs",
      } as Json,
      schedule: "daily",
      status: outcome === "aktif" ? "active" : "draft",
      terms_note: `Ditemukan otomatis oleh ${source.slug}: ${auJobs}/${jobs} lowongan di Australia${damaMentions ? `, ${damaMentions} menyebut DAMA` : ""}.`,
      attribution: null,
    });
    if (error) note(`simpan ${board.token}: ${error.message}`);
    else if (outcome === "aktif") stats.activated += 1;
    else stats.drafted += 1;
  }
  return stats;
}
