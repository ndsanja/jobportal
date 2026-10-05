import { BRIEF_SECTIONS } from "@/domain/brief";
import type { PublicBrief, PublicClaim } from "@/lib/claims-query";
import { formatDate } from "@/lib/format";

const TIER_LABEL: Record<string, string> = {
  official: "Resmi",
  reputable: "Tepercaya",
  community: "Komunitas",
};
const TIER_RANK: Record<string, number> = {
  official: 0,
  reputable: 1,
  community: 2,
};

type SourceLink = {
  url: string;
  domain: string;
  tier: string;
  pageDate: string | null;
  retrievedAt: string;
};

/** Sumber di balik satu butir: URL halaman unik (resmi dulu) dari klaim yang dirujuk. */
function sourcesOf(ids: string[], byId: Map<string, PublicClaim>) {
  const claims = ids.flatMap((id) => {
    const claim = byId.get(id);
    return claim ? [claim] : [];
  });
  const links = new Map<string, SourceLink>();
  for (const claim of claims) {
    for (const e of claim.claim_evidence) {
      const known = links.get(e.source_url);
      if (
        !known ||
        (TIER_RANK[e.source_tier] ?? 9) < (TIER_RANK[known.tier] ?? 9)
      )
        links.set(e.source_url, {
          url: e.source_url,
          domain: e.source_domain,
          tier: e.source_tier,
          pageDate: e.page_date,
          retrievedAt: e.retrieved_at,
        });
    }
  }
  return {
    official: claims.some((c) => c.status === "accepted"),
    links: [...links.values()].sort(
      (a, b) => (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9),
    ),
  };
}

/** Alamat ringkas yang tetap terbaca: host + path tanpa skema/parameter. */
const shortUrl = (url: string) => {
  try {
    const u = new URL(url);
    const text = `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
    return text.length > 70 ? `${text.slice(0, 67)}…` : text;
  } catch {
    return url;
  }
};

/** Usia sumber: tanggal pembaruan halaman (bila tercantum) dan kapan mesin kami terakhir membacanya. */
function SourceDates({ link }: { link: SourceLink }) {
  return (
    <span className="text-zinc-400">
      {link.pageDate
        ? `halaman diperbarui ${formatDate(link.pageDate)}`
        : "tanggal pembaruan tidak tercantum"}{" "}
      · dicek {formatDate(link.retrievedAt)}
    </span>
  );
}

function SourceAnchor({ link }: { link: SourceLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      title={link.url}
      className="break-all underline underline-offset-4 hover:text-zinc-900 dark:hover:text-zinc-100"
    >
      {shortUrl(link.url)}
      <span aria-hidden> ↗</span>
    </a>
  );
}

function Sources({
  ids,
  byId,
}: {
  ids: string[];
  byId: Map<string, PublicClaim>;
}) {
  const { official, links } = sourcesOf(ids, byId);
  const badge = (
    <span
      className={
        official
          ? "rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
          : "rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
      }
    >
      {official ? "Resmi" : "Belum resmi"}
    </span>
  );

  if (links.length === 0)
    return <span className="mt-1 block text-xs">{badge}</span>;

  if (links.length === 1) {
    const [link] = links as [SourceLink];
    return (
      <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
        {badge}
        <SourceAnchor link={link} />
        <SourceDates link={link} />
      </span>
    );
  }

  return (
    <details className="group mt-2 text-xs text-zinc-500">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1">
        {badge}
        <span className="underline underline-offset-4">
          Cek sumber ({links.length})
        </span>
        <span aria-hidden className="transition group-open:rotate-90">
          ›
        </span>
      </summary>
      <ul className="mt-2 space-y-1.5 border-l-2 border-zinc-200 pl-3 dark:border-zinc-800">
        {links.map((link) => (
          <li key={link.url} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-zinc-400">
              {TIER_LABEL[link.tier] ?? link.tier}
            </span>
            <SourceAnchor link={link} />
            <SourceDates link={link} />
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Panduan lengkap hasil sintesis AI; tiap butir bersandar pada klaim berbukti (lihat rincian di bawahnya). */
export function BriefPanel({
  brief,
  claims,
}: {
  brief: PublicBrief;
  claims: PublicClaim[];
}) {
  const byId = new Map(claims.map((c) => [c.id, c]));
  const { content } = brief;
  const headings = new Map<string, string>(
    BRIEF_SECTIONS.map((s) => [s.id, s.heading]),
  );

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/40">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
          Intisari
        </p>
        <h2 className="mt-1 text-lg font-semibold">{content.headline}</h2>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          {content.summary}
        </p>
      </div>

      {content.sections.map((section) => (
        <div key={section.id}>
          <h3 className="text-base font-semibold">
            {headings.get(section.id) ?? section.id}
          </h3>
          <ul className="mt-3 space-y-3">
            {section.items.map((item) => (
              <li
                key={item.text}
                className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800"
              >
                {item.text}
                <Sources ids={item.claim_ids} byId={byId} />
              </li>
            ))}
          </ul>
        </div>
      ))}

      {content.uncertainties.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-amber-800 dark:text-amber-300">
            Yang belum pasti
          </h3>
          <ul className="mt-3 space-y-3">
            {content.uncertainties.map((item) => (
              <li
                key={item.text}
                className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30"
              >
                {item.text}
                <Sources ids={item.claim_ids} byId={byId} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Panduan disusun otomatis oleh AI dari klaim berbukti di bawah ini,
        diperbarui {formatDate(brief.generated_at)}. Selalu cek ulang di situs
        resmi sebelum mendaftar.
      </p>
    </section>
  );
}
