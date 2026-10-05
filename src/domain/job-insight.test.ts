import { describe, expect, it } from "vitest";
import { validateInsight } from "./job-insight";

const text =
  "Farm hand wanted in Mildura. Working holiday makers welcome. Must hold a current driver licence. Visa sponsorship is available for the right candidate.";

describe("validateInsight", () => {
  it("menerima penilaian berkutipan dan membuang kutipan karangan", () => {
    const insight = validateInsight(
      {
        wni: "likely",
        reasons: [
          {
            text: "Pemegang WHV dipersilakan melamar",
            quote: "Working holiday makers welcome",
          },
          { text: "Alasan karangan", quote: "Indonesians preferred" },
        ],
        pathways: ["whv_462", "employer_sponsored", "teleport"],
        sponsorship: "offered",
        requires_local_work_rights: false,
        requirements: [
          {
            text: "SIM yang berlaku",
            quote: "Must hold a current driver licence",
          },
          { text: "Tanpa kutipan", quote: null },
        ],
        summary: "Pekerja kebun di Mildura; pemegang WHV dipersilakan.",
      },
      { text, signals: { whv_signal: "explicit", sponsorship: "available" } },
    );
    expect(insight?.wni).toBe("likely");
    expect(insight?.reasons).toEqual([
      {
        text: "Pemegang WHV dipersilakan melamar",
        quote: "Working holiday makers welcome",
      },
      { text: "Alasan karangan", quote: null },
    ]);
    expect(insight?.pathways).toEqual(["whv_462", "employer_sponsored"]);
    expect(insight?.requirements).toHaveLength(1);
  });

  it("kesimpulan tegas tanpa kutipan diturunkan", () => {
    const insight = validateInsight(
      {
        wni: "unlikely",
        reasons: [{ text: "Sepertinya untuk warga lokal" }],
        summary: "Lowongan staf kantor di Sydney.",
      },
      { text: "Office staff in Sydney.", signals: {} },
    );
    expect(insight?.wni).toBe("unknown");
  });

  it("sinyal deterministik mengoreksi model", () => {
    const blocked = validateInsight(
      { wni: "likely", reasons: [], summary: "Analis keamanan di Canberra." },
      {
        text: "Must be an Australian citizen with baseline clearance.",
        signals: { whv_signal: "unsuitable" },
      },
    );
    expect(blocked?.wni).toBe("unlikely");
    expect(blocked?.sponsorship).toBe("not_offered");

    const open = validateInsight(
      {
        wni: "unknown",
        reasons: [],
        summary: "Koki di Darwin dengan sponsor visa.",
      },
      {
        text: "Chef role, visa sponsorship available.",
        signals: { sponsorship: "available" },
      },
    );
    expect(open?.wni).toBe("likely");
  });

  it("menolak keluaran tanpa ringkasan atau label tidak dikenal", () => {
    expect(
      validateInsight(
        { wni: "maybe", summary: "x".repeat(20) },
        { text, signals: {} },
      ),
    ).toBeNull();
    expect(
      validateInsight({ wni: "possible", summary: "" }, { text, signals: {} }),
    ).toBeNull();
  });
});
