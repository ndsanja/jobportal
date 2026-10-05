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
  }>;
};

const SELECT =
  "id, field, value, summary, status, confidence, last_verified_at, claim_evidence(source_url, source_domain, source_tier, quote)";

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
