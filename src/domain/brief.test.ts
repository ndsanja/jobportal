import { describe, expect, it } from "vitest";
import { validateBrief } from "./brief";

const refs = new Map([
  ["c1", "id-1"],
  ["c2", "id-2"],
]);
const base = {
  headline: "Visa 462 untuk WNI memakai ballot",
  summary:
    "Pemohon paspor Indonesia wajib ikut ballot sebelum mengajukan visa.",
};

describe("validateBrief", () => {
  it("memetakan rujukan ke id klaim dan mengurutkan bagian", () => {
    const result = validateBrief(
      {
        ...base,
        sections: [
          {
            id: "biaya",
            items: [{ text: "Biaya visa AUD 840.", claim_ids: ["c2"] }],
          },
          {
            id: "cara_daftar",
            items: [
              { text: "Ikut ballot lebih dulu.", claim_ids: ["c1", "c1"] },
            ],
          },
        ],
      },
      refs,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sections.map((s) => s.id)).toEqual([
      "cara_daftar",
      "biaya",
    ]);
    expect(result.value.sections[0]?.items[0]?.claim_ids).toEqual(["id-1"]);
  });

  it("membuang butir tanpa rujukan valid (tidak boleh ada fakta tanpa dasar)", () => {
    const result = validateBrief(
      {
        ...base,
        sections: [
          {
            id: "syarat",
            items: [
              { text: "Fakta karangan tanpa dasar.", claim_ids: ["c99"] },
              { text: "Usia 18–30 tahun.", claim_ids: ["c1"] },
            ],
          },
        ],
        uncertainties: [{ text: "Tidak berdasar.", claim_ids: [] }],
      },
      refs,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sections[0]?.items).toHaveLength(1);
    expect(result.value.uncertainties).toHaveLength(0);
  });

  it("gagal bila tidak ada butir yang bersandar pada klaim", () => {
    const result = validateBrief(
      {
        ...base,
        sections: [
          {
            id: "syarat",
            items: [{ text: "Tanpa dasar ya.", claim_ids: ["zz"] }],
          },
        ],
      },
      refs,
    );
    expect(result.ok).toBe(false);
  });

  it("bagian tak dikenal dipindah ke catatan, bukan menggagalkan panduan", () => {
    const result = validateBrief(
      {
        ...base,
        sections: [
          {
            id: "kelayakan",
            items: [{ text: "Untuk wilayah tertentu.", claim_ids: ["c1"] }],
          },
        ],
      },
      refs,
    );
    expect(result.ok && result.value.sections[0]?.id).toBe("catatan");
  });
});
