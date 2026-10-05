import type { Metadata } from "next";
import Link from "next/link";
import { ClaimsPanel } from "@/components/claims-panel";
import { SiteHeader } from "@/components/site-header";
import {
  evaluateRequirement,
  type RequirementResult,
  summarizeReadiness,
} from "@/domain/readiness";
import { getCurrentUser } from "@/lib/auth";
import { loadClaims } from "@/lib/claims-query";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "WHV Australia (subclass 462) untuk WNI — Karir Pro",
  description:
    "Syarat Work and Holiday visa 462 untuk paspor Indonesia, dikumpulkan dan diverifikasi dari sumber resmi, lengkap dengan bukti dan tingkat keyakinan.",
};

export default async function WhvPage() {
  const claims = await loadClaims({ track: "whv_au" });
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
    for (const claim of claims.filter((c) => c.status === "accepted")) {
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
        <h1 className="text-2xl font-semibold tracking-tight">
          Work and Holiday visa Australia (subclass 462)
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Syarat untuk pemegang paspor Indonesia. Setiap syarat dikumpulkan
          mesin riset kami dari halaman resmi dan sumber lain, disertai kutipan
          bukti dan tingkat keyakinan. Tetap cek halaman resmi Home Affairs
          sebelum mendaftar.
        </p>

        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            href="/lowongan?track=whv_au"
            className="rounded-lg border border-zinc-300 px-4 py-2 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Lihat lowongan WHV →
          </Link>
          {!user && (
            <Link
              href="/masuk?next=/whv"
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

        <div className="mt-8">
          <ClaimsPanel claims={claims} readiness={readiness} />
        </div>
      </main>
    </div>
  );
}
