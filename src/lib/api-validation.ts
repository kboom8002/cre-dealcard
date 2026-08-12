import { NextResponse } from 'next/server';
import { z, ZodSchema } from 'zod';

export async function validateRequestBody<T>(
  req: Request,
  schema: ZodSchema<T>,
): Promise<{ data: T } | { error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      error: NextResponse.json(
        { ok: false, error: { code: 'INVALID_JSON', message: '요청 본문이 유효한 JSON이 아닙니다.' } },
        { status: 400 }
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      error: NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0]?.message || '입력값이 유효하지 않습니다.' } },
        { status: 400 }
      ),
    };
  }

  return { data: result.data };
}
