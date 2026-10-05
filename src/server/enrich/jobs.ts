import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type JobInsight,
  validateInsight,
  type WniLevel,
} from "@/domain/job-insight";
import type { OpportunitySignals } from "@/domain/opportunity";
import type { Database, Json } from "@/lib/supabase/database.types";
import { callJsonModel, type FetchLike } from "@/server/ai/json-call";
import { DEFAULT_MODEL } from "@/server/ai/openrouter";
import { sourceConfigSchema } from "@/server/ingest/config";
import type { IngestSource } from "@/server/ingest/types";

type Db = SupabaseClient<Database>;

export const ENRICH_PROMPT_VERSION = "wni-v1";

const SYSTEM_PROMPT = `Anda adalah analis lowongan kerja luar negeri untuk pelamar dari INDONESIA. Untuk setiap lowongan, nilai seberapa realistis seorang WNI yang belum punya izin kerja di negara itu dapat melamar dan diterima, HANYA berdasarkan teks iklan. Balas HANYA dengan satu objek JSON.

Label "wni":
- "likely": iklan secara eksplisit menawarkan sponsor visa, menerima pemegang working holiday visa/backpacker, menyebut DAMA/labour agreement, menerima pelamar internasional/relokasi, atau pekerjaan remote yang bisa dari mana saja.
- "possible": tidak ada syarat kewarganegaraan/izin kerja yang disebut DAN jenis pekerjaan lazim diisi pemegang WHV/visa sponsor (mis. pertanian, perhotelan, gudang, kebersihan, perawatan lansia), tetapi tidak dinyatakan eksplisit.
- "unlikely": iklan mensyaratkan warga negara/penduduk tetap/hak kerja penuh/izin keamanan (clearance), atau menyatakan tidak ada sponsor.
- "unknown": informasi tidak cukup.

Aturan:
1. Setiap alasan untuk "likely" atau "unlikely" WAJIB punya "quote": salinan PERSIS frasa dari teks iklan (validator otomatis menolak kutipan yang tidak ada). Untuk "possible"/"unknown", quote boleh null.
2. pathways (boleh kosong): whv_462 (working holiday Australia), dama (DAMA), sid_482 (visa sponsor 482/TSS/Skills in Demand), skilled_494 (visa regional 494), employer_sponsored (sponsor pemberi kerja di negara lain), eps_topik (Korea), ssw_japan (Jepang), remote (bisa dikerjakan remote dari Indonesia), other.
3. requirements: maksimal 5 syarat kunci (pengalaman, lisensi/sertifikat, bahasa, SIM, dll.), masing-masing dengan quote PERSIS.
4. summary: 1–2 kalimat Bahasa Indonesia yang menjelaskan pekerjaan dan peluangnya bagi WNI. Jangan mengarang gaji/fasilitas yang tidak tertulis.
5. Jangan memakai pengetahuan di luar teks iklan, kecuali pengetahuan umum tentang jenis visa untuk memilih pathways.

Format: {"jobs": [{"ref": "j1", "wni": "possible", "reasons": [{"text": "...", "quote": "... atau null"}], "pathways": ["whv_462"], "sponsorship": "offered|not_offered|unknown", "requires_local_work_rights": true, "requirements": [{"text": "...", "quote": "..."}], "summary": "..."}]}`;

export type EnrichStats = {
  candidates: number;
  processed: number;
  written: number;
  failed: number;
  byLevel: Record<WniLevel, number>;
  partial: boolean;
  errors: string[];
  timingsMs: { select: number; model: number };
  /** Hanya dry-run: contoh penilaian. */
  preview?: Array<{
    title: string;
    wni: WniLevel;
    summary: string;
    reasons: string[];
  }>;
};

type Job = {
  id: string;
  title: string;
  organization: string | null;
  countryCode: string | null;
  text: string;
  textHash: string;
  signals: Partial<OpportunitySignals>;
};

const describeError = (error: unknown): string => {
  const name = (error as { name?: string } | null)?.name;
  const message = error instanceof Error ? error.message : String(error);
  if (name === "TimeoutError" || /aborted due to timeout/i.test(message))
    return "timeout";
  return message.slice(0, 140);
};

/** Menilai satu batch lowongan dengan satu panggilan model; hasil divalidasi per lowongan. */
async function assessBatch(
  jobs: Job[],
  deps: { apiKey: string; model: string; fetch?: FetchLike; now: Date },
): Promise<Map<string, JobInsight>> {
  const content = jobs
    .map(
      (job, index) =>
        `### j${index + 1}\nJudul: ${job.title}\nPerusahaan: ${job.organization ?? "-"}\nNegara: ${job.countryCode ?? "-"}\nTeks iklan:\n"""\n${job.text}\n"""`,
    )
    .join("\n\n");
  const result = await callJsonModel(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Hari ini: ${deps.now.toISOString().slice(0, 10)}\n\nLOWONGAN:\n${content}`,
      },
    ],
    {
      apiKey: deps.apiKey,
      model: deps.model,
      fetch: deps.fetch,
      maxTokens: 6000,
    },
    (json) =>
      Array.isArray((json as { jobs?: unknown })?.jobs)
        ? { ok: true, value: (json as { jobs: unknown[] }).jobs }
        : { ok: false, error: 'Objek harus memuat larik "jobs"' },
  );
  if (!result.ok) throw new Error(result.error);

  const insights = new Map<string, JobInsight>();
  for (const raw of result.value) {
    const ref = (raw as { ref?: unknown })?.ref;
    const index =
      typeof ref === "string" ? Number(ref.replace(/^j/, "")) - 1 : -1;
    const job = jobs[index];
    if (!job) continue;
    const insight = validateInsight(raw, {
      text: job.text,
      signals: job.signals,
    });
    if (insight) insights.set(job.id, insight);
  }
  return insights;
}

/**
 * Sumber `job_enrichment`: menilai lowongan yang belum dinilai atau teks iklannya berubah.
 * Hasil disimpan di opportunity_insights (publik bila lowongan terbit).
 */
export async function runJobEnrichment(
  db: Db,
  source: IngestSource,
  deps: {
    fetch: FetchLike;
    env: { OPENROUTER_API_KEY?: string; OPENROUTER_MODEL?: string };
  },
  options: { dryRun: boolean; now: Date; deadlineMs: number },
): Promise<EnrichStats> {
  const parsed = sourceConfigSchema.safeParse(source.config);
  if (!parsed.success || parsed.data.provider !== "job_enrichment") {
    throw new Error(
      `Konfigurasi penilai lowongan "${source.slug}" tidak valid.`,
    );
  }
  const config = parsed.data;
  const apiKey = deps.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY belum diatur.");
  const model = deps.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

  const stats: EnrichStats = {
    candidates: 0,
    processed: 0,
    written: 0,
    failed: 0,
    byLevel: { likely: 0, possible: 0, unlikely: 0, unknown: 0 },
    partial: false,
    errors: [],
    timingsMs: { select: 0, model: 0 },
  };
  const note = (message: string) => {
    if (stats.errors.length < 8) stats.errors.push(message);
  };

  // 1. Lowongan terbuka yang belum dinilai atau teksnya berubah.
  const selectStart = Date.now();
  const { data: done, error: doneError } = await db
    .from("opportunity_insights")
    .select("opportunity_id, text_hash")
    .limit(50_000);
  if (doneError)
    throw new Error(`Gagal membaca penilaian: ${doneError.message}`);
  const assessed = new Map(
    (done ?? []).map((d) => [d.opportunity_id, d.text_hash]),
  );

  const ids: string[] = [];
  for (let from = 0; ids.length < config.max_jobs; from += 1000) {
    const { data: page, error } = await db
      .from("opportunity_texts")
      .select(
        "opportunity_id, text_hash, opportunities!inner(status, kind, is_published)",
      )
      .eq("opportunities.kind", "job")
      .eq("opportunities.status", "open")
      .eq("opportunities.is_published", true)
      .order("updated_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(`Gagal membaca teks iklan: ${error.message}`);
    for (const row of page ?? []) {
      if (assessed.get(row.opportunity_id) !== row.text_hash)
        ids.push(row.opportunity_id);
      if (ids.length >= config.max_jobs) break;
    }
    if ((page ?? []).length < 1000) break;
  }
  stats.candidates = ids.length;
  if (ids.length === 0) {
    stats.timingsMs.select = Date.now() - selectStart;
    return stats;
  }

  const { data: rows, error: rowsError } = await db
    .from("opportunity_texts")
    .select(
      "opportunity_id, text, text_hash, opportunities!inner(title, country_code, attributes, organizations(name))",
    )
    .in("opportunity_id", ids);
  if (rowsError)
    throw new Error(`Gagal membaca teks iklan: ${rowsError.message}`);
  stats.timingsMs.select = Date.now() - selectStart;

  const jobs: Job[] = (rows ?? []).map((row) => {
    const o = row.opportunities as unknown as {
      title: string;
      country_code: string | null;
      attributes: Record<string, unknown> | null;
      organizations: { name: string } | null;
    };
    const attributes = o.attributes ?? {};
    return {
      id: row.opportunity_id,
      title: o.title,
      organization: o.organizations?.name ?? null,
      countryCode: o.country_code,
      text: row.text.slice(0, config.text_chars),
      textHash: row.text_hash,
      signals: {
        whv_signal: attributes.whv_signal as OpportunitySignals["whv_signal"],
        sponsorship:
          attributes.sponsorship as OpportunitySignals["sponsorship"],
        dama_mentioned: attributes.dama_mentioned === true,
      },
    };
  });

  // 2. Nilai per batch, beberapa batch bersamaan, berhenti bila waktu habis.
  const batches: Job[][] = [];
  for (let i = 0; i < jobs.length; i += config.batch_size)
    batches.push(jobs.slice(i, i + config.batch_size));
  const results: Array<{ job: Job; insight: JobInsight }> = [];
  const queue = [...batches];
  const worker = async () => {
    for (;;) {
      if (Date.now() > options.deadlineMs - 30_000) {
        if (queue.length > 0) stats.partial = true;
        return;
      }
      const batch = queue.shift();
      if (!batch) return;
      const started = Date.now();
      try {
        const insights = await assessBatch(batch, {
          apiKey,
          model,
          fetch: deps.fetch,
          now: options.now,
        });
        for (const job of batch) {
          stats.processed += 1;
          const insight = insights.get(job.id);
          if (!insight) {
            stats.failed += 1;
            continue;
          }
          stats.byLevel[insight.wni] += 1;
          results.push({ job, insight });
        }
      } catch (error) {
        stats.failed += batch.length;
        note(`batch: ${describeError(error)}`);
      } finally {
        stats.timingsMs.model += Date.now() - started;
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(config.concurrency, batches.length) },
      worker,
    ),
  );

  if (options.dryRun) {
    stats.preview = results.slice(0, 12).map(({ job, insight }) => ({
      title: job.title,
      wni: insight.wni,
      summary: insight.summary,
      reasons: insight.reasons.map((r) =>
        r.quote ? `${r.text} — “${r.quote}”` : r.text,
      ),
    }));
    return stats;
  }

  // 3. Simpan.
  const payload = results.map(({ job, insight }) => ({
    opportunity_id: job.id,
    wni: insight.wni,
    reasons: insight.reasons as unknown as Json,
    pathways: insight.pathways,
    requires_local_work_rights: insight.requiresLocalWorkRights,
    sponsorship: insight.sponsorship,
    requirements: insight.requirements as unknown as Json,
    summary: insight.summary,
    text_hash: job.textHash,
    model,
    prompt_version: ENRICH_PROMPT_VERSION,
  }));
  for (let i = 0; i < payload.length; i += 50) {
    const { error } = await db
      .from("opportunity_insights")
      .upsert(payload.slice(i, i + 50), { onConflict: "opportunity_id" });
    if (error) note(`simpan: ${error.message}`);
    else stats.written += Math.min(50, payload.length - i);
  }
  return stats;
}
