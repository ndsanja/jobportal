import { describe, expect, it } from "vitest";
import { findHtmlMetaDate, findPageDate } from "./page-date";

const now = new Date("2026-10-05");

describe("findPageDate", () => {
  it("membaca 'Page last updated' gaya Home Affairs", () => {
    expect(
      findPageDate("Foo\nPage last updated: 26 September 2025\nBar", now),
    ).toBe("2025-09-26");
  });
  it("membaca format Indonesia dan ISO", () => {
    expect(findPageDate("Terakhir diperbarui 3 Maret 2026", now)).toBe(
      "2026-03-03",
    );
    expect(findPageDate("Last modified (metadata): 2026-02-01", now)).toBe(
      "2026-02-01",
    );
  });
  it("memilih yang terbaru dan mengabaikan tanggal masa depan / tanpa label", () => {
    const text =
      "Published: 1 January 2024. Updated: 5 May 2025. Updated: 9 December 2030. Tgl 3 Maret 2026 tanpa label";
    expect(findPageDate(text, now)).toBe("2025-05-05");
  });
  it("tanggal tidak valid atau tanpa label → null", () => {
    expect(findPageDate("Updated: 31 Februari 2025", now)).toBeNull();
    expect(findPageDate("Biaya 840 pada 12 Maret 2026", now)).toBeNull();
  });
});

describe("findHtmlMetaDate", () => {
  it("membaca meta tag dan JSON-LD", () => {
    expect(
      findHtmlMetaDate(
        '<meta property="article:modified_time" content="2026-03-12T10:00:00Z">',
        now,
      ),
    ).toBe("2026-03-12");
    expect(
      findHtmlMetaDate(
        '<meta content="2025-11-02" name="DCTERMS.modified">',
        now,
      ),
    ).toBe("2025-11-02");
    expect(
      findHtmlMetaDate(
        '<script type="application/ld+json">{"dateModified":"2026-01-09T00:00:00+00:00"}</script>',
        now,
      ),
    ).toBe("2026-01-09");
  });
  it("tanpa metadata → null", () => {
    expect(
      findHtmlMetaDate("<html><meta charset='utf-8'></html>", now),
    ).toBeNull();
  });
});
