/**
 * @file src/lib/testguide/dealcard-im-mece-guide-data.ts
 * @description SSOT data for https://credeal.net/dealcard-im-test
 * Click-through MECE Commercialization Sign-Off Workbench covering DealCard Workspace,
 * IM Workspace, 10-Slide Studio, Kakao OG, Mobile IM, and MS PowerPoint deliverables.
 */

export type TrackId =
  | "overview"
  | "track1"
  | "track2"
  | "track3"
  | "track4"
  | "track5"
  | "signoff";

export type CheckVerdict = "PASS" | "FAIL" | "PENDING";
export type DefectSeverity = "S0" | "S1" | "S2" | "S3";

export interface CopyActionPreset {
  id: string;
  buttonLabel: string;
  toastLabel: string;
  badge?: string;
  content: string;
}

export interface DownloadActionPreset {
  id: string;
  buttonLabel: string;
  description: string;
  url: string;
  filename: string;
}

export interface DeepLinkAction {
  id: string;
  label: string;
  href: string;
  variant?: "primary" | "secondary";
}

export interface MeceCheckStep {
  id: string;
  trackId: Exclude<TrackId, "overview" | "signoff">;
  stepNo: string;
  dimensionTag: string;
  defaultSeverityIfFail: DefectSeverity;
  title: string;
  whyItMatters: string;
  clickSteps: string[];
  expectedOracle: string[];
  failRedFlags: string[];
  copyPresets?: CopyActionPreset[];
  downloadPresets?: DownloadActionPreset[];
  deepLinks?: DeepLinkAction[];
  enablePhotoPack7?: boolean;
  enablePhotoPack6?: boolean;
  enableLiveUrlInspector?: "dealcard" | "im";
}

export interface TrackMeta {
  id: TrackId;
  shortBadge: string;
  title: string;
  subtitle: string;
  estimatedMinutes: number;
  icon: string;
}

export interface MeceDimensionRow {
  code: string;
  title: string;
  scope: string;
  sessionTrapFocus: string;
  coveredByTracks: string;
}

export interface TestPhotoSlot {
  slot: number;
  filename: string;
  orientation: "가로 (1280×853)" | "세로 (853×1280)";
  format: "JPG" | "PNG" | "WEBP";
  caption: string;
  previewUrl: string;
  downloadUrl: string;
}

export const WORKBENCH_TRACKS: TrackMeta[] = [
  {
    id: "overview",
    shortBadge: "준비 · 5분",
    title: "0. MECE 구조 & 준비물",
    subtitle: "6대 점검 축 · 테스트 사진/엑셀 원클릭 준비",
    estimatedMinutes: 5,
    icon: "🧭",
  },
  {
    id: "track1",
    shortBadge: "Track 1 · 15분",
    title: "1. 딜카드 공간 & 카톡 산출물",
    subtitle: "메모 우선 캡처 · 3대 그룹핑 · 블라인드 · 카톡 OG",
    estimatedMinutes: 15,
    icon: "📄",
  },
  {
    id: "track2",
    shortBadge: "Track 2 · 15분",
    title: "2. IM 단필지 표준 & 다중버전",
    subtitle: "딜카드 연동 · 수기/복붙 렌트롤 · 사진 7장 · v1↔v2",
    estimatedMinutes: 15,
    icon: "🏢",
  },
  {
    id: "track3",
    shortBadge: "Track 3 · 15분",
    title: "3. IM 다필지 · 비표준 엑셀 · 스튜디오",
    subtitle: "시도생략 · 이종용도/혼합지목 · 합계행 엑셀 · 10면 편집",
    estimatedMinutes: 15,
    icon: "🗺️",
  },
  {
    id: "track4",
    shortBadge: "Track 4 · 10분",
    title: "4. 모바일 IM & PPTX 실물 검수",
    subtitle: "스마트폰 실기기 · 소통함 도착 · PowerPoint 10대 체크",
    estimatedMinutes: 10,
    icon: "🔬",
  },
  {
    id: "track5",
    shortBadge: "Track 5 · 10분",
    title: "5. 내구성 · 반응형 · 생애주기",
    subtitle: "F5 무중복 · 큰글씨 · 모바일 3탭 · 복제/삭제/Undo",
    estimatedMinutes: 10,
    icon: "🛡️",
  },
  {
    id: "signoff",
    shortBadge: "최종 판정",
    title: "6. Go / No-Go 승인 리포트",
    subtitle: "S0~S3 결함 집계 · 마크다운/JSON/인쇄 출력",
    estimatedMinutes: 5,
    icon: "✅",
  },
];

export const MECE_6_DIMENSIONS: MeceDimensionRow[] = [
  {
    code: "D1",
    title: "공통 작업공간 셸 & 반응형 UI/UX",
    scope: "① 고르기 / ② 채우기 / ③ 확인하고 보내기 3단 구조, 표준/큰글씨, 자동저장 배지, 모바일 3탭",
    sessionTrapFocus: "큰글씨(18.5px) 전환 시 버튼 줄깨짐 여부, 저장 중→저장됨 배지 정직성, 1024px/390px 가로 스크롤 무발생",
    coveredByTracks: "Track 1, Track 5",
  },
  {
    code: "D2",
    title: "딜카드 공간 기능 & 블라인드 안전망",
    scope: "메모 우선 2단계 개방, AI생성/미생성/직접 3그룹, 포스처별 면적 자동전환, 18자 카피, 발송 확인 시트",
    sessionTrapFocus: "다필지 지번(외 2필지, 쉼표 지번)·상호·전화번호 완전 마스킹(○○ 중복 없음), '합필 신축+사옥' 메모의 토지 평수 우선 판별",
    coveredByTracks: "Track 1",
  },
  {
    code: "D3",
    title: "딜카드 대고객 산출물 (/dc/[id] · 카톡 OG)",
    scope: "카카오톡 채팅방 4분할 썸네일 이미지, 공개 모바일 딜카드, 전화하기·IM 요청하기 CTA",
    sessionTrapFocus: "고객 화면·OG 이미지에 중개사 비공개 원본 메모·번지·매도인 연락처 0글자 유출 보장",
    coveredByTracks: "Track 1, Track 4",
  },
  {
    code: "D4",
    title: "IM 공간 4단계 작성 · 파싱 · 10면 스튜디오",
    scope: "공적장부 자동조회, 렌트롤 3경로(수기·Ctrl+V·xlsx), 사진 캡션/순서, 다중버전 재발행, 10면 미세편집",
    sessionTrapFocus: "시도명 생략 다필지 합산면적·가중평균 공시지가·대장 주차/승강기 실측치 반영, 단일열 엑셀 합계행 스킵 및 자가사용 보존",
    coveredByTracks: "Track 2, Track 3",
  },
  {
    code: "D5",
    title: "IM 대고객 산출물 (모바일 IM & PowerPoint)",
    scope: "익명 모바일 IM 10개 섹션(/im-lite/[id]) 및 MS PowerPoint(.pptx) 네이티브 슬라이드",
    sessionTrapFocus: "Slide 03 허위 '0대/0대' 금지, Slide 05 다필지 적색 합필 경계 + 이종 용도지역 비율 콜아웃 + 부속표 무겹침, 세로 사진 무왜곡",
    coveredByTracks: "Track 4",
  },
  {
    code: "D6",
    title: "공간 간 연동 핸드오프 (Handoff)",
    scope: "딜카드→IM 컨텍스트 이동, 공개 딜카드/IM 문의→소통함 배지, 뉴스레터 추천 매물 풀 연동",
    sessionTrapFocus: "고객이 남긴 IM 요청·매입 문의가 중개사 소통함(/broker/w/inbox)에 누락 없이 즉시 도착하는지 확인",
    coveredByTracks: "Track 1, Track 2, Track 4, Track 5",
  },
];

export const TEST_PHOTO_7_PACK: TestPhotoSlot[] = [
  {
    slot: 1,
    filename: "01_건물전면외관.jpg",
    orientation: "가로 (1280×853)",
    format: "JPG",
    caption: "건물 전면 외관 (표지 대표 사진)",
    previewUrl: "/api/public/dealcard-im-test-assets?kind=photo&slot=1",
    downloadUrl: "/api/public/dealcard-im-test-assets?kind=photo&slot=1&download=1",
  },
  {
    slot: 2,
    filename: "02_1층주출입구.jpg",
    orientation: "가로 (1280×853)",
    format: "JPG",
    caption: "1층 주출입구 및 전면 가시성",
    previewUrl: "/api/public/dealcard-im-test-assets?kind=photo&slot=2",
    downloadUrl: "/api/public/dealcard-im-test-assets?kind=photo&slot=2&download=1",
  },
  {
    slot: 3,
    filename: "03_메인로비_세로촬영.jpg",
    orientation: "세로 (853×1280)",
    format: "JPG",
    caption: "1층 메인 로비 (스마트폰 세로 촬영 크롭 검증용)",
    previewUrl: "/api/public/dealcard-im-test-assets?kind=photo&slot=3",
    downloadUrl: "/api/public/dealcard-im-test-assets?kind=photo&slot=3&download=1",
  },
  {
    slot: 4,
    filename: "04_기준층오피스내부.png",
    orientation: "가로 (1280×853)",
    format: "PNG",
    caption: "기준층 오피스 내부 컨디션 (PNG 포맷)",
    previewUrl: "/api/public/dealcard-im-test-assets?kind=photo&slot=4",
    downloadUrl: "/api/public/dealcard-im-test-assets?kind=photo&slot=4&download=1",
  },
  {
    slot: 5,
    filename: "05_옥상루프탑전경.webp",
    orientation: "가로 (1280×853)",
    format: "WEBP",
    caption: "옥상 루프탑 테라스 전경 (WebP 포맷)",
    previewUrl: "/api/public/dealcard-im-test-assets?kind=photo&slot=5",
    downloadUrl: "/api/public/dealcard-im-test-assets?kind=photo&slot=5&download=1",
  },
  {
    slot: 6,
    filename: "06_승강기홀_세로촬영.jpg",
    orientation: "세로 (853×1280)",
    format: "JPG",
    caption: "승강기 홀 동선 (세로 촬영 왜곡 방지 검증용)",
    previewUrl: "/api/public/dealcard-im-test-assets?kind=photo&slot=6",
    downloadUrl: "/api/public/dealcard-im-test-assets?kind=photo&slot=6&download=1",
  },
  {
    slot: 7,
    filename: "07_자주식지하주차장.jpg",
    orientation: "가로 (1280×853)",
    format: "JPG",
    caption: "자주식 주차장 설비 (7장 업로드 시 2면 분할 트리거)",
    previewUrl: "/api/public/dealcard-im-test-assets?kind=photo&slot=7",
    downloadUrl: "/api/public/dealcard-im-test-assets?kind=photo&slot=7&download=1",
  },
];

export const BOJEONG_TSV_CLIPBOARD = [
  "층\t호수\t업종\t전용면적(㎡)\t보증금(만원)\t월임대료(만원)\t관리비(만원)\t만기일\t임대상태",
  "B1\tB101호\t프리미엄 피트니스\t248.5\t5000\t380\t45\t2027-11-30\t임대",
  "1F\t101호\t프랜차이즈 베이커리 카페\t132.4\t10000\t620\t50\t2028-04-30\t임대",
  "1F\t102호\t약국·드럭스토어\t115.8\t8000\t530\t40\t2028-02-28\t임대",
  "2F\t201호\t내과·검진클리닉\t248.2\t7000\t450\t45\t2027-10-31\t임대",
  "3F\t301호\t공실\t248.2\t0\t0\t0\t-\t공실",
  "4F\t401호\t회계법인 사무소(전세)\t248.2\t35000\t0\t45\t2027-08-31\t전세",
  "5F\t501호\t건물주 운영 라운지\t210.0\t0\t0\t0\t-\t자가사용",
].join("\n");

export const CLICK_THROUGH_STEPS: MeceCheckStep[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // TRACK 1: 딜카드 공간 (/broker/w/dealcards) & 카톡 산출물 (6 Steps)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "T1-01",
    trackId: "track1",
    stepNo: "Step 1-1",
    dimensionTag: "D1 · D2 메모 우선 UX",
    defaultSeverityIfFail: "S1",
    title: "신규 딜카드 진입 시 '최상단 메모 캡처 우선' 2단계 점진 개방 확인",
    whyItMatters:
      "중개사가 현장에서 받은 카톡 매물 메모를 가장 먼저 붙여넣고 시작하도록 설계된 핵심 UX가 의도대로 동작하는지 확인합니다.",
    clickSteps: [
      "아래 [📄 딜카드 공간 새 탭 열기] 버튼을 눌러 /broker/w/dealcards 화면을 엽니다.",
      "좌측 상단 파란색 [＋ 새 딜카드 만들기] 버튼을 클릭합니다.",
      "중앙 ② 채우기 영역에 복잡한 카드 폼이 숨겨져 있고, 최상단 메모 입력창과 안내 배너만 깔끔하게 먼저 나타나는지 확인합니다.",
    ],
    expectedOracle: [
      "최상단 메모 입력창에 커서 포커스가 들어가며 [✨ 메모로 딜카드 생성하기], [메모만 저장], [메모 없이 직접 입력] 선택지가 명확히 보인다.",
      "하단 세부 폼(카톡 썸네일 4칸·장점 3줄)은 생성 전까지 접혀 있어 시각적 부담이 없다.",
    ],
    failRedFlags: [
      "[＋ 새 딜카드 만들기]를 눌렀는데 이전 양평동 샘플 문구가 남아 있거나 세부 폼이 빈 채로 먼저 펼쳐져 있는 경우",
    ],
    deepLinks: [
      {
        id: "open-dc-ws",
        label: "📄 딜카드 공간 새 탭 열기 (/broker/w/dealcards)",
        href: "/broker/w/dealcards",
        variant: "primary",
      },
    ],
  },
  {
    id: "T1-02",
    trackId: "track1",
    stepNo: "Step 1-2",
    dimensionTag: "D2 다필지 블라인드 & 페어링",
    defaultSeverityIfFail: "S0",
    title: "다필지·연락처 포함 메모 AI 생성 → 1:1 상시 페어링 & 지번/상호 완전 블라인드",
    whyItMatters:
      "'315-4 외 2필지 (315-3, 315-7)'처럼 괄호 부속 지번·건물명·매도인 번호가 섞인 현업 메모에서 단 한 글자도 유출되지 않는지 검증합니다.",
    clickSteps: [
      "아래 [📋 테스트 메모 A 복사] 버튼을 클릭합니다.",
      "딜카드 상단 메모창에 붙여넣고(Ctrl+V) [✨ 메모로 딜카드 생성하기] 버튼을 클릭합니다.",
      "생성 완료 후 상단 메모창 유지 여부와 아래 열린 4칸 썸네일·한 줄 제목·장점 3줄을 확인합니다.",
    ],
    expectedOracle: [
      "상단 비공개 원본 메모창이 사라지지 않고 딜카드와 1:1 페어링된 채 상시 유지된다.",
      "유형: [임대수익용], 지역: [성동구 성수동], 면적: [연면적 1,195평], 가격: [480~490억]으로 채워진다.",
      "한 줄 제목·장점 3줄 모두 18자 이내 완결된 어절이며, '315-4', '315-3', '315-7', '성수코너타워', '010-8888-9999' 및 어색한 '○○ ○○' 중복이 0건이다.",
    ],
    failRedFlags: [
      "부속 지번(315-3, 315-7)이나 매도인 전화번호·건물명이 고객용 미리보기에 1글자라도 남아 있는 경우 (S0 즉시 차단)",
    ],
    copyPresets: [
      {
        id: "copy-memo-a",
        buttonLabel: "📋 테스트 메모 A 복사 (성수동2가 3필지 수익형)",
        toastLabel: "테스트 메모 A (성수 3필지)",
        badge: "수익형 · 괄호 다필지",
        content:
          "성동구 성수동2가 315-4 외 2필지 (315-3, 315-7) 성수코너타워 매각. 대지 663평 / 연면적 1,195평, B2~10F 업무시설. 성수역 도보 2분 코너, 보증금 19억 / 월임대료 1억 1,900만 안정 임차. 매매 희망가 485억, 건물주 박대표(010-8888-9999) 비공개 진행 요청.",
      },
    ],
  },
  {
    id: "T1-03",
    trackId: "track1",
    stepNo: "Step 1-3",
    dimensionTag: "D2 개발부지 포스처 우선 판별",
    defaultSeverityIfFail: "S1",
    title: "'합필 신축·개발 + 사옥 최적' 복합 메모에서 토지 평수(814평) 자동 판별",
    whyItMatters:
      "이번 세션에서 보정한 핵심 엣지 케이스로, 개발부지 설명 뒷부분에 '사옥 신축 최적'이 적혀 있어도 연면적이 아닌 '토지 평수'로 정확히 분류하는지 확인합니다.",
    clickSteps: [
      "좌측 [＋ 새 딜카드 만들기] 클릭 후 아래 [📋 테스트 메모 B 복사]를 눌러 붙여넣고 [✨ 메모로 딜카드 생성하기]를 클릭합니다.",
      "매물 유형이 [신축·개발용]으로 선택되고 면적 칸에 [토지 814평]이 들어갔는지 확인합니다.",
      "상단 매물 유형 버튼을 [임대수익용] ↔ [신축·개발용]으로 번갈아 클릭해 면적 표시가 [연면적 1,754평] ↔ [토지 814평]으로 즉시 바뀌는지 확인합니다.",
    ],
    expectedOracle: [
      "초기 생성 결과가 [신축·개발용] 및 [토지 814평], 지역 [마포구 서교동], 가격 [390~400억]으로 설정된다.",
      "쉼표로 나열된 '395-166', '395-165' 지번과 '010-7777-6666'이 완벽히 블라인드 처리된다.",
    ],
    failRedFlags: [
      "'사옥' 단어 때문에 사옥용(연면적 1,754평)으로 잘못 분류되거나 '395-165' 두 번째 지번이 노출되는 경우",
    ],
    copyPresets: [
      {
        id: "copy-memo-b",
        buttonLabel: "📋 테스트 메모 B 복사 (서교동 2필지 합필 신축부지)",
        toastLabel: "테스트 메모 B (서교 2필지)",
        badge: "신축·개발 · 쉼표 다필지",
        content:
          "마포구 서교동 395-166, 395-165 합필 신축·개발 부지 매각 (대지 814평, 기존 연면적 1,754평). 준주거지역+2종일반주거, 합정역 도보 3분 코너, 신축 사옥 또는 리테일 플래그십 최적. 희망가 390억, 김사장 010-7777-6666.",
      },
    ],
  },
  {
    id: "T1-04",
    trackId: "track1",
    stepNo: "Step 1-4",
    dimensionTag: "D2 수기 번지 입력 방어 & Undo",
    defaultSeverityIfFail: "S0",
    title: "고의 블라인드 위반 수기 입력 시 경고 배너 & 원클릭 자동 가리기 + 되돌리기",
    whyItMatters:
      "중개사가 실수로 장점 칸에 번지나 건물명을 직접 타이핑했을 때 발송 전 안전망이 작동하는지 검증합니다.",
    clickSteps: [
      "현재 열린 딜카드의 장점 01 입력칸에 아래 [📋 고의 위반 문구 복사] 내용을 붙여넣습니다.",
      "경고 안내가 표시되는지 확인한 뒤 우측 하단 [카톡으로 보내기] 버튼을 클릭합니다.",
      "발송 전 확인 시트에서 [위치 표현 자동으로 가리기] 버튼을 누르고, 직후 하단 토스트의 [되돌리기]도 한 번 눌러 복원·재가리기를 확인합니다.",
    ],
    expectedOracle: [
      "번지('395-166') 입력 즉시 블라인드 경고가 감지되며, 자동 가리기 실행 시 번지가 제거되고 Undo 토스트가 정상 동작한다.",
    ],
    failRedFlags: [
      "명백한 지번(395-166)을 적었는데 아무런 경고 없이 발송 확인 시트가 통과되는 경우",
    ],
    copyPresets: [
      {
        id: "copy-blind-trap",
        buttonLabel: "📋 고의 위반 문구 복사 ('서교동 395-166 코너')",
        toastLabel: "고의 위반 테스트 문구",
        badge: "블라인드 가드 검증",
        content: "서교동 395-166 코너",
      },
    ],
  },
  {
    id: "T1-05",
    trackId: "track1",
    stepNo: "Step 1-5",
    dimensionTag: "D2 3대 그룹핑 & 비공개 검색",
    defaultSeverityIfFail: "S1",
    title: "미생성 메모 보관 · 직접 작성 · 좌측 3대 그룹핑(AI/미생성/직접) & 비공개 메모 검색",
    whyItMatters:
      "딜카드 생성 목적이 아닌 단순 매물 메모 보관 및 원본 메모 키워드(지번·소유주명) 검색이 현업 동선대로 작동하는지 확인합니다.",
    clickSteps: [
      "[＋ 새 딜카드 만들기] 클릭 → 아래 [📋 보관용 메모 복사] 붙여넣기 → [메모만 저장] 클릭 → 좌측 [📝미생성] 그룹에 등록되는지 확인 후 카드 내 [✨ 딜카드 생성]을 눌러 [✨AI생성] 그룹으로 승격시킵니다.",
      "다시 [＋ 새 딜카드 만들기] → [메모 없이 직접 입력] 클릭 후 지역('강남구 역삼동')만 적었을 때 [✍️직접] 그룹에 분류되는지 확인합니다.",
      "좌측 상단 검색창에 고객 화면에는 가려진 '315-7' 또는 '박대표'를 입력해 성수동 딜카드가 검색되는지 확인합니다.",
    ],
    expectedOracle: [
      "상단 [전체 / ✨AI생성 / 📝미생성 / ✍️직접] 탭과 그룹 접기·펴기가 정확히 일치한다.",
      "고객 화면에는 비노출되는 원본 메모 속 번지('315-7')로도 중개사 목록에서는 즉시 검색된다.",
    ],
    failRedFlags: [
      "미생성 메모에서 딜카드를 생성했는데 미생성 목록에 중복으로 남거나, 원본 메모 키워드 검색이 안 되는 경우",
    ],
    copyPresets: [
      {
        id: "copy-unconverted-memo",
        buttonLabel: "📋 보관용 미생성 메모 복사 (논현동 검토 매물)",
        toastLabel: "보관용 메모",
        badge: "미생성 그룹 테스트",
        content: "강남구 논현동 210-5 사옥용 신축급 빌딩 185억, 매도인 일정 조율 후 다음주 딜카드 발송 예정",
      },
    ],
  },
  {
    id: "T1-06",
    trackId: "track1",
    stepNo: "Step 1-6",
    dimensionTag: "D3 · D6 카톡 OG & 고객 딜카드",
    defaultSeverityIfFail: "S0",
    title: "실제 카카오톡 링크 발송 → 4분할 OG 썸네일 & 고객 화면(/dc/[id]) 무유출·IM 요청",
    whyItMatters:
      "매수 고객이 카카오톡에서 실제로 보는 말풍선 썸네일과 모바일 상세 페이지의 상용 품격 및 기밀 보호를 실기기로 확정합니다.",
    clickSteps: [
      "성수동 또는 서교동 딜카드를 선택하고 우측 하단 [카톡으로 보내기] → [링크 복사]를 클릭합니다 (좌측 카드 배지가 '발송됨'으로 변경되는지 확인).",
      "복사한 /dc/... 링크를 아래 [생성된 딜카드 공개 링크 검증기]에 붙여넣어 OG 썸네일과 모바일 화면을 먼저 확인하고, 실제 카카오톡 '나에게 보내기' 채팅방에도 붙여넣어 전송합니다.",
      "스마트폰 카톡에서 링크를 터치해 열린 /dc/[id] 화면 하단 [IM 요청하기] 버튼을 눌러 이름('홍테스트')·연락처를 남기고 제출합니다.",
    ],
    expectedOracle: [
      "카톡 말풍선 4분할 이미지(지역 | 용도 | 면적 | 가격대)가 잘림 없이 선명하게 뜬다.",
      "/dc/[id] 화면 어디에도 원본 메모·지번·건물명·매도인 연락처가 없으며, 담당 중개사 실명 프로필과 [전화하기]·[IM 요청하기]가 정상 작동한다.",
    ],
    failRedFlags: [
      "카카오톡 미리보기 이미지가 엑스박스(깨짐)로 뜨거나, /dc/[id]에 원본 메모 텍스트가 노출되는 경우 (S0)",
    ],
    enableLiveUrlInspector: "dealcard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACK 2: IM 단필지 표준 트랙 — 핸드오프 · 수기/복붙 · 사진 7장 · 다중버전 (4 Steps)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "T2-01",
    trackId: "track2",
    stepNo: "Step 2-1",
    dimensionTag: "D6 · D4 딜카드→IM 연동 & 단필지 조회",
    defaultSeverityIfFail: "S1",
    title: "딜카드 [이 매물로 IM 편집 →] 핸드오프 & 단필지 공적장부 1초 자동채움",
    whyItMatters:
      "딜카드에서 IM 작업공간으로 매끄럽게 이어지는지, 그리고 표준 단필지 주소 조회 시 건축물대장·토지대장 제원이 즉시 채워지는지 확인합니다.",
    clickSteps: [
      "딜카드 에디터 상단 툴바의 [📊 이 매물로 IM 편집 →] 버튼을 클릭해 /broker/w/im 진입을 확인한 뒤, 좌측 [+ 새 IM 만들기]를 클릭합니다.",
      "탭 ① 표지·기본정보에서 표지 제목('용인 보정동 죽전역세권 근생빌딩')과 매매 희망가('28'억)를 먼저 입력합니다.",
      "아래 [📋 단필지 주소 복사]로 주소를 붙여넣고 [주소로 건물 정보 자동 채우기]를 클릭합니다.",
    ],
    expectedOracle: [
      "먼저 적어둔 표지 제목과 희망가(28억)가 지워지지 않고 유지된다.",
      "대지면적·연면적·용도지역·건폐율·용적률·사용승인일·층수가 공적장부 실측값으로 자동 입력된다.",
    ],
    failRedFlags: [
      "주소 자동 채우기 클릭 시 기존에 입력한 제목·희망가가 초기화되거나 면적이 0으로 비어 있는 경우",
    ],
    copyPresets: [
      {
        id: "copy-bojeong-addr",
        buttonLabel: "📋 단필지 주소 복사 (경기도 용인시 기흥구 보정동 1323-2)",
        toastLabel: "보정동 단필지 주소",
        badge: "단필지 표준",
        content: "경기도 용인시 기흥구 보정동 1323-2",
      },
    ],
    deepLinks: [
      {
        id: "open-im-ws",
        label: "📊 IM 공간 새 탭 열기 (/broker/w/im)",
        href: "/broker/w/im",
        variant: "primary",
      },
    ],
  },
  {
    id: "T2-02",
    trackId: "track2",
    stepNo: "Step 2-2",
    dimensionTag: "D4 렌트롤 수기 그리드 & Ctrl+V 복붙",
    defaultSeverityIfFail: "S1",
    title: "탭 ② 층별 임대현황 — Ctrl+V 일괄 붙여넣기 및 임대/공실/전세/자가사용 토글",
    whyItMatters:
      "중개사가 엑셀 표 영역을 드래그 복사해 붙여넣거나 그리드에서 직접 호실 상태를 바꿀 때 수익률이 즉시 연동되는지 확인합니다.",
    clickSteps: [
      "하단 [다음: 층별 임대현황 →] (또는 상단 탭 ②)를 클릭합니다.",
      "아래 [📋 7개 호실 Ctrl+V용 데이터 복사] 버튼을 누른 뒤, IM 화면의 [📋 복사한 렌트롤 붙여넣기 (Ctrl+V)] 버튼을 클릭합니다.",
      "B1~5F(1층 2개 호실, 3층 공실, 4층 전세, 5층 자가사용)가 정렬되어 들어오는지 확인하고, [+ 층 추가] 후 [행 삭제]도 1회 실행해 봅니다.",
    ],
    expectedOracle: [
      "총 보증금 65,000만원(6.5억), 월임대료 1,980만원이 상단 요약 및 우측 미리보기 수익률에 즉시 반영된다.",
      "3층은 [공실], 4층은 [전세], 5층은 [자가사용] 상태 버튼이 정확히 활성화된다.",
    ],
    failRedFlags: [
      "열 순서가 밀려 보증금에 면적이 들어가거나, 전세/자가사용 층이 공실 면적에 잘못 합산되는 경우",
    ],
    copyPresets: [
      {
        id: "copy-bojeong-tsv",
        buttonLabel: "📋 7개 호실 Ctrl+V용 렌트롤 복사 (공실·전세·자가 포함)",
        toastLabel: "보정동 7개 호실 TSV",
        badge: "Ctrl+V 복붙용",
        content: BOJEONG_TSV_CLIPBOARD,
      },
    ],
    downloadPresets: [
      {
        id: "dl-bojeong-xlsx",
        buttonLabel: "⬇️ (보조) 보정동 표준 .xlsx 파일 받기",
        description: "표준 열 구조 엑셀 파일",
        url: "/api/public/dealcard-im-test-assets?kind=xlsx&preset=bojeong_standard",
        filename: "보정동_단필지_표준렌트롤_7개호실.xlsx",
      },
    ],
  },
  {
    id: "T2-03",
    trackId: "track2",
    stepNo: "Step 2-3",
    dimensionTag: "D4 장점 3가지 & 사진 7장 업로드",
    defaultSeverityIfFail: "S1",
    title: "탭 ③ AI 장점 생성 & 탭 ④ 가로·세로 혼합 사진 7장 업로드 (2면 분할 트리거)",
    whyItMatters:
      "6장을 초과하는 사진 7장(JPG·PNG·WebP 및 스마트폰 세로 사진 포함) 업로드 시 누락 없이 썸네일·캡션이 생성되고 PPTX 사진 슬라이드 2면(4+3) 분할이 작동하는지 검증합니다.",
    clickSteps: [
      "탭 ③ 장점 3가지에서 AI 자동 채우기(또는 직접 입력) 실행 후 문구 1줄을 수정해 우측 모바일 IM 미리보기에 실시간 반영되는지 확인합니다.",
      "아래 [📦 사진 7장 일괄 다운로드 (가로5 + 세로2)] 버튼을 눌러 테스트 사진을 PC에 받은 뒤, 탭 ④ 사진 드롭존에 7장을 한 번에 끌어다 놓습니다.",
      "파일명 기반 캡션 자동 생성을 확인하고, 1번 사진 캡션을 수정한 뒤 하단 파란색 [IM 만들기] 버튼을 클릭해 발행(v1)합니다.",
    ],
    expectedOracle: [
      "JPG·PNG·WebP 및 세로 사진까지 7장 모두 엑스박스 없이 업로드되며 완료 토스트와 함께 좌측 목록 상태가 [발행됨]으로 바뀐다.",
    ],
    failRedFlags: [
      "WebP/PNG 파일이 거부되거나, 7장 동시 업로드 중 일부 사진이 유실되는 경우",
    ],
    enablePhotoPack7: true,
  },
  {
    id: "T2-04",
    trackId: "track2",
    stepNo: "Step 2-4",
    dimensionTag: "D4 다중버전 재발행 & 전체화면 모달",
    defaultSeverityIfFail: "S1",
    title: "동일 건물 매매가 인하 재발행(v1→v2) & 전체화면 모달 [v1↔v2 비교]",
    whyItMatters:
      "동일 PNU 매물의 조건을 바꿔 재발행할 때 DB 충돌(428C9/23505) 없이 새 버전이 저장되고, 전체화면 모달 iframe이 X-Frame-Options 차단 없이 열리는지 확인합니다.",
    clickSteps: [
      "발행된 상태에서 탭 ①로 돌아가 매매 희망가를 '28'억 → '26.5'억으로 수정합니다.",
      "하단 [✓ IM 만들기 완료 (다시 반영하기)] 버튼을 클릭해 v2를 재발행합니다.",
      "우측 미리보기 상단 [전체화면] 버튼을 클릭해 모달이 정상 로드되는지 확인하고, 모달 상단 [🔍 v1↔v2 비교] 버튼을 눌러봅니다.",
    ],
    expectedOracle: [
      "재발행 시 500 오류 없이 즉시 저장되며, 전체화면 모달 내부에 최신 가격(26.5억)과 상승된 수익률이 표시되고 v1↔v2 비교 뷰가 작동한다.",
    ],
    failRedFlags: [
      "재발행 시 에러 토스트가 뜨거나, [전체화면] 클릭 시 회색 빈 프레임('연결을 거부했습니다')이 나타나는 경우",
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACK 3: IM 다필지·비표준 엑셀·10면 스튜디오 엣지 트랙 (4 Steps)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "T3-01",
    trackId: "track3",
    stepNo: "Step 3-1",
    dimensionTag: "D4 시도명 생략 + 다필지 공적장부",
    defaultSeverityIfFail: "S0",
    title: "'서울특별시' 생략 + 다필지(이종 용도지역 / 혼합지목) 합산 면적·대장 주차/승강기 자동 인식",
    whyItMatters:
      "실제 중개사가 시도명을 빼고 '마포구 서교동 395-166, 395-165'처럼 입력했을 때 합산 대지면적·이종 용도지역·가중평균 공시지가·건축물대장 주차/승강기가 모두 정확히 잡히는지 확인합니다.",
    clickSteps: [
      "/broker/w/im 좌측 [+ 새 IM 만들기] 클릭 후 표지 제목('마포구 서교동 합정역세권 2필지 빌딩')과 희망가('390'억)를 입력합니다.",
      "아래 [📋 다필지 주소 A 복사 (시도생략 서교동 2필지)]를 눌러 주소칸에 붙여넣고 [주소로 건물 정보 자동 채우기]를 클릭합니다. (추가로 성수동2가 3필지 혼합지목 주소 B도 조회해 볼 수 있습니다.)",
      "주소칸 바로 아래 파란색 [다필지 자동 인식] 배너와 대지면적·용도지역·주차/승강기 수치를 대조합니다.",
    ],
    expectedOracle: [
      "서교동 2필지 기준: [다필지 자동 인식 (2필지 합산 반영)] 배너 노출, 대지면적 [2690.4㎡] (단일필지 2335㎡ 아님!), 연면적 [5798.87㎡], 용도지역 [준주거지역 · 제2종일반주거지역], 대장 주차 73대 / 승강기 2대 반영.",
      "(선택) 성수동2가 3필지 기준: [3필지 합산 반영], 대지면적 [2192.8㎡], 혼합지목 [대 2 · 공장용지 1], 주차 36대 / 승강기 1대 반영.",
    ],
    failRedFlags: [
      "대표 1필지 면적만 들어오거나, 다필지 배너가 안 뜨거나, 건축물대장에 주차/승강기가 있는데 0대/빈칸으로 누락되는 경우",
    ],
    copyPresets: [
      {
        id: "copy-seogyo-mp",
        buttonLabel: "📋 다필지 주소 A 복사 (마포구 서교동 395-166, 395-165)",
        toastLabel: "서교동 2필지 주소 (시도 생략)",
        badge: "필수 · 이종 용도지역",
        content: "마포구 서교동 395-166, 395-165",
      },
      {
        id: "copy-seongsu-mp",
        buttonLabel: "📋 (선택) 다필지 주소 B 복사 (성수동2가 315-4 외 2필지)",
        toastLabel: "성수동2가 3필지 주소 (혼합지목)",
        badge: "혼합지목 대2·공장1",
        content: "서울특별시 성동구 성수동2가 315-4 외 2필지 (315-3, 315-7)",
      },
    ],
  },
  {
    id: "T3-02",
    trackId: "track3",
    stepNo: "Step 3-2",
    dimensionTag: "D4 비표준 .xlsx 합계행 스킵 & 자가사용 보존",
    defaultSeverityIfFail: "S0",
    title: "단일 '임차인/업종' 열 + 하단 '합계' 푸터 포함 비표준 .xlsx 업로드 검증",
    whyItMatters:
      "현업 중개사무소 자체 엑셀 양식에서 가장 흔히 발생하는 '합계 행 2배 중복 합산 사고'와 '단일 열 자가사용 누락'이 완벽히 차단되었는지 확인합니다.",
    clickSteps: [
      "아래 [⬇️ 서교동 비표준 .xlsx 다운로드] 버튼을 눌러 엑셀 파일을 받습니다.",
      "IM 화면 탭 ② 층별 임대현황의 엑셀 파일 선택 영역에 방금 받은 파일을 업로드합니다.",
      "미리보기 카드의 호실 수(12개), 보증금 합계(185,000만원), 월세 합계(10,250만원), 그리고 4층(공실)·10층(자가사용) 드롭다운 값을 확인한 뒤 [적용]을 누릅니다.",
    ],
    expectedOracle: [
      "엑셀 맨 아래 '합계' 행을 자동 스킵하여 정확히 [12개 호실 · 총 보증금 185,000만원 · 총 월세 10,250만원]으로 분석된다.",
      "전용면적만 있는 시트 안내 배너가 표시되며, 4F 401호는 [공실], 10F 1001호(법인 사옥)는 [자가사용] 상태로 정확히 보존된다.",
    ],
    failRedFlags: [
      "합계 행까지 13번째 호실로 읽어 보증금이 370,000만원(2배)으로 뻥튀기되거나, 10층 법인 사옥이 일반 임대로 잘못 분류되는 경우 (S0)",
    ],
    downloadPresets: [
      {
        id: "dl-seogyo-nonstandard-xlsx",
        buttonLabel: "⬇️ 서교동 비표준 .xlsx 다운로드 (합계행·공실·전세·자가 포함)",
        description: "단일 '임차인/업종' 열 + 전용면적 단일열 + 하단 합계 푸터 엣지 테스트용",
        url: "/api/public/dealcard-im-test-assets?kind=xlsx&preset=seogyo_nonstandard",
        filename: "서교동_2필지_비표준렌트롤_합계행포함.xlsx",
      },
    ],
  },
  {
    id: "T3-03",
    trackId: "track3",
    stepNo: "Step 3-3",
    dimensionTag: "D4 사진 6장(3×2) 발행 & 슬라이드 카드 점프",
    defaultSeverityIfFail: "S1",
    title: "사진 6장(단일 슬라이드 3×2 그리드) 업로드 발행 & 우측 [발표자료 10면] 탭 연동",
    whyItMatters:
      "사진 6장일 때 빈 슬라이드 없이 1면(3×2)으로 딱 맞게 구성되는지, 우측 10면 미리보기 카드 클릭 시 해당 편집 탭으로 즉시 점프하는지 확인합니다.",
    clickSteps: [
      "탭 ③에서 아래 [📋 서교동 핵심 장점 1번 복사] 또는 AI 자동 채우기로 장점을 입력합니다.",
      "탭 ④에서 아래 [📦 사진 6장 일괄 다운로드]로 받은 6장(01~06번)을 업로드하고 [IM 만들기]를 클릭합니다.",
      "우측 미리보기 상단 스위치를 [발표자료 10면]으로 바꾼 뒤 미니 슬라이드 카드 중 '06 · 렌트롤' 카드를 클릭해 중앙 에디터가 탭 ②로 이동하는지 확인합니다.",
    ],
    expectedOracle: [
      "발행 성공(HTTP 201) 후 우측 [발표자료 10면] 카드에 표지 사진·렌트롤 요약·사진 썸네일이 즉시 반영되고 클릭 시 편집 탭 점프가 작동한다.",
    ],
    failRedFlags: [
      "[발표자료 10면] 탭 전환 시 레이아웃이 깨지거나 슬라이드 클릭 점프가 반응하지 않는 경우",
    ],
    enablePhotoPack6: true,
    copyPresets: [
      {
        id: "copy-seogyo-hl1",
        buttonLabel: "📋 서교동 핵심 장점 1번 제목 복사",
        toastLabel: "서교동 장점 1 제목",
        content: "2·6호선 합정역 도보 3분 · 서교동 2필지(814평) 통합 코너 입지",
      },
      {
        id: "copy-seogyo-handover",
        buttonLabel: "📋 명도·특이사항 예시 문구 복사",
        toastLabel: "명도 조건 문구",
        content: "기존 임대차 승계 및 10층 법인 자가사용 층 잔금 시 명도 협의 완료 조건입니다.",
      },
    ],
  },
  {
    id: "T3-04",
    trackId: "track3",
    stepNo: "Step 3-4",
    dimensionTag: "D4 10면 슬라이드 스튜디오 미세편집",
    defaultSeverityIfFail: "S1",
    title: "[10면 슬라이드 편집] 스튜디오 진입 → 슬라이드 문구 미세 수정 · Ctrl+Z · 저장 복귀",
    whyItMatters:
      "VIP 고객 발송 직전 특정 슬라이드의 문구나 테마를 미세 조정하는 프로급 스튜디오 워크플로우가 끊김 없이 이어지는지 확인합니다.",
    clickSteps: [
      "IM 에디터 상단 배너 우측의 [10면 슬라이드 편집] 버튼을 클릭해 /broker/basic-im-studio/[buildingId] 화면으로 이동합니다.",
      "좌측 슬라이드 네비게이터에서 2번(요약) 또는 5번(토지) 슬라이드를 클릭하고, 우측 편집 패널에서 문구를 살짝 다듬습니다.",
      "키보드 Ctrl+Z(실행 취소)가 작동하는지 확인한 뒤 저장하고 작업공간으로 복귀합니다.",
    ],
    expectedOracle: [
      "10개 슬라이드 캔버스가 깨짐 없이 로드되며, 문구 수정·실행취소·저장 후 복귀까지 오류 없이 완료된다.",
    ],
    failRedFlags: [
      "[10면 슬라이드 편집] 클릭 시 무한 로딩이 걸리거나 복귀했을 때 이전 작업 목록이 사라지는 경우",
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACK 4: 대고객 산출물 실기기 · MS PowerPoint 실개봉 검수 (6 Steps)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "T4-01",
    trackId: "track4",
    stepNo: "Step 4-1",
    dimensionTag: "D5 · D6 익명 모바일 IM & 소통함 리드 도착",
    defaultSeverityIfFail: "S0",
    title: "익명 모바일 IM(/im-lite/[id]) 다필지 토지 명세표 가독성 & [자료·매입 문의] → 소통함 도착",
    whyItMatters:
      "로그인하지 않은 매수인이 스마트폰에서 모바일 IM을 열었을 때 다필지 정보가 한눈에 읽히고, 문의 접수 시 중개사 소통함으로 즉시 연결되는지 확인합니다.",
    clickSteps: [
      "서교동 다필지 IM의 공개 링크(/im-lite/...)를 복사해 아래 [공개 모바일 IM 링크 검증기] 또는 스마트폰 시크릿 창에서 엽니다.",
      "상단 스티키 탭 [05 토지]를 터치해 합산 대지면적(2,690.4㎡)·복수 용도지역·가중평균 공시지가(15,903,759원/㎡)·필지별 명세표를 확인합니다.",
      "하단 [자료·매입 문의] 버튼을 눌러 테스트 문의를 남긴 뒤, 중개사 화면 상단 [💬 소통함]을 열어 딜카드 요청과 IM 문의가 도착했는지 확인합니다.",
    ],
    expectedOracle: [
      "390px 모바일 화면에서 다필지 명세표가 가로 잘림 없이 깔끔하며, 문의 제출 즉시 중개사 [💬 소통함] 배지 및 리드 목록에 반영된다.",
    ],
    failRedFlags: [
      "익명 브라우저에서 로그인 창으로 튕기거나, 문의를 남겼는데 소통함에 나타나지 않는 경우 (S0/S1)",
    ],
    enableLiveUrlInspector: "im",
    deepLinks: [
      {
        id: "open-inbox-ws",
        label: "💬 소통함 새 탭 열기 (/broker/w/inbox)",
        href: "/broker/w/inbox",
        variant: "secondary",
      },
    ],
  },
  {
    id: "T4-02",
    trackId: "track4",
    stepNo: "Step 4-2",
    dimensionTag: "D5 PPTX 무결성 & 네이티브 편집성",
    defaultSeverityIfFail: "S0",
    title: "[PPTX 검수 ①~②] MS PowerPoint 실개봉 무경고 & 네이티브 도형·표 직접 수정 가능",
    whyItMatters:
      "중개사가 내려받은 PPTX를 PowerPoint에서 바로 열어 숫자나 문구를 고칠 수 있어야 상용 발표자료로서 가치가 완성됩니다.",
    clickSteps: [
      "Track 2(보정동 7장 사진, 11면)와 Track 3(서교동 다필지 6장 사진, 10면)에서 각각 [PPTX 내려받기]를 클릭합니다.",
      "내려받은 두 .pptx 파일을 PC의 Microsoft PowerPoint에서 더블클릭해 엽니다.",
      "아무 슬라이드의 제목 글상자와 표 안의 숫자를 마우스로 클릭해 글자가 직접 타이핑·수정되는지 확인합니다.",
    ],
    expectedOracle: [
      "열기 시 '복구하시겠습니까?' 오류 팝업이 0건이며, 슬라이드 전체가 통이미지가 아닌 네이티브 PowerPoint 텍스트·표 객체로 편집된다.",
    ],
    failRedFlags: [
      "PowerPoint 복구 경고창이 뜨거나 표·텍스트가 이미지로 굳어 있어 클릭 편집이 불가능한 경우 (S0)",
    ],
  },
  {
    id: "T4-03",
    trackId: "track4",
    stepNo: "Step 4-3",
    dimensionTag: "D5 PPTX Slide 01~04 표지·요약·개요·입지",
    defaultSeverityIfFail: "S1",
    title: "[PPTX 검수 ③~⑤] Slide 01~04 중개사 실명 프로필 · 대장 주차/승강기 · 카카오 입지지도",
    whyItMatters:
      "표지 중개사 등록정보, Slide 03 건축물대장 주차/승강기 실측치('0대/0대' 허위 표기 금지), Slide 04 도보 반경 지도의 완성도를 육안 확인합니다.",
    clickSteps: [
      "Slide 01(표지) 하단 중개법인명·담당자·연락처·등록번호와 Slide 02(요약) 6칸 KPI 카드 정렬을 확인합니다.",
      "Slide 03(물건 개요)에서 합산 면적·복수 용도지역(또는 혼합지목 '대 2 · 공장용지 1')·주차/승강기('73대 / 2대' 등)를 확인합니다.",
      "Slide 04(입지 정보)에서 '본건' 핀·도보 3분 반경 점선 원·1~5번 주변 시설 마커가 하단 범례와 일치하는지 확인합니다.",
    ],
    expectedOracle: [
      "더미 이름('담당 공인중개사', '홍길동')이나 허위 '자주식 0대 / 승용 0대' 표기가 없으며, 입지 지도와 요약 불릿이 선명하다.",
    ],
    failRedFlags: [
      "대장에 주차 대수가 있는데 0대로 나오거나, 지도 이미지가 회색 빈 박스로 나오는 경우",
    ],
  },
  {
    id: "T4-04",
    trackId: "track4",
    stepNo: "Step 4-4",
    dimensionTag: "D5 PPTX Slide 05 다필지 지적도 & 용도지역",
    defaultSeverityIfFail: "S0",
    title: "[PPTX 검수 ⑥] Slide 05 다필지 적색 합필 경계 + 이종 용도지역 비율 콜아웃 + 부속표 무겹침",
    whyItMatters:
      "다필지 IM의 꽃인 토지 정보 슬라이드에서 2~3개 필지 경계선과 용도지역 면적 비율(86.8% / 13.2%)이 기관급 품질로 합성되었는지 판정합니다.",
    clickSteps: [
      "서교동 다필지 PPTX의 Slide 05(토지 정보)를 크게 확대해 살펴봅니다.",
      "우측 지적도 위에 인접한 2개 필지(395-166, 395-165) 모두 적색 실선 폴리곤으로 표시되어 있는지 확인합니다.",
      "지도 우하단 면적비율 콜아웃 박스('준주거지역 86.8% / 제2종일반주거지역 13.2%'), 하단 복수 컬러 범례, 좌하단 필지별 명세표와 '출처' 캡션 사이 여백을 확인합니다.",
    ],
    expectedOracle: [
      "모든 필지 경계가 적색 폴리곤으로 정확히 둘러싸여 있고, 가중평균 공시지가(15,903,759원/㎡) 및 필지별 부속표가 겹침 없이 정돈되어 있다.",
    ],
    failRedFlags: [
      "대표 1개 필지만 빨간 선이 그어져 있거나, 좌하단 필지 부속표가 '출처: 토지이음·V-World' 글자와 겹치는 경우 (S1)",
    ],
  },
  {
    id: "T4-05",
    trackId: "track4",
    stepNo: "Step 4-5",
    dimensionTag: "D5 PPTX Slide 06~08 렌트롤·수익률·지가차트",
    defaultSeverityIfFail: "S0",
    title: "[PPTX 검수 ⑦~⑧] Slide 06~08 스태킹 플랜 · 자가사용/전세 표기 · 10년 공시지가 차트",
    whyItMatters:
      "렌트롤 표 합계와 스태킹 다이어그램의 정합성, 그리고 수익률·10개년 공시지가 추이 차트의 데이터 정확성을 확인합니다.",
    clickSteps: [
      "Slide 06~07(렌트롤)에서 좌측 층별 스태킹 플랜 바('4F 공실' 점선 강조)와 우측 표의 층 구성·비고('전세', '자가사용') 및 합계 행(12개 호실, 185,000 / 10,250)을 대조합니다.",
      "Slide 08(수익률)에서 보증금 차감 순투자금 기준 임대수익률(3.31%)과 우측 10개년 공시지가 막대그래프·자치구 평균 지가변동률 비교를 확인합니다.",
    ],
    expectedOracle: [
      "엑셀 '합계' 푸터 중복 없이 12개 호실 합계가 정확히 일치하며, 10층 법인 사옥 비고란에 '자가사용'이 선명하게 표기된다.",
    ],
    failRedFlags: [
      "소계/합계 숫자가 어긋나거나, 차트 막대 라벨에 NaN/undefined가 찍힌 경우 (S0)",
    ],
  },
  {
    id: "T4-06",
    trackId: "track4",
    stepNo: "Step 4-6",
    dimensionTag: "D5 PPTX Slide 09~마지막 세로사진·금칙어",
    defaultSeverityIfFail: "S1",
    title: "[PPTX 검수 ⑨~⑩] 세로 촬영 사진 무왜곡(6장=1면 / 7장=2면) & 전 슬라이드 금칙어 제로",
    whyItMatters:
      "스마트폰 세로 사진(03번·06번)이 옆으로 늘어나 찌그러지지 않는지, 그리고 마지막 문의 슬라이드까지 미완성 회피 문구가 없는지 최종 점검합니다.",
    clickSteps: [
      "서교동 PPTX(사진 6장 → Slide 09 단일 면 3×2 배치)와 보정동 PPTX(사진 7장 → Slide 09 4장 + Slide 10 3장 분할)를 비교합니다.",
      "세로로 촬영된 03번(메인로비)·06번(승강기홀) 사진이 찌그러짐 없이 자연스럽게 크롭·배치되었고 한글 캡션이 정상인지 확인합니다.",
      "마지막 '문의 및 유의사항' 슬라이드까지 넘기며 '확인 필요', '추후 제공', '데이터 없음' 같은 회피 문구가 없는지 확인합니다.",
    ],
    expectedOracle: [
      "가로·세로 사진 모두 인물·기둥 비율 왜곡이 전혀 없으며, 전 슬라이드 금칙어·깨진 글자가 0건이다.",
    ],
    failRedFlags: [
      "세로 사진이 가로 틀에 강제로 늘어나 찌그러지거나, 캡션 한글 폰트가 네모(□□)로 깨지는 경우",
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACK 5: 내구성 · 반응형 · 생애주기 파괴 점검 (4 Steps)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "T5-01",
    trackId: "track5",
    stepNo: "Step 5-1",
    dimensionTag: "D1 · D4 F5 새로고침 & 무중복 전환",
    defaultSeverityIfFail: "S1",
    title: "발행 직후 브라우저 F5 새로고침 → '작성 중' 유령 중복 카드 0건 & 다필지 배너 복원",
    whyItMatters:
      "이번 세션에서 해결한 핵심 결함으로, 발행 전 임시 자동저장본이 새로고침 후 '작성 중' 유령 카드로 중복 노출되지 않는지 확인합니다.",
    clickSteps: [
      "/broker/w/im 화면에서 키보드 F5(새로고침)를 누릅니다.",
      "좌측 보유 IM 목록에 방금 발행한 서교동·보정동 매물이 각각 [발행됨] 1건씩만 깔끔히 표시되는지 확인합니다.",
      "좌측 목록에서 보정동(단필지) ↔ 서교동(다필지) 카드를 번갈아 클릭할 때 중앙 다필지 배너와 우측 미리보기가 즉시 전환되는지 확인합니다.",
    ],
    expectedOracle: [
      "같은 제목의 '작성 중' 유령 카드가 전혀 생기지 않으며, 다필지 매물 재선택 시 [다필지 자동 인식] 배너가 그대로 살아난다.",
    ],
    failRedFlags: [
      "F5 후 똑같은 매물이 '작성 중'과 '발행됨' 두 줄로 뜨거나, 다필지 배너가 새로고침 후 사라지는 경우",
    ],
  },
  {
    id: "T5-02",
    trackId: "track5",
    stepNo: "Step 5-2",
    dimensionTag: "D1 시니어 큰글씨 & 모바일/태블릿 반응형",
    defaultSeverityIfFail: "S2",
    title: "상단 [큰글씨] 전환 가독성 & 창 폭 축소(1024px / 390px) 모바일 3탭 반응형",
    whyItMatters:
      "시니어 소장님의 큰글씨 환경과 외근 중 스마트폰/태블릿 화면에서도 버튼 잘림이나 가로 스크롤 폭발이 없는지 확인합니다.",
    clickSteps: [
      "작업공간 우측 상단의 [큰글씨] 버튼을 클릭한 뒤 딜카드 공간과 IM 공간의 버튼·탭·입력칸에 줄넘침이 없는지 확인합니다.",
      "브라우저 창 가로 폭을 절반 이하(또는 F12 모바일 뷰 390px)로 좁혀 상단/하단 [고르기 · 채우기 · 미리보기] 탭 전환과 하단 고정 액션 버튼을 눌러봅니다.",
    ],
    expectedOracle: [
      "[큰글씨] 설정이 새로고침 후에도 유지되며, 모바일 폭에서 가로 스크롤바 없이 3개 뷰 전환과 발행/발송 버튼 터치가 쾌적하다.",
    ],
    failRedFlags: [
      "작은 화면에서 우측 미리보기에 가려 편집 칸을 누를 수 없거나 하단 발송 버튼이 화면 밖으로 잘리는 경우",
    ],
  },
  {
    id: "T5-03",
    trackId: "track5",
    stepNo: "Step 5-3",
    dimensionTag: "D1 · D2 복제 · 삭제 · Undo · 영구삭제",
    defaultSeverityIfFail: "S1",
    title: "딜카드 & IM 카드 [복제] → [삭제] → [되돌리기(Undo)] → 재삭제 후 F5 영구 삭제 확인",
    whyItMatters:
      "실수 삭제 시 즉시 복구(Undo)되면서도, 진짜 삭제한 테스트 매물이 새로고침 후 좀비처럼 되살아나지 않는지 확인합니다.",
    clickSteps: [
      "딜카드 공간과 IM 공간 좌측 목록에서 각각 임의 카드의 [복제] 버튼을 눌러 '(사본)' 카드가 생성되는지 확인합니다.",
      "방금 만든 '(사본)' 카드의 [삭제] 버튼을 누른 직후 하단 토스트의 [되돌리기]를 눌러 즉시 복원되는지 확인합니다.",
      "다시 '(사본)' 카드의 [삭제]를 누르고 토스트가 사라진 뒤 F5(새로고침)를 눌러 삭제된 사본이 다시 나타나지 않는지 확인합니다.",
    ],
    expectedOracle: [
      "복제·Undo 복원·영구 삭제 3단계 모두 로컬과 서버에 정확히 동기화되어 F5 후에도 좀비 부활이 0건이다.",
    ],
    failRedFlags: [
      "삭제 후 새로고침했더니 삭제했던 사본 카드가 목록에 다시 나타나는 경우",
    ],
  },
  {
    id: "T5-04",
    trackId: "track5",
    stepNo: "Step 5-4",
    dimensionTag: "D6 뉴스레터 추천 매물 풀 연동 스모크",
    defaultSeverityIfFail: "S2",
    title: "생성한 딜카드 · IM이 뉴스레터 편집기 매물 첨부 목록에 정상 연동되는지 확인",
    whyItMatters:
      "중개사가 만든 딜카드와 IM이 일간 뉴스레터 발송 시 곧바로 매물 카드로 재활용될 수 있는지 마무리 점검합니다.",
    clickSteps: [
      "상단 네비게이션의 [📰 뉴스레터] (또는 아래 새 탭 버튼)를 클릭해 뉴스레터 편집 화면을 엽니다.",
      "매물 카드 선택 영역에 오늘 작성한 성수동/서교동 매물이 선택 가능한 카드로 노출되는지 확인합니다.",
    ],
    expectedOracle: [
      "별도 재입력 없이 방금 작성한 딜카드·IM 매물을 뉴스레터에 즉시 첨부할 수 있다.",
    ],
    failRedFlags: [
      "발행 완료한 매물이 뉴스레터 매물 선택 목록에 전혀 불러와지지 않는 경우",
    ],
    deepLinks: [
      {
        id: "open-nl-ws",
        label: "📰 뉴스레터 편집기 새 탭 열기 (/broker/magazine-editor)",
        href: "/broker/magazine-editor",
        variant: "secondary",
      },
    ],
  },
];

export const SEVERITY_RUBRIC: Array<{
  severity: DefectSeverity;
  badgeLabel: string;
  gateRule: string;
  examples: string;
}> = [
  {
    severity: "S0",
    badgeLabel: "S0 · 치명 (출시 차단)",
    gateRule: "0건 필수 (1건이라도 발생 시 즉시 출시 보류)",
    examples:
      "/dc/[id]·카톡 OG에 지번·건물명·매도인 번호·원본 메모 유출, IM 발행/PPTX 500 오류, PowerPoint 복구 경고창, 엑셀 합계행 2배 중복 합산",
  },
  {
    severity: "S1",
    badgeLabel: "S1 · 중대 (당일 수정)",
    gateRule: "0건 필수 (수정 및 재검증 후 출시)",
    examples:
      "다필지 지적도 경계 누락, Slide 05 부속표 겹침, 세로 사진 심각한 왜곡, F5 시 유령 중복 카드 발생, 고객 문의 소통함 미도착",
  },
  {
    severity: "S2",
    badgeLabel: "S2 · 보통 (단기 보완)",
    gateRule: "조건부 출시 가능 (백로그 등록 후 차주 패치)",
    examples: "특정 화면 폭에서 긴 제목 줄바꿈 어색함, 안내 마이크로카피 모호성",
  },
  {
    severity: "S3",
    badgeLabel: "S3 · 경미 (고도화 제안)",
    gateRule: "출시 승인 무관",
    examples: "추가 테마 색상 건의, 편의 단축키 제안",
  },
];
