import { describe, expect, it } from "vitest";
import {
  evaluateRequirement,
  type ReadinessProfile,
  summarizeReadiness,
} from "./readiness";

const now = new Date("2026-10-05T00:00:00Z");
const profile: ReadinessProfile = {
  birth_date: "2000-03-01",
  years_experience: 2,
  education_level: "s1",
};
const empty: ReadinessProfile = {
  birth_date: null,
  years_experience: null,
  education_level: null,
};

describe("evaluateRequirement", () => {
  it("usia: terpenuhi, tidak terpenuhi, atau tidak diketahui (tanpa menebak)", () => {
    const claim = { field: "requirement.age", value: { min: 18, max: 30 } };
    expect(evaluateRequirement(claim, profile, [], now).status).toBe("met");
    expect(
      evaluateRequirement(
        claim,
        { ...profile, birth_date: "1990-01-01" },
        [],
        now,
      ).status,
    ).toBe("unmet");
    expect(evaluateRequirement(claim, empty, [], now).status).toBe("unknown");
  });

  it("dokumen: ada, kedaluwarsa, diurus, belum punya, belum dicatat", () => {
    const claim = {
      field: "requirement.document",
      value: { doc_type: "passport" },
    };
    const doc = (
      status: "have" | "in_progress" | "missing",
      expires_on: string | null = null,
    ) => [{ document_type: "passport", status, expires_on }];
    expect(
      evaluateRequirement(claim, profile, doc("have", "2035-01-01"), now)
        .status,
    ).toBe("met");
    expect(
      evaluateRequirement(claim, profile, doc("have", "2026-01-01"), now),
    ).toMatchObject({ status: "unmet", detail: "Sudah kedaluwarsa" });
    expect(
      evaluateRequirement(claim, profile, doc("in_progress"), now).status,
    ).toBe("in_progress");
    expect(
      evaluateRequirement(claim, profile, doc("missing"), now).status,
    ).toBe("unmet");
    expect(evaluateRequirement(claim, profile, [], now).status).toBe("unknown");
  });

  it("bahasa Inggris: punya sertifikat tidak otomatis memenuhi skor (cek manual); tidak punya = belum terpenuhi", () => {
    const claim = {
      field: "requirement.english",
      value: {
        tests: [
          { test: "IELTS", min_overall: 4.5 },
          { test: "PTE", min_overall: null },
        ],
      },
    };
    const have = evaluateRequirement(
      claim,
      profile,
      [{ document_type: "ielts", status: "have", expires_on: "2028-01-01" }],
      now,
    );
    expect(have.status).toBe("manual");
    expect(have.detail).toContain("4.5");
    expect(
      evaluateRequirement(
        claim,
        profile,
        [{ document_type: "ielts", status: "missing", expires_on: null }],
        now,
      ).status,
    ).toBe("unmet");
    expect(
      evaluateRequirement(
        claim,
        profile,
        [{ document_type: "pte", status: "in_progress", expires_on: null }],
        now,
      ).status,
    ).toBe("in_progress");
    expect(evaluateRequirement(claim, profile, [], now).status).toBe("unknown");
  });

  it("pengalaman, pendidikan, kewarganegaraan, dana, lain-lain", () => {
    expect(
      evaluateRequirement(
        { field: "requirement.experience_years", value: { min: 2 } },
        profile,
        [],
        now,
      ).status,
    ).toBe("met");
    expect(
      evaluateRequirement(
        { field: "requirement.experience_years", value: { min: 3 } },
        profile,
        [],
        now,
      ).status,
    ).toBe("unmet");
    expect(
      evaluateRequirement(
        { field: "requirement.experience_years", value: { min: 3 } },
        empty,
        [],
        now,
      ).status,
    ).toBe("unknown");
    expect(
      evaluateRequirement(
        { field: "requirement.education", value: { min_level: "s1" } },
        profile,
        [],
        now,
      ).status,
    ).toBe("met");
    expect(
      evaluateRequirement(
        { field: "requirement.education", value: { min_level: "s2" } },
        profile,
        [],
        now,
      ).status,
    ).toBe("unmet");
    expect(
      evaluateRequirement(
        {
          field: "requirement.nationality",
          value: { countries: ["ID", "VN"] },
        },
        profile,
        [],
        now,
      ).status,
    ).toBe("met");
    expect(
      evaluateRequirement(
        { field: "requirement.nationality", value: { countries: ["TH"] } },
        profile,
        [],
        now,
      ).status,
    ).toBe("unmet");
    expect(
      evaluateRequirement(
        {
          field: "requirement.funds",
          value: { amount: 5000, currency: "AUD" },
        },
        profile,
        [],
        now,
      ).status,
    ).toBe("manual");
    expect(
      evaluateRequirement(
        { field: "requirement.other", value: { text: "x" } },
        profile,
        [],
        now,
      ).status,
    ).toBe("manual");
    expect(
      evaluateRequirement(
        { field: "bidang.asing", value: {} },
        profile,
        [],
        now,
      ).status,
    ).toBe("manual");
  });
});

describe("summarizeReadiness", () => {
  it("menghitung persentase dari syarat yang bisa dinilai; cek manual tidak dihitung", () => {
    const summary = summarizeReadiness([
      { status: "met", detail: "" },
      { status: "met", detail: "" },
      { status: "unmet", detail: "" },
      { status: "unknown", detail: "" },
      { status: "manual", detail: "" },
    ]);
    expect(summary).toMatchObject({
      met: 2,
      unmet: 1,
      unknown: 1,
      manual: 1,
      percent: 50,
    });
  });

  it("null bila tidak ada yang bisa dinilai", () => {
    expect(
      summarizeReadiness([{ status: "manual", detail: "" }]).percent,
    ).toBeNull();
    expect(summarizeReadiness([]).percent).toBeNull();
  });
});
