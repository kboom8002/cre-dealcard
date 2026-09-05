import { describe, it, expect } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '../api-handler';
import { DomainError } from '@/domain/shared/result';

describe('createApiHandler (P2-4)', () => {
  const schema = z.object({
    buildingId: z.string().min(1),
    priceKrw: z.number().positive(),
  });

  it('successfully parses valid JSON and runs the handler', async () => {
    const handler = createApiHandler(schema, async ({ data }) => {
      return NextResponse.json({ success: true, id: data.buildingId });
    });

    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      body: JSON.stringify({ buildingId: 'b-999', priceKrw: 50_000_000 }),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, id: 'b-999' });
  });

  it('returns 400 when body is invalid JSON (negative pair)', async () => {
    const handler = createApiHandler(schema, async () => NextResponse.json({ ok: true }));
    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      body: 'invalid-json-format',
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('JSON');
  });

  it('returns 400 when schema validation fails (negative pair)', async () => {
    const handler = createApiHandler(schema, async () => NextResponse.json({ ok: true }));
    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      body: JSON.stringify({ buildingId: '', priceKrw: -100 }),
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('입력 검증 실패');
    expect(body.details.fieldErrors).toBeDefined();
  });

  it('catches DomainError and maps to 422 with code', async () => {
    const handler = createApiHandler(schema, async () => {
      throw new DomainError('DATA_GRADE_D', 'D등급 데이터는 발행할 수 없습니다.', { grade: 'D' });
    });

    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      body: JSON.stringify({ buildingId: 'b-123', priceKrw: 100 }),
    });

    const res = await handler(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('DATA_GRADE_D');
    expect(body.error).toContain('D등급');
    expect(body.context).toEqual({ grade: 'D' });
  });

  it('catches generic errors and maps to 500', async () => {
    const handler = createApiHandler(schema, async () => {
      throw new Error('Database connection reset');
    });

    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      body: JSON.stringify({ buildingId: 'b-123', priceKrw: 100 }),
    });

    const res = await handler(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Database connection reset');
  });
});
