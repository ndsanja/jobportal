import { predictNextCycle, splitTimeline } from "@/domain/timeline";
import { formatDate } from "@/lib/format";
import { EVENT_KIND_LABEL, EVENT_KIND_TONE } from "@/lib/labels";

export type EventRow = {
  id: string;
  kind: string;
  label: string | null;
  starts_on: string;
  ends_on: string | null;
  is_estimated: boolean;
  source_url: string | null;
};

const CONFIDENCE_LABEL = {
  tinggi: "pola konsisten",
  sedang: "pola cukup konsisten",
  rendah: "data riwayat terbatas",
} as const;

const monthYear = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function EventItem({ event }: { event: EventRow }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span
        className={`rounded px-2 py-0.5 text-xs font-medium ${EVENT_KIND_TONE[event.kind] ?? "bg-zinc-100 dark:bg-zinc-800"}`}
      >
        {EVENT_KIND_LABEL[event.kind] ?? event.kind}
      </span>
      <span>
        {formatDate(event.starts_on)}
        {event.ends_on ? ` – ${formatDate(event.ends_on)}` : ""}
        {event.is_estimated ? " (perkiraan)" : ""}
      </span>
      {event.label && (
        <span className="text-zinc-600 dark:text-zinc-400">{event.label}</span>
      )}
      {event.source_url && (
        <a
          href={event.source_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-xs text-zinc-500 underline underline-offset-4"
        >
          sumber ↗
        </a>
      )}
    </li>
  );
}

/**
 * Timeline: jadwal mendatang (resmi), perkiraan siklus berikutnya (dari pola riwayat, berlabel
 * perkiraan), dan riwayat siklus sebelumnya per tahun.
 */
export function EventsList({ events }: { events: EventRow[] }) {
  if (events.length === 0) return null;
  const now = new Date();
  const timeline = events.map((e) => ({ ...e, startsOn: e.starts_on }));
  const { upcoming, past } = splitTimeline(timeline, now);
  const predictions = predictNextCycle(timeline, now);
  const pastByYear = new Map<string, typeof past>();
  for (const e of past)
    pastByYear.set(e.startsOn.slice(0, 4), [
      ...(pastByYear.get(e.startsOn.slice(0, 4)) ?? []),
      e,
    ]);

  return (
    <section className="mt-8 space-y-5">
      <h2 className="font-medium">Timeline</h2>

      <div>
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Jadwal mendatang
        </h3>
        {upcoming.length > 0 ? (
          <ul className="mt-2 space-y-2 text-sm">
            {upcoming.map((e) => (
              <EventItem key={e.id} event={e} />
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-zinc-500">
            Belum ada jadwal resmi untuk siklus berikutnya.
          </p>
        )}
      </div>

      {predictions.length > 0 && (
        <div className="rounded-xl border border-dashed border-sky-300 p-4 dark:border-sky-800">
          <h3 className="text-sm font-medium text-sky-800 dark:text-sky-300">
            Perkiraan siklus berikutnya
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {predictions.map((p) => (
              <li key={p.kind}>
                <span className="font-medium">
                  {EVENT_KIND_LABEL[p.kind] ?? p.kind}:
                </span>{" "}
                sekitar {monthYear.format(new Date(p.from))} –{" "}
                {monthYear.format(new Date(p.to))}
                <span className="text-xs text-zinc-500">
                  {" "}
                  (berdasarkan {p.basisYears.join(", ")};{" "}
                  {CONFIDENCE_LABEL[p.confidence]})
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">
            Ini perkiraan dari pola tahun sebelumnya, bukan jadwal resmi. Jadwal
            resmi otomatis menggantikan perkiraan begitu diumumkan.
          </p>
        </div>
      )}

      {past.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-300">
            Riwayat siklus sebelumnya ({past.length})
          </summary>
          <div className="mt-3 space-y-3">
            {[...pastByYear.entries()].map(([year, items]) => (
              <div key={year}>
                <p className="text-xs font-medium text-zinc-500">{year}</p>
                <ul className="mt-1 space-y-2">
                  {items.map((e) => (
                    <EventItem key={e.id} event={e} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
