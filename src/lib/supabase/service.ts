/**
 * Supabase service-role client — used ONLY in server-side trusted paths
 * (background jobs, admin operations, seeding).
 *
 * ⚠️  This client bypasses RLS. Never import in client code.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { getServerEnv } from "@/lib/env";
import type { Database } from "@/types/supabase.generated";

export function createServiceClient() {
  const serverEnv = getServerEnv();
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export function createTypedServiceClient(): SupabaseClient<Database> {
  const serverEnv = getServerEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
