const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Huruf kecil, tanpa aksen/tanda baca; dipakai untuk kunci dedupe dan pencocokan. */
export function normalizeText(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const CORPORATE_SUFFIX =
  /\b(pty|ltd|limited|llc|inc|incorporated|gmbh|bv|ag|sa|plc|co|corp|corporation|company)\b/g;

export function normalizeOrgName(value: string): string {
  return normalizeText(value)
    .replace(CORPORATE_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value: string, maxLength = 80): string {
  return normalizeText(value)
    .replace(/ /g, "-")
    .slice(0, maxLength)
    .replace(/-+$/, "");
}

function decodeEntities(value: string): string {
  return value
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp|#39);/g,
      (match) => ENTITIES[match] ?? match,
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    );
}

/** Mengubah HTML (termasuk HTML yang di-escape, seperti dari Greenhouse) menjadi teks polos. */
export function htmlToText(html: string): string {
  const unescaped = decodeEntities(html);
  return decodeEntities(
    unescaped
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .trim();
}

export function excerpt(text: string, maxLength = 280): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= maxLength) return flat;
  const cut = flat.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
