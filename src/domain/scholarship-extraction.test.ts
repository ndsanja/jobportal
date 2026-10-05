import { describe, expect, it } from "vitest";
import {
  evidenceInText,
  hasAcceptedFacts,
  normalizeForMatch,
  validateExtraction,
} from "./scholarship-extraction";

const now = new Date("2026-10-05T00:00:00Z");
const page = `Applications for 2027-2028 Chevening Scholarships are open until 6 October 2026, at 11:00 (UTC).
You must have at least two years' work experience. The scholarship covers master’s degrees.`;

describe("evidenceInText", () => {
  it("cocok walau beda spasi, huruf, dan tanda kutip", () => {
    expect(
      evidenceInText(
        "applications for 2027-2028  chevening scholarships are open",
        page,
      ),
    ).toBe(true);
    expect(evidenceInText("at least two years’ work experience", page)).toBe(
      true,
    );
    expect(normalizeForMatch("A – B")).toBe("a - b");
  });

  it("menolak kutipan yang tidak ada atau terlalu pendek", () => {
    expect(evidenceInText("deadline is 30 November 2026", page)).toBe(false);
    expect(evidenceInText("open", page)).toBe(false);
  });
});

describe("validateExtraction", () => {
  const good = {
    dates: [
      {
        kind: "close",
        label: "Penutupan pendaftaran",
        starts_on: "2026-10-06",
        evidence: "are open until 6 October 2026, at 11:00 (UTC)",
      },
    ],
    funding: null,
    study_levels: { values: ["master"], evidence: "covers master’s degrees" },
  };

  it("menerima fakta dengan kutipan valid", () => {
    const result = validateExtraction(good, page, now);
    if ("error" in result) throw new Error(result.error);
    expect(result.accepted.dates).toHaveLength(1);
    expect(result.accepted.study_levels?.values).toEqual(["master"]);
    expect(result.rejected).toEqual([]);
    expect(hasAcceptedFacts(result.accepted)).toBe(true);
  });

  it("membuang tanggal yang kutipannya dikarang model (halusinasi)", () => {
    const result = validateExtraction(
      {
        dates: [
          {
            ...good.dates[0],
            evidence: "Applications close on 30 November 2026 at noon",
          },
        ],
      },
      page,
      now,
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.accepted.dates).toHaveLength(0);
    expect(result.rejected[0]).toMatchObject({ path: "dates.0" });
    expect(hasAcceptedFacts(result.accepted)).toBe(false);
  });

  it("membuang tanggal tidak valid atau di luar rentang wajar", () => {
    const ev = "are open until 6 October 2026, at 11:00 (UTC)";
    const bad = (starts_on: string, ends_on?: string) =>
      validateExtraction(
        {
          dates: [
            {
              kind: "close",
              label: "Tes tanggal",
              starts_on,
              ends_on,
              evidence: ev,
            },
          ],
        },
        page,
        now,
      );
    for (const input of [
      bad("2026-02-30"),
      bad("2019-01-01"),
      bad("2031-01-01"),
      bad("2026-10-06", "2026-10-01"),
    ]) {
      if ("error" in input) throw new Error(input.error);
      expect(input.accepted.dates).toHaveLength(0);
      expect(input.rejected).toHaveLength(1);
    }
  });

  it("mengembalikan error untuk skema yang rusak", () => {
    const result = validateExtraction(
      { dates: [{ kind: "close", starts_on: "besok" }] },
      page,
      now,
    );
    expect("error" in result).toBe(true);
  });
});
