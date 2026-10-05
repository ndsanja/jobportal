import { normalizeText } from "./text";

// [kode ISO-2, mata uang, nama/alias (huruf kecil tanpa aksen)]
const COUNTRY_TABLE: ReadonlyArray<
  readonly [string, string, readonly string[]]
> = [
  ["ID", "IDR", ["indonesia"]],
  ["AU", "AUD", ["australia"]],
  ["NZ", "NZD", ["new zealand", "selandia baru"]],
  ["JP", "JPY", ["japan", "jepang"]],
  ["KR", "KRW", ["south korea", "korea selatan", "korea"]],
  ["TW", "TWD", ["taiwan"]],
  ["SG", "SGD", ["singapore", "singapura"]],
  ["MY", "MYR", ["malaysia"]],
  ["HK", "HKD", ["hong kong"]],
  ["CN", "CNY", ["china", "tiongkok"]],
  [
    "AE",
    "AED",
    ["united arab emirates", "uae", "uni emirat arab", "dubai", "abu dhabi"],
  ],
  ["SA", "SAR", ["saudi arabia", "arab saudi"]],
  ["QA", "QAR", ["qatar"]],
  ["TR", "TRY", ["turkiye", "turkey", "turki"]],
  [
    "GB",
    "GBP",
    [
      "united kingdom",
      "uk",
      "great britain",
      "england",
      "scotland",
      "wales",
      "inggris",
    ],
  ],
  ["IE", "EUR", ["ireland", "irlandia"]],
  ["DE", "EUR", ["germany", "deutschland", "jerman"]],
  ["NL", "EUR", ["netherlands", "the netherlands", "belanda", "holland"]],
  ["FR", "EUR", ["france", "prancis"]],
  ["BE", "EUR", ["belgium", "belgia"]],
  ["CH", "CHF", ["switzerland", "swiss", "schweiz"]],
  ["AT", "EUR", ["austria", "osterreich"]],
  ["SE", "SEK", ["sweden", "swedia"]],
  ["NO", "NOK", ["norway", "norwegia"]],
  ["FI", "EUR", ["finland", "finlandia"]],
  ["DK", "DKK", ["denmark", "denmark"]],
  ["HU", "HUF", ["hungary", "hongaria"]],
  ["PL", "PLN", ["poland", "polandia"]],
  ["IT", "EUR", ["italy", "italia"]],
  ["ES", "EUR", ["spain", "spanyol"]],
  [
    "US",
    "USD",
    [
      "united states",
      "usa",
      "us",
      "united states of america",
      "amerika serikat",
    ],
  ],
  ["CA", "CAD", ["canada", "kanada"]],
];

const MATCHERS = COUNTRY_TABLE.map(([code, , names]) => ({
  code,
  pattern: new RegExp(`(^| )(${names.map(normalizeText).join("|")})( |$)`),
}));

/** Mendeteksi negara dari teks lokasi bebas; mengembalikan `fallback` bila tidak ada yang cocok. */
export function resolveCountry(
  text: string | null | undefined,
  fallback: string | null,
): string | null {
  if (text) {
    const normalized = normalizeText(text);
    for (const { code, pattern } of MATCHERS) {
      if (pattern.test(normalized)) return code;
    }
  }
  return fallback;
}

export function currencyForCountry(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return COUNTRY_TABLE.find(([c]) => c === code.toUpperCase())?.[1] ?? null;
}

const KNOWN_COUNTRIES = new Set(COUNTRY_TABLE.map(([code]) => code));

/** Hanya kode negara yang ada di tabel `countries` yang boleh disimpan (menghindari pelanggaran FK). */
export function normalizeCountryCode(
  code: string | null | undefined,
): string | null {
  const upper = code?.trim().toUpperCase();
  return upper && KNOWN_COUNTRIES.has(upper) ? upper : null;
}
