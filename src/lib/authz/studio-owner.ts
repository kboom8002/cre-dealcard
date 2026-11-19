/**
 * src/lib/authz/studio-owner.ts — PPTX/Basic IM 스튜디오 라우트용 소유권 가드 (P0-SEC)
 *
 * 스튜디오 프로젝트는 document_objects(document_type='snapshot')에 저장되고
 * `project.dealId` 로 매물(또는 원본 IM 문서)을 가리킨다. 따라서 프로젝트 소유권 = dealId 의 소유권으로 판정한다.
 *
 * guard 가 null 인 경우는 기존 `NODE_ENV==='test' && x-test-bypass` 테스트 우회 경로뿐이며 그때만 검사를 생략한다.
 */
import type { NextResponse } from 'next/server';
import type { AuthGuardResult } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { isAllowedPublicDemoIm } from '@/lib/im-lite/im-public-guard';
import { assertDealOwner, ownershipFailure } from './assert-owner';

export interface StudioDealOwnerOptions {
  /** Explicitly true ONLY for read-only preview of public demo seeds; never true on write paths. */
  readOnly?: boolean;
}

export async function assertStudioDealOwner(
  guard: AuthGuardResult | null,
  dealId: string | null | undefined,
  options?: StudioDealOwnerOptions,
): Promise<NextResponse | null> {
  if (!guard) return null; // 테스트 우회 전용 (production 에서는 requireBroker 결과가 항상 존재)
  if (!guard.user?.id) {
    return ownershipFailure(403, 'FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.').response;
  }
  if (!dealId || typeof dealId !== 'string') {
    return ownershipFailure(404, 'NOT_FOUND', '프로젝트를 찾을 수 없습니다.').response;
  }
  const cleanDealId = dealId.trim();
  const svc = createServiceClient();
  const { resolveOrSynthesizeQuickImRecord, isUuid } = await import(
    '@/lib/im-lite/quick-generate-store'
  );

  const uuidDeal = isUuid(cleanDealId);
  const result = await assertDealOwner(svc, cleanDealId, guard.user.id, {
    allowAdmin: true,
    role: guard.role,
  });
  if (result.ok) return null;
  if (result.status === 403) {
    return result.response;
  }

  if (uuidDeal && result.status !== 404) {
    return result.response;
  }

  if (!uuidDeal && guard.role === 'admin') {
    return null;
  }

  const quickRec = await resolveOrSynthesizeQuickImRecord(cleanDealId, svc, null, {
    ownerId: guard.role === 'admin' ? undefined : guard.user.id,
  });
  if (
    quickRec &&
    (guard.role === 'admin' ||
      (Boolean(quickRec.ownerId) && quickRec.ownerId === guard.user.id))
  ) {
    return null;
  }
  if (!uuidDeal && options?.readOnly === true && isAllowedPublicDemoIm(cleanDealId)) {
    return null;
  }
  if (uuidDeal) {
    return result.response;
  }
  return ownershipFailure(403, 'FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.').response;
}
