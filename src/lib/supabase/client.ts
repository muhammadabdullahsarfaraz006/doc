import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

import { getPublicSupabaseEnv } from "./env";

export function createClient() {
  const env = getPublicSupabaseEnv();

  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
