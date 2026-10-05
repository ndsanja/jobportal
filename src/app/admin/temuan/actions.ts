"use server";

import { revalidatePath } from "next/cache";
import { STUDY_LEVEL_VALUES } from "@/domain/claims";
import { normalizeOrgName, slugify } from "@/domain/text";
import { requireAdmin } from "@/lib/auth";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

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

async function uniqueSlug(
  supabase: Client,
  table: "opportunities" | "organizations",
  base: string,
): Promise<string> {
  const root = base || "peluang";
  for (let i = 1; i < 50; i += 1) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    const { data } = await supabase
      .from(table)
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `${root}-${Date.now()}`;
}

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

  let organizationId: string | null = null;
  if (candidate.organizer) {
    const normalized = normalizeOrgName(candidate.organizer);
    const { data: existing } = await supabase
      .from("organizations")
      .select("id")
      .eq("normalized_name", normalized)
      .maybeSingle();
    if (existing) {
      organizationId = existing.id;
    } else {
      const { data: created, error: orgError } = await supabase
        .from("organizations")
        .insert({
          name: candidate.organizer,
          normalized_name: normalized,
          slug: await uniqueSlug(
            supabase,
            "organizations",
            slugify(candidate.organizer),
          ),
          kind: candidate.kind === "scholarship" ? "foundation" : "other",
          country_code: candidate.country_code,
          website: new URL(officialUrl).origin,
        })
        .select("id")
        .single();
      if (orgError)
        throw new Error(`Gagal membuat organisasi: ${orgError.message}`);
      organizationId = created.id;
    }
  }

  const deadlineAhead =
    candidate.deadline !== null && Date.parse(candidate.deadline) > Date.now();
  const { data: opportunity, error: oppError } = await supabase
    .from("opportunities")
    .insert({
      kind: candidate.kind,
      tracks: candidate.kind === "scholarship" ? ["scholarship"] : ["overseas"],
      title: name,
      slug: await uniqueSlug(supabase, "opportunities", slugify(name)),
      organization_id: organizationId,
      country_code: candidate.country_code,
      summary: candidate.summary,
      study_levels: candidate.levels.filter((level) =>
        (STUDY_LEVEL_VALUES as readonly string[]).includes(level),
      ),
      apply_url: officialUrl,
      official_url: officialUrl,
      // Tenggat dari temuan belum diverifikasi: status & tenggat diisi riset dari sumber resmi.
      status: deadlineAhead ? "open" : "upcoming",
      verification_status: "needs_review",
      confidence: 40,
      dedupe_key: `discovery:${candidate.name_key}`,
      is_published: true,
      attributes: {
        discovered: {
          candidate_id: candidate.id,
          found_at: candidate.first_seen_at,
          evidence: candidate.evidence,
        },
      } as Json,
    })
    .select("id, slug")
    .single();
  if (oppError) throw new Error(`Gagal membuat peluang: ${oppError.message}`);

  await supabase.from("research_subjects").upsert(
    {
      subject_key: `opportunity:${opportunity.id}`,
      subject_type: "opportunity",
      opportunity_id: opportunity.id,
      profile: candidate.kind === "scholarship" ? "scholarship" : "job_program",
      next_run_at: new Date().toISOString(),
    },
    { onConflict: "subject_key" },
  );

  const { error: updateError } = await supabase
    .from("discovery_candidates")
    .update({
      status: "approved",
      opportunity_id: opportunity.id,
      reviewed_at: new Date().toISOString(),
      reviewed_by: admin.id,
    })
    .eq("id", candidate.id);
  if (updateError)
    throw new Error(`Gagal memperbarui kandidat: ${updateError.message}`);

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
