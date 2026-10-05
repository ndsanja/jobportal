import {
  CLAIM_FIELD_NAMES,
  type ClaimField,
  isClaimField,
  parseClaimValue,
} from "@/domain/claims";
import { DOCUMENT_TYPE_CODES } from "@/domain/documents";
import { findPageDate } from "@/domain/page-date";
import {
  evidenceInText,
  type Rejection,
} from "@/domain/scholarship-extraction";
import { callJsonModel, type FetchLike } from "@/server/ai/json-call";

export const RESEARCH_PROMPT_VERSION = "claims-v2";

export type CandidateClaim = {
  field: ClaimField;
  value: unknown;
  summary: string;
  evidence: string;
};

export type PageMeta = {
  /** Halaman memang membahas subjek (bukan visa/program/negara lain). */
  aboutSubject: boolean;
  /** Apakah isinya berlaku bagi pemohon dari Indonesia. */
  indonesia: "yes" | "general" | "no";
  /** Tanggal pembaruan halaman (YYYY-MM-DD) hanya bila tertulis di teks. */
  lastUpdated: string | null;
  /** Halaman menyatakan dirinya usang/diarsipkan/digantikan. */
  outdated: boolean;
  note: string;
};

const SYSTEM_PROMPT = `Anda adalah mesin pengekstrak FAKTA dari teks satu halaman web untuk sebuah subjek (program/visa/beasiswa). Balas HANYA dengan satu objek JSON.

Prinsip: akurasi di atas kelengkapan. Lebih baik melewatkan fakta daripada memuat fakta yang salah, usang, atau milik negara/program lain.

Aturan ketat:
1. Gunakan hanya informasi yang tertulis di teks. Jangan menebak atau memakai pengetahuan di luar teks.
2. Ekstrak hanya fakta untuk SUBJEK yang disebutkan dan BERLAKU bagi pemohon paspor/warga Indonesia. Bila halaman membedakan per negara (mis. ada daftar negara, ballot untuk negara tertentu, tabel per kebangsaan), ambil hanya baris/aturan untuk Indonesia atau yang berlaku umum bagi semua negara. Lewati aturan khusus negara lain.
3. Perhatikan waktu. "Hari ini" diberikan. Lewati fakta yang di teks dinyatakan sudah lewat/dicabut/berlaku sampai tanggal yang telah lewat. Jika halaman sendiri menyatakan arsip/usang/digantikan, set page.outdated=true dan jangan ekstrak klaim.
4. Setiap klaim WAJIB punya "evidence": salinan PERSIS (kata per kata) satu kalimat/frasa dari teks yang secara langsung memuat fakta itu. Jangan menggabung dua bagian teks.
5. Satu klaim = satu fakta. Pisahkan fakta berbeda. Jangan mengulang fakta yang sama dengan kalimat berbeda dalam satu halaman.
6. Jika ragu apakah fakta berlaku untuk Indonesia atau masih berlaku, JANGAN ekstrak.

Objek "page":
- about_subject: true/false — halaman benar-benar membahas subjek.
- applies_to_indonesia: "yes" (menyebut Indonesia secara khusus), "general" (berlaku umum tanpa membedakan negara), atau "no" (khusus negara lain).
- last_updated: tanggal "YYYY-MM-DD" HANYA bila halaman menuliskan tanggal pembaruan/terbit/berlaku (mis. "Last updated", "Page last updated", "Diperbarui"); selain itu null.
- last_updated_evidence: salinan persis teks tanggal itu, atau null.
- outdated: true bila halaman menyatakan dirinya usang/diarsipkan/digantikan.
- note: satu kalimat tentang jenis halaman (maks 150 karakter).

Bidang klaim dan bentuk "value":
- requirement.age: {"min": angka atau null, "max": angka atau null}
- requirement.english: {"tests": [{"test": "IELTS|TOEFL_IBT|PTE|TOEFL_ITP|OTHER", "min_overall": angka atau null}], "note": "opsional"}
- requirement.document: {"doc_type": "<kode>", "note": "opsional"}  kode: ${DOCUMENT_TYPE_CODES.join(", ")}
- requirement.funds: {"amount": angka, "currency": "AUD"}
- requirement.experience_years: {"min": angka}
- requirement.education: {"min_level": "sma|d3|d4|s1|s2|s3"}
- requirement.nationality: {"countries": ["ID"]}
- requirement.other: {"text": "syarat pemohon lain (kesehatan, karakter, tanpa tanggungan, dsb.)"}
- process.application_mode: {"mode": "ballot|open|invitation_only|other", "note": "opsional"} — cara pemohon dari Indonesia masuk ke proses (mis. wajib ikut ballot/undian dulu atau langsung mengajukan).
- process.ballot: {"text": "detail ballot: pendaftaran, jadwal, undangan, batas waktu, biaya ballot, jumlah kuota"}
- process.step: {"text": "satu tahap proses pengajuan, urut jika ada"}
- process.timeline: {"text": "tanggal/jangka waktu penting: pembukaan, penutupan, lama proses, masa berlaku"}
- fee.application: {"amount": angka, "currency": "AUD", "note": "opsional, mis. biaya visa/biaya ballot"}
- condition.stay: {"text": "ketentuan setelah visa diberikan: batas kerja per pemberi kerja, lama tinggal, kondisi visa"}

Format keluaran:
{"page": {"about_subject": true, "applies_to_indonesia": "general", "last_updated": null, "last_updated_evidence": null, "outdated": false, "note": "..."},
 "claims": [{"field": "requirement.age", "value": {"min": 18, "max": 30}, "summary": "Ringkasan Bahasa Indonesia (maks 200 karakter)", "evidence": "kutipan persis dari teks", "applies_to": "indonesia|general"}]}`;

export type ClaimExtraction =
  | {
      ok: true;
      claims: CandidateClaim[];
      rejected: Rejection[];
      page: PageMeta;
      model: string;
    }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Memvalidasi metadata halaman dari model; tanggal hanya dipakai bila kutipannya ada di teks. */
export function parsePageMeta(
  json: unknown,
  pageText: string,
  now: Date,
): PageMeta {
  const raw = ((json as { page?: unknown } | null)?.page ?? {}) as Record<
    string,
    unknown
  >;
  const indonesia =
    raw.applies_to_indonesia === "yes" || raw.applies_to_indonesia === "no"
      ? raw.applies_to_indonesia
      : "general";
  let lastUpdated: string | null = null;
  if (
    typeof raw.last_updated === "string" &&
    DATE_RE.test(raw.last_updated) &&
    typeof raw.last_updated_evidence === "string" &&
    evidenceInText(raw.last_updated_evidence, pageText)
  ) {
    const time = Date.parse(raw.last_updated);
    if (!Number.isNaN(time) && time <= now.getTime())
      lastUpdated = raw.last_updated;
  }
  // Tanggal yang ditemukan secara deterministik di teks lebih dipercaya daripada keluaran model.
  lastUpdated = findPageDate(pageText, now) ?? lastUpdated;
  return {
    aboutSubject: raw.about_subject !== false,
    indonesia,
    lastUpdated,
    outdated: raw.outdated === true,
    note: typeof raw.note === "string" ? raw.note.slice(0, 150) : "",
  };
}

/** Memvalidasi satu daftar mentah klaim: bidang, bentuk nilai, kode dokumen, dan kutipan bukti. */
export function validateClaims(
  json: unknown,
  pageText: string,
  allowedFields: ClaimField[],
): { claims: CandidateClaim[]; rejected: Rejection[] } | { error: string } {
  const list = (json as { claims?: unknown } | null)?.claims;
  if (!Array.isArray(list))
    return { error: 'Objek harus memuat larik "claims"' };

  const claims: CandidateClaim[] = [];
  const rejected: Rejection[] = [];

  list.slice(0, 40).forEach((raw, index) => {
    const path = `claims.${index}`;
    const item = raw as {
      field?: unknown;
      value?: unknown;
      summary?: unknown;
      evidence?: unknown;
      applies_to?: unknown;
    };
    if (
      item.applies_to !== undefined &&
      item.applies_to !== "indonesia" &&
      item.applies_to !== "general"
    ) {
      rejected.push({ path, reason: "Tidak berlaku untuk Indonesia" });
      return;
    }
    if (
      typeof item.field !== "string" ||
      !isClaimField(item.field) ||
      !allowedFields.includes(item.field)
    ) {
      rejected.push({ path, reason: "Bidang tidak diizinkan" });
      return;
    }
    if (
      typeof item.evidence !== "string" ||
      !evidenceInText(item.evidence, pageText)
    ) {
      rejected.push({
        path,
        reason: "Kutipan bukti tidak ditemukan di halaman",
      });
      return;
    }
    const value = parseClaimValue(item.field, item.value);
    if (!value.ok) {
      rejected.push({ path, reason: `Nilai tidak valid: ${value.error}` });
      return;
    }
    if (item.field === "requirement.document") {
      const code = (value.value as { doc_type: string }).doc_type;
      if (!(DOCUMENT_TYPE_CODES as readonly string[]).includes(code)) {
        rejected.push({ path, reason: `Kode dokumen tidak dikenal: ${code}` });
        return;
      }
    }
    const summary =
      typeof item.summary === "string" ? item.summary.trim().slice(0, 300) : "";
    if (summary.length < 5) {
      rejected.push({ path, reason: "Ringkasan kosong" });
      return;
    }
    claims.push({
      field: item.field,
      value: value.value,
      summary,
      evidence: item.evidence.trim().slice(0, 600),
    });
  });

  return { claims, rejected };
}

/** Meminta model mengekstrak klaim dari satu halaman; semua klaim tervalidasi sebelum dikembalikan. */
export async function extractClaims(
  pageText: string,
  subject: { description: string; fields?: ClaimField[] },
  deps: { apiKey: string; model: string; fetch?: FetchLike; now?: Date },
): Promise<ClaimExtraction> {
  const now = deps.now ?? new Date();
  const fields = subject.fields?.length ? subject.fields : CLAIM_FIELD_NAMES;

  const result = await callJsonModel(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Subjek: ${subject.description}\nHari ini: ${now.toISOString().slice(0, 10)}\n\nTEKS HALAMAN:\n"""\n${pageText}\n"""`,
      },
    ],
    {
      apiKey: deps.apiKey,
      model: deps.model,
      fetch: deps.fetch,
      maxTokens: 6000,
    },
    (json) => {
      const checked = validateClaims(json, pageText, fields);
      return "error" in checked
        ? { ok: false, error: checked.error }
        : {
            ok: true,
            value: { ...checked, page: parsePageMeta(json, pageText, now) },
          };
    },
  );

  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    claims: result.value.claims,
    rejected: result.value.rejected,
    page: result.value.page,
    model: deps.model,
  };
}
