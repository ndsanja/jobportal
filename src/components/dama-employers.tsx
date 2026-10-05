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
        Perusahaan yang tercatat punya perjanjian DAMA ({employers.length})
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Dikumpulkan otomatis dari situs representatif wilayah DAMA dan sumber
        pihak ketiga. DAMA hanya bisa lewat sponsor pemberi kerja, jadi daftar
        ini membantu Anda tahu ke mana melamar. Label &quot;terverifikasi&quot;
        berarti disebut situs resmi atau minimal dua sumber berbeda.
      </p>
      {employers.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          Daftar sedang dikumpulkan mesin kami; cek lagi nanti.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {employers.map((e) => {
            const evidence = (e.evidence ?? []) as Evidence[];
            return (
              <li
                key={e.id}
                className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{e.name}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${e.verified ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}
                  >
                    {e.verified ? "Terverifikasi" : "Belum terverifikasi"}
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
                        <a
                          href={x.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="underline underline-offset-4"
                        >
                          {hostnameOf(x.url)}
                        </a>{" "}
                        <span className="text-zinc-400">
                          ({x.tier === "official" ? "resmi" : "pihak ketiga"})
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
