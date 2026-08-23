/**
 * postpublish/types.ts — 발행 후 관리 F/S 엔진 및 AI 계약 타입
 * Spec: docs/imup/04_screen/POST_PUBLISH_SPEC.md (§0, §1, §2)
 */

export type FreshnessCode =
  | 'F01' // 등기부 열람 30일 경과
  | 'F02' // 토지이용계획 90일 경과
  | 'F03' // 실거래가 60일 경과
  | 'F04' // 건축물대장 60일 경과
  | 'F05' // 공시지가 연도 갱신 필요
  | 'F06' // 인근 실거래 신규 발생
  | 'F07' // 금리 변동 (0.25%p 이상)
  | 'F08' // 공실 기간 60일 이상 지속
  | 'F09' // 주요 임차 계약 만기 6개월 이내
  | 'F10'; // 갱신요구권 잔여 1년 미만

export type SignalCode =
  | 'S01' // 특정 섹션 이탈 집중 (이탈률 >= 40%)
  | 'S02' // 가격 슬라이드 체류 시간 극단값 (<3초 또는 >30초)
  | 'S03' // 공유 링크 재전달 급증 (기기수 >= 3)
  | 'S04' // CTA 전환율 저하
  | 'S05' // 특정 디바이스 이탈
  | 'S06' // 렌트롤 열람 후 즉시 이탈
  | 'S07' // 반복 열람 후 문의 미발생
  | 'S08'; // 발행 후 7일간 열람 0건

export type RuleCode = FreshnessCode | SignalCode;

export type FindingSeverity = 'block' | 'warn' | 'info';

/**
 * 결정적 룰 평가 결과 (Verdict)
 * ★ 중요 규칙: Verdict는 오직 rule 엔진에서만 생성되며, AI는 Verdict를 생성할 수 없습니다.
 */
export interface Verdict {
  source: 'rule';
  code: RuleCode;
  severity: FindingSeverity;
  resolved: boolean;
  message: string;
  details?: Record<string, any>;
  detectedAt?: string;
}

export interface Evidence {
  type: string;
  source: string;
  timestamp: string;
  value: string | number | boolean;
}

/**
 * AI 가설 (Hypothesis) - 원인 분석
 */
export interface Hypothesis {
  source: 'ai';
  signalCode: SignalCode;
  text: string;
  evidence: Evidence[]; // AI 가설은 근거(evidence)가 필수임 (evidence_not_empty 제약)
}

/**
 * AI 제안 (Suggestion) - 개선안
 */
export interface Suggestion {
  source: 'ai';
  target: string;
  before: string;
  after: string;
  reason: string;
}

/**
 * AI 출력 계약: AI는 오직 Hypothesis 또는 Suggestion만 생성 가능하며 Verdict는 배제됨
 */
export type AIOutput = Hypothesis | Suggestion;

/**
 * 발행 레코드 상태
 */
export type PublishRecordStatus = 'active' | 'superseded' | 'archived';

export interface PublishRecord {
  id: string;
  buildingId: string;
  version: number;
  status: PublishRecordStatus;
  publishedAt: string;
  supersededAt?: string;
  supersededBy?: string;
  findings: Verdict[];
  resolvedFindings: string[];
}
