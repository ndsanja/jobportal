import { describe, expect, it } from "vitest";
import {
  type ClaimEvidence,
  classifyTier,
  confidenceFor,
  DEFAULT_REPUTABLE_DOMAINS,
  decideClaims,
  parseClaimValue,
  valueKey,
} from "./claims";

const rules = {
  officialDomains: ["homeaffairs.gov.au", "imigrasi.go.id"],
  reputableDomains: DEFAULT_REPUTABLE_DOMAINS,
};
const ev = (
  domain: string,
  tier: ClaimEvidence["tier"],
  stance: ClaimEvidence["stance"] = "supports",
): ClaimEvidence => ({ domain, tier, stance });

describe("classifyTier", () => {
  it("mengenali domain resmi (daftar eksplisit, subdomain, dan pola pemerintah)", () => {
    expect(classifyTier("https://immi.homeaffairs.gov.au/visas/x", rules)).toBe(
      "official",
    );
    expect(classifyTier("https://www.imigrasi.go.id/info", rules)).toBe(
      "official",
    );
    expect(classifyTier("https://indonesia.embassy.gov.au/jakt/x", rules)).toBe(
      "official",
    );
    expect(
      classifyTier("https://erasmus-plus.ec.europa.eu/x", {
        officialDomains: [],
        reputableDomains: [],
      }),
    ).toBe("official");
  });

  it("tidak tertipu domain yang hanya mengandung nama resmi", () => {
    expect(classifyTier("https://homeaffairs.gov.au.evil.com/x", rules)).toBe(
      "community",
    );
    expect(
      classifyTier("https://fakehomeaffairs.gov.au.example.net/", rules),
    ).toBe("community");
    expect(classifyTier("https://notgov.com/visa", rules)).toBe("community");
  });

  it("sumber tepercaya vs komunitas, dan URL rusak", () => {
    expect(classifyTier("https://www.kompas.com/berita", rules)).toBe(
      "reputable",
    );
    expect(classifyTier("https://blogsaya.wordpress.com/whv", rules)).toBe(
      "community",
    );
    expect(classifyTier("bukan url", rules)).toBe("community");
  });
});

describe("valueKey & parseClaimValue", () => {
  it("nilai sama secara makna menghasilkan kunci sama (urutan key, huruf, catatan diabaikan)", () => {
    expect(valueKey({ min: 18, max: 30 })).toBe(valueKey({ max: 30, min: 18 }));
    expect(valueKey({ doc_type: "Passport", note: "a" })).toBe(
      valueKey({ doc_type: "passport", note: "b" }),
    );
    expect(valueKey({ min: 18, max: 30 })).not.toBe(
      valueKey({ min: 18, max: 35 }),
    );
  });

  it("memvalidasi nilai menurut bidang", () => {
    expect(parseClaimValue("requirement.age", { min: 18, max: 30 }).ok).toBe(
      true,
    );
    expect(
      parseClaimValue("requirement.age", { min: null, max: null }).ok,
    ).toBe(false);
    expect(
      parseClaimValue("requirement.english", {
        tests: [{ test: "IELTS", min_overall: 4.5 }],
      }).ok,
    ).toBe(true);
    expect(parseClaimValue("requirement.english", { tests: [] }).ok).toBe(
      false,
    );
    expect(
      parseClaimValue("requirement.funds", { amount: -5, currency: "AUD" }).ok,
    ).toBe(false);
    expect(parseClaimValue("requirement.bebas", {}).ok).toBe(false);
  });
});

describe("confidenceFor", () => {
  it("resmi ≫ tepercaya ≫ komunitas", () => {
    const official = confidenceFor([
      ev("immi.homeaffairs.gov.au", "official"),
    ]).confidence;
    const reputable = confidenceFor([ev("kompas.com", "reputable")]).confidence;
    const community = confidenceFor([
      ev("blog.example", "community"),
    ]).confidence;
    expect(official).toBeGreaterThanOrEqual(90);
    expect(reputable).toBeLessThan(official);
    expect(community).toBeLessThan(reputable);
  });

  it("domain yang sama tidak dihitung dua kali (independensi)", () => {
    const one = confidenceFor([ev("blog.example", "community")]).confidence;
    const same = confidenceFor([
      ev("blog.example", "community"),
      ev("blog.example", "community"),
    ]).confidence;
    const two = confidenceFor([
      ev("blog.example", "community"),
      ev("lain.example", "community"),
    ]).confidence;
    expect(same).toBe(one);
    expect(two).toBeGreaterThan(one);
  });

  it("bukti yang menyanggah menurunkan keyakinan; tanpa bukti = 0", () => {
    const base = confidenceFor([ev("kompas.com", "reputable")]).confidence;
    const contested = confidenceFor([
      ev("kompas.com", "reputable"),
      ev("immi.homeaffairs.gov.au", "official", "contradicts"),
    ]).confidence;
    expect(contested).toBeLessThan(base);
    expect(confidenceFor([]).confidence).toBe(0);
  });
});

describe("decideClaims", () => {
  const official = {
    key: "a",
    evidence: [ev("immi.homeaffairs.gov.au", "official")],
  };

  it("nilai dengan sumber resmi diterima (accepted)", () => {
    expect(decideClaims([official])[0]).toMatchObject({
      key: "a",
      status: "accepted",
    });
  });

  it("hanya komunitas lemah → proposed (tersembunyi); ≥3 domain independen → disputed (tampil berlabel)", () => {
    const weak = {
      key: "b",
      evidence: [ev("a.example", "community"), ev("b.example", "community")],
    };
    expect(decideClaims([weak])[0]?.status).toBe("proposed");
    const strongCommunity = {
      key: "c",
      evidence: [
        ev("a.example", "community"),
        ev("b.example", "community"),
        ev("c.example", "community"),
      ],
    };
    expect(decideClaims([strongCommunity])[0]?.status).toBe("disputed");
  });

  it("sumber tepercaya tanpa resmi tidak pernah menjadi accepted", () => {
    const reputable = {
      key: "d",
      evidence: [
        ev("kompas.com", "reputable"),
        ev("antaranews.com", "reputable"),
      ],
    };
    expect(decideClaims([reputable])[0]?.status).toBe("disputed");
  });

  it("nilai resmi menang; nilai bersaing yang kuat tampil sebagai disputed, yang lemah tersembunyi", () => {
    const rival = { key: "r", evidence: [ev("kompas.com", "reputable")] };
    const noise = { key: "n", evidence: [ev("blog.example", "community")] };
    const result = decideClaims([official, rival, noise]);
    expect(result.find((d) => d.key === "a")?.status).toBe("accepted");
    expect(result.find((d) => d.key === "r")?.status).toBe("disputed");
    expect(result.find((d) => d.key === "r")?.reasons).toContain(
      "berbeda dari nilai resmi",
    );
    expect(result.find((d) => d.key === "n")?.status).toBe("proposed");
  });

  it("dua nilai resmi bersaing: yang keyakinannya lebih tinggi menang, satunya tidak ikut accepted", () => {
    const strong = {
      key: "s",
      evidence: [
        ev("immi.homeaffairs.gov.au", "official"),
        ev("imigrasi.go.id", "official"),
      ],
    };
    const result = decideClaims([official, strong]);
    expect(
      result.filter((d) => d.status === "accepted").map((d) => d.key),
    ).toEqual(["s"]);
  });

  it("keputusan admin (lockedAccepted) mengalahkan skor", () => {
    const rival = {
      key: "r",
      evidence: [
        ev("kompas.com", "reputable"),
        ev("antaranews.com", "reputable"),
      ],
    };
    const result = decideClaims([official, rival], "r");
    expect(result.find((d) => d.key === "r")?.status).toBe("accepted");
    expect(result.find((d) => d.key === "a")?.status).not.toBe("accepted");
  });
});
