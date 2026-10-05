import type { Metadata } from "next";
import Link from "next/link";
import { daysUntil, PLAN_STAGE_LABEL, PLAN_STAGES } from "@/domain/plan";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { removeFromPlan, setStage, togglePin } from "./actions";

export const metadata: Metadata = { title: "Rencana saya — Karir Pro" };

const buttonClass =
  "h-8 rounded-md border border-zinc-300 px-2.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";

export default async function RencanaPage() {
  const user = await requireUser("/saya/rencana");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("plan_items")
    .select(
      "id, stage, pinned, notes, created_at, opportunities(title, slug, kind, status, closes_at, organizations(name))",
    )
    .eq("user_id", user.id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Gagal memuat rencana: ${error.message}`);

  const now = new Date();
  const byStage = new Map(
    PLAN_STAGES.map((stage) => [stage, [] as typeof data]),
  );
  for (const item of data)
    byStage.get(item.stage as (typeof PLAN_STAGES)[number])?.push(item);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <Link
        href="/saya"
        className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        ← Ruang saya
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Rencana saya
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Peluang yang Anda simpan, dikelompokkan menurut tahap persiapan.
        Tambahkan dari halaman{" "}
        <Link href="/lowongan" className="underline underline-offset-4">
          lowongan
        </Link>{" "}
        atau{" "}
        <Link href="/beasiswa" className="underline underline-offset-4">
          beasiswa
        </Link>
        .
      </p>

      {data.length === 0 && (
        <p className="mt-8 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          Rencana Anda masih kosong. Klik “⭐ Tambah ke Rencana” pada lowongan
          atau beasiswa yang menarik.
        </p>
      )}

      {PLAN_STAGES.map((stage) => {
        const items = byStage.get(stage) ?? [];
        if (items.length === 0) return null;
        return (
          <section key={stage} className="mt-8">
            <h2 className="text-sm font-medium text-zinc-500">
              {PLAN_STAGE_LABEL[stage]} ({items.length})
            </h2>
            <ul className="mt-3 space-y-3">
              {items.map((item) => {
                const opportunity = item.opportunities;
                if (!opportunity) return null;
                const path = `${opportunity.kind === "scholarship" ? "/beasiswa" : "/lowongan"}/${opportunity.slug}`;
                const left = daysUntil(opportunity.closes_at, now);
                return (
                  <li
                    key={item.id}
                    className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Link
                        href={path}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {item.pinned && "📌 "}
                        {opportunity.title}
                      </Link>
                      {left !== null && (
                        <span
                          className={`text-xs font-medium ${left < 0 ? "text-red-700 dark:text-red-400" : left <= 14 ? "text-orange-700 dark:text-orange-400" : "text-zinc-500"}`}
                        >
                          {left < 0
                            ? "Tenggat lewat"
                            : left === 0
                              ? "Tenggat hari ini"
                              : `${left} hari lagi`}{" "}
                          · {formatDate(opportunity.closes_at as string)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {opportunity.organizations?.name}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <form
                        action={setStage}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="id" value={item.id} />
                        <select
                          name="stage"
                          defaultValue={item.stage}
                          aria-label="Tahap"
                          className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          {PLAN_STAGES.map((value) => (
                            <option key={value} value={value}>
                              {PLAN_STAGE_LABEL[value]}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className={buttonClass}>
                          Pindahkan
                        </button>
                      </form>
                      <form action={togglePin}>
                        <input type="hidden" name="id" value={item.id} />
                        <input
                          type="hidden"
                          name="pinned"
                          value={String(item.pinned)}
                        />
                        <button type="submit" className={buttonClass}>
                          {item.pinned ? "Lepas pin" : "Pin"}
                        </button>
                      </form>
                      <form action={removeFromPlan}>
                        <input type="hidden" name="id" value={item.id} />
                        <button type="submit" className={buttonClass}>
                          Hapus
                        </button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
