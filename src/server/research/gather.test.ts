import { describe, expect, it, vi } from "vitest";
import type { ClaimExtraction } from "./extract";
import { type GatherParams, gatherClaims } from "./gather";

const rules = {
  officialDomains: ["homeaffairs.gov.au"],
  reputableDomains: ["kompas.com"],
};
const timeoutError = () =>
  Object.assign(new Error("The operation was aborted due to timeout"), {
    name: "TimeoutError",
  });

const claim = (summary: string): ClaimExtraction => ({
  ok: true,
  model: "m",
  rejected: [],
  claims: [
    {
      field: "requirement.age",
      value: { min: 18, max: 30 },
      summary,
      evidence: "aged 18 to 30",
    },
  ],
});

const base = (overrides: Partial<GatherParams> = {}): GatherParams => ({
  queries: ["q1", "q2"],
  maxPages: 5,
  rules,
  deadlineMs: Number.MAX_SAFE_INTEGER,
  search: async (q) =>
    q === "q1"
      ? [
          { url: "https://blog.example/a", title: "a" },
          { url: "https://immi.homeaffairs.gov.au/x", title: "x" },
        ]
      : [],
  loadKnownHashes: async () => new Map(),
  fetchPage: async () => "isi halaman yang cukup panjang untuk diuji",
  extract: async () => claim("Usia 18–30"),
  ...overrides,
});

describe("gatherClaims", () => {
  it("membaca halaman resmi lebih dulu dan mengumpulkan klaim dengan tier yang benar", async () => {
    const order: string[] = [];
    const result = await gatherClaims(
      base({ fetchPage: async (url) => (order.push(url), "teks halaman") }),
    );
    expect(order[0]).toBe("https://immi.homeaffairs.gov.au/x");
    expect(result.collected.map((c) => c.tier)).toEqual([
      "official",
      "community",
    ]);
    expect(result.stats).toMatchObject({
      pagesFound: 2,
      pagesRead: 2,
      pagesFailed: 0,
      claimsExtracted: 2,
    });
  });

  it("timeout pada pencarian tidak menjatuhkan run: kueri lain tetap jalan dan galat dicatat", async () => {
    const search = vi.fn(async (q: string) => {
      if (q === "q1") throw timeoutError();
      return [{ url: "https://kompas.com/berita", title: "b" }];
    });
    const result = await gatherClaims(base({ search }));
    expect(search).toHaveBeenCalledTimes(2);
    expect(result.stats.pagesRead).toBe(1);
    expect(result.stats.errors).toEqual(["cari #1: timeout"]);
  });

  it("timeout pada ekstraksi satu halaman hanya menggagalkan halaman itu", async () => {
    let call = 0;
    const result = await gatherClaims(
      base({
        extract: async () => {
          call += 1;
          if (call === 1) throw timeoutError();
          return claim("Usia 18–30");
        },
      }),
    );
    expect(result.stats).toMatchObject({ pagesRead: 1, pagesFailed: 1 });
    expect(result.stats.errors[0]).toMatch(
      /^ekstrak immi\.homeaffairs\.gov\.au: timeout$/,
    );
    expect(result.collected).toHaveLength(1);
  });

  it("kegagalan baca dan ekstraksi tak valid dicatat per host tanpa URL penuh", async () => {
    const result = await gatherClaims(
      base({
        fetchPage: async (url) => {
          if (url.includes("blog.example"))
            throw new Error("Permintaan ke blog.example gagal: HTTP 403");
          return "teks";
        },
        extract: async () => ({
          ok: false,
          error: "Keluaran model bukan JSON",
        }),
      }),
    );
    expect(result.stats.pagesFailed).toBe(2);
    expect(result.stats.errors).toContain(
      "baca blog.example: Permintaan ke blog.example gagal: HTTP 403",
    );
    expect(result.stats.errors).toContain(
      "ekstrak immi.homeaffairs.gov.au: Keluaran model bukan JSON",
    );
  });

  it("melewati halaman yang isinya tidak berubah (tanpa memanggil model)", async () => {
    const extract = vi.fn(async () => claim("x"));
    const first = await gatherClaims(base({ extract }));
    const known = new Map(first.readPages.map((p) => [p.url, p.hash]));
    extract.mockClear();
    const again = await gatherClaims(
      base({ extract, loadKnownHashes: async () => known }),
    );
    expect(extract).not.toHaveBeenCalled();
    expect(again.stats.pagesUnchanged).toBe(2);
    expect(again.unchangedUrls).toHaveLength(2);
  });

  it("berhenti dengan partial=true saat batas waktu habis, dan membatasi jumlah halaman", async () => {
    let now = 0;
    const slow = await gatherClaims(
      base({
        deadlineMs: 50,
        now: () => now,
        fetchPage: async () => {
          now += 60;
          return "teks";
        },
      }),
    );
    expect(slow.stats.partial).toBe(true);
    expect(slow.stats.pagesRead).toBe(1);

    const many = await gatherClaims(base({ maxPages: 1 }));
    expect(many.stats.pagesRead).toBe(1);
  });

  it("mencatat waktu per tahap dan membatasi jumlah galat", async () => {
    let now = 0;
    const result = await gatherClaims(
      base({
        queries: Array.from({ length: 12 }, (_, i) => `q${i}`),
        now: () => now,
        search: async () => {
          now += 10;
          throw timeoutError();
        },
      }),
    );
    expect(result.stats.errors).toHaveLength(8);
    expect(result.stats.timingsMs.search).toBe(120);
  });
});
