/**
 * @file src/lib/qa/inbox-ppgt-personas.ts
 * @description 소통함(Inbox CRM · 발송 · AI 답장 초안 · 고객 상태 관리) 특화
 *   Parametric Persona Golden Testing (PPGT-Loop) 마이크로 타겟 페르소나 4종(IB-MG-01..04),
 *   미생성 IM 오발송 차단(409 IM_NOT_GENERATED)·중복/VIP 보호·AI 답장 비중복 가중 R1 스코어러,
 *   비보상 하한 캡(R2), 반아첨 음성 대조군 검증(NC-IB-01..03), 및 P-Score 백로그 우선순위 엔진.
 *
 * PPGT-Loop 불변식 준수:
 * - INV-P01 (TC21): status === 'provisional' 동안 populationShare === null, populationShareMetadata === null
 * - INV-P02 (TC23): 미관측/비적용 차원에 0.5 대입 금지 (estimate: null + missingReason 명시)
 * - INV-P03 (TC34): 정치/이념/민감 속성 프로파일링 차원 전면 배제
 * - INV-P05 (INV-403): stableDimensions 와 transientState 분리
 * - INV-P06 / P07: 합성 반응 "[SIMULATED] " 접두사 강제 및 개인 타게팅 금지
 */

import {
  PPGT_ALL_AXES,
  formatSimulatedReaction,
  type PpgtAxisId,
  type PersonaStatus,
  type GtmTier,
  type BacklogTier,
  type RemediationTrack,
  type StableDimensionEntry,
  type PatternAttractor,
} from './dealcard-ppgt-personas';

export type InboxPpgtPersonaId = 'IB-MG-01' | 'IB-MG-02' | 'IB-MG-03' | 'IB-MG-04';

export interface InboxPpgtPersonaSpec {
  id: InboxPpgtPersonaId;
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
      | 'inbox_senior_triage'
      | 'inbox_ai_reply_flow'
      | 'inbox_crm_dispatch'
      | 'inbox_adversarial_guard';
    mode: 'creator' | 'operator' | 'adversarial';
    domainScope: 'client_triage' | 'ai_reply_and_notes' | 'im_dispatch_gate' | 'crm_safety_guard';
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
      | 'active_broker_team_lead'
      | 'newsletter_crm_operator'
      | 'chaos_probe';
    taskConstraints: string;
    exposureState: 'unexposed' | 'triage_to_reply' | 'dispatch_to_followup' | 'boundary_audit';
  };
  attractors: readonly [PatternAttractor, PatternAttractor];
  forbiddenDimensionAuditPassed: boolean;
}

export interface InboxPpgtIssueHint {
  issueKey: string;
  targetFileHint: string;
  axis: PpgtAxisId;
  track: RemediationTrack;
  summary: string;
}

export interface InboxPpgtProbeMetrics {
  personaId: InboxPpgtPersonaId;
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
  /** 미생성 IM 오발송(409 IM_NOT_GENERATED 미차단) 또는 가짜 IM 링크 발송 건수 — 1건이라도 즉시 과락 */
  unblockedImDispatchCount?: number;
  /** VIP 고객 무단 삭제·중복 고객 무경고 등록 등 CRM 보호 결함 건수 */
  crmSafetyViolationCount?: number;
  /** 빈 이벤트 허위 타임라인(거짓 '읽음'/'발송됨' 표시) 또는 AI 답장 연속 동일 문구 반복 건수 */
  dishonestTimelineOrStaleAiCount?: number;
  /** UX 라이팅 금지어/조사 불일치 건수 */
  uxWritingViolationsCount?: number;
  taskCompleted: boolean;
  blockingModalDetected: boolean;
  boundaryViolationCount: number;
  provenanceBadgeVisible: boolean;
  artifactValid: boolean;
  honestSaveVisible?: boolean;
  observedHeadings?: readonly string[];
  observedButtons?: readonly string[];
  observedBadges?: readonly string[];
  issueHints?: readonly InboxPpgtIssueHint[];
}

export interface InboxPpgtScoreResult {
  personaId: InboxPpgtPersonaId;
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
  issueHints: InboxPpgtIssueHint[];
}

export interface InboxPpgtBacklogCluster {
  issueKey: string;
  targetFileHint: string;
  axis: PpgtAxisId;
  track: RemediationTrack;
  pScore: number;
  tier: BacklogTier;
  anyFloorRisk: boolean;
  affectedPersonas: InboxPpgtPersonaId[];
  summaries: string[];
}

const PROHIBITED_DIMENSION_TOKENS =
  /politic|ideolog|party|vote|religion|race|ethnic|sexual|orient/i;

function clampScore(value: number): number {
  return Math.round(Math.min(5.0, Math.max(1.0, value)) * 100) / 100;
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
    evidenceIds: options.evidenceIds ?? ['EV-INBOX-PARITY-AUDIT'],
    mappedAxes,
  };
}

export const INBOX_PPGT_PERSONAS: readonly InboxPpgtPersonaSpec[] = [
  {
    id: 'IB-MG-01',
    nameKo: '60대 시니어 대표 중개사 (소통함 큰글씨)',
    roleKo: 'xlarge 21px 환경에서 오늘 응대할 VIP·문의 고객을 즉시 파악하고 실수 없이 발송·메모',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'P0_conversion',
    gtmWeight: 1.5,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'senior_high',
      entryChannel: 'inbox_senior_triage',
      mode: 'creator',
      domainScope: 'client_triage',
      viewportProfile: { width: 1440, height: 900, fontScale: 'xlarge' },
    },
    stableDimensions: [
      dim('senior_crm_readability', '큰 글씨(21px) 고객 목록·상태 필터 가독성 및 44px 버튼 민감도', 0.94, [
        'U2_visual_ergonomics',
        'U1_first10s_clarity',
      ]),
      dim('low_clutter_filter_preference', '기본 필터 단순화 및 추가 필터 접기(더 보기) 선호', 0.9, [
        'U1_first10s_clarity',
        'U3_flow_resilience',
      ]),
      dim('vip_accidental_delete_fear', 'VIP 고객 오삭제 방지 및 확인 문구 명확성 요구', 0.92, [
        'C3_safe_domain_fit',
        'U3_flow_resilience',
      ]),
      dim('webhook_crm_automation_skill', '외부 CRM 웹훅 자동화 설정 숙련도', null, ['U3_flow_resilience'], {
        missingReason: 'not_applicable_role',
      }),
    ],
    transientState: {
      relationshipState: 'first_visit',
      taskConstraints: '소통함 진입 10초 내 문의 대기 고객 확인 및 신규 고객 등록(매물 선택) 완주',
      exposureState: 'triage_to_reply',
    },
    attractors: [
      {
        id: 'IB-ATT-01-CORE',
        kind: 'core',
        titleKo: '복잡한 CRM 용어 없이 오늘 연락할 고객과 관심 매물을 큰 글씨로 바로 처리',
        salientAxes: ['U1_first10s_clarity', 'U2_visual_ergonomics', 'U3_flow_resilience'],
        steps: [
          '/broker/w/inbox 진입 즉시 상단 핵심 필터와 고객 리스트 구조가 한눈에 들어옴',
          'xlarge 21px에서도 고객 카드·필터 칩·버튼이 가로 넘침이나 글자 잘림 없이 유지됨',
          '부가 필터(뉴스레터 구독 등)가 기본 접힘 상태라 시선 분산이 없음',
          '신규 고객 등록 모달에서 보유 매물 드롭다운으로 정확히 매물을 연결함',
          '중복 전화번호 입력 시 사전 경고가 떠서 중복 등록을 방지함',
          '고객 이력이 없을 때 가짜 기록 대신 정직한 빈 상태 안내가 표시됨',
          '저장 상태와 메모가 즉시 반영되어 다음 고객 응대로 자연스럽게 이어짐',
        ],
      },
      {
        id: 'IB-ATT-01-BOUNDARY',
        kind: 'boundary',
        titleKo: '필터 칩 과밀 + 작은 버튼 + 영문 전문용어 혼재로 고객 관리 포기',
        salientAxes: ['U1_first10s_clarity', 'U2_visual_ergonomics', 'C3_safe_domain_fit'],
        steps: [
          '상단에 10개 이상의 필터·액션 버튼이 빽빽하게 노출되어 어디를 눌러야 할지 혼란',
          'xlarge 21px에서 버튼 높이가 44px 미만으로 줄거나 텍스트가 잘림',
          '빈 이벤트 화면에 확인되지 않은 발송/열람 이력이 허위로 채워져 혼동 유발',
          '신규 고객 등록 시 관심 매물을 직접 텍스트로 타이핑해야 해서 오타 발생',
          'VIP 고객 삭제 시 일반 삭제와 동일한 약한 문구로 오삭제 위험 발생',
          '저장 여부 피드백이 없어 새로고침 후 메모 유실',
          '소통함 이탈 후 개인 카톡 메모장으로 회귀',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'IB-MG-02',
    nameKo: '30~40대 실무 팀장 (AI 답장·다량 관리)',
    roleKo: '실시간 매수자 문의에 AI 답장 초안 재생성·톤 변주·빠른 복사·단계 전환으로 초고속 응대',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'P0_viral',
    gtmWeight: 1.5,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'mid',
      entryChannel: 'inbox_ai_reply_flow',
      mode: 'operator',
      domainScope: 'ai_reply_and_notes',
      viewportProfile: { width: 1440, height: 900, fontScale: 'normal' },
    },
    stableDimensions: [
      dim('ai_reply_variety_sensitivity', 'AI 답장 초안 2회 이상 호출 시 중복 문구 회피 민감도', 0.94, [
        'C2_artifact_shareability',
        'C1_provenance_honesty',
      ]),
      dim('fast_triage_throughput', '검색·필터·상태 변경·메모 저장 연속 처리 속도 요구', 0.91, [
        'U3_flow_resilience',
        'U1_first10s_clarity',
      ]),
      dim('korean_business_copy_dignity', '고객 발송용 한국어 존댓말·조사 정확도 및 금지어 배제', 0.9, [
        'C2_artifact_shareability',
        'C3_safe_domain_fit',
      ]),
      dim('legacy_fax_workflow', '팩스 기반 오프라인 접수 의존도', null, ['U2_visual_ergonomics'], {
        missingReason: 'not_applicable_role',
      }),
    ],
    transientState: {
      relationshipState: 'active_broker_team_lead',
      taskConstraints: '문의 고객 선택 → AI 답장 초안 2회 생성(비중복 확인) → 복사/저장 및 단계 전환',
      exposureState: 'triage_to_reply',
    },
    attractors: [
      {
        id: 'IB-ATT-02-CORE',
        kind: 'core',
        titleKo: '문의 고객 맥락에 맞는 자연스러운 AI 답장을 즉시 뽑아 20초 만에 카톡 회신',
        salientAxes: ['C2_artifact_shareability', 'U3_flow_resilience', 'U1_first10s_clarity'],
        steps: [
          '고객 카드 선택 시 우측 상세 패널에 관심 매물·단계·이벤트 타임라인이 즉시 로드됨',
          'AI 답장 초안 버튼 클릭 시 고객명·매물 맥락이 반영된 품격 있는 한국어 초안 생성',
          '다시 생성 클릭 시 이전 초안과 다른 표현·각도의 새로운 문구로 변주됨',
          '영어 개발 용어나 어색한 조사, NaN/undefined 토큰이 0건임',
          '원클릭 복사로 바로 카카오톡/문자에 붙여넣기 가능',
          '상담 메모 저장 후 단계 변경(문의→미팅/IM 발송)이 새로고침 없이 즉시 반영',
          '콘솔 에러 없이 다수 고객 전환을 매끄럽게 처리',
        ],
      },
      {
        id: 'IB-ATT-02-BOUNDARY',
        kind: 'boundary',
        titleKo: '매번 똑같은 AI 템플릿 문구 반복 또는 매물 정보 누락으로 수동 재작성',
        salientAxes: ['C2_artifact_shareability', 'C1_provenance_honesty', 'U3_flow_resilience'],
        steps: [
          'AI 답장 생성을 다시 눌러도 토씨 하나 안 바뀐 동일 문구만 반복 출력',
          '고객이 문의한 매물 맥락 대신 빈 문자열이나 잘못된 매물명이 삽입됨',
          '응답에 "undefined", "null" 또는 영문 시스템 코드가 그대로 노출됨',
          '답장 복사 버튼 클릭 시 에러 또는 미작동',
          '상태 변경 후 리스트 카운트가 동기화되지 않음',
          '실무 팀장이 AI 기능을 불신하고 외부 메모장으로 이탈',
          '반복 응대 생산성 저하',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'IB-MG-03',
    nameKo: 'CRM·뉴스레터 발송 운영 브로커',
    roleKo: '딜카드·IM·뉴스레터 발행물과 연동해 정확한 산출물만 고객에게 발송하고 구독/반응 추적',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'P1_retention',
    gtmWeight: 1.2,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'expert',
      entryChannel: 'inbox_crm_dispatch',
      mode: 'operator',
      domainScope: 'im_dispatch_gate',
      viewportProfile: { width: 1440, height: 900, fontScale: 'normal' },
    },
    stableDimensions: [
      dim('cross_workspace_link_integrity', '딜카드·IM·뉴스레터 간 발송 링크 정합성(404/미생성 차단) 민감도', 0.96, [
        'C3_safe_domain_fit',
        'C1_provenance_honesty',
      ]),
      dim('newsletter_subscriber_sync', '뉴스레터 구독 필터·이력 확인 및 원클릭 후속 응대 요구', 0.88, [
        'U3_flow_resilience',
        'C2_artifact_shareability',
      ]),
      dim('audit_trail_honesty', '실제 발송·열람 이벤트와 미기록 상태의 엄격한 구분', 0.93, [
        'C1_provenance_honesty',
        'C3_safe_domain_fit',
      ]),
      dim('mobile_only_triage', '모바일 단독 CRM 운영 비중', null, ['U2_visual_ergonomics'], {
        missingReason: 'not_observed',
      }),
    ],
    transientState: {
      relationshipState: 'newsletter_crm_operator',
      taskConstraints: 'IM 미생성 매물 발송 시 409 차단 안내 확인 + IM 생성 완료 매물 정상 발송 검증',
      exposureState: 'dispatch_to_followup',
    },
    attractors: [
      {
        id: 'IB-ATT-03-CORE',
        kind: 'core',
        titleKo: 'IM 미생성 오발송은 원천 차단하고 검증된 딜카드·IM 링크만 고객에게 정확히 발송',
        salientAxes: ['C3_safe_domain_fit', 'C1_provenance_honesty', 'C2_artifact_shareability'],
        steps: [
          '접힌 추가 필터(더 보기)를 펼쳐 뉴스레터 구독 고객군을 즉시 필터링',
          'IM이 아직 생성되지 않은 딜카드 전용 매물의 IM 발송 시도 시 409 차단 + 명확한 안내 배너 노출',
          '안내 배너의 IM 작업실 이동 동선으로 즉시 복구 가능',
          'IM 발행 완료 매물 선택 시 정상적인 /im-lite/ 링크가 발급·기록됨',
          '발송 완료 후 타임라인에 실제 기록된 이벤트만 정직하게 표시',
          '발송 링크 클릭 시 404나 깨진 페이지 없이 실제 뷰어에 도달',
          'CRM 데이터와 실제 발송 이력이 100% 일치',
        ],
      },
      {
        id: 'IB-ATT-03-BOUNDARY',
        kind: 'boundary',
        titleKo: '미생성 IM 가짜 링크가 고객에게 발송되어 404 대형 신뢰 사고 발생',
        salientAxes: ['C3_safe_domain_fit', 'C1_provenance_honesty', 'U3_flow_resilience'],
        steps: [
          '딜카드만 있는 매물에 대해 IM 발송 버튼이 아무 검증 없이 성공 응답을 반환',
          '고객에게 존재하지 않는 /im-lite/ 또는 빈 IM 링크가 전달됨',
          '고객이 링크를 눌렀을 때 404 또는 빈 화면 노출',
          '타임라인에는 가짜 발송 성공 이벤트가 남아 중개사도 오류를 인지 못함',
          '뉴스레터 구독 필터가 동작하지 않거나 카운트가 불일치',
          '대형 VIP 고객 신뢰 상실',
          '릴리즈 즉시 차단(floorRisk=true)',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'IB-MG-04',
    nameKo: '소통함 경계·오발송·VIP 보호 감사 프로브',
    roleKo: '409 IM_NOT_GENERATED · VIP 삭제 보호 · 중복 고객 경고 · 모바일 390px xlarge 경계 감사',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'OPS_foundation',
    gtmWeight: 1.2,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'expert',
      entryChannel: 'inbox_adversarial_guard',
      mode: 'adversarial',
      domainScope: 'crm_safety_guard',
      viewportProfile: { width: 390, height: 844, fontScale: 'xlarge' },
    },
    stableDimensions: [
      dim('dispatch_guard_enforcement', '미생성 IM 발송 API 409 IM_NOT_GENERATED 강제 집행 민감도', 0.98, [
        'C3_safe_domain_fit',
        'C1_provenance_honesty',
      ]),
      dim('vip_and_duplicate_safety', 'VIP 삭제 2차 강조 확인 및 중복 연락처 사전 경고 무결성', 0.95, [
        'C3_safe_domain_fit',
        'U3_flow_resilience',
      ]),
      dim('mobile_xlarge_overflow_zero', '모바일 390px xlarge(21px) 가로 넘침 0px 및 터치 규격 준수', 0.92, [
        'U2_visual_ergonomics',
        'U3_flow_resilience',
      ]),
      dim('offline_print_brochure', '종이 브로슈어 인쇄 의존도', null, ['C2_artifact_shareability'], {
        missingReason: 'not_applicable_role',
      }),
    ],
    transientState: {
      relationshipState: 'chaos_probe',
      taskConstraints: '미생성 IM 발송 시도(409), 중복 전화번호, VIP 삭제 경고, 390px xlarge 반응형 전수 검증',
      exposureState: 'boundary_audit',
    },
    attractors: [
      {
        id: 'IB-ATT-04-CORE',
        kind: 'core',
        titleKo: '오발송·VIP 오삭제·중복 등록·모바일 넘침이 모든 경계 조건에서 0건으로 방어됨',
        salientAxes: ['C3_safe_domain_fit', 'U2_visual_ergonomics', 'U3_flow_resilience'],
        steps: [
          'IM 미생성 매물 발송 API 호출 시 HTTP 409 및 code=IM_NOT_GENERATED 반환',
          'UI에 inbox-im-not-generated-notice 가드 배너가 즉시 노출되어 오발송 차단',
          '이미 등록된 연락처 재입력 시 중복 경고 UI 표시',
          'VIP 태그 고객 삭제 시 일반 고객과 구분되는 강한 경고 문구 노출',
          '390px xlarge(21px)에서 가로 넘침 <= 1px 및 주요 버튼 >= 44px 유지',
          'Poison 토큰(NaN/undefined/PGRST) 0건, 콘솔·페이지 에러 0건',
          '모든 경계 감사 게이트 PASS',
        ],
      },
      {
        id: 'IB-ATT-04-BOUNDARY',
        kind: 'boundary',
        titleKo: '미생성 IM 발송 통과 또는 VIP 무단 삭제·DB 에러 노출 시 즉시 릴리즈 봉쇄',
        salientAxes: ['C3_safe_domain_fit', 'C1_provenance_honesty', 'U3_flow_resilience'],
        steps: [
          'IM 미생성 매물 발송이 200 OK로 통과되어 가짜 링크가 생성됨',
          'VIP 고객이 별도 경고 없이 1클릭으로 영구 삭제됨',
          '중복 연락처가 무경고로 다중 생성되어 고객 이력이 파편화됨',
          '390px xlarge에서 가로 스크롤 발생 또는 액션 버튼 잘림',
          '화면 본문에 PGRST/500 원시 에러 또는 undefined 문자열 노출',
          '과락(floorRisk=true) 발동으로 46.25점 이하 즉시 캡핑',
          '릴리즈 게이트 FAIL 처리',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
];

export function validateInboxPersonaInvariants(
  personas: readonly InboxPpgtPersonaSpec[] = INBOX_PPGT_PERSONAS,
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

export function computeInboxR1Axes(metrics: InboxPpgtProbeMetrics): Record<PpgtAxisId, number> {
  const unblockedDispatch = metrics.unblockedImDispatchCount ?? 0;
  const crmSafetyViolations = metrics.crmSafetyViolationCount ?? 0;
  const dishonestTimelineOrStaleAi = metrics.dishonestTimelineOrStaleAiCount ?? 0;
  const writingViolations = metrics.uxWritingViolationsCount ?? 0;

  let u1 = 5.0;
  if (metrics.blockingModalDetected) u1 -= 2.2;
  if (metrics.aboveFoldActionCount > 40) u1 -= 1.8;
  else if (metrics.aboveFoldActionCount > 24) u1 -= 1.0;
  else if (metrics.aboveFoldActionCount > 18) u1 -= 0.4;
  if (writingViolations > 0) u1 -= Math.min(1.5, 0.45 * writingViolations);
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
  if (crmSafetyViolations > 0) u3 -= Math.min(1.8, 0.8 * crmSafetyViolations);

  let c1 = 5.0;
  if (!metrics.provenanceBadgeVisible) c1 -= 1.6;
  if (metrics.poisonTokenCount > 0) c1 -= 2.6;
  if (dishonestTimelineOrStaleAi > 0) c1 -= Math.min(2.4, 1.0 * dishonestTimelineOrStaleAi);
  if (unblockedDispatch > 0) c1 -= 2.8;

  let c2 = 5.0;
  if (!metrics.artifactValid) c2 -= 2.4;
  if (metrics.bannedTermCount > 0) c2 -= Math.min(2.2, 0.8 * metrics.bannedTermCount);
  if (writingViolations > 0) c2 -= Math.min(1.8, 0.55 * writingViolations);
  if (dishonestTimelineOrStaleAi > 0) c2 -= Math.min(1.8, 0.7 * dishonestTimelineOrStaleAi);

  let c3 = 5.0;
  if (unblockedDispatch > 0) c3 -= 3.6;
  if (crmSafetyViolations > 0) c3 -= Math.min(3.0, 1.4 * crmSafetyViolations);
  if (metrics.boundaryViolationCount > 0) c3 -= 2.8;
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

export function computeInboxAxisSalience(
  persona: InboxPpgtPersonaSpec,
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

function inferDefaultInboxHints(metrics: InboxPpgtProbeMetrics): InboxPpgtIssueHint[] {
  const hints: InboxPpgtIssueHint[] = [...(metrics.issueHints ?? [])];
  const seen = new Set(hints.map((h) => `${h.issueKey}:${h.targetFileHint}`));
  const add = (hint: InboxPpgtIssueHint) => {
    const k = `${hint.issueKey}:${hint.targetFileHint}`;
    if (!seen.has(k)) {
      seen.add(k);
      hints.push(hint);
    }
  };

  const defaultUiFile = 'src/app/(broker)/broker/w/inbox/page.tsx';

  if ((metrics.unblockedImDispatchCount ?? 0) > 0) {
    add({
      issueKey: 'unblocked_im_not_generated_dispatch',
      targetFileHint: 'src/app/api/broker/inbox/dispatch/route.ts',
      axis: 'C3_safe_domain_fit',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: 미생성 IM 오발송 차단 실패 ${metrics.unblockedImDispatchCount}건`,
    });
  }
  if ((metrics.crmSafetyViolationCount ?? 0) > 0) {
    add({
      issueKey: 'crm_vip_or_duplicate_safety_gap',
      targetFileHint: defaultUiFile,
      axis: 'C3_safe_domain_fit',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: VIP 보호 또는 중복 고객 경고 결함 ${metrics.crmSafetyViolationCount}건`,
    });
  }
  if ((metrics.dishonestTimelineOrStaleAiCount ?? 0) > 0) {
    add({
      issueKey: 'dishonest_timeline_or_repetitive_ai_reply',
      targetFileHint: 'src/app/api/broker/inbox/ai-reply/route.ts',
      axis: 'C1_provenance_honesty',
      track: 'track2_copy_prompt',
      summary: `${metrics.surface}: 허위 이벤트 또는 AI 답장 중복 반복 ${metrics.dishonestTimelineOrStaleAiCount}건`,
    });
  }
  if (metrics.horizontalOverflowPx > 1) {
    add({
      issueKey: 'horizontal_overflow',
      targetFileHint: defaultUiFile,
      axis: 'U2_visual_ergonomics',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface} (${metrics.viewport} ${metrics.fontScale}): overflow=${metrics.horizontalOverflowPx}px`,
    });
  }
  if (metrics.sub44ButtonsCount > 0) {
    add({
      issueKey: 'sub44_tap_target',
      targetFileHint: defaultUiFile,
      axis: 'U2_visual_ergonomics',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: <44px interactive button ${metrics.sub44ButtonsCount}건`,
    });
  }
  if (metrics.clippedButtonsCount > 0) {
    add({
      issueKey: 'clipped_button_label',
      targetFileHint: defaultUiFile,
      axis: 'U2_visual_ergonomics',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: clipped button text ${metrics.clippedButtonsCount}건`,
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
  if (metrics.poisonTokenCount > 0 || metrics.pageErrorCount > 0 || !metrics.taskCompleted) {
    add({
      issueKey: 'runtime_or_poison_failure',
      targetFileHint: defaultUiFile,
      axis: 'U3_flow_resilience',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: pageErrors=${metrics.pageErrorCount}, poison=${metrics.poisonTokenCount}, completed=${metrics.taskCompleted}`,
    });
  }
  if (metrics.boundaryViolationCount > 0) {
    add({
      issueKey: 'inbox_boundary_violation',
      targetFileHint: defaultUiFile,
      axis: 'C3_safe_domain_fit',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: 소통함 경계/권한 위반 ${metrics.boundaryViolationCount}건`,
    });
  }

  return hints;
}

export function scoreInboxPpgtRun(
  metrics: InboxPpgtProbeMetrics,
  personas: readonly InboxPpgtPersonaSpec[] = INBOX_PPGT_PERSONAS,
): InboxPpgtScoreResult {
  const persona = personas.find((p) => p.id === metrics.personaId);
  if (!persona) {
    throw new Error(`Unknown Inbox PPGT personaId: ${metrics.personaId}`);
  }

  const r1Axes = computeInboxR1Axes(metrics);
  const axisSalience = computeInboxAxisSalience(persona);
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
  if ((metrics.unblockedImDispatchCount ?? 0) > 0) {
    floorReasons.push(`hard:unblocked_im_dispatch_${metrics.unblockedImDispatchCount}`);
  }
  if ((metrics.crmSafetyViolationCount ?? 0) > 0) {
    floorReasons.push(`hard:crm_safety_${metrics.crmSafetyViolationCount}`);
  }
  if (metrics.boundaryViolationCount > 0) floorReasons.push(`hard:boundary_${metrics.boundaryViolationCount}`);
  if (metrics.poisonTokenCount > 0) floorReasons.push(`hard:poison_${metrics.poisonTokenCount}`);
  if (!metrics.artifactValid) floorReasons.push('hard:invalid_artifact');

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

  const issueHints = inferDefaultInboxHints(metrics);
  const topHint = issueHints[0]?.summary ?? '소통함 발송 가드·AI 답장·CRM 보호 정상 통과';
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

export const INBOX_NEGATIVE_CONTROL_FIXTURES: ReadonlyArray<{
  controlId: string;
  metrics: InboxPpgtProbeMetrics;
}> = [
  {
    controlId: 'NC-IB-01',
    metrics: {
      personaId: 'IB-MG-03',
      surface: 'nc-ib-01-unblocked-im-not-generated-dispatch',
      viewport: '1440x900',
      fontScale: 'normal',
      aboveFoldActionCount: 10,
      totalVisibleInteractiveCount: 18,
      horizontalOverflowPx: 0,
      sub44ButtonsCount: 0,
      sub15TextsCount: 0,
      clippedButtonsCount: 0,
      brokenImgCount: 0,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      poisonTokenCount: 0,
      bannedTermCount: 0,
      unblockedImDispatchCount: 1,
      taskCompleted: true,
      blockingModalDetected: false,
      boundaryViolationCount: 0,
      provenanceBadgeVisible: true,
      artifactValid: true,
    },
  },
  {
    controlId: 'NC-IB-02',
    metrics: {
      personaId: 'IB-MG-04',
      surface: 'nc-ib-02-mobile-xlarge-overflow-and-vip-unsafe-delete',
      viewport: '390x844',
      fontScale: 'xlarge',
      aboveFoldActionCount: 12,
      totalVisibleInteractiveCount: 22,
      horizontalOverflowPx: 32,
      sub44ButtonsCount: 5,
      sub15TextsCount: 2,
      clippedButtonsCount: 2,
      brokenImgCount: 0,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      poisonTokenCount: 0,
      bannedTermCount: 1,
      crmSafetyViolationCount: 1,
      taskCompleted: true,
      blockingModalDetected: false,
      boundaryViolationCount: 0,
      provenanceBadgeVisible: true,
      artifactValid: true,
    },
  },
  {
    controlId: 'NC-IB-03',
    metrics: {
      personaId: 'IB-MG-02',
      surface: 'nc-ib-03-dishonest-timeline-stale-ai-poison',
      viewport: '1440x900',
      fontScale: 'normal',
      aboveFoldActionCount: 8,
      totalVisibleInteractiveCount: 16,
      horizontalOverflowPx: 0,
      sub44ButtonsCount: 0,
      sub15TextsCount: 0,
      clippedButtonsCount: 0,
      brokenImgCount: 0,
      consoleErrorCount: 2,
      pageErrorCount: 1,
      poisonTokenCount: 2,
      bannedTermCount: 2,
      dishonestTimelineOrStaleAiCount: 2,
      taskCompleted: false,
      blockingModalDetected: false,
      boundaryViolationCount: 1,
      provenanceBadgeVisible: false,
      artifactValid: false,
    },
  },
];

export function verifyInboxAntiSycophancyControls(): {
  passed: boolean;
  controls: Array<{ controlId: string; score: number; floorRisk: boolean; reasons: string[] }>;
  failures: string[];
} {
  const controls: Array<{ controlId: string; score: number; floorRisk: boolean; reasons: string[] }> =
    [];
  const failures: string[] = [];

  for (const nc of INBOX_NEGATIVE_CONTROL_FIXTURES) {
    const res = scoreInboxPpgtRun(nc.metrics);
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

export function rankInboxPpgtBacklog(
  runs: readonly InboxPpgtScoreResult[],
  personas: readonly InboxPpgtPersonaSpec[] = INBOX_PPGT_PERSONAS,
): InboxPpgtBacklogCluster[] {
  const byCluster = new Map<
    string,
    {
      issueKey: string;
      targetFileHint: string;
      axis: PpgtAxisId;
      track: RemediationTrack;
      baseSum: number;
      anyFloorRisk: boolean;
      affectedPersonas: Set<InboxPpgtPersonaId>;
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
        affectedPersonas: new Set<InboxPpgtPersonaId>(),
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

  const out: InboxPpgtBacklogCluster[] = [];
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
