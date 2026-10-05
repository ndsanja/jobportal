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
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

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

      <section className="mt-8 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="font-medium">Ruang personal Anda segera hadir</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Profil, dokumen, rencana, dan timeline akan tersedia di sini. Untuk
          saat ini akun Anda sudah aktif.
        </p>
        {user.isAdmin && (
          <Link
            href="/admin"
            className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
          >
            Buka panel admin
          </Link>
        )}
      </section>
    </main>
  );
}
