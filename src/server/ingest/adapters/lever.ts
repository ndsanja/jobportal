import { z } from "zod";
import type { AtsConfig } from "../config";
import { getJson } from "../http";
import type { AdapterResult, FetchLike } from "../types";
import { buildItem } from "./build-item";

const postingSchema = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string().nullish(),
  applyUrl: z.string().nullish(),
  createdAt: z.number().nullish(),
  descriptionPlain: z.string().nullish(),
  workplaceType: z.string().nullish(),
  categories: z
    .object({
      location: z.string().nullish(),
      team: z.string().nullish(),
      commitment: z.string().nullish(),
    })
    .nullish(),
});

export function parseLever(json: unknown, config: AtsConfig): AdapterResult {
  const entries = z.array(z.unknown()).parse(json);
  const items: AdapterResult["items"] = [];
  let skipped = 0;

  for (const entry of entries) {
    const posting = postingSchema.safeParse(entry);
    const applyUrl = posting.success
      ? (posting.data.hostedUrl ?? posting.data.applyUrl)
      : null;
    const item =
      posting.success && applyUrl
        ? buildItem({
            externalId: posting.data.id,
            title: posting.data.text,
            organizationName: config.company,
            applyUrl,
            locationText: posting.data.categories?.location,
            fallbackCountry: config.default_country ?? null,
            isRemote: posting.data.workplaceType === "remote" || undefined,
            category: posting.data.categories?.team,
            employmentType: posting.data.categories?.commitment,
            description: posting.data.descriptionPlain,
            publishedAt: posting.data.createdAt
              ? new Date(posting.data.createdAt).toISOString()
              : null,
          })
        : null;
    if (item) items.push(item);
    else skipped += 1;
  }

  return { items, skipped, fullFeed: true };
}

export async function fetchLever(
  config: AtsConfig,
  fetchImpl: FetchLike,
): Promise<AdapterResult> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(config.token)}?mode=json`;
  return parseLever(await getJson(url, fetchImpl), config);
}
