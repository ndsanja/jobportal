import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type DerivedFacts,
  deriveOpportunityFacts,
  type FactClaim,
  nextResearchAt,
} from "@/domain/facts";
import type { Database, Json } from "@/lib/supabase/database.types";
import { sourceConfigSchema } from "@/server/ingest/config";
import type { IngestSource } from "@/server/ingest/types";
import {
  type ResearchDeps,
  type ResearchOptions,
  type ResearchStats,
  recordSubjectState,
  researchSubject,
} from "./agent";
import { buildOpportunitySpec, subjectOverridesSchema } from "./subject";

type Db = SupabaseClient<Database>;
type OpportunityRow = Database["public"]["Tables"]["opportunities"]["Row"];

/** Waktu minimum yang dibutuhkan satu subjek riset (cari, baca, ekstrak, periksa, panduan). */
const MIN_SUBJECT_MS = 150_000;

export type AppliedFacts = {
  status?: string;
  closesAt?: string | null;
  funding?: string;
  studyLevels?: string[];
  eligibleForIndonesia?: boolean;
  verified: boolean;
  officialFacts: number;
  events: number;
  changes: string[];
};

export type OpportunityResearchStats = {
  due: number;
  processed: Array<{
    slug: string;
    status: "success" | "partial" | "failed";
    error?: string;
    applied?: AppliedFacts;
    research?: Partial<ResearchStats>;
  }>;
  /** Subjek jatuh tempo yang belum sempat diproses (diambil panggilan berikutnya). */
  deferred: number;
  partial: boolean;
};

type Candidate = Pick<
  OpportunityRow,
  | "id"
  | "slug"
  | "title"
  | "kind"
  | "status"
  | "closes_at"
  | "official_url"
  | "apply_url"
  | "verification_status"
  | "funding"
  | "study_levels"
  | "confidence"
  | "attributes"
> & {
  organizations: { name: string; website: string | null } | null;
  countries: { name_id: string } | null;
};

const sameInstant = (a: string | null, b: string | null) =>
  (a ? Date.parse(a) : null) === (b ? Date.parse(b) : null);
const sameList = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

const summarizeFacts = (
  facts: DerivedFacts,
  changes: string[],
): AppliedFacts => ({
  status: facts.status,
  closesAt: facts.closesAt,
  funding: facts.funding,
  studyLevels: facts.studyLevels,
  eligibleForIndonesia: facts.eligibleForIndonesia,
  verified: facts.verified,
  officialFacts: facts.officialFacts,
  events: facts.events.length,
  changes,
});

/**
 * Menerapkan fakta resmi hasil riset ke listing peluang: tenggat, status, pendanaan, jenjang,
 * status verifikasi, dan event kalender. Setiap perubahan dicatat di opportunity_changes.
 */
async function applyFacts(
  db: Db,
  opportunity: Candidate,
  final: FactClaim[],
  stats: ResearchStats,
  sourceId: string,
  now: Date,
): Promise<{ facts: DerivedFacts; applied: AppliedFacts }> {
  const facts = deriveOpportunityFacts(final, now);
  const nowIso = now.toISOString();
  const update: Database["public"]["Tables"]["opportunities"]["Update"] = {};
  const changes: Array<{ field: string; old_value: Json; new_value: Json }> =
    [];
  const change = (field: string, oldValue: unknown, newValue: unknown) =>
    changes.push({
      field,
      old_value: (oldValue ?? null) as Json,
      new_value: (newValue ?? null) as Json,
    });

  if (
    facts.closesAt !== undefined &&
    !sameInstant(facts.closesAt, opportunity.closes_at)
  ) {
    update.closes_at = facts.closesAt;
    change("closes_at", opportunity.closes_at, facts.closesAt);
  }
  if (facts.status && facts.status !== opportunity.status) {
    update.status = facts.status;
    change("status", opportunity.status, facts.status);
  }
  if (facts.funding && facts.funding !== opportunity.funding) {
    update.funding = facts.funding;
    change("funding", opportunity.funding, facts.funding);
  }
  if (
    facts.studyLevels &&
    !sameList(facts.studyLevels, opportunity.study_levels)
  ) {
    update.study_levels = facts.studyLevels;
    change("study_levels", opportunity.study_levels, facts.studyLevels);
  }
  const verification = facts.verified
    ? "verified"
    : opportunity.verification_status === "verified"
      ? "needs_review"
      : opportunity.verification_status;
  if (verification !== opportunity.verification_status) {
    update.verification_status = verification;
    change(
      "verification_status",
      opportunity.verification_status,
      verification,
    );
  }
  if (facts.verified) update.confidence = Math.max(opportunity.confidence, 90);

  // "Terakhir diverifikasi" hanya maju bila halaman resmi benar-benar dibaca/dicek pada run ini.
  const officialChecked = stats.pages.some(
    (p) =>
      p.tier === "official" &&
      (p.outcome === "read" || p.outcome === "unchanged"),
  );
  if (officialChecked) update.last_verified_at = nowIso;

  const attributes = {
    ...((opportunity.attributes ?? {}) as Record<string, unknown>),
    research: {
      checked_at: nowIso,
      official_facts: facts.officialFacts,
      eligible_wni: facts.eligibleForIndonesia ?? null,
      deadline_precision: facts.closesPrecision ?? null,
    },
  };
  // Catatan manual dari data awal tidak lagi berlaku bila jadwal resmi sudah ditemukan.
  if (facts.status) delete (attributes as Record<string, unknown>).data_note;
  update.attributes = attributes as Json;

  const { error } = await db
    .from("opportunities")
    .update(update)
    .eq("id", opportunity.id);
  if (error) throw new Error(`Gagal memperbarui peluang: ${error.message}`);

  if (changes.length > 0) {
    await db.from("opportunity_changes").insert(
      changes.map((c) => ({
        ...c,
        opportunity_id: opportunity.id,
        source_id: sourceId,
      })),
    );
  }

  // Event kalender dari klaim resmi menggantikan event lama berbasis klaim dan duplikat data awal.
  const { data: existing } = await db
    .from("opportunity_events")
    .select("id, kind, starts_on, claim_id")
    .eq("opportunity_id", opportunity.id);
  const derivedKeys = new Set(
    facts.events.map((e) => `${e.kind}|${e.startsOn}`),
  );
  const obsolete = (existing ?? [])
    .filter(
      (e) => e.claim_id !== null || derivedKeys.has(`${e.kind}|${e.starts_on}`),
    )
    .map((e) => e.id);
  if (obsolete.length > 0) {
    await db.from("opportunity_events").delete().in("id", obsolete);
  }
  if (facts.events.length > 0) {
    const { error: eventError } = await db.from("opportunity_events").insert(
      facts.events.map((e) => ({
        opportunity_id: opportunity.id,
        claim_id: e.claimId,
        kind: e.kind,
        label: e.label,
        starts_on: e.startsOn,
        ends_on: e.endsOn,
        date_precision: "day",
        is_estimated: false,
        source_url: e.sourceUrl,
      })),
    );
    if (eventError)
      throw new Error(`Gagal menyimpan jadwal: ${eventError.message}`);
  }

  return {
    facts,
    applied: summarizeFacts(
      facts,
      changes.map((c) => c.field),
    ),
  };
}

/**
 * Sumber `opportunity_research`: memilih beasiswa/program yang jatuh tempo diriset (belum pernah,
 * menjelang tenggat, atau jadwal rutin), menyusun rencana riset otomatis, menjalankan mesin riset,
 * lalu menerapkan fakta resmi ke listing. `target` = slug peluang untuk uji manual.
 */
export async function runOpportunityResearch(
  db: Db,
  source: IngestSource,
  deps: ResearchDeps,
  options: ResearchOptions & { target?: string },
): Promise<OpportunityResearchStats> {
  const parsed = sourceConfigSchema.safeParse(source.config);
  if (!parsed.success || parsed.data.provider !== "opportunity_research") {
    throw new Error(`Konfigurasi riset otomatis "${source.slug}" tidak valid.`);
  }
  const config = parsed.data;
  const now = options.now;
  const nowIso = now.toISOString();

  let query = db
    .from("opportunities")
    .select(
      "id, slug, title, kind, status, closes_at, official_url, apply_url, verification_status, funding, study_levels, confidence, attributes, organizations(name, website), countries(name_id)",
    )
    .in("kind", config.kinds)
    .eq("is_published", true)
    .neq("status", "archived")
    .limit(1000);
  if (options.target) query = query.eq("slug", options.target);
  const { data: opportunities, error } = await query;
  if (error) throw new Error(`Gagal membaca peluang: ${error.message}`);

  const { data: states, error: stateError } = await db
    .from("research_subjects")
    .select("subject_key, enabled, next_run_at, last_run_at, config")
    .eq("subject_type", "opportunity")
    .limit(5000);
  if (stateError)
    throw new Error(`Gagal membaca status riset: ${stateError.message}`);
  const stateOf = new Map((states ?? []).map((s) => [s.subject_key, s]));
  const keyOf = (o: Candidate) => `opportunity:${o.id}`;

  const candidates = (opportunities ?? []) as unknown as Candidate[];
  const due = candidates
    .filter((o) => {
      if (options.target) return true;
      const state = stateOf.get(keyOf(o));
      if (state && !state.enabled) return false;
      return !state?.next_run_at || state.next_run_at <= nowIso;
    })
    .sort((a, b) => {
      const ra = stateOf.get(keyOf(a))?.last_run_at ? 1 : 0;
      const rb = stateOf.get(keyOf(b))?.last_run_at ? 1 : 0;
      if (ra !== rb) return ra - rb; // belum pernah diriset lebih dulu
      const ca =
        a.closes_at && a.closes_at > nowIso
          ? Date.parse(a.closes_at)
          : Number.POSITIVE_INFINITY;
      const cb =
        b.closes_at && b.closes_at > nowIso
          ? Date.parse(b.closes_at)
          : Number.POSITIVE_INFINITY;
      return ca - cb; // tenggat terdekat lebih dulu
    });

  const stats: OpportunityResearchStats = {
    due: due.length,
    processed: [],
    deferred: 0,
    partial: false,
  };
  const batch = due.slice(0, config.per_run);
  const cadence = {
    refreshDays: config.refresh_days,
    urgentDays: config.urgent_days,
    closedRefreshDays: config.closed_refresh_days,
  };

  const researchOne = async (o: Candidate) => {
    const overrides = subjectOverridesSchema.safeParse(
      stateOf.get(keyOf(o))?.config ?? {},
    );
    const spec = buildOpportunitySpec(
      {
        id: o.id,
        title: o.title,
        kind: o.kind,
        countryName: o.countries?.name_id ?? null,
        officialUrl: o.official_url,
        applyUrl: o.apply_url,
        organizationName: o.organizations?.name ?? null,
        organizationWebsite: o.organizations?.website ?? null,
      },
      overrides.success ? overrides.data : {},
      now,
    );
    try {
      const { stats: research, final } = await researchSubject(
        db,
        spec,
        deps,
        options,
      );
      const status = research.partial ? "partial" : "success";
      if (options.dryRun) {
        const facts = deriveOpportunityFacts(final, now);
        stats.processed.push({
          slug: o.slug,
          status,
          applied: summarizeFacts(facts, []),
          research,
        });
        return;
      }
      const { facts, applied } = await applyFacts(
        db,
        o,
        final,
        research,
        source.id,
        now,
      );
      await recordSubjectState(
        db,
        spec.subject,
        spec.profile,
        { status, stats: research },
        now,
        nextResearchAt(
          {
            status: facts.status ?? o.status,
            closesAt:
              facts.closesAt === undefined ? o.closes_at : facts.closesAt,
            outcome: status,
          },
          now,
          cadence,
        ),
      );
      stats.processed.push({
        slug: o.slug,
        status,
        applied,
        research: {
          pagesRead: research.pagesRead,
          pagesSkipped: research.pagesSkipped,
          accepted: research.accepted,
          disputed: research.disputed,
          proposed: research.proposed,
          claimsRejected: research.claimsRejected,
          claimsDropped: research.claimsDropped,
          brief: research.brief,
          errors: research.errors,
          timingsMs: research.timingsMs,
        },
      });
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).slice(
        0,
        300,
      );
      stats.processed.push({ slug: o.slug, status: "failed", error: message });
      if (!options.dryRun) {
        await recordSubjectState(
          db,
          spec.subject,
          spec.profile,
          { status: "failed", error: message },
          now,
          nextResearchAt(
            { status: o.status, closesAt: o.closes_at, outcome: "failed" },
            now,
            cadence,
          ),
        );
      }
    }
  };

  for (let i = 0; i < batch.length; i += config.parallel) {
    if (Date.now() > options.deadlineMs - MIN_SUBJECT_MS && i > 0) {
      stats.deferred += batch.length - i;
      break;
    }
    await Promise.all(batch.slice(i, i + config.parallel).map(researchOne));
  }
  stats.deferred += due.length - batch.length;
  stats.partial = stats.processed.some((p) => p.status === "partial");
  return stats;
}
