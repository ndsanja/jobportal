import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  isAdmin: boolean;
};

/** Pengguna saat ini (diverifikasi lewat tanda tangan JWT), atau null bila belum masuk. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const appMetadata = claims.app_metadata as { role?: string } | undefined;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    isAdmin: appMetadata?.role === "admin",
  };
}

export async function requireUser(next = "/saya"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/masuk?next=${encodeURIComponent(next)}`);
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser("/admin");
  if (!user.isAdmin) redirect("/saya");
  return user;
}
