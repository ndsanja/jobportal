import type { Metadata } from "next";
import Link from "next/link";
import { VerificationBadge } from "@/components/verification-badge";
import { displayState } from "@/domain/opportunity";
import { readAttributes, signalLabels } from "@/lib/attributes";
import { formatDate } from "@/lib/format";
import { Constants } from "@/lib/supabase/database.types";
import { createPublicClient } from "@/lib/supabase/public";

export const metadata: Metadata = {
  title: "Lowongan kerja luar negeri — Karir Pro",
  description:
    "Lowongan WHV, DAMA, profesional, dan kerja luar negeri dengan sumber dan tanggal verifikasi yang jelas.",
};

const PAGE_SIZE = 20;
const TRACKS = Constants.public.Enums.track.filter(
  (track) => track !== "scholarship",
);
const TRACK_LABEL: Record<string, string> = {
  whv_au: "WHV Australia",
  dama_au: "DAMA",
  professional: "Profesional",
  overseas: "Luar negeri",
};

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function LowonganPage({
  searchParams,
}: PageProps<"/lowongan">) {
  const params = await searchParams;
  const q = first(params.q)?.trim().slice(0, 100) ?? "";
  const trackParam = first(params.track);
  const track = TRACKS.find((value) => value === trackParam);
  const country = /^[A-Za-z]{2}$/.test(first(params.negara) ?? "")
    ? first(params.negara)?.toUpperCase()
    : undefined;
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  const supabase = createPublicClient();
  let query = supabase
    .from("opportunities")
    .select(
      "slug, title, city, region, country_code, is_remote, employment_type, kind, status, verification_status, last_verified_at, closes_at, attributes, organizations(name)",
      { count: "exact" },
    )
    .in("status", ["open", "upcoming"])
    .order("last_verified_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q)
    query = query.textSearch("search", q, {
      type: "websearch",
      config: "english",
    });
  if (track) query = query.contains("tracks", [track]);
  if (country) query = query.eq("country_code", country);

  const { data, count, error } = await query;
  if (error) throw new Error(`Gagal memuat lowongan: ${error.message}`);

  const now = new Date();
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { q, track, negara: country, page: undefined, ...overrides };
    for (const [key, value] of Object.entries(merged))
      if (value) next.set(key, value);
    const qs = next.toString();
    return qs ? `/lowongan?${qs}` : "/lowongan";
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Karir Pro
        </Link>
        <Link
          href="/masuk"
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          Masuk
        </Link>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-16">
        <h1 className="text-2xl font-semibold tracking-tight">
          Lowongan kerja luar negeri
        </h1>

        <form
          action="/lowongan"
          className="mt-6 flex flex-col gap-3 sm:flex-row"
        >
          <input
            name="q"
            defaultValue={q}
            placeholder="Cari posisi, kota, atau kata kunci (mis. farm hand)"
            aria-label="Cari lowongan"
            className="h-11 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300"
          />
          {track && <input type="hidden" name="track" value={track} />}
          <button
            type="submit"
            className="h-11 rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Cari
          </button>
        </form>

        <nav aria-label="Jalur" className="mt-4 flex flex-wrap gap-2">
          <Link
            href={href({ track: undefined })}
            className={`rounded-full border px-3 py-1 text-sm ${track ? "border-zinc-300 dark:border-zinc-700" : "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"}`}
          >
            Semua
          </Link>
          {TRACKS.map((value) => (
            <Link
              key={value}
              href={href({ track: value })}
              className={`rounded-full border px-3 py-1 text-sm ${track === value ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"}`}
            >
              {TRACK_LABEL[value]}
            </Link>
          ))}
        </nav>

        <p className="mt-6 text-sm text-zinc-500">
          {total.toLocaleString("id-ID")} lowongan
        </p>

        {data.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            Belum ada lowongan yang cocok. Data sedang dikumpulkan dari sumber
            resmi — coba lagi nanti.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {data.map((job) => {
              const state = displayState({
                kind: job.kind,
                status: job.status,
                verificationStatus: job.verification_status,
                lastVerifiedAt: new Date(job.last_verified_at),
                closesAt: job.closes_at ? new Date(job.closes_at) : null,
                now,
              });
              const location =
                [job.city, job.region].filter(Boolean).join(", ") ||
                (job.is_remote ? "Remote" : null);
              return (
                <li key={job.slug}>
                  <Link
                    href={`/lowongan/${job.slug}`}
                    className="block rounded-xl border border-zinc-200 p-4 transition hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="font-medium">{job.title}</h2>
                      <VerificationBadge state={state} />
                    </div>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {job.organizations?.name}
                      {location ? ` · ${location}` : ""}
                      {job.country_code ? ` · ${job.country_code}` : ""}
                    </p>
                    <p className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
                      {signalLabels(readAttributes(job.attributes)).map(
                        (label) => (
                          <span
                            key={label}
                            className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800"
                          >
                            {label}
                          </span>
                        ),
                      )}
                      <span>
                        Diverifikasi {formatDate(job.last_verified_at)}
                      </span>
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {totalPages > 1 && (
          <nav
            aria-label="Halaman"
            className="mt-8 flex items-center justify-between text-sm"
          >
            {page > 1 ? (
              <Link
                href={href({ page: String(page - 1) })}
                className="underline underline-offset-4"
              >
                ← Sebelumnya
              </Link>
            ) : (
              <span />
            )}
            <span className="text-zinc-500">
              Halaman {page} dari {totalPages}
            </span>
            {page < totalPages ? (
              <Link
                href={href({ page: String(page + 1) })}
                className="underline underline-offset-4"
              >
                Berikutnya →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </main>
    </div>
  );
}
