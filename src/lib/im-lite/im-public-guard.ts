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
}

export async function resolveWorkspaceImGuard(
  supabase: unknown,
  buildingId: string
): Promise<WorkspaceImGuardResult> {
  const cleanId = String(buildingId || '').trim();
  const [item, projectionRes, dbShareRevoked] = await Promise.all([
    supabase
      ? getWorkspaceItemByAnyId(supabase, cleanId, 'im').catch(() => null)
      : Promise.resolve(null),
    supabase
      ? getPublicWorkspaceProjection(supabase, cleanId, 'im').catch(() => null)
      : Promise.resolve(null),
    isBuildingShareLinkRevokedAsync(cleanId, supabase).catch(() => false),
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
  | { allowed: false; reason: 'invalid_token' | 'revoked' | 'token_required'; status: 403 | 410 }
> {
  const token = String(params.token || '').trim();
  if (token) {
    const check = await verifyShareLinkToken({ token, buildingId: params.buildingId });
    if (!check.valid) {
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

export { allowDealPublicMemoryFallback, isDemoSeedDisabledForProd };
