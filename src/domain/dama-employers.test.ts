import { describe, expect, it } from "vitest";
import {
  damaAdQuote,
  isVerifiedEmployer,
  pickFollowLinks,
  validateDamaEmployers,
} from "./dama-employers";

const page = {
  text: "Businesses with a DAMA labour agreement in the Great South Coast include Midfield Meat International and Warrnambool Cheese & Butter. Other news: Acme Bakery opened a new store.",
  links: [
    { text: "Midfield", url: "https://www.midfieldgroup.com.au/" },
    { text: "Careers", url: "https://jobs.smartrecruiters.com/MidfieldGroup" },
  ],
};

describe("validateDamaEmployers", () => {
  it("menerima perusahaan yang disebut dalam kutipan DAMA dan memetakan tautan", () => {
    const result = validateDamaEmployers(
      {
        employers: [
          {
            name: "Midfield Meat International",
            dama_region: "Great South Coast",
            industry: "Meat processing",
            website_link: 1,
            careers_link: 2,
            evidence:
              "Businesses with a DAMA labour agreement in the Great South Coast include Midfield Meat International",
          },
          {
            name: "Acme Bakery",
            evidence:
              "Businesses with a DAMA labour agreement in the Great South Coast include Midfield Meat International",
          },
          { name: "Karangan Pty Ltd", evidence: "kutipan yang tidak ada" },
        ],
      },
      page,
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.employers).toHaveLength(1);
    expect(result.employers[0]).toMatchObject({
      nameKey: "midfield meat international",
      careersUrl: "https://jobs.smartrecruiters.com/MidfieldGroup",
    });
    expect(result.rejected.map((r) => r.reason)).toEqual([
      "Kutipan tidak menyebut nama perusahaan",
      "Kutipan tidak ditemukan di halaman",
    ]);
  });

  it("halaman tanpa konteks DAMA tidak menghasilkan apa pun", () => {
    const result = validateDamaEmployers(
      {
        employers: [
          { name: "Acme", evidence: "Acme Bakery opened a new store" },
        ],
      },
      { text: "Acme Bakery opened a new store.", links: [] },
    );
    expect(result).toEqual({ employers: [], rejected: [] });
  });
});

describe("isVerifiedEmployer", () => {
  it("resmi atau dua domain independen", () => {
    expect(
      isVerifiedEmployer([{ url: "https://nt.gov.au/x", tier: "official" }]),
    ).toBe(true);
    expect(
      isVerifiedEmployer([{ url: "https://a.com/x", tier: "community" }]),
    ).toBe(false);
    expect(
      isVerifiedEmployer([
        { url: "https://a.com/x", tier: "community" },
        { url: "https://b.com/y", tier: "community" },
      ]),
    ).toBe(true);
  });
});

describe("pickFollowLinks", () => {
  it("mengikuti tautan pemberi kerja/sponsor di domain yang sama saja", () => {
    const links = [
      {
        text: "DAMA endorsed employers",
        url: "https://dama.example.gov.au/employers#top",
      },
      { text: "Privacy", url: "https://dama.example.gov.au/privacy" },
      { text: "Become a sponsor", url: "https://other.com/sponsors" },
      {
        text: "Read more",
        url: "https://dama.example.gov.au/business-case-studies",
      },
      { text: "Guide", url: "https://dama.example.gov.au/guide.pdf" },
      { text: "Home", url: "https://dama.example.gov.au/" },
    ];
    expect(pickFollowLinks(links, "https://dama.example.gov.au/", 5)).toEqual([
      "https://dama.example.gov.au/employers",
      "https://dama.example.gov.au/business-case-studies",
    ]);
  });
});

describe("damaAdQuote", () => {
  it("mengambil kalimat iklan yang menyebut DAMA", () => {
    expect(
      damaAdQuote(
        "Great pay. Visa Sponsorship Available Under DAMA for the Right Candidate. Apply now.",
      ),
    ).toBe("Visa Sponsorship Available Under DAMA for the Right Candidate.");
    expect(damaAdQuote("Kitchen hand, Adama Street, Darwin.")).toBeNull();
    expect(
      damaAdQuote(
        "Community Pharmacist – Cairns, Far North QLD Full-Time Visa Sponsorship (incl. DAMA options) – Relocation Assistance",
      ),
    ).toBe(
      "Community Pharmacist – Cairns, Far North QLD Full-Time Visa Sponsorship (incl. DAMA options) – Relocation Assistance",
    );
    const long = damaAdQuote(
      `${"word ".repeat(60)}Visa Sponsorship Available Under DAMA for the Right Candidate ${"more ".repeat(60)}`,
    );
    expect(long?.length).toBeLessThan(230);
    expect(long).toContain("Under DAMA for the Right Candidate");
    expect(
      damaAdQuote("Sponsorship via the Designated Area Migration Agreement"),
    ).toBe("Sponsorship via the Designated Area Migration Agreement");
  });
});

describe("isVerifiedEmployer dengan iklan", () => {
  it("dua iklan lowongan tidak dihitung sebagai dua domain", () => {
    expect(
      isVerifiedEmployer([
        { url: "/lowongan/a", tier: "job_ad" },
        { url: "/lowongan/b", tier: "job_ad" },
      ]),
    ).toBe(false);
  });
});
