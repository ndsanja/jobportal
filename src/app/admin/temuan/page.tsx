import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatDate, hostnameOf } from "@/lib/format";
import { levelsLabel } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { approveCandidate, dismissCandidate } from "./actions";

export const metadata: Metadata = { title: "Temuan agen penemu — Karir Pro" };

const buttonClass =
  "h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";
const inputClass =
  "h-9 w-full rounded-md border border-zinc-300 bg-transparent px-2 text-sm dark:border-zinc-700";

type Evidence = { url: string; quote: string };

export default async function AdminDiscoveryPage({
  searchParams,
}: PageProps<"/admin/temuan">) {
  await requireAdmin();
  const params = await searchParams;
  const status =
    typeof params.status === "string" &&
    ["pending", "approved", "rejected", "duplicate"].includes(params.status)
      ? params.status
      : "pending";

  const supabase = await createClient();
  const [{ data, error }, counts] = await Promise.all([
    supabase
      .from("discovery_candidates")
      .select("*, countries(name_id, flag), opportunities(slug, kind)")
      .eq("status", status)
      .order("score", { ascending: false })
      .order("last_seen_at", { ascending: false })
      .limit(100),
    Promise.all(
      (["pending", "approved", "rejected", "duplicate"] as const).map(
        async (s) => {
          const { count } = await supabase
            .from("discovery_candidates")
            .select("id", { count: "exact", head: true })
            .eq("status", s);
          return [s, count ?? 0] as const;
        },
      ),
    ),
  ]);
  if (error) throw new Error(`Gagal memuat temuan: ${error.message}`);
  const countOf = new Map(counts);
  const STATUS_LABEL: Record<string, string> = {
    pending: "Menunggu",
    approved: "Disetujui",
    rejected: "Ditolak",
    duplicate: "Duplikat",
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <Link
        href="/admin"
        className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        ← Admin
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Temuan agen penemu
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Program baru yang ditemukan AI di web. Setiap kandidat punya kutipan
        dari halaman tempat ia ditemukan; tautan resmi bertanda ✓ sudah dibuka
        dan terbukti menyebut nama programnya. Setelah disetujui, peluang tampil
        berlabel &quot;perlu ditinjau&quot; dan langsung dijadwalkan untuk riset
        otomatis dari sumber resmi.
      </p>

      <nav className="mt-6 flex flex-wrap gap-2 text-sm">
        {(["pending", "approved", "rejected", "duplicate"] as const).map(
          (s) => (
            <Link
              key={s}
              href={`/admin/temuan?status=${s}`}
              className={`rounded-full border px-3 py-1 ${s === status ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"}`}
            >
              {STATUS_LABEL[s]} ({countOf.get(s) ?? 0})
            </Link>
          ),
        )}
      </nav>

      {data.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          Belum ada kandidat di sini. Jalankan agen penemu:{" "}
          <code>?slug=discover-scholarships</code> atau{" "}
          <code>?slug=discover-programs</code>.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {data.map((c) => {
            const evidence = (c.evidence ?? []) as Evidence[];
            const country = c.countries as {
              name_id: string;
              flag: string;
            } | null;
            const opportunity = c.opportunities as {
              slug: string;
              kind: string;
            } | null;
            return (
              <li
                key={c.id}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-medium">{c.name}</h2>
                  <span className="text-xs text-zinc-500">
                    skor {c.score} · dilihat {c.seen_count}× ·{" "}
                    {c.kind === "scholarship" ? "beasiswa" : "program kerja"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {[
                    c.organizer,
                    country ? `${country.flag} ${country.name_id}` : null,
                    c.levels.length > 0 ? levelsLabel(c.levels) : null,
                    c.deadline
                      ? `tenggat (belum diverifikasi) ${formatDate(c.deadline)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span
                    className={`rounded px-1.5 py-0.5 font-medium ${c.open_to_indonesia === "yes" ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
                  >
                    {c.open_to_indonesia === "yes"
                      ? "WNI disebut eligible"
                      : "Kelayakan WNI belum jelas"}
                  </span>
                  {c.official_url ? (
                    <a
                      href={c.official_url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="underline underline-offset-4"
                    >
                      {c.link_verified ? "✓ " : "? "}
                      {hostnameOf(c.official_url)}
                    </a>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400">
                      Tautan resmi belum ditemukan
                    </span>
                  )}
                </p>
                {c.summary && (
                  <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                    {c.summary}
                  </p>
                )}
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-zinc-500">
                    Ditemukan di {evidence.length} halaman
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {evidence.map((e) => (
                      <li key={e.url}>
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="break-all underline underline-offset-4"
                        >
                          {hostnameOf(e.url)}
                        </a>
                        <blockquote className="mt-1 border-l-2 border-zinc-300 pl-3 italic text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                          “{e.quote}”
                        </blockquote>
                      </li>
                    ))}
                  </ul>
                </details>

                {status === "pending" ? (
                  <div className="mt-4 space-y-2">
                    <form action={approveCandidate} className="space-y-2">
                      <input type="hidden" name="id" value={c.id} />
                      <label className="block text-xs text-zinc-500">
                        Nama program
                        <input
                          name="name"
                          defaultValue={c.name}
                          required
                          className={inputClass}
                        />
                      </label>
                      <label className="block text-xs text-zinc-500">
                        URL resmi (untuk tombol daftar & riset)
                        <input
                          name="official_url"
                          type="url"
                          defaultValue={c.official_url ?? ""}
                          required
                          className={inputClass}
                        />
                      </label>
                      <button type="submit" className={buttonClass}>
                        Setujui & riset otomatis
                      </button>
                    </form>
                    <div className="flex flex-wrap gap-2">
                      <form action={dismissCandidate}>
                        <input type="hidden" name="id" value={c.id} />
                        <input
                          type="hidden"
                          name="decision"
                          value="duplicate"
                        />
                        <button type="submit" className={buttonClass}>
                          Duplikat
                        </button>
                      </form>
                      <form action={dismissCandidate}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="decision" value="rejected" />
                        <button type="submit" className={buttonClass}>
                          Tolak
                        </button>
                      </form>
                    </div>
                  </div>
                ) : (
                  opportunity && (
                    <p className="mt-3 text-xs">
                      <Link
                        href={`/${opportunity.kind === "scholarship" ? "beasiswa" : "lowongan"}/${opportunity.slug}`}
                        className="underline underline-offset-4"
                      >
                        Lihat peluang →
                      </Link>
                    </p>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
