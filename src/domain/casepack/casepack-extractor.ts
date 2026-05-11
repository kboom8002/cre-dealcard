/**
 * CasePack Extractor — Phase 2 ④
 * Converts agent outputs into structured 8-Block CasePack
 * and persists to deal_casepacks table
 */
import type { BrokerDealCardResult } from '@/ai/agents/broker-deal-card';

export interface DealCasePack {
  building_ssot_lite_id: string;
  broker_id: string;
  task: string;
  knowledge: string;
  warning: string;
  output: string;
  audience: string;
  situation: string;
  logic: string;
  format: string;
  source_event_type: string;
}

/**
 * Extract CasePack from a completed deal card generation
 */
export function extractDealCardCasePack(
  result: BrokerDealCardResult,
  buildingId: string,
  brokerId: string,
): DealCasePack {
  const b = result.buildingTruth;
  const t = result.blindTeaser;

  const priceStr = b.priceBand ? ` ${b.priceBand}` : '';
  const vacancyStr = b.vacancySignal
    ? `공실: ${b.vacancySignal}`
    : '공실 여부 미확인';

  const hiddenCount = b.hiddenFields.length;

  return {
    building_ssot_lite_id: buildingId,
    broker_id: brokerId,
    task: `${b.areaSignal} ${b.assetType}${priceStr} 딜카드 생성`,
    knowledge: `${b.areaSignal} ${b.assetType} | ${b.fitSummary}`,
    warning: [
      b.cautionSummary,
      hiddenCount > 0 ? `${hiddenCount}개 민감 필드 자동 숨김` : null,
      ...(b.missingData.slice(0, 2)),
    ]
      .filter(Boolean)
      .join(' / '),
    output: t.kakaoText.slice(0, 500),
    audience: b.fitSummary.slice(0, 200),
    situation: vacancyStr,
    logic: '블라인드 딜카드 → Gate 요청 → 상세 자료 공개',
    format: '모바일 최적화, 카카오 공유 문구 포함',
    source_event_type: 'deal_card_created',
  };
}

/**
 * Extract CasePack when a match is computed
 */
export function extractMatchCasePack(params: {
  buildingId: string;
  brokerId: string;
  buildingLabel: string;
  matchGrade: string;
  matchScore: number;
  reasoning: string;
  purposeProfile: string;
}): DealCasePack {
  return {
    building_ssot_lite_id: params.buildingId,
    broker_id: params.brokerId,
    task: `${params.buildingLabel} 매수자 매칭 분석`,
    knowledge: `매칭 등급 ${params.matchGrade} (${params.matchScore}점) | 목적: ${params.purposeProfile}`,
    warning: params.matchScore < 50
      ? '매칭 점수 낮음 — 매수자 조건 재확인 필요'
      : '',
    output: params.reasoning,
    audience: `${params.purposeProfile} 목적 매수자`,
    situation: `매칭 점수 ${params.matchScore}점`,
    logic: `목적별 가중치(${params.purposeProfile}) → 시맨틱 거리 → 앙상블 평가`,
    format: '내부 브리핑용',
    source_event_type: 'match_computed',
  };
}
