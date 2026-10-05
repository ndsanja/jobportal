import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Klien Supabase per-request (membaca sesi dari cookie).
 * Buat satu klien baru untuk setiap request; jangan disimpan di variabel modul.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Dipanggil dari Server Component (cookie tidak bisa ditulis).
          // Aman diabaikan: proxy.ts yang menyegarkan sesi.
        }
      },
    },
  });
}
