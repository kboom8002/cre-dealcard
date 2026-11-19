import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface AdminRscAuth {
  user: { id: string; email?: string | null };
  role: "admin";
}

/**
 * Server Component / Server Action guard for all (admin) routes.
 * Redirects unauthenticated users to /login and non-admin users to /broker.
 */
export async function requireAdminRsc(): Promise<AdminRscAuth> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    redirect("/broker");
  }

  return { user: { id: user.id, email: user.email }, role: "admin" };
}
