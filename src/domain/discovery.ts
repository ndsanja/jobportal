import { z } from "zod";
import { dateInQuote } from "./grounding";
import { evidenceInText } from "./scholarship-extraction";
import { normalizeText } from "./text";

/**
 * Agen penemu: logika murni untuk memvalidasi kandidat peluang baru yang ditemukan AI di web,
 * mencocokkan duplikat, dan memberi skor kelayakan tampil. Tidak ada I/O di sini.
 */

export type PageLink = { text: string; url: string };

const SKIP_LINK =
  /^(mailto:|tel:|javascript:|#)|\.(png|jpe?g|gif|svg|webp|css|js|ico|zip)(\?|$)|(facebook|instagram|twitter|x|tiktok|youtube|linkedin|whatsapp|t)\.(com|me)\b|wa\.me|bit\.ly/i;

const absolute = (href: string, base: string): string | null => {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

const cleanAnchor = (value: string) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

function uniqueLinks(links: PageLink[], max: number): PageLink[] {
  const seen = new Set<string>();
  const out: PageLink[] = [];
  for (const link of links) {
    if (SKIP_LINK.test(link.url) || seen.has(link.url)) continue;
    seen.add(link.url);
    out.push(link);
    if (out.length >= max) break;
  }
  return out;
}

/** Tautan (teks + URL absolut) dari HTML; tautan navigasi media sosial/berkas dibuang. */
export function extractHtmlLinks(
  html: string,
  baseUrl: string,
  max = 200,
): PageLink[] {
  const links: PageLink[] = [];
  for (const match of html.matchAll(
    /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const url = absolute(match[1] as string, baseUrl);
    const text = cleanAnchor(match[2] as string);
    if (url && text.length >= 2) links.push({ text, url });
  }
  return uniqueLinks(links, max);
}

/** Tautan dari markdown ([teks](url)) — keluaran scrape Firecrawl. */
export function extractMarkdownLinks(
  markdown: string,
  baseUrl: string,
  max = 200,
): PageLink[] {
  const links: PageLink[] = [];
  for (const match of markdown.matchAll(
    /\[([^\]]{2,200})\]\((https?:\/\/[^)\s]+)\)/g,
  )) {
    const url = absolute(match[2] as string, baseUrl);
    const text = cleanAnchor(match[1] as string);
    if (url && text.length >= 2) links.push({ text, url });
  }
  return uniqueLinks(links, max);
}

const NAME_STOPWORDS = new Set([
  "the",
  "of",
  "for",
  "and",
  "in",
  "to",
  "a",
  "an",
  "program",
  "programme",
  "programs",
  "scholarship",
  "scholarships",
  "beasiswa",
  "award",
  "awards",
  "fellowship",
  "fellowships",
  "grant",
  "grants",
  "international",
  "students",
  "student",
  "fully",
  "funded",
  "untuk",
  "dan",
  "di",
  "luar",
  "negeri",
  "indonesia",
  "indonesian",
]);

/** Token bermakna dari nama program (tanpa kata umum seperti "scholarship", "program", tahun). */
export function nameTokens(name: string): string[] {
  return normalizeText(name)
    .split(" ")
    .filter(
      (t) => t.length > 1 && !NAME_STOPWORDS.has(t) && !/^\d{4}$/.test(t),
    );
}

/** Kunci dedupe kandidat: token bermakna, diurutkan. */
export const nameKey = (name: string): string =>
  [...new Set(nameTokens(name))].sort().join(" ");

/** Kemiripan Jaccard token nama (0–1). */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

/** Nama yang satu memuat seluruh token nama lain (min. 2 token), mis. "Erasmus Mundus" ⊂ "Erasmus Mundus Joint Masters". */
function containsName(a: string, b: string): boolean {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  if (small.size < 2) return false;
  for (const t of small) if (!large.has(t)) return false;
  return true;
}

/** Judul tanpa akhiran "— …" dan isi kurung, mis. "Chevening Scholarships — Indonesia" → "Chevening Scholarships". */
const coreTitle = (title: string) =>
  (title.split(/\s+[—–]\s+/)[0] ?? title).replace(/\([^)]*\)/g, " ");

const urlKey = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return null;
  }
};

export type KnownOpportunity = {
  id: string;
  title: string;
  organizationName: string | null;
  officialUrl: string | null;
  applyUrl: string | null;
};

/** Mencari peluang yang sudah ada dengan nama sangat mirip atau URL resmi yang sama. */
export function findDuplicate(
  candidate: { name: string; officialUrl: string | null },
  known: KnownOpportunity[],
): KnownOpportunity | null {
  const key = urlKey(candidate.officialUrl);
  for (const item of known) {
    if (
      key &&
      (key === urlKey(item.officialUrl) || key === urlKey(item.applyUrl))
    )
      return item;
    const titles = [
      item.title,
      coreTitle(item.title),
      item.organizationName
        ? `${item.organizationName} ${coreTitle(item.title)}`
        : null,
    ].filter((t): t is string => Boolean(t));
    if (
      titles.some(
        (t) =>
          nameSimilarity(candidate.name, t) >= 0.6 ||
          containsName(candidate.name, t),
      )
    )
      return item;
  }
  return null;
}

/** Menggilir kueri: tiap run memakai `perRun` kueri berikutnya sehingga semua kueri terpakai bergantian. */
export function pickQueries<T>(
  queries: T[],
  perRun: number,
  now: Date,
  intervalMs: number,
): T[] {
  if (queries.length <= perRun) return queries;
  const round = Math.floor(now.getTime() / intervalMs);
  const start = (round * perRun) % queries.length;
  return Array.from(
    { length: perRun },
    (_, i) => queries[(start + i) % queries.length] as T,
  );
}

const rawCandidate = z.object({
  name: z.string().trim().min(3).max(160),
  organizer: z.string().trim().max(160).nullish(),
  kind: z.enum(["scholarship", "program"]),
  country: z.string().trim().length(2).nullish(),
  levels: z
    .array(
      z.enum([
        "bachelor",
        "master",
        "doctoral",
        "postdoc",
        "non_degree",
        "vocational",
      ]),
    )
    .max(6)
    .nullish(),
  official_link: z.number().int().min(1).nullish(),
  open_to_indonesia: z.enum(["yes", "no", "unknown"]),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  summary: z.string().trim().min(10).max(400),
  evidence: z.string().trim().min(8).max(600),
});

export type DiscoveredCandidate = {
  name: string;
  nameKey: string;
  organizer: string | null;
  kind: "scholarship" | "program";
  countryCode: string | null;
  levels: string[];
  officialUrl: string | null;
  openToIndonesia: "yes" | "unknown";
  deadline: string | null;
  summary: string;
  evidence: string;
};

/**
 * Memvalidasi daftar kandidat dari model: kutipan harus ada di halaman, tautan resmi harus salah
 * satu tautan bernomor di halaman, tenggat harus tertulis di kutipan, dan kandidat yang jelas
 * tidak terbuka untuk WNI dibuang.
 */
export function validateCandidates(
  json: unknown,
  page: { text: string; links: PageLink[] },
  target: "scholarship" | "program",
  now: Date,
):
  | {
      candidates: DiscoveredCandidate[];
      rejected: Array<{ name: string; reason: string }>;
    }
  | { error: string } {
  const list = (json as { candidates?: unknown } | null)?.candidates;
  if (!Array.isArray(list))
    return { error: 'Objek harus memuat larik "candidates"' };

  const candidates: DiscoveredCandidate[] = [];
  const rejected: Array<{ name: string; reason: string }> = [];
  const seen = new Set<string>();
  for (const raw of list.slice(0, 30)) {
    const parsed = rawCandidate.safeParse(raw);
    const name = String((raw as { name?: unknown })?.name ?? "?").slice(0, 80);
    if (!parsed.success) {
      rejected.push({
        name,
        reason: `Bentuk tidak valid: ${parsed.error.issues[0]?.path.join(".")}`,
      });
      continue;
    }
    const c = parsed.data;
    if (c.kind !== target) {
      rejected.push({ name, reason: "Jenis tidak sesuai target" });
      continue;
    }
    if (c.open_to_indonesia === "no") {
      rejected.push({ name, reason: "Tidak terbuka untuk WNI" });
      continue;
    }
    if (!evidenceInText(c.evidence, page.text)) {
      rejected.push({ name, reason: "Kutipan tidak ditemukan di halaman" });
      continue;
    }
    let officialUrl: string | null = null;
    if (c.official_link) {
      const link = page.links[c.official_link - 1];
      if (!link) {
        rejected.push({ name, reason: "Nomor tautan tidak ada" });
        continue;
      }
      officialUrl = link.url;
    }
    let deadline: string | null = c.deadline ?? null;
    if (deadline) {
      const time = Date.parse(deadline);
      const tooOld = time < now.getTime() - 30 * 86_400_000;
      if (
        Number.isNaN(time) ||
        tooOld ||
        !dateInQuote(deadline, c.evidence, page.text)
      )
        deadline = null;
    }
    const key = nameKey(c.name);
    if (key.length < 3 || seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      name: c.name,
      nameKey: key,
      organizer: c.organizer?.trim() || null,
      kind: c.kind,
      countryCode: c.country ? c.country.toUpperCase() : null,
      levels: [...new Set(c.levels ?? [])],
      officialUrl,
      openToIndonesia: c.open_to_indonesia,
      deadline,
      summary: c.summary,
      evidence: c.evidence,
    });
  }
  return { candidates, rejected };
}

/** Apakah teks halaman resmi benar-benar menyebut program (≥60% token nama muncul). */
export function pageMentionsName(pageText: string, name: string): boolean {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return false;
  const text = ` ${normalizeText(pageText)} `;
  const hits = tokens.filter((t) => text.includes(` ${t} `)).length;
  return hits / tokens.length >= 0.6;
}

const OFFICIAL_LIKE =
  /(^|\.)(gov|gov\.[a-z]{2}|go\.[a-z]{2}|govt\.[a-z]{2}|gouv\.[a-z]{2}|gob\.[a-z]{2}|edu|edu\.[a-z]{2}|ac\.[a-z]{2}|europa\.eu|int)$/;

/** Tautan resmi bertipe pemerintah/universitas/lembaga internasional. */
export function isInstitutionalHost(url: string | null): boolean {
  if (!url) return false;
  try {
    return OFFICIAL_LIKE.test(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Skor 0–100 untuk mengurutkan antrean admin: makin tinggi makin layak dan makin terverifikasi. */
export function scoreCandidate(input: {
  linkVerified: boolean;
  institutional: boolean;
  openToIndonesia: "yes" | "unknown";
  deadline: string | null;
  seenCount: number;
  now: Date;
}): number {
  let score = 20;
  if (input.linkVerified) score += 30;
  if (input.institutional) score += 10;
  if (input.openToIndonesia === "yes") score += 20;
  if (input.deadline && Date.parse(input.deadline) > input.now.getTime())
    score += 10;
  score += Math.min(10, (input.seenCount - 1) * 5);
  return Math.max(0, Math.min(100, score));
}
