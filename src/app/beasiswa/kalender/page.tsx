import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { formatDate } from "@/lib/format";
import { EVENT_KIND_LABEL, EVENT_KIND_TONE } from "@/lib/labels";
import { createPublicClient } from "@/lib/supabase/public";

export const metadata: Metadata = {
  title: "Kalender beasiswa — Karir Pro",
  description:
    "Tenggat, seleksi, dan pengumuman beasiswa dalam satu kalender, lengkap dengan sumber resminya.",
};

// Disegarkan berkala agar jadwal baru dan penanda "hari ini" tidak membeku di hasil build.
export const revalidate = 600;

const monthFormat = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export default async function KalenderPage() {
  const supabase = createPublicClient();
  const since = new Date(Date.now() - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase
    .from("opportunity_events")
    .select(
      "id, kind, label, starts_on, ends_on, is_estimated, opportunities!inner(slug, title, kind)",
    )
    .eq("opportunities.kind", "scholarship")
    .gte("starts_on", since)
    .order("starts_on")
    .limit(300);
  if (error) throw new Error(`Gagal memuat kalender: ${error.message}`);

  const groups = new Map<string, typeof data>();
  for (const event of data) {
    const key = event.starts_on.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-16">
        <h1 className="text-2xl font-semibold tracking-tight">
          Kalender beasiswa
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Hanya tanggal yang tertulis di halaman resmi penyelenggara. Tanggal
          perkiraan selalu diberi label.
        </p>

        {groups.size === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            Belum ada jadwal yang terverifikasi. Lihat{" "}
            <Link href="/beasiswa" className="underline underline-offset-4">
              daftar beasiswa
            </Link>
            .
          </p>
        ) : (
          [...groups.entries()].map(([key, events]) => (
            <section key={key} className="mt-8">
              <h2 className="text-sm font-medium capitalize text-zinc-500">
                {monthFormat.format(new Date(`${key}-01T00:00:00Z`))}
              </h2>
              <ul className="mt-3 space-y-3">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">
                        {formatDate(event.starts_on)}
                        {event.ends_on ? ` – ${formatDate(event.ends_on)}` : ""}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${EVENT_KIND_TONE[event.kind] ?? "bg-zinc-100 dark:bg-zinc-800"}`}
                      >
                        {EVENT_KIND_LABEL[event.kind] ?? event.kind}
                      </span>
                      {event.starts_on === today && (
                        <span className="text-xs text-amber-700 dark:text-amber-400">
                          hari ini
                        </span>
                      )}
                      {event.is_estimated && (
                        <span className="text-xs text-zinc-500">
                          (perkiraan)
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/beasiswa/${event.opportunities.slug}`}
                      className="mt-1 block text-sm underline-offset-4 hover:underline"
                    >
                      {event.opportunities.title}
                    </Link>
                    {event.label && (
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        {event.label}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
