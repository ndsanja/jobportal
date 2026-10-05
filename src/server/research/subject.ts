import { z } from "zod";
import {
  type ClaimField,
  DEFAULT_REPUTABLE_DOMAINS,
  FIELD_PROFILES,
  type FieldProfile,
} from "@/domain/claims";
import type { Track } from "@/domain/opportunity";
import type { Recency } from "./search";

/** Identitas subjek riset: satu jalur (WHV/DAMA) atau satu peluang (beasiswa/program/lowongan). */
export type ResearchSubject = {
  subject_type: "track" | "opportunity";
  subject_key: string;
  track: Track | null;
  opportunity_id: string | null;
};

/** Semua yang dibutuhkan mesin riset untuk meneliti satu subjek. */
export type ResearchSpec = {
  subject: ResearchSubject;
  profile: FieldProfile;
  description: string;
  queries: Array<{ q: string; recency?: Recency }>;
  seedUrls: string[];
  officialDomains: string[];
  reputableDomains: string[];
  fields: ClaimField[];
  maxPages: number;
  resultsPerQuery: number;
  maxChars: number;
};

/** Penyesuaian per subjek yang disimpan admin di research_subjects.config. */
export const subjectOverridesSchema = z
  .object({
    description: z.string().min(10).max(400),
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
    seed_urls: z.array(z.url()).max(10),
    official_domains: z.array(z.string().min(3)).max(20),
    reputable_domains: z.array(z.string().min(3)).max(30),
    max_pages: z.number().int().min(1).max(20),
    results_per_query: z.number().int().min(1).max(10),
    max_chars: z.number().int().min(2000).max(120000),
  })
  .partial();
export type SubjectOverrides = z.infer<typeof subjectOverridesSchema>;

export const normalizeQueries = (
  queries: Array<string | { q: string; recency?: Recency }>,
): Array<{ q: string; recency?: Recency }> =>
  queries.map((entry) => (typeof entry === "string" ? { q: entry } : entry));

/** Situs agregator/sosial yang tidak pernah dianggap domain resmi penyelenggara. */
const NEVER_OFFICIAL = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "tiktok.com",
  "google.com",
  "bit.ly",
  "seek.com.au",
  "indeed.com",
  "jobstreet.com",
  "glassdoor.com",
  "scholars4dev.com",
  "opportunitydesk.org",
  "scholarshipportal.com",
  "mastersportal.com",
];

export const hostOf = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

const isNeverOfficial = (host: string) =>
  NEVER_OFFICIAL.some((d) => host === d || host.endsWith(`.${d}`));

/** Nama program yang bersih untuk kueri berbahasa Inggris: tanpa "Beasiswa", kurung, atau akhiran "— …". */
export function searchName(title: string): string {
  return (
    title
      .split(/\s+[—–]\s+/)[0]
      ?.replace(/\([^)]*\)/g, " ")
      .replace(/^\s*(beasiswa|program)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim() || title
  );
}

export type OpportunityForResearch = {
  id: string;
  title: string;
  kind: "job" | "scholarship" | "program";
  countryName: string | null;
  officialUrl: string | null;
  applyUrl: string;
  organizationName: string | null;
  organizationWebsite: string | null;
};

const KIND_LABEL: Record<OpportunityForResearch["kind"], string> = {
  scholarship: "beasiswa",
  program: "program kerja/magang",
  job: "lowongan kerja",
};

/**
 * Menyusun rencana riset otomatis untuk satu peluang: domain resmi dari URL resmi & situs
 * penyelenggara, halaman resmi sebagai benih, dan kueri Inggris + Indonesia (termasuk kueri `site:`
 * ke domain resmi dan kueri berita terbaru). Penyesuaian admin menimpa nilai bawaan.
 */
export function buildOpportunitySpec(
  o: OpportunityForResearch,
  overrides: SubjectOverrides,
  now: Date,
): ResearchSpec {
  const profile: FieldProfile =
    o.kind === "scholarship" ? "scholarship" : "job_program";
  const name = searchName(o.title);
  const year = now.getUTCFullYear();
  const cycle = `${year} ${year + 1}`;

  const hosts = [o.officialUrl, o.applyUrl, o.organizationWebsite]
    .map(hostOf)
    .filter((h): h is string => Boolean(h) && !isNeverOfficial(h as string));
  const officialDomains = [...new Set(hosts)];
  const primary =
    hostOf(o.officialUrl) ??
    hostOf(o.organizationWebsite) ??
    officialDomains[0];
  const seedUrls = [
    ...new Set(
      [o.officialUrl, o.applyUrl].filter(
        (u): u is string => Boolean(u) && !isNeverOfficial(hostOf(u) ?? ""),
      ),
    ),
  ];

  const hasKindWord =
    /scholarship|beasiswa|award|fellowship|grant|stipend/i.test(name);
  const queries: Array<{ q: string; recency?: Recency }> =
    profile === "scholarship"
      ? [
          {
            q: `${name}${hasKindWord ? "" : " scholarship"} eligibility requirements Indonesian applicants`,
          },
          ...(primary
            ? [
                { q: `site:${primary} ${name} eligibility` },
                { q: `site:${primary} ${name} deadline ${cycle}` },
              ]
            : []),
          {
            q: `${name} ${cycle} application deadline Indonesia`,
            recency: "year",
          },
          {
            q: `beasiswa ${name} ${year} syarat pendaftaran jadwal`,
            recency: "year",
          },
        ]
      : [
          { q: `${name} Indonesia requirements how to apply` },
          ...(primary ? [{ q: `site:${primary} ${name}` }] : []),
          {
            q: `${name} Indonesia ${year} recruitment schedule`,
            recency: "year",
          },
          {
            q: `program ${name} ${year} syarat pendaftaran pekerja Indonesia`,
            recency: "year",
          },
        ];

  const description = `${o.title}${o.organizationName ? ` (${o.organizationName})` : ""} — ${KIND_LABEL[o.kind]}${o.countryName ? ` di ${o.countryName}` : ""} untuk pelamar dari Indonesia: kelayakan WNI, jadwal & tenggat, ${profile === "scholarship" ? "pendanaan, jenjang, " : "gaji/manfaat, "}syarat, dokumen, dan cara mendaftar`;

  return {
    subject: {
      subject_type: "opportunity",
      subject_key: `opportunity:${o.id}`,
      track: null,
      opportunity_id: o.id,
    },
    profile,
    description: (overrides.description ?? description).slice(0, 400),
    queries: overrides.queries ? normalizeQueries(overrides.queries) : queries,
    seedUrls: overrides.seed_urls ?? seedUrls,
    officialDomains: overrides.official_domains ?? officialDomains,
    reputableDomains: overrides.reputable_domains ?? DEFAULT_REPUTABLE_DOMAINS,
    fields: FIELD_PROFILES[profile],
    maxPages: overrides.max_pages ?? 6,
    resultsPerQuery: overrides.results_per_query ?? 4,
    maxChars: overrides.max_chars ?? 30000,
  };
}
