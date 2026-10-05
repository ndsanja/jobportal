import { CLAIM_FIELD_LABEL, type ClaimField } from "@/domain/claims";
import type { RequirementResult } from "@/domain/readiness";
import type { PublicClaim } from "@/lib/claims-query";
import { formatDate } from "@/lib/format";

const TIER_LABEL: Record<string, string> = {
  official: "Resmi",
  reputable: "Tepercaya",
  community: "Komunitas",
};
const TIER_TONE: Record<string, string> = {
  official:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  reputable: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  community:
    "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};
const READINESS_LABEL: Record<
  RequirementResult["status"],
  { label: string; tone: string }
> = {
  met: { label: "✓ Terpenuhi", tone: "text-emerald-700 dark:text-emerald-400" },
  unmet: { label: "✗ Belum", tone: "text-red-700 dark:text-red-400" },
  unknown: { label: "? Belum diketahui", tone: "text-zinc-500" },
  in_progress: {
    label: "… Sedang diurus",
    tone: "text-orange-700 dark:text-orange-400",
  },
  manual: { label: "ℹ Cek manual", tone: "text-sky-700 dark:text-sky-400" },
};

function Evidence({ claim }: { claim: PublicClaim }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-zinc-500">
        {claim.claim_evidence.length} sumber · keyakinan {claim.confidence}%
      </summary>
      <ul className="mt-2 space-y-2">
        {claim.claim_evidence.map((e) => (
          <li key={`${e.source_url}-${e.quote.slice(0, 20)}`}>
            <span
              className={`mr-2 rounded px-1.5 py-0.5 font-medium ${TIER_TONE[e.source_tier] ?? ""}`}
            >
              {TIER_LABEL[e.source_tier] ?? e.source_tier}
            </span>
            <a
              href={e.source_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="underline underline-offset-4"
            >
              {e.source_domain}
            </a>
            <blockquote className="mt-1 border-l-2 border-zinc-300 pl-3 italic text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
              “{e.quote}”
            </blockquote>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Syarat hasil riset AI: yang didukung sumber resmi dipisahkan dari laporan yang belum resmi. */
export function ClaimsPanel({
  claims,
  readiness,
}: {
  claims: PublicClaim[];
  readiness?: Map<string, RequirementResult>;
}) {
  const official = claims.filter((c) => c.status === "accepted");
  const unofficial = claims.filter((c) => c.status === "disputed");

  if (claims.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        Syarat sedang dikumpulkan dan diverifikasi oleh mesin riset kami.
        Sementara itu, rujuk halaman resmi penyelenggara.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {official.length > 0 && (
        <section>
          <h3 className="text-sm font-medium">
            Syarat (didukung sumber resmi)
          </h3>
          <ul className="mt-3 space-y-3">
            {official.map((claim) => {
              const result = readiness?.get(claim.id);
              return (
                <li
                  key={claim.id}
                  className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm">
                      <span className="mr-2 text-xs text-zinc-500">
                        {CLAIM_FIELD_LABEL[claim.field as ClaimField] ??
                          claim.field}
                      </span>
                      {claim.summary}
                    </p>
                    {result && (
                      <span
                        className={`text-xs font-medium ${READINESS_LABEL[result.status].tone}`}
                      >
                        {READINESS_LABEL[result.status].label}
                      </span>
                    )}
                  </div>
                  {result && (
                    <p className="mt-1 text-xs text-zinc-500">
                      {result.detail}
                    </p>
                  )}
                  <Evidence claim={claim} />
                  <p className="mt-1 text-xs text-zinc-400">
                    Terakhir diverifikasi {formatDate(claim.last_verified_at)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {unofficial.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Laporan belum resmi / berbeda
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Ditemukan di blog, forum, atau media, belum dikonfirmasi sumber
            resmi. Jangan jadikan dasar keputusan sebelum dicek di situs resmi.
          </p>
          <ul className="mt-3 space-y-3">
            {unofficial.map((claim) => (
              <li
                key={claim.id}
                className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/30"
              >
                <p className="text-sm">
                  <span className="mr-2 text-xs text-zinc-500">
                    {CLAIM_FIELD_LABEL[claim.field as ClaimField] ??
                      claim.field}
                  </span>
                  {claim.summary}
                </p>
                <Evidence claim={claim} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
