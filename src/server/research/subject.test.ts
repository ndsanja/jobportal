import { describe, expect, it } from "vitest";
import { buildOpportunitySpec, searchName } from "./subject";

const now = new Date("2026-10-05T00:00:00Z");

describe("searchName", () => {
  it("membersihkan judul untuk kueri", () => {
    expect(searchName("Chevening Scholarships — Indonesia")).toBe(
      "Chevening Scholarships",
    );
    expect(searchName("Beasiswa DAAD (Jerman)")).toBe("DAAD");
    expect(searchName("Global Korea Scholarship (GKS)")).toBe(
      "Global Korea Scholarship",
    );
    expect(searchName("Fulbright (AMINEF) — Magister & Doktor")).toBe(
      "Fulbright",
    );
  });
});

describe("buildOpportunitySpec", () => {
  const base = {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Chevening Scholarships — Indonesia",
    kind: "scholarship" as const,
    countryName: "Inggris",
    officialUrl: "https://www.chevening.org/scholarships/application-timeline/",
    applyUrl: "https://www.chevening.org/scholarship/indonesia/",
    organizationName: "Chevening",
    organizationWebsite: "https://www.chevening.org",
  };

  it("menurunkan domain resmi, benih, dan kueri dari data peluang", () => {
    const spec = buildOpportunitySpec(base, {}, now);
    expect(spec.subject.subject_key).toBe(`opportunity:${base.id}`);
    expect(spec.profile).toBe("scholarship");
    expect(spec.officialDomains).toEqual(["chevening.org"]);
    expect(spec.seedUrls).toEqual([base.officialUrl, base.applyUrl]);
    expect(spec.queries.map((q) => q.q)).toContain(
      "site:chevening.org Chevening Scholarships deadline 2026 2027",
    );
    expect(spec.queries.some((q) => q.recency === "year")).toBe(true);
    expect(spec.fields).toContain("schedule.event");
    expect(spec.description).toContain("untuk pelamar dari Indonesia");
  });

  it("situs agregator tidak pernah menjadi domain resmi; penyesuaian admin menang", () => {
    const spec = buildOpportunitySpec(
      {
        ...base,
        kind: "program",
        officialUrl: null,
        applyUrl: "https://www.linkedin.com/jobs/view/1",
        organizationWebsite: null,
      },
      { max_pages: 3, queries: ["custom query for program"] },
      now,
    );
    expect(spec.officialDomains).toEqual([]);
    expect(spec.seedUrls).toEqual([]);
    expect(spec.profile).toBe("job_program");
    expect(spec.maxPages).toBe(3);
    expect(spec.queries).toEqual([{ q: "custom query for program" }]);
  });
});
