import { z } from "zod";
import { htmlToText } from "@/domain/text";
import type { AtsConfig } from "../config";
import { getJson } from "../http";
import type { AdapterResult, FetchLike } from "../types";
import { buildItem } from "./build-item";

const jobSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  title: z.string(),
  absolute_url: z.string(),
  updated_at: z.string().nullish(),
  location: z.object({ name: z.string().nullish() }).nullish(),
  content: z.string().nullish(),
  departments: z.array(z.object({ name: z.string().nullish() })).nullish(),
});

export function parseGreenhouse(
  json: unknown,
  config: AtsConfig,
): AdapterResult {
  const root = z.object({ jobs: z.array(z.unknown()) }).parse(json);
  const items: AdapterResult["items"] = [];
  let skipped = 0;

  for (const entry of root.jobs) {
    const job = jobSchema.safeParse(entry);
    const item = job.success
      ? buildItem({
          externalId: job.data.id,
          title: job.data.title,
          organizationName: config.company,
          applyUrl: job.data.absolute_url,
          locationText: job.data.location?.name,
          fallbackCountry: config.default_country ?? null,
          category: job.data.departments?.[0]?.name,
          description: job.data.content ? htmlToText(job.data.content) : null,
          publishedAt: job.data.updated_at,
        })
      : null;
    if (item) items.push(item);
    else skipped += 1;
  }

  return { items, skipped, fullFeed: true };
}

export async function fetchGreenhouse(
  config: AtsConfig,
  fetchImpl: FetchLike,
): Promise<AdapterResult> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(config.token)}/jobs?content=true`;
  return parseGreenhouse(await getJson(url, fetchImpl), config);
}
