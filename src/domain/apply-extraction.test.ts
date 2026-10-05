import { describe, expect, it } from "vitest";
import { planApply } from "./apply-extraction";
import type { ValidatedExtraction } from "./scholarship-extraction";

const now = new Date("2026-10-05T00:00:00Z");
const empty: ValidatedExtraction = {
  dates: [],
  funding: null,
  study_levels: null,
  application_status: null,
};
const current = {
  status: "upcoming" as const,
  closes_at: null,
  funding: null,
  study_levels: [] as string[],
};
const date = (
  kind: ValidatedExtraction["dates"][number]["kind"],
  starts_on: string,
  ends_on: string | null = null,
) => ({
  kind,
  label: `Tanggal ${kind}`,
  starts_on,
  ends_on,
  evidence: "kutipan",
});

describe("planApply", () => {
  it("tidak mengubah apa pun bila tidak ada fakta", () => {
    expect(planApply(current, empty, now)).toEqual({
      updates: {},
      events: [],
      changes: [],
    });
  });

  it("memilih tenggat terdekat yang belum lewat", () => {
    const plan = planApply(
      current,
      {
        ...empty,
        dates: [
          date("close", "2026-09-01"),
          date("close", "2026-12-15"),
          date("close", "2026-11-01"),
        ],
      },
      now,
    );
    expect(plan.updates.closes_at).toBe("2026-11-01T23:59:59Z");
    expect(plan.events).toHaveLength(3);
  });

  it("mempertahankan tenggat tersimpan bila harinya sama (menjaga jam)", () => {
    const plan = planApply(
      { ...current, closes_at: "2026-10-06T11:00:00Z" },
      { ...empty, dates: [date("close", "2026-10-06")] },
      now,
    );
    expect(plan.updates.closes_at).toBeUndefined();
    expect(plan.changes).toEqual([]);
  });

  it("tidak mengosongkan tenggat bila semua tanggal sudah lewat", () => {
    const plan = planApply(
      { ...current, closes_at: "2026-12-01T00:00:00Z" },
      { ...empty, dates: [date("close", "2026-03-01")] },
      now,
    );
    expect(plan.updates.closes_at).toBeUndefined();
  });

  it("mencatat perubahan pendanaan, jenjang (urutan diabaikan), dan status", () => {
    const plan = planApply(
      { ...current, study_levels: ["master", "doctoral"], funding: "Penuh" },
      {
        ...empty,
        funding: { text: "Penuh + tunjangan", evidence: "kutipan" },
        study_levels: { values: ["doctoral", "master"], evidence: "kutipan" },
        application_status: { value: "open", evidence: "kutipan" },
      },
      now,
    );
    expect(plan.updates).toEqual({
      funding: "Penuh + tunjangan",
      status: "open",
    });
    expect(plan.changes.map((c) => c.field)).toEqual(["funding", "status"]);
  });

  it("status 'closed' pada program berulang menjadi 'upcoming'", () => {
    const plan = planApply(
      { ...current, status: "open" },
      {
        ...empty,
        application_status: { value: "closed", evidence: "kutipan" },
      },
      now,
    );
    expect(plan.updates.status).toBe("upcoming");
  });
});
