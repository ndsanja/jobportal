import { describe, expect, it } from "vitest";
import {
  deadlineInstant,
  deriveOpportunityFacts,
  type FactClaim,
  nextResearchAt,
  zoneOffsetMinutes,
} from "./facts";

const now = new Date("2026-10-01T00:00:00Z");
const official = [
  { url: "https://www.chevening.org/x", tier: "official" as const, asOf: null },
];
const claim = (
  id: string,
  field: string,
  value: unknown,
  extra: Partial<FactClaim> = {},
): FactClaim => ({
  id,
  field,
  value,
  status: "accepted",
  confidence: 95,
  evidence: official,
  ...extra,
});

describe("zoneOffsetMinutes & deadlineInstant", () => {
  it("mengenali singkatan, UTC+n, dan nama IANA", () => {
    expect(zoneOffsetMinutes("WIB", "2026-10-06")).toBe(420);
    expect(zoneOffsetMinutes("UTC+7", "2026-10-06")).toBe(420);
    expect(zoneOffsetMinutes("GMT-05:00", "2026-10-06")).toBe(-300);
    expect(zoneOffsetMinutes("Europe/London", "2026-07-01")).toBe(60);
    expect(zoneOffsetMinutes("Europe/London", "2026-12-01")).toBe(0);
    expect(zoneOffsetMinutes("Planet/Mars", "2026-12-01")).toBeNull();
  });

  it("menghitung saat tenggat; tanpa jam → 23.59 WIB", () => {
    expect(deadlineInstant("2026-10-06", "11:00", "UTC")).toEqual({
      instant: "2026-10-06T11:00:00.000Z",
      precision: "exact",
    });
    expect(deadlineInstant("2026-10-06", null, null)).toEqual({
      instant: "2026-10-06T16:59:00.000Z",
      precision: "day",
    });
    expect(deadlineInstant("2026-10-06", null, "AEST").instant).toBe(
      "2026-10-06T13:59:00.000Z",
    );
  });
});

describe("deriveOpportunityFacts", () => {
  it("tenggat terdekat yang belum lewat menentukan status open", () => {
    const facts = deriveOpportunityFacts(
      [
        claim("a", "schedule.event", {
          kind: "open",
          date: "2026-08-05",
          label: "Pendaftaran dibuka",
        }),
        claim("b", "schedule.event", {
          kind: "close",
          date: "2026-10-06",
          time: "11:00",
          timezone: "UTC",
          label: "Penutupan",
        }),
        claim("c", "funding.type", { type: "full" }),
        claim("d", "study.level", { level: "master" }),
        claim("e", "eligibility.indonesia", { eligible: true }),
      ],
      now,
    );
    expect(facts.status).toBe("open");
    expect(facts.closesAt).toBe("2026-10-06T11:00:00.000Z");
    expect(facts.closesPrecision).toBe("exact");
    expect(facts.funding).toBe("Penuh");
    expect(facts.studyLevels).toEqual(["master"]);
    expect(facts.eligibleForIndonesia).toBe(true);
    expect(facts.verified).toBe(true);
    expect(facts.events[1]?.label).toBe("Penutupan (11:00 UTC)");
  });

  it("semua tenggat sudah lewat → closed; pembukaan di masa depan → upcoming", () => {
    const past = deriveOpportunityFacts(
      [
        claim("b", "schedule.event", {
          kind: "close",
          date: "2026-03-01",
          label: "Tutup",
        }),
      ],
      now,
    );
    expect(past.status).toBe("closed");
    const later = deriveOpportunityFacts(
      [
        claim("a", "schedule.event", {
          kind: "open",
          date: "2026-11-01",
          label: "Buka",
        }),
        claim("b", "schedule.event", {
          kind: "close",
          date: "2026-12-01",
          label: "Tutup",
        }),
      ],
      now,
    );
    expect(later.status).toBe("upcoming");
  });

  it("klaim belum resmi atau bukti usang tidak mengubah listing", () => {
    const facts = deriveOpportunityFacts(
      [
        claim(
          "a",
          "schedule.event",
          { kind: "close", date: "2026-12-01", label: "Tutup" },
          { status: "disputed" },
        ),
        claim(
          "b",
          "funding.type",
          { type: "partial" },
          {
            evidence: [
              { url: "https://x.gov/y", tier: "official", asOf: "2020-01-01" },
            ],
          },
        ),
      ],
      now,
    );
    expect(facts.status).toBeUndefined();
    expect(facts.closesAt).toBeUndefined();
    expect(facts.funding).toBeUndefined();
    expect(facts.verified).toBe(false);
  });
});

describe("nextResearchAt", () => {
  const cfg = { refreshDays: 7, urgentDays: 2, closedRefreshDays: 30 };
  const days = (d: Date) =>
    Math.round((d.getTime() - now.getTime()) / 86_400_000);
  it("lebih sering menjelang tenggat, jarang bila tutup, cepat bila gagal", () => {
    expect(
      days(
        nextResearchAt(
          {
            status: "open",
            closesAt: "2026-10-10T00:00:00Z",
            outcome: "success",
          },
          now,
          cfg,
        ),
      ),
    ).toBe(2);
    expect(
      days(
        nextResearchAt(
          { status: "open", closesAt: null, outcome: "success" },
          now,
          cfg,
        ),
      ),
    ).toBe(7);
    expect(
      days(
        nextResearchAt(
          { status: "closed", closesAt: null, outcome: "success" },
          now,
          cfg,
        ),
      ),
    ).toBe(30);
    expect(
      days(
        nextResearchAt(
          { status: "open", closesAt: null, outcome: "failed" },
          now,
          cfg,
        ),
      ),
    ).toBe(1);
  });
});
