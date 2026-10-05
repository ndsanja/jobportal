import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AddToPlanButton } from "@/components/add-to-plan";
import { BriefPanel } from "@/components/brief-panel";
import { ClaimsPanel } from "@/components/claims-panel";
import { EventsList } from "@/components/events-list";
import { QualityBadge } from "@/components/quality-badge";
import { VerificationBadge } from "@/components/verification-badge";
import { displayState } from "@/domain/opportunity";
import { dataQuality } from "@/domain/quality";
import { readAttributes, signalLabels } from "@/lib/attributes";
import { loadBrief, loadClaims } from "@/lib/claims-query";
import {
  formatDate,
  formatDeadline,
  formatSalary,
  hostnameOf,
} from "@/lib/format";
import { createPublicClient } from "@/lib/supabase/public";

async function loadOpportunity(slug: string) {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select("*, organizations(name, website)")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`Gagal memuat lowongan: ${error.message}`);
  return data;
}

export async function generateMetadata({
  params,
}: PageProps<"/lowongan/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const job = await loadOpportunity(slug);
  if (!job) return { title: "Lowongan tidak ditemukan — Karir Pro" };
  return {
    title: `${job.title} — ${job.organizations?.name ?? "Karir Pro"}`,
    description: job.summary ?? undefined,
  };
}

export default async function LowonganDetailPage({
  params,
}: PageProps<"/lowongan/[slug]">) {
  const { slug } = await params;
  const job = await loadOpportunity(slug);
  if (!job) notFound();
  // Beasiswa punya halaman detail sendiri; jangan tampilkan dengan tata letak lowongan.
  if (job.kind === "scholarship") redirect(`/beasiswa/${job.slug}`);

  const supabase = createPublicClient();
  // Program kerja resmi (G2G, pemagangan, dsb.) diriset otomatis: tampilkan panduan & bukti.
  const isProgram = job.kind === "program";
  const [claims, brief, events] = isProgram
    ? await Promise.all([
        loadClaims({ opportunityId: job.id }),
        loadBrief({ opportunityId: job.id }),
        supabase
          .from("opportunity_events")
          .select(
            "id, kind, label, starts_on, ends_on, is_estimated, source_url",
          )
          .eq("opportunity_id", job.id)
          .order("starts_on")
          .then(({ data }) => data ?? []),
      ])
    : [[], null, []];
  const [sources, changes] = await Promise.all([
    supabase
      .from("opportunity_sources")
      .select("source_url, last_seen_at")
      .eq("opportunity_id", job.id),
    supabase
      .from("opportunity_changes")
      .select("id, field, old_value, new_value, changed_at")
      .eq("opportunity_id", job.id)
      .order("changed_at", { ascending: false })
      .limit(5),
  ]);

  const attributes = readAttributes(job.attributes);
  const state = displayState({
    kind: job.kind,
    status: job.status,
    verificationStatus: job.verification_status,
    lastVerifiedAt: new Date(job.last_verified_at),
    closesAt: job.closes_at ? new Date(job.closes_at) : null,
    now: new Date(),
  });
  const salary = formatSalary(job);
  const location = [job.city, job.region, job.country_code]
    .filter(Boolean)
    .join(", ");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <Link
        href="/lowongan"
        className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        ← Semua lowongan
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
        <VerificationBadge state={state} />
      </div>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        {job.organizations?.name}
      </p>
      {isProgram && (
        <div className="mt-3">
          <QualityBadge
            quality={dataQuality(
              claims.map((c) => ({
                field: c.field,
                status: c.status,
                evidence: c.claim_evidence,
              })),
              "program",
              new Date(),
            )}
          />
        </div>
      )}

      <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        {location && (
          <Fact
            label="Lokasi"
            value={job.is_remote ? `${location} (remote)` : location}
          />
        )}
        {job.employment_type && (
          <Fact label="Tipe kerja" value={job.employment_type} />
        )}
        {job.category && <Fact label="Kategori" value={job.category} />}
        {salary && <Fact label="Gaji (perkiraan dari iklan)" value={salary} />}
        {job.published_at && (
          <Fact label="Diposting" value={formatDate(job.published_at)} />
        )}
        <Fact
          label="Terakhir diverifikasi"
          value={formatDate(job.last_verified_at)}
        />
        <Fact label="Tingkat keyakinan data" value={`${job.confidence}%`} />
      </dl>

      {signalLabels(attributes).length > 0 && (
        <p className="mt-5 flex flex-wrap gap-2 text-xs">
          {signalLabels(attributes).map((label) => (
            <span
              key={label}
              className="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800"
            >
              {label}
            </span>
          ))}
        </p>
      )}

      {isProgram && attributes.research?.eligible_wni === false && (
        <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
          ✗ Menurut sumber resmi, program ini tidak terbuka untuk pemegang
          paspor Indonesia.
        </p>
      )}
      {isProgram && job.closes_at && state !== "closed" && (
        <p className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          ⏳ Tenggat{" "}
          {formatDeadline(
            job.closes_at,
            attributes.research?.deadline_precision,
          )}
        </p>
      )}

      {job.summary && (
        <section className="mt-8">
          <h2 className="font-medium">Ringkasan</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-7 text-zinc-700 dark:text-zinc-300">
            {job.summary}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Ringkasan singkat dari iklan; baca iklan lengkap di sumber resmi.
          </p>
        </section>
      )}

      {isProgram && (
        <>
          <EventsList events={events} />
          <section className="mt-8">
            <h2 className="font-medium">Syarat & panduan</h2>
            <div className="mt-3">
              {brief && (
                <div className="mb-8">
                  <BriefPanel brief={brief} claims={claims} />
                </div>
              )}
              <ClaimsPanel claims={claims} />
            </div>
          </section>
        </>
      )}

      <div className="mt-8">
        {state === "closed" ? (
          <p className="text-sm text-red-700 dark:text-red-400">
            Lowongan ini sudah ditutup.
          </p>
        ) : (
          <a
            href={job.apply_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex h-11 items-center rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Lamar di situs resmi ↗
          </a>
        )}
        {state === "stale" && (
          <p className="mt-3 text-xs text-orange-700 dark:text-orange-400">
            Data ini belum diverifikasi ulang dalam beberapa waktu. Pastikan
            lowongan masih dibuka di situs sumber.
          </p>
        )}
      </div>

      <div className="mt-4">
        <AddToPlanButton
          opportunityId={job.id}
          returnTo={`/lowongan/${job.slug}`}
        />
      </div>

      <section className="mt-10 border-t border-zinc-200 pt-6 text-sm dark:border-zinc-800">
        <h2 className="font-medium">Sumber data</h2>
        <ul className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-400">
          {(sources.data ?? []).map((source) => (
            <li key={source.source_url}>
              <a
                href={source.source_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="underline underline-offset-4"
              >
                {hostnameOf(source.source_url)}
              </a>{" "}
              · terakhir terlihat {formatDate(source.last_seen_at)}
            </li>
          ))}
        </ul>
        {attributes.attribution && (
          <p className="mt-2 text-xs text-zinc-500">{attributes.attribution}</p>
        )}
      </section>

      {(changes.data ?? []).length > 0 && (
        <section className="mt-6 text-sm">
          <h2 className="font-medium">Riwayat perubahan</h2>
          <ul className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-400">
            {(changes.data ?? []).map((change) => (
              <li key={change.id}>
                {formatDate(change.changed_at)} · {change.field}:{" "}
                {String(change.old_value)} → {String(change.new_value)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
