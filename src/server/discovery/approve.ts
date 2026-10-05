import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STUDY_LEVEL_VALUES } from "@/domain/claims";
import { normalizeOrgName, slugify } from "@/domain/text";
import type { Database, Json } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;
type Candidate = Database["public"]["Tables"]["discovery_candidates"]["Row"];

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
 * Membuat organisasi (bila perlu) dan peluang "needs_review" dari kandidat temuan, menjadwalkan
 * riset otomatis segera, lalu menandai kandidat disetujui. Dipakai admin maupun persetujuan otomatis.
 */
export async function createOpportunityFromCandidate(
  supabase: Client,
  candidate: Candidate,
  input: { name: string; officialUrl: string; reviewerId: string | null },
): Promise<{ id: string; slug: string }> {
  const { name, officialUrl } = input;
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
      reviewed_by: input.reviewerId,
    })
    .eq("id", candidate.id);
  if (updateError)
    throw new Error(`Gagal memperbarui kandidat: ${updateError.message}`);
  return opportunity;
}
