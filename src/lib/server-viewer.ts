/**
 * Server-only helper: resolves the current request's viewer (user id + admin flag).
 *
 * P0-SEC (SEC-3/SEC-5): used by Server Components that must distinguish the owner/admin from
 * anonymous or other users (broker deal-card / leasing pages, owner previews on /dc and
 * /im-lite). Memoised per request with React `cache()` so generateMetadata + page share it.
 *
 * Never throws — any auth/profile failure resolves to an anonymous (least-privilege) viewer.
 */
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ANONYMOUS_VIEWER, type Viewer } from "@/domain/public-projection/access";

export const getServerViewer = cache(async (): Promise<Viewer> => {
  let userId: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id ?? null;
  } catch {
    return ANONYMOUS_VIEWER;
  }
  if (!userId) return ANONYMOUS_VIEWER;

  let isAdmin = false;
  try {
    const service = createServiceClient();
    const { data: profile } = await service
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    isAdmin = profile?.role === "admin";
  } catch {
    isAdmin = false;
  }
  return { userId, isAdmin };
});
