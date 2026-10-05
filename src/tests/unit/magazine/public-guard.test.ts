/**
 * public-guard 단위테스트 — 본문 크기(413), IP/대상 레이트리밋(429), RPC 성공/실패 분기, 메모리 폴백 한도, 검증 오류 일반화
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  __resetMemoryRateLimit,
  hitRateLimit,
  withPublicGuard,
  type RateLimitRpcClient,
} from '@/lib/magazine/public-guard';

function post(body: unknown, ip = '1.1.1.1', extraHeaders: Record<string, string> = {}) {
  return new NextRequest('https://credeal.net/api/public/magazine/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1`, ...extraHeaders },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const rpcOk = (impl: (args: Record<string, unknown>) => boolean): RateLimitRpcClient => ({
  rpc: vi.fn(async (_fn: string, args: Record<string, unknown>) => ({ data: impl(args), error: null })),
});

const rpcDown = (): RateLimitRpcClient => ({
  rpc: vi.fn(async () => ({ data: null, error: { code: '42883', message: 'function magazine_rl_hit does not exist' } })),
});

beforeEach(() => {
  __resetMemoryRateLimit();
});

describe('withPublicGuard — 본문 크기', () => {
  it('기본 8KB 초과 본문은 413 + 핸들러 미호출', async () => {
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const route = withPublicGuard({ name: 't-size' })(handler);
    const res = await route(post({ pad: 'x'.repeat(9 * 1024) }));
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(handler).not.toHaveBeenCalled();
  });

  it('content-length를 속여도 실제 바이트로 413', async () => {
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const route = withPublicGuard({ name: 't-size2', maxBodyBytes: 100 })(handler);
    const res = await route(post({ pad: 'y'.repeat(500) }, '1.1.1.2', { 'content-length': '10' }));
    expect(res.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });

  it('한도 이내 본문은 핸들러에 파싱된 body로 전달', async () => {
    const handler = vi.fn(async (_r: NextRequest, ctx: { body: unknown; ip: string | null }) => Response.json({ got: ctx.body, ip: ctx.ip }));
    const route = withPublicGuard({ name: 't-ok' })(handler);
    const res = await route(post({ a: 1 }, '9.9.9.9'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ got: { a: 1 }, ip: '9.9.9.9' }); // x-forwarded-for 첫 값
  });
});

describe('withPublicGuard — JSON/스키마 오류는 파서·내부 메시지를 노출하지 않는다 (S2-26)', () => {
  it('잘못된 JSON → 400 INVALID_JSON, 파서 메시지(Unexpected token) 없음', async () => {
    const route = withPublicGuard({ name: 't-json' })(async () => Response.json({ ok: true }));
    const res = await route(post('{bad json'));
    const text = JSON.stringify(await res.json());
    expect(res.status).toBe(400);
    expect(text).toContain('INVALID_JSON');
    expect(text).not.toMatch(/Unexpected|JSON\.parse|position/i);
  });

  it('스키마 위반 → 400 INVALID_INPUT, 한국어 메시지, 영문 zod 기본 메시지 대체', async () => {
    const schema = z.object({ n: z.number({ error: '숫자를 입력해 주세요.' }), s: z.string() });
    const route = withPublicGuard({ name: 't-schema', schema })(async () => Response.json({ ok: true }));
    const r1 = await route(post({ n: 'x', s: 'a' }));
    const j1 = await r1.json();
    expect(r1.status).toBe(400);
    expect(j1.error.message).toBe('숫자를 입력해 주세요.');
    const r2 = await route(post({ n: 1 })); // s 누락 → zod 영문 기본 메시지 → 고정 문구
    const j2 = await r2.json();
    expect(r2.status).toBe(400);
    expect(j2.error.message).toBe('입력값을 확인해 주세요.');
    expect(j2.error.message).not.toMatch(/expected|received|invalid input/i);
  });

  it('핸들러 예외는 500 고정 문구(내부 메시지 미노출)', async () => {
    const route = withPublicGuard({ name: 't-500' })(async () => {
      throw new Error('relation "magazine_subscribers" does not exist (010-1234-5678)');
    });
    const res = await route(post({}));
    const text = JSON.stringify(await res.json());
    expect(res.status).toBe(500);
    expect(text).not.toContain('relation');
    expect(text).not.toContain('010-1234-5678');
  });
});

describe('withPublicGuard — 레이트리밋 (RPC 성공 경로)', () => {
  it('RPC가 false를 주면 429 + Retry-After + RATE_LIMITED, 핸들러 미호출', async () => {
    const client = rpcOk(() => false);
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const route = withPublicGuard({
      name: 't-rpc-deny',
      rateLimit: { ip: { max: 10, windowSec: 3600 } },
      getRpcClient: () => client,
    })(handler);
    const res = await route(post({}));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3600');
    expect((await res.json()).error.code).toBe('RATE_LIMITED');
    expect(handler).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledWith('magazine_rl_hit', expect.objectContaining({ p_window_seconds: 3600, p_max: 10 }));
  });

  it('IP·대상 이중 카운터: 키는 해시되어 PII(전화번호)가 RPC 인자에 없다, 검증 실패 요청은 대상 한도를 소모하지 않는다', async () => {
    const keys: string[] = [];
    const client = rpcOk((a) => {
      keys.push(String(a.p_key));
      return true;
    });
    const schema = z.object({ phone: z.string().regex(/^01\d{9}$/, '번호 형식을 확인해 주세요.') });
    const route = withPublicGuard({
      name: 't-dual',
      schema,
      rateLimit: { ip: { max: 10, windowSec: 3600 }, target: { key: (b) => b.phone, max: 3, windowSec: 86400 } },
      getRpcClient: () => client,
    })(async () => Response.json({ ok: true }));

    await route(post({ phone: 'bad' })); // 검증 실패 → ip 1회만
    expect(keys).toHaveLength(1);
    await route(post({ phone: '01012345678' })); // ip + target
    expect(keys).toHaveLength(3);
    expect(keys.some((k) => k.includes('01012345678'))).toBe(false);
    expect(keys[1]).toContain(':ip:');
    expect(keys[2]).toContain(':target:');
  });

  it('대상 한도 초과 시 429 (IP 한도는 통과)', async () => {
    const client = rpcOk((a) => !String(a.p_key).includes(':target:'));
    const route = withPublicGuard({
      name: 't-target-deny',
      rateLimit: { ip: { max: 10, windowSec: 3600 }, target: { key: () => 'same', max: 3, windowSec: 86400 } },
      getRpcClient: () => client,
    })(async () => Response.json({ ok: true }));
    const res = await route(post({}));
    expect(res.status).toBe(429);
  });

  it('validate 훅이 Response를 반환하면 그대로 반환하고 대상 한도·핸들러를 소모하지 않는다', async () => {
    const keys: string[] = [];
    const client = rpcOk((a) => {
      keys.push(String(a.p_key));
      return true;
    });
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const route = withPublicGuard({
      name: 't-validate',
      rateLimit: { ip: { max: 10, windowSec: 3600 }, target: { key: () => 'x', max: 3, windowSec: 86400 } },
      validate: () => Response.json({ ok: false, error: { code: 'CUSTOM' } }, { status: 400 }),
      getRpcClient: () => client,
    })(handler);
    const res = await route(post({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('CUSTOM');
    expect(handler).not.toHaveBeenCalled();
    expect(keys).toHaveLength(1);
  });
});

describe('withPublicGuard — RPC 실패 시 메모리 폴백(한도 적용, fail-open 금지)', () => {
  it('RPC 오류여도 한도 초과 요청은 429', async () => {
    const client = rpcDown();
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const route = withPublicGuard({
      name: 't-mem',
      rateLimit: { ip: { max: 2, windowSec: 60 } },
      getRpcClient: () => client,
    })(handler);
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await route(post({}, '7.7.7.7'))).status);
    expect(statuses).toEqual([200, 200, 429, 429]);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('RPC 호출 자체가 throw해도(네트워크) 폴백, 다른 IP는 별도 카운터', async () => {
    const client: RateLimitRpcClient = {
      rpc: vi.fn(async () => {
        throw new Error('network down');
      }),
    };
    const route = withPublicGuard({
      name: 't-mem2',
      rateLimit: { ip: { max: 1, windowSec: 60 } },
      getRpcClient: () => client,
    })(async () => Response.json({ ok: true }));
    expect((await route(post({}, '8.8.8.1'))).status).toBe(200);
    expect((await route(post({}, '8.8.8.1'))).status).toBe(429);
    expect((await route(post({}, '8.8.8.2'))).status).toBe(200);
  });

  it('RPC가 boolean이 아닌 값을 주면 폴백으로 간주', async () => {
    const client: RateLimitRpcClient = { rpc: vi.fn(async () => ({ data: 'weird', error: null })) };
    const r = await hitRateLimit('rl:x', { max: 1, windowSec: 60 }, () => client);
    expect(r.backend).toBe('memory');
  });
});

describe('hitRateLimit — 메모리 윈도우', () => {
  it('윈도우 경과 후 카운터 리셋', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
      const client = rpcDown();
      const rule = { max: 1, windowSec: 10 };
      expect((await hitRateLimit('rl:win', rule, () => client)).allowed).toBe(true);
      expect((await hitRateLimit('rl:win', rule, () => client)).allowed).toBe(false);
      vi.setSystemTime(new Date('2026-10-05T00:00:11Z'));
      expect((await hitRateLimit('rl:win', rule, () => client)).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('RPC 성공 시 backend=rpc', async () => {
    const r = await hitRateLimit('rl:y', { max: 5, windowSec: 60 }, () => rpcOk(() => true));
    expect(r).toMatchObject({ allowed: true, backend: 'rpc' });
  });
});

describe('withPublicGuard — bodyFormat:form / renderError', () => {
  const formReq = (raw: string) =>
    new NextRequest('https://credeal.net/x', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '7.7.7.7' },
      body: raw,
    });

  it('form 본문을 {key:첫 값}으로 파싱하고 zod를 적용, 위험 키는 버린다', async () => {
    const schema = z.object({ t: z.string().min(3, '토큰이 올바르지 않습니다.') });
    const route = withPublicGuard<{ t: string }>({ name: 't-form', schema, bodyFormat: 'form' })(async (_req, { body }) =>
      Response.json({ t: body.t }),
    );
    const ok = await route(formReq('t=abc&t=zzz&__proto__=x'));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ t: 'abc' });
    const bad = await route(formReq('t=a'));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.message).toBe('토큰이 올바르지 않습니다.');
  });

  it('renderError가 있으면 가드 단계 오류(413)도 그 렌더러로 응답한다(JSON 아님)', async () => {
    const route = withPublicGuard({
      name: 't-render',
      bodyFormat: 'form',
      maxBodyBytes: 16,
      renderError: (e) => new Response(`ERR ${e.status}`, { status: e.status, headers: { 'content-type': 'text/html' } }),
    })(async () => Response.json({ ok: true }));
    const res = await route(formReq('t=' + 'x'.repeat(100)));
    expect(res.status).toBe(413);
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(await res.text()).toBe('ERR 413');
  });
});
