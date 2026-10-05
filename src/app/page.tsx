import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { createPublicClient } from "@/lib/supabase/public";

export const revalidate = 3600;

const TRACK_ICONS: Record<string, string> = {
  whv_au: "🦘",
  dama_au: "🏭",
  professional: "💼",
  overseas: "🌏",
  scholarship: "🎓",
};

export default async function Home() {
  const supabase = createPublicClient();
  const { data: tracks, error } = await supabase
    .from("tracks")
    .select("code, name, description")
    .order("sort_order");

  // Gagal keras agar halaman lama (ISR) tidak tertimpa halaman kosong.
  if (error) throw new Error(`Gagal memuat jalur: ${error.message}`);

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-20">
        <section className="py-16 sm:py-24">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Dalam pengembangan
          </p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Temukan peluang kerja dan beasiswa luar negeri dari sumber resmi.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Karir Pro mengumpulkan, memverifikasi, dan mencocokkan peluang
            dengan profil Anda, lalu memandu Anda sampai siap mendaftar.
          </p>
        </section>

        <section aria-labelledby="jalur">
          <h2 id="jalur" className="text-sm font-medium text-zinc-500">
            Jalur yang akan tersedia
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(tracks ?? []).map((track) => (
              <li
                key={track.code}
                className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
              >
                <span aria-hidden="true" className="text-2xl">
                  {TRACK_ICONS[track.code] ?? "✨"}
                </span>
                <h3 className="mt-3 font-medium">{track.name}</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {track.description}
                </p>
                <Link
                  href={
                    track.code === "scholarship"
                      ? "/beasiswa"
                      : `/lowongan?track=${track.code}`
                  }
                  className="mt-3 inline-block text-sm font-medium underline underline-offset-4"
                >
                  Lihat →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center text-xs text-zinc-500 dark:border-zinc-800">
        © {new Date().getFullYear()} Karir Pro
      </footer>
    </div>
  );
}
