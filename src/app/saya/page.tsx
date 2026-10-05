import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: "Ruang Saya — Karir Pro",
};

export default async function SayaPage() {
  const user = await requireUser("/saya");
  const supabase = await createClient();
  const [{ data: profile }, plan, documents] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, onboarding_completed")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("plan_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("user_documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "have"),
  ]);

  const cards = [
    {
      href: "/onboarding",
      title: "Profil & tujuan",
      body: profile?.onboarding_completed
        ? "Perbarui tujuan, negara, dan data diri Anda."
        : "Lengkapi profil agar rekomendasi lebih sesuai.",
      highlight: !profile?.onboarding_completed,
    },
    {
      href: "/saya/dokumen",
      title: "Dokumen",
      body: `${documents.count ?? 0} dokumen tercatat sudah dimiliki.`,
      highlight: false,
    },
    {
      href: "/saya/rencana",
      title: "Rencana",
      body: `${plan.count ?? 0} peluang tersimpan di rencana Anda.`,
      highlight: false,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Karir Pro
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
          >
            Keluar
          </button>
        </form>
      </div>

      <h1 className="mt-10 text-2xl font-semibold tracking-tight">
        Halo{profile?.full_name ? `, ${profile.full_name}` : ""}
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {user.email}
        {user.isAdmin ? " · Admin" : ""}
      </p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <li key={card.href}>
            <Link
              href={card.href}
              className={`block h-full rounded-xl border p-5 transition hover:border-zinc-400 dark:hover:border-zinc-600 ${card.highlight ? "border-emerald-400 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950" : "border-zinc-200 dark:border-zinc-800"}`}
            >
              <h2 className="font-medium">{card.title}</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {card.body}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {user.isAdmin && (
        <Link
          href="/admin"
          className="mt-8 inline-block text-sm font-medium underline underline-offset-4"
        >
          Buka panel admin
        </Link>
      )}
    </main>
  );
}
