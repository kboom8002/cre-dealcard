import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema, ZodError } from 'zod';
import { DomainError } from '@/domain/shared/result';
import { createModuleLogger } from '@/lib/logger';
import { runWithRequestContext } from '@/lib/observability/request-context';

const log = createModuleLogger('api-handler');

export interface ApiHandlerContext<T> {
  data: T;
  req: NextRequest;
}

function attachRequestIdHeader(res: NextResponse, requestId: string): NextResponse {
  try {
    res.headers.set('X-Request-Id', requestId);
  } catch {
    // Ignore immutable header containers
  }
  return res;
}

/**
 * Standard higher-order API handler wrapper for Next.js App Router route handlers.
 * Unifies request parsing, Zod validation, DomainError (422), request correlation, and masked 500 error mapping.
 */
export function createApiHandler<T = any>(
  schema: ZodSchema<T> | null,
  handler: (ctx: ApiHandlerContext<T>) => Promise<NextResponse>,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    return runWithRequestContext(
      {
        headers: req.headers,
        method: req.method,
        route: req.nextUrl?.pathname,
      },
      async (reqCtx) => {
        try {
          let data = null as unknown as T;
          if (schema) {
            let rawBody: unknown;
            try {
              rawBody = await req.json();
            } catch {
              return attachRequestIdHeader(
                NextResponse.json(
                  { error: '올바른 JSON 요청 본문이 필요합니다.' },
                  { status: 400 },
                ),
                reqCtx.requestId,
              );
            }
            const parsed = schema.safeParse(rawBody);
            if (!parsed.success) {
              return attachRequestIdHeader(
                NextResponse.json(
                  { error: '입력 검증 실패', details: parsed.error.flatten() },
                  { status: 400 },
                ),
                reqCtx.requestId,
              );
            }
            data = parsed.data;
          }
          const response = await handler({ data, req });
          return attachRequestIdHeader(response, reqCtx.requestId);
        } catch (err: unknown) {
          if (err instanceof DomainError) {
            return attachRequestIdHeader(
              NextResponse.json(
                { error: err.message, code: err.code, context: err.context },
                { status: 422 },
              ),
              reqCtx.requestId,
            );
          }
          if (err instanceof ZodError) {
            return attachRequestIdHeader(
              NextResponse.json(
                { error: '입력 오류', details: err.flatten() },
                { status: 400 },
              ),
              reqCtx.requestId,
            );
          }
          log.error(err, 'Unhandled API error');
          return attachRequestIdHeader(
            NextResponse.json(
              {
                error: '서버 내부 오류가 발생했습니다.',
                code: 'INTERNAL_SERVER_ERROR',
                requestId: reqCtx.requestId,
              },
              { status: 500 },
            ),
            reqCtx.requestId,
          );
        }
      },
    );
  };
}
