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
  const domains = new Set(
    evidence.map((e) => {
      try {
        return new URL(e.url).hostname.replace(/^www\./, "");
      } catch {
        return e.url;
      }
    }),
  );
  return domains.size >= 2;
};
