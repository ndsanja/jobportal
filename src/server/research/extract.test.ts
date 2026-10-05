import { describe, expect, it, vi } from "vitest";
import { extractClaims, validateClaims } from "./extract";

const page = `Eligibility. You must be aged between 18 and 30 years at the time of application.
You must hold a valid passport. Evidence of AUD 5,000 in funds is required. Applicants need functional English.`;
const fields = [
  "requirement.age",
  "requirement.document",
  "requirement.funds",
  "requirement.english",
] as never;

const good = {
  claims: [
    {
      field: "requirement.age",
      value: { min: 18, max: 30 },
      summary: "Usia 18–30 tahun saat mendaftar",
      evidence: "aged between 18 and 30 years at the time of application",
    },
    {
      field: "requirement.document",
      value: { doc_type: "passport" },
      summary: "Paspor yang masih berlaku",
      evidence: "You must hold a valid passport",
    },
    {
      field: "requirement.funds",
      value: { amount: 5000, currency: "AUD" },
      summary: "Bukti dana AUD 5.000",
      evidence: "Evidence of AUD 5,000 in funds is required",
    },
  ],
};

describe("validateClaims", () => {
  it("menerima klaim valid dengan kutipan yang ada di halaman", () => {
    const result = validateClaims(good, page, fields);
    if ("error" in result) throw new Error(result.error);
    expect(result.claims).toHaveLength(3);
    expect(result.rejected).toEqual([]);
  });

  it("membuang klaim halusinasi, nilai tidak valid, kode dokumen asing, dan bidang tak diizinkan", () => {
    const result = validateClaims(
      {
        claims: [
          {
            field: "requirement.age",
            value: { min: 18, max: 35 },
            summary: "Usia 18–35 tahun",
            evidence: "aged between 18 and 35 years",
          }, // kutipan karangan
          {
            field: "requirement.age",
            value: { min: null, max: null },
            summary: "Usia tidak jelas",
            evidence: "aged between 18 and 30 years",
          },
          {
            field: "requirement.document",
            value: { doc_type: "visa_sakti" },
            summary: "Dokumen aneh",
            evidence: "You must hold a valid passport",
          },
          {
            field: "requirement.english",
            value: { tests: [{ test: "IELTS", min_overall: 4.5 }] },
            summary: "IELTS 4.5",
            evidence: "functional English",
          }, // lolos
          {
            field: "requirement.education",
            value: { min_level: "s1" },
            summary: "Minimal S1",
            evidence: "functional English",
          }, // bidang tak diizinkan
        ],
      },
      page,
      fields,
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.claims.map((c) => c.field)).toEqual(["requirement.english"]);
    expect(result.rejected.map((r) => r.reason)).toEqual([
      "Kutipan bukti tidak ditemukan di halaman",
      expect.stringContaining("Nilai tidak valid"),
      expect.stringContaining("Kode dokumen tidak dikenal"),
      "Bidang tidak diizinkan",
    ]);
  });

  it("menolak keluaran tanpa larik claims", () => {
    expect("error" in validateClaims({ hasil: [] }, page, fields)).toBe(true);
  });
});

describe("extractClaims", () => {
  it("memanggil model sekali dan mengembalikan klaim tervalidasi (kunci hanya di header)", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify(good) } }],
      }),
    );
    const result = await extractClaims(
      page,
      { description: "Visa 462 untuk paspor Indonesia" },
      { apiKey: "rahasia", model: "m", fetch: fetchMock },
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.claims).toHaveLength(3);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(String(init.body)).not.toContain("rahasia");
    expect(String(init.body)).toContain("Visa 462 untuk paspor Indonesia");
  });
});
