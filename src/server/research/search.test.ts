import { describe, expect, it, vi } from "vitest";
import { isFetchableUrl, parseSearchResponse, searchWeb } from "./search";

describe("parseSearchResponse", () => {
  it("menerima bentuk larik maupun { web: [...] }, dan membuang platform sosial", () => {
    const items = [
      { url: "https://immi.homeaffairs.gov.au/visas/462", title: "462" },
      { url: "https://www.instagram.com/p/abc", title: "IG" },
      { url: "https://blog.example/whv", title: "Blog" },
      { url: "javascript:alert(1)", title: "x" },
      { title: "tanpa url" },
    ];
    expect(
      parseSearchResponse({ success: true, data: items }).map((r) => r.url),
    ).toEqual([
      "https://immi.homeaffairs.gov.au/visas/462",
      "https://blog.example/whv",
    ]);
    expect(parseSearchResponse({ data: { web: items } })).toHaveLength(2);
    expect(parseSearchResponse({})).toEqual([]);
  });

  it("isFetchableUrl", () => {
    expect(isFetchableUrl("https://m.facebook.com/x")).toBe(false);
    expect(isFetchableUrl("https://x.com/y")).toBe(false);
    expect(isFetchableUrl("https://t.me/s/channel")).toBe(true);
    expect(isFetchableUrl("ftp://file")).toBe(false);
  });
});

describe("searchWeb", () => {
  it("memakai endpoint pencarian dan tidak membocorkan kunci pada galat", async () => {
    const ok = vi.fn(async () =>
      Response.json({ data: [{ url: "https://a.example/x", title: "A" }] }),
    );
    expect(
      await searchWeb("whv", { apiKey: "k", limit: 3, fetch: ok }),
    ).toHaveLength(1);
    expect(String((ok.mock.calls[0] as unknown[])[0])).toBe(
      "https://api.firecrawl.dev/v1/search",
    );

    const bad = vi.fn(async () => new Response("x", { status: 402 }));
    const error = await searchWeb("whv", {
      apiKey: "kunci-rahasia",
      limit: 3,
      fetch: bad,
    }).catch((e: Error) => e);
    expect((error as Error).message).toBe("Pencarian gagal: HTTP 402");
  });
});
