import { z } from "zod";
import { CLAIM_FIELD_NAMES, type ClaimField } from "@/domain/claims";

const countryCode = z
  .string()
  .length(2)
  .transform((value) => value.toUpperCase());

const atsBase = z.object({
  token: z.string().min(1),
  company: z.string().min(1),
  default_country: countryCode.optional(),
  group: z.string().default("jobs"),
});

export const sourceConfigSchema = z.discriminatedUnion("provider", [
  atsBase.extend({ provider: z.literal("greenhouse") }),
  atsBase.extend({ provider: z.literal("lever") }),
  atsBase.extend({ provider: z.literal("ashby") }),
  atsBase.extend({ provider: z.literal("smartrecruiters") }),
  z.object({
    provider: z.literal("page_monitor"),
    group: z.string().default("pages"),
    url: z.url(),
    opportunity_slug: z.string().min(1),
    fetcher: z.enum(["fetch", "firecrawl"]).default("fetch"),
    max_chars: z.number().int().min(2000).max(120000).default(40000),
  }),
  z.object({
    provider: z.literal("research_agent"),
    group: z.string().default("research"),
    subject: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("track"),
        track: z.enum([
          "whv_au",
          "dama_au",
          "professional",
          "overseas",
          "scholarship",
        ]),
      }),
      z.object({
        type: z.literal("opportunity"),
        opportunity_slug: z.string().min(1),
      }),
    ]),
    description: z.string().min(10).max(400),
    /** Profil bidang (visa_program/scholarship/job_program); bawaan ditentukan dari subjek. */
    profile: z.enum(["visa_program", "scholarship", "job_program"]).optional(),
    queries: z
      .array(
        z.union([
          z.string().min(5).max(200),
          z.object({
            q: z.string().min(5).max(200),
            recency: z.enum(["day", "week", "month", "year"]).optional(),
          }),
        ]),
      )
      .min(1)
      .max(12),
    /** Halaman resmi yang selalu dibaca lebih dulu, di luar hasil pencarian. */
    seed_urls: z.array(z.string().url()).max(10).default([]),
    official_domains: z.array(z.string().min(3)).default([]),
    reputable_domains: z.array(z.string().min(3)).optional(),
    fields: z
      .array(z.enum(CLAIM_FIELD_NAMES as [ClaimField, ...ClaimField[]]))
      .optional(),
    max_pages: z.number().int().min(1).max(20).default(8),
    results_per_query: z.number().int().min(1).max(10).default(5),
    max_chars: z.number().int().min(2000).max(120000).default(30000),
  }),
  z.object({
    /** Meriset otomatis setiap beasiswa/program yang jatuh tempo (lihat research_subjects). */
    provider: z.literal("opportunity_research"),
    group: z.string().default("research"),
    kinds: z
      .array(z.enum(["scholarship", "program"]))
      .min(1)
      .default(["scholarship", "program"]),
    /** Maksimum subjek per pemanggilan (dibatasi juga oleh waktu). */
    per_run: z.number().int().min(1).max(10).default(2),
    /** Subjek yang diriset bersamaan. */
    parallel: z.number().int().min(1).max(4).default(2),
    refresh_days: z.number().int().min(1).max(90).default(7),
    urgent_days: z.number().int().min(1).max(30).default(2),
    closed_refresh_days: z.number().int().min(1).max(180).default(30),
  }),
  z.object({
    /** Agen penemu career page: mencari board ATS publik perusahaan dan mendaftarkannya sebagai sumber. */
    provider: z.literal("ats_discovery"),
    group: z.string().default("discovery"),
    queries: z.array(z.string().min(5).max(200)).min(1).max(40),
    queries_per_run: z.number().int().min(1).max(12).default(6),
    results_per_query: z.number().int().min(1).max(10).default(10),
    /** Maksimum board baru yang divalidasi per run. */
    max_new: z.number().int().min(1).max(20).default(8),
    /** Porsi minimum lowongan berlokasi di Australia agar board langsung aktif. */
    min_au_share: z.number().min(0).max(1).default(0.5),
  }),
  z.object({
    /** Penilaian AI per lowongan: kelayakan WNI, jalur visa, syarat kunci (berkutipan dari iklan). */
    provider: z.literal("job_enrichment"),
    group: z.string().default("enrich"),
    batch_size: z.number().int().min(1).max(12).default(8),
    max_jobs: z.number().int().min(1).max(200).default(48),
    concurrency: z.number().int().min(1).max(5).default(3),
    text_chars: z.number().int().min(500).max(8000).default(3000),
  }),
  z.object({
    /** Agen penemu: mencari peluang BARU di web dan mengantrekannya untuk admin. */
    provider: z.literal("discovery_agent"),
    group: z.string().default("discovery"),
    target: z.enum(["scholarship", "program"]),
    queries: z
      .array(
        z.union([
          z.string().min(5).max(200),
          z.object({
            q: z.string().min(5).max(200),
            recency: z.enum(["day", "week", "month", "year"]).optional(),
          }),
        ]),
      )
      .min(1)
      .max(40),
    /** Kueri digilir: tiap run memakai sebagian (hemat biaya, cakupan luas dari waktu ke waktu). */
    queries_per_run: z.number().int().min(1).max(10).default(4),
    results_per_query: z.number().int().min(1).max(10).default(6),
    max_pages: z.number().int().min(1).max(15).default(8),
    max_chars: z.number().int().min(5000).max(120000).default(40000),
    /** Maksimum tautan resmi kandidat baru yang diperiksa per run. */
    verify_links: z.number().int().min(0).max(25).default(12),
    /** Skor minimum kandidat baru agar masuk antrean admin. */
    min_score: z.number().int().min(0).max(100).default(50),
  }),
  z.object({
    provider: z.literal("adzuna"),
    group: z.string().default("jobs"),
    country: z
      .string()
      .length(2)
      .transform((value) => value.toLowerCase()),
    default_country: countryCode,
    pages: z.number().int().min(1).max(5).default(1),
    results_per_page: z.number().int().min(10).max(50).default(50),
    queries: z
      .array(
        z.object({
          what: z.string().min(1),
          where: z.string().min(1).optional(),
        }),
      )
      .min(1)
      .max(40),
  }),
]);

export type SourceConfig = z.infer<typeof sourceConfigSchema>;
export type AtsConfig = Extract<
  SourceConfig,
  { provider: "greenhouse" | "lever" | "ashby" | "smartrecruiters" }
>;
export type AdzunaConfig = Extract<SourceConfig, { provider: "adzuna" }>;
export type ResearchAgentConfig = Extract<
  SourceConfig,
  { provider: "research_agent" }
>;
export type DiscoveryAgentConfig = Extract<
  SourceConfig,
  { provider: "discovery_agent" }
>;
export type PageMonitorConfig = Extract<
  SourceConfig,
  { provider: "page_monitor" }
>;
