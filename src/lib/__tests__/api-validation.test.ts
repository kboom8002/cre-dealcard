import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { withValidation, validateRequestBody } from '../api-validation';

describe('API Validation with Zod (P1-1)', () => {
  const UserSchema = z.object({
    name: z.string().min(2),
    age: z.number().int().positive(),
  });

  it('validateRequestBody should parse valid JSON body successfully', async () => {
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice', age: 30 }),
    });

    const res = await validateRequestBody(req, UserSchema);
    expect('data' in res).toBe(true);
    if ('data' in res) {
      expect(res.data.name).toBe('Alice');
      expect(res.data.age).toBe(30);
    }
  });

  // Rule 7: Negative Pair — Invalid body returns 400 with error
  it('Rule 7 (Negative Pair): validateRequestBody returns 400 on schema violation', async () => {
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify({ name: 'A', age: -5 }),
    });

    const res = await validateRequestBody(req, UserSchema);
    expect('error' in res).toBe(true);
    if ('error' in res) {
      expect(res.error.status).toBe(400);
      const body = await res.error.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  // Rule 7: Negative Pair — Malformed JSON body returns 400 INVALID_JSON
  it('Rule 7 (Negative Pair): validateRequestBody returns 400 on malformed JSON', async () => {
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      body: 'invalid-json{{{',
    });

    const res = await validateRequestBody(req, UserSchema);
    expect('error' in res).toBe(true);
    if ('error' in res) {
      expect(res.error.status).toBe(400);
      const body = await res.error.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('INVALID_JSON');
    }
  });

  it('withValidation wraps handler and provides typed data', async () => {
    const handler = withValidation(UserSchema, async (data) => {
      return NextResponse.json({ ok: true, greeting: `Hello, ${data.name}` });
    });

    const validReq = new Request('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bob', age: 25 }),
    });

    const response = await handler(validReq);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.greeting).toBe('Hello, Bob');
  });

  // Rule 7: Negative Pair — withValidation rejects invalid body before handler runs
  it('Rule 7 (Negative Pair): withValidation blocks execution when schema fails', async () => {
    let handlerExecuted = false;
    const handler = withValidation(UserSchema, async () => {
      handlerExecuted = true;
      return NextResponse.json({ ok: true });
    });

    const invalidReq = new Request('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify({ name: 'Short' }), // missing age
    });

    const response = await handler(invalidReq);
    expect(response.status).toBe(400);
    expect(handlerExecuted).toBe(false);
  });
});
