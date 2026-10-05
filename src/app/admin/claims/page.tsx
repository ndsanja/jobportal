import type { Metadata } from "next";
import Link from "next/link";
import { CLAIM_FIELD_LABEL, type ClaimField } from "@/domain/claims";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { decideClaim } from "./actions";

export const metadata: Metadata = { title: "Klaim hasil riset — Karir Pro" };

const STATUS_TONE: Record<string, string> = {
  accepted:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  disputed: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  proposed: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  rejected: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  superseded: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800",
};
const buttonClass =
  "h-8 rounded-md border border-zinc-300 px-2.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";

export default async function AdminClaimsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("claims")
    .select(
      "id, subject_key, field, summary, status, confidence, decided_by, claim_evidence(source_url, source_domain, source_tier, quote), opportunities(title)",
    )
    .order("subject_key")
    .order("field")
    .order("confidence", { ascending: false });
  if (error) throw new Error(`Gagal memuat klaim: ${error.message}`);

  const groups = new Map<string, typeof data>();
  for (const claim of data)
    groups.set(claim.subject_key, [
      ...(groups.get(claim.subject_key) ?? []),
      claim,
    ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <Link
        href="/admin"
        className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        ← Admin
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Klaim hasil riset ({data.length})
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Keputusan Anda mengalahkan skor sistem. <strong>Resmi</strong> = tampil
        sebagai syarat; <strong>Tolak</strong> = tidak pernah tampil;
        <strong> Otomatis</strong> = kembalikan ke penilaian sistem.
      </p>

      {data.length === 0 && (
        <p className="mt-8 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          Belum ada klaim. Jalankan agen riset (lihat docs/INGESTION.md).
        </p>
      )}

      {[...groups.entries()].map(([key, claims]) => (
        <section key={key} className="mt-8">
          <h2 className="text-sm font-medium text-zinc-500">
            {claims[0]?.opportunities?.title ?? key}
          </h2>
          <ul className="mt-3 space-y-3">
            {claims.map((claim) => (
              <li
                key={claim.id}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`rounded px-2 py-0.5 font-medium ${STATUS_TONE[claim.status] ?? ""}`}
                  >
                    {claim.status}
                  </span>
                  <span className="text-zinc-500">
                    {CLAIM_FIELD_LABEL[claim.field as ClaimField] ??
                      claim.field}{" "}
                    · keyakinan {claim.confidence}%
                    {claim.decided_by === "admin" ? " · keputusan admin" : ""}
                  </span>
                </div>
                <p className="mt-2 text-sm">{claim.summary}</p>
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-zinc-500">
                    {claim.claim_evidence.length} bukti
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {claim.claim_evidence.map((e) => (
                      <li key={`${e.source_url}-${e.quote.slice(0, 20)}`}>
                        <span className="mr-2 font-medium">
                          {e.source_tier}
                        </span>
                        <a
                          href={e.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
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
                <div className="mt-3 flex gap-2">
                  {(["accept", "reject", "auto"] as const).map((decision) => (
                    <form key={decision} action={decideClaim}>
                      <input type="hidden" name="id" value={claim.id} />
                      <input type="hidden" name="decision" value={decision} />
                      <button type="submit" className={buttonClass}>
                        {decision === "accept"
                          ? "Resmi"
                          : decision === "reject"
                            ? "Tolak"
                            : "Otomatis"}
                      </button>
                    </form>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
