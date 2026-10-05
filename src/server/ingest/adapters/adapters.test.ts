import { describe, expect, it, vi } from "vitest";
import adzunaFixture from "../__fixtures__/adzuna.json";
import ashbyFixture from "../__fixtures__/ashby.json";
import greenhouseFixture from "../__fixtures__/greenhouse.json";
import leverFixture from "../__fixtures__/lever.json";
import { sourceConfigSchema } from "../config";
import { fetchAdzuna, parseAdzuna } from "./adzuna";
import { parseAshby } from "./ashby";
import { parseGreenhouse } from "./greenhouse";
import { runAdapter } from "./index";
import { parseLever } from "./lever";

const atsConfig = (
  provider: "greenhouse" | "lever" | "ashby",
  company: string,
  country?: string,
) =>
  sourceConfigSchema.parse({
    provider,
    token: company.toLowerCase(),
    company,
    default_country: country,
  });

const adzunaConfig = sourceConfigSchema.parse({
  provider: "adzuna",
  country: "au",
  default_country: "AU",
  queries: [{ what: "fruit picker" }, { what: "kitchen hand" }],
});
if (adzunaConfig.provider !== "adzuna") throw new Error("fixture config");

describe("Greenhouse", () => {
  const result = parseGreenhouse(
    greenhouseFixture,
    atsConfig("greenhouse", "Acme") as never,
  );

  it("memetakan lowongan valid dan melewati yang rusak", () => {
    expect(result.items).toHaveLength(2);
    expect(result.skipped).toBe(1);
    expect(result.fullFeed).toBe(true);
  });

  it("mengisi lokasi, negara, dan teks deskripsi dari HTML ter-escape", () => {
    const job = result.items[0];
    expect(job).toMatchObject({
      externalId: "4011223",
      title: "Senior Backend Engineer",
      organizationName: "Acme",
      countryCode: "DE",
      city: "Berlin",
      category: "Engineering",
      applyUrl: "https://boards.greenhouse.io/acme/jobs/4011223",
    });
    expect(job?.descriptionText).toContain("Visa sponsorship is available");
    expect(job?.descriptionText).not.toContain("<");
    expect(job?.publishedAt).toBe("2026-10-01T12:30:00.000Z");
  });

  it("mendeteksi remote dari teks lokasi", () => {
    expect(result.items[1]).toMatchObject({
      isRemote: true,
      countryCode: "NL",
      city: null,
    });
  });
});

describe("Lever", () => {
  const result = parseLever(
    leverFixture,
    atsConfig("lever", "ResortCo") as never,
  );

  it("memetakan lokasi, tim, dan tipe kerja", () => {
    expect(result.items).toHaveLength(2);
    expect(result.skipped).toBe(1);
    expect(result.items[0]).toMatchObject({
      title: "Hotel Receptionist",
      countryCode: "AU",
      city: "Cairns",
      region: "QLD",
      category: "Front Office",
      employmentType: "Full-time",
      applyUrl: "https://jobs.lever.co/resortco/a1b2c3",
    });
  });

  it("workplaceType remote -> isRemote", () => {
    expect(result.items[1]?.isRemote).toBe(true);
  });
});

describe("Ashby", () => {
  const result = parseAshby(
    ashbyFixture,
    atsConfig("ashby", "DataCo") as never,
  );

  it("melewati lowongan yang tidak terdaftar (isListed=false) tanpa menghitungnya sebagai gagal", () => {
    expect(result.items).toHaveLength(1);
    expect(result.skipped).toBe(0);
  });

  it("memakai alamat pos terstruktur", () => {
    expect(result.items[0]).toMatchObject({
      countryCode: "AU",
      city: "Sydney",
      region: "New South Wales",
      employmentType: "FullTime",
    });
  });
});

describe("Adzuna", () => {
  const result = parseAdzuna(adzunaFixture, adzunaConfig);

  it("melewati entri tanpa nama perusahaan", () => {
    expect(result.items).toHaveLength(2);
    expect(result.skipped).toBe(1);
    expect(result.fullFeed).toBe(false);
  });

  it("memetakan area, gaji tahunan, dan tipe kerja", () => {
    expect(result.items[0]).toMatchObject({
      organizationName: "Sunrise Orchards Pty Ltd",
      countryCode: "AU",
      region: "Queensland",
      city: "Bundaberg",
      employmentType: "Paruh waktu",
      category: "Agriculture Jobs",
      salary: { min: 52000, max: 58000, currency: "AUD", period: "year" },
    });
  });

  it("tidak menganggap nama wilayah sebagai kota", () => {
    const only = parseAdzuna(
      {
        results: [
          {
            id: "1",
            title: "Farm Hand",
            description: "Casual harvest work.",
            redirect_url: "https://www.adzuna.com.au/land/ad/1",
            company: { display_name: "Country Choice" },
            location: {
              display_name: "Queensland",
              area: ["Australia", "Queensland"],
            },
          },
        ],
      },
      adzunaConfig,
    );
    expect(only.items[0]).toMatchObject({ region: "Queensland", city: null });
  });

  it("mengabaikan gaji yang hanya prediksi Adzuna", () => {
    expect(result.items[1]?.salary).toBeNull();
  });

  it("fetchAdzuna menggabungkan query, membuang duplikat, dan tidak membocorkan kunci di error", async () => {
    const fetchMock = vi.fn(async () => Response.json(adzunaFixture));
    const merged = await fetchAdzuna(
      adzunaConfig,
      { appId: "id", appKey: "key" },
      fetchMock,
      { delayMs: 0 },
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(merged.items).toHaveLength(2); // hasil sama dari dua query -> dedupe by externalId

    const failing = vi.fn(async () => new Response("nope", { status: 429 }));
    const error = await fetchAdzuna(
      adzunaConfig,
      { appId: "id", appKey: "rahasia" },
      failing,
      {
        delayMs: 0,
      },
    ).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain("HTTP 429");
    expect(message).toContain("api.adzuna.com");
    expect(message).not.toContain("rahasia");
  });
});

describe("runAdapter", () => {
  const source = {
    id: "1",
    slug: "adzuna-au-whv",
    name: "Adzuna AU",
    kind: "api",
    authority: "aggregator",
    trustScore: 65,
    tracks: ["whv_au"],
    countryCode: "AU",
    attribution: "Jobs by Adzuna",
    config: {
      provider: "adzuna",
      country: "au",
      default_country: "AU",
      queries: [{ what: "picker" }],
    },
  } as const;

  it("gagal jelas bila kunci Adzuna belum diatur", async () => {
    await expect(
      runAdapter(
        { ...source, tracks: [...source.tracks] },
        { fetch: vi.fn(), env: {} },
      ),
    ).rejects.toThrow(/ADZUNA_APP_ID/);
  });

  it("gagal jelas bila konfigurasi tidak valid", async () => {
    await expect(
      runAdapter(
        {
          ...source,
          tracks: [...source.tracks],
          config: { provider: "lever" },
        },
        { fetch: vi.fn(), env: {} },
      ),
    ).rejects.toThrow(/tidak valid/);
  });
});
