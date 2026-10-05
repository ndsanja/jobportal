import type { OpportunitySignals } from "./opportunity";
import { evidenceInText } from "./scholarship-extraction";

/**
 * Penilaian AI per lowongan: seberapa realistis dilamar pelamar dari Indonesia, lewat jalur visa
 * apa, dan syarat kuncinya. Setiap alasan "besar"/"kecil" wajib berkutipan dari teks iklan; sinyal
 * deterministik (regex) mengoreksi model bila bertentangan.
 */

export const WNI_LEVELS = [
  "likely",
  "possible",
  "unlikely",
  "unknown",
] as const;
export type WniLevel = (typeof WNI_LEVELS)[number];

export const PATHWAYS = [
  "whv_462",
  "dama",
  "sid_482",
  "skilled_494",
  "employer_sponsored",
  "eps_topik",
  "ssw_japan",
  "remote",
  "other",
] as const;
export type Pathway = (typeof PATHWAYS)[number];

export const PATHWAY_LABEL: Record<Pathway, string> = {
  whv_462: "WHV 462",
  dama: "DAMA",
  sid_482: "Visa 482 (sponsor)",
  skilled_494: "Visa regional 494",
  employer_sponsored: "Sponsor pemberi kerja",
  eps_topik: "EPS-TOPIK Korea",
  ssw_japan: "SSW Jepang",
  remote: "Remote dari Indonesia",
  other: "Jalur lain",
};

export const WNI_LABEL: Record<WniLevel, string> = {
  likely: "Peluang WNI besar",
  possible: "Peluang WNI mungkin",
  unlikely: "Peluang WNI kecil",
  unknown: "Belum jelas untuk WNI",
};

export type QuotedText = { text: string; quote: string | null };

export type JobInsight = {
  wni: WniLevel;
  reasons: QuotedText[];
  pathways: Pathway[];
  requiresLocalWorkRights: boolean | null;
  sponsorship: "offered" | "not_offered" | "unknown";
  requirements: QuotedText[];
  summary: string;
};

type RawReason = { text?: unknown; quote?: unknown };

const quoted = (
  raw: unknown,
  text: string,
  max: number,
  requireQuote: boolean,
): QuotedText[] =>
  (Array.isArray(raw) ? raw : [])
    .slice(0, max * 2)
    .flatMap((r) => {
      const item = r as RawReason;
      if (typeof item.text !== "string") return [];
      const body = item.text.trim().slice(0, 220);
      if (body.length < 5) return [];
      const quote =
        typeof item.quote === "string" &&
        item.quote.trim().length >= 6 &&
        evidenceInText(item.quote, text)
          ? item.quote.trim().slice(0, 300)
          : null;
      if (requireQuote && !quote) return [];
      return [{ text: body, quote }];
    })
    .slice(0, max);

/** Memvalidasi satu penilaian model terhadap teks iklan & sinyal deterministik. */
export function validateInsight(
  raw: unknown,
  job: { text: string; signals: Partial<OpportunitySignals> },
): JobInsight | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (!WNI_LEVELS.includes(r.wni as WniLevel)) return null;
  let wni = r.wni as WniLevel;
  const reasons = quoted(r.reasons, job.text, 4, false);
  const hasQuote = reasons.some((x) => x.quote !== null);

  // Kesimpulan tegas (besar/kecil) wajib punya kutipan dari iklan.
  if (wni === "likely" && !hasQuote) wni = "possible";
  if (wni === "unlikely" && !hasQuote) wni = "unknown";

  // Sinyal deterministik dari teks iklan mengoreksi model bila bertentangan.
  const blocked =
    job.signals.whv_signal === "unsuitable" ||
    job.signals.sponsorship === "none";
  const open =
    job.signals.sponsorship === "available" ||
    job.signals.whv_signal === "explicit";
  if (blocked && wni !== "unlikely") {
    wni = "unlikely";
    reasons.unshift({
      text: "Iklan mensyaratkan kewarganegaraan/hak kerja penuh atau tidak menyediakan sponsor visa (terdeteksi otomatis).",
      quote: null,
    });
  } else if (open && !blocked && (wni === "unknown" || wni === "possible")) {
    wni = "likely";
    reasons.unshift({
      text: "Iklan menyebut sponsor visa atau terbuka untuk pemegang working holiday (terdeteksi otomatis).",
      quote: null,
    });
  }

  const pathways = (Array.isArray(r.pathways) ? r.pathways : []).filter(
    (p): p is Pathway => PATHWAYS.includes(p as Pathway),
  );
  const sponsorship =
    r.sponsorship === "offered" || r.sponsorship === "not_offered"
      ? r.sponsorship
      : "unknown";
  const summary =
    typeof r.summary === "string" ? r.summary.trim().slice(0, 400) : "";
  if (summary.length < 10) return null;

  return {
    wni,
    reasons: reasons.slice(0, 4),
    pathways: [...new Set(pathways)],
    requiresLocalWorkRights:
      typeof r.requires_local_work_rights === "boolean"
        ? r.requires_local_work_rights
        : null,
    sponsorship: blocked ? "not_offered" : sponsorship,
    requirements: quoted(r.requirements, job.text, 5, true),
    summary,
  };
}
