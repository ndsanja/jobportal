import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeConfidence,
  dedupeKey,
  deriveTracks,
  detectSignals,
  type NormalizedOpportunity,
  verificationStatusFor,
} from "@/domain/opportunity";
import { normalizeOrgName, slugify } from "@/domain/text";
import type {
  Database,
  Json,
  TablesInsert,
} from "@/lib/supabase/database.types";
import type { AdapterResult, IngestSource } from "./types";

type Db = SupabaseClient<Database>;

export type PublishStats = {
  fetched: number;
  skipped: number;
  created: number;
  updated: number;
  changed: number;
  closed: number;
  /** true bila penutupan otomatis dibatalkan karena feed terlihat tidak lengkap. */
  closeSkipped: boolean;
};

// Kecil agar filter `.in()` tidak melewati batas panjang URL PostgREST.
const CHUNK = 50;
const PAGE = 1000;
/** Bila >50% lowongan lama hilang sekaligus, curigai feed parsial dan jangan menutup apa pun. */
const MAX_CLOSE_RATIO = 0.5;
const MIN_FOR_RATIO_GUARD = 20;

const sha1 = (value: string, length: number) =>
  createHash("sha1").update(value).digest("hex").slice(0, length);

function chunk<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

function must<T>(
  result: { data: T | null; error: { message: string } | null },
  action: string,
): T {
  if (result.error) throw new Error(`${action}: ${result.error.message}`);
  return result.data as T;
}

type Prepared = {
  key: string;
  item: NormalizedOpportunity;
  externals: NormalizedOpportunity[];
  tracks: Database["public"]["Enums"]["track"][];
  attributes: Json;
};

function prepare(
  source: IngestSource,
  items: NormalizedOpportunity[],
): Prepared[] {
  const groups = new Map<string, Prepared>();

  for (const item of items) {
    const basis = dedupeKey(item);
    // Disimpan sebagai hash tetap (40 karakter) agar aman dipakai di filter URL; teks dasarnya di attributes.
    const key = sha1(basis, 40);
    const existing = groups.get(key);
    if (existing) {
      existing.externals.push(item);
      continue;
    }
    const signals = detectSignals(item);
    groups.set(key, {
      key,
      item,
      externals: [item],
      tracks: deriveTracks(source.tracks, item.countryCode, signals),
      attributes: {
        ...signals,
        dedupe_basis: basis,
        source_slug: source.slug,
        attribution: source.attribution,
      },
    });
  }
  return [...groups.values()];
}

async function ensureOrganizations(
  db: Db,
  prepared: Prepared[],
): Promise<Map<string, string>> {
  const byNormalized = new Map<string, TablesInsert<"organizations">>();
  for (const { item } of prepared) {
    const normalized = normalizeOrgName(item.organizationName);
    if (!normalized || byNormalized.has(normalized)) continue;
    byNormalized.set(normalized, {
      name: item.organizationName,
      normalized_name: normalized,
      slug: `${slugify(item.organizationName, 60) || "org"}-${sha1(normalized, 6)}`,
      kind: "employer",
      country_code: item.countryCode,
    });
  }

  const rows = [...byNormalized.values()];
  for (const part of chunk(rows)) {
    must(
      await db.from("organizations").upsert(part, {
        onConflict: "normalized_name",
        ignoreDuplicates: true,
      }),
      "Gagal menyimpan organisasi",
    );
  }

  const ids = new Map<string, string>();
  for (const part of chunk([...byNormalized.keys()])) {
    const found = must(
      await db
        .from("organizations")
        .select("id, normalized_name")
        .in("normalized_name", part),
      "Gagal membaca organisasi",
    );
    for (const row of found) ids.set(row.normalized_name, row.id);
  }
  return ids;
}

export async function publishItems(
  db: Db,
  source: IngestSource,
  result: AdapterResult,
  options: { dryRun: boolean; now: Date },
): Promise<PublishStats> {
  const { dryRun, now } = options;
  const nowIso = now.toISOString();
  const prepared = prepare(source, result.items);

  const stats: PublishStats = {
    fetched: result.items.length,
    skipped: result.skipped,
    created: 0,
    updated: 0,
    changed: 0,
    closed: 0,
    closeSkipped: false,
  };

  // 1. Peluang yang sudah ada (untuk deteksi perubahan)
  const existing = new Map<
    string,
    { id: string; apply_url: string; status: string }
  >();
  for (const part of chunk(prepared.map((p) => p.key))) {
    const rows = must(
      await db
        .from("opportunities")
        .select("id, dedupe_key, apply_url, status")
        .in("dedupe_key", part),
      "Gagal membaca peluang",
    );
    for (const row of rows) existing.set(row.dedupe_key, row);
  }

  stats.updated = prepared.filter((p) => existing.has(p.key)).length;
  stats.created = prepared.length - stats.updated;

  const changes: TablesInsert<"opportunity_changes">[] = [];
  for (const p of prepared) {
    const old = existing.get(p.key);
    if (!old) continue;
    if (old.apply_url !== p.item.applyUrl) {
      changes.push({
        opportunity_id: old.id,
        field: "apply_url",
        old_value: old.apply_url,
        new_value: p.item.applyUrl,
        source_id: source.id,
        changed_at: nowIso,
      });
    }
    if (old.status === "closed") {
      changes.push({
        opportunity_id: old.id,
        field: "status",
        old_value: "closed",
        new_value: "open",
        source_id: source.id,
        changed_at: nowIso,
      });
    }
  }
  stats.changed = changes.length;

  const openIdsBySource = dryRun ? null : await writeAll();

  // 3. Tutup lowongan yang hilang dari feed lengkap
  if (result.fullFeed && prepared.length > 0) {
    await closeMissing(openIdsBySource);
  }

  return stats;

  // -------------------------------------------------------------------------

  async function writeAll() {
    const orgIds = await ensureOrganizations(db, prepared);
    const confidence = computeConfidence({
      trustScore: source.trustScore,
      method: source.kind,
    });
    const verification = verificationStatusFor(source.authority);

    const rows: TablesInsert<"opportunities">[] = prepared.map(
      ({ key, item, tracks, attributes }) => ({
        kind: item.kind,
        tracks,
        title: item.title,
        slug: `${slugify(item.title, 50) || "lowongan"}-${sha1(key, 8)}`,
        organization_id:
          orgIds.get(normalizeOrgName(item.organizationName)) ?? null,
        country_code: item.countryCode,
        city: item.city,
        region: item.region,
        postcode: item.postcode,
        is_remote: item.isRemote,
        category: item.category,
        employment_type: item.employmentType,
        summary: item.summary,
        salary_min: item.salary?.min ?? null,
        salary_max: item.salary?.max ?? null,
        salary_currency: item.salary?.currency ?? null,
        salary_period: item.salary?.period ?? null,
        apply_url: item.applyUrl,
        published_at: item.publishedAt,
        status: "open",
        verification_status: verification,
        confidence,
        attributes,
        dedupe_key: key,
        last_seen_at: nowIso,
        last_verified_at: nowIso,
        // is_published, first_seen_at, closes_at sengaja tidak dikirim: nilai moderasi admin
        // dan tanggal pertama terlihat tidak boleh tertimpa oleh ingestion berikutnya.
      }),
    );

    const idByKey = new Map<string, string>();
    for (const part of chunk(rows)) {
      const saved = must(
        await db
          .from("opportunities")
          .upsert(part, { onConflict: "dedupe_key" })
          .select("id, dedupe_key"),
        "Gagal menyimpan peluang",
      );
      for (const row of saved) idByKey.set(row.dedupe_key, row.id);
    }

    const links: TablesInsert<"opportunity_sources">[] = [];
    for (const p of prepared) {
      const opportunityId = idByKey.get(p.key);
      if (!opportunityId) continue;
      for (const external of p.externals) {
        links.push({
          opportunity_id: opportunityId,
          source_id: source.id,
          external_id: external.externalId,
          source_url: external.sourceUrl,
          // Catatan: pemilihan sumber utama saat ada >1 sumber untuk satu peluang menyusul.
          is_primary: true,
          last_seen_at: nowIso,
        });
      }
    }
    for (const part of chunk(links)) {
      must(
        await db
          .from("opportunity_sources")
          .upsert(part, { onConflict: "source_id,external_id" }),
        "Gagal menyimpan lineage sumber",
      );
    }

    for (const part of chunk(changes)) {
      must(
        await db.from("opportunity_changes").insert(part),
        "Gagal menyimpan riwayat perubahan",
      );
    }
    return idByKey;
  }

  async function closeMissing(written: Map<string, string> | null) {
    // Lowongan yang terakhir terlihat sebelum run ini. Saat dry-run `last_seen_at` belum
    // diperbarui, jadi kecualikan yang ada di feed lewat dedupe key.
    const feedIds = new Set<string>();
    for (const old of existing.values()) feedIds.add(old.id);
    if (written) for (const id of written.values()) feedIds.add(id);

    const missing: string[] = [];
    let total = 0;
    for (let from = 0; ; from += PAGE) {
      const page = must(
        await db
          .from("opportunity_sources")
          .select("opportunity_id")
          .eq("source_id", source.id)
          .order("id")
          .range(from, from + PAGE - 1),
        "Gagal membaca lineage sumber",
      );
      for (const row of page) {
        total += 1;
        if (!feedIds.has(row.opportunity_id)) missing.push(row.opportunity_id);
      }
      if (page.length < PAGE) break;
    }

    if (missing.length === 0) return;
    if (
      total >= MIN_FOR_RATIO_GUARD &&
      missing.length / total > MAX_CLOSE_RATIO
    ) {
      stats.closeSkipped = true;
      return;
    }

    const toClose = [...new Set(missing)];
    for (const part of chunk(toClose)) {
      if (dryRun) {
        const open = must(
          await db
            .from("opportunities")
            .select("id")
            .in("id", part)
            .in("status", ["open", "upcoming"]),
          "Gagal membaca peluang",
        );
        stats.closed += open.length;
        continue;
      }
      const closed = must(
        await db
          .from("opportunities")
          .update({ status: "closed" })
          .in("id", part)
          .in("status", ["open", "upcoming"])
          .select("id"),
        "Gagal menutup peluang",
      );
      stats.closed += closed.length;
      if (closed.length > 0) {
        must(
          await db.from("opportunity_changes").insert(
            closed.map((row) => ({
              opportunity_id: row.id,
              field: "status",
              old_value: "open",
              new_value: "closed",
              source_id: source.id,
              changed_at: nowIso,
            })),
          ),
          "Gagal menyimpan riwayat penutupan",
        );
      }
    }
  }
}
