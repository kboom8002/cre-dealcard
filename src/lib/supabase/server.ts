/**
 * Supabase server client — used in Server Components, Route Handlers, Server Actions.
 * Uses the anon key — queries go through RLS with the user's session.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { env } from "@/lib/env";
import { createModuleLogger } from "@/lib/logger";

const logger = createModuleLogger("supabase-server");

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
    logger.debug("Configured global auth header, length:", token.length);
  } else {
    logger.debug("No token in Authorization header");
  }

  // Fast-path: reuse user already verified by proxy.ts in the same request lifecycle
  // to avoid duplicate remote HTTP round-trips to Supabase Auth (/auth/v1/user).
  const proxySecret = headerStore.get("x-cre-proxy-secret");
  const verifiedUserRaw = headerStore.get("x-cre-verified-user");
  const expectedSecret = (globalThis as Record<string, unknown>).__creProxySecret as string | undefined;

  if (!token && proxySecret && expectedSecret && proxySecret === expectedSecret && verifiedUserRaw) {
    try {
      const verifiedUser = JSON.parse(decodeURIComponent(verifiedUserRaw));
      const origGetUser = client.auth.getUser.bind(client.auth);
      client.auth.getUser = (async (jwt?: string) => {
        if (jwt) return origGetUser(jwt);
        return { data: { user: verifiedUser }, error: null } as Awaited<ReturnType<typeof origGetUser>>;
      }) as typeof client.auth.getUser;
    } catch {
      // Fallback to standard getUser() if parsing fails
    }
  }

  return client;
}
