import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Admin — Karir Pro",
};

export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [sources, countries, documentTypes, pending, opportunities] =
    await Promise.all([
      supabase.from("sources").select("id", { count: "exact", head: true }),
      supabase.from("countries").select("code", { count: "exact", head: true }),
      supabase
        .from("document_types")
        .select("code", { count: "exact", head: true }),
      supabase
        .from("extractions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true }),
    ]);

  const stats = [
    { label: "Peluang", value: opportunities.count ?? 0 },
    { label: "Menunggu review", value: pending.count ?? 0 },
    { label: "Sumber data", value: sources.count ?? 0 },
    { label: "Negara", value: countries.count ?? 0 },
    { label: "Jenis dokumen", value: documentTypes.count ?? 0 },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <Link
        href="/saya"
        className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        ← Ruang saya
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Panel admin
      </h1>
      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <dt className="text-xs text-zinc-500">{stat.label}</dt>
            <dd className="mt-1 text-2xl font-semibold">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <ul className="mt-8 space-y-2 text-sm">
        <li>
          <Link
            href="/admin/review"
            className="font-medium underline underline-offset-4"
          >
            Antrean review ekstraksi ({pending.count ?? 0}) →
          </Link>
        </li>
        <li>
          <Link
            href="/admin/claims"
            className="font-medium underline underline-offset-4"
          >
            Klaim hasil riset (syarat &amp; bukti) →
          </Link>
        </li>
      </ul>
    </main>
  );
}
