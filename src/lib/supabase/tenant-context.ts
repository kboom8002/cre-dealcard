/**
 * @file src/lib/supabase/tenant-context.ts
 * @description Zero-Trust Broker Tenant Context wrapper for Route Handlers.
 *
 * Enforces `requireBroker(req)` role authorization and provisions a user-scoped
 * RLS Supabase client (`createTypedServerSupabaseClient`) so tenant queries run
 * under PostgreSQL RLS (`auth.uid()`) instead of defaulting to `service_role`.
 * Masks uncaught exceptions behind structured server logs and a safe 500 JSON response.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireBroker, type AuthGuardResult } from '@/lib/auth-guard';
import { createTypedServerSupabaseClient } from '@/lib/supabase/server';
import { createModuleLogger } from '@/lib/logger';
import {
  getRequestContext,
  runWithRequestContext,
  setRequestContextUser,
  type RequestContextState,
} from '@/lib/observability/request-context';
import type { Database } from '@/types/supabase.generated';

const log = createModuleLogger('tenant-context');

export interface BrokerTenantContext {
  req: NextRequest;
  user: { id: string; email?: string };
  userId: string;
  role: 'broker' | 'admin';
  isAdmin: boolean;
  profile: AuthGuardResult['profile'];
  supabase: SupabaseClient<Database>;
}

function attachRequestId(response: Response, requestId: string): Response {
  try {
    response.headers.set('X-Request-Id', requestId);
  } catch {
    // Response headers may be immutable (e.g. redirect response)
  }
  return response;
}

export async function withBrokerTenantContext(
  req: NextRequest,
  handler: (ctx: BrokerTenantContext) => Promise<Response>,
): Promise<Response> {
  const execute = async (reqCtx: RequestContextState): Promise<Response> => {
    let currentUserId: string | undefined;
    let currentRole: string | null | undefined;

    try {
      const auth = await requireBroker(req);
      if (auth.error) {
        return attachRequestId(auth.error, reqCtx.requestId);
      }

      if (!auth.user?.id) {
        return attachRequestId(
          NextResponse.json(
            {
              ok: false,
              code: 'UNAUTHORIZED',
              error: '인증이 필요합니다.',
            },
            { status: 401 },
          ),
          reqCtx.requestId,
        );
      }

      currentUserId = auth.user.id;
      currentRole = auth.role;
      setRequestContextUser(auth.user.id);

      const resolvedRole: 'broker' | 'admin' = auth.role === 'admin' ? 'admin' : 'broker';
      const supabase = await createTypedServerSupabaseClient();

      const ctx: BrokerTenantContext = {
        req,
        user: auth.user,
        userId: auth.user.id,
        role: resolvedRole,
        isAdmin: resolvedRole === 'admin',
        profile: auth.profile,
        supabase,
      };

      const response = await handler(ctx);
      return attachRequestId(response, reqCtx.requestId);
    } catch (err) {
      log.error('Unhandled error in broker tenant route', {
        requestId: reqCtx.requestId,
        userId: currentUserId,
        role: currentRole ?? undefined,
        method: req.method,
        pathname: req.nextUrl?.pathname ?? req.url,
        error: err instanceof Error ? err.message : String(err),
      });

      return attachRequestId(
        NextResponse.json(
          {
            ok: false,
            code: 'INTERNAL_SERVER_ERROR',
            error: '요청 처리에 실패했습니다.',
          },
          { status: 500 },
        ),
        reqCtx.requestId,
      );
    }
  };

  const parentCtx = getRequestContext();
  if (parentCtx) {
    return execute(parentCtx);
  }

  return runWithRequestContext(
    {
      headers: req.headers,
      method: req.method,
      route: req.nextUrl?.pathname,
    },
    execute,
  );
}
