/**
 * Timeline peluang: memisahkan riwayat siklus lalu dari jadwal mendatang, dan memperkirakan jadwal
 * siklus berikutnya dari pola tahun-tahun sebelumnya. Perkiraan SELALU berlabel perkiraan dan hanya
 * dibuat bila belum ada tanggal resmi mendatang untuk jenis tahap itu.
 */

export type TimelineEvent = {
  kind: string;
  startsOn: string; // YYYY-MM-DD
  label: string | null;
};

export type CyclePrediction = {
  kind: string;
  /** Rentang perkiraan (YYYY-MM-DD). */
  from: string;
  to: string;
  /** Tahun-tahun riwayat yang menjadi dasar. */
  basisYears: number[];
  confidence: "tinggi" | "sedang" | "rendah";
};

const DAY = 86_400_000;
const PREDICTABLE = [
  "open",
  "close",
  "test",
  "interview",
  "announcement",
  "ballot_open",
  "ballot_close",
];

const dayOfYear = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Math.round((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY);
};
const fromDayOfYear = (year: number, doy: number) =>
  new Date(Date.UTC(year, 0, 1) + doy * DAY).toISOString().slice(0, 10);

export function splitTimeline<T extends TimelineEvent>(events: T[], now: Date) {
  const today = now.toISOString().slice(0, 10);
  const upcoming = events
    .filter((e) => e.startsOn >= today)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const past = events
    .filter((e) => e.startsOn < today)
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn));
  return { upcoming, past };
}

export function predictNextCycle(
  events: TimelineEvent[],
  now: Date,
): CyclePrediction[] {
  const today = now.toISOString().slice(0, 10);
  const predictions: CyclePrediction[] = [];
  for (const kind of PREDICTABLE) {
    const ofKind = events.filter((e) => e.kind === kind);
    if (ofKind.length === 0 || ofKind.some((e) => e.startsOn >= today))
      continue;

    // Satu tanggal per tahun (yang paling awal), maksimal 4 tahun terakhir.
    const byYear = new Map<number, string>();
    for (const e of ofKind) {
      const year = Number(e.startsOn.slice(0, 4));
      const current = byYear.get(year);
      if (!current || e.startsOn < current) byYear.set(year, e.startsOn);
    }
    const years = [...byYear.keys()].sort((a, b) => b - a).slice(0, 4);
    const doys = years.map((y) => dayOfYear(byYear.get(y) as string));
    const spread = Math.max(...doys) - Math.min(...doys);
    const center = Math.round(doys.reduce((a, b) => a + b, 0) / doys.length);
    const margin = Math.max(7, Math.ceil(spread / 2) + 3);

    let year = (years[0] as number) + 1;
    while (fromDayOfYear(year, center + margin) < today) year += 1;

    predictions.push({
      kind,
      from: fromDayOfYear(year, center - margin),
      to: fromDayOfYear(year, center + margin),
      basisYears: [...years].sort(),
      confidence:
        years.length >= 3 && spread <= 14
          ? "tinggi"
          : years.length >= 2 && spread <= 21
            ? "sedang"
            : "rendah",
    });
  }
  return predictions.sort((a, b) => a.from.localeCompare(b.from));
}
