import Link from "next/link";

const LINKS = [
  { href: "/lowongan", label: "Lowongan" },
  { href: "/beasiswa", label: "Beasiswa" },
  { href: "/beasiswa/kalender", label: "Kalender" },
];

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-5">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Karir Pro
      </Link>
      <nav className="flex items-center gap-4 text-sm font-medium">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="underline-offset-4 hover:underline"
          >
            {link.label}
          </Link>
        ))}
        <Link
          href="/masuk"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Masuk
        </Link>
      </nav>
    </header>
  );
}
