import { describe, expect, it } from "vitest";
import { dataQuality } from "./quality";

const now = new Date("2026-10-06T00:00:00Z");
const fresh = [{ retrieved_at: "2026-10-05T00:00:00Z" }];

describe("dataQuality", () => {
  it("tanpa fakta resmi → skor rendah", () => {
    const q = dataQuality([], "scholarship", now);
    expect(q.score).toBe(0);
    expect(q.level).toBe("rendah");
    expect(q.lastCheckedAt).toBeNull();
  });

  it("fakta kunci lengkap, baru dicek, tanpa sanggahan → tinggi", () => {
    const fields = [
      "eligibility.indonesia",
      "schedule.event",
      "funding.type",
      "study.level",
      "requirement.english",
      "requirement.age",
      "requirement.document",
      "process.step",
    ];
    const q = dataQuality(
      fields.map((field) => ({ field, status: "accepted", evidence: fresh })),
      "scholarship",
      now,
    );
    expect(q.coveredGroups).toBe(8);
    expect(q.score).toBe(100);
    expect(q.level).toBe("tinggi");
  });

  it("data lama dan bertentangan menurunkan skor", () => {
    const old = [{ retrieved_at: "2026-05-01T00:00:00Z" }];
    const q = dataQuality(
      [
        { field: "eligibility.indonesia", status: "accepted", evidence: old },
        { field: "schedule.event", status: "accepted", evidence: old },
        { field: "funding.type", status: "disputed", evidence: old },
      ],
      "scholarship",
      now,
    );
    expect(q.daysSinceCheck).toBeGreaterThan(90);
    expect(q.score).toBeLessThan(30);
  });
});
