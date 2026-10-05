import { describe, expect, it } from "vitest";
import { verifyCronRequest } from "./cron-auth";

const request = (authorization?: string) =>
  new Request("https://karirpro.test/api/ingest/run", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });

describe("verifyCronRequest", () => {
  it("503 bila secret belum dikonfigurasi (tidak pernah membuka akses)", async () => {
    const response = verifyCronRequest(request("Bearer apa-saja"), "");
    expect(response?.status).toBe(503);
  });

  it("401 bila header hilang, bukan Bearer, atau salah", () => {
    expect(verifyCronRequest(request(), "s3cret")?.status).toBe(401);
    expect(verifyCronRequest(request("s3cret"), "s3cret")?.status).toBe(401);
    expect(verifyCronRequest(request("Bearer salah"), "s3cret")?.status).toBe(
      401,
    );
  });

  it("null (diizinkan) bila secret benar", () => {
    expect(verifyCronRequest(request("Bearer s3cret"), "s3cret")).toBeNull();
  });
});
