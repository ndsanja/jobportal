import Link from "next/link";
import { BriefPanel } from "@/components/brief-panel";
import { ClaimsPanel } from "@/components/claims-panel";
import { SiteHeader } from "@/components/site-header";
import { isRequirementField } from "@/domain/claims";
import {
  evaluateRequirement,
  type RequirementResult,
  summarizeReadiness,
} from "@/domain/readiness";
import { getCurrentUser } from "@/lib/auth";
import { loadBrief, loadClaims } from "@/lib/claims-query";
import { createClient } from "@/lib/supabase/server";

type Props = {
  track: "whv_au" | "dama_au";
  heading: string;
  intro: string;
  /** Path halaman ini, untuk kembali setelah masuk. */
  path: string;
  jobsHref: string;
  jobsLabel: string;
};

/** Halaman panduan jalur (WHV/DAMA): panduan AI, kesiapan pengguna, dan rincian klaim berbukti. */
export async function TrackGuide({
  track,
  heading,
  intro,
  path,
  jobsHref,
  jobsLabel,
}: Props) {
  const [claims, brief] = await Promise.all([
    loadClaims({ track }),
    loadBrief({ track }),
  ]);
  const user = await getCurrentUser();

  let readiness: Map<string, RequirementResult> | undefined;
  let percent: number | null = null;
  if (user) {
    const supabase = await createClient();
    const [{ data: profile }, { data: docs }] = await Promise.all([
      supabase
        .from("profiles")
        .select("birth_date, years_experience, education_level")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("user_documents")
        .select("document_type, status, expires_on")
        .eq("user_id", user.id),
    ]);
    const now = new Date();
    const results = new Map<string, RequirementResult>();
    for (const claim of claims.filter(
      (c) => c.status === "accepted" && isRequirementField(c.field),
    )) {
      results.set(
        claim.id,
        evaluateRequirement(
          claim,
          profile ?? {
            birth_date: null,
            years_experience: null,
            education_level: null,
          },
          (docs ?? []) as Array<{
            document_type: string;
            status: "have" | "in_progress" | "missing";
            expires_on: string | null;
          }>,
          now,
        ),
      );
    }
    readiness = results;
    percent = summarizeReadiness([...results.values()]).percent;
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-16">
        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{intro}</p>

        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            href={jobsHref}
            className="rounded-lg border border-zinc-300 px-4 py-2 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {jobsLabel} →
          </Link>
          {!user && (
            <Link
              href={`/masuk?next=${path}`}
              className="rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900"
            >
              Masuk untuk cek kesiapan Anda
            </Link>
          )}
        </div>

        {user && percent !== null && (
          <p className="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            Kesiapan Anda: <strong>{percent}%</strong> dari syarat yang bisa
            dinilai.{" "}
            <Link href="/onboarding" className="underline underline-offset-4">
              Lengkapi profil
            </Link>{" "}
            dan{" "}
            <Link href="/saya/dokumen" className="underline underline-offset-4">
              dokumen
            </Link>{" "}
            agar penilaiannya akurat.
          </p>
        )}

        {brief && (
          <div className="mt-8">
            <BriefPanel brief={brief} claims={claims} />
          </div>
        )}

        <div className="mt-10">
          <h2 className="text-base font-semibold">Rincian syarat & bukti</h2>
          <div className="mt-3">
            <ClaimsPanel claims={claims} readiness={readiness} />
          </div>
        </div>
      </main>
    </div>
  );
}
