import { describe, expect, it } from "vitest";
import { predictNextCycle, splitTimeline } from "./timeline";

const now = new Date("2026-10-07T00:00:00Z");
const ev = (kind: string, startsOn: string) => ({
  kind,
  startsOn,
  label: null,
});

describe("predictNextCycle", () => {
  it("memprediksi dari pola beberapa tahun dengan keyakinan tinggi", () => {
    const [p] = predictNextCycle(
      [
        ev("close", "2023-10-03"),
        ev("close", "2024-10-08"),
        ev("close", "2025-10-07"),
        ev("close", "2026-10-06"),
      ],
      now,
    );
    expect(p?.kind).toBe("close");
    expect(p?.from.slice(0, 4)).toBe("2027");
    expect(p?.basisYears).toEqual([2023, 2024, 2025, 2026]);
    expect(p?.confidence).toBe("tinggi");
  });

  it("tidak memprediksi bila sudah ada tanggal resmi mendatang", () => {
    expect(
      predictNextCycle(
        [ev("close", "2025-10-01"), ev("close", "2026-12-01")],
        now,
      ),
    ).toEqual([]);
  });

  it("satu tahun riwayat → keyakinan rendah, tahun berikutnya", () => {
    const [p] = predictNextCycle([ev("open", "2026-08-04")], now);
    expect(p?.confidence).toBe("rendah");
    expect(p?.from <= "2027-08-04" && p?.to >= "2027-08-04").toBe(true);
  });
});

describe("splitTimeline", () => {
  it("memisahkan riwayat dan jadwal mendatang", () => {
    const { upcoming, past } = splitTimeline(
      [ev("close", "2026-10-06"), ev("open", "2027-08-01")],
      now,
    );
    expect(upcoming.map((e) => e.kind)).toEqual(["open"]);
    expect(past.map((e) => e.kind)).toEqual(["close"]);
  });
});
