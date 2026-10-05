import type { FetchLike } from "./types";

const DEFAULT_USER_AGENT =
  "KarirProBot/1.0 (+https://karirpro.id; ndsanja@gmail.com)";

export const defaultFetch: FetchLike = (input, init) =>
  fetch(input, {
    ...init,
    headers: {
      "User-Agent": process.env.INGEST_USER_AGENT ?? DEFAULT_USER_AGENT,
      Accept: "application/json",
      ...init?.headers,
    },
    signal: init?.signal ?? AbortSignal.timeout(20_000),
  });

export async function getJson(
  url: string,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    // Jangan sertakan URL penuh: dapat memuat kunci API pada query string.
    const host = new URL(url).host;
    throw new Error(`Permintaan ke ${host} gagal: HTTP ${response.status}`);
  }
  return response.json();
}

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
