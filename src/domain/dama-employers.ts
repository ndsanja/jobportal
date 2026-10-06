import { z } from "zod";
import { type PageLink, pageMentionsName } from "./discovery";
import { evidenceInText } from "./scholarship-extraction";
import { normalizeOrgName } from "./text";

/**
 * Daftar pemberi kerja yang dinyatakan punya perjanjian/endorsement DAMA. Hanya perusahaan yang
 * disebut eksplisit terkait DAMA di halaman sumber (kutipan persis) yang diterima.
 */

export type DamaEmployerCandidate = {
  name: string;
  nameKey: string;
  region: string | null;
  industry: string | null;
  website: string | null;
  careersUrl: string | null;
  evidence: string;
};

const raw = z.object({
  name: z.string().trim().min(2).max(160),
  dama_region: z.string().trim().max(80).nullish(),
  industry: z.string().trim().max(80).nullish(),
  website_link: z.number().int().min(1).nullish(),
  careers_link: z.number().int().min(1).nullish(),
  evidence: z.string().trim().min(8).max(600),
});

const DAMA_CONTEXT = /\bDAMA\b|designated area migration|labour agreement/i;

export function validateDamaEmployers(
  json: unknown,
  page: { text: string; links: PageLink[] },
):
  | {
      employers: DamaEmployerCandidate[];
      rejected: Array<{ name: string; reason: string }>;
    }
  | { error: string } {
  const list = (json as { employers?: unknown } | null)?.employers;
  if (!Array.isArray(list))
    return { error: 'Objek harus memuat larik "employers"' };
  if (!DAMA_CONTEXT.test(page.text)) return { employers: [], rejected: [] };

  const employers: DamaEmployerCandidate[] = [];
  const rejected: Array<{ name: string; reason: string }> = [];
  const seen = new Set<string>();
  for (const item of list.slice(0, 200)) {
    const parsed = raw.safeParse(item);
    const name = String((item as { name?: unknown })?.name ?? "?").slice(0, 80);
    if (!parsed.success) {
      rejected.push({ name, reason: "Bentuk tidak valid" });
      continue;
    }
    const e = parsed.data;
    if (!evidenceInText(e.evidence, page.text)) {
      rejected.push({ name, reason: "Kutipan tidak ditemukan di halaman" });
      continue;
    }
    if (!pageMentionsName(e.evidence, e.name)) {
      rejected.push({ name, reason: "Kutipan tidak menyebut nama perusahaan" });
      continue;
    }
    const key = normalizeOrgName(e.name);
    if (key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    const link = (n: number | null | undefined) =>
      n ? (page.links[n - 1]?.url ?? null) : null;
    employers.push({
      name: e.name,
      nameKey: key,
      region: e.dama_region || null,
      industry: e.industry || null,
      website: link(e.website_link),
      careersUrl: link(e.careers_link),
      evidence: e.evidence,
    });
  }
  return { employers, rejected };
}

/** Terverifikasi bila didukung sumber resmi (pemerintah/DAR) atau ≥2 domain independen. */
export const isVerifiedEmployer = (
  evidence: Array<{ url: string; tier: string }>,
): boolean => {
  if (evidence.some((e) => e.tier === "official")) return true;
  // Iklan lowongan dihitung terpisah (label sendiri), bukan sebagai domain independen.
  const domains = new Set(
    evidence
      .filter((e) => e.tier !== "job_ad")
      .map((e) => {
        try {
          return new URL(e.url).hostname.replace(/^www\./, "");
        } catch {
          return e.url;
        }
      }),
  );
  return domains.size >= 2;
};

const FOLLOW =
  /\b(employers?|business(es)?|sponsors?|endorsed|participating|labour agreement|jobs?|vacanc(y|ies)|case stud(y|ies)|success stor(y|ies))\b/i;
const SKIP_FOLLOW =
  /\b(privacy|contact|login|sign in|subscribe|media|news|accessibility|terms|cookie)\b|\.(pdf|docx?|xlsx?)(\?|$)/i;

/** Tautan dari halaman resmi DAMA yang layak diikuti satu kali (daftar pemberi kerja/sponsor/lowongan). */
export function pickFollowLinks(
  links: PageLink[],
  seedUrl: string,
  max: number,
): string[] {
  let seedHost: string;
  try {
    seedHost = new URL(seedUrl).hostname.replace(/^www\./, "");
  } catch {
    return [];
  }
  const seedPath = seedUrl.split("#")[0];
  const out: string[] = [];
  for (const link of links) {
    if (out.length >= max) break;
    let url: URL;
    try {
      url = new URL(link.url);
    } catch {
      continue;
    }
    const clean = `${url.origin}${url.pathname}`;
    if (url.hostname.replace(/^www\./, "") !== seedHost) continue;
    if (clean === seedPath || out.includes(clean)) continue;
    const label = `${link.text} ${url.pathname.replace(/[-_/]/g, " ")}`;
    if (!FOLLOW.test(label) || SKIP_FOLLOW.test(label)) continue;
    out.push(clean);
  }
  return out;
}

const DAMA_AD = /\bDAMA\b|designated area migration agreement/i;

/** Kalimat iklan lowongan yang menyebut DAMA secara eksplisit (bukti pemberi kerja merekrut lewat DAMA). */
export function damaAdQuote(text: string): string | null {
  const match = DAMA_AD.exec(text);
  if (!match) return null;
  const before = text.slice(0, match.index);
  const start = Math.max(
    0,
    ...[". ", "! ", "? ", "\n", " – ", " - "].map((sep) => {
      const i = before.lastIndexOf(sep);
      return i < 0 ? 0 : i + sep.length;
    }),
    match.index - 160,
  );
  const after = text.slice(match.index);
  const endRel = after.search(/[.!?\n](\s|$)| – /);
  const end =
    match.index + Math.min(endRel < 0 ? after.length : endRel + 1, 200);
  return text.slice(start, end).trim();
}
