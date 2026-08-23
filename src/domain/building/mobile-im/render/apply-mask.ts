// src/domain/building/mobile-im/render/apply-mask.ts
// IMCore 마스킹 엔진: public(공개용) vs full(실사/Pro용)
// Spec: API_TYPE_CONTRACT.md (D3 §5.3)

import type { IMCore, MaskLevel, Address, LeaseRow } from '@/types/im-core';

/** 주소 마스킹: public은 동까지만 노출, full은 지번/도로명 전체 노출 */
function maskAddress(addr: Address, level: MaskLevel): Address {
  if (level === 'full') return addr;
  return {
    ...addr,
    raw: `${addr.sido} ${addr.sigungu} ${addr.dong} 일대`,
    roadAddress: null,
    jibunAddress: null,
    pnu: null,
  };
}

/** 렌트롤 마스킹: public은 상호 제거 및 총액/층별 요약, full은 호실별 상세 노출 */
function maskLeases(leases: LeaseRow[], level: MaskLevel): LeaseRow[] {
  if (level === 'full') return leases;
  return leases.map(row => ({
    ...row,
    tenantBusiness: row.tenantBusiness ? '비공개 (NDA 체결 후 열람)' : null,
    note: null,
    opposingPower: null,
    firstContractDate: null,
  }));
}

/**
 * IMCore 객체에 마스킹 규칙을 적용합니다.
 * ★ 중요 규칙: 결손 항목(deficiencies)은 public에서도 마스킹하지 않고 투명하게 노출합니다.
 */
export function applyMask(core: IMCore, level: MaskLevel): IMCore {
  if (level === 'full') {
    return core;
  }

  return {
    ...core,
    address: maskAddress(core.address, level),
    leases: maskLeases(core.leases, level),
    attachedDocs: [], // public에서는 첨부 공부 파일 다운로드 제거
    deficiencies: core.deficiencies, // ★ 확인필요 사항은 공신력을 위해 그대로 노출
  };
}
