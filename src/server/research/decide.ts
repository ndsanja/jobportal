import {
  type ClaimEvidence,
  type ClaimStatus,
  decideClaims,
} from "@/domain/claims";

export type SubjectClaimRow = {
  id: string;
  field: string;
  value_key: string;
  status: string;
  decided_by: "system" | "admin";
  evidence: ClaimEvidence[];
};

/** Bidang yang bernilai jamak: tiap butir berdiri sendiri, bukan saling bersaing. */
const MULTI_VALUED_FIELDS = new Set([
  "requirement.other",
  "requirement.document",
]);

export type ClaimUpdate = {
  id: string;
  status: ClaimStatus;
  confidence: number;
  evidence_count: number;
};

/**
 * Menghitung status & keyakinan tiap klaim sebuah subjek. Keputusan admin dihormati:
 * klaim yang diterima admin menjadi pemenang bidangnya, klaim yang ditolak admin diabaikan,
 * dan keduanya tidak pernah ditimpa oleh sistem.
 */
export function decideSubject(rows: SubjectClaimRow[]): ClaimUpdate[] {
  const updates: ClaimUpdate[] = [];
  const byField = new Map<string, SubjectClaimRow[]>();
  for (const row of rows)
    byField.set(row.field, [...(byField.get(row.field) ?? []), row]);

  for (const group of byField.values()) {
    const live = group.filter(
      (row) => !(row.decided_by === "admin" && row.status === "rejected"),
    );
    const locked = live.find(
      (row) => row.decided_by === "admin" && row.status === "accepted",
    );
    const candidates = live.map((row) => ({
      key: row.value_key,
      evidence: row.evidence,
    }));
    const decisions = MULTI_VALUED_FIELDS.has(group[0]?.field ?? "")
      ? candidates.flatMap((candidate) => decideClaims([candidate]))
      : decideClaims(candidates, locked?.value_key);

    for (const decision of decisions) {
      const row = live.find((r) => r.value_key === decision.key);
      if (!row || row.decided_by === "admin") continue;
      updates.push({
        id: row.id,
        status: decision.status,
        confidence: decision.confidence,
        evidence_count: row.evidence.length,
      });
    }
  }
  return updates;
}
