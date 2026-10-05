/**
 * Agen penemu career page: mengenali board ATS publik dari URL hasil pencarian dan menilai apakah
 * board itu berisi lowongan di Australia. Fungsi murni.
 */

export type AtsProvider = "greenhouse" | "lever" | "ashby" | "smartrecruiters";
export type AtsBoard = {
  provider: AtsProvider;
  token: string;
  boardUrl: string;
};

const PATTERNS: Array<{
  provider: AtsProvider;
  host: RegExp;
  board: (t: string) => string;
}> = [
  {
    provider: "greenhouse",
    host: /^(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io$/,
    board: (t) => `https://boards.greenhouse.io/${t}`,
  },
  {
    provider: "lever",
    host: /^jobs(?:\.eu)?\.lever\.co$/,
    board: (t) => `https://jobs.lever.co/${t}`,
  },
  {
    provider: "ashby",
    host: /^jobs\.ashbyhq\.com$/,
    board: (t) => `https://jobs.ashbyhq.com/${t}`,
  },
  {
    provider: "smartrecruiters",
    host: /^(?:jobs|careers)\.smartrecruiters\.com$/,
    board: (t) => `https://jobs.smartrecruiters.com/${t}`,
  },
];

const RESERVED = new Set([
  "embed",
  "api",
  "v1",
  "jobs",
  "search",
  "oauth",
  "login",
  "static",
]);

/** Board ATS (penyedia + token perusahaan) dari URL lowongan/board; null bila bukan ATS yang didukung. */
export function parseAtsBoard(url: string): AtsBoard | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const pattern = PATTERNS.find((p) => p.host.test(host));
  if (!pattern) return null;
  const token = u.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(token) || RESERVED.has(token))
    return null;
  return { provider: pattern.provider, token, boardUrl: pattern.board(token) };
}

const AU_LOCATION =
  /\b(australia|nsw|new south wales|vic|victoria|qld|queensland|western australia|south australia|tasmania|tas|northern territory|nt|act|canberra|sydney|melbourne|brisbane|perth|adelaide|hobart|darwin|alice springs|katherine|cairns|townsville|kalgoorlie|dubbo|orange|warrnambool|mackay|rockhampton|toowoomba|bunbury|geraldton|broome|karratha|port hedland|mount isa|mildura|wagga wagga)\b/i;

/** Lokasi lowongan kemungkinan di Australia (nama negara, negara bagian, atau kota utama/wilayah DAMA). */
export const isAustralianLocation = (
  text: string | null | undefined,
): boolean => Boolean(text && AU_LOCATION.test(text));
