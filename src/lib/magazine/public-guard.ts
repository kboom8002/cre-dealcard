/**
 * src/lib/magazine/public-guard.ts — 공개(비인증) API 공용 가드 (F-03 G3 / E-05)
 *
 * 사용:
 *   export const POST = withPublicGuard({
 *     name: 'magazine-subscribe',
 *     schema: mySchema,
 *     rateLimit: {
 *       ip: { max: 10, windowSec: 3600 },
 *       target: { key: (b) => b.phone, max: 3, windowSec: 86400 },
 *     },
 *     maxBodyBytes: 8 * 1024,
 *   })(async (req, { body, ip }) => NextResponse.json({ ok: true }));
 *
 * 처리 순서: 본문 크기(413) → IP 레이트리밋(429) → JSON 파싱(400) → zod 검증(400) → validate 훅(의미 검증, 선택) → 대상 레이트리밋(429) → handler.
 *  - 대상(target) 한도는 검증을 통과한 본문에서 키를 뽑으므로, 잘못된 입력이 타인의 한도를 소모하지 못한다.
 *  - 레이트리밋 키는 sha256으로 해시해서 저장한다(전화/이메일 등 PII가 카운터 테이블에 남지 않음).
 *  - 오류 응답에 파서/DB 메시지를 노출하지 않는다(S2-26). 항상 고정 문구 또는 스키마가 정한 한국어 문구.
 *
 * 카운터 백엔드
 *  1) Supabase RPC `magazine_rl_hit(p_key, p_window_seconds, p_max) → boolean` (true = 허용). service client 사용.
 *  2) RPC 실패(마이그레이션 미적용·네트워크 오류 포함) 시 **프로세스 내 메모리 윈도우 카운터**로 degrade.
 *     ⚠️ 서버리스(Vercel) 한계: 인스턴스마다 메모리가 따로이고 콜드스타트마다 초기화되므로 전역 한도가 아니라
 *        "인스턴스당 한도"다. 그래도 한도 자체는 적용한다(완전 fail-open 금지). 정확한 전역 한도는 RPC 적용 후 보장된다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import type { ZodType } from 'zod';
import { createModuleLogger } from '@/lib/logger';
import { redactPiiInText } from '@/lib/magazine/pii';
import { GENERIC_ERROR_MESSAGE } from '@/lib/magazine/user-message';

const log = createModuleLogger('magazine-public-guard');

export const DEFAULT_MAX_BODY_BYTES = 8 * 1024;
export const RATE_LIMITED_MESSAGE = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
export const BODY_TOO_LARGE_MESSAGE = '요청 내용이 너무 큽니다.';
export const INVALID_JSON_MESSAGE = '요청 형식이 올바르지 않습니다.';
export const INVALID_INPUT_MESSAGE = '입력값을 확인해 주세요.';

export interface RateLimitRule {
  max: number;
  windowSec: number;
}

export interface TargetRateLimitRule extends RateLimitRule {
  /** 검증된 본문에서 대상 키(전화/이메일 등)를 추출. null/빈 문자열이면 target 한도를 건너뛴다. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  key: (body: any) => string | null | undefined;
}

/** magazine_rl_hit RPC를 호출할 수 있는 최소 클라이언트 형태. */
export interface RateLimitRpcClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

export interface PublicGuardOptions<T = unknown> {
  /** 레이트리밋 네임스페이스(라우트 이름). 기본: 요청 pathname. */
  name?: string;
  schema?: ZodType<T>;
  rateLimit?: { ip?: RateLimitRule; target?: TargetRateLimitRule };
  /** 본문 최대 바이트(기본 8KB). */
  maxBodyBytes?: number;
  /**
   * zod 이후·대상 레이트리밋 이전에 실행하는 의미 검증 훅. Response를 돌려주면 그대로 응답(보통 400)하고
   * 대상 카운터를 소모하지 않는다 → 동의 누락 등 잘못된 요청으로 타인의 연락처 한도를 태우는 것을 막는다.
   */
  validate?: (body: T) => Response | null | undefined | Promise<Response | null | undefined>;
  /** 테스트/특수 용도: RPC 클라이언트 주입. 기본은 service client(지연 생성). */
  getRpcClient?: () => RateLimitRpcClient;
  /**
   * 본문 형식. 기본 'json'. 'form'은 application/x-www-form-urlencoded(브라우저 <form> POST)를
   * { key: string } 객체로 파싱한다(중복 키는 첫 값). 파싱 실패 개념이 없으므로 INVALID_JSON은 발생하지 않는다.
   */
  bodyFormat?: 'json' | 'form';
  /**
   * 가드 단계 오류(413/429/400/500) 응답 렌더러. 기본은 JSON(guardError).
   * 사람이 보는 HTML 페이지 라우트에서 JSON이 그대로 노출되지 않도록 대체할 때 사용한다.
   */
  renderError?: (e: { status: number; code: string; message: string; headers?: HeadersInit }) => Response;
}

export interface PublicGuardContext<T> {
  /** zod 검증을 통과한 본문(schema 없으면 파싱된 JSON, GET 등 본문 없는 메서드는 undefined). */
  body: T;
  /** x-forwarded-for 첫 값(없으면 x-real-ip, 그것도 없으면 null). */
  ip: string | null;
  /** 이 요청에 적용된 카운터 백엔드(관측/테스트용). */
  rateLimitBackend: 'rpc' | 'memory' | 'none';
}

export type PublicGuardHandler<T> = (req: NextRequest, ctx: PublicGuardContext<T>) => Promise<Response> | Response;

// ───────────────────────── 오류 응답 ─────────────────────────

export function guardError(status: number, code: string, message: string, extra?: Record<string, unknown>, headers?: HeadersInit) {
  return NextResponse.json({ ok: false, error: { code, message, ...(extra ?? {}) } }, { status, headers });
}

// ───────────────────────── IP ─────────────────────────

export function getClientIp(req: Pick<Request, 'headers'>): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip')?.trim();
  return real || null;
}

// ───────────────────────── 메모리 폴백 카운터 ─────────────────────────

interface MemWindow {
  count: number;
  resetAt: number;
}
const memoryWindows = new Map<string, MemWindow>();
const MEMORY_MAX_KEYS = 5000;

/** 테스트용: 메모리 카운터 초기화. */
export function __resetMemoryRateLimit(): void {
  memoryWindows.clear();
  lastFallbackWarnAt = 0;
}

function memoryHit(key: string, windowSec: number, max: number, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
  if (memoryWindows.size > MEMORY_MAX_KEYS) {
    for (const [k, w] of memoryWindows) {
      if (w.resetAt <= now) memoryWindows.delete(k);
    }
    // 만료 항목만으로 줄지 않으면 가장 오래된 것부터 제거(메모리 상한)
    if (memoryWindows.size > MEMORY_MAX_KEYS) {
      const excess = memoryWindows.size - MEMORY_MAX_KEYS;
      let i = 0;
      for (const k of memoryWindows.keys()) {
        memoryWindows.delete(k);
        if (++i >= excess) break;
      }
    }
  }
  const cur = memoryWindows.get(key);
  if (!cur || cur.resetAt <= now) {
    memoryWindows.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { allowed: max >= 1, retryAfterSec: windowSec };
  }
  cur.count += 1;
  return { allowed: cur.count <= max, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) };
}

let lastFallbackWarnAt = 0;
function warnFallback(reason: string): void {
  const now = Date.now();
  if (now - lastFallbackWarnAt < 60_000) return; // 로그 폭주 방지
  lastFallbackWarnAt = now;
  log.warn('[public-guard] magazine_rl_hit RPC 사용 불가 → 인스턴스 메모리 한도로 degrade', { reason });
}

// ───────────────────────── 레이트리밋 ─────────────────────────

function hashKey(scope: string, name: string, raw: string): string {
  return `rl:${name}:${scope}:${createHash('sha256').update(raw).digest('hex').slice(0, 32)}`;
}

async function resolveDefaultClient(): Promise<RateLimitRpcClient> {
  // 지연 import: env 미설정 환경(단위테스트)에서 모듈 로드 시점에 터지지 않도록
  const { createServiceClient } = await import('@/lib/supabase/service');
  return createServiceClient() as unknown as RateLimitRpcClient;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
  backend: 'rpc' | 'memory';
}

/**
 * 단일 카운터 한 번 소모. RPC 우선, 실패 시 메모리 폴백(한도 동일 적용).
 * @param key 이미 해시된 키
 */
export async function hitRateLimit(
  key: string,
  rule: RateLimitRule,
  getRpcClient?: () => RateLimitRpcClient,
): Promise<RateLimitResult> {
  try {
    const client = getRpcClient ? getRpcClient() : await resolveDefaultClient();
    const { data, error } = await client.rpc('magazine_rl_hit', {
      p_key: key,
      p_window_seconds: rule.windowSec,
      p_max: rule.max,
    });
    if (error) throw new Error(error.code ? `${error.code}` : 'rpc error');
    if (typeof data !== 'boolean') throw new Error('rpc returned non-boolean');
    return { allowed: data, retryAfterSec: rule.windowSec, backend: 'rpc' };
  } catch (err) {
    warnFallback(err instanceof Error ? err.message : 'unknown');
    const m = memoryHit(key, rule.windowSec, rule.max);
    return { allowed: m.allowed, retryAfterSec: m.retryAfterSec, backend: 'memory' };
  }
}

type FailFn = (status: number, code: string, message: string, extra?: Record<string, unknown>, headers?: HeadersInit) => Response;

function tooMany(fail: FailFn, retryAfterSec: number) {
  return fail(429, 'RATE_LIMITED', RATE_LIMITED_MESSAGE, undefined, { 'Retry-After': String(Math.max(1, retryAfterSec)) });
}

/** application/x-www-form-urlencoded → { key: 첫 값 }. 위험 키(__proto__ 등)는 버린다. */
function parseFormBody(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const sp = new URLSearchParams(raw);
  for (const [k, v] of sp) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (!(k in out)) out[k] = v;
  }
  return out;
}

// ───────────────────────── 가드 본체 ─────────────────────────

export function withPublicGuard<T = unknown>(opts: PublicGuardOptions<T> = {}) {
  const maxBytes = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  return function wrap(handler: PublicGuardHandler<T>) {
    return async function guarded(req: NextRequest): Promise<Response> {
      const name = opts.name ?? new URL(req.url).pathname;
      const ip = getClientIp(req);
      let backend: PublicGuardContext<T>['rateLimitBackend'] = 'none';
      const fail: FailFn = (status, code, message, extra, headers) =>
        opts.renderError ? opts.renderError({ status, code, message, headers }) : guardError(status, code, message, extra, headers);

      try {
        const hasBody = !['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(req.method.toUpperCase());

        // 1) 본문 크기 — content-length 선검사 후, 실제 바이트로 재검사(헤더 위조 대비)
        let rawText = '';
        if (hasBody) {
          const declared = Number(req.headers.get('content-length'));
          if (Number.isFinite(declared) && declared > maxBytes) {
            return fail(413, 'PAYLOAD_TOO_LARGE', BODY_TOO_LARGE_MESSAGE);
          }
          rawText = await req.text();
          if (Buffer.byteLength(rawText, 'utf8') > maxBytes) {
            return fail(413, 'PAYLOAD_TOO_LARGE', BODY_TOO_LARGE_MESSAGE);
          }
        }

        // 2) IP 레이트리밋
        const ipRule = opts.rateLimit?.ip;
        if (ipRule) {
          const r = await hitRateLimit(hashKey('ip', name, ip ?? 'unknown'), ipRule, opts.getRpcClient);
          backend = r.backend;
          if (!r.allowed) return tooMany(fail, r.retryAfterSec);
        }

        // 3) 본문 파싱(JSON 또는 form) + zod 검증
        let body: unknown = undefined;
        if (hasBody) {
          if (opts.bodyFormat === 'form') {
            body = parseFormBody(rawText);
          } else {
            try {
              body = rawText.length ? JSON.parse(rawText) : undefined;
            } catch {
              return fail(400, 'INVALID_JSON', INVALID_JSON_MESSAGE);
            }
          }
        }
        if (opts.schema) {
          const parsed = opts.schema.safeParse(body);
          if (!parsed.success) {
            const first = parsed.error.issues[0];
            // 스키마가 정한 한국어 문구만 노출하고, 영문 기본 메시지(파서 내부)는 고정 문구로 대체
            const msg = first && /[가-힣]/.test(first.message) ? first.message : INVALID_INPUT_MESSAGE;
            const fields = Array.from(new Set(parsed.error.issues.map((i) => String(i.path[0] ?? '')))).filter(Boolean);
            return fail(400, 'INVALID_INPUT', msg, { fields });
          }
          body = parsed.data;
        }

        // 3.5) 의미 검증 훅 (동의 누락 등) — 실패해도 대상 카운터는 소모하지 않는다
        if (opts.validate) {
          const rejected = await opts.validate(body as T);
          if (rejected) return rejected;
        }

        // 4) 대상 레이트리밋 (검증 통과 후)
        const tRule = opts.rateLimit?.target;
        if (tRule) {
          const k = tRule.key(body);
          if (k) {
            const r = await hitRateLimit(hashKey('target', name, String(k)), tRule, opts.getRpcClient);
            backend = backend === 'memory' || r.backend === 'memory' ? 'memory' : r.backend;
            if (!r.allowed) return tooMany(fail, r.retryAfterSec);
          }
        }

        return await handler(req, { body: body as T, ip, rateLimitBackend: backend });
      } catch (err) {
        // 내부 오류 메시지는 로그에만(PII 마스킹), 응답은 고정 문구
        const msg = err instanceof Error ? err.message : String(err);
        log.error('[public-guard] handler error', { route: name, message: redactPiiInText(msg).slice(0, 300) });
        return fail(500, 'INTERNAL', GENERIC_ERROR_MESSAGE);
      }
    };
  };
}
