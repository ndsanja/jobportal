/**
 * Skor keandalan data sebuah peluang (0–100) yang bisa dijelaskan ke pengguna:
 *  - kelengkapan: berapa banyak fakta KUNCI yang sudah didukung sumber resmi,
 *  - kebaruan: kapan terakhir sumber dicek,
 *  - kesepakatan: porsi fakta resmi dibanding laporan yang belum resmi/bertentangan.
 * Ini bukan jaminan kebenaran; ini ukuran seberapa banyak data yang berpijak pada sumber resmi terbaru.
 */

export type QualityClaim = {
  field: string;
  status: string;
  evidence: Array<{ retrieved_at: string }>;
};

/** Fakta kunci per jenis peluang (satu grup terpenuhi bila salah satu bidangnya diterima). */
const KEY_GROUPS: Record<"scholarship" | "program" | "track", string[][]> = {
  scholarship: [
    ["eligibility.indonesia", "requirement.nationality"],
    ["schedule.event"],
    ["funding.type", "funding.coverage", "benefit.amount"],
    ["study.level"],
    ["requirement.english"],
    [
      "requirement.age",
      "requirement.gpa",
      "requirement.experience_years",
      "requirement.education",
    ],
    ["requirement.document"],
    ["process.application_mode", "process.step"],
  ],
  program: [
    ["eligibility.indonesia", "requirement.nationality"],
    ["schedule.event", "process.timeline"],
    [
      "requirement.age",
      "requirement.education",
      "requirement.experience_years",
    ],
    ["requirement.document"],
    ["process.application_mode", "process.step"],
    ["benefit.amount", "condition.stay"],
  ],
  track: [
    ["eligibility.indonesia", "requirement.nationality"],
    ["requirement.age"],
    ["requirement.document"],
    ["process.application_mode", "process.step", "process.ballot"],
    ["fee.application"],
    ["condition.stay"],
  ],
};

export type DataQuality = {
  score: number;
  level: "tinggi" | "sedang" | "rendah";
  coveredGroups: number;
  totalGroups: number;
  officialFacts: number;
  unofficialFacts: number;
  lastCheckedAt: string | null;
  daysSinceCheck: number | null;
};

export function dataQuality(
  claims: QualityClaim[],
  kind: "scholarship" | "program" | "track",
  now: Date,
): DataQuality {
  const accepted = claims.filter((c) => c.status === "accepted");
  const disputed = claims.filter((c) => c.status === "disputed");
  const acceptedFields = new Set(accepted.map((c) => c.field));
  const groups = KEY_GROUPS[kind];
  const covered = groups.filter((g) =>
    g.some((f) => acceptedFields.has(f)),
  ).length;

  const lastCheckedAt =
    accepted
      .flatMap((c) => c.evidence.map((e) => e.retrieved_at))
      .sort()
      .at(-1) ?? null;
  const days =
    lastCheckedAt === null
      ? null
      : Math.max(
          0,
          Math.floor((now.getTime() - Date.parse(lastCheckedAt)) / 86_400_000),
        );

  const coverage = covered / groups.length;
  // 100% bila dicek ≤ 7 hari, turun linear sampai 0% pada 90 hari.
  const freshness =
    days === null ? 0 : days <= 7 ? 1 : Math.max(0, 1 - (days - 7) / 83);
  const agreement =
    accepted.length + disputed.length === 0
      ? 0
      : accepted.length / (accepted.length + disputed.length);
  const score = Math.round(
    100 * (0.55 * coverage + 0.3 * freshness + 0.15 * agreement),
  );

  return {
    score,
    level: score >= 80 ? "tinggi" : score >= 55 ? "sedang" : "rendah",
    coveredGroups: covered,
    totalGroups: groups.length,
    officialFacts: accepted.length,
    unofficialFacts: disputed.length,
    lastCheckedAt,
    daysSinceCheck: days,
  };
}
