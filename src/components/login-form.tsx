"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "sent"; email: string }
  | { type: "error"; message: string };

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ type: "idle" });

  const redirectTo = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function signInWithGoogle() {
    setStatus({ type: "loading" });
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (error) {
      setStatus({
        type: "error",
        message:
          "Masuk dengan Google belum tersedia. Gunakan email untuk sementara.",
      });
    }
  }

  async function signInWithEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ type: "loading" });
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo() },
    });
    if (error) {
      setStatus({
        type: "error",
        message:
          "Gagal mengirim tautan masuk. Periksa email Anda lalu coba lagi.",
      });
      return;
    }
    setStatus({ type: "sent", email: email.trim() });
  }

  if (status.type === "sent") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
        <p className="font-medium">Cek email Anda</p>
        <p className="mt-1">
          Kami mengirim tautan masuk ke <strong>{status.email}</strong>. Buka
          tautan itu di perangkat ini untuk melanjutkan.
        </p>
      </div>
    );
  }

  const busy = status.type === "loading";

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={busy}
        className="flex h-11 w-full items-center justify-center rounded-lg border border-zinc-300 bg-white text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
      >
        Masuk dengan Google
      </button>

      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        atau
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <form onSubmit={signInWithEmail} className="space-y-3">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="nama@email.com"
          className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300"
        />
        <button
          type="submit"
          disabled={busy}
          className="h-11 w-full rounded-lg bg-zinc-900 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {busy ? "Mengirim…" : "Kirim tautan masuk"}
        </button>
      </form>

      {status.type === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {status.message}
        </p>
      )}
    </div>
  );
}
