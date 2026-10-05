import type { DataQuality } from "@/domain/quality";

const TONE: Record<DataQuality["level"], string> = {
  tinggi:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  sedang: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  rendah: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

/** Skor keandalan data + penjelasannya (kelengkapan fakta resmi, kebaruan, kesepakatan sumber). */
export function QualityBadge({ quality }: { quality: DataQuality }) {
  const checked =
    quality.daysSinceCheck === null
      ? "belum dicek dari sumber resmi"
      : quality.daysSinceCheck === 0
        ? "dicek hari ini"
        : `dicek ${quality.daysSinceCheck} hari lalu`;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer list-none">
        <span
          className={`rounded px-2 py-1 font-medium ${TONE[quality.level]}`}
        >
          Keandalan data {quality.score}% ({quality.level})
        </span>
      </summary>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        {quality.coveredGroups} dari {quality.totalGroups} fakta kunci sudah
        didukung sumber resmi · {quality.officialFacts} fakta resmi
        {quality.unofficialFacts > 0
          ? ` · ${quality.unofficialFacts} laporan belum resmi/berbeda`
          : ""}{" "}
        · {checked}. Skor ini mengukur seberapa banyak data berpijak pada sumber
        resmi terbaru, bukan jaminan.
      </p>
    </details>
  );
}
