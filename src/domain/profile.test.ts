import { describe, expect, it } from "vitest";
import { documentInputSchema, expiryWarning } from "./documents";
import { daysUntil, isPlanStage } from "./plan";
import { ageOn, parseProfileForm } from "./profile";

const now = new Date("2026-10-05T00:00:00Z");

const form = (entries: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const v of Array.isArray(value) ? value : [value]) fd.append(key, v);
  }
  return fd;
};

describe("ageOn", () => {
  it("menghitung usia dengan memperhitungkan ulang tahun", () => {
    expect(ageOn("2000-10-05", now)).toBe(26);
    expect(ageOn("2000-10-06", now)).toBe(25);
    expect(ageOn("2000-12-31", now)).toBe(25);
  });
});

describe("parseProfileForm", () => {
  it("menerima isian lengkap dan mengosongkan isian kosong", () => {
    const result = parseProfileForm(
      form({
        full_name: " Dwi Santoso ",
        birth_date: "2000-03-01",
        city: "",
        education_level: "s1",
        years_experience: "2",
        english_level: "menengah",
        target_tracks: ["whv_au", "scholarship"],
        target_countries: ["au", "DE", "ZZ", "AU"],
        target_departure: "2027-01-15",
      }),
      now,
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.data).toMatchObject({
      full_name: "Dwi Santoso",
      birth_date: "2000-03-01",
      education_level: "s1",
      years_experience: 2,
      english_level: "menengah",
      target_tracks: ["whv_au", "scholarship"],
      target_countries: ["AU", "DE"], // huruf besar, duplikat & kode tak dikenal dibuang
      target_departure: "2027-01-15",
    });
    expect(result.data.city).toBeUndefined();
  });

  it("menolak nilai di luar pilihan atau tanggal lahir tidak wajar", () => {
    expect(parseProfileForm(form({ education_level: "phd" }), now).ok).toBe(
      false,
    );
    expect(parseProfileForm(form({ years_experience: "99" }), now).ok).toBe(
      false,
    );
    expect(parseProfileForm(form({ target_tracks: ["hacker"] }), now).ok).toBe(
      false,
    );
    expect(parseProfileForm(form({ birth_date: "2020-01-01" }), now)).toEqual({
      ok: false,
      error: "Tanggal lahir tidak wajar.",
    });
    expect(
      parseProfileForm(form({ birth_date: "bukan-tanggal" }), now).ok,
    ).toBe(false);
  });

  it("formulir kosong tetap valid (semua opsional)", () => {
    expect(parseProfileForm(form({}), now).ok).toBe(true);
  });
});

describe("documentInputSchema & expiryWarning", () => {
  it("memvalidasi status dan urutan tanggal", () => {
    expect(
      documentInputSchema.safeParse({
        document_type: "passport",
        status: "have",
        issued_on: "2025-01-12",
        expires_on: "2035-01-12",
      }).success,
    ).toBe(true);
    expect(
      documentInputSchema.safeParse({
        document_type: "passport",
        status: "punya",
      }).success,
    ).toBe(false);
    expect(
      documentInputSchema.safeParse({
        document_type: "passport",
        status: "have",
        issued_on: "2030-01-01",
        expires_on: "2029-01-01",
      }).success,
    ).toBe(false);
    expect(
      documentInputSchema.safeParse({
        document_type: "ielts",
        status: "missing",
        expires_on: "",
      }).success,
    ).toBe(true);
  });

  it("memberi peringatan kedaluwarsa dan hampir kedaluwarsa (6 bulan)", () => {
    expect(expiryWarning(null, now)).toBeNull();
    expect(expiryWarning("2026-09-01", now)).toBe("expired");
    expect(expiryWarning("2027-02-01", now)).toBe("expiring");
    expect(expiryWarning("2027-06-01", now)).toBeNull();
  });
});

describe("plan", () => {
  it("mengenali tahap valid dan menghitung sisa hari", () => {
    expect(isPlanStage("applied")).toBe(true);
    expect(isPlanStage("hacked")).toBe(false);
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil("2026-10-08T00:00:00Z", now)).toBe(3);
    expect(daysUntil("2026-10-01T00:00:00Z", now)).toBeLessThan(0);
  });
});
