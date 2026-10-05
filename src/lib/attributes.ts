import type { Json } from "@/lib/supabase/database.types";

export type OpportunityAttributes = {
  whv_signal?: "explicit" | "likely" | "unsuitable" | "unknown";
  sponsorship?: "available" | "none" | "unknown";
  dama_mentioned?: boolean;
  /** Perusahaan tercatat punya perjanjian DAMA (dama_employers terverifikasi). */
  dama_employer?: boolean;
  attribution?: string | null;
  /** Hasil riset otomatis (lihat src/server/research/opportunities.ts). */
  research?: {
    checked_at?: string;
    official_facts?: number;
    eligible_wni?: boolean | null;
    deadline_precision?: "exact" | "day" | null;
  };
};

export function readAttributes(value: Json): OpportunityAttributes {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {};
  return value as OpportunityAttributes;
}

/** Label sinyal yang boleh ditampilkan; hanya berdasarkan pernyataan di iklan. */
export function signalLabels(attributes: OpportunityAttributes): string[] {
  const labels: string[] = [];
  if (attributes.whv_signal === "explicit") labels.push("Cocok untuk WHV");
  else if (attributes.whv_signal === "likely")
    labels.push("Kemungkinan cocok WHV");
  if (attributes.dama_mentioned) labels.push("Menyebut DAMA");
  if (attributes.dama_employer) labels.push("Pemberi kerja DAMA");
  if (attributes.sponsorship === "available")
    labels.push("Sponsor visa disebut");
  return labels;
}
