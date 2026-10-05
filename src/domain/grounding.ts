import { datesInText, dayMonthsInText } from "./page-date";

/**
 * Validator "berpijak pada kutipan": setiap angka dan tanggal di nilai klaim wajib tertulis di
 * kutipan sumbernya. Ini menangkap halusinasi paling berbahaya (usia, biaya, IPK, tenggat yang
 * salah) secara deterministik, tanpa memercayai model.
 */

const NUMBER_WORDS: Record<number, string[]> = {
  1: ["one", "satu"],
  2: ["two", "dua"],
  3: ["three", "tiga"],
  4: ["four", "empat"],
  5: ["five", "lima"],
  6: ["six", "enam"],
  7: ["seven", "tujuh"],
  8: ["eight", "delapan"],
  9: ["nine", "sembilan"],
  10: ["ten", "sepuluh"],
  11: ["eleven", "sebelas"],
  12: ["twelve", "dua belas"],
};

const SCALE_WORDS: Array<{ factor: number; words: string }> = [
  { factor: 1_000, words: "ribu|rb|thousand|k" },
  { factor: 1_000_000, words: "juta|jt|million|mio|m" },
  { factor: 1_000_000_000, words: "miliar|milyar|billion|bn" },
];

const escapeRe = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Menghapus pemisah ribuan ("5,000", "5.000", "5 000") agar angka bisa dicocokkan. */
export function normalizeNumbers(text: string): string {
  let out = text.toLowerCase();
  let previous: string;
  do {
    previous = out;
    out = out.replace(/(\d)[,.   '’](\d{3})(?!\d)/g, "$1$2");
  } while (out !== previous);
  return out;
}

function numberForms(n: number): string[] {
  if (Number.isInteger(n)) {
    return [String(n), `${n}.0`, `${n}.00`, `${n},0`, `${n},00`];
  }
  const plain = String(n);
  const fixed = n.toFixed(2);
  return [plain, plain.replace(".", ","), fixed, fixed.replace(".", ",")];
}

/** true bila angka `n` tertulis di teks (yang sudah dinormalisasi), termasuk "5 juta"/"two years". */
export function numberInText(n: number, normalizedText: string): boolean {
  for (const form of numberForms(n)) {
    if (
      new RegExp(`(?<![\\d.,])${escapeRe(form)}(?![\\d]|[.,]\\d)`).test(
        normalizedText,
      )
    )
      return true;
  }
  for (const word of NUMBER_WORDS[n] ?? []) {
    if (new RegExp(`\\b${word}\\b`, "i").test(normalizedText)) return true;
  }
  for (const { factor, words } of SCALE_WORDS) {
    if (n < factor) continue;
    const scaled = n / factor;
    if (!Number.isFinite(scaled) || scaled > 9999) continue;
    for (const form of numberForms(Number(scaled.toFixed(3)))) {
      if (
        new RegExp(
          `(?<![\\d.,])${escapeRe(form)}\\s*(?:${words})\\b`,
          "i",
        ).test(normalizedText)
      )
        return true;
    }
  }
  return false;
}

/** true bila tanggal ISO tertulis di kutipan; atau hari+bulan di kutipan dan tahunnya ada di halaman. */
export function dateInQuote(
  iso: string,
  quote: string,
  pageText: string,
): boolean {
  if (datesInText(quote).has(iso)) return true;
  return (
    dayMonthsInText(quote).has(iso.slice(5)) &&
    pageText.includes(iso.slice(0, 4))
  );
}

type Obj = Record<string, unknown>;
const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Mengembalikan pesan galat bila ada angka/tanggal pada nilai klaim yang tidak tertulis di kutipan;
 * null bila semuanya berpijak pada kutipan.
 */
export function groundingError(
  field: string,
  value: unknown,
  quote: string,
  pageText: string,
): string | null {
  const v = (value ?? {}) as Obj;
  const text = normalizeNumbers(quote);
  const missing = (n: number) => `Angka ${n} tidak tertulis di kutipan`;
  const need = (n: number | null, alternatives: number[] = []) =>
    n === null || [n, ...alternatives].some((a) => numberInText(a, text))
      ? null
      : missing(n);

  switch (field) {
    case "requirement.age": {
      const min = num(v.min);
      const max = num(v.max);
      // "di bawah 31 tahun" → max 30; "di atas 17 tahun" → min 18.
      return (
        need(min, min === null ? [] : [min - 1]) ??
        need(max, max === null ? [] : [max + 1])
      );
    }
    case "requirement.english": {
      for (const test of (v.tests as Obj[] | undefined) ?? []) {
        const error = need(num(test.min_overall));
        if (error) return error;
      }
      return null;
    }
    case "requirement.gpa":
      return need(num(v.min));
    case "requirement.experience_years": {
      const min = num(v.min);
      return min === 0 ? null : need(min);
    }
    case "requirement.funds":
    case "fee.application":
    case "benefit.amount":
      return need(num(v.amount));
    case "program.quota":
      return need(num(v.count));
    case "schedule.event": {
      for (const key of ["date", "end_date"] as const) {
        const iso = v[key];
        if (typeof iso === "string" && !dateInQuote(iso, quote, pageText))
          return `Tanggal ${iso} tidak tertulis di kutipan`;
      }
      return null;
    }
    default:
      return null;
  }
}
