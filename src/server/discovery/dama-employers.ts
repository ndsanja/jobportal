import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAtsBoard } from "@/domain/ats-discovery";
import { classifyTier } from "@/domain/claims";
import {
  type DamaEmployerCandidate,
  isVerifiedEmployer,
  validateDamaEmployers,
} from "@/domain/dama-employers";
import { type PageLink, pickQueries } from "@/domain/discovery";
import type { Database, Json } from "@/lib/supabase/database.types";
import { callJsonModel, type FetchLike } from "@/server/ai/json-call";
import { DEFAULT_MODEL } from "@/server/ai/openrouter";
import { sourceConfigSchema } from "@/server/ingest/config";
import type { IngestSource } from "@/server/ingest/types";
import { searchWeb } from "@/server/research/search";
import { fetchPageWithLinks } from "./fetch";

type Db = SupabaseClient<Database>;
type Evidence = { url: string; quote: string; tier: string };

const SYSTEM_PROMPT = `Anda mengekstrak daftar PEMBERI KERJA yang memiliki perjanjian atau endorsement DAMA (Designated Area Migration Agreement, Australia) dari teks SATU halaman web dan daftar tautannya. Balas HANYA JSON.

Aturan:
1. Hanya perusahaan/organisasi yang di teks dinyatakan punya DAMA labour agreement, di-endorse DAMA, terdaftar sebagai sponsor DAMA, atau sedang merekrut lewat DAMA. Abaikan agen migrasi, firma hukum, pemerintah/DAR itu sendiri, dan perusahaan yang hanya disebut tanpa kaitan DAMA.
2. evidence: salinan PERSIS kalimat/baris dari teks yang menyebut nama perusahaan itu dalam konteks DAMA (di tabel/daftar, baris yang memuat nama sudah cukup bila halaman itu adalah daftar perusahaan DAMA).
3. website_link / careers_link: NOMOR tautan dari daftar tautan menuju situs atau halaman karier perusahaan itu; null bila tidak ada.
4. dama_region: nama wilayah DAMA bila tertulis (mis. "Northern Territory", "Goldfields", "Great South Coast").
Format: {"employers": [{"name": "...", "dama_region": "... atau null", "industry": "... atau null", "website_link": 3, "careers_link": null, "evidence": "..."}]}`;

export type DamaEmployerStats = {
  queries: string[];
  pagesRead: number;
  pagesFailed: number;
  employersFound: number;
  rejected: number;
  created: number;
  updated: number;
  verified: number;
  atsSources: number;
  jobsLabelled: number;
  partial: boolean;
  errors: string[];
  preview?: Array<{
    name: string;
    region: string | null;
    tier: string;
    source: string;
    careersUrl: string | null;
  }>;
};

async function extractEmployers(
  page: { text: string; links: PageLink[] },
  deps: { apiKey: string; model: string; fetch: FetchLike },
) {
  const links = page.links.slice(0, 200);
  return callJsonModel(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `TEKS HALAMAN:\n"""\n${page.text}\n"""\n\nTAUTAN:\n${links.map((l, i) => `${i + 1}. ${l.text} — ${l.url}`).join("\n") || "(tidak ada)"}`,
      },
    ],
    {
      apiKey: deps.apiKey,
      model: deps.model,
      fetch: deps.fetch,
      maxTokens: 8000,
    },
    (json) => {
      const checked = validateDamaEmployers(json, { text: page.text, links });
      return "error" in checked
        ? { ok: false, error: checked.error }
        : { ok: true, value: checked };
    },
  );
}

/** Menandai lowongan Australia dari pemberi kerja DAMA terverifikasi (jalur DAMA + atribut sumber). */
export async function labelDamaJobs(
  db: Db,
  nameKeys: string[],
): Promise<number> {
  let labelled = 0;
  for (let i = 0; i < nameKeys.length; i += 50) {
    const { data: orgs } = await db
      .from("organizations")
      .select("id")
      .in("normalized_name", nameKeys.slice(i, i + 50));
    const ids = (orgs ?? []).map((o) => o.id);
    if (ids.length === 0) continue;
    const { data: jobs } = await db
      .from("opportunities")
      .select("id, tracks, attributes")
      .in("organization_id", ids)
      .eq("kind", "job")
      .eq("country_code", "AU");
    for (const job of jobs ?? []) {
      const attributes = (job.attributes ?? {}) as Record<string, unknown>;
      if (job.tracks.includes("dama_au") && attributes.dama_employer === true)
        continue;
      await db
        .from("opportunities")
        .update({
          tracks: [...new Set([...job.tracks, "dama_au" as const])],
          attributes: { ...attributes, dama_employer: true } as Json,
        })
        .eq("id", job.id);
      labelled += 1;
    }
  }
  return labelled;
}

/**
 * Sumber `employer_registry`: cari halaman daftar perusahaan DAMA (situs DAR/pemerintah & pihak
 * ketiga) → AI mengekstrak perusahaan berkutipan → simpan dama_employers (terverifikasi bila sumber
 * resmi atau ≥2 domain) → career page ATS perusahaan terverifikasi jadi sumber lowongan jalur DAMA →
 * lowongan Australia dari perusahaan itu diberi label DAMA.
 */
export async function runDamaEmployerDiscovery(
  db: Db,
  source: IngestSource,
  deps: {
    fetch: FetchLike;
    env: {
      FIRECRAWL_API_KEY?: string;
      OPENROUTER_API_KEY?: string;
      OPENROUTER_MODEL?: string;
    };
  },
  options: { dryRun: boolean; now: Date; deadlineMs: number },
): Promise<DamaEmployerStats> {
  const parsed = sourceConfigSchema.safeParse(source.config);
  if (!parsed.success || parsed.data.provider !== "employer_registry") {
    throw new Error(`Konfigurasi "${source.slug}" tidak valid.`);
  }
  const config = parsed.data;
  const { FIRECRAWL_API_KEY: firecrawlKey, OPENROUTER_API_KEY: apiKey } =
    deps.env;
  if (!firecrawlKey) throw new Error("FIRECRAWL_API_KEY belum diatur.");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY belum diatur.");
  const model = deps.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const nowIso = options.now.toISOString();

  const queries = pickQueries(
    config.queries,
    config.queries_per_run,
    options.now,
    86_400_000,
  );
  const stats: DamaEmployerStats = {
    queries,
    pagesRead: 0,
    pagesFailed: 0,
    employersFound: 0,
    rejected: 0,
    created: 0,
    updated: 0,
    verified: 0,
    atsSources: 0,
    jobsLabelled: 0,
    partial: false,
    errors: [],
  };
  const note = (m: string) => {
    if (stats.errors.length < 10) stats.errors.push(m.slice(0, 160));
  };

  const urls: string[] = [];
  for (const q of queries) {
    try {
      const results = await searchWeb(q, {
        apiKey: firecrawlKey,
        limit: config.results_per_query,
        fetch: deps.fetch,
      });
      for (const r of results) if (!urls.includes(r.url)) urls.push(r.url);
    } catch (e) {
      note(
        `cari "${q.slice(0, 40)}": ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const found = new Map<
    string,
    DamaEmployerCandidate & { evidence_list: Evidence[] }
  >();
  const pages = urls.slice(0, config.max_pages);
  const queue = [...pages];
  const worker = async () => {
    for (;;) {
      if (Date.now() > options.deadlineMs - 40_000) {
        if (queue.length > 0) stats.partial = true;
        return;
      }
      const url = queue.shift();
      if (!url) return;
      try {
        const page = await fetchPageWithLinks(url, {
          fetch: deps.fetch,
          firecrawlKey,
          maxChars: config.max_chars,
        });
        const result = await extractEmployers(page, {
          apiKey,
          model,
          fetch: deps.fetch,
        });
        if (!result.ok) {
          stats.pagesFailed += 1;
          note(`ekstrak ${new URL(url).host}: ${result.error}`);
          continue;
        }
        stats.pagesRead += 1;
        stats.rejected += result.value.rejected.length;
        const tier = classifyTier(url, {
          officialDomains: [],
          reputableDomains: [],
        });
        for (const e of result.value.employers) {
          const entry = found.get(e.nameKey) ?? { ...e, evidence_list: [] };
          entry.website ??= e.website;
          entry.careersUrl ??= e.careersUrl;
          entry.region ??= e.region;
          entry.industry ??= e.industry;
          if (!entry.evidence_list.some((x) => x.url === url))
            entry.evidence_list.push({ url, quote: e.evidence, tier });
          found.set(e.nameKey, entry);
        }
      } catch (e) {
        stats.pagesFailed += 1;
        note(
          `baca ${(() => {
            try {
              return new URL(url).host;
            } catch {
              return url;
            }
          })()}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, pages.length) }, worker));
  stats.employersFound = found.size;

  if (options.dryRun) {
    stats.preview = [...found.values()].slice(0, 40).map((e) => ({
      name: e.name,
      region: e.region,
      tier: e.evidence_list.some((x) => x.tier === "official")
        ? "official"
        : "community",
      source: e.evidence_list[0]?.url ?? "",
      careersUrl: e.careersUrl,
    }));
    return stats;
  }

  const keys = [...found.keys()];
  const existing = new Map<string, { id: string; evidence: Evidence[] }>();
  for (let i = 0; i < keys.length; i += 50) {
    const { data } = await db
      .from("dama_employers")
      .select("id, name_key, evidence")
      .in("name_key", keys.slice(i, i + 50));
    for (const row of data ?? [])
      existing.set(row.name_key, {
        id: row.id,
        evidence: (row.evidence ?? []) as Evidence[],
      });
  }

  const verifiedKeys: string[] = [];
  const { data: atsRows } = await db
    .from("sources")
    .select("config")
    .eq("kind", "ats");
  const knownBoards = new Set(
    (atsRows ?? []).map((s) => {
      const c = s.config as { provider?: string; token?: string } | null;
      return `${c?.provider}:${String(c?.token ?? "").toLowerCase()}`;
    }),
  );

  for (const e of found.values()) {
    const prior = existing.get(e.nameKey);
    const evidence = [...(prior?.evidence ?? []), ...e.evidence_list].filter(
      (x, i, all) => all.findIndex((y) => y.url === x.url) === i,
    );
    const verified = isVerifiedEmployer(evidence);
    if (verified) {
      verifiedKeys.push(e.nameKey);
      stats.verified += 1;
    }
    const row = {
      name: e.name,
      name_key: e.nameKey,
      region: e.region,
      industry: e.industry,
      website: e.website,
      careers_url: e.careersUrl,
      evidence: evidence.slice(0, 10) as unknown as Json,
      verified,
      source_id: source.id,
      last_seen_at: nowIso,
    };
    const { error } = prior
      ? await db.from("dama_employers").update(row).eq("id", prior.id)
      : await db.from("dama_employers").insert(row);
    if (error) {
      note(`simpan ${e.name.slice(0, 40)}: ${error.message}`);
      continue;
    }
    if (prior) stats.updated += 1;
    else stats.created += 1;

    // Career page ATS perusahaan DAMA terverifikasi → sumber lowongan jalur DAMA.
    const board = e.careersUrl ? parseAtsBoard(e.careersUrl) : null;
    if (
      verified &&
      board &&
      !knownBoards.has(`${board.provider}:${board.token}`)
    ) {
      const { error: srcError } = await db.from("sources").insert({
        slug: `ats-${board.provider}-${board.token}`
          .replace(/[^a-z0-9-]/g, "-")
          .slice(0, 80),
        name: `${e.name} (career page, pemberi kerja DAMA)`,
        kind: "ats",
        authority: "employer",
        trust_score: 85,
        tracks: ["dama_au"],
        country_code: "AU",
        base_url: board.boardUrl,
        config: {
          provider: board.provider,
          token: board.token,
          company: e.name,
          default_country: "AU",
          group: "jobs",
        } as Json,
        schedule: "daily",
        status: "active",
        terms_note: `Pemberi kerja DAMA menurut ${evidence
          .map((x) => x.url)
          .slice(0, 2)
          .join(", ")}.`,
      });
      if (srcError) note(`sumber ${board.token}: ${srcError.message}`);
      else {
        stats.atsSources += 1;
        knownBoards.add(`${board.provider}:${board.token}`);
      }
    }
  }

  stats.jobsLabelled = await labelDamaJobs(db, verifiedKeys);
  return stats;
}
