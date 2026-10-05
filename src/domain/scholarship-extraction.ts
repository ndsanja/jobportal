import { z } from "zod";

// ---------------------------------------------------------------------------
// Bentuk keluaran ekstraksi AI. Setiap fakta WAJIB disertai kutipan persis dari halaman sumber;
// kutipan yang tidak ditemukan di teks halaman membuat fakta itu dibuang (tidak pernah dipercaya).
// ---------------------------------------------------------------------------

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");
const evidence = z.string().trim().min(8).max(500);

export const EVENT_KINDS = [
  "open",
  "close",
  "test",
  "interview",
  "announcement",
  "start",
] as const;
export const STUDY_LEVELS = [
  "bachelor",
  "master",
  "doctoral",
  "non_degree",
] as const;

export const rawExtractionSchema = z.object({
  dates: z
    .array(
      z.object({
        kind: z.enum(EVENT_KINDS),
        label: z.string().trim().min(3).max(160),
        starts_on: isoDate,
        ends_on: isoDate.nullish(),
        evidence,
      }),
    )
    .max(30)
    .default([]),
  funding: z
    .object({ text: z.string().trim().min(2).max(200), evidence })
    .nullish(),
  study_levels: z
    .object({ values: z.array(z.enum(STUDY_LEVELS)).min(1), evidence })
    .nullish(),
  application_status: z
    .object({ value: z.enum(["open", "closed", "upcoming"]), evidence })
    .nullish(),
});

export type RawExtraction = z.infer<typeof rawExtractionSchema>;

export type ValidatedExtraction = {
  dates: Array<
    Required<
      Pick<
        RawExtraction["dates"][number],
        "kind" | "label" | "starts_on" | "evidence"
      >
    > & {
      ends_on: string | null;
    }
  >;
  funding: { text: string; evidence: string } | null;
  study_levels: {
    values: (typeof STUDY_LEVELS)[number][];
    evidence: string;
  } | null;
  application_status: {
    value: "open" | "closed" | "upcoming";
    evidence: string;
  } | null;
};

export type Rejection = { path: string; reason: string };

/** Menyamakan spasi/huruf/tanda kutip agar kutipan bisa dicocokkan dengan teks halaman. */
export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function evidenceInText(quote: string, pageText: string): boolean {
  const needle = normalizeForMatch(quote);
  return needle.length >= 8 && normalizeForMatch(pageText).includes(needle);
}

function validDate(value: string, now: Date): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    return false;
  const year = 365 * 24 * 60 * 60 * 1000;
  return (
    date.getTime() > now.getTime() - year &&
    date.getTime() < now.getTime() + 3 * year
  );
}

/** Memvalidasi keluaran model terhadap skema, kutipan bukti, dan kewajaran tanggal. */
export function validateExtraction(
  input: unknown,
  pageText: string,
  now: Date,
):
  | { accepted: ValidatedExtraction; rejected: Rejection[] }
  | { error: string } {
  const parsed = rawExtractionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .slice(0, 3)
        .join("; "),
    };
  }

  const data = parsed.data;
  const rejected: Rejection[] = [];
  const accepted: ValidatedExtraction = {
    dates: [],
    funding: null,
    study_levels: null,
    application_status: null,
  };

  data.dates.forEach((item, index) => {
    const path = `dates.${index}`;
    if (!evidenceInText(item.evidence, pageText)) {
      rejected.push({
        path,
        reason: "Kutipan bukti tidak ditemukan di halaman",
      });
    } else if (
      !validDate(item.starts_on, now) ||
      (item.ends_on && !validDate(item.ends_on, now))
    ) {
      rejected.push({
        path,
        reason: "Tanggal tidak valid atau di luar rentang wajar",
      });
    } else if (item.ends_on && item.ends_on < item.starts_on) {
      rejected.push({
        path,
        reason: "Tanggal selesai lebih awal dari tanggal mulai",
      });
    } else {
      accepted.dates.push({
        kind: item.kind,
        label: item.label,
        starts_on: item.starts_on,
        ends_on: item.ends_on ?? null,
        evidence: item.evidence,
      });
    }
  });

  const single = <T extends { evidence: string }>(
    value: T | null | undefined,
    path: string,
  ): T | null => {
    if (!value) return null;
    if (!evidenceInText(value.evidence, pageText)) {
      rejected.push({
        path,
        reason: "Kutipan bukti tidak ditemukan di halaman",
      });
      return null;
    }
    return value;
  };

  accepted.funding = single(data.funding, "funding");
  accepted.study_levels = single(data.study_levels, "study_levels");
  accepted.application_status = single(
    data.application_status,
    "application_status",
  );

  return { accepted, rejected };
}

export const hasAcceptedFacts = (accepted: ValidatedExtraction): boolean =>
  accepted.dates.length > 0 ||
  !!accepted.funding ||
  !!accepted.study_levels ||
  !!accepted.application_status;
