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
export type PageMonitorConfig = Extract<
  SourceConfig,
  { provider: "page_monitor" }
>;
