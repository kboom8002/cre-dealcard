import { NextResponse } from 'next/server';
import { getDemoMobileIM } from '@/lib/demo/mobile-im-demo-data';
import {
  allowDealPublicMemoryFallback,
  isDemoSeedDisabledForProd,
} from '@/lib/og/deal-public-guard';
import {
  isBuildingShareLinkRevokedAsync,
  verifyShareLinkToken,
} from '@/lib/security/share-link-tokens';
import {
  getPublicWorkspaceProjection,
  getWorkspaceItemByAnyId,
  type PublicWorkspaceProjectionResult,
  type WorkspaceItemRecord,
} from '@/lib/workspace/workspace-repository';

export type PublicImDenyReason = 'token_required' | 'revoked' | 'not_found';

type ImSnapshotRecord = Record<string, unknown>;

export function isPreCutoverSchemaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as { code?: unknown }).code || '').trim();
  const msg = String((err as { message?: unknown }).message || '');
  if (code === '42703' || code === '42P01' || code === 'PGRST204' || code === 'PGRST205') {
    return true;
  }
  return /column .* does not exist|relation .* does not exist|could not find the (?:table|column)/i.test(
    msg
  );
}

export function buildGovernanceUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: 'GOVERNANCE_CHECK_UNAVAILABLE',
      error: {
        code: 'GOVERNANCE_CHECK_UNAVAILABLE',
        message: '공유 링크 상태를 확인할 수 없어 잠시 열람이 제한됩니다. 잠시 후 다시 시도해 주세요.',
      },
    },
    { status: 503 }
  );
}

export interface WorkspaceImGuardResult {
  item: WorkspaceItemRecord | null;
  projection: PublicWorkspaceProjectionResult['projection'];
  isDeleted: boolean;
  isRevoked: boolean;
  itemRevoked: boolean;
  isDraft: boolean;
  ownerId: string | null;
  snapshot: ImSnapshotRecord | null;
  dbShareRevoked: boolean;
  governanceUnavailable: boolean;
}

export async function resolveWorkspaceImGuard(
  supabase: unknown,
  buildingId: string
): Promise<WorkspaceImGuardResult> {
  const cleanId = String(buildingId || '').trim();
  let governanceUnavailable = false;
  const [item, projectionRes, dbShareRevoked] = await Promise.all([
    supabase
      ? getWorkspaceItemByAnyId(supabase, cleanId, 'im').catch((err) => {
          if (!isPreCutoverSchemaError(err)) governanceUnavailable = true;
          return null;
        })
      : Promise.resolve(null),
    supabase
      ? getPublicWorkspaceProjection(supabase, cleanId, 'im').catch((err) => {
          if (!isPreCutoverSchemaError(err)) governanceUnavailable = true;
          return null;
        })
      : Promise.resolve(null),
    isBuildingShareLinkRevokedAsync(cleanId, supabase, { strict: true }).catch((err) => {
      if (!isPreCutoverSchemaError(err)) governanceUnavailable = true;
      return false;
    }),
  ]);

  const isDeleted = Boolean(item && (item.deletedAt || item.status === 'archived'));
  const itemRevoked = Boolean(item && (item.revokedAt || item.status === 'revoked'));
  const isRevoked = Boolean(dbShareRevoked || itemRevoked);
  const isDraft = Boolean(item && item.status === 'draft');

  return {
    item,
    projection: projectionRes?.projection ?? null,
    isDeleted,
    isRevoked,
    itemRevoked,
    isDraft,
    ownerId: item?.ownerId ?? null,
    snapshot:
      !isDeleted && !isRevoked && projectionRes?.projection?.snapshot
        ? projectionRes.projection.snapshot
        : null,
    dbShareRevoked,
    governanceUnavailable,
  };
}

export function isAllowedPublicDemoIm(buildingId: string): boolean {
  if (isDemoSeedDisabledForProd(buildingId)) return false;
  return Boolean(getDemoMobileIM(buildingId));
}

export function buildShareTokenRequiredResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: 'SHARE_TOKEN_REQUIRED',
      error: {
        code: 'SHARE_TOKEN_REQUIRED',
        message: '유효한 공유 링크 토큰이 필요합니다.',
      },
    },
    { status: 403 }
  );
}

export function buildLinkRevokedResponse(status: 403 | 410 = 403): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'LINK_REVOKED',
        message: '담당 중개인에 의해 회수된 공유 링크입니다.',
      },
    },
    { status }
  );
}

export async function verifyPublicImShareToken(params: {
  token: string | null | undefined;
  buildingId: string;
  requireToken: boolean;
  isPrivileged: boolean;
  isDemo?: boolean;
}): Promise<
  | { allowed: true; reason?: undefined }
  | { allowed: false; reason: 'invalid_token' | 'revoked' | 'token_required' | 'lookup_failed'; status: 403 | 410 | 503 }
> {
  const token = String(params.token || '').trim();
  if (token) {
    const check = await verifyShareLinkToken({ token, buildingId: params.buildingId });
    if (!check.valid) {
      if (check.reason === 'lookup_failed') {
        return { allowed: false, reason: 'lookup_failed', status: 503 };
      }
      return {
        allowed: false,
        reason: check.reason === 'revoked' ? 'revoked' : 'invalid_token',
        status: 403,
      };
    }
    return { allowed: true };
  }

  if (params.requireToken && !params.isPrivileged && !params.isDemo) {
    return { allowed: false, reason: 'token_required', status: 403 };
  }

  return { allowed: true };
}

export function normalizeHiddenSectionSet(
  body: Record<string, unknown> | null | undefined
): Set<string> {
  if (!body || typeof body !== 'object') return new Set();
  const list = [
    ...(Array.isArray(body.hidden_sections) ? body.hidden_sections : []),
    ...(Array.isArray(body.hiddenSections) ? body.hiddenSections : []),
  ];
  const out = new Set<string>();
  for (const item of list) {
    if (typeof item === 'string' && item.trim()) {
      out.add(item.trim());
    }
  }
  return out;
}

export function filterHiddenImSections<T extends Record<string, unknown>>(
  sections: T[] | null | undefined,
  hidden: ReadonlySet<string>
): T[] {
  if (!Array.isArray(sections)) return [];
  if (!hidden || hidden.size === 0) return sections;
  return sections.filter((s) => {
    if (!s || typeof s !== 'object') return false;
    const keys = [s.section_type, s.sectionId, s.sectionType, s.id]
      .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
      .map((k) => k.trim());
    return !keys.some((k) => hidden.has(k));
  });
}

export { allowDealPublicMemoryFallback, isDemoSeedDisabledForProd };
