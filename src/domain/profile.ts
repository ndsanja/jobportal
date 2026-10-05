import { z } from "zod";
import { normalizeCountryCode } from "./countries";

export const EDUCATION_LEVELS = ["sma", "d3", "d4", "s1", "s2", "s3"] as const;
export const ENGLISH_LEVELS = ["dasar", "menengah", "mahir", "fasih"] as const;
export const TARGET_TRACKS = [
  "whv_au",
  "dama_au",
  "professional",
  "overseas",
  "scholarship",
] as const;

export const EDUCATION_LABEL: Record<
  (typeof EDUCATION_LEVELS)[number],
  string
> = {
  sma: "SMA/SMK",
  d3: "D3",
  d4: "D4",
  s1: "S1",
  s2: "S2",
  s3: "S3",
};
export const ENGLISH_LABEL: Record<(typeof ENGLISH_LEVELS)[number], string> = {
  dasar: "Dasar",
  menengah: "Menengah",
  mahir: "Mahir",
  fasih: "Fasih",
};

const blankToUndefined = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim() === "")
    ? undefined
    : value;
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToUndefined, schema.optional());

export const ageOn = (birthDate: string, on: Date): number => {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < birth.getUTCMonth() ||
    (on.getUTCMonth() === birth.getUTCMonth() &&
      on.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
};

export const profileInputSchema = z.object({
  full_name: optional(z.string().trim().max(120)),
  birth_date: optional(z.iso.date()),
  city: optional(z.string().trim().max(120)),
  education_level: optional(z.enum(EDUCATION_LEVELS)),
  field_of_study: optional(z.string().trim().max(120)),
  years_experience: optional(z.coerce.number().int().min(0).max(60)),
  english_level: optional(z.enum(ENGLISH_LEVELS)),
  target_tracks: z.array(z.enum(TARGET_TRACKS)).default([]),
  target_countries: z
    .array(z.string())
    .default([])
    .transform((codes) => [
      ...new Set(
        codes.map(normalizeCountryCode).filter((c): c is string => c !== null),
      ),
    ]),
  target_departure: optional(z.iso.date()),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

export function parseProfileForm(
  formData: FormData,
  now = new Date(),
): { ok: true; data: ProfileInput } | { ok: false; error: string } {
  const parsed = profileInputSchema.safeParse({
    full_name: formData.get("full_name"),
    birth_date: formData.get("birth_date"),
    city: formData.get("city"),
    education_level: formData.get("education_level"),
    field_of_study: formData.get("field_of_study"),
    years_experience: formData.get("years_experience"),
    english_level: formData.get("english_level"),
    target_tracks: formData.getAll("target_tracks"),
    target_countries: formData.getAll("target_countries"),
    target_departure: formData.get("target_departure"),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return {
      ok: false,
      error: `Isian "${String(field ?? "formulir")}" tidak valid.`,
    };
  }
  const { birth_date: birth } = parsed.data;
  if (birth) {
    const age = ageOn(birth, now);
    if (age < 14 || age > 90)
      return { ok: false, error: "Tanggal lahir tidak wajar." };
  }
  return { ok: true, data: parsed.data };
}
