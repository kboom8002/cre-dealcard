/**
 * Supabase service-role client — used ONLY in server-side trusted paths
 * (background jobs, admin operations, seeding).
 *
 * ⚠️  This client bypasses RLS. Never import in client code.
 */
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { getServerEnv } from "@/lib/env";

export function createServiceClient() {
  const serverEnv = getServerEnv();
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  );
}
