import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Memeriksa `Authorization: Bearer <CRON_SECRET>`. Mengembalikan Response error bila gagal,
 * atau null bila diizinkan. Perbandingan memakai digest + timingSafeEqual.
 */
export function verifyCronRequest(
  request: Request,
  secret = process.env.CRON_SECRET,
): Response | null {
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET belum diatur di server." },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : "";

  if (!provided || !timingSafeEqual(digest(provided), digest(secret))) {
    return Response.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  return null;
}
