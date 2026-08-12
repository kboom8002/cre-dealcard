/**
 * @file posture-prompts.ts
 * @description investmentPosture별 AI 프롬프트 오버레이
 * logistics-im-prompt.ts 패턴을 5 posture로 확장
 */
import type { InvestmentPosture } from '@/domain/ontology';
import type { ArchetypeCode } from './archetype-registry';

const DEFAULT_POSTURE_CONTEXT: Record<string, string> = {
  income: '임대수익 극대화 및 안정적 현금흐름 관점에서 서술하세요.',
  development: '개발 사업의 타당성과 수익성 관점에서 서술하세요.',
  operating: '직영 운영 수익성과 GOP 마진 관점에서 서술하세요.',
  owner_occupied: '자가사용 비용절감 및 자산가치 관점에서 서술하세요.',
  trading: '매매차익 실현 가능성 및 시세 갭 관점에서 서술하세요.',
};

/** posture별 섹션 프롬프트 오버레이 반환. 해당 없으면 null */
export function getPosturePromptOverlay(
  posture: InvestmentPosture,
  section: string,
  archetype?: ArchetypeCode,
): string | null {
  const overlay = POSTURE_OVERLAYS[posture]?.[section];
  if (!overlay) {
    const defaultContext = DEFAULT_POSTURE_CONTEXT[posture];
    if (defaultContext) return defaultContext;
    return null;
  }

  const archetypeNote = archetype ? `\n[아키타입: ${archetype}]` : '';
  return overlay + archetypeNote;
}

const POSTURE_OVERLAYS: Record<string, Record<string, string>> = {
  income: {
    // income은 기본이므로 오버레이 불필요 (기존 narrative-prompt.ts가 담당)
  },
  owner_occupied: {
    occupancy_fit: `
[사옥 적합성 분석 지침]
- 기업 규모별 필요 면적 대비 본 건물의 전용률·공용률 적합도 분석
- 주차 대수 대비 직원 수 예상 적정성
- 회의실·로비·카페테리아 등 부대시설 확보 가능성
- 층간 이동 동선 효율성 (엘리베이터 용량 vs 예상 이용 인원)
- CI/BI 외부 노출 가능 여부 (간판, 파사드)
- 중요: 반드시 수치적 근거 기반으로 작성할 것`,
    cost_comparison: `
[비용 비교 분석 지침]
- 자가 매입 vs 임차 10년 비교 시나리오
- 매입 시: 취득세 4.6%, 법인세 절감(감가상각), 자산 가치 상승
- 임차 시: 보증금 기회비용, 임대료 인상률 3%/년 반영
- 매각가 기준 평당가와 권역 사옥 평당가 비교
- 중요: 추정 수치임을 명확히 표기할 것`,
  },
  development: {
    site_analysis: `
[대지 분석 지침]
- 용적률 현재 vs 법정 상한 → 잔여 용적률 (%)
- 건폐율 현재 vs 법정 상한 → 증축/신축 가능 면적 (㎡)
- 일조권·도로사선 제한 분석 (방위, 인접 도로폭)
- 정북방향·인접대지 이격거리 제한
- 토지형상(정형/부정형) 및 접도 조건
- 중요: 관할 관청 확인 필수 문구 포함`,
    development_feasibility: `
[개발 사업수지 분석 지침]
- 토지비 + 공사비 + 부대비용 → 총 사업비 산정
- 예상 분양가 × 분양면적 → 총 분양수입
- 사업수익률(%) = (분양수입 - 총사업비) / 총사업비 × 100
- 시공비 단가는 권역 평균 기준 (평당 550~700만원)
- PF 조건: LTV 60%, 금리 7~9% 기준
- 인허가 소요기간 및 리스크 명기
- 중요: 모든 수치는 AI 추정값이며 실제 사업수지와 다를 수 있음 명기`,
  },
  operating: {
    operation_overview: `
[운영 개요 분석 지침]
- 객실 수, 객실 유형별 비중, 가동률(OCC) 분석
- ADR(Average Daily Rate) 및 RevPAR 산정
- F&B, 부대시설(피트니스, 연회장 등) 매출 비중
- 운영사(브랜드) 계약 조건 (관리수수료, 인센티브)
- 인건비 비중 및 시즌별 변동
- 중요: GOP/NOI 구분 명확히 할 것`,
    gop_analysis: `
[GOP 분석 지침]
- GOP = 총매출 - 영업비용(인건비+운영비+마케팅비)
- GOP 마진 = GOP / 총매출 × 100 (%)
- GOP 기반 Cap Rate = GOP / 매각가 × 100
- 3개년 GOP 추세 분석 (가능 시)
- 시즌별 매출 변동성 및 손익분기 가동률
- 중요: 운영 데이터 미확보 시 '확인 필요' 명기`,
  },
  trading: {
    market_position: `
[시장 포지셔닝 분석 지침]
- 권역 내 동종 자산 평단가 대비 본 자산 평단가 위치
- 최근 3년 권역 거래 회전율 분석
- 매각가 대비 대체원가(토지비+건축비) 비교
- 시장 사이클 내 현재 위치 판단 (회복/성장/과열/조정)
- 중요: 단기 시세 전망은 불확실하므로 단정적 표현 금지`,
    comparable_analysis: `
[비교사례 분석 지침]
- 최근 12개월 이내 인근 유사 거래 3건 이상 비교
- 비교 항목: 평당가, 총 거래가, 건물연령, 연면적, Cap Rate
- 본 자산 vs 비교사례 평단가 프리미엄/디스카운트 산정
- 거래 조건 차이 보정 (리모델링 상태, 공실률 등)
- 중요: 비교 가능 사례 부족 시 '데이터 제한' 명기`,
  },
};
