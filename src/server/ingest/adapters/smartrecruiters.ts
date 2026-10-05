import { z } from "zod";
import type { AtsConfig } from "../config";
import { getJson } from "../http";
import type { AdapterResult, FetchLike } from "../types";
import { buildItem } from "./build-item";

const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

const postingSchema = z.object({
  id: z.string(),
  name: z.string(),
  releasedDate: z.string().nullish(),
  location: z
    .object({
      city: z.string().nullish(),
      region: z.string().nullish(),
      country: z.string().nullish(),
      remote: z.boolean().nullish(),
    })
    .nullish(),
  department: z.object({ label: z.string().nullish() }).nullish(),
  typeOfEmployment: z.object({ label: z.string().nullish() }).nullish(),
});

const pageSchema = z.object({
  totalFound: z.number().nullish(),
  content: z.array(z.unknown()),
});

/**
 * SmartRecruiters mengembalikan daftar tanpa deskripsi (butuh panggilan per lowongan),
 * jadi ringkasan kosong dan sinyal WHV/sponsor hanya berasal dari judul.
 */
export function parseSmartRecruiters(
  json: unknown,
  config: AtsConfig,
): AdapterResult & { totalFound: number | null } {
  const page = pageSchema.parse(json);
  const items: AdapterResult["items"] = [];
  let skipped = 0;

  for (const entry of page.content) {
    const posting = postingSchema.safeParse(entry);
    const item = posting.success
      ? buildItem({
          externalId: posting.data.id,
          title: posting.data.name,
          organizationName: config.company,
          applyUrl: `https://jobs.smartrecruiters.com/${encodeURIComponent(config.token)}/${posting.data.id}`,
          countryCode: posting.data.location?.country?.toUpperCase(),
          fallbackCountry: config.default_country ?? null,
          city: posting.data.location?.city,
          region: posting.data.location?.region,
          isRemote: posting.data.location?.remote ?? undefined,
          category: posting.data.department?.label,
          employmentType: posting.data.typeOfEmployment?.label,
          publishedAt: posting.data.releasedDate,
        })
      : null;
    if (item) items.push(item);
    else skipped += 1;
  }

  return {
    items,
    skipped,
    fullFeed: false,
    totalFound: page.totalFound ?? null,
  };
}

export async function fetchSmartRecruiters(
  config: AtsConfig,
  fetchImpl: FetchLike,
): Promise<AdapterResult> {
  const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(config.token)}/postings`;
  const seen = new Map<string, AdapterResult["items"][number]>();
  let skipped = 0;
  let total: number | null = null;
  let fetched = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = `${base}?limit=${PAGE_LIMIT}&offset=${page * PAGE_LIMIT}`;
    const result = parseSmartRecruiters(await getJson(url, fetchImpl), config);
    skipped += result.skipped;
    total = result.totalFound ?? total;
    for (const item of result.items) seen.set(item.externalId, item);
    fetched += result.items.length + result.skipped;
    if (result.items.length + result.skipped < PAGE_LIMIT) break;
    if (total !== null && fetched >= total) break;
  }

  // Feed dianggap lengkap hanya bila semua halaman sudah terambil.
  const complete = total !== null && fetched >= total;
  return { items: [...seen.values()], skipped, fullFeed: complete };
}
