/**
 * src/lib/authz/assert-owner.ts — 매물/문서 소유권 단일 판정 헬퍼 (P0-SEC SEC-1·SEC-2)
 *
 * 원칙 (위반 시 정적 가드 테스트 `src/tests/security/no-readwithmigration-authz.test.ts` 가 실패한다):
 *  - 매물 소유권은 반드시 `building_ssot_lite.owner_id` 를 **직접** 읽어 판정한다.
 *    `readWithMigration()` 은 assets 행(=owner_id 컬럼 없음)을 돌려줄 수 있으므로 권한 판정에 쓰지 않는다.
 *    (과거: owner 가 undefined 면 검사를 건너뛰는 fail-open / 반대로 항상 404 가 되는 두 방향 결함)
 *  - 행 없음 → 404, 소유자 불일치 → 403, owner_id 가 null → 403 (fail-closed), 조회 오류 → 500 (fail-closed).
 *  - 관리자 우회는 호출부가 `allowAdmin: true` 를 명시하고 role 이 정확히 'admin' 일 때만 허용한다.
 *
 * HTTP 라우트는 `result.response` 를 그대로 반환하고, 비-HTTP 호출부(handler 등)는 `status`/`message` 를 사용한다.
 */
import { NextResponse } from 'next/server';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('authz-assert-owner');

/** 최소 구조 타입 — 실제 SupabaseClient 와 테스트 목 모두 수용 */
export interface OwnershipQueryClient {
  from: (table: string) => any;
}

export type OwnershipFailureCode = 'NOT_FOUND' | 'FORBIDDEN' | 'LOOKUP_FAILED' | 'BAD_REQUEST';

export interface OwnershipFailure {
  ok: false;
  status: 400 | 403 | 404 | 500;
  code: OwnershipFailureCode;
  message: string;
  /** 라우트에서 그대로 반환할 수 있는 응답 (`{ ok:false, error: string, code }`) */
  response: NextResponse;
}

export interface OwnershipSuccess<T = Record<string, unknown>> {
  ok: true;
  row: T;
  ownerId: string | null;
  /** 소유자가 아니지만 admin 우회로 통과한 경우 true */
  viaAdmin: boolean;
}

export type OwnershipResult<T = Record<string, unknown>> = OwnershipSuccess<T> | OwnershipFailure;

export interface AssertOwnerOptions {
  /** true 이고 role === 'admin' 일 때만 소유자 불일치를 허용한다. 기본 false. */
  allowAdmin?: boolean;
  /** 요청자 역할 (requireBroker/verifyAuth 결과의 role) */
  role?: string | null;
  /** 추가로 조회할 컬럼. owner_id 는 항상 포함된다. 기본 'id, owner_id'. */
  select?: string;
}

export interface AssertDocOwnerOptions extends AssertOwnerOptions {
  /**
   * true 면 문서 owner_id 가 요청자와 다를 때(또는 null 일 때) 문서의 building_id 매물 소유자인지 추가 확인한다.
   * (긍정 일치가 있어야만 통과 — fail-open 아님)
   */
  allowBuildingOwner?: boolean;
}

const MESSAGES = {
  NOT_FOUND_BUILDING: '매물을 찾을 수 없습니다.',
  NOT_FOUND_DOC: '문서를 찾을 수 없습니다.',
  FORBIDDEN_BUILDING: '이 매물에 대한 권한이 없습니다.',
  FORBIDDEN_DOC: '이 문서에 대한 권한이 없습니다.',
  LOOKUP_FAILED: '권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  BAD_REQUEST: '유효하지 않은 요청입니다.',
} as const;

export function ownershipFailure(
  status: OwnershipFailure['status'],
  code: OwnershipFailureCode,
  message: string,
): OwnershipFailure {
  return {
    ok: false,
    status,
    code,
    message,
    response: NextResponse.json({ ok: false, error: message, code }, { status }),
  };
}

function withOwnerColumn(select: string | undefined): string {
  const base = (select ?? '').trim();
  if (!base) return 'id, owner_id';
  if (base === '*' || /\bowner_id\b/.test(base)) return base;
  return `${base}, owner_id`;
}

function isAdminBypass(opts: AssertOwnerOptions | undefined): boolean {
  return opts?.allowAdmin === true && opts?.role === 'admin';
}

async function lookupRow(
  svc: OwnershipQueryClient,
  table: string,
  id: string,
  select: string,
): Promise<{ row: Record<string, unknown> | null; error: string | null }> {
  try {
    const { data, error } = await svc.from(table).select(select).eq('id', id).maybeSingle();
    if (error) return { row: null, error: String(error.message ?? error) };
    return { row: (data as Record<string, unknown> | null) ?? null, error: null };
  } catch (e) {
    return { row: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * `building_ssot_lite.owner_id` 를 직접 조회해 userId 소유인지 판정한다.
 */
export async function assertBuildingOwner<T = Record<string, unknown>>(
  svc: OwnershipQueryClient,
  buildingId: string,
  userId: string,
  opts: AssertOwnerOptions = {},
): Promise<OwnershipResult<T>> {
  if (!buildingId || typeof buildingId !== 'string' || !userId) {
    return ownershipFailure(400, 'BAD_REQUEST', MESSAGES.BAD_REQUEST);
  }

  const { row, error } = await lookupRow(svc, 'building_ssot_lite', buildingId, withOwnerColumn(opts.select));
  if (error) {
    log.error('building owner lookup failed', { buildingId, error });
    return ownershipFailure(500, 'LOOKUP_FAILED', MESSAGES.LOOKUP_FAILED);
  }
  if (!row) return ownershipFailure(404, 'NOT_FOUND', MESSAGES.NOT_FOUND_BUILDING);

  const ownerId = (row.owner_id as string | null | undefined) ?? null;
  if (ownerId && ownerId === userId) {
    return { ok: true, row: row as T, ownerId, viaAdmin: false };
  }
  if (isAdminBypass(opts)) {
    log.info('admin bypass on building ownership', { buildingId, userId });
    return { ok: true, row: row as T, ownerId, viaAdmin: true };
  }
  log.warn('building ownership denied', { buildingId, userId, ownerIsNull: ownerId === null });
  return ownershipFailure(403, 'FORBIDDEN', MESSAGES.FORBIDDEN_BUILDING);
}

/**
 * `document_objects.owner_id` 를 직접 조회해 userId 소유인지 판정한다.
 */
export async function assertDocOwner<T = Record<string, unknown>>(
  svc: OwnershipQueryClient,
  docId: string,
  userId: string,
  opts: AssertDocOwnerOptions = {},
): Promise<OwnershipResult<T>> {
  if (!docId || typeof docId !== 'string' || !userId) {
    return ownershipFailure(400, 'BAD_REQUEST', MESSAGES.BAD_REQUEST);
  }

  let select = withOwnerColumn(opts.select);
  if (opts.allowBuildingOwner && select !== '*' && !/\bbuilding_id\b/.test(select)) {
    select = `${select}, building_id`;
  }
  const { row, error } = await lookupRow(svc, 'document_objects', docId, select);
  if (error) {
    log.error('document owner lookup failed', { docId, error });
    return ownershipFailure(500, 'LOOKUP_FAILED', MESSAGES.LOOKUP_FAILED);
  }
  if (!row) return ownershipFailure(404, 'NOT_FOUND', MESSAGES.NOT_FOUND_DOC);

  const ownerId = (row.owner_id as string | null | undefined) ?? null;
  if (ownerId && ownerId === userId) {
    return { ok: true, row: row as T, ownerId, viaAdmin: false };
  }

  if (opts.allowBuildingOwner && typeof row.building_id === 'string' && row.building_id) {
    const b = await assertBuildingOwner(svc, row.building_id, userId, { allowAdmin: false });
    if (b.ok) return { ok: true, row: row as T, ownerId, viaAdmin: false };
    if (b.status === 500) return b;
  }

  if (isAdminBypass(opts)) {
    log.info('admin bypass on document ownership', { docId, userId });
    return { ok: true, row: row as T, ownerId, viaAdmin: true };
  }
  log.warn('document ownership denied', { docId, userId, ownerIsNull: ownerId === null });
  return ownershipFailure(403, 'FORBIDDEN', MESSAGES.FORBIDDEN_DOC);
}

/**
 * PPTX/Basic IM 스튜디오의 `dealId` 처럼 "매물 id 또는 문서 id" 일 수 있는 식별자의 소유권을 판정한다.
 *  1) building_ssot_lite 행이 있으면 그 owner_id 로 판정
 *  2) 없으면 document_objects 행으로 판정 (문서 owner 또는 문서가 가리키는 매물 owner)
 *  3) 둘 다 없으면 404
 */
export async function assertDealOwner(
  svc: OwnershipQueryClient,
  dealId: string,
  userId: string,
  opts: AssertOwnerOptions = {},
): Promise<OwnershipResult> {
  const b = await assertBuildingOwner(svc, dealId, userId, { allowAdmin: opts.allowAdmin, role: opts.role });
  if (b.ok || b.status !== 404) return b;
  return assertDocOwner(svc, dealId, userId, {
    allowAdmin: opts.allowAdmin,
    role: opts.role,
    allowBuildingOwner: true,
  });
}
