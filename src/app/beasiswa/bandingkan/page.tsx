import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { QualityBadge } from "@/components/quality-badge";
import { SiteHeader } from "@/components/site-header";
import { dataQuality } from "@/domain/quality";
import { readAttributes } from "@/lib/attributes";
import { formatClaimValue } from "@/lib/claim-format";
import { formatDeadline } from "@/lib/format";
import { levelsLabel } from "@/lib/labels";
import { createPublicClient } from "@/lib/supabase/public";

export const metadata: Metadata = {
  title: "Bandingkan beasiswa — Karir Pro",
  description:
    "Bandingkan tenggat, pendanaan, syarat, dan kewajiban beberapa beasiswa sekaligus, lengkap dengan sumber resmi tiap fakta.",
};

type ClaimRow = {
  id: string;
  opportunity_id: string | null;
  field: string;
  value: unknown;
  summary: string;
  status: string;
  confidence: number;
  claim_evidence: Array<{
    source_url: string;
    source_tier: string;
    retrieved_at: string;
  }>;
};

const STATUS_LABEL: Record<string, string> = {
  open: "Dibuka",
  upcoming: "Segera / periode berikutnya",
  closed: "Ditutup",
  archived: "Diarsipkan",
};

/** Baris tabel: bidang klaim yang ditampilkan (resmi lebih dulu), plus cadangan dari data listing. */
const ROWS: Array<{
  label: string;
  fields: string[];
  useSummary?: boolean;
}> = [
  { label: "Terbuka untuk WNI", fields: ["eligibility.indonesia"] },
  { label: "Jenjang", fields: ["study.level"] },
  { label: "Jenis pendanaan", fields: ["funding.type"] },
  { label: "Yang ditanggung", fields: ["funding.coverage"] },
  { label: "Nilai manfaat", fields: ["benefit.amount"] },
  { label: "Usia", fields: ["requirement.age"] },
  { label: "Bahasa Inggris", fields: ["requirement.english"] },
  { label: "IPK", fields: ["requirement.gpa"] },
  { label: "Pengalaman kerja", fields: ["requirement.experience_years"] },
  { label: "Pendidikan minimum", fields: ["requirement.education"] },
  {
    label: "Kewajiban setelah program",
    fields: ["obligation.return"],
    useSummary: true,
  },
  { label: "Kuota", fields: ["program.quota"] },
  { label: "Biaya pendaftaran", fields: ["fee.application"] },
  { label: "Cara mendaftar", fields: ["process.application_mode"] },
];

const asArray = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value : value ? [value] : [];

function ClaimCell({
  claims,
  useSummary,
}: {
  claims: ClaimRow[];
  useSummary?: boolean;
}) {
  if (claims.length === 0)
    return <span className="text-zinc-400">belum ditemukan</span>;
  return (
    <ul className="space-y-1">
      {claims.map((claim) => {
        const official = claim.claim_evidence.find(
          (e) => e.source_tier === "official",
        );
        const link = official ?? claim.claim_evidence[0];
        return (
          <li key={claim.id}>
            {useSummary
              ? claim.summary
              : formatClaimValue(claim.field, claim.value)}
            {claim.status === "disputed" && (
              <span className="ml-1 text-amber-700 dark:text-amber-400">
                (belum resmi)
              </span>
            )}
            {link && (
              <a
                href={link.source_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                title={link.source_url}
                className="ml-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                ↗
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default async function CompareScholarshipsPage({
  searchParams,
}: PageProps<"/beasiswa/bandingkan">) {
  const params = await searchParams;
  const slugs = [...new Set(asArray(params.b))]
    .filter((slug) => /^[a-z0-9-]{1,120}$/.test(slug))
    .slice(0, 4);

  const supabase = createPublicClient();
  const { data: rows, error } =
    slugs.length > 0
      ? await supabase
          .from("opportunities")
          .select(
            "id, slug, title, status, closes_at, funding, study_levels, attributes, organizations(name), countries(name_id, flag)",
          )
          .eq("kind", "scholarship")
          .in("slug", slugs)
      : { data: [], error: null };
  if (error) throw new Error(`Gagal memuat beasiswa: ${error.message}`);
  const items = slugs.flatMap((slug) => {
    const item = (rows ?? []).find((r) => r.slug === slug);
    return item ? [item] : [];
  });

  const { data: claimRows, error: claimError } =
    items.length > 0
      ? await supabase
          .from("claims")
          .select(
            "id, opportunity_id, field, value, summary, status, confidence, claim_evidence(source_url, source_tier, retrieved_at)",
          )
          .in(
            "opportunity_id",
            items.map((i) => i.id),
          )
          .in("status", ["accepted", "disputed"])
          .order("confidence", { ascending: false })
      : { data: [], error: null };
  if (claimError) throw new Error(`Gagal memuat fakta: ${claimError.message}`);
  const claims = (claimRows ?? []) as unknown as ClaimRow[];
  const claimsOf = (id: string, fields: string[]) =>
    claims
      .filter((c) => c.opportunity_id === id && fields.includes(c.field))
      .sort((a, b) =>
        a.status === b.status ? 0 : a.status === "accepted" ? -1 : 1,
      );

  const now = new Date();
  const cell = (content: ReactNode, key: string) => (
    <td
      key={key}
      className="min-w-48 border-t border-zinc-200 px-3 py-2 align-top dark:border-zinc-800"
    >
      {content}
    </td>
  );

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-16">
        <Link
          href="/beasiswa"
          className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          ← Semua beasiswa
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Bandingkan beasiswa
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Setiap nilai berasal dari fakta yang dikumpulkan mesin riset kami;
          klik ↗ untuk membuka sumbernya. Nilai berlabel &quot;belum resmi&quot;
          belum dikonfirmasi situs penyelenggara.
        </p>

        {items.length < 2 ? (
          <p className="mt-8 rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            Pilih 2–4 beasiswa di{" "}
            <Link href="/beasiswa" className="underline underline-offset-4">
              daftar beasiswa
            </Link>{" "}
            lalu tekan &quot;Bandingkan&quot;.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white px-3 py-2 text-xs font-medium text-zinc-500 dark:bg-zinc-950">
                    &nbsp;
                  </th>
                  {items.map((item) => (
                    <th
                      key={item.id}
                      className="min-w-48 px-3 py-2 align-bottom"
                    >
                      <Link
                        href={`/beasiswa/${item.slug}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {item.title}
                      </Link>
                      <p className="text-xs font-normal text-zinc-500">
                        {item.organizations?.name}
                        {item.countries
                          ? ` · ${item.countries.flag} ${item.countries.name_id}`
                          : ""}
                      </p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className="sticky left-0 border-t border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
                    Status & tenggat
                  </th>
                  {items.map((item) =>
                    cell(
                      <>
                        {STATUS_LABEL[item.status] ?? item.status}
                        {item.closes_at && (
                          <span className="block text-xs text-zinc-500">
                            {item.status === "closed" ? "ditutup " : "tenggat "}
                            {formatDeadline(
                              item.closes_at,
                              readAttributes(item.attributes).research
                                ?.deadline_precision,
                            )}
                          </span>
                        )}
                      </>,
                      item.id,
                    ),
                  )}
                </tr>
                {ROWS.map((row) => (
                  <tr key={row.label}>
                    <th className="sticky left-0 border-t border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
                      {row.label}
                    </th>
                    {items.map((item) => {
                      const found = claimsOf(item.id, row.fields);
                      // Cadangan dari data listing bila belum ada fakta riset.
                      if (
                        found.length === 0 &&
                        row.fields[0] === "study.level" &&
                        item.study_levels.length > 0
                      )
                        return cell(
                          <span>
                            {levelsLabel(item.study_levels)}{" "}
                            <span className="text-xs text-zinc-400">
                              (data awal)
                            </span>
                          </span>,
                          item.id,
                        );
                      if (
                        found.length === 0 &&
                        row.fields[0] === "funding.type" &&
                        item.funding
                      )
                        return cell(
                          <span>
                            {item.funding}{" "}
                            <span className="text-xs text-zinc-400">
                              (data awal)
                            </span>
                          </span>,
                          item.id,
                        );
                      return cell(
                        <ClaimCell
                          claims={found}
                          useSummary={row.useSummary}
                        />,
                        item.id,
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <th className="sticky left-0 border-t border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
                    Keandalan data
                  </th>
                  {items.map((item) =>
                    cell(
                      <QualityBadge
                        quality={dataQuality(
                          claims
                            .filter((c) => c.opportunity_id === item.id)
                            .map((c) => ({
                              field: c.field,
                              status: c.status,
                              evidence: c.claim_evidence,
                            })),
                          "scholarship",
                          now,
                        )}
                      />,
                      item.id,
                    ),
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
