import type { Metadata } from "next";
import Link from "next/link";
import {
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_STATUSES,
  expiryWarning,
} from "@/domain/documents";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveDocument } from "./actions";

export const metadata: Metadata = { title: "Dokumen saya — Karir Pro" };

const CATEGORY_LABEL: Record<string, string> = {
  identitas: "Identitas",
  pendidikan: "Pendidikan",
  bahasa: "Bahasa",
  karier: "Karier",
  legal: "Legal",
  kesehatan: "Kesehatan",
  keuangan: "Keuangan",
  sertifikat: "Sertifikat",
  lainnya: "Lainnya",
};

const inputClass =
  "h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900";

export default async function DokumenPage({
  searchParams,
}: PageProps<"/saya/dokumen">) {
  const user = await requireUser("/saya/dokumen");
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  const supabase = await createClient();
  const [{ data: types }, { data: mine }] = await Promise.all([
    supabase.from("document_types").select("*").order("sort_order"),
    supabase.from("user_documents").select("*").eq("user_id", user.id),
  ]);

  const byType = new Map((mine ?? []).map((doc) => [doc.document_type, doc]));
  const groups = new Map<string, NonNullable<typeof types>>();
  for (const type of types ?? []) {
    groups.set(type.category, [...(groups.get(type.category) ?? []), type]);
  }
  const now = new Date();
  const haveCount = (mine ?? []).filter((doc) => doc.status === "have").length;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <Link
        href="/saya"
        className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        ← Ruang saya
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Dokumen saya
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Catat dokumen apa yang sudah Anda miliki — tanpa mengunggah file. Anda
        memiliki {haveCount} dari {(types ?? []).length} jenis dokumen. Dokumen
        sensitif (paspor, SKCK, rekening koran, medical check-up) cukup dicatat
        statusnya; jangan tulis nomor dokumen di kolom catatan.
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {[...groups.entries()].map(([category, items]) => (
        <section key={category} className="mt-8">
          <h2 className="text-sm font-medium text-zinc-500">
            {CATEGORY_LABEL[category] ?? category}
          </h2>
          <ul className="mt-3 space-y-3">
            {items.map((type) => {
              const doc = byType.get(type.code);
              const warning = expiryWarning(doc?.expires_on ?? null, now);
              return (
                <li
                  key={type.code}
                  className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">{type.name}</p>
                    {warning === "expired" && (
                      <span className="text-xs font-medium text-red-700 dark:text-red-400">
                        Sudah kedaluwarsa
                      </span>
                    )}
                    {warning === "expiring" && (
                      <span className="text-xs font-medium text-orange-700 dark:text-orange-400">
                        Kedaluwarsa dalam 6 bulan
                      </span>
                    )}
                  </div>
                  {type.description && (
                    <p className="mt-1 text-xs text-zinc-500">
                      {type.description}
                    </p>
                  )}

                  <form
                    action={saveDocument}
                    className="mt-3 flex flex-wrap items-end gap-2"
                  >
                    <input
                      type="hidden"
                      name="document_type"
                      value={type.code}
                    />
                    <label className="text-xs">
                      Status
                      <select
                        name="status"
                        defaultValue={doc?.status ?? "missing"}
                        className={`${inputClass} mt-1 block`}
                      >
                        {DOCUMENT_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {DOCUMENT_STATUS_LABEL[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {type.has_expiry && (
                      <label className="text-xs">
                        Berlaku sampai
                        <input
                          type="date"
                          name="expires_on"
                          defaultValue={doc?.expires_on ?? ""}
                          className={`${inputClass} mt-1 block`}
                        />
                      </label>
                    )}
                    <button
                      type="submit"
                      className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      Simpan
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
