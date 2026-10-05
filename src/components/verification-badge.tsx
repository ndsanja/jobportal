import type { DisplayState } from "@/domain/opportunity";

const BADGES: Record<DisplayState, { label: string; className: string }> = {
  verified: {
    label: "Terverifikasi",
    className:
      "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  },
  aggregated: {
    label: "Dari agregator",
    className:
      "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  community: {
    label: "Dari komunitas",
    className: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  },
  stale: {
    label: "Perlu verifikasi ulang",
    className:
      "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  },
  closed: {
    label: "Ditutup",
    className: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  },
};

export function VerificationBadge({ state }: { state: DisplayState }) {
  const badge = BADGES[state];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}
