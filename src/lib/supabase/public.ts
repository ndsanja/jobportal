import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Klien tanpa sesi untuk data publik (peluang, referensi). Karena tidak membaca cookie,
 * halaman yang memakainya bisa di-cache/di-prerender. RLS tetap berlaku sebagai `anon`.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
