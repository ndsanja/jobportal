export const PLAN_STAGES = [
  "saved",
  "preparing",
  "ready",
  "applied",
  "interview",
  "accepted",
  "rejected",
] as const;
export type PlanStage = (typeof PLAN_STAGES)[number];

export const PLAN_STAGE_LABEL: Record<PlanStage, string> = {
  saved: "Disimpan",
  preparing: "Menyiapkan",
  ready: "Siap daftar",
  applied: "Sudah daftar",
  interview: "Wawancara",
  accepted: "Diterima",
  rejected: "Tidak lolos",
};

export const isPlanStage = (value: unknown): value is PlanStage =>
  typeof value === "string" &&
  (PLAN_STAGES as readonly string[]).includes(value);

/** Sisa hari ke tenggat (bulat ke atas); null bila tidak ada tenggat. Negatif bila sudah lewat. */
export function daysUntil(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline).getTime() - now.getTime()) / 86_400_000);
}
