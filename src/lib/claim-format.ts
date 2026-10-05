import { STUDY_LEVEL_LABEL } from "./labels";

/** Label Bahasa Indonesia untuk nilai klaim terstruktur (dipakai tabel perbandingan & ringkasan). */

const FUNDING_TYPE: Record<string, string> = {
  full: "Penuh",
  partial: "Parsial",
  tuition: "Biaya kuliah saja",
  stipend: "Tunjangan saja",
  varies: "Bervariasi per program",
};

const COVERAGE: Record<string, string> = {
  tuition: "biaya kuliah",
  living_allowance: "tunjangan hidup",
  accommodation: "akomodasi",
  flight: "tiket pesawat",
  insurance: "asuransi",
  settlement: "tunjangan kedatangan",
  research: "dana riset",
  language_course: "kursus bahasa",
  book: "buku",
  visa: "biaya visa",
  other: "lainnya",
};

const PERIOD: Record<string, string> = {
  once: "sekali",
  month: "bulan",
  year: "tahun",
};

const TESTS: Record<string, string> = {
  IELTS: "IELTS",
  TOEFL_IBT: "TOEFL iBT",
  TOEFL_ITP: "TOEFL ITP",
  PTE: "PTE",
  OTHER: "Tes lain",
};

const MODE: Record<string, string> = {
  ballot: "Ballot (undian) dulu",
  open: "Daftar langsung",
  invitation_only: "Hanya lewat undangan",
  nomination: "Lewat nominasi",
  other: "Cara khusus",
};

const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const money = (amount: unknown, currency: unknown) =>
  `${String(currency)} ${number.format(Number(amount))}`;

type V = Record<string, unknown>;

export function formatClaimValue(field: string, raw: unknown): string {
  const v = (raw ?? {}) as V;
  switch (field) {
    case "eligibility.indonesia":
      return v.eligible === true ? "Ya" : "Tidak";
    case "requirement.age": {
      const min = v.min as number | null;
      const max = v.max as number | null;
      if (min !== null && max !== null) return `${min}–${max} tahun`;
      return min !== null ? `min. ${min} tahun` : `maks. ${max} tahun`;
    }
    case "requirement.english":
      return ((v.tests as V[] | undefined) ?? [])
        .map(
          (t) =>
            `${TESTS[String(t.test)] ?? String(t.test)}${t.min_overall != null ? ` ${number.format(Number(t.min_overall))}` : ""}`,
        )
        .join(" / ");
    case "requirement.gpa":
      return `${number.format(Number(v.min))} / ${number.format(Number(v.scale))}`;
    case "requirement.experience_years":
      return `min. ${number.format(Number(v.min))} tahun`;
    case "requirement.education":
      return `min. ${String(v.min_level).toUpperCase()}`;
    case "requirement.funds":
    case "fee.application":
      return money(v.amount, v.currency);
    case "benefit.amount":
      return `${money(v.amount, v.currency)}${v.period ? ` / ${PERIOD[String(v.period)] ?? v.period}` : ""}${v.label ? ` (${String(v.label)})` : ""}`;
    case "funding.type":
      return FUNDING_TYPE[String(v.type)] ?? String(v.type);
    case "funding.coverage":
      return COVERAGE[String(v.item)] ?? String(v.item);
    case "study.level":
      return STUDY_LEVEL_LABEL[String(v.level)] ?? String(v.level);
    case "program.quota":
      return `${number.format(Number(v.count))} penerima`;
    case "process.application_mode":
      return MODE[String(v.mode)] ?? String(v.mode);
    case "schedule.event":
      return `${String(v.label)} — ${String(v.date)}`;
    default:
      return typeof v.text === "string" ? v.text : JSON.stringify(raw);
  }
}
