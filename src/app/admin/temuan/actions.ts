"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createOpportunityFromCandidate } from "@/server/discovery/approve";

const validUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

/**
 * Menyetujui kandidat temuan: membuat organisasi (bila perlu) dan peluang berstatus "needs_review",
 * lalu menjadwalkan riset otomatis segera agar fakta resmi (tenggat, syarat, pendanaan) terisi.
 */
export async function approveCandidate(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const officialUrl = validUrl(
    String(formData.get("official_url") ?? "").trim(),
  );
  if (name.length < 3 || name.length > 160)
    throw new Error("Nama program wajib 3–160 karakter.");
  if (!officialUrl) throw new Error("URL resmi wajib diisi (http/https).");

  const supabase = await createClient();
  const { data: candidate, error } = await supabase
    .from("discovery_candidates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !candidate) throw new Error("Kandidat tidak ditemukan.");
  if (candidate.status !== "pending")
    throw new Error("Kandidat ini sudah diputuskan.");

  await createOpportunityFromCandidate(supabase, candidate, {
    name,
    officialUrl,
    reviewerId: admin.id,
  });

  revalidatePath("/admin/temuan");
  revalidatePath(candidate.kind === "scholarship" ? "/beasiswa" : "/lowongan");
}
/** Menolak kandidat atau menandainya duplikat; kandidat yang sama tidak akan muncul lagi di antrean. */
export async function dismissCandidate(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "rejected" && decision !== "duplicate")
    throw new Error("Keputusan tidak dikenal.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("discovery_candidates")
    .update({
      status: decision,
      reviewed_at: new Date().toISOString(),
      reviewed_by: admin.id,
    })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw new Error(`Gagal menyimpan keputusan: ${error.message}`);
  revalidatePath("/admin/temuan");
}
