import { describe, expect, it } from "vitest";
import { groundingError, normalizeNumbers, numberInText } from "./grounding";
import { datesInText, dayMonthsInText } from "./page-date";

describe("numberInText", () => {
  const has = (n: number, text: string) =>
    numberInText(n, normalizeNumbers(text));

  it("mencocokkan angka dengan pemisah ribuan dan desimal", () => {
    expect(has(5000, "a stipend of £5,000 per year")).toBe(true);
    expect(has(5000, "tunjangan Rp5.000 per hari")).toBe(true);
    expect(has(6.5, "IELTS overall 6.5")).toBe(true);
    expect(has(6.5, "IELTS 6,5")).toBe(true);
    expect(has(3, "IPK minimal 3.00")).toBe(true);
  });

  it("tidak mencocokkan bagian dari angka lain", () => {
    expect(has(3, "IPK minimal 3.5")).toBe(false);
    expect(has(84, "AUD 840")).toBe(false);
    expect(has(840, "AUD 8400")).toBe(false);
  });

  it("mengenali kata bilangan dan skala", () => {
    expect(has(2, "at least two years of work experience")).toBe(true);
    expect(has(2, "pengalaman kerja minimal dua tahun")).toBe(true);
    expect(has(5_000_000, "uang saku Rp5 juta per bulan")).toBe(true);
    expect(has(1_500_000, "tunjangan 1,5 juta")).toBe(true);
  });
});

describe("datesInText", () => {
  it("membaca berbagai format dan rentang", () => {
    const found = datesInText(
      "Closes 6 October 2026. Opens August 5, 2026. Tes 1–30 Juni 2026. Ballot 1 June – 30 July 2027. ISO 2026-01-09",
    );
    for (const iso of [
      "2026-10-06",
      "2026-08-05",
      "2026-06-01",
      "2026-06-30",
      "2027-06-01",
      "2027-07-30",
      "2026-01-09",
    ])
      expect(found.has(iso)).toBe(true);
  });

  it("tidak menganggap kata biasa sebagai bulan", () => {
    expect(datesInText("You may 2026 apply")).toEqual(new Set());
    expect(dayMonthsInText("maybe 12 items")).toEqual(new Set());
  });
});

describe("groundingError", () => {
  it("menolak angka yang tidak ada di kutipan", () => {
    expect(
      groundingError(
        "fee.application",
        { amount: 640, currency: "AUD" },
        "The visa costs AUD840.",
        "",
      ),
    ).toMatch(/640/);
    expect(
      groundingError(
        "fee.application",
        { amount: 840, currency: "AUD" },
        "The visa costs AUD840.",
        "",
      ),
    ).toBeNull();
  });

  it("usia: 'under 31' boleh menjadi max 30", () => {
    expect(
      groundingError(
        "requirement.age",
        { min: 18, max: 30 },
        "applicants aged 18 or over and under 31",
        "",
      ),
    ).toBeNull();
    expect(
      groundingError(
        "requirement.age",
        { min: 18, max: 35 },
        "aged 18 to 30",
        "",
      ),
    ).toMatch(/35/);
  });

  it("tanggal wajib tertulis; hari+bulan cukup bila tahunnya ada di halaman", () => {
    const event = { kind: "close", date: "2026-10-06", label: "Tenggat" };
    expect(
      groundingError(
        "schedule.event",
        event,
        "Applications close on 6 October 2026 at 12:00 UK time",
        "",
      ),
    ).toBeNull();
    expect(
      groundingError(
        "schedule.event",
        event,
        "Applications close: 6 October",
        "Timeline 2026-2027",
      ),
    ).toBeNull();
    expect(
      groundingError(
        "schedule.event",
        event,
        "Applications close: 7 October",
        "2026",
      ),
    ).toMatch(/2026-10-06/);
  });

  it("bidang teks tidak diperiksa", () => {
    expect(
      groundingError("requirement.other", { text: "x" }, "apa pun", ""),
    ).toBeNull();
  });
});
