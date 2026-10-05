import { z } from "zod";

export const DOCUMENT_STATUSES = ["have", "in_progress", "missing"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  have: "Sudah punya",
  in_progress: "Sedang diurus",
  missing: "Belum punya",
};

const blankToUndefined = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim() === "")
    ? undefined
    : value;

export const documentInputSchema = z
  .object({
    document_type: z.string().trim().min(1).max(60),
    status: z.enum(DOCUMENT_STATUSES),
    issued_on: z.preprocess(blankToUndefined, z.iso.date().optional()),
    expires_on: z.preprocess(blankToUndefined, z.iso.date().optional()),
    notes: z.preprocess(
      blankToUndefined,
      z.string().trim().max(500).optional(),
    ),
  })
  .refine(
    (doc) =>
      !doc.issued_on || !doc.expires_on || doc.expires_on >= doc.issued_on,
    {
      message: "Tanggal kedaluwarsa lebih awal dari tanggal terbit.",
      path: ["expires_on"],
    },
  );

export type DocumentInput = z.infer<typeof documentInputSchema>;

export type ExpiryWarning = "expired" | "expiring" | null;

/** Dokumen yang sudah kedaluwarsa, atau akan kedaluwarsa dalam `months` bulan (default 6, umum untuk paspor). */
export function expiryWarning(
  expiresOn: string | null,
  now: Date,
  months = 6,
): ExpiryWarning {
  if (!expiresOn) return null;
  const expiry = new Date(`${expiresOn}T23:59:59Z`);
  if (expiry.getTime() < now.getTime()) return "expired";
  const horizon = new Date(now);
  horizon.setUTCMonth(horizon.getUTCMonth() + months);
  return expiry.getTime() <= horizon.getTime() ? "expiring" : null;
}

/** Kode jenis dokumen yang valid (sinkron dengan tabel `document_types`). */
export const DOCUMENT_TYPE_CODES = [
  "passport",
  "ktp",
  "kk",
  "birth_certificate",
  "diploma",
  "transcript",
  "diploma_legalized",
  "sworn_translation",
  "loa",
  "ielts",
  "toefl_ibt",
  "pte",
  "toefl_itp",
  "topik",
  "jlpt",
  "german_cert",
  "cv",
  "motivation_letter",
  "recommendation_letter",
  "work_reference",
  "research_proposal",
  "skck",
  "medical_checkup",
  "bank_statement",
  "rsa_certificate",
  "white_card",
  "first_aid",
  "food_safety",
  "driver_license",
  "seafarer_book",
] as const;
