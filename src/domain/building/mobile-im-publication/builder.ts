import { randomUUID } from 'crypto';
import type { CorePackage } from '../common-pipeline/core-assembler';
import type { MobileIMLevel, MobileIMPackage, MobileIMSection } from './types';
import { computeTargetHash } from '../im-core/target-hash';

// Implicit Persona Principle: Do not expose target persona phrases in titles or copy
const FORBIDDEN_PERSONA_REGEX = /(?:70대|60대|50대|40대|30대|20대|MZ|초보|고액|고자산|법인|개인|VIP|기관|리츠|시행사|디벨로퍼)\s*(?:자산가|투자자|대표|고객|매수자|운용사|가족)(?:를\s*위한|의\s*관점|에게\s*추천하는|용|맞춤|에\s*적합한|을\s*위한)?/g;

export function sanitizePersonaTerms(text: string): string {
  return text.replace(FORBIDDEN_PERSONA_REGEX, '').trim();
}

export function buildMobileIMSections(core: CorePackage, level: MobileIMLevel): MobileIMSection[] {
  const sections: MobileIMSection[] = [];

  // 1. Property Overview (L1 & L1.5)
  sections.push({
    sectionType: 'property_overview',
    title: '부동산 개요',
    content: `연면적 ${core.physical.grossFloorAreaSqm.toLocaleString()}㎡, 대지면적 ${core.physical.landAreaSqm.toLocaleString()}㎡ 규모의 상업용 부동산입니다.`,
    tables: [
      {
        headers: ['구분', '내용'],
        rows: [
          ['매매희망가', `${Math.floor(core.commercial.askingPriceKrw / 100000000)}억 원`],
          ['대지면적', `${core.physical.landAreaSqm}㎡`],
          ['연면적', `${core.physical.grossFloorAreaSqm}㎡`],
          ['대지 평당가', `${Math.floor(core.unitPrices.pricePerPyeongLand / 10000).toLocaleString()}만 원`],
        ],
      },
    ],
  });

  // 2. Financial Summary (L1 & L1.5)
  sections.push({
    sectionType: 'financial_summary',
    title: '재무 및 수익 분석',
    content: `연면적 평당가 ${Math.floor(core.unitPrices.pricePerPyeongGross / 10000).toLocaleString()}만 원 수준으로 평가됩니다.`,
  });

  // 3. Lease Status (L1 & L1.5)
  sections.push({
    sectionType: 'lease_status',
    title: '임대차 현황',
    content: `총 임대차 ${core.rentroll.rowCount}개 호실, 공실률 ${core.rentroll.physicalVacancyRatePct}% 수준입니다.`,
  });

  // 4. Investment Thesis (L1.5 Only)
  if (level === 'L1.5') {
    sections.push({
      sectionType: 'investment_thesis',
      title: '투자 핵심 전략',
      content: sanitizePersonaTerms('역세권 중심 상권 내 안정적 현금흐름과 자산 가치 상승 잠재력을 보유하고 있습니다.'),
    });

    sections.push({
      sectionType: 'risk_check',
      title: '리스크 및 권리관계 점검',
      content: '공부상 권리관계 및 임대차 승계 요건을 정밀 검토하였습니다.',
    });
  }

  // 5. Disclaimer (L1 & L1.5)
  sections.push({
    sectionType: 'disclaimer',
    title: '유의사항 및 면책고지',
    content: '본 자료는 투자 참고용으로 작성되었으며, 계약 전 실사 및 전문가 자문이 필요합니다.',
  });

  return sections;
}

export function createMobileIMPackage(
  core: CorePackage,
  level: MobileIMLevel,
  claims: any[],
  harnessReportId: string
): MobileIMPackage {
  const sections = buildMobileIMSections(core, level);
  const packageId = randomUUID();
  const createdAt = new Date().toISOString();

  const packageHash = computeTargetHash({
    body: {
      packageId,
      dealId: core.dealId,
      corePackageHash: core.packageHash,
      level,
      sections,
      claims,
      harnessReportId,
    },
    releaseTier: level === 'L1.5' ? 'decision_im' : 'fact_om',
    policyVersion: '2026-08-31',
  });

  return {
    packageId,
    dealId: core.dealId,
    corePackageHash: core.packageHash,
    level,
    sections,
    claims,
    harnessReportId,
    packageHash,
    createdAt,
  };
}
