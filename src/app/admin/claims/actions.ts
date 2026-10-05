"use server";

import { revalidatePath } from "next/cache";
import type { ClaimEvidence } from "@/domain/claims";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { decideSubject, type SubjectClaimRow } from "@/server/research/decide";

const DECISIONS = {
  accept: "accepted",
  reject: "rejected",
  auto: "proposed",
} as const;

/**
 * Keputusan admin atas satu klaim. Setelah itu klaim lain pada subjek yang sama dihitung ulang
 * supaya hanya ada satu nilai `accepted` per bidang.
 */
export async function decideClaim(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const decision = String(
    formData.get("decision") ?? "",
  ) as keyof typeof DECISIONS;
  if (!(decision in DECISIONS)) throw new Error("Keputusan tidak dikenal.");

  const supabase = await createClient();
  const { data: claim, error } = await supabase
    .from("claims")
    .select("id, subject_key")
    .eq("id", id)
    .maybeSingle();
  if (error || !claim) throw new Error("Klaim tidak ditemukan.");

  const { error: updateError } = await supabase
    .from("claims")
    .update({
      status: DECISIONS[decision],
      decided_by: decision === "auto" ? "system" : "admin",
    })
    .eq("id", id);
  if (updateError)
    throw new Error(`Gagal menyimpan keputusan: ${updateError.message}`);

  const { data: all, error: allError } = await supabase
    .from("claims")
    .select(
      "id, field, value_key, status, decided_by, claim_evidence(source_domain, source_tier, stance, page_date)",
    )
    .eq("subject_key", claim.subject_key);
  if (allError) throw new Error(`Gagal membaca klaim: ${allError.message}`);

  const rows: SubjectClaimRow[] = all.map((row) => ({
    id: row.id,
    field: row.field,
    value_key: row.value_key,
    status: row.status,
    decided_by: row.decided_by as "system" | "admin",
    evidence: row.claim_evidence.map((e) => ({
      domain: e.source_domain,
      tier: e.source_tier as ClaimEvidence["tier"],
      stance: e.stance as ClaimEvidence["stance"],
      asOf: e.page_date,
    })),
  }));
  for (const update of decideSubject(rows)) {
    await supabase
      .from("claims")
      .update({
        status: update.status,
        confidence: update.confidence,
        evidence_count: update.evidence_count,
      })
      .eq("id", update.id);
  }

  revalidatePath("/admin/claims");
  revalidatePath("/whv");
  revalidatePath("/beasiswa", "layout");
}
