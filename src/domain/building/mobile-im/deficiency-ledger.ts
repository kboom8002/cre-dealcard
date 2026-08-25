// src/domain/building/mobile-im/deficiency-ledger.ts
// 결손 원장 (Deficiency Ledger)
// 데이터 누락을 결손 객체로 정형화하여 화면 안내 및 신뢰성 확보
// Spec: API_TYPE_CONTRACT.md (D3 §4.3)

import type { Deficiency, Capability, LeaseRow, FinancialInput } from '@/types/im-core';
import type { InvestmentPosture } from '@/types/ontology';

export interface DeficiencyAuditInput {
  posture: InvestmentPosture;
  leases?: LeaseRow[];
  financials?: Partial<FinancialInput>;
  physical?: {
    farPct?: number | null;
    zoning?: string | null;
    completionYear?: number | null;
    landAreaSqm?: number | null;
  };
  hasPhotos?: boolean;
}

/**
 * 물건의 입력 데이터를 감사하여 결손 항목 목록(Deficiency[])을 생성합니다.
 */
export function auditDeficiencies(input: DeficiencyAuditInput): Deficiency[] {
  const deficiencies: Deficiency[] = [];

  // 1. 임대차 원장 결손 검사
  if (input.leases && input.leases.length > 0) {
    const liveLeases = input.leases.filter(l => l.leaseState === '임대중');

    const missingFirstContract = liveLeases.some(l => !l.firstContractDate);
    if (missingFirstContract) {
      deficiencies.push({
        field: 'firstContractDate',
        label: '임차인 최초 계약일',
        affects: ['vacate_schedule'],
        nextBest: '각 호실별 최초 입점 계약일을 입력하면 상임법 10년 갱신요구권 잔여기간과 명도 일정이 산출됩니다.',
        severity: input.posture === 'development' || input.posture === 'owner_occupied' ? 'block' : 'note',
      });
    }

    const missingLegalBasis = input.leases.some(l => !l.legalBasis || l.legalBasis === '미확인');
    if (missingLegalBasis) {
      deficiencies.push({
        field: 'legalBasis',
        label: '적용 법령 (상가/주택 구분)',
        affects: ['vacate_schedule'],
        nextBest: '상가/주택 적용 법령을 구분하면 법정 갱신요구권 산식이 정확히 적용됩니다.',
        severity: 'degrade',
      });
    }

    const missingMgmtFee = liveLeases.some(l => l.mgmtFeeKrw === null || l.mgmtFeeKrw === undefined);
    if (missingMgmtFee) {
      deficiencies.push({
        field: 'mgmtFeeKrw',
        label: '호실별 관리비',
        affects: ['yield_gross'],
        nextBest: '호실별 관리비를 입력하면 실질 월 총수입(Gross Income)이 산출됩니다.',
        severity: 'note',
      });
    }
  }

  // 2. 재무 입력 결손 검사
  if (input.financials) {
    if (input.financials.opexKrw == null) {
      deficiencies.push({
        field: 'opexKrw',
        label: '연간 실측 운영비 (Opex)',
        affects: ['yield_noi'],
        nextBest: '관리비·보험·재산세 등 실제 연간 운영비를 입력하면 연 수익률(Net Yield, 기준: NOI)이 산출됩니다.',
        severity: 'note',
      });
    }
  }

  // 3. 포스처별 특화 결손 검사
  if (input.posture === 'development') {
    if (!input.physical?.farPct && !input.physical?.zoning) {
      deficiencies.push({
        field: 'zoning',
        label: '용도지역 / 법정 용적률',
        affects: ['dev_feasibility'],
        nextBest: '토지이용계획을 조회하거나 용도지역을 입력하면 신축 가능 규모와 사업수지가 산출됩니다.',
        severity: 'block',
      });
    }
  }

  if (input.posture === 'owner_occupied') {
    deficiencies.push({
      field: 'marketRentPerPyeong',
      label: '인근 시장 임대료 (평당)',
      affects: ['saved_rent'],
      nextBest: '인근 유사 빌딩 평당 임대료를 입력하면 자가사용 시 연간 절감되는 임차료 실익이 산출됩니다.',
      severity: 'note',
    });
  }

  return deficiencies;
}
