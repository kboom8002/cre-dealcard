/**
 * @file src/lib/qa/im-ppgt-personas.ts
 * @description IM 작성 파이프라인 및 산출물 4종 특화 Parametric Persona Golden Testing (PPGT-Loop)
 *   마이크로 타겟 페르소나 6종(IM-MG-01..06), 6축 결정론적 R1 스코어러, 비보상 하한 캡(R2),
 *   반아첨 음성 대조군 검증(NC-01..03), 및 P-Score 백로그 우선순위 엔진.
 *
 * PPGT-Loop 불변식 준수:
 * - INV-P01 (TC21): status === 'provisional' 동안 populationShare === null, populationShareMetadata === null
 * - INV-P02 (TC23): 미관측/비적용 차원에 0.5 대입 금지 (estimate: null + missingReason 명시)
 * - INV-P03 (TC34): 정치/이념/민감 속성 프로파일링 차원 전면 배제
 * - INV-P05 (INV-403): stableDimensions 와 transient(relationship/task/exposure) 상태 분리
 * - INV-P06 / P07: 합성 반응 "[SIMULATED] " 접두사 강제 및 개인 타게팅 금지
 */

export type ImPpgtPersonaId =
  | 'IM-MG-01'
  | 'IM-MG-02'
  | 'IM-MG-03'
  | 'IM-MG-04'
  | 'IM-MG-05'
  | 'IM-MG-06';

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
export type RemediationTrack = 'track1_ui_renderer' | 'track2_prompt';

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

export interface ImPpgtPersonaSpec {
  id: ImPpgtPersonaId;
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
    entryChannel: 'workspace_editor' | 'studio_editor' | 'kakao_share_mobile' | 'pro_grant_link';
    mode: 'creator' | 'consumer' | 'adversarial';
    domainScope: 'basic_im_9sec' | 'pro_im_5posture' | 'multi_asset';
    viewportProfile: {
      width: number;
      height: number;
      fontScale: 'normal' | 'xlarge';
    };
  };
  stableDimensions: readonly StableDimensionEntry[];
  transientState: {
    relationshipState: 'first_visit' | 'repeat_broker' | 'prospective_buyer' | 'institutional_dd' | 'chaos_probe';
    taskConstraints: string;
    exposureState: 'unexposed' | 'teaser_to_im' | 'studio_roundtrip';
  };
  attractors: readonly [PatternAttractor, PatternAttractor];
  forbiddenDimensionAuditPassed: boolean;
}

export interface ImPpgtIssueHint {
  issueKey: string;
  targetFileHint: string;
  axis: PpgtAxisId;
  track: RemediationTrack;
  summary: string;
}

export interface ImPpgtProbeMetrics {
  personaId: ImPpgtPersonaId;
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
  taskCompleted: boolean;
  blockingModalDetected: boolean;
  boundaryViolationCount: number;
  provenanceBadgeVisible: boolean;
  artifactValid: boolean;
  stepCount?: number;
  honestSaveVisible?: boolean;
  unreviewedNoticeVisible?: boolean;
  observedHeadings?: readonly string[];
  observedButtons?: readonly string[];
  observedBadges?: readonly string[];
  issueHints?: readonly ImPpgtIssueHint[];
}

export interface ImPpgtScoreResult {
  personaId: ImPpgtPersonaId;
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
  issueHints: ImPpgtIssueHint[];
}

export interface ImPpgtBacklogCluster {
  issueKey: string;
  targetFileHint: string;
  axis: PpgtAxisId;
  track: RemediationTrack;
  pScore: number;
  tier: BacklogTier;
  anyFloorRisk: boolean;
  affectedPersonas: ImPpgtPersonaId[];
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
  } = {}
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
    evidenceIds: options.evidenceIds ?? ['EV-CRE-WORKFLOW-24D'],
    mappedAxes,
  };
}

export const IM_PPGT_PERSONAS: readonly ImPpgtPersonaSpec[] = [
  {
    id: 'IM-MG-01',
    nameKo: '60대 시니어 대표 중개사',
    roleKo: '소형·꼬마빌딩 전속 중개사무소 대표 (디지털 피로 민감)',
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
      domainScope: 'basic_im_9sec',
      viewportProfile: { width: 1440, height: 900, fontScale: 'xlarge' },
    },
    stableDimensions: [
      dim('senior_readability_sensitivity', '대형 글꼴·고대비 시인성 민감도', 0.94, ['U2_visual_ergonomics'], { evidenceIds: ['EV-SUB14-GUARD', 'EV-PILOT-SPEC'] }),
      dim('cognitive_overload_aversion', '첫 화면 입력칸/버튼 과부하 회피', 0.92, ['U1_first10s_clarity'], { evidenceIds: ['EV-SOTA-83-CTAS'] }),
      dim('jargon_intolerance', '개발/영어 약어·직역 용어 거부감', 0.9, ['C2_artifact_shareability', 'C3_safe_domain_fit'], { evidenceIds: ['EV-LEXICON-SSOT'] }),
      dim('statutory_penalty_anxiety', '공인중개사법 5대 표기 누락 불안', 0.88, ['C3_safe_domain_fit', 'U3_flow_resilience'], { evidenceIds: ['EV-STATUTORY-422'] }),
      dim('manual_undo_safety_need', '실수 복구 및 정직한 자동저장 신뢰 필요', 0.82, ['U3_flow_resilience'], { evidenceIds: ['EV-HONEST-SAVE'] }),
      dim('multi_sheet_excel_macro_skill', '대용량 엑셀 매크로 숙련도', null, ['U1_first10s_clarity'], { missingReason: 'not_applicable_role' }),
    ],
    transientState: {
      relationshipState: 'first_visit',
      taskConstraints: '5분 내 실매물 1건 입력·생성·PPTX 저장 완주',
      exposureState: 'unexposed',
    },
    attractors: [
      {
        id: 'ATT-01-CORE',
        kind: 'core',
        titleKo: '주소 한 번으로 공부·지적도 자동 채움 후 깔끔한 9면 Basic IM 완성',
        salientAxes: ['U1_first10s_clarity', 'U2_visual_ergonomics'],
        steps: [
          '빈 작업실 진입 시 3선택 시작 카드 인지',
          '주소 입력 및 건물 정보 자동 채우기 클릭',
          '원화 입력칸과 억/만 실시간 읽기 확인',
          '큰 글꼴 xlarge에서도 잘림 없이 다음 단계 이동',
          '현장 사진 드래그/선택 후 IM 만들기 클릭',
          '발행 중 정직한 진행 상태 확인',
          '깨끗한 10면 PPTX 다운로드 완료',
        ],
      },
      {
        id: 'ATT-01-BOUNDARY',
        kind: 'boundary',
        titleKo: '화면 버튼 홍수 + 낯선 개발용어 + 422 오류 막다른 골목 이탈',
        salientAxes: ['U1_first10s_clarity', 'U2_visual_ergonomics', 'C3_safe_domain_fit'],
        steps: [
          '작업실 진입 직후 수십 개 버튼·배지 동시 노출',
          '포스처·바텀시트·OG 등 낯선 용어에 멈칫함',
          'xlarge 모드에서 버튼 글씨 잘림 또는 작은 글씨 발견',
          '임시저장 유무 불확실해 같은 버튼 중복 클릭',
          '발행 시 422 차단 발생했으나 이동 CTA 미발견',
          '어디를 고쳐야 하는지 몰라 60초 이상 표류',
          '결국 기존 한글/PPT 수작업으로 이탈',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'IM-MG-02',
    nameKo: '30~40대 실무 팀장',
    roleKo: '렌트롤 대량 붙여넣기 및 스튜디오 세밀 편집 담당',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'P0_conversion',
    gtmWeight: 1.5,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'mid',
      entryChannel: 'studio_editor',
      mode: 'creator',
      domainScope: 'multi_asset',
      viewportProfile: { width: 1180, height: 820, fontScale: 'normal' },
    },
    stableDimensions: [
      dim('bulk_rentroll_speed_demand', '엑셀 TSV·다층 렌트롤 고속 처리 요구', 0.9, ['U3_flow_resilience', 'C1_provenance_honesty'], { evidenceIds: ['EV-RENTROLL-R2'] }),
      dim('studio_roundtrip_fidelity', '스튜디오 슬라이드 편집→PPTX 1:1 반영 기대', 0.92, ['C2_artifact_shareability', 'U3_flow_resilience'], { evidenceIds: ['EV-STUDIO-SYNC'] }),
      dim('compact_laptop_density_fit', '노트북(1180px) 패널/드로어 무충돌 조작', 0.84, ['U2_visual_ergonomics'], { evidenceIds: ['EV-LAPTOP-DRAWER'] }),
      dim('institutional_valuation_audit', '기관급 펀드 약정 심사 문서 작성 빈도', null, ['C1_provenance_honesty'], { missingReason: 'not_observed' }),
    ],
    transientState: {
      relationshipState: 'repeat_broker',
      taskConstraints: '렌트롤 10열 입력 + Basic IM Studio 지도/텍스트 수정 후 재다운로드',
      exposureState: 'studio_roundtrip',
    },
    attractors: [
      {
        id: 'ATT-02-CORE',
        kind: 'core',
        titleKo: '엑셀 복붙 → 수익률 실시간 연동 → 스튜디오 미세 수정 후 PPTX 즉시 출력',
        salientAxes: ['U3_flow_resilience', 'C2_artifact_shareability'],
        steps: [
          '2탭 층별 임대현황 진입 및 엑셀/TSV 붙여넣기',
          '보증금·월세·Cap Rate 즉시 재계산 확인',
          '우측 미리보기 클릭으로 편집 칸 역추적(Click-to-Edit)',
          'Basic IM Studio 이동 후 슬라이드 제목/지도 편집',
          'Ctrl+Z Undo/Redo 및 저장 상태 확인',
          'PPTX 다운로드 실행',
          '웹 뷰어와 PPTX 합계 수치 100% 일치 확인',
        ],
      },
      {
        id: 'ATT-02-BOUNDARY',
        kind: 'boundary',
        titleKo: '스튜디오 수정본 증발 및 웹↔PPTX 수치 불일치로 신뢰 상실',
        salientAxes: ['U3_flow_resilience', 'C1_provenance_honesty', 'C2_artifact_shareability'],
        steps: [
          '1180px 노트북 화면에서 렌트롤 입력칸/미리보기 겹침',
          '엑셀 붙여넣기 후 일부 호실 공실/자가사용 합계 오차 발생',
          '스튜디오에서 슬라이드 문구·지도 위치 수정 후 저장',
          '뒤로가기 또는 다운로드 시 수정 내용이 초기화됨',
          '웹 요약 연면적과 PPTX A04/A24 면적 수치가 다름',
          '고객 발송 전 전수 재계산 필요성 발생',
          '팀 업무 도구 채택 보류',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'IM-MG-03',
    nameKo: '대형·개발형 전속 브로커',
    roleKo: '초고가(1조+)·다필지·Pro IM 및 섹션 숨김 거버넌스 담당',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'P1_retention',
    gtmWeight: 1.2,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'expert',
      entryChannel: 'workspace_editor',
      mode: 'creator',
      domainScope: 'pro_im_5posture',
      viewportProfile: { width: 1440, height: 900, fontScale: 'normal' },
    },
    stableDimensions: [
      dim('high_ticket_precision', '초고가(>=1조) 단위·다필지 정밀 표기 민감도', 0.91, ['C1_provenance_honesty', 'C2_artifact_shareability'], { evidenceIds: ['EV-TRILLION-BAND'] }),
      dim('confidentiality_section_lock', '민감 섹션 서버 비공개(hiddenSections) 신뢰 요구', 0.95, ['C3_safe_domain_fit'], { evidenceIds: ['EV-PR2C-HIDDEN-SECTIONS'] }),
      dim('posture_separation_rigor', 'Basic 9섹션 vs Pro 5포스처 격리 준수', 0.87, ['C2_artifact_shareability', 'C3_safe_domain_fit'], { evidenceIds: ['EV-RULE47-SSOT'] }),
      dim('senior_21px_scale_need', '21px xlarge 시니어 폰트 배율 의존성', null, ['U2_visual_ergonomics'], { missingReason: 'not_applicable_role' }),
    ],
    transientState: {
      relationshipState: 'repeat_broker',
      taskConstraints: '1조원 이상 사옥/개발 물건 생성 및 민감 섹션 서버 필터링 검증',
      exposureState: 'studio_roundtrip',
    },
    attractors: [
      {
        id: 'ATT-03-CORE',
        kind: 'core',
        titleKo: '정확가·가격대 절삭 0건 및 숨긴 섹션 API 원문까지 완벽 봉쇄',
        salientAxes: ['C1_provenance_honesty', 'C3_safe_domain_fit'],
        steps: [
          '매각가 1조 원 이상 및 다필지 주소 입력',
          '가격대("1조대" / "1조 500억대")·단가 정합 확인',
          'Basic/Pro 목적 전환 시 알맞은 슬라이드 시퀀스 구성',
          '민감 섹션을 hiddenSections로 비공개 설정',
          '공개 API 응답 JSON 내 해당 섹션 제거 확인',
          '토지이용계획확인원 2~3행 및 본건 경계 확인',
          'Pro/Basic 구분된 고품질 문서 생성 완료',
        ],
      },
      {
        id: 'ATT-03-BOUNDARY',
        kind: 'boundary',
        titleKo: '비공개 섹션 JSON 유출 또는 Basic IM에 DCF/Pro 슬라이드 혼입',
        salientAxes: ['C3_safe_domain_fit', 'C2_artifact_shareability'],
        steps: [
          '1조원 이상 금액에서 단위 절삭 또는 가격 밴드 노출',
          '숨김 처리한 섹션이 공개 뷰어 네트워크 응답에 잔존',
          'Basic IM인데 미완성 Pro 분석 슬라이드가 섞여 나옴',
          '건폐율/용적률 추정 기본값을 공식 법정한도로 오표기',
          '초안(draft) 상태에서 외부 스냅샷 우회 열람 가능',
          '매도인 비밀유지 계약 위반 우려 발생',
          '대형 전속 물건 시스템 업로드 금지 결정',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'IM-MG-04',
    nameKo: '매수자 · 개인 자산가',
    roleKo: '카카오톡 공유 링크로 모바일 IM을 처음 열람하는 고액 자산가',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'P0_viral',
    gtmWeight: 1.5,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'senior_high',
      entryChannel: 'kakao_share_mobile',
      mode: 'consumer',
      domainScope: 'basic_im_9sec',
      viewportProfile: { width: 390, height: 844, fontScale: 'xlarge' },
    },
    stableDimensions: [
      dim('mobile_first10s_scan', '모바일 10초 내 핵심가·입지·수익률 파악 기대', 0.93, ['U1_first10s_clarity', 'U2_visual_ergonomics'], { evidenceIds: ['EV-PUBLIC-IM-390'] }),
      dim('blind_og_security_trust', '카톡 미리보기·모바일 뷰어 내 비공개 정보 보호 신뢰', 0.89, ['C3_safe_domain_fit'], { evidenceIds: ['EV-PR2C-OG-MASK'] }),
      dim('mobile_cta_reachability', '엄지손가락 44px 이상 상세자료 요청/전화 터치 용이성', 0.91, ['U2_visual_ergonomics', 'U3_flow_resilience'], { evidenceIds: ['EV-TAP-44PX'] }),
      dim('studio_editor_shortcut_habit', '데스크톱 Ctrl+Z 스튜디오 단축키 습관', null, ['U3_flow_resilience'], { missingReason: 'not_applicable_role' }),
    ],
    transientState: {
      relationshipState: 'prospective_buyer',
      taskConstraints: '카톡 링크 클릭 → 390px 모바일 대형글씨로 9섹션 열람 → 자료요청 제출',
      exposureState: 'teaser_to_im',
    },
    attractors: [
      {
        id: 'ATT-04-CORE',
        kind: 'core',
        titleKo: '가로 스크롤 0px·큰 글씨·즉시 열람 후 원탭 상세자료 요청',
        salientAxes: ['U1_first10s_clarity', 'U2_visual_ergonomics', 'C2_artifact_shareability'],
        steps: [
          '카톡 링크 프리뷰에서 깔끔한 요약 정보 확인',
          '로그인 월 없이 1.5초 내 모바일 IM 첫 화면 진입',
          '핵심 매각가·위치·수익률 카드 즉시 스캔',
          '390px xlarge 환경에서도 가로 넘침·글자 겹침 0건',
          '현장 사진·입지 지도 정상 로딩 확인',
          '하단 44px+ CTA로 상세 자료 요청서 간단 제출',
          '중개사 연락처 및 법정 표기 하단 확인으로 신뢰 확보',
        ],
      },
      {
        id: 'ATT-04-BOUNDARY',
        kind: 'boundary',
        titleKo: '가로 잘림·깨진 지도 이미지·강제 로그인 벽으로 즉시 이탈',
        salientAxes: ['U1_first10s_clarity', 'U2_visual_ergonomics', 'U3_flow_resilience'],
        steps: [
          '링크 클릭 직후 과도한 팝업이나 로그인 유도 장벽',
          '모바일 390px/360px 화면이 오른쪽으로 삐져나옴',
          'xlarge 설정 시 표/버튼 글씨가 서로 겹쳐 숫자 판독 불가',
          '지도나 현장 사진이 엑스박스(naturalWidth=0)로 깨짐',
          '상세 요청 버튼이 너무 작거나 화면 밖으로 밀림',
          '원시 영문 에러 코드 또는 포이즌 토큰 노출',
          '30초 내 창 닫고 중개사 신뢰 하락',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'IM-MG-05',
    nameKo: '기관 · 법인 실사 담당자',
    roleKo: 'Pro IM 웹 뷰어(/im-pro)와 PPTX를 대조 검증하는 투자심사역',
    status: 'provisional',
    populationShare: null,
    populationShareMetadata: null,
    gtmTier: 'P1_retention',
    gtmWeight: 1.2,
    syntheticLabelRequired: true,
    individualTargetingProhibited: true,
    routingAxes: {
      literacyDistance: 'expert',
      entryChannel: 'pro_grant_link',
      mode: 'consumer',
      domainScope: 'pro_im_5posture',
      viewportProfile: { width: 1440, height: 900, fontScale: 'normal' },
    },
    stableDimensions: [
      dim('fact_provenance_strictness', '공적장부 vs 중개사 입력 출처·기준일 투명성 요구', 0.96, ['C1_provenance_honesty'], { evidenceIds: ['EV-IMCORE-DISPLAY-LABEL'] }),
      dim('cross_format_numeric_parity', '웹 뷰어 ↔ PPTX 11대 제원·렌트롤 10열 정합성 감시', 0.94, ['C1_provenance_honesty', 'C2_artifact_shareability'], { evidenceIds: ['EV-FACT-ORACLE-736'] }),
      dim('hallucination_zero_tolerance', '렌트롤 미등재 날조 상호·회피성 문구 10종 무관용', 0.95, ['C1_provenance_honesty', 'C3_safe_domain_fit'], { evidenceIds: ['EV-TENANT-POLICY', 'EV-RULE54'] }),
      dim('senior_button_size_dependence', '초대형 21px UI 의존도', null, ['U2_visual_ergonomics'], { missingReason: 'not_observed' }),
    ],
    transientState: {
      relationshipState: 'institutional_dd',
      taskConstraints: 'Pro 웹 뷰어와 다운로드 PPTX 교차 대조 및 출처/면적/임대차 감사',
      exposureState: 'teaser_to_im',
    },
    attractors: [
      {
        id: 'ATT-05-CORE',
        kind: 'core',
        titleKo: '공적장부 출처 배지 명확·웹/PPTX 전 수치 100% 일치로 투심위 즉시 첨부',
        salientAxes: ['C1_provenance_honesty', 'C2_artifact_shareability'],
        steps: [
          '허가된 /im-pro 링크로 정식 제안서 진입',
          '11대 물건 개요 제원 및 출처 배지(공적장부/중개사) 확인',
          '스태킹 플랜과 10열 렌트롤 합계 교차 검증',
          'PPTX 다운로드 후 A23/A24/A27 수치 일관성 확인',
          '회피성 문구/목데이터/가격밴드 0건 확인',
          '공시지가 기준연월 및 부동산원 지가변동률 출처 확인',
          '내부 투자심의위원회 참고자료로 채택',
        ],
      },
      {
        id: 'ATT-05-BOUNDARY',
        kind: 'boundary',
        titleKo: '허위 임차인 날조·추정 법정 한도 표기·회피 문구로 자료 폐기',
        salientAxes: ['C1_provenance_honesty', 'C3_safe_domain_fit'],
        steps: [
          '웹 요약 면적과 PPTX 표 면적이 서로 다름',
          '임대료 합계가 공실 희망월세를 포함해 부풀려짐',
          '렌트롤에 없는 유명 프랜차이즈 상호가 본문에 등장',
          '"본문을 참조", "현장 실사 확인" 등 회피 문구 발견',
          '출처/기준시점 없이 추정 용적률을 법정 한도로 표기',
          '오프라인 오라클 검증 시 FACT FAIL 발생',
          '브로커 신뢰 불가 판정 및 검토 중단',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
  {
    id: 'IM-MG-06',
    nameKo: '불량 데이터 · 장애 예외 상황',
    roleKo: '가상 지번, 평/㎡ 혼동, 스토리지/DB 오류 등 악조건 카오스 프로브',
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
      domainScope: 'multi_asset',
      viewportProfile: { width: 1440, height: 900, fontScale: 'normal' },
    },
    stableDimensions: [
      dim('fail_closed_honesty_sensitivity', 'DB/Storage/거버넌스 실패 시 무음 통과 대신 정직한 500/502/503', 0.96, ['U3_flow_resilience', 'C3_safe_domain_fit'], { evidenceIds: ['EV-K1-K2-FAIL-CLOSED'] }),
      dim('poison_raw_error_intolerance', 'PGRST/NaN/undefined/[object Object] 노출 제로', 0.95, ['C1_provenance_honesty', 'U3_flow_resilience'], { evidenceIds: ['EV-POISON-ZERO'] }),
      dim('shared_pc_hygiene_strictness', '로그아웃 후 sessionStorage/localStorage 0바이트 소거', 0.92, ['C3_safe_domain_fit'], { evidenceIds: ['EV-K4-STORAGE'] }),
      dim('visual_palette_aesthetic_preference', 'PPTX 스킨 색감 선호도', null, ['C2_artifact_shareability'], { missingReason: 'not_applicable_role' }),
    ],
    transientState: {
      relationshipState: 'chaos_probe',
      taskConstraints: '가상 지번/면적 역전/미완성 프로필/권한 회수/공용 PC 이탈 검증',
      exposureState: 'studio_roundtrip',
    },
    attractors: [
      {
        id: 'ATT-06-CORE',
        kind: 'core',
        titleKo: '오류 원인 한글 1줄 안내 + 원클릭 복구 + 무손실 상태 유지',
        salientAxes: ['U3_flow_resilience', 'C3_safe_domain_fit'],
        steps: [
          '연면적 < 대지면적 입력 시 자동 자리 바꾸기 경고 카드 노출',
          '5대 법정 표기 누락 시 422 차단 + 프로필 바로가기 링크 제공',
          'DB/스토리지 실패 시 저장됨으로 위장하지 않고 재시도 제공',
          '미확정 초안/회수 링크는 403/409/503 Fail-Closed 차단',
          '런타임 에러·콘솔 에러·포이즌 토큰 0건 유지',
          '로그아웃/전환 시 공용 PC 임시 키 깔끔히 소거',
          '정상 복구 입력 후 즉시 다음 단계 재개',
        ],
      },
      {
        id: 'ATT-06-BOUNDARY',
        kind: 'boundary',
        titleKo: '무음 데이터 유실·원시 DB 에러 노출·회수 링크 무단 열람',
        salientAxes: ['U3_flow_resilience', 'C1_provenance_honesty', 'C3_safe_domain_fit'],
        steps: [
          '저장/업로드 실패했는데 UI는 저장 완료로 위장',
          '화면에 PGRST204, NaN, [object Object] 등 raw 에러 노출',
          '공용 PC 로그아웃 후 이전 매물 메모가 localStorage/sessionStorage에 잔존',
          '회수된 공유 링크 또는 초안 매물이 공개 URL에서 열림',
          '브라우저 uncaught pageerror 또는 500 크래시 발생',
          '사용자가 새로고침 외 복구 수단 상실',
          '실데이터 유실 및 보안 사고 발생',
        ],
      },
    ],
    forbiddenDimensionAuditPassed: true,
  },
];

export function validateImPersonaInvariants(
  personas: readonly ImPpgtPersonaSpec[] = IM_PPGT_PERSONAS
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const p of personas) {
    if (p.status === 'provisional') {
      if (p.populationShare !== null) {
        violations.push(`${p.id}: INV-P01(TC21) violation — provisional populationShare must be null`);
      }
      if (p.populationShareMetadata !== null) {
        violations.push(`${p.id}: INV-P01(TC21) violation — provisional populationShareMetadata must be null`);
      }
    }
    if (!p.syntheticLabelRequired || !p.individualTargetingProhibited) {
      violations.push(`${p.id}: INV-P06/P07 violation — synthetic label & anti-targeting flags must be true`);
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
      if (PROHIBITED_DIMENSION_TOKENS.test(d.dimensionId) || PROHIBITED_DIMENSION_TOKENS.test(d.labelKo)) {
        violations.push(`${p.id}.${d.dimensionId}: INV-P03(TC34) prohibited dimension`);
      }
      if (d.estimate === null) {
        if (!d.missingReason) {
          violations.push(`${p.id}.${d.dimensionId}: INV-P02(TC23) estimate=null requires missingReason`);
        }
      } else {
        if (!d.priorInterval || d.evidenceIds.length < 1) {
          violations.push(`${p.id}.${d.dimensionId}: INV-P02(TC23) observed estimate requires priorInterval and evidenceIds>=1`);
        }
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

export function computeImR1Axes(metrics: ImPpgtProbeMetrics): Record<PpgtAxisId, number> {
  // U1: First-10s Clarity (cognitive load & login wall / step complexity)
  let u1 = 5.0;
  if (metrics.blockingModalDetected) u1 -= 2.2;
  if (metrics.aboveFoldActionCount > 40) u1 -= 1.8;
  else if (metrics.aboveFoldActionCount > 24) u1 -= 1.1;
  else if (metrics.aboveFoldActionCount > 14) u1 -= 0.5;
  if ((metrics.stepCount ?? 0) > 6) u1 -= 0.4;
  if (!metrics.taskCompleted) u1 -= 1.5;

  // U2: Visual / Mobile Ergonomics
  let u2 = 5.0;
  if (metrics.horizontalOverflowPx > 20) u2 -= 2.8;
  else if (metrics.horizontalOverflowPx > 1) u2 -= 2.2;
  if (metrics.sub44ButtonsCount > 0) u2 -= Math.min(1.6, 0.35 * metrics.sub44ButtonsCount);
  if (metrics.sub15TextsCount > 0) u2 -= Math.min(1.2, 0.25 * metrics.sub15TextsCount);
  if (metrics.clippedButtonsCount > 0) u2 -= Math.min(1.4, 0.4 * metrics.clippedButtonsCount);
  if (metrics.brokenImgCount > 0) u2 -= 2.0;

  // U3: Flow Resilience
  let u3 = 5.0;
  if (!metrics.taskCompleted) u3 -= 2.6;
  if (metrics.pageErrorCount > 0) u3 -= Math.min(2.4, 1.2 * metrics.pageErrorCount);
  if (metrics.consoleErrorCount > 0) u3 -= Math.min(1.2, 0.4 * metrics.consoleErrorCount);
  if (metrics.honestSaveVisible === false) u3 -= 0.5;

  // C1: Provenance & Honesty
  let c1 = 5.0;
  if (!metrics.provenanceBadgeVisible) c1 -= 1.8;
  if (metrics.poisonTokenCount > 0) c1 -= 2.6;
  if (metrics.unreviewedNoticeVisible === false) c1 -= 0.4;

  // C2: Artifact & Share Value
  let c2 = 5.0;
  if (!metrics.artifactValid) c2 -= 2.6;
  if (metrics.bannedTermCount > 0) c2 -= Math.min(2.2, 0.8 * metrics.bannedTermCount);
  if (metrics.brokenImgCount > 0) c2 -= 1.2;

  // C3: Safe / Boundary & Statutory Fit
  let c3 = 5.0;
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

export function computeAxisSalience(
  persona: ImPpgtPersonaSpec
): Record<PpgtAxisId, number> {
  const out = {} as Record<PpgtAxisId, number>;
  for (const axis of PPGT_ALL_AXES) {
    const observed = persona.stableDimensions
      .filter((d) => d.estimate !== null && d.mappedAxes.includes(axis))
      .map((d) => d.estimate as number);
    out[axis] = observed.length > 0 ? Math.round((0.5 + 0.5 * Math.max(...observed)) * 1000) / 1000 : 0.6;
  }
  return out;
}

function inferDefaultIssueHints(metrics: ImPpgtProbeMetrics): ImPpgtIssueHint[] {
  const hints: ImPpgtIssueHint[] = [...(metrics.issueHints ?? [])];
  const seen = new Set(hints.map((h) => `${h.issueKey}:${h.targetFileHint}`));
  const add = (hint: ImPpgtIssueHint) => {
    const k = `${hint.issueKey}:${hint.targetFileHint}`;
    if (!seen.has(k)) {
      seen.add(k);
      hints.push(hint);
    }
  };

  if (metrics.aboveFoldActionCount > 14) {
    add({
      issueKey: 'cognitive_above_fold_overload',
      targetFileHint: 'src/app/(broker)/broker/w/im/_components/ImEditorPanels.tsx',
      axis: 'U1_first10s_clarity',
      track: 'track1_ui_renderer',
      summary: `${metrics.surface}: aboveFoldActionCount=${metrics.aboveFoldActionCount} (권장 <= 12~14개)`,
    });
  }
  if (metrics.horizontalOverflowPx > 1) {
    add({
      issueKey: 'horizontal_overflow',
      targetFileHint: metrics.surface.includes('im-lite')
        ? 'src/app/(public)/im-lite/[buildingId]/mobile-im-viewer.tsx'
        : 'src/app/(broker)/broker/w/im/_components/ImEditorPanels.tsx',
      axis: 'U2_visual_ergonomics',
      track: 'track1_ui_renderer',
      summary: `${metrics.surface} (${metrics.viewport} ${metrics.fontScale}): overflow=${metrics.horizontalOverflowPx}px`,
    });
  }
  if (metrics.sub44ButtonsCount > 0) {
    add({
      issueKey: 'sub44_tap_target',
      targetFileHint: 'src/app/(broker)/broker/w/im/_components/ImEditorPanels.tsx',
      axis: 'U2_visual_ergonomics',
      track: 'track1_ui_renderer',
      summary: `${metrics.surface}: <44px interactive button ${metrics.sub44ButtonsCount}건`,
    });
  }
  if (metrics.sub15TextsCount > 0) {
    add({
      issueKey: 'sub15_small_text',
      targetFileHint: 'src/app/(broker)/broker/w/im/_components/ImEditorPanels.tsx',
      axis: 'U2_visual_ergonomics',
      track: 'track1_ui_renderer',
      summary: `${metrics.surface}: <14.5px small text ${metrics.sub15TextsCount}건`,
    });
  }
  if (metrics.clippedButtonsCount > 0) {
    add({
      issueKey: 'clipped_button_label',
      targetFileHint: 'src/app/(broker)/broker/w/im/_components/ImEditorPanels.tsx',
      axis: 'U2_visual_ergonomics',
      track: 'track1_ui_renderer',
      summary: `${metrics.surface}: clipped button text ${metrics.clippedButtonsCount}건`,
    });
  }
  if (metrics.brokenImgCount > 0) {
    add({
      issueKey: 'broken_image_asset',
      targetFileHint: 'src/app/(public)/im-lite/[buildingId]/mobile-im-viewer.tsx',
      axis: 'U2_visual_ergonomics',
      track: 'track1_ui_renderer',
      summary: `${metrics.surface}: broken img naturalWidth===0 (${metrics.brokenImgCount}건)`,
    });
  }
  if (metrics.bannedTermCount > 0) {
    add({
      issueKey: 'banned_ui_jargon',
      targetFileHint: 'src/lib/ux/lexicon.ts',
      axis: 'C2_artifact_shareability',
      track: 'track1_ui_renderer',
      summary: `${metrics.surface}: UX 라이팅 금지어 ${metrics.bannedTermCount}건 노출`,
    });
  }
  if (metrics.poisonTokenCount > 0 || metrics.pageErrorCount > 0 || !metrics.taskCompleted) {
    add({
      issueKey: 'runtime_or_poison_failure',
      targetFileHint: 'src/app/(broker)/broker/w/im/page.tsx',
      axis: 'U3_flow_resilience',
      track: 'track1_ui_renderer',
      summary: `${metrics.surface}: pageErrors=${metrics.pageErrorCount}, poison=${metrics.poisonTokenCount}, completed=${metrics.taskCompleted}`,
    });
  }
  if (!metrics.provenanceBadgeVisible) {
    add({
      issueKey: 'missing_provenance_badge',
      targetFileHint: 'src/app/(public)/im-lite/[buildingId]/mobile-im-viewer.tsx',
      axis: 'C1_provenance_honesty',
      track: 'track1_ui_renderer',
      summary: `${metrics.surface}: 출처/기준일 배지 미확인`,
    });
  }
  if (metrics.boundaryViolationCount > 0) {
    add({
      issueKey: 'boundary_or_statutory_violation',
      targetFileHint: 'src/lib/legal/publish-gate.ts',
      axis: 'C3_safe_domain_fit',
      track: 'track1_ui_renderer',
      summary: `${metrics.surface}: 경계/법정/마스킹 위반 ${metrics.boundaryViolationCount}건`,
    });
  }

  return hints;
}

export function scoreImPpgtRun(
  metrics: ImPpgtProbeMetrics,
  personas: readonly ImPpgtPersonaSpec[] = IM_PPGT_PERSONAS
): ImPpgtScoreResult {
  const persona = personas.find((p) => p.id === metrics.personaId);
  if (!persona) {
    throw new Error(`Unknown IM PPGT personaId: ${metrics.personaId}`);
  }

  const r1Axes = computeImR1Axes(metrics);
  const axisSalience = computeAxisSalience(persona);
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

  const issueHints = inferDefaultIssueHints(metrics);
  const topHint = issueHints[0]?.summary ?? '핵심 동선 정상 통과';
  const syntheticSummary = formatSimulatedReaction(
    `${persona.id}(${persona.nameKo}) @ ${metrics.surface}: R2=${weightedOverall} (raw=${rawWeightedOverall}, floorRisk=${floorRisk}) — ${topHint}`
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

export const NEGATIVE_CONTROL_FIXTURES: ReadonlyArray<{
  controlId: string;
  metrics: ImPpgtProbeMetrics;
}> = [
  {
    controlId: 'NC-01',
    metrics: {
      personaId: 'IM-MG-01',
      surface: 'nc-01-login-wall',
      viewport: '1440x900',
      fontScale: 'xlarge',
      aboveFoldActionCount: 48,
      totalVisibleInteractiveCount: 95,
      horizontalOverflowPx: 0,
      sub44ButtonsCount: 3,
      sub15TextsCount: 4,
      clippedButtonsCount: 1,
      brokenImgCount: 0,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      poisonTokenCount: 0,
      bannedTermCount: 1,
      taskCompleted: false,
      blockingModalDetected: true,
      boundaryViolationCount: 0,
      provenanceBadgeVisible: true,
      artifactValid: true,
    },
  },
  {
    controlId: 'NC-02',
    metrics: {
      personaId: 'IM-MG-04',
      surface: 'nc-02-mobile-overflow-broken-img',
      viewport: '390x844',
      fontScale: 'xlarge',
      aboveFoldActionCount: 8,
      totalVisibleInteractiveCount: 18,
      horizontalOverflowPx: 42,
      sub44ButtonsCount: 4,
      sub15TextsCount: 2,
      clippedButtonsCount: 2,
      brokenImgCount: 2,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      poisonTokenCount: 0,
      bannedTermCount: 0,
      taskCompleted: true,
      blockingModalDetected: false,
      boundaryViolationCount: 0,
      provenanceBadgeVisible: true,
      artifactValid: false,
    },
  },
  {
    controlId: 'NC-03',
    metrics: {
      personaId: 'IM-MG-05',
      surface: 'nc-03-provenance-boundary-poison',
      viewport: '1440x900',
      fontScale: 'normal',
      aboveFoldActionCount: 6,
      totalVisibleInteractiveCount: 14,
      horizontalOverflowPx: 0,
      sub44ButtonsCount: 0,
      sub15TextsCount: 0,
      clippedButtonsCount: 0,
      brokenImgCount: 0,
      consoleErrorCount: 1,
      pageErrorCount: 1,
      poisonTokenCount: 2,
      bannedTermCount: 3,
      taskCompleted: true,
      blockingModalDetected: false,
      boundaryViolationCount: 2,
      provenanceBadgeVisible: false,
      artifactValid: true,
    },
  },
];

export function verifyAntiSycophancyControls(): {
  passed: boolean;
  controls: Array<{ controlId: string; score: number; floorRisk: boolean; reasons: string[] }>;
  failures: string[];
} {
  const controls: Array<{ controlId: string; score: number; floorRisk: boolean; reasons: string[] }> = [];
  const failures: string[] = [];

  for (const nc of NEGATIVE_CONTROL_FIXTURES) {
    const res = scoreImPpgtRun(nc.metrics);
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

export function rankImPpgtBacklog(
  runs: readonly ImPpgtScoreResult[],
  personas: readonly ImPpgtPersonaSpec[] = IM_PPGT_PERSONAS
): ImPpgtBacklogCluster[] {
  const byCluster = new Map<
    string,
    {
      issueKey: string;
      targetFileHint: string;
      axis: PpgtAxisId;
      track: RemediationTrack;
      baseSum: number;
      anyFloorRisk: boolean;
      affectedPersonas: Set<ImPpgtPersonaId>;
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
        affectedPersonas: new Set<ImPpgtPersonaId>(),
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

  const out: ImPpgtBacklogCluster[] = [];
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
