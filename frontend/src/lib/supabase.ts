import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

let _supabase: SupabaseClient | null = null;

/**
 * Lazily-initialised Supabase client.
 * Avoids crashing at module-load when NEXT_PUBLIC_* vars are missing
 * (e.g. during a build where they haven't been injected yet).
 */
export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
      );
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}
