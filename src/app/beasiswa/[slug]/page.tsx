import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToPlanButton } from "@/components/add-to-plan";
import { BriefPanel } from "@/components/brief-panel";
import { ClaimsPanel } from "@/components/claims-panel";
import { EventsList } from "@/components/events-list";
import { QualityBadge } from "@/components/quality-badge";
import { SiteHeader } from "@/components/site-header";
import { VerificationBadge } from "@/components/verification-badge";
import { displayState } from "@/domain/opportunity";
import { dataQuality } from "@/domain/quality";
import { readAttributes } from "@/lib/attributes";
import { loadBrief, loadClaims } from "@/lib/claims-query";
import { formatDate, formatDeadline } from "@/lib/format";
import { levelsLabel } from "@/lib/labels";
import { createPublicClient } from "@/lib/supabase/public";

async function load(slug: string) {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select("*, organizations(name, website), countries(name_id, flag)")
    .eq("slug", slug)
    .eq("kind", "scholarship")
    .maybeSingle();
  if (error) throw new Error(`Gagal memuat beasiswa: ${error.message}`);
  return data;
}

export async function generateMetadata({
  params,
}: PageProps<"/beasiswa/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const item = await load(slug);
  if (!item) return { title: "Beasiswa tidak ditemukan — Karir Pro" };
  return {
    title: `${item.title} — Karir Pro`,
    description: item.summary ?? undefined,
  };
}

const dataNote = (attributes: unknown): string | null => {
  if (typeof attributes !== "object" || attributes === null) return null;
  const note = (attributes as { data_note?: unknown }).data_note;
  return typeof note === "string" ? note : null;
};

export default async function BeasiswaDetailPage({
  params,
}: PageProps<"/beasiswa/[slug]">) {
  const { slug } = await params;
  const item = await load(slug);
  if (!item) notFound();

  const [claims, brief] = await Promise.all([
    loadClaims({ opportunityId: item.id }),
    loadBrief({ opportunityId: item.id }),
  ]);
  const supabase = createPublicClient();
  const { data: events } = await supabase
    .from("opportunity_events")
    .select("id, kind, label, starts_on, ends_on, is_estimated, source_url")
    .eq("opportunity_id", item.id)
    .order("starts_on");

  const now = new Date();
  const state = displayState({
    kind: item.kind,
    status: item.status,
    verificationStatus: item.verification_status,
    lastVerifiedAt: new Date(item.last_verified_at),
    closesAt: item.closes_at ? new Date(item.closes_at) : null,
    now,
  });
  const daysLeft = item.closes_at
    ? Math.ceil(
        (new Date(item.closes_at).getTime() - now.getTime()) / 86_400_000,
      )
    : null;
  const destination = item.countries
    ? `${item.countries.flag} ${item.countries.name_id}`
    : item.region;
  const note = dataNote(item.attributes);
  const research = readAttributes(item.attributes).research;
  const quality = dataQuality(
    claims.map((c) => ({
      field: c.field,
      status: c.status,
      evidence: c.claim_evidence,
    })),
    "scholarship",
    now,
  );

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-16">
        <Link
          href="/beasiswa"
          className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          ← Semua beasiswa
        </Link>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {item.title}
          </h1>
          <VerificationBadge state={state} />
        </div>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          {item.organizations?.name}
        </p>
        <div className="mt-3">
          <QualityBadge quality={quality} />
        </div>

        {research?.eligible_wni === true && (
          <p className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            ✓ Terbuka untuk WNI (menurut sumber resmi)
          </p>
        )}
        {research?.eligible_wni === false && (
          <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
            ✗ Menurut sumber resmi, program ini tidak terbuka untuk pemegang
            paspor Indonesia. Lihat rincian bukti di bawah.
          </p>
        )}

        {state !== "closed" && daysLeft !== null && daysLeft >= 0 && (
          <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            ⏳ {daysLeft === 0 ? "Tenggat hari ini" : `${daysLeft} hari lagi`} ·
            tenggat{" "}
            {formatDeadline(
              item.closes_at as string,
              research?.deadline_precision,
            )}
            {research?.deadline_precision === "day" && (
              <span className="block text-xs opacity-80">
                Jam penutupan tidak tercantum di sumber; daftarlah sebelum hari
                itu berakhir di zona waktu penyelenggara.
              </span>
            )}
          </p>
        )}

        <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {destination && <Fact label="Negara tujuan" value={destination} />}
          {item.study_levels.length > 0 && (
            <Fact label="Jenjang" value={levelsLabel(item.study_levels)} />
          )}
          {item.funding && <Fact label="Pendanaan" value={item.funding} />}
          <Fact
            label="Terakhir diverifikasi"
            value={formatDate(item.last_verified_at)}
          />
          {research?.checked_at && (
            <Fact
              label="Diriset ulang mesin kami"
              value={`${formatDate(research.checked_at)} · ${research.official_facts ?? 0} fakta resmi`}
            />
          )}
          <Fact label="Tingkat keyakinan data" value={`${item.confidence}%`} />
        </dl>

        {item.summary && (
          <p className="mt-8 text-sm leading-7 text-zinc-700 dark:text-zinc-300">
            {item.summary}
          </p>
        )}

        {state === "needs_review" && (
          <p className="mt-4 text-xs text-violet-700 dark:text-violet-300">
            Ringkasan ini disusun dari halaman resmi penyelenggara dan belum
            dicocokkan ulang oleh sistem pemantau kami. Pastikan tenggat dan
            syarat di situs resmi sebelum mendaftar.
            {note ? ` ${note}` : ""}
          </p>
        )}

        <EventsList events={events ?? []} />

        <section className="mt-8">
          <h2 className="font-medium">Syarat & panduan</h2>
          <div className="mt-3">
            {brief && (
              <div className="mb-8">
                <BriefPanel brief={brief} claims={claims} />
              </div>
            )}
            {brief && (
              <h3 className="mb-3 text-base font-semibold">
                Rincian klaim & bukti
              </h3>
            )}
            <ClaimsPanel claims={claims} />
          </div>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={item.apply_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Daftar / info resmi ↗
          </a>
          <AddToPlanButton
            opportunityId={item.id}
            returnTo={`/beasiswa/${item.slug}`}
          />
          {item.official_url && item.official_url !== item.apply_url && (
            <a
              href={item.official_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center rounded-lg border border-zinc-300 px-5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Situs penyelenggara ↗
            </a>
          )}
        </div>
      </main>
    </div>
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
