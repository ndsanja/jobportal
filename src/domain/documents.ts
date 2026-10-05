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
