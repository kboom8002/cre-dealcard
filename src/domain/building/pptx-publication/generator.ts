import { randomUUID } from 'crypto';
import type { CorePackage } from '../common-pipeline/core-assembler';
import type { PPTXDeckSpec, SlideDefinition } from './types';
import { computeTargetHash } from '../im-core/target-hash';

export const PPTX_BODY_PAGE_LIMIT = 16;

export function generateStructuredPPTXDeck(core: CorePackage): PPTXDeckSpec {
  const slides: SlideDefinition[] = [];

  // 1. Slide 1 (A01: Cover)
  slides.push({
    slideNumber: 1,
    archetype: 'A01',
    title: '투자 제안서 (Investment Memorandum)',
    category: 'body',
    leftContent: {
      leadText: '상업용 부동산 가치 제안',
      narrative: `본 문서는 연면적 ${core.physical.grossFloorAreaSqm.toLocaleString()}㎡ 규모의 우량 자산에 대한 투자 분석 보고서입니다.`,
    },
  });

  // 2. Slide 2 (A02: Property Overview)
  slides.push({
    slideNumber: 2,
    archetype: 'A02',
    title: '부동산 개요 및 지표',
    category: 'body',
    leftContent: {
      leadText: '자산 개요 요약',
      narrative: `대지면적 ${core.physical.landAreaSqm}㎡, 연면적 ${core.physical.grossFloorAreaSqm}㎡ 규모의 근린생활시설 자산입니다.`,
    },
    rightContent: {
      cards: [
        { label: '매매희망가', value: `${Math.floor(core.commercial.askingPriceKrw / 100000000)}억 원` },
        { label: '대지 평당가', value: `${Math.floor(core.unitPrices.pricePerPyeongLand / 10000).toLocaleString()}만 원` },
        { label: '연면적 평당가', value: `${Math.floor(core.unitPrices.pricePerPyeongGross / 10000).toLocaleString()}만 원` },
      ],
    },
  });

  // 3. Slide 3 (A04: Value Proposition & Split Layout)
  slides.push({
    slideNumber: 3,
    archetype: 'A04',
    title: '핵심 투자 포인트',
    category: 'body',
    leftContent: {
      leadText: '자산 가치 제안 (Value Proposition)',
      narrative: '역세권 입지와 안정적인 임대차 구성을 기반으로 지속 가능한 현금흐름 창출이 기대됩니다.',
    },
    rightContent: {
      cards: [
        { label: '입지 우수성', value: '역세권 도보권', detail: '풍부한 배후 유동인구' },
        { label: '임대 안정성', value: `공실률 ${core.rentroll.physicalVacancyRatePct}%`, detail: '안정적 테넌트 구성' },
        { label: '사옥 활용도', value: '기업 단독 브랜딩', detail: '사옥 단독 명칭 표기(간판 설치권) 가능' },
      ],
    },
  });

  // 4. Slide 4 (A08: Rent Roll Summary)
  slides.push({
    slideNumber: 4,
    archetype: 'A08',
    title: '임대차 상세 현황',
    category: 'body',
    tables: [
      {
        headers: ['구분', '총 보증금', '총 월임대료', '공실률'],
        rows: [
          [
            '합계',
            `${Math.floor(((core.commercial.totalDepositKrw ?? 0) / 10000)).toLocaleString()}만 원`,
            `${Math.floor(((core.commercial.monthlyRentKrw ?? 0) / 10000)).toLocaleString()}만 원`,
            `${core.rentroll.physicalVacancyRatePct}%`,
          ],
        ],
      },
    ],
  });

  // 5. Slide 5 (A15: Closing)
  slides.push({
    slideNumber: 5,
    archetype: 'A15',
    title: '매각 및 취득 절차 안내',
    category: 'body',
    leftContent: {
      leadText: '향후 진행 절차',
      narrative: '투자 의향서(LOI) 접수 후 상세 실사(Due Diligence) 및 본계약 체결 단계로 진행됩니다.',
    },
  });

  // Appendix (Excluded from 16-page hard limit)
  slides.push({
    slideNumber: 6,
    archetype: 'A90',
    title: '[부록] 토지이용계획 및 권리관계 발췌',
    category: 'appendix',
    leftContent: {
      leadText: '공부 발췌 원본',
      narrative: '토지이용계획확인원 및 건축물대장 세부 기재사항입니다.',
    },
  });

  const bodySlides = slides.filter((s) => s.category === 'body');
  const appendixSlides = slides.filter((s) => s.category === 'appendix');

  if (bodySlides.length > PPTX_BODY_PAGE_LIMIT) {
    throw new Error(`PPTX_BODY_OVERFLOW: Body slides (${bodySlides.length}) exceeded limit of ${PPTX_BODY_PAGE_LIMIT}`);
  }

  const deckId = randomUUID();
  const createdAt = new Date().toISOString();

  const deckHash = computeTargetHash({
    body: {
      deckId,
      dealId: core.dealId,
      corePackageHash: core.packageHash,
      slides,
    },
    releaseTier: 'decision_im',
    policyVersion: '2026-08-31',
  });

  return {
    deckId,
    dealId: core.dealId,
    corePackageHash: core.packageHash,
    slides,
    bodySlideCount: bodySlides.length,
    appendixSlideCount: appendixSlides.length,
    deckHash,
    createdAt,
  };
}
