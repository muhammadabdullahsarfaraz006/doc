import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { collabEnv } from "./env.js";

let adminClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(collabEnv.supabaseUrl, collabEnv.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminClient;
}
