import type { Metadata } from "next";
import Link from "next/link";
import { planApply } from "@/domain/apply-extraction";
import type { ValidatedExtraction } from "@/domain/scholarship-extraction";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { EVENT_KIND_LABEL, levelsLabel } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { approveExtraction, rejectExtraction } from "./actions";

export const metadata: Metadata = { title: "Review ekstraksi — Karir Pro" };

type Payload = {
  accepted: ValidatedExtraction;
  rejected: Array<{ path: string; reason: string }>;
  truncated: boolean;
};

export default async function ReviewPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("extractions")
    .select(
      "id, created_at, page_url, model, payload, sources(name), opportunities(title, slug, status, closes_at, funding, study_levels)",
    )
    .eq("status", "pending")
    .order("created_at");
  if (error) throw new Error(`Gagal memuat antrean: ${error.message}`);

  const now = new Date();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <Link
        href="/admin"
        className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        ← Admin
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Antrean review ({data.length})
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Hasil ekstraksi AI dari halaman resmi. Cocokkan setiap kutipan dengan
        halaman sumber sebelum menyetujui.
      </p>

      {data.length === 0 && (
        <p className="mt-8 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          Tidak ada yang menunggu review.
        </p>
      )}

      <ul className="mt-6 space-y-6">
        {data.map((item) => {
          const payload = item.payload as unknown as Payload;
          const accepted = payload.accepted;
          const plan = item.opportunities
            ? planApply(
                {
                  status: item.opportunities.status,
                  closes_at: item.opportunities.closes_at,
                  funding: item.opportunities.funding,
                  study_levels: item.opportunities.study_levels,
                },
                accepted,
                now,
              )
            : null;

          return (
            <li
              key={item.id}
              className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
            >
              <h2 className="font-medium">
                {item.opportunities?.title ?? "(peluang tidak ditemukan)"}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                {item.sources?.name} · {formatDate(item.created_at)} ·{" "}
                {item.model} ·{" "}
                <a
                  href={item.page_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  buka halaman sumber ↗
                </a>
              </p>

              {payload.truncated && (
                <p className="mt-3 text-xs text-orange-700 dark:text-orange-400">
                  ⚠ Teks halaman terpotong; fakta di bagian bawah halaman
                  mungkin tidak terbaca.
                </p>
              )}

              <ul className="mt-4 space-y-3 text-sm">
                {accepted.dates.map((date) => (
                  <Fact
                    key={`${date.kind}-${date.starts_on}-${date.label}`}
                    title={`${EVENT_KIND_LABEL[date.kind] ?? date.kind}: ${formatDate(date.starts_on)}${date.ends_on ? ` – ${formatDate(date.ends_on)}` : ""}`}
                    detail={date.label}
                    evidence={date.evidence}
                  />
                ))}
                {accepted.funding && (
                  <Fact
                    title={`Pendanaan: ${accepted.funding.text}`}
                    evidence={accepted.funding.evidence}
                  />
                )}
                {accepted.study_levels && (
                  <Fact
                    title={`Jenjang: ${levelsLabel(accepted.study_levels.values)}`}
                    evidence={accepted.study_levels.evidence}
                  />
                )}
                {accepted.application_status && (
                  <Fact
                    title={`Status pendaftaran: ${accepted.application_status.value}`}
                    evidence={accepted.application_status.evidence}
                  />
                )}
              </ul>

              {payload.rejected.length > 0 && (
                <p className="mt-3 text-xs text-zinc-500">
                  {payload.rejected.length} fakta dibuang otomatis (kutipan
                  tidak ada di halaman / tanggal tidak wajar).
                </p>
              )}

              {plan && (
                <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
                  <p className="font-medium">Dampak bila disetujui</p>
                  {plan.changes.length === 0 ? (
                    <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                      Tidak ada perubahan nilai; hanya jadwal dari halaman ini
                      yang diganti ({plan.events.length} event) dan data
                      ditandai terverifikasi.
                    </p>
                  ) : (
                    <ul className="mt-1 space-y-0.5 text-zinc-600 dark:text-zinc-400">
                      {plan.changes.map((change) => (
                        <li key={change.field}>
                          {change.field}: {JSON.stringify(change.old)} →{" "}
                          {JSON.stringify(change.new)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="mt-5 flex gap-3">
                <form action={approveExtraction}>
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    type="submit"
                    className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    Setujui & terapkan
                  </button>
                </form>
                <form action={rejectExtraction}>
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    type="submit"
                    className="h-10 rounded-lg border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    Tolak
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function Fact({
  title,
  detail,
  evidence,
}: {
  title: string;
  detail?: string;
  evidence: string;
}) {
  return (
    <li>
      <p className="font-medium">{title}</p>
      {detail && <p className="text-zinc-600 dark:text-zinc-400">{detail}</p>}
      <blockquote className="mt-1 border-l-2 border-zinc-300 pl-3 text-xs italic text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        “{evidence}”
      </blockquote>
    </li>
  );
}
