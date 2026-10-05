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

/** Jadwal peluang (dari sumber resmi bila berasal dari riset otomatis), masing-masing dengan tautan sumber. */
export function EventsList({ events }: { events: EventRow[] }) {
  if (events.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="font-medium">Jadwal</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {events.map((event) => (
          <li
            key={event.id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
          >
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
              <span className="text-zinc-600 dark:text-zinc-400">
                {event.label}
              </span>
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
        ))}
      </ul>
    </section>
  );
}
