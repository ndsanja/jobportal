import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = {
  title: "Masuk — Karir Pro",
};

export default async function MasukPage({ searchParams }: PageProps<"/masuk">) {
  const params = await searchParams;
  const next = safeNextPath(
    typeof params.next === "string" ? params.next : undefined,
  );
  const hasError = params.error === "auth";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-8 text-lg font-semibold tracking-tight">
        Karir Pro
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">
        Masuk atau daftar
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Simpan peluang, siapkan dokumen, dan pantau tenggat waktu Anda.
      </p>
      {hasError && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          Tautan masuk tidak valid atau sudah kedaluwarsa. Silakan coba lagi.
        </p>
      )}
      <div className="mt-8">
        <LoginForm next={next} />
      </div>
    </main>
  );
}
