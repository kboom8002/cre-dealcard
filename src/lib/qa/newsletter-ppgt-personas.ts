/**
 * @file src/lib/qa/newsletter-ppgt-personas.ts
 * @description 뉴스레터 작성 파이프라인 & 산출물 4종 특화 Parametric Persona Golden Testing (PPGT-Loop)
 *   마이크로 타겟 페르소나 6종(NL-MG-01..06), 콘텐츠 적합성 가중 R1 스코어러, 비보상 하한 캡(R2),
 *   반아첨 음성 대조군 검증(NC-NL-01..03), 및 P-Score 백로그 우선순위 엔진.
 *
 * PPGT-Loop 불변식 준수:
 * - INV-P01 (TC21): status === 'provisional' 동안 populationShare === null, populationShareMetadata === null
 * - INV-P02 (TC23): 미관측/비적용 차원에 0.5 대입 금지 (estimate: null + missingReason 명시)
 * - INV-P03 (TC34): 정치/이념/민감 속성 프로파일링 차원 전면 배제
 * - INV-P05 (INV-403): stableDimensions 와 transientState 분리
 * - INV-P06 / P07: 합성 반응 "[SIMULATED] " 접두사 강제 및 개인 타게팅 금지
 */

export type NewsletterPpgtPersonaId =
  | 'NL-MG-01'
  | 'NL-MG-02'
  | 'NL-MG-03'
  | 'NL-MG-04'
  | 'NL-MG-05'
  | 'NL-MG-06';

export type PpgtAxisId =
  | 'U1_first10s_clarity'
  | 'U2_visual_ergonomics'
  | 'U3_flow_resilience'
  | 'C1_provenance_honesty'
  | 'C2_artifact_shareability'
  | 'C3_safe_domain_fit';

export type PersonaStatus = 'provisional' | 'calibrated';
export type GtmTier = 'P0_conversion' | 'P0_viral' | 'P1_retention' | 'OPS_foundation';
export type BacklogTier = 'P0_immediate' | 'P1_near_term' | 'P2_experiment';
export type RemediationTrack = 'track1_ui_gate_renderer' | 'track2_tf8_prompt';

export interface StableDimensionEntry {
  dimensionId: string;
  labelKo: string;
  estimate: number | null;
  missingReason?: 'not_observed' | 'not_applicable_role';
  priorInterval?: readonly [number, number];
  evidenceIds: readonly string[];
  mappedAxes: readonly PpgtAxisId[];
}

export interface PatternAttractor {
  id: string;
  kind: 'core' | 'boundary';
  titleKo: string;
  salientAxes: readonly PpgtAxisId[];
  steps: readonly [string, string, string, string, string, string, string];
}

export interface NewsletterPpgtPersonaSpec {
  id: NewsletterPpgtPersonaId;
  nameKo: string;
  roleKo: string;
  status: PersonaStatus;
  populationShare: number | null;
  populationShareMetadata: { surveyDate: string; sampleSize: number } | null;
  gtmTier: GtmTier;
  gtmWeight: number;
  syntheticLabelRequired: true;
  individualTargetingProhibited: true;
  routingAxes: {
    literacyDistance: 'senior_high' | 'mid' | 'expert';
    entryChannel:
      | 'workspace_editor'
      | 'kakao_reader_mobile'
      | 'subscribe_landing'
      | 'dispatch_console';
    mode: 'creator' | 'consumer' | 'adversarial';
    domainScope: 'monthly_weekly_authoring' | 'reader_4deliverables' | 'consent_send_gate';
    viewportProfile: {
      width: number;
      height: number;
      fontScale: 'normal' | 'xlarge';
    };
  };
  stableDimensions: readonly StableDimensionEntry[];
  transientState: {
    relationshipState:
      | 'first_visit'
      | 'repeat_broker'
      | 'vip_owner_reader'
      | 'new_subscriber'
      | 'ops_broadcaster'
      | 'chaos_probe';
    taskConstraints: string;
    exposureState: 'unexposed' | 'editor_to_publish' | 'kakao_link_open' | 'email_render';
  };
  attractors: readonly [PatternAttractor, PatternAttractor];
  forbiddenDimensionAuditPassed: boolean;
}

export interface NewsletterPpgtIssueHint {
  issueKey: string;
  targetFileHint: string;
  axis: PpgtAxisId;
  track: RemediationTrack;
  summary: string;
}

export interface NewsletterPpgtProbeMetrics {
  personaId: NewsletterPpgtPersonaId;
  surface: string;
  viewport: string;
  fontScale: 'normal' | 'xlarge';
  aboveFoldActionCount: number;
  totalVisibleInteractiveCount: number;
  horizontalOverflowPx: number;
  sub44ButtonsCount: number;
  sub15TextsCount: number;
  clippedButtonsCount: number;
  brokenImgCount: number;
  consoleErrorCount: number;
  pageErrorCount: number;
  poisonTokenCount: number;
  bannedTermCount: number;
  /** 콘텐츠 적합성 위반 건수 (가십·투자권유·내부라벨·잘림·주기 불일치·허위 검증배지) */
  contentSuitabilityViolationsCount?: number;
  taskCompleted: boolean;
  blockingModalDetected: boolean;
  boundaryViolationCount: number;
  provenanceBadgeVisible: boolean;
  artifactValid: boolean;
  stepCount?: number;
  honestSaveVisible?: boolean;
  observedHeadings?: readonly string[];
  observedButtons?: readonly string[];
  observedBadges?: readonly string[];
  issueHints?: readonly NewsletterPpgtIssueHint[];
}

export interface NewsletterPpgtScoreResult {
  personaId: NewsletterPpgtPersonaId;
  surface: string;
  r1Axes: Record<PpgtAxisId, number>;
  axisSalience: Record<PpgtAxisId, number>;
  r2Axes: Record<PpgtAxisId, number>;
  rawWeightedOverall: number;
  weightedOverall: number;
  minAxisScore: number;
  floorRisk: boolean;
  floorReasons: string[];
  syntheticSummary: string;
  issueHints: NewsletterPpgtIssueHint[];
}

export interface NewsletterPpgtBacklogCluster {
  issueKey: string;
  targetFileHint: string;
  axis: PpgtAxisId;
  track: RemediationTrack;
  pScore: number;
  tier: BacklogTier;
  anyFloorRisk: boolean;
  affectedPersonas: NewsletterPpgtPersonaId[];
  summaries: string[];
}

export const PPGT_ALL_AXES: readonly PpgtAxisId[] = [
  'U1_first10s_clarity',
  'U2_visual_ergonomics',
  'U3_flow_resilience',
  'C1_provenance_honesty',
  'C2_artifact_shareability',
  'C3_safe_domain_fit',
] as const;

const PROHIBITED_DIMENSION_TOKENS =
  /politic|ideolog|party|vote|religion|race|ethnic|sexual|orient/i;

function clampScore(value: number): number {
  return Math.round(Math.min(5.0, Math.max(1.0, value)) * 100) / 100;
}

export function formatSimulatedReaction(text: string): string {
  const trimmed = text.trim();
  return trimmed.startsWith('[SIMULATED] ') ? trimmed : `[SIMULATED] ${trimmed}`;
}

export function getGtmWeight(tier: GtmTier): number {
  if (tier === 'P0_conversion' || tier === 'P0_viral') return 1.5;
  if (tier === 'P1_retention' || tier === 'OPS_foundation') return 1.2;
  return 1.0;
}

function dim(
  dimensionId: string,
  labelKo: string,
  estimate: number | null,
  mappedAxes: readonly PpgtAxisId[],
  options: {
    evidenceIds?: readonly string[];
    priorInterval?: readonly [number, number];
    missingReason?: 'not_observed' | 'not_applicable_role';
  } = {},
): StableDimensionEntry {
  if (estimate === null) {
    return {
      dimensionId,
      labelKo,
      estimate: null,
      missingReason: options.missingReason ?? 'not_observed',
      evidenceIds: [],
      mappedAxes,
    };
  }
  return {
    dimensionId,
    labelKo,
    estimate,
    priorInterval: options.priorInterval ?? [
      Math.max(0, Math.round((estimate - 0.12) * 100) / 100),
      Math.min(1, Math.round((estimate + 0.12) * 100) / 100),
    ],
    evidenceIds: options.evidenceIds ?? ['EV-NL-WORKFLOW'],
    mappedAxes,
  };
}

export const NEWSLETTER_PPGT_PERSONAS: readonly NewsletterPpgtPersonaSpec[] = [
  {
    id: 'NL-MG-01',
    nameKo: '60대 시니어 대표 중개사 (박준영 대표)',
    roleKo: '큰 글씨(xlarge 21px) · 3단계 최소 작성 → 발송 완주 창작자',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'P0_conversion',
    gtmWeight: 1.5,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'senior_high',
      entryChannel: 'workspace_editor',
      mode: 'creator',
      domainScope: 'monthly_weekly_authoring',
      viewportProfile: { width: 1440, height: 900, fontScale: 'xlarge' },
    },
    stableDimensions: [
      dim('senior_readability_demand', '큰 글씨(21px) 배지 겹침·사이드바 잘림 민감도', 0.96, [
        'U2_visual_ergonomics',
        'U1_first10s_clarity',
      ]),
      dim('tab2_cognitive_load_sensitivity', '내용 편집 탭 동시 노출 버튼 홍수 민감도', 0.94, [
        'U1_first10s_clarity',
        'U3_flow_resilience',
      ]),
      dim('editorial_dignity_tone_trust', '50~70대 자산가 독자 대상 문체 품격 민감도', 0.9, [
        'C3_safe_domain_fit',
        'C2_artifact_shareability',
      ]),
      dim('crm_bulk_upload_fluency', '대량 CSV 세그먼트 관리 숙련도', null, ['U3_flow_resilience'], {
        missingReason: 'not_applicable_role',
      }),
    ],
    transientState: {
      relationshipState: 'first_visit',
      taskConstraints: '10분 내 월간호 초안 → 미리보기 확인 → 발행 완주 (지연·용어 혼란 금지)',
      exposureState: 'editor_to_publish',
    },
    attractors: [
      {
        id: 'NL-ATT-01-CORE',
        kind: 'core',
        titleKo: '제목 칩 선택 → 핵심 3단계 무마찰 편집 → 즉시 발행',
        salientAxes: ['U1_first10s_clarity', 'U2_visual_ergonomics'],
        steps: [
          '/broker/w/newsletter 진입 후 3단계 탭과 발행 주기 선택 즉시 인지',
          '추천 제목 칩 클릭으로 첫 10초 내 빈 화면 막힘 해소',
          'Tab 2에서 보조 통계 입력칸이 접혀 있어 핵심 브리핑·5선에 바로 집중',
          '우측 미리보기에서 xlarge 글씨 기준 배지 겹침 없이 실물 확인',
          '부적합 문구·투자권유 금지어 포함 시 친절한 한글 사유로 안전 안내',
          '422 법정 정보 누락 시 프로필 바로가기 링크로 복구 동선 유지',
          '3단계 보내기 탭에서 1클릭 발행 및 카톡 공유 링크 확보',
        ],
      },
      {
        id: 'NL-ATT-01-BOUNDARY',
        kind: 'boundary',
        titleKo: 'Tab 2 버튼 홍수 및 xlarge 배지 겹침으로 중도 포기',
        salientAxes: ['U1_first10s_clarity', 'U2_visual_ergonomics', 'C3_safe_domain_fit'],
        steps: [
          'Tab 2 진입 즉시 145개 이상 입력칸이 한꺼번에 쏟아져 시선 상실',
          'xlarge 모드에서 통계 01 배지가 겹치거나 좌측 발행주기 여백 밀착',
          '개발자 용어(슬러그·바텀시트)나 내부 라벨(핵심 팩트:) 노출로 불신',
          '무엇을 눌러야 저장·발행되는지 헷갈려 5초 이상 정지',
          '오류 발생 시 원인을 몰라 편집 유실 우려로 창 닫기',
          '동료 브로커에게 복잡한 도구로 부정 피드백 전달',
          '창작자 이탈 확정',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'NL-MG-02',
    nameKo: '30~40대 전략 팀장 브로커',
    roleKo: '월간·주간 주기 전환 · 5대 채널 큐레이션 · 클릭-투-에딧 정밀 편집자',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'P0_conversion',
    gtmWeight: 1.5,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'expert',
      entryChannel: 'workspace_editor',
      mode: 'creator',
      domainScope: 'monthly_weekly_authoring',
      viewportProfile: { width: 1440, height: 900, fontScale: 'normal' },
    },
    stableDimensions: [
      dim('source_transparency_demand', '공공DB 실측 vs 참고기준치 vs 폴백 예시 구분 민감도', 0.96, [
        'C1_provenance_honesty',
        'C3_safe_domain_fit',
      ]),
      dim('preview_click_sync_precision', '미리보기 클릭-투-에딧 및 AI Undo 반응 정합성', 0.92, [
        'U3_flow_resilience',
        'U1_first10s_clarity',
      ]),
      dim('cross_deliverable_parity', '웹뷰어·이메일·카톡·OG 4종 수치·주기 일관성', 0.93, [
        'C2_artifact_shareability',
        'C1_provenance_honesty',
      ]),
    ],
    transientState: {
      relationshipState: 'repeat_broker',
      taskConstraints: '권역 통계 조합 변경 + 실시간/폴백 기사 구분 + 매물 3선 IM 브릿지 첨부',
      exposureState: 'editor_to_publish',
    },
    attractors: [
      {
        id: 'NL-ATT-02-CORE',
        kind: 'core',
        titleKo: '출처 정직성 확보 + 실시간 미리보기 동기화 + 4종 산출물 일관성',
        salientAxes: ['C1_provenance_honesty', 'U3_flow_resilience', 'C2_artifact_shareability'],
        steps: [
          '일간·주간·월간 전환 시 헤드라인·통계 2선·카드 구조 즉각 정합 전환',
          'CURATED_CHANNEL_POOL 폴백 사용 시 참고 예시 배지로 명확히 구분',
          '우측 미리보기 통계 카드 클릭 시 Tab 2 다듬기 영역 자동 펼침 + 포커스',
          'AI 5선 재구성 후 이전 이슈 복원(Undo) 무손실 동작',
          '매물 코멘트·체크포인트 입력 시 미출처 숫자 M11 교정 안내',
          '이메일·카톡·OG 카드 모두 동일 제목·지번 마스킹 유지',
          '고정형 월간 자산관리 리포트로 VIP 배포 완료',
        ],
      },
      {
        id: 'NL-ATT-02-BOUNDARY',
        kind: 'boundary',
        titleKo: '가짜 통계 사칭·클릭-투-에딧 불발·미저장 수정분 누락',
        salientAxes: ['C1_provenance_honesty', 'U3_flow_resilience'],
        steps: [
          '참고 기준치를 국토부 실시간 DB인 것처럼 오인 표기',
          '지난 큐레이션 예시 기사를 실시간 오늘 뉴스처럼 혼동',
          '미리보기 클릭 시 입력칸이 접혀 있어 포커스 실종',
          'AI 재구성 후 복원 불가로 작성 본문 유실',
          '웹과 이메일 제목/주기가 어긋나 고객 문의 혼선',
          '전문성 의심으로 브로커 팀 신뢰 하락',
          '팀 도입 철회',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'NL-MG-03',
    nameKo: '50~70대 자산가 · 건물주 독자',
    roleKo: '카카오톡·이메일 링크 모바일(390/360px) 열람 · 30초 스캔 VIP 수신자',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'P0_viral',
    gtmWeight: 1.5,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'senior_high',
      entryChannel: 'kakao_reader_mobile',
      mode: 'consumer',
      domainScope: 'reader_4deliverables',
      viewportProfile: { width: 390, height: 844, fontScale: 'xlarge' },
    },
    stableDimensions: [
      dim('mobile_scan_ergonomics', '390px/360px 가로 넘침 제로 및 44px 이상 터치 타겟', 0.96, [
        'U2_visual_ergonomics',
        'U1_first10s_clarity',
      ]),
      dim('editorial_trust_honesty', '가십·투자권유·과장 배지 없는 차분한 VIP 품격', 0.95, [
        'C1_provenance_honesty',
        'C3_safe_domain_fit',
      ]),
      dim('im_bridge_conversion_ease', '추천 매물 카드에서 모바일 IM 열람 및 문의 매끄러움', 0.88, [
        'C2_artifact_shareability',
        'U3_flow_resilience',
      ]),
    ],
    transientState: {
      relationshipState: 'vip_owner_reader',
      taskConstraints: '30초 내 시장 분위기 파악 → Axios 5선 스캔 → 매물 IM 열람 및 문의',
      exposureState: 'kakao_link_open',
    },
    attractors: [
      {
        id: 'NL-ATT-03-CORE',
        kind: 'core',
        titleKo: '모바일 30초 핵심 스캔 + 정직한 검증 배지 + 매물 IM 즉시 전환',
        salientAxes: ['U2_visual_ergonomics', 'C1_provenance_honesty', 'C2_artifact_shareability'],
        steps: [
          '카톡 OG 카드 1200×630 한글 깨짐 없이 클릭 진입',
          '상단 시장 온도·브리핑이 10초 내 한눈에 들어옴',
          'Axios 5선 카드 하단 "원문 보기 ↗" 줄바꿈 깨짐 없이 한 줄 정돈',
          '무매물 호수는 "CREDEAL 안심 매거진"으로 과장 없이 표기',
          '영문 약어(Cap Rate, NOI) 첫 등장 시 한글 병기로 막힘 없는 독해',
          '매물 카드에서 /im-lite 모바일 IM 열람 및 수지계산기 즉시 확인',
          '담당 중개사에게 신뢰 기반 상담 문의 접수',
        ],
      },
      {
        id: 'NL-ATT-03-BOUNDARY',
        kind: 'boundary',
        titleKo: '가십·확정수익 권유·과장 배지 또는 모바일 레이아웃 깨짐으로 수신거부',
        salientAxes: ['C1_provenance_honesty', 'C3_safe_domain_fit', 'U2_visual_ergonomics'],
        steps: [
          '연예인 자택 경매 가십 또는 "연 8.5% 확정 수익 보장" 문구 노출',
          '매물 없는 뉴스레터 하단에 "공적장부 교차검증" 허위 배지 표시',
          '모바일에서 "원문 보기 / ↗" 개행 및 가로 스크롤 발생',
          '상세 지번(736-1 등) 무단 노출 또는 잘린 헤드라인 노출',
          '품격 미달로 판단해 하단 수신거부 즉시 클릭',
          '스팸 신고 또는 중개사 차단',
          'VIP 잠재 고객 영구 이탈',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'NL-MG-04',
    nameKo: '신규 구독 신청 · 원클릭 수신거부 독자',
    roleKo: '구독 폼 동의 분리(PIPA·광고성·14세) 및 수신거부 완결 검증자',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'P1_retention',
    gtmWeight: 1.2,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'mid',
      entryChannel: 'subscribe_landing',
      mode: 'consumer',
      domainScope: 'consent_send_gate',
      viewportProfile: { width: 390, height: 844, fontScale: 'normal' },
    },
    stableDimensions: [
      dim('consent_clarity_without_pressure', '동의 항목 분리 명확성 및 TrackingNotice 간결성', 0.93, [
        'U1_first10s_clarity',
        'C3_safe_domain_fit',
      ]),
      dim('unsub_guarantee_trust', '더블 옵트인 및 원클릭 수신거부·억제 확실성', 0.95, [
        'C3_safe_domain_fit',
        'U3_flow_resilience',
      ]),
    ],
    transientState: {
      relationshipState: 'new_subscriber',
      taskConstraints: '모바일 390px에서 필수 동의 후 구독 신청 또는 즉시 수신거부 완수',
      exposureState: 'kakao_link_open',
    },
    attractors: [
      {
        id: 'NL-ATT-04-CORE',
        kind: 'core',
        titleKo: '깔끔한 48px 입력폼 + 1줄 요약 고지 + 원클릭 수신거부 억제',
        salientAxes: ['C3_safe_domain_fit', 'U1_first10s_clarity'],
        steps: [
          '/magazine/[brokerId]/subscribe 모바일 390px 가로 넘침 0px 진입',
          '연락처·이메일 입력칸 >=48px 터치 편안함 확보',
          'PIPA·광고성·만 14세 필수 동의 항목이 직관적으로 구분됨',
          'TrackingNotice 핵심 고지 + 개인정보 처리방침 링크 명확히 노출',
          '거부 방법은 접힘(<details>)으로 숨겨 독자 피로 감소',
          '더블 옵트인 미완료 시 sendGate가 자동 발송 차단',
          '수신거부 클릭 즉시 발송 원장에서 차단 보장',
        ],
      },
      {
        id: 'NL-ATT-04-BOUNDARY',
        kind: 'boundary',
        titleKo: '장문 약관 압도·미동의 발송·수신거부 후 재발송 사고',
        salientAxes: ['C3_safe_domain_fit', 'U3_flow_resilience'],
        steps: [
          '구독 하단에 해지/방문자 번호 기술 문구가 장문으로 도배되어 이탈',
          '동의 체크 없이 제출 허용 또는 처리방침 링크 누락',
          '모바일 입력칸이 16px 미만이라 iOS 강제 확대 발생',
          '수신거부 후에도 다음 주 메일이 다시 발송됨',
          '정보통신망법 위반 과태료 위험 발생',
          '브로커 계정 발송 정지',
          '법적 분쟁 리스크',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'NL-MG-05',
    nameKo: '운영 · 발송 콘솔 & CRM 추적 브로커',
    roleKo: '보내기 탭 · 구독자 0명 대응 · 야간/미동의 제외 검증 · 발송 정직성 검증자',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'P1_retention',
    gtmWeight: 1.2,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'mid',
      entryChannel: 'dispatch_console',
      mode: 'creator',
      domainScope: 'consent_send_gate',
      viewportProfile: { width: 1440, height: 900, fontScale: 'normal' },
    },
    stableDimensions: [
      dim('send_readiness_honesty', 'Dry-Run/실발송 및 제외 사유(야간·미동의·억제) 정직성', 0.95, [
        'C1_provenance_honesty',
        'C3_safe_domain_fit',
      ]),
      dim('empty_subscriber_guidance', '구독자 0명 상태 막다른 골목 없는 다음 액션 안내', 0.9, [
        'U1_first10s_clarity',
        'U3_flow_resilience',
      ]),
    ],
    transientState: {
      relationshipState: 'ops_broadcaster',
      taskConstraints: '보내기 탭에서 링크 복사·카톡 공유·이메일 발송 전 법정/수신자 검증',
      exposureState: 'email_render',
    },
    attractors: [
      {
        id: 'NL-ATT-05-CORE',
        kind: 'core',
        titleKo: '실발송/테스트 구분 명확 + 야간·미동의 자동 보호 + 법정 5대 표기 확인',
        salientAxes: ['C1_provenance_honesty', 'C3_safe_domain_fit'],
        steps: [
          '보내기 탭 진입 시 현재 저장/발행 상태 배지 명확히 확인',
          '이메일 HTML·텍스트 및 알림톡 본문에 (광고)·전송자·해지링크 100% 포함',
          '구독자 0명 시 구독 링크 복사/테스트 발송 안내 CTA 제공',
          '21:00~08:00 KST 야간·미동의·반송 억제 대상자 자동 제외 표시',
          'Dry-Run 모드를 실발송 완료로 과장 표시하지 않음',
          '합성 점수(62/100 등) 노출 제로',
          '안전하고 재현 가능한 VIP 뉴스레터 발송 운영',
        ],
      },
      {
        id: 'NL-ATT-05-BOUNDARY',
        kind: 'boundary',
        titleKo: '가짜 발송 성공 표시·합성 점수 노출·야간 오발송 사고',
        salientAxes: ['C1_provenance_honesty', 'C3_safe_domain_fit'],
        steps: [
          'Dry-Run 또는 API 미연동인데 실발송 완료 토스트 표시',
          '본문·이메일에 62/100 같은 근거 없는 합성 점수 잔존',
          '(광고) 표기 또는 중개사 등록번호 누락 메일 발송 시도',
          '야간 22시에 야간 동의 없는 고객에게 알림톡 오발송',
          '구독자 0명 화면에서 빈 박스만 보이고 다음 행동 불가',
          '고객 민원 및 발송 차단',
          '서비스 운영 신뢰 붕괴',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'NL-MG-06',
    nameKo: '불량 데이터 · 적대적 콘텐츠 예외 (Chaos Probe)',
    roleKo: '미발행 초안 /m/[draft], 가십·권유어·말줄임·내부라벨 주입 방어 검증자',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'OPS_foundation',
    gtmWeight: 1.2,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'mid',
      entryChannel: 'workspace_editor',
      mode: 'adversarial',
      domainScope: 'reader_4deliverables',
      viewportProfile: { width: 1440, height: 900, fontScale: 'normal' },
    },
    stableDimensions: [
      dim('fail_closed_draft_protection', '미발행 초안 숏링크(/m/[draft]) 비노출 Fail-Closed 방어', 0.97, [
        'C3_safe_domain_fit',
        'U3_flow_resilience',
      ]),
      dim('suitability_gate_blocking', '투자권유·가십·말줄임·주기불일치 발행 관문 차단율', 0.96, [
        'C3_safe_domain_fit',
        'C1_provenance_honesty',
      ]),
      dim('poison_raw_error_intolerance', 'PGRST/NaN/undefined/[object Object] 화면 노출 제로', 0.96, [
        'U3_flow_resilience',
        'C1_provenance_honesty',
      ]),
    ],
    transientState: {
      relationshipState: 'chaos_probe',
      taskConstraints: '미발행 숏링크 접근, 적대적 텍스트 주입, 오프라인 RSS 장애 검증',
      exposureState: 'kakao_link_open',
    },
    attractors: [
      {
        id: 'NL-ATT-06-CORE',
        kind: 'core',
        titleKo: '미발행 차단 + 7축 콘텐츠 게이트 + 원시 에러 0건',
        salientAxes: ['C3_safe_domain_fit', 'U3_flow_resilience'],
        steps: [
          '존재하지 않거나 미발행인 /m/[slug] 접근 시 초안 본문 미노출(안전 안내/폴백)',
          'publish/route.ts에서 투자권유 금지어·내부 라벨 포함 시 422 차단',
          '연예인 가십·말줄임(…)·주기 불일치 포함 시 409 검토 경고 차단',
          'RSS 실패 시 CURATED_CHANNEL_POOL 폴백을 정직하게 안내',
          '브라우저 pageerror·console error 및 raw PGRST/NaN 토큰 0건',
          '지번 상세 주소(736-1 등) 공개 URL·이메일·카톡·OG 전 종 마스킹',
          '장애·예외 상황에서도 고객 신뢰 손상 0건',
        ],
      },
      {
        id: 'NL-ATT-06-BOUNDARY',
        kind: 'boundary',
        titleKo: '미발행 초안 무단 노출·가십/권유어 통과·원시 DB 에러 노출',
        salientAxes: ['C3_safe_domain_fit', 'C1_provenance_honesty', 'U3_flow_resilience'],
        steps: [
          '/m/[draft-id]에서 미발행 초안 제목·매물가·지번이 외부 열람됨',
          '"연 8.5% 확정 수익 보장" 문구 수정 저장 후 그대로 발행됨',
          '화면에 PGRST204, undefined, [object Object] 등 raw 에러 노출',
          '이메일이나 OG 카드에 상세 번지 주소 원문 유출',
          'RSS 장애 시 지난 예시 뉴스를 오늘 실시간 기사처럼 발송',
          '치명적 콘텐츠·보안 사고 발생',
          '플랫폼 리스크 격상',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
];

export function validateNewsletterPersonaInvariants(
  personas: readonly NewsletterPpgtPersonaSpec[] = NEWSLETTER_PPGT_PERSONAS,
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const p of personas) {
    if (p.status === 'provisional') {
      if (p.populationShare !== null) {
        violations.push(`${p.id}: INV-P01(TC21) violation — provisional populationShare must be null`);
      }
      if (p.populationShareMetadata !== null) {
        violations.push(
          `${p.id}: INV-P01(TC21) violation — provisional populationShareMetadata must be null`,
        );
      }
    }
    if (!p.syntheticLabelRequired || !p.individualTargetingProhibited) {
      violations.push(
        `${p.id}: INV-P06/P07 violation — synthetic label & anti-targeting flags must be true`,
      );
    }
    if (!p.forbiddenDimensionAuditPassed) {
      violations.push(`${p.id}: INV-P03(TC34) violation — forbidden dimension audit failed`);
    }

    const hasCore = p.attractors.some((a) => a.kind === 'core' && a.steps.length === 7);
    const hasBoundary = p.attractors.some((a) => a.kind === 'boundary' && a.steps.length === 7);
    if (!hasCore || !hasBoundary) {
      violations.push(`${p.id}: missing 7-step core and boundary attractor pair`);
    }

    for (const d of p.stableDimensions) {
      if (
        PROHIBITED_DIMENSION_TOKENS.test(d.dimensionId) ||
        PROHIBITED_DIMENSION_TOKENS.test(d.labelKo)
      ) {
        violations.push(`${p.id}.${d.dimensionId}: INV-P03(TC34) prohibited dimension`);
      }
      if (d.estimate === null) {
        if (!d.missingReason) {
          violations.push(
            `${p.id}.${d.dimensionId}: INV-P02(TC23) estimate=null requires missingReason`,
          );
        }
      } else {
        if (!d.priorInterval || d.evidenceIds.length < 1) {
          violations.push(
            `${p.id}.${d.dimensionId}: INV-P02(TC23) observed estimate requires priorInterval and evidenceIds>=1`,
          );
        }
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

export function computeNewsletterR1Axes(
  metrics: NewsletterPpgtProbeMetrics,
): Record<PpgtAxisId, number> {
  const suitabilityViolations = metrics.contentSuitabilityViolationsCount ?? 0;

  let u1 = 5.0;
  if (metrics.blockingModalDetected) u1 -= 2.2;
  if (metrics.aboveFoldActionCount > 40) u1 -= 1.8;
  else if (metrics.aboveFoldActionCount > 24) u1 -= 1.1;
  else if (metrics.aboveFoldActionCount > 16) u1 -= 0.5;
  if ((metrics.stepCount ?? 0) > 5) u1 -= 0.4;
  if (!metrics.taskCompleted) u1 -= 1.5;

  let u2 = 5.0;
  if (metrics.horizontalOverflowPx > 20) u2 -= 2.8;
  else if (metrics.horizontalOverflowPx > 1) u2 -= 2.2;
  if (metrics.sub44ButtonsCount > 0) u2 -= Math.min(1.6, 0.35 * metrics.sub44ButtonsCount);
  if (metrics.sub15TextsCount > 0) u2 -= Math.min(1.2, 0.25 * metrics.sub15TextsCount);
  if (metrics.clippedButtonsCount > 0) u2 -= Math.min(1.4, 0.4 * metrics.clippedButtonsCount);
  if (metrics.brokenImgCount > 0) u2 -= 2.0;

  let u3 = 5.0;
  if (!metrics.taskCompleted) u3 -= 2.6;
  if (metrics.pageErrorCount > 0) u3 -= Math.min(2.4, 1.2 * metrics.pageErrorCount);
  if (metrics.consoleErrorCount > 0) u3 -= Math.min(1.2, 0.4 * metrics.consoleErrorCount);
  if (metrics.honestSaveVisible === false) u3 -= 0.5;

  let c1 = 5.0;
  if (!metrics.provenanceBadgeVisible) c1 -= 1.8;
  if (metrics.poisonTokenCount > 0) c1 -= 2.6;
  if (suitabilityViolations > 0) c1 -= Math.min(3.5, 1.4 * suitabilityViolations);

  let c2 = 5.0;
  if (!metrics.artifactValid) c2 -= 2.6;
  if (metrics.bannedTermCount > 0) c2 -= Math.min(2.2, 0.8 * metrics.bannedTermCount);
  if (metrics.brokenImgCount > 0) c2 -= 1.2;

  let c3 = 5.0;
  if (metrics.boundaryViolationCount > 0) c3 -= 2.8;
  if (suitabilityViolations > 0) c3 -= Math.min(3.8, 1.5 * suitabilityViolations);
  if (metrics.poisonTokenCount > 0) c3 -= 2.0;
  if (metrics.bannedTermCount > 0) c3 -= Math.min(1.6, 0.6 * metrics.bannedTermCount);

  return {
    U1_first10s_clarity: clampScore(u1),
    U2_visual_ergonomics: clampScore(u2),
    U3_flow_resilience: clampScore(u3),
    C1_provenance_honesty: clampScore(c1),
    C2_artifact_shareability: clampScore(c2),
    C3_safe_domain_fit: clampScore(c3),
  };
}

export function computeNewsletterAxisSalience(
  persona: NewsletterPpgtPersonaSpec,
): Record<PpgtAxisId, number> {
  const out = {} as Record<PpgtAxisId, number>;
  for (const axis of PPGT_ALL_AXES) {
    const observed = persona.stableDimensions
      .filter((d) => d.estimate !== null && d.mappedAxes.includes(axis))
      .map((d) => d.estimate as number);
    out[axis] =
      observed.length > 0 ? Math.round((0.5 + 0.5 * Math.max(...observed)) * 1000) / 1000 : 0.6;
  }
  return out;
}

function inferDefaultNewsletterHints(
  metrics: NewsletterPpgtProbeMetrics,
): NewsletterPpgtIssueHint[] {
  const hints: NewsletterPpgtIssueHint[] = [...(metrics.issueHints ?? [])];
  const seen = new Set(hints.map((h) => `${h.issueKey}:${h.targetFileHint}`));
  const add = (hint: NewsletterPpgtIssueHint) => {
    const k = `${hint.issueKey}:${hint.targetFileHint}`;
    if (!seen.has(k)) {
      seen.add(k);
      hints.push(hint);
    }
  };

  if (metrics.aboveFoldActionCount > 16) {
    add({
      issueKey: 'cognitive_above_fold_overload',
      targetFileHint:
        'src/app/(broker)/broker/magazine-editor/_components/NewsletterContentStepPanel.tsx',
      axis: 'U1_first10s_clarity',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: aboveFoldActionCount=${metrics.aboveFoldActionCount}`,
    });
  }
  if (metrics.horizontalOverflowPx > 1) {
    add({
      issueKey: 'horizontal_overflow',
      targetFileHint: metrics.surface.includes('/magazine')
        ? 'src/app/(magazine)/magazine/[brokerId]/[date]/magazine-view.tsx'
        : 'src/app/(broker)/broker/magazine-editor/page.tsx',
      axis: 'U2_visual_ergonomics',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface} (${metrics.viewport} ${metrics.fontScale}): overflow=${metrics.horizontalOverflowPx}px`,
    });
  }
  if (metrics.sub44ButtonsCount > 0) {
    add({
      issueKey: 'sub44_tap_target',
      targetFileHint: 'src/components/magazine/AxiosGlassIssueCard.tsx',
      axis: 'U2_visual_ergonomics',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: <44px interactive button ${metrics.sub44ButtonsCount}건`,
    });
  }
  if (metrics.sub15TextsCount > 0) {
    add({
      issueKey: 'sub15_small_text',
      targetFileHint: 'eslint.config.mjs',
      axis: 'U2_visual_ergonomics',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: <14px small text ${metrics.sub15TextsCount}건`,
    });
  }
  if (metrics.clippedButtonsCount > 0) {
    add({
      issueKey: 'clipped_button_label',
      targetFileHint: 'src/components/magazine/AxiosGlassIssueCard.tsx',
      axis: 'U2_visual_ergonomics',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: clipped button text ${metrics.clippedButtonsCount}건`,
    });
  }
  if (metrics.brokenImgCount > 0) {
    add({
      issueKey: 'broken_image_asset',
      targetFileHint: 'src/lib/magazine/og-image-response.tsx',
      axis: 'U2_visual_ergonomics',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: broken img naturalWidth===0 (${metrics.brokenImgCount}건)`,
    });
  }
  if (metrics.bannedTermCount > 0) {
    add({
      issueKey: 'banned_ui_jargon',
      targetFileHint: 'src/lib/ux/lexicon.ts',
      axis: 'C2_artifact_shareability',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: UX 라이팅 금지어 ${metrics.bannedTermCount}건 노출`,
    });
  }
  if ((metrics.contentSuitabilityViolationsCount ?? 0) > 0) {
    add({
      issueKey: 'content_suitability_violation',
      targetFileHint: 'src/domain/magazine/quality-gate.ts',
      axis: 'C3_safe_domain_fit',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: 콘텐츠 적합성 위반 ${metrics.contentSuitabilityViolationsCount}건`,
    });
  }
  if (metrics.poisonTokenCount > 0 || metrics.pageErrorCount > 0 || !metrics.taskCompleted) {
    add({
      issueKey: 'runtime_or_poison_failure',
      targetFileHint: 'src/app/(broker)/broker/magazine-editor/page.tsx',
      axis: 'U3_flow_resilience',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: pageErrors=${metrics.pageErrorCount}, poison=${metrics.poisonTokenCount}, completed=${metrics.taskCompleted}`,
    });
  }
  if (!metrics.provenanceBadgeVisible) {
    add({
      issueKey: 'missing_provenance_badge',
      targetFileHint: 'src/components/ui/PoweredByBadge.tsx',
      axis: 'C1_provenance_honesty',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: 출처/기준일/안심 배지 미확인`,
    });
  }
  if (metrics.boundaryViolationCount > 0) {
    add({
      issueKey: 'boundary_or_statutory_violation',
      targetFileHint: 'src/domain/magazine/send-gate.ts',
      axis: 'C3_safe_domain_fit',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: 경계/법정/마스킹 위반 ${metrics.boundaryViolationCount}건`,
    });
  }

  return hints;
}

export function scoreNewsletterPpgtRun(
  metrics: NewsletterPpgtProbeMetrics,
  personas: readonly NewsletterPpgtPersonaSpec[] = NEWSLETTER_PPGT_PERSONAS,
): NewsletterPpgtScoreResult {
  const persona = personas.find((p) => p.id === metrics.personaId);
  if (!persona) {
    throw new Error(`Unknown Newsletter PPGT personaId: ${metrics.personaId}`);
  }

  const r1Axes = computeNewsletterR1Axes(metrics);
  const axisSalience = computeNewsletterAxisSalience(persona);
  const r2Axes = {} as Record<PpgtAxisId, number>;

  let weightSum = 0;
  let scoreSum = 0;
  let minAxisScore = 5.0;

  for (const axis of PPGT_ALL_AXES) {
    const s1 = r1Axes[axis];
    const w = axisSalience[axis];
    const penalty = 2.0 * Math.max(0, 3.6 - s1) * Math.max(0, w - 0.7);
    const s2 = clampScore(s1 - penalty);
    r2Axes[axis] = s2;
    weightSum += w;
    scoreSum += w * s2;
    if (s2 < minAxisScore) minAxisScore = s2;
  }

  const rawWeightedOverall = Math.round((scoreSum / weightSum) * 100) / 100;
  const floorReasons: string[] = [];

  if (!metrics.taskCompleted) floorReasons.push('hard:task_incomplete');
  if (metrics.blockingModalDetected) floorReasons.push('hard:blocking_modal');
  if (metrics.horizontalOverflowPx > 1) floorReasons.push(`hard:overflow_${metrics.horizontalOverflowPx}px`);
  if (metrics.brokenImgCount > 0) floorReasons.push(`hard:broken_img_${metrics.brokenImgCount}`);
  if (metrics.boundaryViolationCount > 0) floorReasons.push(`hard:boundary_${metrics.boundaryViolationCount}`);
  if (metrics.poisonTokenCount > 0) floorReasons.push(`hard:poison_${metrics.poisonTokenCount}`);
  if ((metrics.contentSuitabilityViolationsCount ?? 0) > 0) {
    floorReasons.push(`hard:content_suitability_${metrics.contentSuitabilityViolationsCount}`);
  }

  for (const attr of persona.attractors) {
    const threshold = attr.kind === 'boundary' ? 2.6 : 2.5;
    for (const axis of attr.salientAxes) {
      if (r2Axes[axis] <= threshold) {
        floorReasons.push(`${attr.kind}:${axis}=${r2Axes[axis]}`);
      }
    }
  }
  if (minAxisScore <= 2.2) {
    floorReasons.push(`min_axis=${minAxisScore}`);
  }

  const floorRisk = floorReasons.length > 0;
  const weightedOverall = floorRisk
    ? Math.round(Math.min(rawWeightedOverall, minAxisScore + 0.9, 2.85) * 100) / 100
    : rawWeightedOverall;

  const issueHints = inferDefaultNewsletterHints(metrics);
  const topHint = issueHints[0]?.summary ?? '핵심 동선 및 콘텐츠 적합성 정상 통과';
  const syntheticSummary = formatSimulatedReaction(
    `${persona.id}(${persona.nameKo}) @ ${metrics.surface}: R2=${weightedOverall} (raw=${rawWeightedOverall}, floorRisk=${floorRisk}) — ${topHint}`,
  );

  return {
    personaId: persona.id,
    surface: metrics.surface,
    r1Axes,
    axisSalience,
    r2Axes,
    rawWeightedOverall,
    weightedOverall,
    minAxisScore,
    floorRisk,
    floorReasons,
    syntheticSummary,
    issueHints,
  };
}

export const NEWSLETTER_NEGATIVE_CONTROL_FIXTURES: ReadonlyArray<{
  controlId: string;
  metrics: NewsletterPpgtProbeMetrics;
}> = [
  {
    controlId: 'NC-NL-01',
    metrics: {
      personaId: 'NL-MG-01',
      surface: 'nc-nl-01-ui-and-legal-broken',
      viewport: '1440x900',
      fontScale: 'xlarge',
      aboveFoldActionCount: 52,
      totalVisibleInteractiveCount: 145,
      horizontalOverflowPx: 42,
      sub44ButtonsCount: 4,
      sub15TextsCount: 4,
      clippedButtonsCount: 2,
      brokenImgCount: 0,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      poisonTokenCount: 0,
      bannedTermCount: 2,
      taskCompleted: true,
      blockingModalDetected: false,
      boundaryViolationCount: 2,
      provenanceBadgeVisible: true,
      artifactValid: true,
    },
  },
  {
    controlId: 'NC-NL-02',
    metrics: {
      personaId: 'NL-MG-03',
      surface: 'nc-nl-02-content-suitability-broken',
      viewport: '390x844',
      fontScale: 'normal',
      aboveFoldActionCount: 6,
      totalVisibleInteractiveCount: 12,
      horizontalOverflowPx: 0,
      sub44ButtonsCount: 0,
      sub15TextsCount: 0,
      clippedButtonsCount: 0,
      brokenImgCount: 0,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      poisonTokenCount: 0,
      bannedTermCount: 0,
      contentSuitabilityViolationsCount: 5,
      taskCompleted: true,
      blockingModalDetected: false,
      boundaryViolationCount: 0,
      provenanceBadgeVisible: false,
      artifactValid: true,
    },
  },
  {
    controlId: 'NC-NL-03',
    metrics: {
      personaId: 'NL-MG-06',
      surface: 'nc-nl-03-chaos-draft-leak-poison',
      viewport: '1440x900',
      fontScale: 'normal',
      aboveFoldActionCount: 6,
      totalVisibleInteractiveCount: 14,
      horizontalOverflowPx: 0,
      sub44ButtonsCount: 0,
      sub15TextsCount: 0,
      clippedButtonsCount: 0,
      brokenImgCount: 1,
      consoleErrorCount: 1,
      pageErrorCount: 1,
      poisonTokenCount: 2,
      bannedTermCount: 3,
      taskCompleted: false,
      blockingModalDetected: false,
      boundaryViolationCount: 2,
      provenanceBadgeVisible: false,
      artifactValid: false,
    },
  },
];

export function verifyNewsletterAntiSycophancyControls(): {
  passed: boolean;
  controls: Array<{ controlId: string; score: number; floorRisk: boolean; reasons: string[] }>;
  failures: string[];
} {
  const controls: Array<{ controlId: string; score: number; floorRisk: boolean; reasons: string[] }> =
    [];
  const failures: string[] = [];

  for (const nc of NEWSLETTER_NEGATIVE_CONTROL_FIXTURES) {
    const res = scoreNewsletterPpgtRun(nc.metrics);
    controls.push({
      controlId: nc.controlId,
      score: res.weightedOverall,
      floorRisk: res.floorRisk,
      reasons: res.floorReasons,
    });
    if (res.weightedOverall > 2.9) {
      failures.push(`${nc.controlId}: expected <= 2.9, got ${res.weightedOverall}`);
    }
    if (!res.floorRisk) {
      failures.push(`${nc.controlId}: expected floorRisk=true, got false`);
    }
  }

  return { passed: failures.length === 0, controls, failures };
}

export function rankNewsletterPpgtBacklog(
  runs: readonly NewsletterPpgtScoreResult[],
  personas: readonly NewsletterPpgtPersonaSpec[] = NEWSLETTER_PPGT_PERSONAS,
): NewsletterPpgtBacklogCluster[] {
  const byCluster = new Map<
    string,
    {
      issueKey: string;
      targetFileHint: string;
      axis: PpgtAxisId;
      track: RemediationTrack;
      baseSum: number;
      anyFloorRisk: boolean;
      affectedPersonas: Set<NewsletterPpgtPersonaId>;
      summaries: string[];
    }
  >();

  for (const run of runs) {
    const persona = personas.find((p) => p.id === run.personaId);
    const wGtm = persona?.gtmWeight ?? 1.0;

    for (const hint of run.issueHints) {
      const clusterKey = `${hint.issueKey}::${hint.targetFileHint}`;
      const existing = byCluster.get(clusterKey) ?? {
        issueKey: hint.issueKey,
        targetFileHint: hint.targetFileHint,
        axis: hint.axis,
        track: hint.track,
        baseSum: 0,
        anyFloorRisk: false,
        affectedPersonas: new Set<NewsletterPpgtPersonaId>(),
        summaries: [],
      };
      const salience = run.axisSalience[hint.axis] ?? 0.6;
      const deficit = Math.max(0.25, 5.0 - (run.r2Axes[hint.axis] ?? 5.0));
      existing.baseSum += wGtm * salience * deficit;
      if (run.floorRisk) existing.anyFloorRisk = true;
      existing.affectedPersonas.add(run.personaId);
      if (!existing.summaries.includes(hint.summary)) {
        existing.summaries.push(hint.summary);
      }
      byCluster.set(clusterKey, existing);
    }
  }

  const out: NewsletterPpgtBacklogCluster[] = [];
  for (const item of byCluster.values()) {
    const mFloor = item.anyFloorRisk ? 1.5 : 1.0;
    const pScore = Math.round(item.baseSum * mFloor * 100) / 100;
    const tier: BacklogTier =
      item.anyFloorRisk || pScore >= 3.5
        ? 'P0_immediate'
        : pScore >= 1.6
          ? 'P1_near_term'
          : 'P2_experiment';

    out.push({
      issueKey: item.issueKey,
      targetFileHint: item.targetFileHint,
      axis: item.axis,
      track: item.track,
      pScore,
      tier,
      anyFloorRisk: item.anyFloorRisk,
      affectedPersonas: Array.from(item.affectedPersonas),
      summaries: item.summaries,
    });
  }

  return out.sort((a, b) => b.pScore - a.pScore);
}
