/**
 * republish-manager.ts — 발행 후 관리 재발행 및 이력 관리
 * Spec: docs/imup/04_screen/POST_PUBLISH_SPEC.md (§4)
 * 
 * finding 해소 시 기존 딜을 덮어쓰지 않고 `superseded` 처리 후 새로운 `publish_record`를 발행합니다.
 */

import { PublishRecord, Verdict } from './types';

export interface RepublishInput {
  currentRecord: PublishRecord;
  resolvedFindingCodes: string[];
  remainingFindings: Verdict[];
}

export interface RepublishResult {
  previousRecord: PublishRecord;
  newRecord: PublishRecord;
  resolvedCount: number;
}

/**
 * Finding 해소 및 버전 승격 재발행
 */
export function createRepublishRecord(input: RepublishInput): RepublishResult {
  const now = new Date().toISOString();
  const newVersion = input.currentRecord.version + 1;
  const newId = `pub_${input.currentRecord.buildingId}_v${newVersion}`;

  // 기존 레코드 Superseded 처리
  const previousRecord: PublishRecord = {
    ...input.currentRecord,
    status: 'superseded',
    supersededAt: now,
    supersededBy: newId,
  };

  // 신규 레코드 생성
  const newRecord: PublishRecord = {
    id: newId,
    buildingId: input.currentRecord.buildingId,
    version: newVersion,
    status: 'active',
    publishedAt: now,
    findings: input.remainingFindings,
    resolvedFindings: [
      ...input.currentRecord.resolvedFindings,
      ...input.resolvedFindingCodes,
    ],
  };

  return {
    previousRecord,
    newRecord,
    resolvedCount: input.resolvedFindingCodes.length,
  };
}
