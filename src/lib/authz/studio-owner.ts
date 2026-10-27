/**
 * src/lib/authz/studio-owner.ts — PPTX/Basic IM 스튜디오 라우트용 소유권 가드 (P0-SEC)
 *
 * 스튜디오 프로젝트는 document_objects(document_type='snapshot')에 owner_id 없이 저장되고
 * `project.dealId` 로 매물(또는 원본 IM 문서)을 가리킨다. 따라서 프로젝트 소유권 = dealId 의 소유권으로 판정한다.
 *
 * guard 가 null 인 경우는 기존 `NODE_ENV==='test' && x-test-bypass` 테스트 우회 경로뿐이며 그때만 검사를 생략한다.
 */
import type { NextResponse } from 'next/server';
import type { AuthGuardResult } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { assertDealOwner, ownershipFailure } from './assert-owner';

export async function assertStudioDealOwner(
  guard: AuthGuardResult | null,
  dealId: string | null | undefined,
): Promise<NextResponse | null> {
  if (!guard) return null; // 테스트 우회 전용 (production 에서는 requireBroker 결과가 항상 존재)
  if (!guard.user?.id) {
    return ownershipFailure(403, 'FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.').response;
  }
  if (!dealId || typeof dealId !== 'string') {
    return ownershipFailure(404, 'NOT_FOUND', '프로젝트를 찾을 수 없습니다.').response;
  }
  const result = await assertDealOwner(createServiceClient(), dealId, guard.user.id, {
    allowAdmin: true,
    role: guard.role,
  });
  return result.ok ? null : result.response;
}
