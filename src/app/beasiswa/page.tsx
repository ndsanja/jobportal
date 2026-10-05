import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { VerificationBadge } from "@/components/verification-badge";
import { displayState } from "@/domain/opportunity";
import { formatDate } from "@/lib/format";
import { levelsLabel, STUDY_LEVEL_LABEL } from "@/lib/labels";
import { createPublicClient } from "@/lib/supabase/public";

export const metadata: Metadata = {
  title: "Beasiswa luar negeri untuk WNI — Karir Pro",
  description:
    "LPDP, Australia Awards, Chevening, GKS, Erasmus Mundus, DAAD, dan lainnya, dengan tenggat, syarat, dan tautan pendaftaran resmi.",
};

const LEVELS = Object.keys(STUDY_LEVEL_LABEL).filter(
  (level) => level !== "non_degree",
);
const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function BeasiswaPage({
  searchParams,
}: PageProps<"/beasiswa">) {
  const params = await searchParams;
  const level = LEVELS.find((value) => value === first(params.jenjang));
  const q = first(params.q)?.trim().slice(0, 80) ?? "";

  const supabase = createPublicClient();
  let query = supabase
    .from("opportunities")
    .select(
      "slug, title, region, country_code, funding, study_levels, status, kind, verification_status, last_verified_at, closes_at, organizations(name), countries(name_id, flag)",
    )
    .eq("kind", "scholarship")
    .neq("status", "archived")
    .order("closes_at", { ascending: true, nullsFirst: false })
    .order("title");

  if (level) query = query.contains("study_levels", [level]);
  if (q) query = query.ilike("title", `%${q.replace(/[%_]/g, " ")}%`);

  const { data, error } = await query;
  if (error) throw new Error(`Gagal memuat beasiswa: ${error.message}`);

  const now = new Date();
  const href = (next: string | undefined) => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (next) search.set("jenjang", next);
    const qs = search.toString();
    return qs ? `/beasiswa?${qs}` : "/beasiswa";
  };

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-16">
        <h1 className="text-2xl font-semibold tracking-tight">
          Beasiswa luar negeri
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Daftar program populer untuk WNI. Tanggal dan syarat selalu merujuk
          halaman resmi penyelenggara;{" "}
          <Link
            href="/beasiswa/kalender"
            className="underline underline-offset-4"
          >
            lihat kalender
          </Link>
          .
        </p>

        <form action="/beasiswa" className="mt-6 flex gap-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="Cari beasiswa (mis. LPDP, Chevening)"
            aria-label="Cari beasiswa"
            className="h-11 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300"
          />
          {level && <input type="hidden" name="jenjang" value={level} />}
          <button
            type="submit"
            className="h-11 rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Cari
          </button>
        </form>

        <nav aria-label="Jenjang" className="mt-4 flex flex-wrap gap-2">
          <Link
            href={href(undefined)}
            className={`rounded-full border px-3 py-1 text-sm ${level ? "border-zinc-300 dark:border-zinc-700" : "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"}`}
          >
            Semua jenjang
          </Link>
          {LEVELS.map((value) => (
            <Link
              key={value}
              href={href(value)}
              className={`rounded-full border px-3 py-1 text-sm ${level === value ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"}`}
            >
              {STUDY_LEVEL_LABEL[value]}
            </Link>
          ))}
        </nav>

        {data.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            Tidak ada beasiswa yang cocok dengan filter ini.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {data.map((item) => {
              const state = displayState({
                kind: item.kind,
                status: item.status,
                verificationStatus: item.verification_status,
                lastVerifiedAt: new Date(item.last_verified_at),
                closesAt: item.closes_at ? new Date(item.closes_at) : null,
                now,
              });
              const destination = item.countries
                ? `${item.countries.flag} ${item.countries.name_id}`
                : item.region;
              return (
                <li key={item.slug}>
                  <Link
                    href={`/beasiswa/${item.slug}`}
                    className="block rounded-xl border border-zinc-200 p-4 transition hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="font-medium">{item.title}</h2>
                      <VerificationBadge state={state} />
                    </div>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {item.organizations?.name}
                      {destination ? ` · ${destination}` : ""}
                    </p>
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                      {item.study_levels.length > 0 && (
                        <span>{levelsLabel(item.study_levels)}</span>
                      )}
                      {item.funding && <span>Dana: {item.funding}</span>}
                      <span>
                        {item.closes_at
                          ? `Tenggat: ${formatDate(item.closes_at)}`
                          : "Tenggat periode berikutnya: belum diumumkan"}
                      </span>
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
