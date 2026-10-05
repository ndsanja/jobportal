import { describe, expect, it } from "vitest";
import type { ClaimEvidence } from "@/domain/claims";
import { decideSubject, type SubjectClaimRow } from "./decide";

const ev = (domain: string, tier: ClaimEvidence["tier"]): ClaimEvidence => ({
  domain,
  tier,
  stance: "supports",
});
const row = (
  id: string,
  field: string,
  value_key: string,
  evidence: ClaimEvidence[],
  extra: Partial<SubjectClaimRow> = {},
): SubjectClaimRow => ({
  id,
  field,
  value_key,
  status: "proposed",
  decided_by: "system",
  evidence,
  ...extra,
});

describe("decideSubject", () => {
  it("memutuskan tiap bidang secara terpisah", () => {
    const updates = decideSubject([
      row("1", "requirement.age", "18-30", [
        ev("immi.homeaffairs.gov.au", "official"),
      ]),
      row("2", "requirement.funds", "5000", [ev("blog.example", "community")]),
    ]);
    expect(updates.find((u) => u.id === "1")?.status).toBe("accepted");
    expect(updates.find((u) => u.id === "2")?.status).toBe("proposed");
  });

  it("nilai resmi menang atas nilai lain pada bidang yang sama", () => {
    const updates = decideSubject([
      row("1", "requirement.age", "18-30", [
        ev("immi.homeaffairs.gov.au", "official"),
      ]),
      row("2", "requirement.age", "18-35", [ev("kompas.com", "reputable")]),
    ]);
    expect(updates.find((u) => u.id === "1")?.status).toBe("accepted");
    expect(updates.find((u) => u.id === "2")?.status).toBe("disputed");
  });

  it("keputusan admin tidak ditimpa dan menjadi pemenang; yang ditolak admin diabaikan", () => {
    const updates = decideSubject([
      row("1", "requirement.age", "18-30", [
        ev("immi.homeaffairs.gov.au", "official"),
      ]),
      row(
        "2",
        "requirement.age",
        "18-35",
        [ev("kompas.com", "reputable"), ev("antaranews.com", "reputable")],
        {
          status: "accepted",
          decided_by: "admin",
        },
      ),
      row("3", "requirement.age", "18-40", [ev("a.example", "community")], {
        status: "rejected",
        decided_by: "admin",
      }),
    ]);
    expect(updates.find((u) => u.id === "2")).toBeUndefined(); // tidak diubah sistem
    expect(updates.find((u) => u.id === "3")).toBeUndefined();
    expect(updates.find((u) => u.id === "1")?.status).not.toBe("accepted"); // kalah dari pilihan admin
  });

  it("mencatat jumlah bukti", () => {
    const [update] = decideSubject([
      row("1", "requirement.age", "x", [
        ev("a.example", "community"),
        ev("b.example", "community"),
      ]),
    ]);
    expect(update?.evidence_count).toBe(2);
  });
});
