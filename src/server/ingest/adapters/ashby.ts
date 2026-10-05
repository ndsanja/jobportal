import { z } from "zod";
import type { AtsConfig } from "../config";
import { getJson } from "../http";
import type { AdapterResult, FetchLike } from "../types";
import { buildItem } from "./build-item";

const jobSchema = z.object({
  id: z.string(),
  title: z.string(),
  department: z.string().nullish(),
  location: z.string().nullish(),
  isRemote: z.boolean().nullish(),
  isListed: z.boolean().nullish(),
  employmentType: z.string().nullish(),
  publishedAt: z.string().nullish(),
  jobUrl: z.string().nullish(),
  applyUrl: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  address: z
    .object({
      postalAddress: z
        .object({
          addressCountry: z.string().nullish(),
          addressRegion: z.string().nullish(),
          addressLocality: z.string().nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

export function parseAshby(json: unknown, config: AtsConfig): AdapterResult {
  const root = z.object({ jobs: z.array(z.unknown()) }).parse(json);
  const items: AdapterResult["items"] = [];
  let skipped = 0;

  for (const entry of root.jobs) {
    const job = jobSchema.safeParse(entry);
    if (job.success && job.data.isListed === false) continue; // tidak dipublikasikan oleh perusahaan

    const url = job.success ? (job.data.jobUrl ?? job.data.applyUrl) : null;
    const postal = job.success ? job.data.address?.postalAddress : null;
    const item =
      job.success && url
        ? buildItem({
            externalId: job.data.id,
            title: job.data.title,
            organizationName: config.company,
            applyUrl: url,
            locationText: [job.data.location, postal?.addressCountry]
              .filter(Boolean)
              .join(", "),
            fallbackCountry: config.default_country ?? null,
            city: postal?.addressLocality,
            region: postal?.addressRegion,
            isRemote: job.data.isRemote ?? undefined,
            category: job.data.department,
            employmentType: job.data.employmentType,
            description: job.data.descriptionPlain,
            publishedAt: job.data.publishedAt,
          })
        : null;
    if (item) items.push(item);
    else skipped += 1;
  }

  return { items, skipped, fullFeed: true };
}

export async function fetchAshby(
  config: AtsConfig,
  fetchImpl: FetchLike,
): Promise<AdapterResult> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(config.token)}?includeCompensation=true`;
  return parseAshby(await getJson(url, fetchImpl), config);
}
