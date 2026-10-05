import { z } from "zod";
import { normalizeForMatch } from "./scholarship-extraction";

// ---------------------------------------------------------------------------
// Katalog bidang klaim (fakta yang boleh diusulkan AI) dan bentuk nilainya
// ---------------------------------------------------------------------------

const edu = z.enum(["sma", "d3", "d4", "s1", "s2", "s3"]);

export const CLAIM_FIELDS = {
  "requirement.age": z
    .object({
      min: z.number().int().min(0).max(100).nullable(),
      max: z.number().int().min(0).max(100).nullable(),
    })
    .refine((v) => v.min !== null || v.max !== null, "min atau max wajib ada"),
  "requirement.english": z.object({
    tests: z
      .array(
        z.object({
          test: z.enum(["IELTS", "TOEFL_IBT", "PTE", "TOEFL_ITP", "OTHER"]),
          min_overall: z.number().min(0).max(700).nullable(),
        }),
      )
      .min(1),
    note: z.string().max(200).optional(),
  }),
  "requirement.document": z.object({
    doc_type: z.string().min(2).max(60),
    note: z.string().max(200).optional(),
  }),
  "requirement.funds": z.object({
    amount: z.number().positive(),
    currency: z.string().length(3),
  }),
  "requirement.experience_years": z.object({ min: z.number().min(0).max(60) }),
  "requirement.education": z.object({ min_level: edu }),
  "requirement.nationality": z.object({
    countries: z.array(z.string().length(2)).min(1),
  }),
  "requirement.other": z.object({ text: z.string().min(5).max(250) }),
} as const;

export type ClaimField = keyof typeof CLAIM_FIELDS;
export const CLAIM_FIELD_NAMES = Object.keys(CLAIM_FIELDS) as ClaimField[];

export const CLAIM_FIELD_LABEL: Record<ClaimField, string> = {
  "requirement.age": "Usia",
  "requirement.english": "Bahasa Inggris",
  "requirement.document": "Dokumen",
  "requirement.funds": "Dana",
  "requirement.experience_years": "Pengalaman kerja",
  "requirement.education": "Pendidikan",
  "requirement.nationality": "Kewarganegaraan",
  "requirement.other": "Syarat lain",
};

export const isClaimField = (value: string): value is ClaimField =>
  value in CLAIM_FIELDS;

/** Memvalidasi nilai klaim terhadap skema bidangnya; mengembalikan nilai bersih atau pesan error. */
export function parseClaimValue(
  field: string,
  value: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (!isClaimField(field))
    return { ok: false, error: `Bidang tidak dikenal: ${field}` };
  const parsed = CLAIM_FIELDS[field].safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Nilai tidak valid",
      };
}

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "note") // catatan bebas tidak membedakan dua klaim
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, canonical(v)]),
    );
  }
  return typeof value === "string" ? value.trim().toLowerCase() : value;
};

/** Kunci stabil untuk nilai klaim: dua nilai yang sama secara makna menghasilkan kunci yang sama. */
export const valueKey = (value: unknown): string =>
  JSON.stringify(canonical(value));

export const quoteKey = (quote: string): string =>
  normalizeForMatch(quote).slice(0, 200);

// ---------------------------------------------------------------------------
// Tingkat sumber
// ---------------------------------------------------------------------------

export type SourceTier = "official" | "reputable" | "community";

export type TierRules = {
  /** Domain resmi untuk subjek ini (penyelenggara/pemerintah). Cocok bila host sama atau subdomainnya. */
  officialDomains: string[];
  reputableDomains: string[];
};

/** Domain berita/lembaga yang umum dipercaya sebagai sumber sekunder. Dapat ditimpa per sumber. */
export const DEFAULT_REPUTABLE_DOMAINS = [
  "abc.net.au",
  "kompas.com",
  "antaranews.com",
  "detik.com",
  "tempo.co",
  "cnbcindonesia.com",
  "bbc.com",
  "studyinternational.com",
];

// Pemerintah: hanya pola yang jelas milik pemerintah.
const GOVERNMENT_HOST =
  /(^|\.)(gov|gov\.[a-z]{2}|go\.id|europa\.eu|admin\.ch)$/;

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

const matchesDomain = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`);

export const domainOf = (url: string): string =>
  hostOf(url) ?? "tidak-diketahui";

export function classifyTier(url: string, rules: TierRules): SourceTier {
  const host = hostOf(url);
  if (!host) return "community";
  if (rules.officialDomains.some((d) => matchesDomain(host, d.toLowerCase())))
    return "official";
  if (GOVERNMENT_HOST.test(host)) return "official";
  if (rules.reputableDomains.some((d) => matchesDomain(host, d.toLowerCase())))
    return "reputable";
  return "community";
}

// ---------------------------------------------------------------------------
// Skor keyakinan & keputusan status
// ---------------------------------------------------------------------------

export type Stance = "supports" | "contradicts";
export type ClaimEvidence = {
  domain: string;
  tier: SourceTier;
  stance: Stance;
};

export type ClaimStatus = "accepted" | "disputed" | "proposed";

export type Decision = {
  key: string;
  status: ClaimStatus;
  confidence: number;
  reasons: string[];
};

/** Ambang tampil publik untuk klaim non-resmi (status `disputed`). */
export const PUBLIC_UNOFFICIAL_MIN_CONFIDENCE = 55;

const distinctDomains = (evidence: ClaimEvidence[], tier: SourceTier) =>
  new Set(
    evidence
      .filter((e) => e.stance === "supports" && e.tier === tier)
      .map((e) => e.domain),
  ).size;

/** Keyakinan 0–100 yang bisa dijelaskan: resmi ≫ sumber tepercaya ≫ komunitas; domain independen menambah. */
export function confidenceFor(evidence: ClaimEvidence[]): {
  confidence: number;
  reasons: string[];
} {
  const official = distinctDomains(evidence, "official");
  const reputable = distinctDomains(evidence, "reputable");
  const community = distinctDomains(evidence, "community");
  const reasons: string[] = [];
  let confidence: number;

  if (official > 0) {
    confidence = 90 + Math.min(4, (official - 1) * 2) + (reputable > 0 ? 3 : 0);
    reasons.push(`${official} sumber resmi`);
    if (reputable > 0) reasons.push(`${reputable} sumber tepercaya sependapat`);
  } else if (reputable > 0) {
    confidence = (reputable >= 2 ? 75 : 55) + (community > 0 ? 5 : 0);
    reasons.push(`${reputable} sumber tepercaya (belum ada sumber resmi)`);
  } else if (community > 0) {
    confidence = [0, 30, 45, 55][Math.min(community, 3)] as number;
    reasons.push(`${community} sumber komunitas independen (belum resmi)`);
  } else {
    return { confidence: 0, reasons: ["Tidak ada bukti pendukung"] };
  }

  const contradicting = evidence.filter((e) => e.stance === "contradicts");
  if (contradicting.length > 0) {
    const strongest = contradicting.some((e) => e.tier === "official")
      ? 40
      : contradicting.some((e) => e.tier === "reputable")
        ? 25
        : 10;
    confidence -= strongest;
    reasons.push(`${contradicting.length} bukti menyanggah`);
  }
  return { confidence: Math.max(0, Math.min(99, confidence)), reasons };
}

export type ClaimCandidate = { key: string; evidence: ClaimEvidence[] };

/**
 * Memutuskan status tiap nilai yang bersaing untuk SATU bidang pada SATU subjek.
 * - accepted: didukung sumber resmi (satu nilai terbaik); atau `lockedAccepted` hasil keputusan admin.
 * - disputed: terlihat publik dengan label "belum resmi" (keyakinan ≥ 55) atau nilai lain yang bersaing dengan nilai resmi.
 * - proposed: bukti terlalu lemah; disembunyikan sampai ada bukti tambahan atau admin menetapkan.
 */
export function decideClaims(
  candidates: ClaimCandidate[],
  lockedAccepted?: string,
): Decision[] {
  const scored = candidates.map((c) => ({
    ...c,
    ...confidenceFor(c.evidence),
  }));
  const hasOfficial = (c: (typeof scored)[number]) =>
    distinctDomains(c.evidence, "official") > 0;

  const winner = lockedAccepted
    ? scored.find((c) => c.key === lockedAccepted)
    : [...scored]
        .filter(hasOfficial)
        .sort((a, b) => b.confidence - a.confidence)[0];

  return scored.map((c) => {
    if (winner && c.key === winner.key) {
      return {
        key: c.key,
        status: "accepted",
        confidence: c.confidence,
        reasons: c.reasons,
      };
    }
    if (winner) {
      // Nilai bersaing dengan nilai yang sudah diterima: tampil hanya bila cukup kuat, selalu berlabel.
      const visible = c.confidence >= PUBLIC_UNOFFICIAL_MIN_CONFIDENCE;
      return {
        key: c.key,
        status: visible ? "disputed" : "proposed",
        confidence: c.confidence,
        reasons: [...c.reasons, "berbeda dari nilai resmi"],
      };
    }
    return {
      key: c.key,
      status:
        c.confidence >= PUBLIC_UNOFFICIAL_MIN_CONFIDENCE
          ? "disputed"
          : "proposed",
      confidence: c.confidence,
      reasons: c.reasons,
    };
  });
}
