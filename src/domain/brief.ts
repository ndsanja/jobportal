import { z } from "zod";

/** Bagian panduan, dalam urutan tampil. */
export const BRIEF_SECTIONS = [
  { id: "cara_daftar", heading: "Cara mendaftar & alur" },
  { id: "jadwal", heading: "Jadwal & tenggat" },
  { id: "syarat", heading: "Syarat pemohon" },
  { id: "dokumen", heading: "Dokumen yang disiapkan" },
  { id: "pendanaan", heading: "Pendanaan & manfaat" },
  { id: "program", heading: "Jenjang, bidang & kuota" },
  { id: "biaya", heading: "Biaya" },
  { id: "ketentuan", heading: "Ketentuan & kewajiban" },
  { id: "catatan", heading: "Catatan penting" },
] as const;

export type BriefSectionId = (typeof BRIEF_SECTIONS)[number]["id"];
const SECTION_IDS = BRIEF_SECTIONS.map((s) => s.id) as [
  BriefSectionId,
  ...BriefSectionId[],
];

export type BriefItem = { text: string; claim_ids: string[] };
export type BriefContent = {
  headline: string;
  summary: string;
  sections: Array<{ id: BriefSectionId; items: BriefItem[] }>;
  /** Hal yang belum pasti: laporan belum resmi, pertentangan sumber, data yang belum ditemukan. */
  uncertainties: BriefItem[];
};

const rawItem = z.object({
  text: z.string().min(5).max(500),
  claim_ids: z.array(z.string()).min(1),
});
const rawBrief = z.object({
  headline: z.string().min(5).max(220),
  summary: z.string().min(20).max(900),
  sections: z.array(
    z.object({ id: z.enum(SECTION_IDS), items: z.array(z.unknown()) }),
  ),
  uncertainties: z.array(z.unknown()).default([]),
});

const cleanItems = (
  items: unknown[],
  validRefs: ReadonlyMap<string, string>,
): BriefItem[] =>
  items.flatMap((raw) => {
    const parsed = rawItem.safeParse(raw);
    if (!parsed.success) return [];
    // Setiap kalimat wajib bersandar pada klaim yang benar-benar ada; rujukan tak dikenal dibuang.
    const ids = [
      ...new Set(
        parsed.data.claim_ids.flatMap((ref) => {
          const id = validRefs.get(ref);
          return id ? [id] : [];
        }),
      ),
    ];
    return ids.length > 0
      ? [{ text: parsed.data.text.trim(), claim_ids: ids }]
      : [];
  });

/**
 * Memvalidasi panduan hasil model. `validRefs` memetakan rujukan pendek (mis. "c3") ke id klaim.
 * Kalimat tanpa rujukan valid dibuang, sehingga panduan tidak bisa memuat fakta yang tidak punya dasar.
 */
export function validateBrief(
  json: unknown,
  validRefs: ReadonlyMap<string, string>,
): { ok: true; value: BriefContent } | { ok: false; error: string } {
  const parsed = rawBrief.safeParse(json);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Skema panduan tidak valid",
    };

  const merged = new Map<BriefSectionId, BriefItem[]>();
  for (const section of parsed.data.sections) {
    const items = cleanItems(section.items, validRefs);
    if (items.length > 0)
      merged.set(section.id, [...(merged.get(section.id) ?? []), ...items]);
  }
  const sections = BRIEF_SECTIONS.flatMap(({ id }) => {
    const items = merged.get(id);
    return items ? [{ id, items }] : [];
  });
  if (sections.length === 0)
    return {
      ok: false,
      error: "Panduan tidak memuat butir yang bersandar pada klaim",
    };

  return {
    ok: true,
    value: {
      headline: parsed.data.headline.trim(),
      summary: parsed.data.summary.trim(),
      sections,
      uncertainties: cleanItems(parsed.data.uncertainties, validRefs),
    },
  };
}
