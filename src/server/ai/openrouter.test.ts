import { describe, expect, it, vi } from "vitest";
import { extractScholarshipFacts } from "./openrouter";

const page =
  "Applications close on 30 April 2026 at 11:00 WIB. The scholarship is for master and PhD study.";
const now = new Date("2026-04-01T00:00:00Z");

const reply = (content: unknown) =>
  Response.json({
    choices: [
      {
        message: {
          content:
            typeof content === "string" ? content : JSON.stringify(content),
        },
      },
    ],
  });

describe("extractScholarshipFacts", () => {
  it("menghasilkan fakta tervalidasi dan memakai model default tanpa membocorkan kunci di body", async () => {
    const fetchMock = vi.fn(async () =>
      reply({
        dates: [
          {
            kind: "close",
            label: "Penutupan pendaftaran",
            starts_on: "2026-04-30",
            evidence: "Applications close on 30 April 2026 at 11:00 WIB",
          },
        ],
        study_levels: {
          values: ["master", "doctoral"],
          evidence: "for master and PhD study",
        },
      }),
    );
    const result = await extractScholarshipFacts(page, {
      apiKey: "kunci-rahasia",
      fetch: fetchMock,
      now,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.accepted.dates[0]?.starts_on).toBe("2026-04-30");
    expect(result.model).toBe("openai/gpt-6-luna");

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(String(init.body)).not.toContain("kunci-rahasia");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer kunci-rahasia",
    );
  });

  it("mencoba ulang sekali bila keluaran bukan JSON, lalu berhasil", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply("Tentu! Berikut hasilnya..."))
      .mockResolvedValueOnce(reply('```json\n{"dates": []}\n```'));
    const result = await extractScholarshipFacts(page, {
      apiKey: "k",
      fetch: fetchMock,
      now,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });

  it("gagal jelas setelah dua kali keluaran tidak valid", async () => {
    const fetchMock = vi.fn(async () => reply("bukan json"));
    const result = await extractScholarshipFacts(page, {
      apiKey: "k",
      fetch: fetchMock,
      now,
    });
    expect(result).toEqual({ ok: false, error: "Keluaran model bukan JSON" });
  });

  it("melempar error HTTP tanpa isi respons", async () => {
    const fetchMock = vi.fn(
      async () => new Response("detail rahasia", { status: 401 }),
    );
    await expect(
      extractScholarshipFacts(page, { apiKey: "k", fetch: fetchMock, now }),
    ).rejects.toThrow(/HTTP 401/);
  });
});
