import { describe, expect, it } from "vitest";
import { isAustralianLocation, parseAtsBoard } from "./ats-discovery";

describe("parseAtsBoard", () => {
  it("mengenali board dari URL lowongan berbagai ATS", () => {
    expect(
      parseAtsBoard(
        "https://job-boards.greenhouse.io/territoryfamilies/jobs/123",
      ),
    ).toEqual({
      provider: "greenhouse",
      token: "territoryfamilies",
      boardUrl: "https://boards.greenhouse.io/territoryfamilies",
    });
    expect(
      parseAtsBoard("https://jobs.lever.co/acme-mining/abc-def")?.token,
    ).toBe("acme-mining");
    expect(parseAtsBoard("https://jobs.ashbyhq.com/Outback?x=1")?.token).toBe(
      "outback",
    );
    expect(
      parseAtsBoard("https://jobs.smartrecruiters.com/NTHealth/7438")?.provider,
    ).toBe("smartrecruiters");
  });
  it("menolak situs lain dan jalur sistem", () => {
    expect(parseAtsBoard("https://www.seek.com.au/job/1")).toBeNull();
    expect(
      parseAtsBoard("https://boards.greenhouse.io/embed/job_board"),
    ).toBeNull();
    expect(parseAtsBoard("bukan url")).toBeNull();
  });
});

describe("isAustralianLocation", () => {
  it("mengenali kota & negara bagian Australia", () => {
    expect(isAustralianLocation("Darwin, NT")).toBe(true);
    expect(isAustralianLocation("Kalgoorlie WA")).toBe(true);
    expect(isAustralianLocation("Remote - Australia")).toBe(true);
    expect(isAustralianLocation("London, United Kingdom")).toBe(false);
  });
});
