/**
 * Supabase server client — used in Server Components, Route Handlers, Server Actions.
 * Uses the anon key — queries go through RLS with the user's session.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { env } from "@/lib/env";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const authHeader = headerStore.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");

  const client = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — cookie writes are ignored.
          }
        },
      },
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    },
  );

  if (token) {
    console.log("[createServerSupabaseClient] Configured global auth header, length:", token.length);
  } else {
    console.log("[createServerSupabaseClient] No token in Authorization header");
  }

  return client;
}
