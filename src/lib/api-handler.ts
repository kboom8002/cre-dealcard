import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema, ZodError } from 'zod';
import { DomainError } from '@/domain/shared/result';

export interface ApiHandlerContext<T> {
  data: T;
  req: NextRequest;
}

/**
 * Standard higher-order API handler wrapper for Next.js App Router route handlers.
 * Unifies request parsing, Zod validation, DomainError (422), and 500 error mapping.
 */
export function createApiHandler<T = any>(
  schema: ZodSchema<T> | null,
  handler: (ctx: ApiHandlerContext<T>) => Promise<NextResponse>,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      let data = null as unknown as T;
      if (schema) {
        let rawBody: unknown;
        try {
          rawBody = await req.json();
        } catch {
          return NextResponse.json(
            { error: '올바른 JSON 요청 본문이 필요합니다.' },
            { status: 400 },
          );
        }
        const parsed = schema.safeParse(rawBody);
        if (!parsed.success) {
          return NextResponse.json(
            { error: '입력 검증 실패', details: parsed.error.flatten() },
            { status: 400 },
          );
        }
        data = parsed.data;
      }
      return await handler({ data, req });
    } catch (err: unknown) {
      if (err instanceof DomainError) {
        return NextResponse.json(
          { error: err.message, code: err.code, context: err.context },
          { status: 422 },
        );
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: '입력 오류', details: err.flatten() },
          { status: 400 },
        );
      }
      const message = err instanceof Error ? err.message : '서버 내부 오류가 발생했습니다.';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
