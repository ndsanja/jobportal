import type { BriefContent } from "@/domain/brief";
import { createPublicClient } from "@/lib/supabase/public";

export type PublicClaim = {
  id: string;
  field: string;
  value: unknown;
  summary: string;
  status: string;
  confidence: number;
  last_verified_at: string;
  claim_evidence: Array<{
    source_url: string;
    source_domain: string;
    source_tier: string;
    quote: string;
    page_date: string | null;
    retrieved_at: string;
  }>;
};

const SELECT =
  "id, field, value, summary, status, confidence, last_verified_at, claim_evidence(source_url, source_domain, source_tier, quote, page_date, retrieved_at)";

/** Klaim yang boleh dilihat publik (accepted + disputed; RLS menegakkan hal yang sama). */
export async function loadClaims(
  subject: { track: string } | { opportunityId: string },
): Promise<PublicClaim[]> {
  const supabase = createPublicClient();
  let query = supabase
    .from("claims")
    .select(SELECT)
    .in("status", ["accepted", "disputed"])
    .order("field")
    .order("confidence", { ascending: false });
  query =
    "track" in subject
      ? query.eq("track", subject.track as never)
      : query.eq("opportunity_id", subject.opportunityId);
  const { data, error } = await query;
  if (error) throw new Error(`Gagal memuat klaim: ${error.message}`);
  return data as unknown as PublicClaim[];
}

export type PublicBrief = {
  content: BriefContent;
  generated_at: string;
  model: string | null;
};

/** Panduan hasil sintesis AI untuk satu subjek (null bila belum disusun). */
export async function loadBrief(
  subject: { track: string } | { opportunityId: string },
): Promise<PublicBrief | null> {
  const supabase = createPublicClient();
  const key =
    "track" in subject
      ? `track:${subject.track}`
      : `opportunity:${subject.opportunityId}`;
  const { data, error } = await supabase
    .from("subject_briefs")
    .select("content, generated_at, model")
    .eq("subject_key", key)
    .maybeSingle();
  if (error) throw new Error(`Gagal memuat panduan: ${error.message}`);
  return data ? (data as unknown as PublicBrief) : null;
}
