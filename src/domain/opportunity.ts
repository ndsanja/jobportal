import { z } from "zod";
import { normalizeOrgName, normalizeText } from "./text";

export type Track =
  | "whv_au"
  | "dama_au"
  | "professional"
  | "overseas"
  | "scholarship";
export type SourceAuthority =
  | "government"
  | "institution"
  | "employer"
  | "aggregator"
  | "community";
export type SourceKind =
  | "api"
  | "ats"
  | "jsonld"
  | "csv"
  | "monitor"
  | "manual"
  | "deeplink";
export type OpportunityKind = "job" | "scholarship" | "program";

// ---------------------------------------------------------------------------
// Bentuk data ternormalisasi (keluaran semua adapter)
// ---------------------------------------------------------------------------

const nullableText = z.string().trim().min(1).nullable();

export const normalizedOpportunitySchema = z.object({
  externalId: z.string().min(1),
  sourceUrl: z.url(),
  applyUrl: z.url(),
  title: z.string().trim().min(2).max(300),
  organizationName: z.string().trim().min(1).max(200),
  kind: z.enum(["job", "scholarship", "program"]),
  countryCode: z.string().length(2).nullable(),
  city: nullableText,
  region: nullableText,
  postcode: nullableText,
  isRemote: z.boolean(),
  category: nullableText,
  employmentType: nullableText,
  summary: nullableText,
  salary: z
    .object({
      min: z.number().nonnegative().nullable(),
      max: z.number().nonnegative().nullable(),
      currency: z.string().length(3),
      period: z.enum(["hour", "day", "week", "month", "year"]),
    })
    .nullable(),
  publishedAt: z.iso.datetime({ offset: true }).nullable(),
  closesAt: z.iso.datetime({ offset: true }).nullable(),
  /** Teks deskripsi penuh: hanya dipakai untuk mendeteksi sinyal, tidak disimpan. */
  descriptionText: z.string(),
});

export type NormalizedOpportunity = z.infer<typeof normalizedOpportunitySchema>;

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

export function dedupeKey(
  item: Pick<
    NormalizedOpportunity,
    "organizationName" | "title" | "countryCode" | "city" | "kind"
  >,
): string {
  return [
    item.kind,
    normalizeOrgName(item.organizationName),
    normalizeText(item.title),
    item.countryCode ?? "",
    normalizeText(item.city ?? ""),
  ].join("|");
}

// ---------------------------------------------------------------------------
// Sinyal teks (tidak pernah menebak: hanya berdasarkan pernyataan di iklan)
// ---------------------------------------------------------------------------

export type WhvSignal = "explicit" | "likely" | "unsuitable" | "unknown";
export type SponsorshipSignal = "available" | "none" | "unknown";

const WHV_EXPLICIT =
  /\b(working holiday|work(?:ing)? and holiday|backpackers?|88 days|(?:2nd|second|third|3rd) year visa|subclass (?:417|462)|whv)\b/i;
const WHV_UNSUITABLE =
  /\b(?:australian citizens? (?:only|or permanent)|(?:citizens?|permanent residents?|pr) only|(?:must|need to|required to) (?:be|hold|have) (?:an? )?(?:australian )?(?:citizen|permanent resident|pr\b|full work rights)|security clearance|baseline clearance|nv[12])\b/i;
const WHV_LIKELY_TITLE =
  /\b(farm ?hand|fruit ?picker|picker|packer|packhouse|harvest|housekeep\w*|room attendant|kitchen ?hand|cleaner|labourer|laborer|barista|waiter|waitress|deck ?hand|general hand|orchard|vineyard|abattoir|meat ?worker)\b/i;

export function whvSignal(title: string, description: string): WhvSignal {
  const text = `${title}\n${description}`;
  if (WHV_UNSUITABLE.test(text)) return "unsuitable";
  if (WHV_EXPLICIT.test(text)) return "explicit";
  if (WHV_LIKELY_TITLE.test(title)) return "likely";
  return "unknown";
}

const SPONSOR_NEGATIVE =
  /\b(?:no|not|unable to|cannot|can't|cannot|without|doesn't|does not|do not|don't)\b(?:\s+\w+){0,4}\s+(?:visa\s+)?sponsor/i;
const SPONSOR_POSITIVE =
  /\b(?:visa sponsorship (?:is )?(?:available|offered|provided|supported)|(?:we|company|employer) (?:will|can|may) (?:provide )?(?:visa )?sponsor|sponsorship (?:is )?(?:available|offered|provided)|sponsor(?:ed)? (?:a )?(?:work )?visa|relocation (?:and|&) visa|482 visa|subclass (?:482|494|186)|employer sponsored)\b/i;
// "DAMA" harus huruf besar (menghindari nama orang "Dama"); frasa lengkap boleh huruf apa pun.
const DAMA_ACRONYM = /\bDAMA\b/;
const DAMA_PHRASE = /designated area migration/i;

export function sponsorshipSignal(text: string): SponsorshipSignal {
  if (SPONSOR_NEGATIVE.test(text)) return "none";
  if (SPONSOR_POSITIVE.test(text)) return "available";
  return "unknown";
}

export function damaMentioned(text: string): boolean {
  return DAMA_ACRONYM.test(text) || DAMA_PHRASE.test(text);
}

export type OpportunitySignals = {
  whv_signal: WhvSignal;
  sponsorship: SponsorshipSignal;
  dama_mentioned: boolean;
};

export function detectSignals(
  item: Pick<NormalizedOpportunity, "title" | "descriptionText">,
): OpportunitySignals {
  const text = `${item.title}\n${item.descriptionText}`;
  return {
    whv_signal: whvSignal(item.title, item.descriptionText),
    sponsorship: sponsorshipSignal(text),
    dama_mentioned: damaMentioned(text),
  };
}

/** Jalur (track) final: jalur sumber disaring oleh sinyal, DAMA hanya jika disebut eksplisit. */
export function deriveTracks(
  sourceTracks: readonly Track[],
  countryCode: string | null,
  signals: OpportunitySignals,
): Track[] {
  const tracks = new Set<Track>(sourceTracks);

  // Jalur WHV hanya untuk lowongan AU dengan bukti: sinyal "explicit" atau "likely".
  // Tanpa bukti ("unknown") atau jelas tidak cocok ("unsuitable"), jangan diklaim WHV.
  if (
    tracks.has("whv_au") &&
    (countryCode !== "AU" ||
      signals.whv_signal === "unsuitable" ||
      signals.whv_signal === "unknown")
  ) {
    tracks.delete("whv_au");
  }
  if (signals.dama_mentioned && countryCode === "AU") {
    tracks.add("dama_au");
  }
  if (tracks.size === 0) tracks.add("professional");

  return [...tracks];
}

// ---------------------------------------------------------------------------
// Confidence & verifikasi
// ---------------------------------------------------------------------------

const METHOD_FACTOR: Record<SourceKind, number> = {
  api: 1,
  ats: 1,
  jsonld: 1,
  csv: 1,
  monitor: 0.9,
  manual: 1,
  deeplink: 0.5,
};

export function computeConfidence(input: {
  trustScore: number;
  method: SourceKind;
  corroboratingSources?: number;
}): number {
  const base = Math.round(input.trustScore * METHOD_FACTOR[input.method]);
  const bonus = (input.corroboratingSources ?? 0) > 0 ? 5 : 0;
  return Math.max(0, Math.min(100, base + bonus));
}

export type VerificationStatus =
  | "verified"
  | "aggregated"
  | "needs_review"
  | "community";

export function verificationStatusFor(
  authority: SourceAuthority,
): VerificationStatus {
  if (authority === "aggregator") return "aggregated";
  if (authority === "community") return "community";
  return "verified";
}

// ---------------------------------------------------------------------------
// Kesegaran data (SLA verifikasi)
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export function verificationSlaDays(
  kind: OpportunityKind,
  closesAt: Date | null,
  now: Date,
): number {
  if (kind === "scholarship") {
    const deadlineSoon =
      closesAt !== null && closesAt.getTime() - now.getTime() < 60 * DAY_MS;
    return deadlineSoon ? 7 : 30;
  }
  return 7;
}

export type DisplayState =
  | "needs_review"
  | "closed"
  | "stale"
  | "verified"
  | "aggregated"
  | "community";

export function displayState(input: {
  kind: OpportunityKind;
  status: "upcoming" | "open" | "closed" | "archived";
  verificationStatus: VerificationStatus;
  lastVerifiedAt: Date;
  closesAt: Date | null;
  now: Date;
}): DisplayState {
  if (input.status === "closed" || input.status === "archived") return "closed";
  if (input.closesAt && input.closesAt.getTime() < input.now.getTime())
    return "closed";
  // Data awal yang belum dicocokkan dengan halaman resmi oleh sistem pemantau/admin.
  if (input.verificationStatus === "needs_review") return "needs_review";

  const ageDays =
    (input.now.getTime() - input.lastVerifiedAt.getTime()) / DAY_MS;
  if (ageDays > verificationSlaDays(input.kind, input.closesAt, input.now))
    return "stale";

  if (input.verificationStatus === "verified") return "verified";
  if (input.verificationStatus === "community") return "community";
  return "aggregated";
}
