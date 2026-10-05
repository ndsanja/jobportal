import { BRIEF_SECTIONS } from "@/domain/brief";
import type { PublicBrief, PublicClaim } from "@/lib/claims-query";
import { formatDate } from "@/lib/format";

const TIER_RANK: Record<string, number> = {
  official: 0,
  reputable: 1,
  community: 2,
};

/** Sumber di balik satu butir: tingkat terbaik + domain, dihitung dari klaim yang dirujuk. */
function sourcesOf(ids: string[], byId: Map<string, PublicClaim>) {
  const claims = ids.flatMap((id) => {
    const claim = byId.get(id);
    return claim ? [claim] : [];
  });
  const evidence = claims.flatMap((c) => c.claim_evidence);
  const best = evidence
    .map((e) => e.source_tier)
    .sort((a, b) => (TIER_RANK[a] ?? 9) - (TIER_RANK[b] ?? 9))[0];
  return {
    official: claims.some((c) => c.status === "accepted"),
    tier: best,
    domains: [...new Set(evidence.map((e) => e.source_domain))].slice(0, 3),
  };
}

function Sources({
  ids,
  byId,
}: {
  ids: string[];
  byId: Map<string, PublicClaim>;
}) {
  const { official, domains } = sourcesOf(ids, byId);
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
      <span
        className={
          official
            ? "rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
            : "rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        }
      >
        {official ? "Resmi" : "Belum resmi"}
      </span>
      {domains.join(" · ")}
    </span>
  );
}

/** Panduan lengkap hasil sintesis AI; tiap butir bersandar pada klaim berbukti (lihat rincian di bawahnya). */
export function BriefPanel({
  brief,
  claims,
}: {
  brief: PublicBrief;
  claims: PublicClaim[];
}) {
  const byId = new Map(claims.map((c) => [c.id, c]));
  const { content } = brief;
  const headings = new Map<string, string>(
    BRIEF_SECTIONS.map((s) => [s.id, s.heading]),
  );

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/40">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
          Intisari
        </p>
        <h2 className="mt-1 text-lg font-semibold">{content.headline}</h2>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          {content.summary}
        </p>
      </div>

      {content.sections.map((section) => (
        <div key={section.id}>
          <h3 className="text-base font-semibold">
            {headings.get(section.id) ?? section.id}
          </h3>
          <ul className="mt-3 space-y-3">
            {section.items.map((item) => (
              <li
                key={item.text}
                className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800"
              >
                {item.text}
                <Sources ids={item.claim_ids} byId={byId} />
              </li>
            ))}
          </ul>
        </div>
      ))}

      {content.uncertainties.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-amber-800 dark:text-amber-300">
            Yang belum pasti
          </h3>
          <ul className="mt-3 space-y-3">
            {content.uncertainties.map((item) => (
              <li
                key={item.text}
                className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30"
              >
                {item.text}
                <Sources ids={item.claim_ids} byId={byId} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Panduan disusun otomatis oleh AI dari klaim berbukti di bawah ini,
        diperbarui {formatDate(brief.generated_at)}. Selalu cek ulang di situs
        resmi sebelum mendaftar.
      </p>
    </section>
  );
}
