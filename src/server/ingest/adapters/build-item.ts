import { resolveCountry } from "@/domain/countries";
import {
  type NormalizedOpportunity,
  normalizedOpportunitySchema,
} from "@/domain/opportunity";
import { excerpt, normalizeText } from "@/domain/text";

export type RawItem = {
  externalId: string;
  title: string;
  organizationName: string;
  applyUrl: string;
  sourceUrl?: string;
  locationText?: string | null;
  fallbackCountry?: string | null;
  countryCode?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  isRemote?: boolean;
  category?: string | null;
  employmentType?: string | null;
  description?: string | null;
  salary?: NormalizedOpportunity["salary"];
  publishedAt?: string | null;
};

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** "Sydney, NSW, Australia" -> kota "Sydney", wilayah "NSW" (bagian negara dibuang). */
export function parseLocation(text: string | null | undefined): {
  city: string | null;
  region: string | null;
} {
  const parts = (text ?? "")
    .split(/[,|/;]| - /)
    .map((part) => part.trim())
    .filter(
      (part) => part && !/^remote$/i.test(part) && !resolveCountry(part, null),
    );
  return { city: parts[0] ?? null, region: parts[1] ?? null };
}

const toIso = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** Membangun dan memvalidasi satu peluang; mengembalikan null bila data tidak valid. */
export function buildItem(raw: RawItem): NormalizedOpportunity | null {
  const location = parseLocation(raw.locationText);
  const description = raw.description ?? "";

  const city = clean(raw.city) ?? location.city;
  const region = clean(raw.region) ?? location.region;

  const candidate = {
    externalId: raw.externalId,
    sourceUrl: raw.sourceUrl ?? raw.applyUrl,
    applyUrl: raw.applyUrl,
    title: raw.title,
    organizationName: raw.organizationName,
    kind: "job" as const,
    countryCode:
      raw.countryCode ??
      resolveCountry(raw.locationText ?? null, raw.fallbackCountry ?? null),
    // Bila sumber hanya memberi nama wilayah (mis. "Queensland"), jangan dianggap kota.
    city:
      city && region && normalizeText(city) === normalizeText(region)
        ? null
        : city,
    region,
    postcode: clean(raw.postcode),
    isRemote: raw.isRemote ?? /\bremote\b/i.test(raw.locationText ?? ""),
    category: clean(raw.category),
    employmentType: clean(raw.employmentType),
    summary: description ? excerpt(description) : null,
    salary: raw.salary ?? null,
    publishedAt: toIso(raw.publishedAt),
    closesAt: null,
    descriptionText: description,
  };

  const parsed = normalizedOpportunitySchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
