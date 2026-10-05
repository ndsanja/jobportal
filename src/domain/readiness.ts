import { type ClaimField, isClaimField } from "./claims";
import { expiryWarning } from "./documents";
import { ageOn } from "./profile";

export type ReadinessProfile = {
  birth_date: string | null;
  years_experience: number | null;
  education_level: string | null;
};

export type ReadinessDoc = {
  document_type: string;
  status: "have" | "in_progress" | "missing";
  expires_on: string | null;
};

export type ReadinessStatus =
  | "met"
  | "unmet"
  | "unknown"
  | "in_progress"
  | "manual";

export type RequirementResult = { status: ReadinessStatus; detail: string };

const EDUCATION_ORDER = ["sma", "d3", "d4", "s1", "s2", "s3"];
const ENGLISH_DOC: Record<string, string> = {
  IELTS: "ielts",
  TOEFL_IBT: "toefl_ibt",
  PTE: "pte",
  TOEFL_ITP: "toefl_itp",
};

type Claim = { field: string; value: unknown };

/** Menilai satu syarat terhadap profil & dokumen pengguna. Tidak pernah menebak: data kurang → "unknown". */
export function evaluateRequirement(
  claim: Claim,
  profile: ReadinessProfile,
  docs: ReadinessDoc[],
  now: Date,
): RequirementResult {
  if (!isClaimField(claim.field))
    return { status: "manual", detail: "Cek manual" };
  const field: ClaimField = claim.field;
  const value = claim.value as Record<string, unknown>;
  const doc = (type: string) => docs.find((d) => d.document_type === type);

  switch (field) {
    case "requirement.age": {
      if (!profile.birth_date)
        return { status: "unknown", detail: "Isi tanggal lahir di profil" };
      const age = ageOn(profile.birth_date, now);
      const min = value.min as number | null;
      const max = value.max as number | null;
      const ok = (min === null || age >= min) && (max === null || age <= max);
      return {
        status: ok ? "met" : "unmet",
        detail: `Usia Anda saat ini ${age} tahun`,
      };
    }
    case "requirement.english": {
      const tests =
        (value.tests as Array<{ test: string; min_overall: number | null }>) ??
        [];
      const mapped = tests
        .map((t) => ({ ...t, docType: ENGLISH_DOC[t.test] }))
        .filter((t) => t.docType);
      if (mapped.length === 0)
        return {
          status: "manual",
          detail: "Cek bukti bahasa Inggris yang diterima",
        };
      const mine = mapped
        .map((t) => ({ t, d: doc(t.docType as string) }))
        .filter((x) => x.d);
      const have = mine.find(
        (x) =>
          x.d?.status === "have" &&
          expiryWarning(x.d.expires_on, now, 0) !== "expired",
      );
      if (have) {
        const score =
          have.t.min_overall !== null
            ? ` dengan skor minimal ${have.t.min_overall}`
            : "";
        return {
          status: "manual",
          detail: `Anda punya ${have.t.test}; pastikan memenuhi syarat${score}`,
        };
      }
      if (mine.some((x) => x.d?.status === "in_progress"))
        return { status: "in_progress", detail: "Tes bahasa sedang diurus" };
      if (mine.length > 0)
        return {
          status: "unmet",
          detail: "Belum punya sertifikat bahasa Inggris yang berlaku",
        };
      return {
        status: "unknown",
        detail: "Catat status sertifikat bahasa Inggris di Dokumen",
      };
    }
    case "requirement.document": {
      const type = String(value.doc_type);
      const d = doc(type);
      if (!d) return { status: "unknown", detail: "Belum dicatat di Dokumen" };
      if (d.status === "in_progress")
        return { status: "in_progress", detail: "Sedang diurus" };
      if (d.status === "missing")
        return { status: "unmet", detail: "Belum punya" };
      if (expiryWarning(d.expires_on, now, 0) === "expired")
        return { status: "unmet", detail: "Sudah kedaluwarsa" };
      return {
        status: "met",
        detail:
          expiryWarning(d.expires_on, now) === "expiring"
            ? "Ada, tetapi segera kedaluwarsa"
            : "Ada",
      };
    }
    case "requirement.funds":
      return {
        status: "manual",
        detail: `Siapkan bukti dana ${String(value.currency)} ${Number(value.amount).toLocaleString("id-ID")}`,
      };
    case "requirement.experience_years": {
      if (profile.years_experience === null)
        return { status: "unknown", detail: "Isi pengalaman kerja di profil" };
      const ok = profile.years_experience >= Number(value.min);
      return {
        status: ok ? "met" : "unmet",
        detail: `Pengalaman Anda ${profile.years_experience} tahun`,
      };
    }
    case "requirement.education": {
      if (!profile.education_level)
        return {
          status: "unknown",
          detail: "Isi pendidikan terakhir di profil",
        };
      const ok =
        EDUCATION_ORDER.indexOf(profile.education_level) >=
        EDUCATION_ORDER.indexOf(String(value.min_level));
      return {
        status: ok ? "met" : "unmet",
        detail: `Pendidikan Anda ${profile.education_level.toUpperCase()}`,
      };
    }
    case "requirement.nationality": {
      const ok = (value.countries as string[]).includes("ID");
      return {
        status: ok ? "met" : "unmet",
        detail: ok ? "Terbuka untuk WNI" : "Tidak terbuka untuk WNI",
      };
    }
    default:
      return { status: "manual", detail: "Cek manual" };
  }
}

export type ReadinessSummary = Record<ReadinessStatus, number> & {
  percent: number | null;
};

/** Persentase kesiapan = syarat terpenuhi / semua syarat yang bisa dinilai (cek manual tidak dihitung). */
export function summarizeReadiness(
  results: RequirementResult[],
): ReadinessSummary {
  const summary: ReadinessSummary = {
    met: 0,
    unmet: 0,
    unknown: 0,
    in_progress: 0,
    manual: 0,
    percent: null,
  };
  for (const result of results) summary[result.status] += 1;
  const scored =
    summary.met + summary.unmet + summary.unknown + summary.in_progress;
  summary.percent =
    scored === 0 ? null : Math.round((summary.met / scored) * 100);
  return summary;
}
