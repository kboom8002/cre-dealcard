/**
 * @file image-pii-gate.ts
 * @description D29 BL-3: G20 이미지 PII 발행 게이트
 * 정본: IM_IMAGE_PIPELINE_SPEC §5
 * 승인 레코드가 없으면 발행 차단 (수동 확인은 절차이지 게이트가 아님)
 * "사람 승인 없이는 발행 불가"
 */

import type { GateResultStatus } from '@/types/gate-result';

export interface ImageApprovalRecord {
  sha256: string;
  slot: string;
  maskedRegions: number;
  approvedBy: string;
  approvedAt: string;
  pipelineVersion: string;
}

export interface G20Result {
  id: 'G20';
  passed: boolean;
  status: GateResultStatus;
  severity: 'block';
  failures: Array<{
    slot: string;
    reason: string;
  }>;
}

/** 현재 파이프라인 버전 */
const PIPELINE_VERSION = 'v1';

/**
 * G20 — 발행 이미지 전량에 마스킹 처리 이력 존재
 * 정본: IM_IMAGE_PIPELINE_SPEC §5
 * 
 * @param usedImages 발행에 사용되는 이미지 목록
 * @param approvals 마스킹 승인 레코드 (sha256 → record)
 */
export function checkG20(
  usedImages: Array<{ sha256: string; slot: string }>,
  approvals: Map<string, ImageApprovalRecord>,
): G20Result {
  const failures: G20Result['failures'] = [];

  for (const img of usedImages) {
    const approval = approvals.get(img.sha256);
    if (!approval) {
      // 로그에 파일명·좌표·검출 내용을 담지 않음 (정본 §5)
      failures.push({
        slot: img.slot,
        reason: '마스킹 승인 필요',
      });
    } else if (approval.pipelineVersion !== PIPELINE_VERSION) {
      failures.push({
        slot: img.slot,
        reason: '파이프라인 재처리 필요',
      });
    }
  }

  const passed = failures.length === 0;
  let status: GateResultStatus = 'PASS';
  if (!passed) {
    status = approvals.size === 0 && usedImages.length > 0 ? 'NOT_RUN' : 'FAIL';
  }

  return {
    id: 'G20',
    passed,
    status,
    severity: 'block',
    failures,
  };
}
