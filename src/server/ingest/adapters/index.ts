import { sourceConfigSchema } from "../config";
import type { AdapterResult, FetchLike, IngestSource } from "../types";
import { fetchAdzuna } from "./adzuna";
import { fetchAshby } from "./ashby";
import { fetchGreenhouse } from "./greenhouse";
import { fetchLever } from "./lever";
import { fetchSmartRecruiters } from "./smartrecruiters";

export type AdapterDeps = {
  fetch: FetchLike;
  env: { ADZUNA_APP_ID?: string; ADZUNA_APP_KEY?: string };
};

/** Menjalankan adapter yang sesuai dengan `config.provider` sebuah sumber. */
export async function runAdapter(
  source: IngestSource,
  deps: AdapterDeps,
): Promise<AdapterResult> {
  const parsed = sourceConfigSchema.safeParse(source.config);
  if (!parsed.success) {
    throw new Error(
      `Konfigurasi sumber "${source.slug}" tidak valid: ${parsed.error.issues[0]?.message}`,
    );
  }
  const config = parsed.data;

  switch (config.provider) {
    case "greenhouse":
      return fetchGreenhouse(config, deps.fetch);
    case "lever":
      return fetchLever(config, deps.fetch);
    case "ashby":
      return fetchAshby(config, deps.fetch);
    case "page_monitor":
      throw new Error(
        `Sumber "${source.slug}" adalah pemantau halaman, bukan adapter lowongan.`,
      );
    case "smartrecruiters":
      return fetchSmartRecruiters(config, deps.fetch);
    case "adzuna": {
      const { ADZUNA_APP_ID: appId, ADZUNA_APP_KEY: appKey } = deps.env;
      if (!appId || !appKey)
        throw new Error("ADZUNA_APP_ID / ADZUNA_APP_KEY belum diatur.");
      return fetchAdzuna(config, { appId, appKey }, deps.fetch);
    }
  }
}
