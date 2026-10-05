"use server";

import { revalidatePath } from "next/cache";
import { planApply } from "@/domain/apply-extraction";
import type { ValidatedExtraction } from "@/domain/scholarship-extraction";
import { requireAdmin } from "@/lib/auth";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Payload = {
  accepted: ValidatedExtraction;
  rejected: unknown[];
  truncated: boolean;
};

function fail(message: string): never {
  throw new Error(message);
}

/** Menyetujui hasil ekstraksi: terapkan ke peluang, ganti jadwal dari halaman itu, catat perubahan. */
export async function approveExtraction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: extraction, error } = await supabase
    .from("extractions")
    .select(
      "id, status, opportunity_id, page_url, payload, source_id, sources(trust_score)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) fail(`Gagal membaca ekstraksi: ${error.message}`);
  if (!extraction || extraction.status !== "pending")
    fail("Ekstraksi tidak ditemukan atau sudah diproses.");
  if (!extraction.opportunity_id) fail("Ekstraksi tidak terhubung ke peluang.");

  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunities")
    .select("id, status, closes_at, funding, study_levels, attributes")
    .eq("id", extraction.opportunity_id)
    .maybeSingle();
  if (opportunityError)
    fail(`Gagal membaca peluang: ${opportunityError.message}`);
  if (!opportunity) fail("Peluang tidak ditemukan.");

  const payload = extraction.payload as unknown as Payload;
  const plan = planApply(
    {
      status: opportunity.status,
      closes_at: opportunity.closes_at,
      funding: opportunity.funding,
      study_levels: opportunity.study_levels,
    },
    payload.accepted,
    now,
  );

  const attributes =
    typeof opportunity.attributes === "object" &&
    opportunity.attributes !== null &&
    !Array.isArray(opportunity.attributes)
      ? (opportunity.attributes as Record<string, Json>)
      : {};

  // 1. Jadwal: ganti event yang berasal dari halaman ini
  const { error: deleteError } = await supabase
    .from("opportunity_events")
    .delete()
    .eq("opportunity_id", opportunity.id)
    .eq("source_url", extraction.page_url);
  if (deleteError) fail(`Gagal mengganti jadwal: ${deleteError.message}`);

  if (plan.events.length > 0) {
    const { error: insertError } = await supabase
      .from("opportunity_events")
      .insert(
        plan.events.map((event) => ({
          opportunity_id: opportunity.id,
          kind: event.kind,
          label: event.label,
          starts_on: event.starts_on,
          ends_on: event.ends_on,
          is_estimated: false,
          source_url: extraction.page_url,
        })),
      );
    if (insertError) fail(`Gagal menyimpan jadwal: ${insertError.message}`);
  }

  // 2. Peluang: nilai baru + tanda terverifikasi
  const trust = extraction.sources?.trust_score ?? 90;
  const { error: updateError } = await supabase
    .from("opportunities")
    .update({
      ...plan.updates,
      verification_status: "verified",
      confidence: trust,
      last_verified_at: nowIso,
      attributes: {
        ...attributes,
        needs_page_verification: false,
        verified_extraction: extraction.id,
      },
    })
    .eq("id", opportunity.id);
  if (updateError) fail(`Gagal memperbarui peluang: ${updateError.message}`);

  // 3. Riwayat perubahan
  if (plan.changes.length > 0) {
    const { error: changeError } = await supabase
      .from("opportunity_changes")
      .insert(
        plan.changes.map((change) => ({
          opportunity_id: opportunity.id,
          field: change.field,
          old_value: (change.old ?? null) as Json,
          new_value: (change.new ?? null) as Json,
          source_id: extraction.source_id,
          changed_at: nowIso,
        })),
      );
    if (changeError) fail(`Gagal menyimpan riwayat: ${changeError.message}`);
  }

  // 4. Tandai selesai (terakhir, agar kegagalan di atas bisa diulang)
  const { error: doneError } = await supabase
    .from("extractions")
    .update({ status: "applied", reviewed_at: nowIso, reviewed_by: admin.id })
    .eq("id", extraction.id);
  if (doneError) fail(`Gagal menandai ekstraksi: ${doneError.message}`);

  revalidatePath("/admin/review");
  revalidatePath("/beasiswa", "layout");
}

export async function rejectExtraction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("extractions")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: admin.id,
    })
    .eq("id", id)
    .eq("status", "pending");
  if (error) fail(`Gagal menolak ekstraksi: ${error.message}`);
  revalidatePath("/admin/review");
}
