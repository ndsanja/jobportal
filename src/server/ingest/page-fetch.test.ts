import { describe, expect, it, vi } from "vitest";
import { fetchPageText } from "./page-fetch";

const longHtml = `<html><head><style>.x{}</style></head><body><nav>menu</nav><p>${"Pendaftaran dibuka sampai 6 Oktober 2026. ".repeat(10)}</p><script>x()</script></body></html>`;

describe("fetchPageText", () => {
  it("mengubah HTML menjadi teks tanpa script/style", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(longHtml, { headers: { "content-type": "text/html" } }),
    );
    const page = await fetchPageText("https://contoh.org/halaman", {
      fetcher: "fetch",
      fetch: fetchMock,
      maxChars: 40000,
    });
    expect(page.text).toContain("Pendaftaran dibuka sampai 6 Oktober 2026.");
    expect(page.text).not.toContain("x()");
    expect(page.truncated).toBe(false);
  });

  it("menandai teks yang dipotong", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(longHtml, { headers: { "content-type": "text/html" } }),
    );
    const page = await fetchPageText("https://contoh.org/halaman", {
      fetcher: "fetch",
      fetch: fetchMock,
      maxChars: 250,
    });
    expect(page.text.length).toBe(250);
    expect(page.truncated).toBe(true);
  });

  it("menolak PDF pada fetcher biasa dan konten terlalu pendek", async () => {
    const pdf = vi.fn(
      async () =>
        new Response("%PDF", {
          headers: { "content-type": "application/pdf" },
        }),
    );
    await expect(
      fetchPageText("https://contoh.org/a.pdf", {
        fetcher: "fetch",
        fetch: pdf,
        maxChars: 1000,
      }),
    ).rejects.toThrow(/PDF/);

    const short = vi.fn(
      async () =>
        new Response("<p>Loading...</p>", {
          headers: { "content-type": "text/html" },
        }),
    );
    await expect(
      fetchPageText("https://contoh.org/spa", {
        fetcher: "fetch",
        fetch: short,
        maxChars: 1000,
      }),
    ).rejects.toThrow(/terlalu pendek/);
  });

  it("firecrawl: butuh kunci, memakai markdown, dan error tanpa membocorkan kunci", async () => {
    await expect(
      fetchPageText("https://contoh.org/", {
        fetcher: "firecrawl",
        fetch: vi.fn(),
        maxChars: 1000,
      }),
    ).rejects.toThrow(/FIRECRAWL_API_KEY/);

    const ok = vi.fn(async () =>
      Response.json({
        success: true,
        data: { markdown: `# Judul\n\n${"Isi halaman. ".repeat(30)}` },
      }),
    );
    const page = await fetchPageText("https://contoh.org/", {
      fetcher: "firecrawl",
      fetch: ok,
      firecrawlKey: "kunci-fc",
      maxChars: 5000,
    });
    expect(page.text.startsWith("# Judul")).toBe(true);

    const bad = vi.fn(async () => new Response("x", { status: 402 }));
    const error = await fetchPageText("https://contoh.org/", {
      fetcher: "firecrawl",
      fetch: bad,
      firecrawlKey: "kunci-fc",
      maxChars: 1000,
    }).catch((e: Error) => e);
    expect((error as Error).message).toContain("HTTP 402");
    expect((error as Error).message).not.toContain("kunci-fc");
  });
});
