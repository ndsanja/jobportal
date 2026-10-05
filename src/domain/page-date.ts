/**
 * Tanggal pembaruan halaman web — dicari secara deterministik (tanpa AI) dari teks halaman dan
 * metadata HTML, agar bukti selalu bisa diberi usia sebenarnya dan tidak bergantung pada tebakan model.
 */

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  februari: 2,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  maret: 3,
  april: 4,
  apr: 4,
  may: 5,
  mei: 5,
  june: 6,
  jun: 6,
  juni: 6,
  july: 7,
  jul: 7,
  juli: 7,
  august: 8,
  aug: 8,
  agustus: 8,
  agu: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  oktober: 10,
  okt: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
  desember: 12,
  des: 12,
};
const MONTH_RE = `(?:${Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join("|")})(?![a-z])`;

const LABEL_RE =
  "(?:page\\s+)?(?:last\\s+(?:updated|modified|reviewed)|date\\s+modified|updated|modified|terakhir\\s+(?:diperbarui|diubah|diperbaharui)|diperbarui|pembaruan\\s+terakhir|diubah|published|date\\s+published|diterbitkan|tanggal\\s+terbit|date\\s+of\\s+effect|effective\\s+from)";

const DATE_RE = [
  `(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\.?,?\\s+(\\d{4})`, // 26 September 2025
  `(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, // September 26, 2025
  "(\\d{4})-(\\d{2})-(\\d{2})", // 2025-09-26
  "(\\d{1,2})/(\\d{1,2})/(\\d{4})", // 26/09/2025 (hari/bulan/tahun)
];

const toIso = (y: number, m: number, d: number): string | null => {
  const time = Date.UTC(y, m - 1, d);
  const date = new Date(time);
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d ||
    y < 2000
  )
    return null;
  return date.toISOString().slice(0, 10);
};

function parseDateAt(fragment: string): string | null {
  const a = new RegExp(`^${DATE_RE[0]}`, "i").exec(fragment);
  if (a)
    return toIso(
      Number(a[3]),
      MONTHS[(a[2] as string).toLowerCase()] as number,
      Number(a[1]),
    );
  const b = new RegExp(`^${DATE_RE[1]}`, "i").exec(fragment);
  if (b)
    return toIso(
      Number(b[3]),
      MONTHS[(b[1] as string).toLowerCase()] as number,
      Number(b[2]),
    );
  const c = new RegExp(`^${DATE_RE[2]}`).exec(fragment);
  if (c) return toIso(Number(c[1]), Number(c[2]), Number(c[3]));
  const d = new RegExp(`^${DATE_RE[3]}`).exec(fragment);
  if (d) return toIso(Number(d[3]), Number(d[2]), Number(d[1]));
  return null;
}

/**
 * Mencari tanggal berlabel ("Page last updated: 26 September 2025", "Diperbarui 3 Maret 2026", …).
 * Mengembalikan tanggal terbaru yang tidak di masa depan, atau null.
 */
export function findPageDate(
  text: string,
  now: Date = new Date(),
): string | null {
  const re = new RegExp(
    `${LABEL_RE}\\s*(?:on|:|-|–|\\(metadata\\):)?\\s*`,
    "gi",
  );
  let best: string | null = null;
  for (const match of text.matchAll(re)) {
    const start = (match.index ?? 0) + match[0].length;
    const iso = parseDateAt(text.slice(start, start + 40));
    if (iso && Date.parse(iso) <= now.getTime() && (!best || iso > best))
      best = iso;
  }
  return best;
}

const META_NAMES =
  "article:modified_time|og:updated_time|last-modified|dcterms\\.modified|dc\\.date\\.modified|datemodified|modified";

/** Tanggal pembaruan dari metadata HTML (meta tag atau JSON-LD `dateModified`). */
export function findHtmlMetaDate(
  html: string,
  now: Date = new Date(),
): string | null {
  const candidates: string[] = [];
  const metaTag = /<meta\b[^>]*>/gi;
  for (const tag of html.match(metaTag) ?? []) {
    const name = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(
      tag,
    )?.[1];
    const content = /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (name && content && new RegExp(`^(?:${META_NAMES})$`, "i").test(name))
      candidates.push(content);
  }
  for (const m of html.matchAll(/"dateModified"\s*:\s*"([^"]+)"/gi))
    candidates.push(m[1] as string);

  let best: string | null = null;
  for (const raw of candidates) {
    const iso = parseDateAt(raw.trim());
    if (iso && Date.parse(iso) <= now.getTime() && (!best || iso > best))
      best = iso;
  }
  return best;
}

const monthOf = (name: string): number =>
  MONTHS[name.toLowerCase().replace(/\.$/, "")] as number;
const RANGE_SEP =
  "\\s*(?:–|—|-|to|until|till|sampai|hingga|s\\.?\\s?d\\.?)\\s*";
const ORD = "(?:st|nd|rd|th)?";

/**
 * Semua tanggal lengkap (hari, bulan, tahun) yang tertulis di teks, termasuk rentang seperti
 * "1–30 Juni 2026" atau "1 June – 30 July 2026". Dipakai untuk memastikan tanggal hasil AI
 * benar-benar tertulis di kutipan sumber.
 */
export function datesInText(text: string): Set<string> {
  const found = new Set<string>();
  const add = (y: number, m: number, d: number) => {
    const iso = toIso(y, m, d);
    if (iso) found.add(iso);
  };
  const scan = (
    pattern: string,
    flags: string,
    take: (m: RegExpExecArray) => void,
  ) => {
    for (const m of text.matchAll(new RegExp(pattern, flags)))
      take(m as unknown as RegExpExecArray);
  };
  scan(`(\\d{1,2})${ORD}\\s+(${MONTH_RE})\\.?,?\\s+(\\d{4})`, "gi", (m) =>
    add(Number(m[3]), monthOf(m[2] as string), Number(m[1])),
  );
  scan(`(${MONTH_RE})\\.?\\s+(\\d{1,2})${ORD},?\\s+(\\d{4})`, "gi", (m) =>
    add(Number(m[3]), monthOf(m[1] as string), Number(m[2])),
  );
  scan("(\\d{4})-(\\d{2})-(\\d{2})", "g", (m) =>
    add(Number(m[1]), Number(m[2]), Number(m[3])),
  );
  scan("(\\d{1,2})/(\\d{1,2})/(\\d{4})", "g", (m) =>
    add(Number(m[3]), Number(m[2]), Number(m[1])),
  );
  // 1–30 Juni 2026
  scan(
    `(\\d{1,2})${ORD}${RANGE_SEP}(\\d{1,2})${ORD}\\s+(${MONTH_RE})\\.?,?\\s+(\\d{4})`,
    "gi",
    (m) => {
      add(Number(m[4]), monthOf(m[3] as string), Number(m[1]));
      add(Number(m[4]), monthOf(m[3] as string), Number(m[2]));
    },
  );
  // 1 June – 30 July 2026
  scan(
    `(\\d{1,2})${ORD}\\s+(${MONTH_RE})\\.?${RANGE_SEP}(\\d{1,2})${ORD}\\s+(${MONTH_RE})\\.?,?\\s+(\\d{4})`,
    "gi",
    (m) => {
      add(Number(m[5]), monthOf(m[2] as string), Number(m[1]));
      add(Number(m[5]), monthOf(m[4] as string), Number(m[3]));
    },
  );
  // June 1 – 30, 2026
  scan(
    `(${MONTH_RE})\\.?\\s+(\\d{1,2})${ORD}${RANGE_SEP}(\\d{1,2})${ORD},?\\s+(\\d{4})`,
    "gi",
    (m) => {
      add(Number(m[4]), monthOf(m[1] as string), Number(m[2]));
      add(Number(m[4]), monthOf(m[1] as string), Number(m[3]));
    },
  );
  return found;
}

/** Pasangan hari–bulan (tanpa tahun) yang tertulis di teks, sebagai "MM-DD". */
export function dayMonthsInText(text: string): Set<string> {
  const found = new Set<string>();
  const add = (m: number, d: number) => {
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31)
      found.add(`${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  };
  for (const m of text.matchAll(
    new RegExp(`(\\d{1,2})${ORD}\\s+(${MONTH_RE})`, "gi"),
  ))
    add(monthOf(m[2] as string), Number(m[1]));
  for (const m of text.matchAll(
    new RegExp(`(${MONTH_RE})\\.?\\s+(\\d{1,2})(?!\\d)`, "gi"),
  ))
    add(monthOf(m[1] as string), Number(m[2]));
  for (const m of text.matchAll(
    new RegExp(`(\\d{1,2})${RANGE_SEP}(\\d{1,2})${ORD}\\s+(${MONTH_RE})`, "gi"),
  )) {
    add(monthOf(m[3] as string), Number(m[1]));
    add(monthOf(m[3] as string), Number(m[2]));
  }
  return found;
}
