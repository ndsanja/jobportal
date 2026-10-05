import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hasAcceptedFacts,
  normalizeForMatch,
} from "@/domain/scholarship-extraction";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  DEFAULT_MODEL,
  extractScholarshipFacts,
  PROMPT_VERSION,
} from "@/server/ai/openrouter";
import { sourceConfigSchema } from "./config";
import { fetchPageText } from "./page-fetch";
import type { FetchLike, IngestSource } from "./types";

type Db = SupabaseClient<Database>;

export type MonitorStats = {
  /** true bila isi halaman sama dengan pemeriksaan sebelumnya. */
  unchanged: boolean;
  /** true bila model dipanggil pada run ini. */
  extracted: boolean;
  /** pending = menunggu review admin; rejected = tidak ada fakta yang lolos validasi. */
  queued: "pending" | "rejected" | "already" | "none";
  acceptedFacts: number;
  rejectedFacts: number;
  truncated: boolean;
};

export type MonitorDeps = {
  fetch: FetchLike;
  env: {
    FIRECRAWL_API_KEY?: string;
    OPENROUTER_API_KEY?: string;
    OPENROUTER_MODEL?: string;
  };
};

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function must<T>(
  result: { data: T | null; error: { message: string } | null },
  action: string,
): T {
  if (result.error) throw new Error(`${action}: ${result.error.message}`);
  return result.data as T;
}

/**
 * Memantau satu halaman resmi: ambil teks, bandingkan hash, dan hanya bila berubah panggil AI.
 * Hasil ekstraksi TIDAK langsung dipublikasikan: masuk antrean review admin.
 */
export async function runMonitor(
  db: Db,
  source: IngestSource,
  deps: MonitorDeps,
  options: { dryRun: boolean; now: Date },
): Promise<MonitorStats> {
  const parsed = sourceConfigSchema.safeParse(source.config);
  if (!parsed.success || parsed.data.provider !== "page_monitor") {
    throw new Error(`Konfigurasi pemantau "${source.slug}" tidak valid.`);
  }
  const config = parsed.data;
  const nowIso = options.now.toISOString();

  const page = await fetchPageText(config.url, {
    fetcher: config.fetcher,
    fetch: deps.fetch,
    firecrawlKey: deps.env.FIRECRAWL_API_KEY,
    maxChars: config.max_chars,
  });
  const hash = sha256(normalizeForMatch(page.text));

  const stats: MonitorStats = {
    unchanged: false,
    extracted: false,
    queued: "none",
    acceptedFacts: 0,
    rejectedFacts: 0,
    truncated: page.truncated,
  };

  const { data: opportunity, error: opportunityError } = await db
    .from("opportunities")
    .select("id")
    .eq("slug", config.opportunity_slug)
    .maybeSingle();
  if (opportunityError)
    throw new Error(`Gagal membaca peluang: ${opportunityError.message}`);
  if (!opportunity)
    throw new Error(`Peluang "${config.opportunity_slug}" tidak ditemukan.`);

  const { data: previous, error: previousError } = await db
    .from("source_pages")
    .select("content_hash")
    .eq("source_id", source.id)
    .eq("url", config.url)
    .maybeSingle();
  if (previousError)
    throw new Error(`Gagal membaca riwayat halaman: ${previousError.message}`);

  // 1. Halaman tidak berubah
  if (previous?.content_hash === hash) {
    stats.unchanged = true;
    if (!options.dryRun) {
      await db
        .from("source_pages")
        .update({ last_fetched_at: nowIso })
        .eq("source_id", source.id)
        .eq("url", config.url);

      // Data baru boleh dianggap "terverifikasi ulang" hanya bila isi halaman yang sama ini
      // pernah disetujui admin (extraction berstatus applied dengan hash yang sama).
      const approved = must(
        await db
          .from("extractions")
          .select("id")
          .eq("source_id", source.id)
          .eq("content_hash", hash)
          .eq("status", "applied")
          .limit(1),
        "Gagal membaca ekstraksi",
      );
      if (approved.length > 0) {
        await db
          .from("opportunities")
          .update({ last_verified_at: nowIso })
          .eq("id", opportunity.id);
      }
    }
    return stats;
  }

  // 2. Hash ini sudah pernah diekstraksi (mis. halaman kembali ke isi lama)
  const existing = must(
    await db
      .from("extractions")
      .select("id")
      .eq("source_id", source.id)
      .eq("content_hash", hash)
      .limit(1),
    "Gagal membaca ekstraksi",
  );
  if (existing.length > 0) {
    stats.queued = "already";
    if (!options.dryRun) {
      await db.from("source_pages").upsert(
        {
          source_id: source.id,
          url: config.url,
          content_hash: hash,
          last_fetched_at: nowIso,
          last_changed_at: nowIso,
        },
        { onConflict: "source_id,url" },
      );
    }
    return stats;
  }

  // 3. Halaman baru/berubah: ekstraksi AI
  const apiKey = deps.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY belum diatur.");
  const model = deps.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const result = await extractScholarshipFacts(page.text, {
    apiKey,
    model,
    fetch: deps.fetch,
    now: options.now,
  });
  stats.extracted = true;
  if (!result.ok) throw new Error(`Ekstraksi AI gagal: ${result.error}`);

  stats.acceptedFacts =
    result.accepted.dates.length +
    (result.accepted.funding ? 1 : 0) +
    (result.accepted.study_levels ? 1 : 0) +
    (result.accepted.application_status ? 1 : 0);
  stats.rejectedFacts = result.rejected.length;
  stats.queued = hasAcceptedFacts(result.accepted) ? "pending" : "rejected";

  if (!options.dryRun) {
    const payload = {
      accepted: result.accepted,
      rejected: result.rejected,
      truncated: page.truncated,
    } as unknown as Json;
    must(
      await db.from("extractions").insert({
        source_id: source.id,
        opportunity_id: opportunity.id,
        page_url: config.url,
        content_hash: hash,
        model: result.model,
        prompt_version: PROMPT_VERSION,
        payload,
        status: stats.queued,
      }),
      "Gagal menyimpan ekstraksi",
    );
    must(
      await db.from("source_pages").upsert(
        {
          source_id: source.id,
          url: config.url,
          content_hash: hash,
          last_fetched_at: nowIso,
          last_changed_at: nowIso,
        },
        { onConflict: "source_id,url" },
      ),
      "Gagal menyimpan riwayat halaman",
    );
  }

  return stats;
}
