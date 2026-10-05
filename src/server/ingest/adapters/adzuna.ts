import { z } from "zod";
import { currencyForCountry } from "@/domain/countries";
import type { AdzunaConfig } from "../config";
import { getJson, sleep } from "../http";
import type { AdapterResult, FetchLike } from "../types";
import { buildItem } from "./build-item";

const resultSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string(),
  description: z.string().nullish(),
  created: z.string().nullish(),
  redirect_url: z.string(),
  company: z.object({ display_name: z.string().nullish() }).nullish(),
  location: z
    .object({
      display_name: z.string().nullish(),
      area: z.array(z.string()).nullish(),
    })
    .nullish(),
  salary_min: z.number().nullish(),
  salary_max: z.number().nullish(),
  salary_is_predicted: z.union([z.string(), z.number()]).nullish(),
  contract_time: z.string().nullish(),
  category: z.object({ label: z.string().nullish() }).nullish(),
});

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: "Penuh waktu",
  part_time: "Paruh waktu",
};

export function parseAdzuna(
  json: unknown,
  config: AdzunaConfig,
): AdapterResult {
  const root = z.object({ results: z.array(z.unknown()) }).parse(json);
  const currency = currencyForCountry(config.default_country);
  const items: AdapterResult["items"] = [];
  let skipped = 0;

  for (const entry of root.results) {
    const result = resultSchema.safeParse(entry);
    const company = result.success
      ? result.data.company?.display_name?.trim()
      : null;
    if (!result.success || !company) {
      skipped += 1;
      continue;
    }

    const data = result.data;
    const area = data.location?.area ?? [];
    const predicted =
      data.salary_is_predicted === "1" || data.salary_is_predicted === 1;
    const hasSalary =
      !predicted &&
      currency &&
      (data.salary_min != null || data.salary_max != null);

    const item = buildItem({
      externalId: data.id,
      title: data.title,
      organizationName: company,
      applyUrl: data.redirect_url,
      // Adzuna: area = [negara, wilayah, kota?]
      locationText: data.location?.display_name,
      fallbackCountry: config.default_country,
      countryCode: config.default_country,
      region: area[1],
      city: area.length > 2 ? area[area.length - 1] : undefined,
      category: data.category?.label,
      employmentType: data.contract_time
        ? (EMPLOYMENT_LABEL[data.contract_time] ?? data.contract_time)
        : null,
      description: data.description,
      publishedAt: data.created,
      salary: hasSalary
        ? {
            min: data.salary_min ?? null,
            max: data.salary_max ?? null,
            currency,
            period: "year",
          }
        : null,
    });

    if (item) items.push(item);
    else skipped += 1;
  }

  return { items, skipped, fullFeed: false };
}

export async function fetchAdzuna(
  config: AdzunaConfig,
  credentials: { appId: string; appKey: string },
  fetchImpl: FetchLike,
  options: { delayMs?: number } = {},
): Promise<AdapterResult> {
  // Batas default Adzuna: 25 permintaan/menit -> jeda >= 2,4 detik antar permintaan.
  const delayMs = options.delayMs ?? 2500;
  const seen = new Map<string, AdapterResult["items"][number]>();
  let skipped = 0;
  let first = true;

  for (const query of config.queries) {
    for (let page = 1; page <= config.pages; page += 1) {
      if (!first) await sleep(delayMs);
      first = false;

      const params = new URLSearchParams({
        app_id: credentials.appId,
        app_key: credentials.appKey,
        results_per_page: String(config.results_per_page),
        what: query.what,
        "content-type": "application/json",
      });
      if (query.where) params.set("where", query.where);

      const url = `https://api.adzuna.com/v1/api/jobs/${config.country}/search/${page}?${params}`;
      const result = parseAdzuna(await getJson(url, fetchImpl), config);
      skipped += result.skipped;
      for (const item of result.items) seen.set(item.externalId, item);
    }
  }

  return { items: [...seen.values()], skipped, fullFeed: false };
}
