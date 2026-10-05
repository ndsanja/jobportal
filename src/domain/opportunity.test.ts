import { describe, expect, it } from "vitest";
import { resolveCountry } from "./countries";
import {
  computeConfidence,
  damaMentioned,
  dedupeKey,
  deriveTracks,
  detectSignals,
  displayState,
  sponsorshipSignal,
  whvSignal,
} from "./opportunity";
import { excerpt, htmlToText, normalizeOrgName, slugify } from "./text";

describe("text", () => {
  it("menormalkan nama organisasi tanpa akhiran badan usaha", () => {
    expect(normalizeOrgName("Müller & Söhne GmbH")).toBe("muller sohne");
    expect(normalizeOrgName("Orchard Farms Pty Ltd")).toBe("orchard farms");
  });

  it("membuat slug ASCII yang dipotong rapi", () => {
    expect(slugify("Farm Hand — Cairns, QLD!")).toBe("farm-hand-cairns-qld");
    expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(80);
  });

  it("mengubah HTML yang di-escape (gaya Greenhouse) menjadi teks", () => {
    const html =
      "&lt;p&gt;Kami mencari &lt;strong&gt;Farm Hand&lt;/strong&gt; &amp; packer.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Visa OK&lt;/li&gt;&lt;/ul&gt;";
    expect(htmlToText(html)).toBe("Kami mencari Farm Hand & packer.\nVisa OK");
  });

  it("memotong ringkasan di batas kata", () => {
    const text = "satu dua tiga empat lima enam tujuh delapan sembilan sepuluh";
    const result = excerpt(text, 30);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(31);
    expect(excerpt("pendek", 30)).toBe("pendek");
  });
});

describe("resolveCountry", () => {
  it("mengenali nama negara di teks lokasi", () => {
    expect(resolveCountry("Berlin, Germany", null)).toBe("DE");
    expect(resolveCountry("Sydney NSW, Australia", null)).toBe("AU");
    expect(resolveCountry("Remote - United Kingdom", null)).toBe("GB");
  });

  it("memakai fallback bila tidak ada nama negara", () => {
    expect(resolveCountry("Cairns, QLD", "AU")).toBe("AU");
    expect(resolveCountry(null, null)).toBeNull();
  });

  it("tidak salah cocok pada kata yang hanya mengandung singkatan", () => {
    expect(resolveCountry("Business Analyst, Austin", null)).toBeNull();
  });
});

describe("dedupeKey", () => {
  const base = { kind: "job", countryCode: "AU", city: "Cairns" } as const;

  it("sama untuk variasi huruf, spasi, dan akhiran badan usaha", () => {
    const a = dedupeKey({
      ...base,
      organizationName: "Orchard Farms Pty Ltd",
      title: "Farm Hand ",
    });
    const b = dedupeKey({
      ...base,
      organizationName: "orchard farms",
      title: "farm  hand",
    });
    expect(a).toBe(b);
  });

  it("berbeda bila kota berbeda", () => {
    const a = dedupeKey({ ...base, organizationName: "X", title: "Farm Hand" });
    const b = dedupeKey({
      ...base,
      city: "Perth",
      organizationName: "X",
      title: "Farm Hand",
    });
    expect(a).not.toBe(b);
  });
});

describe("whvSignal", () => {
  it("explicit bila iklan menyebut working holiday / 88 days", () => {
    expect(
      whvSignal("Fruit Picker", "Working holiday visa holders welcome"),
    ).toBe("explicit");
    expect(whvSignal("Packer", "Great for 88 days regional work")).toBe(
      "explicit",
    );
  });

  it("likely hanya dari judul kerja kasual/musiman", () => {
    expect(whvSignal("Kitchen Hand", "Busy cafe")).toBe("likely");
    expect(whvSignal("Senior Accountant", "Busy cafe group")).toBe("unknown");
  });

  it("unsuitable bila hanya untuk warga negara / PR, dan menang atas sinyal lain", () => {
    expect(
      whvSignal("Farm Hand", "Australian citizens or permanent residents only"),
    ).toBe("unsuitable");
    expect(
      whvSignal("Cleaner", "Backpackers welcome. Security clearance required."),
    ).toBe("unsuitable");
  });
});

describe("sponsorshipSignal & DAMA", () => {
  it("mendeteksi sponsor tersedia", () => {
    expect(
      sponsorshipSignal(
        "Visa sponsorship is available for the right candidate",
      ),
    ).toBe("available");
    expect(
      sponsorshipSignal("This role is eligible for a subclass 482 visa"),
    ).toBe("available");
  });

  it("mendeteksi sponsor tidak tersedia", () => {
    expect(
      sponsorshipSignal("Sorry, we are unable to offer visa sponsorship"),
    ).toBe("none");
    expect(sponsorshipSignal("No sponsorship available")).toBe("none");
  });

  it("tidak menebak bila tidak disebut", () => {
    expect(
      sponsorshipSignal("Great team, competitive pay of $482 per week"),
    ).toBe("unknown");
  });

  it("DAMA hanya jika disebut", () => {
    expect(damaMentioned("Positions under the Northern Territory DAMA")).toBe(
      true,
    );
    expect(damaMentioned("Designated Area Migration Agreement role")).toBe(
      true,
    );
    expect(damaMentioned("Contact Dama Perera for details")).toBe(false);
    expect(damaMentioned("Regional chef role")).toBe(false);
  });
});

describe("deriveTracks", () => {
  const signals = (
    whv: "explicit" | "likely" | "unsuitable" | "unknown",
    dama = false,
  ) => ({
    whv_signal: whv,
    sponsorship: "unknown" as const,
    dama_mentioned: dama,
  });

  it("mempertahankan WHV untuk lowongan AU yang cocok", () => {
    expect(deriveTracks(["whv_au"], "AU", signals("likely"))).toEqual([
      "whv_au",
    ]);
  });

  it("melepas WHV bila tanpa bukti, tidak cocok, atau di luar Australia; jatuh ke professional", () => {
    expect(deriveTracks(["whv_au"], "AU", signals("unknown"))).toEqual([
      "professional",
    ]);
    expect(deriveTracks(["whv_au"], "AU", signals("unsuitable"))).toEqual([
      "professional",
    ]);
    expect(deriveTracks(["whv_au"], "NZ", signals("explicit"))).toEqual([
      "professional",
    ]);
  });

  it("menambah DAMA hanya untuk AU dan bila disebut eksplisit", () => {
    expect(
      deriveTracks(["professional"], "AU", signals("unknown", true)),
    ).toEqual(["professional", "dama_au"]);
    expect(
      deriveTracks(["professional"], "DE", signals("unknown", true)),
    ).toEqual(["professional"]);
  });

  it("detectSignals menggabungkan semua sinyal", () => {
    const result = detectSignals({
      title: "Chef",
      descriptionText: "DAMA position. Visa sponsorship available.",
    });
    expect(result).toEqual({
      whv_signal: "unknown",
      sponsorship: "available",
      dama_mentioned: true,
    });
  });
});

describe("computeConfidence", () => {
  it("mengikuti trust score dan faktor metode", () => {
    expect(computeConfidence({ trustScore: 65, method: "api" })).toBe(65);
    expect(computeConfidence({ trustScore: 90, method: "monitor" })).toBe(81);
    expect(
      computeConfidence({
        trustScore: 90,
        method: "ats",
        corroboratingSources: 1,
      }),
    ).toBe(95);
    expect(
      computeConfidence({
        trustScore: 99,
        method: "api",
        corroboratingSources: 2,
      }),
    ).toBe(100);
  });
});

describe("displayState", () => {
  const now = new Date("2026-10-05T00:00:00Z");
  const days = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  const base = {
    kind: "job",
    status: "open",
    verificationStatus: "aggregated",
    closesAt: null,
    now,
  } as const;

  it("closed untuk status tutup atau deadline lewat", () => {
    expect(
      displayState({ ...base, status: "closed", lastVerifiedAt: days(1) }),
    ).toBe("closed");
    expect(
      displayState({ ...base, closesAt: days(1), lastVerifiedAt: days(1) }),
    ).toBe("closed");
  });

  it("needs_review untuk data awal yang belum diverifikasi (kecuali sudah ditutup)", () => {
    expect(
      displayState({
        ...base,
        verificationStatus: "needs_review",
        lastVerifiedAt: days(1),
      }),
    ).toBe("needs_review");
    expect(
      displayState({
        ...base,
        verificationStatus: "needs_review",
        closesAt: days(1),
        lastVerifiedAt: days(1),
      }),
    ).toBe("closed");
  });

  it("stale bila lewat SLA (lowongan 7 hari)", () => {
    expect(displayState({ ...base, lastVerifiedAt: days(8) })).toBe("stale");
    expect(displayState({ ...base, lastVerifiedAt: days(6) })).toBe(
      "aggregated",
    );
  });

  it("beasiswa: SLA 30 hari, menjadi 7 hari bila deadline < 60 hari", () => {
    const scholarship = {
      ...base,
      kind: "scholarship",
      verificationStatus: "verified",
    } as const;
    expect(displayState({ ...scholarship, lastVerifiedAt: days(20) })).toBe(
      "verified",
    );
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(
      displayState({
        ...scholarship,
        closesAt: soon,
        lastVerifiedAt: days(20),
      }),
    ).toBe("stale");
  });
});
