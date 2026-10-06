import Link from "next/link";
import { hostnameOf } from "@/lib/format";
import { createPublicClient } from "@/lib/supabase/public";

type Evidence = { url: string; quote: string; tier: string };

/** Perusahaan yang tercatat punya perjanjian DAMA, masing-masing dengan sumber dan kutipannya. */
export async function DamaEmployersPanel() {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("dama_employers")
    .select(
      "id, name, region, industry, website, careers_url, evidence, verified",
    )
    .order("verified", { ascending: false })
    .order("region")
    .order("name")
    .limit(300);
  if (error) throw new Error(`Gagal memuat perusahaan DAMA: ${error.message}`);
  const employers = data ?? [];

  return (
    <section className="mt-10">
      <h2 className="text-base font-semibold">
        Perusahaan yang merekrut lewat DAMA ({employers.length})
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Dikumpulkan otomatis dari iklan lowongan yang menyebut DAMA secara
        eksplisit, situs representatif wilayah DAMA, dan sumber pihak ketiga.
        DAMA hanya bisa lewat sponsor pemberi kerja, jadi daftar ini membantu
        Anda tahu ke mana melamar. &quot;Terverifikasi&quot; berarti disebut
        situs resmi atau minimal dua sumber berbeda; &quot;Iklan menyebut
        DAMA&quot; berarti iklan lowongannya sendiri menawarkan sponsor DAMA
        (bisa lewat agen rekrutmen atas nama klien).
      </p>
      {employers.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          Daftar sedang dikumpulkan mesin kami; cek lagi nanti.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {employers.map((e) => {
            const evidence = (e.evidence ?? []) as Evidence[];
            const fromAd = evidence.some((x) => x.tier === "job_ad");
            const badge = e.verified
              ? {
                  label: "Terverifikasi",
                  tone: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
                }
              : fromAd
                ? {
                    label: "Iklan menyebut DAMA",
                    tone: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
                  }
                : {
                    label: "Belum terverifikasi",
                    tone: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
                  };
            return (
              <li
                key={e.id}
                className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{e.name}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${badge.tone}`}
                  >
                    {badge.label}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {[e.region, e.industry].filter(Boolean).join(" · ")}
                  {e.careers_url && (
                    <>
                      {" · "}
                      <a
                        href={e.careers_url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="underline underline-offset-4"
                      >
                        halaman karier ↗
                      </a>
                    </>
                  )}
                  {!e.careers_url && e.website && (
                    <>
                      {" · "}
                      <a
                        href={e.website}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="underline underline-offset-4"
                      >
                        {hostnameOf(e.website)} ↗
                      </a>
                    </>
                  )}
                </p>
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer text-zinc-500">
                    Sumber ({evidence.length})
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {evidence.map((x) => (
                      <li key={x.url}>
                        {x.tier === "job_ad" ? (
                          <Link
                            href={x.url}
                            className="underline underline-offset-4"
                          >
                            iklan lowongan
                          </Link>
                        ) : (
                          <a
                            href={x.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="underline underline-offset-4"
                          >
                            {hostnameOf(x.url)}
                          </a>
                        )}{" "}
                        <span className="text-zinc-400">
                          (
                          {x.tier === "official"
                            ? "resmi"
                            : x.tier === "job_ad"
                              ? "iklan pemberi kerja/agen"
                              : "pihak ketiga"}
                          )
                        </span>
                        <blockquote className="mt-0.5 border-l-2 border-zinc-300 pl-2 italic text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                          “{x.quote}”
                        </blockquote>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
