import type { ValidatedExtraction } from "./scholarship-extraction";

export type OpportunitySnapshot = {
  status: "upcoming" | "open" | "closed" | "archived";
  closes_at: string | null;
  funding: string | null;
  study_levels: string[];
};

export type ApplyPlan = {
  updates: Partial<{
    closes_at: string;
    funding: string;
    study_levels: string[];
    status: "upcoming" | "open";
  }>;
  events: Array<{
    kind: string;
    label: string;
    starts_on: string;
    ends_on: string | null;
  }>;
  changes: Array<{ field: string; old: unknown; new: unknown }>;
};

const dayOf = (iso: string) => iso.slice(0, 10);

/**
 * Menghitung perubahan yang akan diterapkan pada sebuah peluang bila admin menyetujui hasil
 * ekstraksi. Fungsi murni: tidak menyentuh database.
 */
export function planApply(
  current: OpportunitySnapshot,
  extraction: ValidatedExtraction,
  now: Date,
): ApplyPlan {
  const updates: ApplyPlan["updates"] = {};
  const changes: ApplyPlan["changes"] = [];
  const today = now.toISOString().slice(0, 10);

  // Tenggat: tanggal 'close' terdekat yang belum lewat. Bila tanggalnya sama dengan tenggat
  // yang sudah tersimpan (mis. lengkap dengan jam), pertahankan nilai lama.
  const nextClose = extraction.dates
    .filter((d) => d.kind === "close")
    .map((d) => d.ends_on ?? d.starts_on)
    .filter((d) => d >= today)
    .sort()[0];
  if (
    nextClose &&
    !(current.closes_at && dayOf(current.closes_at) === nextClose)
  ) {
    updates.closes_at = `${nextClose}T23:59:59Z`;
    changes.push({
      field: "closes_at",
      old: current.closes_at,
      new: updates.closes_at,
    });
  }

  if (extraction.funding && extraction.funding.text !== current.funding) {
    updates.funding = extraction.funding.text;
    changes.push({
      field: "funding",
      old: current.funding,
      new: updates.funding,
    });
  }

  if (extraction.study_levels) {
    const next = [...new Set(extraction.study_levels.values)].sort();
    const old = [...current.study_levels].sort();
    if (next.join(",") !== old.join(",")) {
      updates.study_levels = next;
      changes.push({
        field: "study_levels",
        old: current.study_levels,
        new: next,
      });
    }
  }

  // Program berulang: jendela yang sudah tutup berarti "menunggu siklus berikutnya" (upcoming).
  if (extraction.application_status) {
    const next =
      extraction.application_status.value === "open" ? "open" : "upcoming";
    if (next !== current.status) {
      updates.status = next;
      changes.push({ field: "status", old: current.status, new: next });
    }
  }

  const events = extraction.dates.map((d) => ({
    kind: d.kind,
    label: d.label,
    starts_on: d.starts_on,
    ends_on: d.ends_on,
  }));

  return { updates, events, changes };
}
