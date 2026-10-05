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
    description: z.string().min(10).max(300),
    queries: z.array(z.string().min(5).max(200)).min(1).max(8),
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
