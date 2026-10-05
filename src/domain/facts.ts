import type { SourceTier } from "./claims";
import { isStaleEvidence } from "./claims";

/**
 * Menurunkan data listing peluang (tenggat, status, pendanaan, jenjang, event kalender) dari klaim
 * yang sudah DITERIMA (didukung sumber resmi yang masih berlaku). Fungsi murni: tanpa I/O.
 */

export type FactEvidence = {
  url: string;
  tier: SourceTier;
  asOf: string | null;
};

export type FactClaim = {
  id: string;
  field: string;
  value: unknown;
  status: string;
  confidence: number;
  evidence: FactEvidence[];
};

/** Jenis event yang diterima tabel opportunity_events. */
export type EventKind =
  | "open"
  | "close"
  | "test"
  | "interview"
  | "announcement"
  | "start"
  | "ballot_open"
  | "ballot_close"
  | "other";

export type DerivedEvent = {
  claimId: string;
  kind: EventKind;
  label: string;
  startsOn: string;
  endsOn: string | null;
  sourceUrl: string | null;
  /** Saat pasti (UTC) bila jam/zona diketahui atau diasumsikan; dipakai untuk tenggat. */
  instant: string;
  /** "exact" bila jam & zona tertulis; "day" bila hanya tanggal (diasumsikan 23.59 WIB). */
  precision: "exact" | "day";
};

export type DerivedFacts = {
  events: DerivedEvent[];
  /** undefined = tidak ada info jadwal resmi (jangan ubah listing). */
  closesAt: string | null | undefined;
  closesPrecision: "exact" | "day" | undefined;
  status: "open" | "upcoming" | "closed" | undefined;
  funding: string | undefined;
  studyLevels: string[] | undefined;
  eligibleForIndonesia: boolean | undefined;
  /** Jumlah fakta diterima yang didukung sumber resmi yang masih berlaku. */
  officialFacts: number;
  verified: boolean;
};

const FUNDING_LABEL: Record<string, string> = {
  full: "Penuh",
  partial: "Parsial",
  tuition: "Biaya kuliah",
  stipend: "Tunjangan",
  varies: "Bervariasi per program",
};

/** Zona waktu umum → selisih menit dari UTC. */
const ZONE_OFFSETS: Record<string, number> = {
  utc: 0,
  gmt: 0,
  z: 0,
  wib: 420,
  wita: 480,
  wit: 540,
  bst: 60,
  cet: 60,
  cest: 120,
  eet: 120,
  eest: 180,
  msk: 180,
  gst: 240,
  ist: 330,
  sgt: 480,
  myt: 480,
  hkt: 480,
  awst: 480,
  jst: 540,
  kst: 540,
  acst: 570,
  acdt: 630,
  aest: 600,
  aedt: 660,
  nzst: 720,
  nzdt: 780,
  est: -300,
  edt: -240,
  cst: -360,
  cdt: -300,
  mst: -420,
  mdt: -360,
  pst: -480,
  pdt: -420,
};

/** Selisih menit dari UTC untuk zona (singkatan, "UTC+7", atau nama IANA) pada tanggal tertentu. */
export function zoneOffsetMinutes(
  zone: string,
  isoDate: string,
): number | null {
  const key = zone.trim().toLowerCase();
  if (key in ZONE_OFFSETS) return ZONE_OFFSETS[key] as number;
  const fixed = /^(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(
    zone.trim(),
  );
  if (fixed) {
    const minutes = Number(fixed[2]) * 60 + Number(fixed[3] ?? 0);
    return fixed[1] === "-" ? -minutes : minutes;
  }
  try {
    // Nama IANA: hitung offset aktual pada tanggal itu (memperhitungkan DST).
    const probe = new Date(`${isoDate}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone.trim(),
      timeZoneName: "longOffset",
    }).formatToParts(probe);
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    if (name === "GMT") return 0;
    const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
    if (!match) return null;
    const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
    return match[1] === "-" ? -minutes : minutes;
  } catch {
    return null;
  }
}

/**
 * Saat tenggat dalam UTC. Jam & zona tertulis → tepat. Hanya zona → 23.59 di zona itu.
 * Tidak ada keduanya → 23.59 WIB (pengguna kita di Indonesia; tanggal yang tampil tetap benar).
 */
export function deadlineInstant(
  date: string,
  time: string | null | undefined,
  timezone: string | null | undefined,
): { instant: string; precision: "exact" | "day" } {
  const offset = timezone ? zoneOffsetMinutes(timezone, date) : null;
  const [hh, mm] = (time ?? "23:59").split(":").map(Number) as [number, number];
  const minutesFromMidnight = hh * 60 + mm;
  const zoneOffset = offset ?? 420;
  const utcMs =
    Date.parse(`${date}T00:00:00Z`) +
    (minutesFromMidnight - zoneOffset) * 60_000;
  return {
    instant: new Date(utcMs).toISOString(),
    precision: time && offset !== null ? "exact" : "day",
  };
}

const isOfficialCurrent = (claim: FactClaim, now: Date) =>
  claim.evidence.some(
    (e) => e.tier === "official" && !isStaleEvidence(e.asOf, now),
  );

const officialUrl = (claim: FactClaim): string | null =>
  claim.evidence.find((e) => e.tier === "official")?.url ??
  claim.evidence[0]?.url ??
  null;

export function deriveOpportunityFacts(
  claims: FactClaim[],
  now: Date,
): DerivedFacts {
  // Hanya fakta yang diterima: didukung sumber resmi yang masih berlaku, atau ditetapkan admin.
  const accepted = claims.filter(
    (c) =>
      c.status === "accepted" &&
      (isOfficialCurrent(c, now) || c.evidence.length === 0),
  );
  const of = (field: string) => accepted.filter((c) => c.field === field);

  const events: DerivedEvent[] = of("schedule.event").flatMap((claim) => {
    const v = claim.value as {
      kind: EventKind;
      date: string;
      end_date?: string | null;
      time?: string | null;
      timezone?: string | null;
      label: string;
    };
    const { instant, precision } = deadlineInstant(v.date, v.time, v.timezone);
    const when = v.time
      ? ` (${v.time}${v.timezone ? ` ${v.timezone}` : ""})`
      : "";
    return [
      {
        claimId: claim.id,
        kind: v.kind,
        label: `${v.label}${when}`.slice(0, 160),
        startsOn: v.date,
        endsOn: v.end_date ?? null,
        sourceUrl: officialUrl(claim),
        instant,
        precision,
      },
    ];
  });

  const closes = events
    .filter((e) => e.kind === "close")
    .sort((a, b) => a.instant.localeCompare(b.instant));
  const deadlines =
    closes.length > 0
      ? closes
      : events.filter((e) => e.kind === "ballot_close");
  const nowIso = now.toISOString();
  const nextClose = deadlines.find((e) => e.instant > nowIso);
  const lastClose = [...deadlines].reverse().find((e) => e.instant <= nowIso);
  const today = nowIso.slice(0, 10);
  const opensLater = events.some(
    (e) =>
      (e.kind === "open" || e.kind === "ballot_open") && e.startsOn > today,
  );

  let closesAt: string | null | undefined;
  let closesPrecision: "exact" | "day" | undefined;
  let status: DerivedFacts["status"];
  if (nextClose) {
    closesAt = nextClose.instant;
    closesPrecision = nextClose.precision;
    status = opensLater ? "upcoming" : "open";
  } else if (lastClose) {
    closesAt = lastClose.instant;
    closesPrecision = lastClose.precision;
    status = "closed";
  } else if (opensLater) {
    status = "upcoming";
  }

  const fundingType = of("funding.type")[0]?.value as
    | { type?: string }
    | undefined;
  const levels = of("study.level")
    .map((c) => (c.value as { level?: string }).level)
    .filter((l): l is string => typeof l === "string");
  const eligibility = of("eligibility.indonesia")[0]?.value as
    | { eligible?: boolean }
    | undefined;

  const officialFacts = accepted.filter((c) =>
    isOfficialCurrent(c, now),
  ).length;
  return {
    events,
    closesAt,
    closesPrecision,
    status,
    funding: fundingType?.type ? FUNDING_LABEL[fundingType.type] : undefined,
    studyLevels: levels.length > 0 ? [...new Set(levels)].sort() : undefined,
    eligibleForIndonesia:
      typeof eligibility?.eligible === "boolean"
        ? eligibility.eligible
        : undefined,
    officialFacts,
    verified: officialFacts >= 3,
  };
}

/** Jadwal riset ulang: lebih sering menjelang tenggat, jarang untuk yang sudah tutup. */
export function nextResearchAt(
  input: {
    status: string;
    closesAt: string | null;
    outcome: "success" | "partial" | "failed";
  },
  now: Date,
  config: {
    refreshDays: number;
    urgentDays: number;
    closedRefreshDays: number;
  },
): Date {
  const day = 86_400_000;
  const at = (ms: number) => new Date(now.getTime() + ms);
  if (input.outcome === "failed") return at(day);
  if (input.outcome === "partial") return at(day / 2);
  const closes = input.closesAt ? Date.parse(input.closesAt) : null;
  if (
    closes !== null &&
    closes > now.getTime() &&
    closes - now.getTime() < 30 * day
  )
    return at(config.urgentDays * day);
  if (input.status === "closed" || input.status === "archived")
    return at(config.closedRefreshDays * day);
  return at(config.refreshDays * day);
}
