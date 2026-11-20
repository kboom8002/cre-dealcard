/**
 * @file src/lib/qa/dealcard-ppgt-personas.ts
 * @description 딜카드(DealCard) 작성 파이프라인 & 공개 수신자 화면(`/dc/[id]` · 카톡 OG) 특화
 *   Parametric Persona Golden Testing (PPGT-Loop) 마이크로 타겟 페르소나 6종(DC-MG-01..06),
 *   콘텐츠 적합성·블라인드 보안·UX 라이팅 가중 R1 스코어러, 비보상 하한 캡(R2),
 *   반아첨 음성 대조군 검증(NC-DC-01..03), 및 P-Score 백로그 우선순위 엔진.
 *
 * PPGT-Loop 불변식 준수:
 * - INV-P01 (TC21): status === 'provisional' 동안 populationShare === null, populationShareMetadata === null
 * - INV-P02 (TC23): 미관측/비적용 차원에 0.5 대입 금지 (estimate: null + missingReason 명시)
 * - INV-P03 (TC34): 정치/이념/민감 속성 프로파일링 차원 전면 배제
 * - INV-P05 (INV-403): stableDimensions 와 transientState 분리
 * - INV-P06 / P07: 합성 반응 "[SIMULATED] " 접두사 강제 및 개인 타게팅 금지
 */

export type DealCardPpgtPersonaId =
  | 'DC-MG-01'
  | 'DC-MG-02'
  | 'DC-MG-03'
  | 'DC-MG-04'
  | 'DC-MG-05'
  | 'DC-MG-06';

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
export type RemediationTrack = 'track1_ui_gate_renderer' | 'track2_copy_prompt';

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

export interface DealCardPpgtPersonaSpec {
  id: DealCardPpgtPersonaId;
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
      | 'workspace_memo_fastfill'
      | 'workspace_blind_review'
      | 'kakao_mobile_teaser'
      | 'corporate_hq_search'
      | 'developer_land_scan'
      | 'adversarial_probe';
    mode: 'creator' | 'consumer' | 'adversarial';
    domainScope: 'income_teaser' | 'owner_occupied_teaser' | 'value_add_teaser' | 'blind_security_gate';
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
      | 'exclusive_listing_broker'
      | 'vip_cash_buyer'
      | 'corporate_buyer'
      | 'value_add_developer'
      | 'chaos_probe';
    taskConstraints: string;
    exposureState: 'unexposed' | 'memo_to_kakao_send' | 'kakao_bubble_to_dc' | 'dc_to_im_request';
  };
  attractors: readonly [PatternAttractor, PatternAttractor];
  forbiddenDimensionAuditPassed: boolean;
}

export interface DealCardPpgtIssueHint {
  issueKey: string;
  targetFileHint: string;
  axis: PpgtAxisId;
  track: RemediationTrack;
  summary: string;
}

export interface DealCardPpgtProbeMetrics {
  personaId: DealCardPpgtPersonaId;
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
  /** 블라인드 위반(지번·건물명·특정 상호 노출) 건수 — 1건이라도 즉시 과락(floorRisk) */
  blindLeakCount?: number;
  /** 수익률·면적 수치에 주관적 형용사(양호한·넓은·높은) 남용 건수 */
  numericSpinCount?: number;
  /** 매물 3단 표준 제원(공통·건물·목적별) 누락 섹션 수 (수신자 상세 화면 기준) */
  threeTierSpecMissingCount?: number;
  /** 한국어 조사 불일치·본문 말줄임 등 UX 라이팅 결함 건수 */
  uxWritingViolationsCount?: number;
  /** 기타 도메인 콘텐츠 적합성 위반 건수 */
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
  issueHints?: readonly DealCardPpgtIssueHint[];
}

export interface DealCardPpgtScoreResult {
  personaId: DealCardPpgtPersonaId;
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
  issueHints: DealCardPpgtIssueHint[];
}

export interface DealCardPpgtBacklogCluster {
  issueKey: string;
  targetFileHint: string;
  axis: PpgtAxisId;
  track: RemediationTrack;
  pScore: number;
  tier: BacklogTier;
  anyFloorRisk: boolean;
  affectedPersonas: DealCardPpgtPersonaId[];
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
    evidenceIds: options.evidenceIds ?? ['EV-DC-ROUND2-BROKER'],
    mappedAxes,
  };
}

export const DEALCARD_PPGT_PERSONAS: readonly DealCardPpgtPersonaSpec[] = [
  {
    id: 'DC-MG-01',
    nameKo: '60대 시니어 매물메모 중개사',
    roleKo: '큰 글씨(xlarge 21px) · 카톡 메모 붙여넣기 + 강점 태그칩 1분 딜카드 발행',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'P0_conversion',
    gtmWeight: 1.5,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'senior_high',
      entryChannel: 'workspace_memo_fastfill',
      mode: 'creator',
      domainScope: 'income_teaser',
      viewportProfile: { width: 1440, height: 900, fontScale: 'xlarge' },
    },
    stableDimensions: [
      dim('senior_tap_and_font_ergonomics', '큰 글씨(21px) 버튼 높이(>=44px)·무잘림 민감도', 0.95, [
        'U2_visual_ergonomics',
        'U1_first10s_clarity',
      ]),
      dim('one_click_tag_chip_preference', '직접 작문 대신 원클릭 현장 강점 태그칩 선호도', 0.92, [
        'U1_first10s_clarity',
        'U3_flow_resilience',
      ]),
      dim('autosave_pingpong_intolerance', '타이핑 중 커서 튕김·프리뷰 불일치 회피', 0.9, [
        'U3_flow_resilience',
        'C2_artifact_shareability',
      ]),
      dim('sql_crm_query_skill', '고급 CRM 세그먼트 쿼리 숙련도', null, ['U1_first10s_clarity'], {
        missingReason: 'not_applicable_role',
      }),
    ],
    transientState: {
      relationshipState: 'first_visit',
      taskConstraints: '카톡 현장 메모 붙여넣기 후 90초 내 딜카드 확인·링크 복사 완주',
      exposureState: 'memo_to_kakao_send',
    },
    attractors: [
      {
        id: 'DC-ATT-01-CORE',
        kind: 'core',
        titleKo: '메모 한 줄 붙여넣기 + 현장 장점 칩 클릭만으로 품격 있는 카톡 딜카드 완성',
        salientAxes: ['U1_first10s_clarity', 'U2_visual_ergonomics', 'U3_flow_resilience'],
        steps: [
          '/broker/w/dealcards 진입 즉시 ①고르기·②채우기·③확인하고 보내기 3열 인지',
          '매물 메모 붙여넣기 또는 예시 넣기 클릭으로 4항목 자동 채움',
          'xlarge 21px에서도 모든 추천 태그칩이 44px 이상으로 또렷하게 터치됨',
          '장점 3줄이 18자 이내로 자연스럽게 정돈되고 우측 카톡 말풍선에 즉시 반영',
          '다크 2×2 카톡 썸네일에서 지역·용도·면적·가격이 한눈에 구분됨',
          '저장됨 상태 확인 후 카톡으로 보내기 클릭',
          '법정 중개사 정보 포함 링크 즉시 복사 완료',
        ],
      },
      {
        id: 'DC-ATT-01-BOUNDARY',
        kind: 'boundary',
        titleKo: '작은 칩 오터치 + 포스처/OG 등 낯선 용어 + 프리뷰 불일치로 포기',
        salientAxes: ['U1_first10s_clarity', 'U2_visual_ergonomics', 'C3_safe_domain_fit'],
        steps: [
          '작업실 진입 시 수십 개 작은 버튼과 낯선 용어에 당황',
          'xlarge 모드에서 칩 높이가 작거나 버튼 글자가 말줄임표로 잘림',
          '장점 입력 중 자동저장 리렌더로 한글 자모가 분리되거나 커서가 튐',
          '왼쪽 입력값과 오른쪽 카톡 미리보기 제목이 서로 다르게 표시됨',
          '양호한 수익률 등 과장 문구가 자동 생성되어 민망함 발생',
          '발행 시 원인 불명 오류로 막혀 수정 위치를 찾지 못함',
          '기존 텍스트 카톡 복붙 방식으로 회귀·이탈',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'DC-MG-02',
    nameKo: '블라인드 보안 민감 전속 중개사',
    roleKo: '지번·건물명·유명 임차 상호 노출 제로 및 가격 밴드 마스킹 엄수 창작자',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'P0_conversion',
    gtmWeight: 1.5,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'expert',
      entryChannel: 'workspace_blind_review',
      mode: 'creator',
      domainScope: 'blind_security_gate',
      viewportProfile: { width: 1440, height: 900, fontScale: 'normal' },
    },
    stableDimensions: [
      dim('blind_reidentification_zero_tolerance', '매물 특정(지번·건물명·상호) 노출 무관용도', 0.98, [
        'C3_safe_domain_fit',
        'C1_provenance_honesty',
      ]),
      dim('objective_yield_fact_discipline', '주관적 수치 수식 배제 및 객관 수치 비교 선호', 0.94, [
        'C1_provenance_honesty',
        'C2_artifact_shareability',
      ]),
      dim('auto_clean_recovery_speed', '블라인드 경고 시 1클릭 자동 가리기 복구 기대', 0.88, [
        'U3_flow_resilience',
      ]),
      dim('public_portal_ad_spend', '오픈 포털 배너 광고 집행 빈도', null, ['C2_artifact_shareability'], {
        missingReason: 'not_observed',
      }),
    ],
    transientState: {
      relationshipState: 'exclusive_listing_broker',
      taskConstraints: '매도인 비밀유지 요청 매물을 지번·건물명 노출 0건으로 안전 티저화',
      exposureState: 'memo_to_kakao_send',
    },
    attractors: [
      {
        id: 'DC-ATT-02-CORE',
        kind: 'core',
        titleKo: '실수로 넣은 번지·상호를 즉시 잡아내고 1클릭으로 안전한 권역·업종 표현 전환',
        salientAxes: ['C3_safe_domain_fit', 'C1_provenance_honesty', 'U3_flow_resilience'],
        steps: [
          '원본 메모의 지번·건물명이 파싱 단계에서 권역명·가격밴드로 1차 마스킹됨',
          '장점 칸에 실수로 번지나 스타벅스 등 상호 입력 시 즉시 붉은 안내 표시',
          '자동으로 가리기 버튼 1회 클릭으로 업종 일반명사로 안전 치환',
          '수익률에 양호한 등 미사여구 대신 권역 평균 상회 시에만 객관 수치 표기',
          '미리보기 및 실제 /dc/[id] HTML·OG 어디에도 원시 주소 미노출 확인',
          '법정 중개사무소 등록번호·대표자명이 정직하게 표시됨',
          '안심하고 VIP 매수 풀에 카톡 발송 완료',
        ],
      },
      {
        id: 'DC-ATT-02-BOUNDARY',
        kind: 'boundary',
        titleKo: '티저 링크나 OG 메타에서 지번·건물명이 새어나가 전속 계약 파기 위기',
        salientAxes: ['C3_safe_domain_fit', 'C1_provenance_honesty'],
        steps: [
          '메모에서 추출된 도로명/번지가 한 줄 제목이나 장점에 그대로 남음',
          '경고 없이 발행되어 카톡 OG 설명문에 건물명이 노출됨',
          '타 중개사가 매물을 역추적해 매도인에게 직접 연락',
          '매도인 항의 수령 후 급히 링크 닫기 시도',
          '링크 닫기 후에도 캐시/메모리 폴백으로 공개 페이지가 계속 열림',
          '플랫폼 보안 신뢰 완전 상실',
          '유료 구독 해지 및 영구 이탈',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'DC-MG-03',
    nameKo: '70대 현금 자산가 매수인 (모바일 카톡 열람)',
    roleKo: '스마트폰 큰 글씨(390px xlarge)로 3초 스캔 후 전화·IM 요청 결정',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'P0_viral',
    gtmWeight: 1.5,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'senior_high',
      entryChannel: 'kakao_mobile_teaser',
      mode: 'consumer',
      domainScope: 'income_teaser',
      viewportProfile: { width: 390, height: 844, fontScale: 'xlarge' },
    },
    stableDimensions: [
      dim('mobile_3sec_scan_clarity', '모바일 3초 내 지역·용도·면적·가격·3단제원 파악 요구', 0.96, [
        'U1_first10s_clarity',
        'C2_artifact_shareability',
      ]),
      dim('mobile_xlarge_zero_overflow', '390px 특대 글꼴 가로 넘침·버튼 잘림 무관용', 0.95, [
        'U2_visual_ergonomics',
      ]),
      dim('licensed_broker_trust_signal', '검증 공인중개사 실명·등록번호·직통전화 신뢰 민감도', 0.91, [
        'C1_provenance_honesty',
        'C3_safe_domain_fit',
      ]),
      dim('desktop_spreadsheet_modeling', 'PC 재무 모델링 직접 수행 빈도', null, ['U1_first10s_clarity'], {
        missingReason: 'not_applicable_role',
      }),
    ],
    transientState: {
      relationshipState: 'vip_cash_buyer',
      taskConstraints: '로그인 벽 없이 카톡 링크 열람 → 3단 핵심 제원 확인 → 전화 또는 IM 요청',
      exposureState: 'kakao_bubble_to_dc',
    },
    attractors: [
      {
        id: 'DC-ATT-03-CORE',
        kind: 'core',
        titleKo: '카톡 다크 2×2 썸네일 클릭 → 로그인 없이 깔끔한 3단 제원·장점 확인 → 즉시 IM 요청',
        salientAxes: ['U1_first10s_clarity', 'U2_visual_ergonomics', 'C2_artifact_shareability'],
        steps: [
          '카카오톡 채팅방에서 어두운 배경 2×2 핵심 요약 썸네일로 매물 성격 즉시 인지',
          '터치 시 회원가입/로그인 차단 없이 1초 내 /dc/[id] 열림',
          '상단 글자 크기(특대)에서도 가로 스크롤 0px·줄바꿈 정돈 유지',
          '상단 4요약 + 장점 3줄 + 표준 3단 제원(공통·건물·수익)이 중복 없이 한눈에 읽힘',
          '과장 형용사 없는 담백한 객관 지표에 신뢰 형성',
          '담당 공인중개사 등록 정보 확인 후 상세 제안서(IM) 요청 터치',
          '연락처 남기고 자연스럽게 IM 열람 단계로 전환',
        ],
      },
      {
        id: 'DC-ATT-03-BOUNDARY',
        kind: 'boundary',
        titleKo: '글씨 깨짐 + 제원 빈약(대지·층수·준공 미표기) + 과장 광고투로 즉시 닫기',
        salientAxes: ['U2_visual_ergonomics', 'C1_provenance_honesty', 'C2_artifact_shareability'],
        steps: [
          '카톡 링크 열었으나 특대 글꼴에서 표나 단추가 화면 밖으로 넘침',
          '연면적만 중복 적혀 있고 대지면적·용도지역·층수·준공연도를 알 수 없음',
          '최고의 수익률, 넓은 면적 같은 뻔한 광고 문구만 나열됨',
          '어절 중간이 뚝 잘린 제목이나 어색한 조사가 눈에 거슬림',
          '담당 중개사 사무소 정보나 전화 단추가 작아 누르기 불편함',
          '스팸성 브로커 찌라시로 판단',
          '3초 만에 창 닫고 무응답 이탈',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'DC-MG-04',
    nameKo: '사옥 이전 검토 중소법인 대표',
    roleKo: '사옥용 매물의 실사용 면적·주차 대수·명도 일정 적합성 검증 수요자',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'P0_conversion',
    gtmWeight: 1.5,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'mid',
      entryChannel: 'corporate_hq_search',
      mode: 'consumer',
      domainScope: 'owner_occupied_teaser',
      viewportProfile: { width: 390, height: 844, fontScale: 'normal' },
    },
    stableDimensions: [
      dim('owner_occupier_spec_relevance', '사옥 핵심 제원(실사용 면적·주차·명도) 부합도', 0.94, [
        'C1_provenance_honesty',
        'C3_safe_domain_fit',
      ]),
      dim('exterior_visibility_branding_fit', '대로변 가시성·단독 간판 표기 등 실무 용어 정확성', 0.88, [
        'C2_artifact_shareability',
        'C3_safe_domain_fit',
      ]),
      dim('direct_im_escalation_clarity', '티저 확인 후 상세 IM 요청 동선 명확성', 0.86, [
        'U1_first10s_clarity',
        'U3_flow_resilience',
      ]),
      dim('hotel_adr_revpar_interest', '숙박시설 객실단가(ADR) 관심도', null, ['C3_safe_domain_fit'], {
        missingReason: 'not_applicable_role',
      }),
    ],
    transientState: {
      relationshipState: 'corporate_buyer',
      taskConstraints: '임직원 40명 입주 가능한 사옥 후보인지 티저만으로 1차 스크리닝',
      exposureState: 'dc_to_im_request',
    },
    attractors: [
      {
        id: 'DC-ATT-04-CORE',
        kind: 'core',
        titleKo: '사옥용 맞춤 제원(연면적·층수·주차·명도)을 즉시 확인하고 IM 자료 요청',
        salientAxes: ['C1_provenance_honesty', 'C3_safe_domain_fit', 'U1_first10s_clarity'],
        steps: [
          '카톡 링크 진입 시 사옥용 성격과 연면적 기준 요약 즉시 확인',
          '네이밍 라이츠 같은 외래어 대신 사옥 단독 간판 가능 등 명확한 한국어 확인',
          '3단 제원에서 대지·연면적·층수·사용승인일 및 입주/주차 여건 파악',
          '임대수익률 억지 강조 없이 사옥 실사용 관점의 장점 3줄 확인',
          '법인 대표 맞춤 같은 노골적 타게팅 문구 없이 품격 있는 어조 유지',
          '상세 제안서(IM) 요청 버튼 클릭 후 간단 정보 입력',
          '담당 중개사에게 사옥 투어 문의 접수 완료',
        ],
      },
      {
        id: 'DC-ATT-04-BOUNDARY',
        kind: 'boundary',
        titleKo: '사옥 매물인데 엉뚱한 임대수익률 타령 + 입주·주차 정보 전무로 스크리닝 탈락',
        salientAxes: ['C3_safe_domain_fit', 'C1_provenance_honesty'],
        steps: [
          '사옥용으로 전달받았으나 화면에 0% 공실 수익률이나 무관한 문구 노출',
          '네이밍 라이츠·캡레이트·포스처 등 어색한 번역투 용어 혼재',
          '건물 층수·사용승인일·명도 가능 여부 등 필수 기초 제원 누락',
          '법인 대표 맞춤 같은 어색한 AI 프롬프트 잔재 문구 발견',
          '실제 사옥 입주 가능성 판단 불가',
          '부실 매물로 간주하고 경영지원팀 검토 목록에서 제외',
          '전환 실패',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'DC-MG-05',
    nameKo: '신축·밸류애드 디벨로퍼 심사역',
    roleKo: '토지면적·용도지역·대지 평당가·도로 여건 중심 고속 타당성 검토자',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'P1_retention',
    gtmWeight: 1.2,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'expert',
      entryChannel: 'developer_land_scan',
      mode: 'consumer',
      domainScope: 'value_add_teaser',
      viewportProfile: { width: 390, height: 844, fontScale: 'normal' },
    },
    stableDimensions: [
      dim('land_area_and_zoning_primacy', '신축·개발용 토지면적·용도지역·평당가 정확성 요구', 0.96, [
        'C1_provenance_honesty',
        'C3_safe_domain_fit',
      ]),
      dim('unverified_legal_limit_skepticism', '근거 없는 법정 용적률 단정 표기 경계심', 0.91, [
        'C1_provenance_honesty',
      ]),
      dim('fast_mobile_comparison_ergonomics', '다수 딜카드 연속 스캔 시 일관된 표 구조 선호', 0.85, [
        'U2_visual_ergonomics',
        'C2_artifact_shareability',
      ]),
      dim('retail_franchise_store_ops', '직영 식음료 매장 운영 경험', null, ['C3_safe_domain_fit'], {
        missingReason: 'not_applicable_role',
      }),
    ],
    transientState: {
      relationshipState: 'value_add_developer',
      taskConstraints: '토지면적·용도지역·가격대 3요소로 10초 내 가설계 검토 가치 판별',
      exposureState: 'dc_to_im_request',
    },
    attractors: [
      {
        id: 'DC-ATT-05-CORE',
        kind: 'core',
        titleKo: '신축·개발용 토지면적 우선 표기 + 용도지역·평당가 3단 제원으로 즉시 타당성 포착',
        salientAxes: ['C1_provenance_honesty', 'C3_safe_domain_fit', 'C2_artifact_shareability'],
        steps: [
          '신축·개발용 딜카드에서 연면적이 아닌 토지면적이 대표 면적으로 정확히 노출됨',
          '공통 제원에서 매매금액대·대지면적·용도지역을 즉시 교차 확인',
          '노후 건물 현황(연면적·층수·사용승인일)으로 철거/리모델링 판단 기초 확보',
          '전면 도로폭·명도 등 개발 특화 포인트가 18자 압축 카피로 명확히 제시됨',
          '허위 법정 한도 날조나 NaN/0평 오류 없이 정직한 수치만 노출',
          '검토 가치 확인 후 상세 제안서(IM) 요청 실행',
          '심사 파이프라인 진입 완료',
        ],
      },
      {
        id: 'DC-ATT-05-BOUNDARY',
        kind: 'boundary',
        titleKo: '신축 부지인데 노후 연면적만 크게 적히고 용도지역·토지면적 누락으로 즉시 폐기',
        salientAxes: ['C1_provenance_honesty', 'C3_safe_domain_fit'],
        steps: [
          '신축·개발용 매물임에도 낡은 구옥 연면적만 썸네일에 표기됨',
          '가장 중요한 대지면적과 용도지역 정보가 상세 화면에 빠져 있음',
          '현행 월세 0원/수익률 0%가 그대로 노출되어 매물 매력 훼손',
          '대지 평당가 감을 잡을 수 없어 추가 계산 피로 발생',
          '데이터 정합성 불신',
          'IM 요청 없이 창 종료',
          '딜 소싱 기회 상실',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'DC-MG-06',
    nameKo: '블라인드·링크회수 적대적 감사 프로브',
    roleKo: '비공개/삭제/회수 딜카드 접근 차단, OG 마스킹, 에러 원문 미노출 검증자',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'OPS_foundation',
    gtmWeight: 1.2,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'expert',
      entryChannel: 'adversarial_probe',
      mode: 'adversarial',
      domainScope: 'blind_security_gate',
      viewportProfile: { width: 1440, height: 900, fontScale: 'normal' },
    },
    stableDimensions: [
      dim('fail_closed_revocation_strictness', '삭제·회수·비공개 딜카드 404 차단 엄격성', 0.99, [
        'C3_safe_domain_fit',
        'U3_flow_resilience',
      ]),
      dim('og_and_rsc_payload_sanitization', 'OG 이미지 및 RSC 페이로드 원시 주소 유출 차단', 0.97, [
        'C1_provenance_honesty',
        'C3_safe_domain_fit',
      ]),
      dim('raw_db_error_suppression', 'PGRST/스택트레이스/NaN 노출 차단', 0.95, [
        'U3_flow_resilience',
        'C1_provenance_honesty',
      ]),
      dim('offline_brochure_print_habit', '오프라인 종이 전단 인쇄 선호도', null, ['C2_artifact_shareability'], {
        missingReason: 'not_applicable_role',
      }),
    ],
    transientState: {
      relationshipState: 'chaos_probe',
      taskConstraints: '존재하지 않거나 회수된 UUID·악성 블라인드 토큰 주입 시 100% 방어 검증',
      exposureState: 'unexposed',
    },
    attractors: [
      {
        id: 'DC-ATT-06-CORE',
        kind: 'core',
        titleKo: '미발행·회수 UUID 접근 시 완벽한 Fail-Closed 404 및 OG 무결성 유지',
        salientAxes: ['C3_safe_domain_fit', 'U3_flow_resilience', 'C1_provenance_honesty'],
        steps: [
          '임의/무효 UUID(/dc/00000000-...) 호출 시 원시 DB 에러 없이 깔끔한 안내/404 응답',
          '공개 쇼케이스 8종 딜카드 전체에서 forbiddenPublicTokens(지번·건물명) 노출 0건',
          '카톡 OG 이미지 엔드포인트(/api/og/deal/[id]/kakao-v2) 200 OK 및 유효 PNG 헤더 반환',
          '공개 DTO(toPublicDealCard) strict 스키마로 rent_roll·raw_address 직렬화 원천 차단',
          '콘솔/페이지 런타임 예외 0건 유지',
          '한국어 조사 불일치 및 금지 개발용어 노출 0건 확인',
          '보안·무결성 게이트 완전 통과',
        ],
      },
      {
        id: 'DC-ATT-06-BOUNDARY',
        kind: 'boundary',
        titleKo: '회수된 매물 재열람 허용 또는 OG/본문 지번 유출 발생 시 즉시 릴리즈 차단',
        salientAxes: ['C3_safe_domain_fit', 'C1_provenance_honesty', 'U3_flow_resilience'],
        steps: [
          '무효/비공개 UUID 호출 시 500 에러 또는 PGRST 원시 메시지 화면 출력',
          '공개 딜카드 본문이나 메타태그에 상세 번지·건물명 문자열 잔존',
          'OG 이미지 생성 실패(500 또는 0바이트)로 카카오톡 공유 시 빈 박스 노출',
          'NaN억, undefined평 등 깨진 포맷 토큰 노출',
          '과락(floorRisk=true) 즉시 발동으로 총점 2.85(46.25점) 이하 캡핑',
          '인간 2nd 검수 진입 자동 봉쇄',
          '릴리즈 게이트 FAIL 처리',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
];

export function validateDealCardPersonaInvariants(
  personas: readonly DealCardPpgtPersonaSpec[] = DEALCARD_PPGT_PERSONAS,
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

export function computeDealCardR1Axes(
  metrics: DealCardPpgtProbeMetrics,
): Record<PpgtAxisId, number> {
  const blindLeaks = metrics.blindLeakCount ?? 0;
  const numericSpins = metrics.numericSpinCount ?? 0;
  const missingSpecs = metrics.threeTierSpecMissingCount ?? 0;
  const writingViolations = metrics.uxWritingViolationsCount ?? 0;
  const suitabilityViolations = metrics.contentSuitabilityViolationsCount ?? 0;

  // U1: First-10s Clarity & UX Writing Clarity
  let u1 = 5.0;
  if (metrics.blockingModalDetected) u1 -= 2.2;
  if (metrics.aboveFoldActionCount > 40) u1 -= 1.8;
  else if (metrics.aboveFoldActionCount > 24) u1 -= 1.1;
  else if (metrics.aboveFoldActionCount > 16) u1 -= 0.45;
  if ((metrics.stepCount ?? 0) > 5) u1 -= 0.4;
  if (writingViolations > 0) u1 -= Math.min(1.6, 0.45 * writingViolations);
  if (!metrics.taskCompleted) u1 -= 1.5;

  // U2: Visual & Mobile Ergonomics (390px normal/xlarge, >=44px tap targets, >=14.5px text)
  let u2 = 5.0;
  if (metrics.horizontalOverflowPx > 20) u2 -= 2.8;
  else if (metrics.horizontalOverflowPx > 1) u2 -= 2.2;
  if (metrics.sub44ButtonsCount > 0) u2 -= Math.min(1.6, 0.35 * metrics.sub44ButtonsCount);
  if (metrics.sub15TextsCount > 0) u2 -= Math.min(1.2, 0.25 * metrics.sub15TextsCount);
  if (metrics.clippedButtonsCount > 0) u2 -= Math.min(1.4, 0.4 * metrics.clippedButtonsCount);
  if (metrics.brokenImgCount > 0) u2 -= 2.0;

  // U3: Flow Resilience & Honest Save
  let u3 = 5.0;
  if (!metrics.taskCompleted) u3 -= 2.6;
  if (metrics.pageErrorCount > 0) u3 -= Math.min(2.4, 1.2 * metrics.pageErrorCount);
  if (metrics.consoleErrorCount > 0) u3 -= Math.min(1.2, 0.4 * metrics.consoleErrorCount);
  if (metrics.honestSaveVisible === false) u3 -= 0.5;

  // C1: Provenance, Fact Completeness (3-tier specs) & Objective Numbers
  let c1 = 5.0;
  if (!metrics.provenanceBadgeVisible) c1 -= 1.8;
  if (metrics.poisonTokenCount > 0) c1 -= 2.6;
  if (numericSpins > 0) c1 -= Math.min(1.8, 0.6 * numericSpins);
  if (missingSpecs > 0) c1 -= Math.min(1.8, 0.6 * missingSpecs);
  if (suitabilityViolations > 0) c1 -= Math.min(2.4, 0.9 * suitabilityViolations);

  // C2: Artifact Shareability, Kakao 2x2 OG & Writing Dignity
  let c2 = 5.0;
  if (!metrics.artifactValid) c2 -= 2.6;
  if (metrics.bannedTermCount > 0) c2 -= Math.min(2.2, 0.8 * metrics.bannedTermCount);
  if (writingViolations > 0) c2 -= Math.min(1.8, 0.55 * writingViolations);
  if (missingSpecs > 0) c2 -= Math.min(1.2, 0.4 * missingSpecs);
  if (metrics.brokenImgCount > 0) c2 -= 1.2;

  // C3: Blind K-Anonymity, Statutory Disclosure & Domain Fit
  let c3 = 5.0;
  if (blindLeaks > 0) c3 -= 3.6;
  if (metrics.boundaryViolationCount > 0) c3 -= 2.8;
  if (suitabilityViolations > 0) c3 -= Math.min(3.2, 1.2 * suitabilityViolations);
  if (numericSpins > 0) c3 -= Math.min(1.5, 0.5 * numericSpins);
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

export function computeDealCardAxisSalience(
  persona: DealCardPpgtPersonaSpec,
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

function inferDefaultDealCardHints(
  metrics: DealCardPpgtProbeMetrics,
): DealCardPpgtIssueHint[] {
  const hints: DealCardPpgtIssueHint[] = [...(metrics.issueHints ?? [])];
  const seen = new Set(hints.map((h) => `${h.issueKey}:${h.targetFileHint}`));
  const add = (hint: DealCardPpgtIssueHint) => {
    const k = `${hint.issueKey}:${hint.targetFileHint}`;
    if (!seen.has(k)) {
      seen.add(k);
      hints.push(hint);
    }
  };

  const isPublicDc = metrics.surface.startsWith('/dc/');
  const defaultUiFile = isPublicDc
    ? 'src/app/(public)/dc/[id]/page.tsx'
    : 'src/components/broker/deal-card/Card4ConfirmCard.tsx';

  if (metrics.aboveFoldActionCount > 16) {
    add({
      issueKey: 'cognitive_above_fold_overload',
      targetFileHint: defaultUiFile,
      axis: 'U1_first10s_clarity',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: aboveFoldActionCount=${metrics.aboveFoldActionCount} (권장 <= 16개)`,
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
  if (metrics.sub15TextsCount > 0) {
    add({
      issueKey: 'sub15_small_text',
      targetFileHint: defaultUiFile,
      axis: 'U2_visual_ergonomics',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: <14.5px small text ${metrics.sub15TextsCount}건`,
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
  if (metrics.brokenImgCount > 0) {
    add({
      issueKey: 'broken_image_asset',
      targetFileHint: 'src/app/api/og/deal/[id]/kakao-v2/route.tsx',
      axis: 'U2_visual_ergonomics',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: broken img naturalWidth===0 (${metrics.brokenImgCount}건)`,
    });
  }
  if ((metrics.blindLeakCount ?? 0) > 0) {
    add({
      issueKey: 'blind_address_or_tenant_leak',
      targetFileHint: 'src/domain/public-projection/deal-card.ts',
      axis: 'C3_safe_domain_fit',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: 블라인드 지번/건물명/상호 노출 ${metrics.blindLeakCount}건`,
    });
  }
  if ((metrics.numericSpinCount ?? 0) > 0) {
    add({
      issueKey: 'subjective_numeric_spin',
      targetFileHint: 'src/lib/deal-card/blind-guard.ts',
      axis: 'C1_provenance_honesty',
      track: 'track2_copy_prompt',
      summary: `${metrics.surface}: 수치 주관적 형용사 과장 ${metrics.numericSpinCount}건`,
    });
  }
  if ((metrics.threeTierSpecMissingCount ?? 0) > 0) {
    add({
      issueKey: 'missing_3tier_standard_specs',
      targetFileHint: 'src/app/(public)/dc/[id]/page.tsx',
      axis: 'C1_provenance_honesty',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: 매물 3단 표준 제원(공통·건물·목적별) 미표시 ${metrics.threeTierSpecMissingCount}섹션`,
    });
  }
  if ((metrics.uxWritingViolationsCount ?? 0) > 0) {
    add({
      issueKey: 'ux_writing_josa_or_truncation',
      targetFileHint: defaultUiFile,
      axis: 'C2_artifact_shareability',
      track: 'track2_copy_prompt',
      summary: `${metrics.surface}: 한국어 조사/말줄임 UX 라이팅 결함 ${metrics.uxWritingViolationsCount}건`,
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
      targetFileHint: defaultUiFile,
      axis: 'C3_safe_domain_fit',
      track: 'track2_copy_prompt',
      summary: `${metrics.surface}: 딜카드 콘텐츠 적합성 위반 ${metrics.contentSuitabilityViolationsCount}건`,
    });
  }
  if (metrics.poisonTokenCount > 0 || metrics.pageErrorCount > 0 || !metrics.taskCompleted) {
    add({
      issueKey: 'runtime_or_poison_failure',
      targetFileHint: 'src/app/(broker)/broker/w/dealcards/page.tsx',
      axis: 'U3_flow_resilience',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: pageErrors=${metrics.pageErrorCount}, poison=${metrics.poisonTokenCount}, completed=${metrics.taskCompleted}`,
    });
  }
  if (!metrics.provenanceBadgeVisible) {
    add({
      issueKey: 'missing_provenance_badge',
      targetFileHint: 'src/components/teaser/TrustLine.tsx',
      axis: 'C1_provenance_honesty',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: 검증 공인중개사/출처 안심 신호 미확인`,
    });
  }
  if (metrics.boundaryViolationCount > 0) {
    add({
      issueKey: 'boundary_or_statutory_violation',
      targetFileHint: 'src/lib/legal/broker-statutory-disclosure.ts',
      axis: 'C3_safe_domain_fit',
      track: 'track1_ui_gate_renderer',
      summary: `${metrics.surface}: 법정 표시/공개 경계 위반 ${metrics.boundaryViolationCount}건`,
    });
  }

  return hints;
}

export function scoreDealCardPpgtRun(
  metrics: DealCardPpgtProbeMetrics,
  personas: readonly DealCardPpgtPersonaSpec[] = DEALCARD_PPGT_PERSONAS,
): DealCardPpgtScoreResult {
  const persona = personas.find((p) => p.id === metrics.personaId);
  if (!persona) {
    throw new Error(`Unknown DealCard PPGT personaId: ${metrics.personaId}`);
  }

  const r1Axes = computeDealCardR1Axes(metrics);
  const axisSalience = computeDealCardAxisSalience(persona);
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
  if ((metrics.blindLeakCount ?? 0) > 0) floorReasons.push(`hard:blind_leak_${metrics.blindLeakCount}`);
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

  const issueHints = inferDefaultDealCardHints(metrics);
  const topHint = issueHints[0]?.summary ?? '핵심 동선 및 블라인드·제원 정합성 정상 통과';
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

export const DEALCARD_NEGATIVE_CONTROL_FIXTURES: ReadonlyArray<{
  controlId: string;
  metrics: DealCardPpgtProbeMetrics;
}> = [
  {
    controlId: 'NC-DC-01',
    metrics: {
      personaId: 'DC-MG-02',
      surface: 'nc-dc-01-blind-jibun-leak-clean-layout',
      viewport: '1440x900',
      fontScale: 'normal',
      aboveFoldActionCount: 8,
      totalVisibleInteractiveCount: 20,
      horizontalOverflowPx: 0,
      sub44ButtonsCount: 0,
      sub15TextsCount: 0,
      clippedButtonsCount: 0,
      brokenImgCount: 0,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      poisonTokenCount: 0,
      bannedTermCount: 0,
      blindLeakCount: 2,
      taskCompleted: true,
      blockingModalDetected: false,
      boundaryViolationCount: 0,
      provenanceBadgeVisible: true,
      artifactValid: true,
    },
  },
  {
    controlId: 'NC-DC-02',
    metrics: {
      personaId: 'DC-MG-03',
      surface: 'nc-dc-02-mobile-xlarge-overflow-missing-specs',
      viewport: '390x844',
      fontScale: 'xlarge',
      aboveFoldActionCount: 9,
      totalVisibleInteractiveCount: 16,
      horizontalOverflowPx: 38,
      sub44ButtonsCount: 6,
      sub15TextsCount: 3,
      clippedButtonsCount: 2,
      brokenImgCount: 1,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      poisonTokenCount: 0,
      bannedTermCount: 1,
      threeTierSpecMissingCount: 3,
      numericSpinCount: 2,
      taskCompleted: true,
      blockingModalDetected: false,
      boundaryViolationCount: 0,
      provenanceBadgeVisible: true,
      artifactValid: false,
    },
  },
  {
    controlId: 'NC-DC-03',
    metrics: {
      personaId: 'DC-MG-06',
      surface: 'nc-dc-03-revoked-link-still-public-poison',
      viewport: '1440x900',
      fontScale: 'normal',
      aboveFoldActionCount: 6,
      totalVisibleInteractiveCount: 12,
      horizontalOverflowPx: 0,
      sub44ButtonsCount: 0,
      sub15TextsCount: 0,
      clippedButtonsCount: 0,
      brokenImgCount: 0,
      consoleErrorCount: 2,
      pageErrorCount: 1,
      poisonTokenCount: 2,
      bannedTermCount: 2,
      taskCompleted: false,
      blockingModalDetected: false,
      boundaryViolationCount: 2,
      provenanceBadgeVisible: false,
      artifactValid: false,
    },
  },
];

export function verifyDealCardAntiSycophancyControls(): {
  passed: boolean;
  controls: Array<{ controlId: string; score: number; floorRisk: boolean; reasons: string[] }>;
  failures: string[];
} {
  const controls: Array<{ controlId: string; score: number; floorRisk: boolean; reasons: string[] }> =
    [];
  const failures: string[] = [];

  for (const nc of DEALCARD_NEGATIVE_CONTROL_FIXTURES) {
    const res = scoreDealCardPpgtRun(nc.metrics);
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

export function rankDealCardPpgtBacklog(
  runs: readonly DealCardPpgtScoreResult[],
  personas: readonly DealCardPpgtPersonaSpec[] = DEALCARD_PPGT_PERSONAS,
): DealCardPpgtBacklogCluster[] {
  const byCluster = new Map<
    string,
    {
      issueKey: string;
      targetFileHint: string;
      axis: PpgtAxisId;
      track: RemediationTrack;
      baseSum: number;
      anyFloorRisk: boolean;
      affectedPersonas: Set<DealCardPpgtPersonaId>;
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
        affectedPersonas: new Set<DealCardPpgtPersonaId>(),
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

  const out: DealCardPpgtBacklogCluster[] = [];
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
