/**
 * 뉴스레터 · 소통관리함 상용화 마무리 인간 테스터 완전 점검 가이드 (MECE 6대 축 · 36문항)
 * Route: /newsletter-inbox-test
 */

export type MeceAxisId =
  | "axis-1"
  | "axis-2"
  | "axis-3"
  | "axis-4"
  | "axis-5"
  | "axis-6";

export type MeceSeverity = "S0" | "S1" | "S2";

export type WindowTargetMode =
  | "창 A (중개사 일반창)"
  | "창 B (고객 시크릿창)"
  | "창 A ↔ 창 B 교차"
  | "창 B ↔ 창 A 교차"
  | "창 B (중개사 #2 로그인)"
  | "창 A · B 반응형(모바일)";

export interface StepQuickLink {
  label: string;
  href: string;
  variant?: "primary" | "indigo" | "emerald" | "slate";
}

export interface StepCopySnippet {
  id: string;
  label: string;
  value: string;
  targetHint: string;
}

export interface MeceStepItem {
  stepNumber: number;
  code: string;
  axisId: MeceAxisId;
  severity: "S0" | "S1";
  windowMode: WindowTargetMode;
  estimatedMinutes: number;
  title: string;
  bugContext: string;
  quickLinks: StepQuickLink[];
  copySnippets?: StepCopySnippet[];
  actionSteps: string[];
  passCriteria: string[];
  failTrap: string;
}

export interface MeceAxisMeta {
  id: MeceAxisId;
  axisNumber: number;
  domainBadge: "뉴스레터 공간" | "소통관리함 공간" | "교차 연계 · 보안(PIPA)";
  shortTitle: string;
  fullTitle: string;
  durationMinutes: number;
  itemCount: number;
  codePaths: string[];
  defendedBugs: string;
  accentColor: "indigo" | "blue" | "violet" | "emerald" | "teal" | "amber";
}

export interface RedFlagOracle {
  id: string;
  number: number;
  title: string;
  badge: string;
  description: string;
}

export interface SignOffGateRule {
  grade: MeceSeverity;
  label: string;
  verdict: string;
  criteria: string;
}

export const WINDOW_SETUP_CARDS = [
  {
    id: "window-a",
    badge: "창 A · 일반 크롬 창",
    role: "중개사 #1 (발행 · 관리 주체)",
    viewport: "데스크톱 1440px (마지막 문항에서 390×844 모바일 점검)",
    instruction:
      "https://www.credeal.net 접속 및 중개사 #1 로그인 후 반드시 Ctrl + Shift + R (강력 새로고침) 1회를 먼저 실행해 최신 CSS·번들을 로드합니다.",
  },
  {
    id: "window-b",
    badge: "창 B · 크롬 시크릿 창 (Ctrl+Shift+N)",
    role: "비로그인 매수 고객·구독자 → 마지막에 중개사 #2",
    viewport: "비로그인 상태 유지 (축 6 마지막 격리 검증 시에만 중개사 #2 로그인)",
    instruction:
      "비로그인 상태로 공개 뉴스레터·딜카드·IM 전용 토큰 링크 열람과 구독/문의를 검증한 뒤, [SEC-605] 단계에서만 중개사 #2 계정으로 로그인해 계정 격리를 확인합니다.",
  },
] as const;

export const RED_FLAG_ORACLES: RedFlagOracle[] = [
  {
    id: "rf-1",
    number: 1,
    title: "시인성 불량",
    badge: "Contrast Fail",
    description:
      "선택된 단추·배지·카드에서 배경색과 글자색이 비슷해 글자가 안 보이거나 흐릿한 경우 (예: 흰 배경 위 흰 글자, 어두운 배경 위 검정 글자)",
  },
  {
    id: "rf-2",
    number: 2,
    title: "문장 절단 · 개조식 · 말줄임",
    badge: "Copy Fail",
    description:
      "카드 제목·부제목이 '~해선', '~할 수', '~에 따른', '~및'에서 끊기거나, '…'/'...' 말줄임표로 잘리거나, '~있음.'/'~안 됨.' 개조식 명사형으로 끝나는 경우",
  },
  {
    id: "rf-3",
    number: 3,
    title: "가짜 데이터 · 선입력 오염",
    badge: "Honesty Fail",
    description:
      "사진 없는 매물에 가짜 빌딩 사진 노출, 출처 없는 통계 숫자, 입력하지 않은 임대료 정정 문구 선입력, 면적 칸에 동 이름('면적: 마포구 동교동') 오표기",
  },
  {
    id: "rf-4",
    number: 4,
    title: "상태 거짓말 · 새로고침 증발",
    badge: "State Lie Fail",
    description:
      "서버 오류/차단 상황인데 '성공했습니다' 토스트가 뜨거나, F5 새로고침 시 방금 저장한 설정·승인·메모가 증발하는 경우",
  },
  {
    id: "rf-5",
    number: 5,
    title: "시니어 가독성 · 용어 위반",
    badge: "UX Fail",
    description:
      "깨알 글씨(14px 미만), 너무 작은 터치 영역(44px 미만), 내부 개발 용어('소식지', '핫리드', 'pending', '{\"type\":...}' 날것 JSON) 노출",
  },
  {
    id: "rf-6",
    number: 6,
    title: "타 계정 · 타 고객 혼입",
    badge: "Security Fail",
    description:
      "수신거부 고객에게 발송 모수가 잡히거나, 잠긴 링크가 열리거나, 다른 중개사 계정 전환 시 이전 고객 이름·연락처가 남아 있는 경우",
  },
];

export const SIGN_OFF_GATES: SignOffGateRule[] = [
  {
    grade: "S0",
    label: "S0 (Blocker · 치명 결함)",
    verdict: "즉시 출시 중단 및 수정 후 재검증",
    criteria:
      "타 계정 데이터 유출(SEC-605), 수신거부자 발송 모수 산입(SEC-603), 잠긴 링크 열람(IB-502), 가짜 수치/문구 선입력(IB-504), 백색 버튼 위 백색 글자 시인성 불능(NL-101), 공개 발행본 500 에러(NL-306)",
  },
  {
    grade: "S1",
    label: "S1 (Critical · 중대 결함)",
    verdict: "당일 핫픽스 수정 후 상용화 승인",
    criteria:
      "주기별 섹션 누락·순서 오류(NL-103·104), 제목/해설 중간 절단·개조식 종결(NL-202), 발행 후 재수정 미반영(NL-303), 매물 면적·수지분석 오표기(NL-305), F5 새로고침 시 상태 증발",
  },
  {
    grade: "S2",
    label: "S2 (Minor · 경미 개선)",
    verdict: "상용화 승인 가능 (백로그 편입)",
    criteria:
      "기능·데이터 정직성·가독성에 지장이 없는 미세 여백, 아이콘 정렬, 보조 안내 문구 다듬기 의견",
  },
];

export const MECE_AXES: MeceAxisMeta[] = [
  {
    id: "axis-1",
    axisNumber: 1,
    domainBadge: "뉴스레터 공간",
    shortTitle: "뉴스레터 UI · 시인성 · 주기 매트릭스",
    fullTitle: "축 1. 뉴스레터 UI/UX · 시인성 · 주기(일간/주간/월간) 매트릭스",
    durationMinutes: 7,
    itemCount: 6,
    codePaths: [
      "src/app/(broker)/broker/magazine-editor/page.tsx",
      "src/lib/magazine/newsletter-cadence.ts",
    ],
    defendedBugs:
      "관심 분야 선택 단추 백색 글자 실종, 구형 주간→월간 전환 시 이슈 5선 증발, 월간 섹션 순서 뒤바뀜",
    accentColor: "indigo",
  },
  {
    id: "axis-2",
    axisNumber: 2,
    domainBadge: "뉴스레터 공간",
    shortTitle: "AI 큐레이션 · 카피 완결성 · 월간 통계",
    fullTitle: "축 2. AI 큐레이션 · 한국어 문장 완결성 · 월간 통계 그래픽 2선",
    durationMinutes: 8,
    itemCount: 6,
    codePaths: [
      "src/domain/magazine/issue-clustering.ts",
      "src/ai/prompts/magazine-taskflow.ts",
      "src/components/magazine/MonthlyGlassStatCard.tsx",
    ],
    defendedBugs:
      "'~계산해선' 서술어 중간 절단, '~있음./~됨.' 개조식 해설, 제목 동어반복, 가십 기사 유입, 월간 통계 누락",
    accentColor: "blue",
  },
  {
    id: "axis-3",
    axisNumber: 3,
    domainBadge: "뉴스레터 공간",
    shortTitle: "발행 · 재수정 동기화 · 공개 뷰어 산출물",
    fullTitle: "축 3. 뉴스레터 발행 · 재수정 동기화 · 고객 공개 뷰어 산출물",
    durationMinutes: 7,
    itemCount: 6,
    codePaths: [
      "src/app/api/magazine/issues/route.ts",
      "src/app/(magazine)/magazine/[brokerId]/[date]/magazine-view.tsx",
      "src/components/magazine/AxiosGlassIssueCard.tsx",
    ],
    defendedBugs:
      "발행 후 수정 시 구버전 링크 발송, 다크 뷰어 글래스 카드 시인성, 매물 면적 동 이름 오표기, ROI 계산기 미프리필",
    accentColor: "violet",
  },
  {
    id: "axis-4",
    axisNumber: 4,
    domainBadge: "소통관리함 공간",
    shortTitle: "공개 리드 3대 유입 & 소통함 트리아지",
    fullTitle: "축 4. 공개 리드 3대 유입 경로 & 소통관리함 트리아지 UI/검색",
    durationMinutes: 6,
    itemCount: 5,
    codePaths: [
      "src/app/(broker)/broker/w/inbox/page.tsx",
      "src/app/api/broker/inbox/route.ts",
      "src/app/api/public/im-inquiry/route.ts",
    ],
    defendedBugs:
      "할 일 카운트 불일치, 날것 JSON 노출, 금지어('핫리드'), 전화번호 뒷자리/메모 검색 누락, 딥링크 매물 불일치",
    accentColor: "emerald",
  },
  {
    id: "axis-5",
    axisNumber: 5,
    domainBadge: "소통관리함 공간",
    shortTitle: "게이트 상태머신 · 링크 잠금 · 정정 · CRUD",
    fullTitle: "축 5. 게이트 상태머신 · 전용 링크 잠금/해제 · 수치 정정 배너 · 고객 CRUD",
    durationMinutes: 7,
    itemCount: 7,
    codePaths: [
      "src/app/api/broker/inbox/actions/route.ts",
      "src/lib/security/share-link-tokens.ts",
    ],
    defendedBugs:
      "잠긴(revoked) 스레드 IM 전송 모순, 가짜 임대료 정정 문구 선입력, 매물 미지정 고객 오연결, 삭제 되돌리기 실패",
    accentColor: "teal",
  },
  {
    id: "axis-6",
    axisNumber: 6,
    domainBadge: "교차 연계 · 보안(PIPA)",
    shortTitle: "구독/수신거부(PIPA) · +82 · 계정 보안 격리",
    fullTitle: "축 6. 교차 연계 · 구독/수신거부(PIPA) · 국제번호 · 다중 계정 보안 격리",
    durationMinutes: 5,
    itemCount: 6,
    codePaths: [
      "src/app/api/magazine/editions/route.ts",
      "src/components/magazine/SubscribeCard.tsx",
      "src/lib/magazine/phone-input.ts",
    ],
    defendedBugs:
      "동의 미체크 구독 통과, +82 끝자리 절단, 수신거부자 발송 모수 미차감, 다중 중개사 localStorage 개인정보 잔류",
    accentColor: "amber",
  },
];

export const MECE_36_STEPS: MeceStepItem[] = [
  // ────────── 축 1 (NL-101 ~ NL-106) ──────────
  {
    stepNumber: 1,
    code: "NL-101",
    axisId: "axis-1",
    severity: "S0",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1,
    title: "관심 분야 & 권역 선택 단추 시인성 점검",
    bugContext:
      "라이트 테마 CSS 우선순위 충돌로 활성 칩 배경이 흰색으로 덮이면서 흰 글자가 사라졌던(하얀 빈 캡슐) 실전 버그를 방어합니다.",
    quickLinks: [
      { label: "📰 뉴스레터 스튜디오 열기", href: "/broker/magazine-editor", variant: "indigo" },
    ],
    actionSteps: [
      "창 A에서 [/broker/magazine-editor] 접속 후 중앙 [② 채우기] → [① 제목] 탭의 '내 주력 권역 · 뉴스 큐레이션 분야 설정' 카드를 찾습니다.",
      "[① 주력 상권·권역 선택] 단추들(강남·서초, 성수·왕십리 등)을 각각 클릭해 선택/해제 상태를 토글합니다.",
      "[② 뉴스 큐레이션 관심 분야 선택] 5개 단추(🏢 부동산·빌딩, 📈 경제·금리·금융, ⚖️ 절세·상속·자산관리, 🎨 문화·예술·라이프, ☕ 상권·트렌드·교양)를 클릭해 선택/해제 상태를 모두 확인합니다.",
    ],
    passCriteria: [
      "선택된 단추는 선명한 파란 배경(#1D4ED8) 위에 순백색 글자(#FFFFFF)로 이모지와 한글 라벨이 100% 또렷하게 보입니다.",
      "선택 해제된 단추는 연회색/흰 배경 위에 짙은 남색 글자로 명확히 구분되며, 글자가 안 보이는 하얀 빈 캡슐이 단 1개도 없습니다.",
    ],
    failTrap: "선택된 칩의 배경이 하얗게 변해 이모지만 남고 한글 텍스트가 보이지 않으면 즉시 S0 FAIL 처리합니다.",
  },
  {
    stepNumber: 2,
    code: "NL-102",
    axisId: "axis-1",
    severity: "S1",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1,
    title: "좌측 상태·주기 필터 탭 활성 시인성 및 실측 매물 수 확인",
    bugContext:
      "좌측 보관함 필터 탭의 선택 상태 명도비와 에디션 카드의 추천 매물 건수 표기 정합성을 검증합니다.",
    quickLinks: [
      { label: "📰 뉴스레터 스튜디오 열기", href: "/broker/magazine-editor", variant: "indigo" },
    ],
    actionSteps: [
      "좌측 [이전 호 불러오기] 영역에서 [전체 / 작성 중 / 발행됨] 상태 필터 탭을 차례로 클릭합니다.",
      "바로 아래 [전체 (N) / 일간 / 주간 / 월간] 주기 필터 탭을 차례로 클릭합니다.",
      "목록에 표시된 이전 호 카드의 '추천 매물 N건' 표기를 해당 호 클릭 후 실제 선택된 매물 수와 대조합니다.",
    ],
    passCriteria: [
      "활성화된 상태·주기 필터 탭의 배경과 글자 대비가 선명해 현재 어느 탭이 선택되었는지 즉시 식별됩니다.",
      "이전 호 카드의 '추천 매물 N건' 숫자가 실제 에디션에 담긴 매물 수와 정확히 일치합니다.",
    ],
    failTrap: "활성 탭 글자가 배경에 묻히거나, 매물이 0건인데 '3건'처럼 하드코딩된 숫자가 찍히면 FAIL입니다.",
  },
  {
    stepNumber: 3,
    code: "NL-103",
    axisId: "axis-1",
    severity: "S1",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1.5,
    title: "구형/이슈 0건 에디션 열람 후 [월간] 전환 시 핵심 이슈 5선 자동 복원",
    bugContext:
      "이슈가 비어 있던 구형 주간 에디션을 본 뒤 월간으로 전환했을 때 로컬 슬롯 빈 배열이 남아 월간 핵심 이슈 5선이 통째로 사라지던 버그를 방어합니다.",
    quickLinks: [
      { label: "📰 뉴스레터 스튜디오 열기", href: "/broker/magazine-editor", variant: "indigo" },
    ],
    actionSteps: [
      "좌측 [이전 호 불러오기] 목록에 기존 작성 중이던 주간/과거 에디션이 있다면 한 번 클릭해 불러옵니다.",
      "곧바로 좌측 상단 [빠른 시작 · 발행 주기]에서 [월간] 단추(또는 [이번 달 뉴스레터 새로 쓰기])를 클릭합니다.",
      "우측 [③ 확인하고 보내기] 미리보기 패널을 위에서 아래로 확인합니다.",
    ],
    passCriteria: [
      "우측 미리보기에 [이달의 주요 시장 통계 2선] 그래픽과 함께 [월간 핵심 시장 이슈 5선(ISSUE 01 ~ ISSUE 05 카드 5장)]이 빠짐없이 복원되어 표시됩니다.",
    ],
    failTrap: "월간으로 전환했는데 통계 2개만 나오고 핵심 시장 이슈 5선 카드가 아예 빠지면 즉시 S1 FAIL입니다.",
  },
  {
    stepNumber: 4,
    code: "NL-104",
    axisId: "axis-1",
    severity: "S1",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1.5,
    title: "월간 뉴스레터 표준 섹션 순서 및 빈 브리핑 안내 박스 제거 확인",
    bugContext:
      "월간 뉴스레터에서 통계 2선 바로 다음에 이슈 5선이 이어져야 하며, 작성하지 않은 브리핑 빈 박스가 흐름을 끊지 않는지 확인합니다.",
    quickLinks: [
      { label: "📰 월간 모드로 열기", href: "/broker/magazine-editor?cadence=monthly", variant: "indigo" },
    ],
    copySnippets: [
      {
        id: "nl104-briefing-test",
        label: "시장 브리핑 테스트 문장",
        value: "금리 인하 기대감 속에서도 우량 코너 근생과 역세권 사옥형 빌딩 위주로 선별 매수세가 이어지고 있습니다.",
        targetHint: "[② 내용] 탭 → 시장 브리핑 입력란에 붙여넣어 순서 확인 후 필요시 유지",
      },
    ],
    actionSteps: [
      "[월간] 상태에서 [② 내용] 탭의 시장 브리핑 본문을 비워둔 채 우측 미리보기 상단부터 하단까지 섹션 순서를 확인합니다.",
      "이어서 위 [시장 브리핑 테스트 문장]을 복사해 [② 내용] 탭의 시장 브리핑 칸에 붙여넣고 우측 미리보기에서 브리핑 삽입 위치를 확인합니다.",
    ],
    passCriteria: [
      "브리핑 미작성 시 미리보기 순서가 정확히 [① 표지 헤더 → ② 이달의 주요 시장 통계 2선 → ③ 월간 핵심 시장 이슈 5선 → ④ 추천 매물 소개 → ⑤ 담당 공인중개사 문의·상담] 순이며, 빈 회색 안내 박스가 통계와 이슈 사이를 가로막지 않습니다.",
      "브리핑 작성 시 [월간 핵심 시장 이슈 5선]과 [추천 매물 소개] 사이에 브리핑 칼럼이 자연스럽게 표시됩니다.",
    ],
    failTrap: "이슈 5선보다 시장 브리핑(또는 빈 안내 박스)이 먼저 나오거나 연락처 섹션이 누락되면 FAIL입니다.",
  },
  {
    stepNumber: 5,
    code: "NL-105",
    axisId: "axis-1",
    severity: "S1",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1,
    title: "[주간] · [일간] 주기 전환 시 기획별 구성 분리 확인",
    bugContext:
      "일간(속독 브리프)·주간(실전 이슈+코멘트)·월간(통계 리포트+이슈+매물) 3대 주기가 기획대로 명확히 차별화되는지 점검합니다.",
    quickLinks: [
      { label: "📰 뉴스레터 스튜디오 열기", href: "/broker/magazine-editor", variant: "indigo" },
    ],
    actionSteps: [
      "좌측 상단 발행 주기에서 [주간] 단추를 클릭해 중앙 AI 초안 카드 제목과 우측 미리보기 구성을 확인합니다.",
      "이어서 [일간] 단추를 클릭해 중앙 편집 입력 항목과 우측 미리보기 구성을 확인합니다.",
    ],
    passCriteria: [
      "[주간] 선택 시: 월간 통계 그래픽 2선이 즉시 숨겨지고, AI 초안 카드 안내가 '이번 주' 기준으로 바뀌며 '주간 핵심 시장 이슈 5선'이 표시됩니다.",
      "[일간] 선택 시: 월간 통계 그래픽과 장문 브리핑 입력 부담이 제거되고, AI 초안 카드가 '오늘' 기준으로 바뀌며 [표지 → 일간 핵심 시장 이슈 5선 → 추천 매물 → 문의·상담] 속독형으로 구성됩니다.",
    ],
    failTrap: "주간이나 일간에서도 월간 통계 그래프가 그대로 남아 있거나 월간 문구('이번 달')가 바뀌지 않으면 FAIL입니다.",
  },
  {
    stepNumber: 6,
    code: "NL-106",
    axisId: "axis-1",
    severity: "S1",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1,
    title: "URL 쿼리 직접 진입(?cadence=daily / ?cadence=monthly) 우선순위 확인",
    bugContext:
      "외부 링크나 북마크로 특정 주기를 지정해 진입했을 때 직전 로컬 세션에 밀리지 않고 URL 주기가 우선 적용되는지 검증합니다.",
    quickLinks: [
      { label: "🔗 일간 URL(?cadence=daily) 열기", href: "/broker/magazine-editor?cadence=daily", variant: "primary" },
      { label: "🔗 월간 URL(?cadence=monthly) 열기", href: "/broker/magazine-editor?cadence=monthly", variant: "indigo" },
    ],
    actionSteps: [
      "위 [🔗 일간 URL(?cadence=daily) 열기] 버튼을 눌러 새 탭에서 열린 주기가 '일간'인지 확인합니다.",
      "이어서 [🔗 월간 URL(?cadence=monthly) 열기] 버튼을 눌러 열린 주기가 즉시 '월간'으로 선택되는지 확인합니다.",
    ],
    passCriteria: [
      "이전에 보던 주기가 무엇이었든 URL 쿼리에 지정된 cadence(일간 → 월간)가 100% 우선 선택되어 화면이 열립니다.",
    ],
    failTrap: "?cadence=daily로 접속했는데 월간이나 주간 에디션 화면으로 고정되어 열리면 FAIL입니다.",
  },

  // ────────── 축 2 (NL-201 ~ NL-206) ──────────
  {
    stepNumber: 7,
    code: "NL-201",
    axisId: "axis-2",
    severity: "S1",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1.5,
    title: "개인화 권역·분야 설정 DB 영속화 및 맞춤 이슈 재클러스터링",
    bugContext:
      "중개사가 선택한 주력 권역과 뉴스 관심 분야가 서버 DB에 저장되고 F5 새로고침 후에도 유지되는지 검증합니다.",
    quickLinks: [
      { label: "📰 월간 에디터 열기", href: "/broker/magazine-editor?cadence=monthly", variant: "indigo" },
    ],
    actionSteps: [
      "[① 제목] 탭 상단 개인화 설정에서 주력 권역으로 [성수·왕십리]를 선택하고, 관심 분야는 [🏢 부동산·빌딩]과 [⚖️ 절세·상속·자산관리] 위주로 선택합니다.",
      "[✨ 내 설정 저장 · 맞춤 이슈 갱신] 버튼을 클릭해 저장 완료 피드백과 우측 이슈 5선 재편성을 확인합니다.",
      "브라우저 F5(새로고침)를 누른 뒤 선택한 권역과 분야가 그대로 유지되는지 확인합니다.",
    ],
    passCriteria: [
      "F5 새로고침 후에도 방금 저장한 권역·관심 분야 선택 상태가 초기화되지 않고 그대로 유지됩니다.",
      "우측 핵심 시장 이슈 5선 카드의 카테고리 배지가 선택한 관심 분야 위주로 반영됩니다.",
    ],
    failTrap: "F5 새로고침 직후 선택한 권역·관심 분야가 초기 기본값으로 리셋되면 FAIL입니다.",
  },
  {
    stepNumber: 8,
    code: "NL-202",
    axisId: "axis-2",
    severity: "S1",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 2,
    title: "핵심 이슈 5선 제목(≤36자)·해설(≤48자) 한국어 문장 완결성 검증",
    bugContext:
      "이번 세션 핵심 수정 사항인 서술어 중간 절단('~계산해선'), 말줄임표('…'), 개조식 종결('~있음.'), 제목 동어반복을 집중 타격 검증합니다.",
    quickLinks: [
      { label: "📰 월간 에디터 열기", href: "/broker/magazine-editor?cadence=monthly", variant: "indigo" },
    ],
    copySnippets: [
      {
        id: "nl202-trap-headline",
        label: "함정 1 · 38자 장문 제목 (절단 방어 확인용)",
        value: "상가 매수 시 일부 '공간'의 호황을 건물 전체 임대수입으로 계산해선 안 된다",
        targetHint: "[② 내용] → 핵심 이슈 제목 입력란에 붙여넣기",
      },
      {
        id: "nl202-trap-brief",
        label: "함정 2 · 개조식 종결 해설 ('~있음.' 방어 확인용)",
        value: "10년 전 공사비 영수증이 꼬마빌딩 양도세를 수천만원 좌우할 수 있음.",
        targetHint: "[② 내용] → 핵심 이슈 해설 입력란에 붙여넣기",
      },
    ],
    actionSteps: [
      "먼저 기본 생성된 우측 미리보기 ISSUE 01 ~ ISSUE 05 카드 5장의 제목과 아래 해설을 끝글자까지 눈으로 읽어 중간에 끊기거나 말줄임표('…')로 잘린 카드가 없는지 확인합니다.",
      "중앙 [② 내용] 탭의 핵심 이슈 편집 칸을 열어 위 [함정 1 · 38자 장문 제목]과 [함정 2 · 개조식 종결 해설]을 클릭 복사해 임의 이슈에 입력/적용해 봅니다.",
      "우측 미리보기에서 해당 이슈 카드의 제목과 해설이 어떻게 정돈·표시되는지 확인합니다.",
    ],
    passCriteria: [
      "5개 이슈 카드 모두 제목이 '~계산해선'처럼 어절 중간에서 잘리지 않고 완결된 문장/명사구(36자 이내, 말줄임표 '…' 0건)로 끝까지 읽힙니다.",
      "해설 역시 '~있음.'/'~됨.' 개조식이나 '제목 + 입니다.' 동어반복 없이 '~있습니다.'/'~됩니다.' 형태의 완결 평서문(48자 이내)으로 깔끔하게 표시됩니다.",
    ],
    failTrap: "제목이나 해설 끝이 '…'로 잘리거나 '~계산해선', '~할 수', '~있음.' 형태로 노출되면 즉시 S1 FAIL입니다.",
  },
  {
    stepNumber: 9,
    code: "NL-203",
    axisId: "axis-2",
    severity: "S0",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1,
    title: "연예인·사생활 가십 기사 100% 차단 검증",
    bugContext:
      "자산가·법인 대표에게 발송되는 상업용 부동산 뉴스레터에 연예인 자택 경매나 신변잡기 가십이 섞이는 브랜드 훼손을 차단합니다.",
    quickLinks: [
      { label: "📰 월간 에디터 열기", href: "/broker/magazine-editor?cadence=monthly", variant: "indigo" },
    ],
    copySnippets: [
      {
        id: "nl203-trap-gossip",
        label: "함정 · 연예인 가십 기사 제목",
        value: "유명 여가수 200억짜리 집 경매 나왔다",
        targetHint: "뉴스 풀 검색 또는 기사 필터 검증 시 참고",
      },
    ],
    actionSteps: [
      "[① 제목] 탭에서 관심 분야 조합을 바꿔가며 [✨ 내 설정 저장 · 맞춤 이슈 갱신]을 1~2회 실행해 큐레이션되는 ISSUE 01 ~ 05 목록을 살펴봅니다.",
      "연예인 사생활, 가십성 자택 경매, 스포츠·연예 뉴스 등 비(非)상업용 가십 기사가 단 1건이라도 섞여 나오는지 점검합니다.",
    ],
    passCriteria: [
      "모든 큐레이션 이슈가 금리·통화정책, 상권·공실·임대차, 절세·상속·양도세, 자산가 문화·트렌드 등 CRE 고객에게 유의미한 주제로만 구성되며 연예/정치 가십이 0건입니다.",
    ],
    failTrap: "연예인 가십이나 무관한 사건·사고 기사가 자동 큐레이션 카드에 등장하면 S0 FAIL입니다.",
  },
  {
    stepNumber: 10,
    code: "NL-204",
    axisId: "axis-2",
    severity: "S1",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1.5,
    title: "AI 초안 빠른 작성 · 무근거 수치 창작 금지 · [되돌리기] 원복 검증",
    bugContext:
      "AI 초안 생성이 기존에 중개사가 직접 적어둔 원고를 실수로 날리지 않도록 1클릭 [되돌리기] 안전장치와 할루시네이션 금지를 확인합니다.",
    quickLinks: [
      { label: "📰 월간 에디터 열기", href: "/broker/magazine-editor?cadence=monthly", variant: "indigo" },
    ],
    copySnippets: [
      {
        id: "nl204-orig-title",
        label: "되돌리기 검증용 원본 표지 제목",
        value: "[원본 보존 테스트] 11월 강남·성수 우량 빌딩 시장 리포트",
        targetHint: "[① 제목] 탭 → 표지 제목 입력란에 먼저 붙여넣기",
      },
    ],
    actionSteps: [
      "[① 제목] 탭의 표지 제목 입력란에 위 [되돌리기 검증용 원본 표지 제목]을 붙여넣습니다.",
      "[✨ AI로 초안 쓰기] 버튼을 클릭해 표지 제목·한 줄 소개·시장 브리핑 초안이 생성되는지 확인합니다.",
      "생성된 문구에 근거 없는 허위 수치나 '원금 보장/확정 수익' 같은 과장 표현이 없는지 읽은 뒤, 알림 배너/토스트의 [되돌리기]를 클릭해 원본 제목으로 복원되는지 확인합니다. (확인 후 다시 AI 초안 쓰기를 눌러 최종 제목을 세팅해도 좋습니다.)",
    ],
    passCriteria: [
      "AI 생성 초안에 과장 광고 문구('무조건 상승', '원금 보장')나 허위 통계 창작이 없습니다.",
      "[되돌리기] 클릭 즉시 직전에 입력했던 '[원본 보존 테스트]...' 제목으로 100% 복구됩니다.",
    ],
    failTrap: "[되돌리기]가 동작하지 않아 기존 원고가 영구 유실되거나 허위 확정 수익률 문구가 생성되면 FAIL입니다.",
  },
  {
    stepNumber: 11,
    code: "NL-205",
    axisId: "axis-2",
    severity: "S1",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1,
    title: "월간 상단 주요 통계 그래픽 2선 권역·지표 변경 및 출처 정직성",
    bugContext:
      "월간 뉴스레터 상단 핵심 차별점인 통계 그래픽 2선의 권역 전환 동기화와 공공 출처/기준 참고치 표기 정직성을 확인합니다.",
    quickLinks: [
      { label: "📰 월간 에디터 열기", href: "/broker/magazine-editor?cadence=monthly", variant: "indigo" },
    ],
    copySnippets: [
      {
        id: "nl205-checkpoint",
        label: "월간 통계 체크포인트 수정 예시",
        value: "성수·광진 권역은 저층 리테일 임차 수요가 탄탄해 대수선 밸류애드 검토에 유리합니다.",
        targetHint: "[② 내용] → 월간 주요 통계 그래픽 체크포인트 입력란",
      },
    ],
    actionSteps: [
      "[월간] 상태의 [② 내용] 탭 상단에서 '월간 주요 시장 통계 그래픽 2선' 편집 카드를 엽니다.",
      "기준 권역을 '성수·광진'(또는 '여의도·마포')으로 바꾸고 지표 프리셋을 전환한 뒤, 체크포인트 문구를 수정합니다.",
      "우측 미리보기의 상단 막대그래프 카드 2개가 즉시 변경되고 하단 출처 표기가 정직한지 확인합니다.",
    ],
    passCriteria: [
      "권역·지표 변경 즉시 우측 미리보기 그래픽 2개의 제목, 막대 수치, 기준 시점, 매수자 체크포인트가 실시간 동기화됩니다.",
      "각 통계 카드에 공공 출처(한국부동산원·국토부 실거래가 등) 또는 기준 참고치 안내가 투명하게 명시됩니다.",
    ],
    failTrap: "편집창에서 권역을 바꿨는데 미리보기 그래프가 고정되어 바뀌지 않거나 출처 표기가 깨지면 FAIL입니다.",
  },
  {
    stepNumber: 12,
    code: "NL-206",
    axisId: "axis-2",
    severity: "S1",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1,
    title: "포스트잇 글래스모피즘 카드 5톤(amber·sky·mint·lavender·peach) 시인성",
    bugContext:
      "어둡고 칙칙했던 구형 포스트잇 대신 적용된 SOTA 루미너스 파스텔 글래스모피즘 5색 팔레트의 가독성을 육안 검수합니다.",
    quickLinks: [
      { label: "📰 월간 에디터 열기", href: "/broker/magazine-editor?cadence=monthly", variant: "indigo" },
    ],
    actionSteps: [
      "우측 [③ 확인하고 보내기] 미리보기에서 ISSUE 01 ~ ISSUE 05 카드 5장의 배경 톤과 텍스트 명도비를 차례로 확인합니다.",
      "상단 배지(ISSUE 번호, 분야 배지), 굵은 제목, 하단 해설 문장이 5가지 파스텔 컬러 모두에서 선명하게 읽히는지 봅니다.",
    ],
    passCriteria: [
      "5가지 파스텔 글래스 배경 모두 맑고 현대적인 카드뉴스 감성을 주며, 짙은 슬레이트/네이비 텍스트와의 명도비가 높아 눈의 피로 없이 또렷하게 읽힙니다.",
    ],
    failTrap: "어두운 탁색 배경에 어두운 글씨가 겹쳐 글자가 침침하거나 번져 보이면 S1 FAIL입니다.",
  },

  // ────────── 축 3 (NL-301 ~ NL-306) ──────────
  {
    stepNumber: 13,
    code: "NL-301",
    axisId: "axis-3",
    severity: "S1",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1,
    title: "발송 전 필수 항목 누락 방어 체크리스트 작동 확인",
    bugContext:
      "표지 제목을 비운 채 실수로 고객에게 미완성 뉴스레터를 발송하는 사고를 막는 프리플라이트 가드를 검증합니다.",
    quickLinks: [
      { label: "📰 뉴스레터 스튜디오 열기", href: "/broker/magazine-editor", variant: "indigo" },
    ],
    actionSteps: [
      "[① 제목] 탭에서 표지 제목 입력란의 글자를 잠시 모두 지워 빈칸으로 만듭니다.",
      "[③ 보내기] 탭(또는 우측 상단 발송 버튼)에서 [구독자에게 보내기]를 클릭해 봅니다.",
      "차단 안내 배너를 확인한 뒤 다시 표지 제목을 정상 입력합니다.",
    ],
    passCriteria: [
      "제목이 비어 있으면 즉시 발송이 차단되고, 부족한 항목을 쉬운 한국어로 안내하며 해당 입력 단계로 바로 이동할 수 있습니다.",
    ],
    failTrap: "제목이 빈 상태인데도 그대로 발행되거나 영문 에러 코드가 노출되면 FAIL입니다.",
  },
  {
    stepNumber: 14,
    code: "NL-302",
    axisId: "axis-3",
    severity: "S0",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1.5,
    title: "보유 매물 배정 · AI 추천 코멘트 다듬기 · 가짜 샘플 사진 0건",
    bugContext:
      "사진이 없는 매물에 가짜 해외 빌딩 스톡 사진을 씌우거나 AI가 없는 수익률을 지어내던 문제를 방어합니다.",
    quickLinks: [
      { label: "📰 뉴스레터 스튜디오 열기", href: "/broker/magazine-editor", variant: "indigo" },
    ],
    copySnippets: [
      {
        id: "nl302-deal-note",
        label: "매물 추천 한 줄 메모 예시",
        value: "역세권 도보 4분 코너 입지로 가시성이 뛰어나 사옥 겸 임대용으로 적합합니다.",
        targetHint: "[② 내용] → 추천 매물 코멘트 입력 후 [AI 다듬기]",
      },
    ],
    actionSteps: [
      "[① 제목]에 정상 제목이 입력된 상태에서 [② 내용] 탭 하단 '추천 매물 선택' 영역으로 이동해 보유 매물 1~3건을 체크합니다.",
      "선택한 매물의 한 줄 추천 코멘트에 위 예시 문장을 넣고 [AI 다듬기]가 있다면 실행해 봅니다.",
      "우측 미리보기의 추천 매물 카드 썸네일(실제 업로드 사진 vs 사진 미등록 시 깔끔한 빌딩 아이콘)을 확인합니다.",
    ],
    passCriteria: [
      "입력하지 않은 허위 수익률/가격 숫자가 추가되지 않고 매물 추천 문구가 자연스럽게 다듬어집니다.",
      "실제 사진을 등록하지 않은 매물은 정직한 빌딩 아이콘 플레이스홀더로 표시되며, 무관한 가짜 빌딩 사진이 절대 노출되지 않습니다.",
    ],
    failTrap: "등록한 적 없는 생소한 빌딩 외관 사진(Unsplash 더미 등)이 매물 썸네일에 나타나면 즉시 S0 FAIL입니다.",
  },
  {
    stepNumber: 15,
    code: "NL-303",
    axisId: "axis-3",
    severity: "S1",
    windowMode: "창 A ↔ 창 B 교차",
    estimatedMinutes: 1.5,
    title: "최초 발행 및 발행 후 재수정 시 자동 재저장 (Stale 구버전 링크 차단)",
    bugContext:
      "이미 발행된 호의 제목/내용을 고친 직후 [링크 복사]를 눌렀을 때 수정본이 서버에 자동 재저장되지 않아 고객에게 구버전이 보이던 버그를 검증합니다.",
    quickLinks: [
      { label: "📰 뉴스레터 스튜디오 열기", href: "/broker/magazine-editor", variant: "indigo" },
    ],
    copySnippets: [
      {
        id: "nl303-final-suffix",
        label: "재수정 반영 확인용 표지 제목",
        value: "2026년 11월호 핵심 빌딩 시장 리포트 (최종수정본)",
        targetHint: "최초 [링크 복사] 후 다시 [① 제목]으로 가서 이 제목으로 수정",
      },
    ],
    actionSteps: [
      "창 A [③ 보내기] 탭에서 [링크 복사]를 눌러 최초 발행합니다.",
      "곧바로 [① 제목] 탭으로 돌아가 표지 제목을 위 '(최종수정본)' 포함 문구로 고칩니다 (우측 상단 '고친 내용 있음' 배지 확인).",
      "별도로 임시저장을 누르지 말고 곧장 [③ 보내기] → [링크 복사]를 다시 클릭한 뒤, 복사된 공개 URL을 상단 [내 테스트 링크 보관함]과 창 B(시크릿 창) 주소창에 붙여넣어 접속합니다.",
    ],
    passCriteria: [
      "창 B(시크릿 비로그인 창)에서 열린 공개 뉴스레터 표지 제목에 방금 수정한 '(최종수정본)' 문구가 100% 즉시 반영되어 있습니다.",
    ],
    failTrap: "창 B에서 열었을 때 수정 전 구버전 제목이 그대로 보이면 Stale 링크 버그이므로 S1 FAIL입니다.",
  },
  {
    stepNumber: 16,
    code: "NL-304",
    axisId: "axis-3",
    severity: "S1",
    windowMode: "창 B (고객 시크릿창)",
    estimatedMinutes: 1,
    title: "고객 공개 뷰어 섹션 순서 · 글래스 카드 5장 · 다크 배경 가독성",
    bugContext:
      "실제 매수 고객이 카톡 링크를 눌러 보는 공개 뷰어 화면에서 다크 배경과 루미너스 글래스 카드의 조화 및 섹션 순서를 검증합니다.",
    quickLinks: [],
    actionSteps: [
      "창 B(시크릿 창)에 열려 있는 공개 월간 뉴스레터 화면을 최상단 표지부터 최하단 푸터까지 천천히 스크롤합니다.",
      "섹션 배치 순서와 글래스모피즘 카드(통계 2선 + 핵심 이슈 5선)의 텍스트 시인성, 문장 완결성을 점검합니다.",
    ],
    passCriteria: [
      "로그인 요구 없이 즉시 열리며, [표지 → 주요 시장 통계 2선 → 월간 핵심 시장 이슈 5선(5장 모두 절단 0건) → (작성 시 시장 브리핑) → 주목 매물 하이라이트 → 담당 중개사 연락처·구독 신청] 순서가 정확합니다.",
      "다크 뷰어 캔버스 위에서도 파스텔 글래스 카드 내부의 제목·수치·해설이 눈부심이나 흐림 없이 선명하게 읽힙니다.",
    ],
    failTrap: "공개 뷰어에서 월간 이슈 5선이 누락되거나 글래스 카드 글씨가 배경에 묻혀 안 보이면 FAIL입니다.",
  },
  {
    stepNumber: 17,
    code: "NL-305",
    axisId: "axis-3",
    severity: "S1",
    windowMode: "창 B (고객 시크릿창)",
    estimatedMinutes: 1,
    title: "공개 뷰어 추천 매물 제원(실제 면적) 및 수지분석 계산기 자동 프리필",
    bugContext:
      "매물 면적 칸에 주소 동 이름('마포구 동교동')이 잘못 찍히거나 수지분석 계산기가 0원으로 비어 있던 매핑 결함을 점검합니다.",
    quickLinks: [],
    actionSteps: [
      "창 B 공개 뉴스레터의 [주목 매물 하이라이트] 카드에서 면적·매매가·수익률 표기를 확인합니다.",
      "아래 [수지분석 계산기] 섹션을 펼쳐 매매가·보증금·월임대료 기본 입력값이 대표 매물 기준으로 자동 프리필되어 있는지 확인합니다.",
      "추천 매물 카드를 클릭해 공개 딜카드(/dc/[id]) 또는 상세 페이지로 정상 이동하는지 확인합니다. (열린 딜카드 URL도 상단 보관함에 메모해 두면 다음 축 4에서 바로 씁니다!)",
    ],
    passCriteria: [
      "매물 카드 면적 란에 주소가 아닌 실제 대지/연면적(평 또는 ㎡)이 정확히 표시됩니다.",
      "수지분석 계산기에 대표 매물 제원이 기본 입력되어 슬라이더/금리 조절 시 즉시 자기자본수익률이 재계산되며, 매물 클릭 시 해당 매물 공개 화면으로 이동합니다.",
    ],
    failTrap: "면적 칸에 '마포구 동교동'처럼 지역명이 찍히거나 매물 클릭 시 404 에러가 뜨면 S1 FAIL입니다.",
  },
  {
    stepNumber: 18,
    code: "NL-306",
    axisId: "axis-3",
    severity: "S0",
    windowMode: "창 B (고객 시크릿창)",
    estimatedMinutes: 1,
    title: "비-UUID ?edition= 쿼리 방어 및 단축 슬러그(/m/[slug]) 안전 접속",
    bugContext:
      "URL의 ?edition= 파라미터에 날짜 문자열이 들어왔을 때 발생하던 PostgreSQL 22P02(500 크래시) 방어 및 중개사 전용 슬러그 라우팅을 확인합니다.",
    quickLinks: [],
    copySnippets: [
      {
        id: "nl306-query-trap",
        label: "비-UUID 쿼리 방어 테스트 접미사",
        value: "?edition=2026-11",
        targetHint: "창 B 공개 뉴스레터 URL 맨 뒤에 붙여 접속 테스트",
      },
    ],
    actionSteps: [
      "창 B에 열려 있는 공개 뉴스레터 URL 뒤에 '?edition=2026-11'을 붙여 Enter로 접속해 봅니다.",
      "중개사 프로필에 단축 슬러그가 설정되어 있다면 '/m/[슬러그]' 경로로도 접속해 봅니다.",
    ],
    passCriteria: [
      "비-UUID 쿼리(?edition=2026-11)를 붙여도 500 Internal Server Error 없이 정상 렌더링되거나 안전하게 안내됩니다.",
      "단축 슬러그 접속 시 엉뚱한 타 중개사의 뉴스레터로 리다이렉트되지 않습니다.",
    ],
    failTrap: "화면에 500 에러나 DB 에러 메시지가 노출되면 즉시 S0 FAIL입니다.",
  },

  // ────────── 축 4 (IB-401 ~ IB-405) ──────────
  {
    stepNumber: 19,
    code: "IB-401",
    axisId: "axis-4",
    severity: "S0",
    windowMode: "창 B ↔ 창 A 교차",
    estimatedMinutes: 1.5,
    title: "경로 ① 공개 딜카드 [IM 요청하기] 제출 → 소통함 [할 일] 즉시 수신",
    bugContext:
      "비로그인 매수 고객이 딜카드에서 상세 IM을 요청했을 때 소통관리함 최상단 [할 일]로 즉시 유입되고 날것 JSON 없이 깔끔하게 표시되는지 확인합니다.",
    quickLinks: [
      { label: "🃏 딜카드 워크스페이스(창 A 링크 확인용)", href: "/broker/w/dealcards", variant: "slate" },
      { label: "💬 소통관리함 열기(창 A)", href: "/broker/w/inbox", variant: "emerald" },
    ],
    copySnippets: [
      {
        id: "ib401-buyer-name",
        label: "요청 고객 성명/직함",
        value: "박매수 상무",
        targetHint: "창 B 공개 딜카드 [IM 요청하기] 이름란",
      },
      {
        id: "ib401-buyer-phone",
        label: "요청 고객 연락처",
        value: "010-8888-7777",
        targetHint: "창 B 공개 딜카드 [IM 요청하기] 연락처란",
      },
      {
        id: "ib401-buyer-org",
        label: "소속 법인/메모",
        value: "케이리츠자산운용 · 투심위 검토용 상세 IM 자료 요청드립니다.",
        targetHint: "창 B 공개 딜카드 [IM 요청하기] 소속/요청사유란",
      },
    ],
    actionSteps: [
      "창 B(시크릿 창)에서 공개 딜카드(/dc/[id] — 방금 뉴스레터 매물 클릭으로 열었거나 창 A 딜카드에서 복사한 공개 링크) 하단의 [IM 요청하기] 버튼을 누릅니다.",
      "위 [박매수 상무 / 010-8888-7777 / 케이리츠자산운용...] 프리셋을 클릭 복사해 입력하고 개인정보 동의 체크 후 제출합니다.",
      "창 A에서 [/broker/w/inbox]를 열거나 새로고침해 좌측 상단 카운트와 목록 최상단 카드를 확인합니다.",
    ],
    passCriteria: [
      "창 A 소통관리함 좌측 상단 '지금 할 일 N건' 숫자가 즉시 반영되고, 목록 최상단에 'IM 요청 대기 · 박매수 상무'가 나타납니다.",
      "스레드 상세의 요청 사유에 '{\"type\":\"anonymous_lead\"...}' 같은 날것 JSON 문자열이 절대 노출되지 않고 사람이 읽기 좋은 한국어로만 표시됩니다.",
    ],
    failTrap: "요청을 제출했는데 소통함에 유입되지 않거나 화면에 중괄호 JSON 원문이 노출되면 S0 FAIL입니다.",
  },
  {
    stepNumber: 20,
    code: "IB-402",
    axisId: "axis-4",
    severity: "S0",
    windowMode: "창 B ↔ 창 A 교차",
    estimatedMinutes: 1.5,
    title: "경로 ② 공개 IM 뷰어 문의하기 필수값·개인정보 동의 검증 및 유입",
    bugContext:
      "개인정보보호법(PIPA) 동의 없이는 리드가 수집되지 않아야 하며, 정상 문의 시 소통함으로 누락 없이 집계되는지 검증합니다.",
    quickLinks: [
      { label: "📊 IM 스튜디오(공개 링크 확인용)", href: "/broker/w/im", variant: "slate" },
      { label: "💬 소통관리함 열기(창 A)", href: "/broker/w/inbox", variant: "emerald" },
    ],
    copySnippets: [
      {
        id: "ib402-inquiry-phone",
        label: "IM 문의 고객 정보",
        value: "이투자 대표 / 010-7777-6666",
        targetHint: "창 B 공개 IM 화면 문의 바텀시트",
      },
    ],
    actionSteps: [
      "창 B에서 공개 IM 화면(/im-lite/[id]) 하단의 문의하기 버튼을 엽니다.",
      "먼저 ① 연락처를 비우거나 ② 개인정보 수집·이용 동의 체크박스를 해제한 상태에서 제출을 눌러 차단이 작동하는지 확인합니다.",
      "이어서 정상 연락처(010-7777-6666)와 동의 체크 후 제출하고 창 A 소통관리함에 문의가 유입되는지 확인합니다.",
    ],
    passCriteria: [
      "연락처 누락 또는 개인정보 동의 미체크 시 제출이 명확한 한국어 안내와 함께 차단됩니다.",
      "정상 제출 건은 창 A 소통관리함 목록에 즉시 유입됩니다.",
    ],
    failTrap: "개인정보 동의 체크 없이 문의가 서버에 저장되면 법적 컴플라이언스 위반으로 S0 FAIL입니다.",
  },
  {
    stepNumber: 21,
    code: "IB-403",
    axisId: "axis-4",
    severity: "S1",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1,
    title: "소통함 3열 레이아웃 · 금지어 0건 · 14px+ 시니어 친화 타이포그래피",
    bugContext:
      "5060 대표 공인중개사 페르소나를 위해 깨알 글씨·영문 개발 용어('핫리드', 'pending')를 배제하고 큼직한 터치 영역을 보장했는지 확인합니다.",
    quickLinks: [
      { label: "💬 소통관리함(/broker/w/inbox)", href: "/broker/w/inbox", variant: "emerald" },
      { label: "🔀 구 경로 리다이렉트(/broker/inbox)", href: "/broker/inbox", variant: "slate" },
    ],
    actionSteps: [
      "창 A에서 [/broker/w/inbox] 3열 화면(① 고객 목록 / ② 진행 상세·탭 / ③ 고객 요약·열람 권한)의 글자 크기와 버튼 크기를 점검합니다.",
      "구 경로 [/broker/inbox] 클릭 시 새 워크스페이스로 자연스럽게 연결되는지도 확인합니다.",
    ],
    passCriteria: [
      "화면에 '핫리드', '소식지', 'pending', 'TODO' 같은 금지어/개발 은어가 0건이며 '관심 높음', 'IM 요청 대기', '뉴스레터' 등 표준 용어만 사용됩니다.",
      "보조 설명도 14px 이상으로 또렷하고 주요 액션 버튼 높이가 44~48px 이상으로 클릭하기 편안합니다.",
    ],
    failTrap: "11~12px 깨알 글씨가 남아 있거나 '핫리드'/'pending' 같은 용어가 노출되면 FAIL입니다.",
  },
  {
    stepNumber: 22,
    code: "IB-404",
    axisId: "axis-4",
    severity: "S1",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1,
    title: "3종 필터(할 일 · 열람 · 전체 고객) 및 전화번호 뒷자리·메모 통합 검색",
    bugContext:
      "중개사가 통화 중 고객 전화번호 뒷자리 4자리나 법인명만 쳐도 즉시 스레드를 찾을 수 있는지 확인합니다.",
    quickLinks: [
      { label: "💬 소통관리함 열기", href: "/broker/w/inbox", variant: "emerald" },
    ],
    copySnippets: [
      {
        id: "ib404-search-phone",
        label: "전화번호 뒷자리 검색어",
        value: "7777",
        targetHint: "소통관리함 좌측 검색창에 입력",
      },
      {
        id: "ib404-search-org",
        label: "법인명/메모 검색어",
        value: "케이리츠",
        targetHint: "소통관리함 좌측 검색창에 입력",
      },
    ],
    actionSteps: [
      "좌측 상단 필터 탭 [할 일 / 열람 / 전체 고객]을 각각 클릭해 목록 필터링이 올바르게 나뉘는지 확인합니다.",
      "검색창에 '7777'(전화번호 뒷자리)과 '케이리츠'(회사명/메모 키워드)를 차례로 입력한 뒤, 검색어를 지워 전체 목록 복귀를 확인합니다.",
    ],
    passCriteria: [
      "하이픈 없이 전화번호 뒷자리 숫자 4자리만 입력해도 즉시 '박매수 상무' 스레드가 검색됩니다.",
      "회사명·메모·매물명 검색이 모두 작동하며 검색어 삭제 시 지연 없이 원래 목록으로 돌아옵니다.",
    ],
    failTrap: "전화번호 뒷자리 검색 시 하이픈 불일치로 검색 결과가 0건이 나오면 FAIL입니다.",
  },
  {
    stepNumber: 23,
    code: "IB-405",
    axisId: "axis-4",
    severity: "S1",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1,
    title: "스레드 상단 매물 편집 딥링크(📄 딜카드 편집 → / 📊 IM 편집 →) 정합성",
    bugContext:
      "고객 문의를 확인하다가 바로 해당 매물의 가격·조건을 수정하러 갈 때 정확한 buildingId로 연결되는지 확인합니다.",
    quickLinks: [
      { label: "💬 소통관리함 열기", href: "/broker/w/inbox", variant: "emerald" },
    ],
    actionSteps: [
      "창 A 소통관리함에서 '박매수 상무' 스레드를 선택합니다.",
      "중앙 상단 헤더에 있는 [📄 딜카드 편집 →] 또는 [📊 IM 편집 →] 링크를 클릭해 봅니다.",
    ],
    passCriteria: [
      "엉뚱한 첫 번째 매물이 아니라 박매수 상무가 요청한 바로 그 매물(?buildingId=...)의 편집 화면으로 정확히 이동합니다.",
    ],
    failTrap: "클릭 시 매물 선택이 풀리거나 다른 매물 편집창이 열리면 FAIL입니다.",
  },

  // ────────── 축 5 (IB-501 ~ IB-507) ──────────
  {
    stepNumber: 24,
    code: "IB-501",
    axisId: "axis-5",
    severity: "S1",
    windowMode: "창 A ↔ 창 B 교차",
    estimatedMinutes: 1.5,
    title: "1클릭 [자료 보내기(승인)] → 전용 토큰 링크 발급 및 3회 반복 열람 감지",
    bugContext:
      "IM 요청 승인 시 수신자 전용 토큰(?token=slk...) 발급과 매수 고객의 반복 열람(관심 높음 신호) 추적을 검증합니다.",
    quickLinks: [
      { label: "💬 소통관리함 열기(창 A)", href: "/broker/w/inbox", variant: "emerald" },
    ],
    actionSteps: [
      "창 A 소통관리함에서 '박매수 상무'를 선택하고 [자료 보내기(승인)] 버튼을 클릭합니다.",
      "클립보드에 자동 복사된 전용 링크(/im-lite/[id]?token=slk...)를 상단 [내 테스트 링크 보관함]에 저장하고, 창 B(시크릿 창) 주소창에 붙여넣어 접속합니다.",
      "창 B에서 블라인드 없이 전체 IM이 열리는지 확인한 뒤, F5 새로고침을 3회 반복하고 창 A 소통관리함을 새로고침해 열람 횟수와 배지를 확인합니다.",
    ],
    passCriteria: [
      "창 B에서 승인 토큰으로 상세 주소·렌트롤·수지분석까지 전체 IM 열람이 가능합니다.",
      "3회 열람 후 창 A 소통관리함에서 박매수 상무의 열람 횟수(3회 이상)와 '관심 높음' 신호가 활성화됩니다.",
    ],
    failTrap: "승인된 전용 토큰 링크인데도 여전히 잠금/블라인드 상태이거나 열람 횟수가 전혀 집계되지 않으면 FAIL입니다.",
  },
  {
    stepNumber: 25,
    code: "IB-502",
    axisId: "axis-5",
    severity: "S0",
    windowMode: "창 A ↔ 창 B 교차",
    estimatedMinutes: 1,
    title: "[보낸 링크 잠그기] 시 수신자 즉시 차단 & 소통함 IM 전송 버튼 잠금 일관성",
    bugContext:
      "우측에서 링크를 잠갔음(revoked)에도 중앙 메시지 탭의 'IM 전용 링크 보내기' 버튼이 살아 있어 클릭 시 잠금이 멋대로 풀리던 상태 모순 버그를 검증합니다.",
    quickLinks: [
      { label: "💬 소통관리함 열기(창 A)", href: "/broker/w/inbox", variant: "emerald" },
    ],
    actionSteps: [
      "창 A 우측 하단 [전용 링크 열람 권한] 카드에서 [보낸 링크 잠그기] → 확인 [잠그기]를 클릭합니다.",
      "① 창 A 중앙/우측의 'IM 전용 링크' 발송 버튼이 '(잠김)' 비활성 상태로 바뀌었는지 확인합니다.",
      "② 창 B(시크릿 창)에서 방금 보고 있던 전용 토큰 링크(?token=slk...)를 F5 새로고침합니다.",
    ],
    passCriteria: [
      "창 A에서 열람 권한 배지가 '링크 잠김'으로 바뀌고, IM 전용 링크 전송 버튼도 비활성화되어 실수로 재개통되지 않습니다.",
      "창 B에서 새로고침 즉시 상세 자료 열람이 차단되고 열람 만료/제한 안내 화면이 표시됩니다.",
    ],
    failTrap: "링크를 잠갔는데도 창 B에서 여전히 상세 IM 본문이 그대로 보이면 심각한 보안 결함으로 즉시 S0 FAIL입니다.",
  },
  {
    stepNumber: 26,
    code: "IB-503",
    axisId: "axis-5",
    severity: "S1",
    windowMode: "창 A ↔ 창 B 교차",
    estimatedMinutes: 0.5,
    title: "[링크 다시 열기] 클릭 시 수신자 열람 권한 즉시 복구",
    bugContext:
      "잠갔던 고객과의 협상이 재개되었을 때 새 링크를 재발송하지 않고도 기존 전용 링크 권한을 다시 열 수 있는지 확인합니다.",
    quickLinks: [
      { label: "💬 소통관리함 열기(창 A)", href: "/broker/w/inbox", variant: "emerald" },
    ],
    actionSteps: [
      "창 A 우측 [전용 링크 열람 권한] 카드에서 [링크 다시 열기] 버튼을 클릭합니다.",
      "창 B(시크릿 창)에서 동일 전용 링크를 다시 F5 새로고침합니다.",
    ],
    passCriteria: [
      "창 A 배지가 '열람 가능'으로 복원되고, 창 B에서도 즉시 전체 IM 자료가 다시 정상 표시됩니다.",
    ],
    failTrap: "[링크 다시 열기] 후에도 창 B가 계속 차단 화면에 머물러 있으면 FAIL입니다.",
  },
  {
    stepNumber: 27,
    code: "IB-504",
    axisId: "axis-5",
    severity: "S0",
    windowMode: "창 A ↔ 창 B 교차",
    estimatedMinutes: 1.5,
    title: "[⚠️ 수치 정정 안내 띄우기] 빈 초기값 확인 · 게시 · 해제 검증",
    bugContext:
      "정정 안내 모달을 열었을 때 실제 입력값(value)에 가짜 '450만원→480만원' 예시가 선입력되어 실수로 허위 임대료 정정이 게시되던 위험을 방어합니다.",
    quickLinks: [
      { label: "💬 소통관리함 열기(창 A)", href: "/broker/w/inbox", variant: "emerald" },
    ],
    copySnippets: [
      {
        id: "ib504-correction-msg",
        label: "수치 정정 안내 게시 문구",
        value: "2층 임대 조건이 보증금 5,000만 / 월 290만으로 최종 갱신되었습니다.",
        targetHint: "먼저 입력창이 완전히 비어 있는지 확인한 뒤 붙여넣기!",
      },
    ],
    actionSteps: [
      "창 A 우측 하단에서 [⚠️ 수치 정정 안내 띄우기] 버튼을 클릭하고, 아무것도 타이핑하기 전 입력창의 초기 value가 비어 있는지(회색 placeholder 안내만 있는지) 먼저 확인합니다!",
      "위 [수치 정정 안내 게시 문구]를 복사해 붙여넣고 [정정 안내 게시]를 클릭한 뒤, 창 B 전용 링크를 새로고침해 상단 정정 배너 노출을 확인합니다.",
      "다시 창 A에서 [정정 안내 내리기]를 클릭하고 창 B 새로고침 시 배너가 즉시 사라지는지 확인합니다.",
    ],
    passCriteria: [
      "모달을 처음 열었을 때 실제 입력 텍스트(value)가 100% 빈 문자열('')이며, 가짜 임대료 문구가 선입력되어 있지 않습니다.",
      "게시 클릭 즉시 창 B 상단에 정정 안내 배너가 선명하게 뜨고, 내리기 클릭 시 즉시 제거됩니다.",
    ],
    failTrap: "모달을 열자마자 지워야 하는 실제 텍스트가 미리 채워져 있거나 창 B에 배너가 반영되지 않으면 S0 FAIL입니다.",
  },
  {
    stepNumber: 28,
    code: "IB-505",
    axisId: "axis-5",
    severity: "S1",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1,
    title: "[메시지] 탭 카톡 안내 문구 편집 및 [기록] 탭 통화 메모 DB 영속성",
    bugContext:
      "스레드 전환 시 작성 중이던 메모가 다른 고객 칸에 따라붙는 오염을 막고, 저장한 통화 기록이 DB에 영구 보존되는지 확인합니다.",
    quickLinks: [
      { label: "💬 소통관리함 열기", href: "/broker/w/inbox", variant: "emerald" },
    ],
    copySnippets: [
      {
        id: "ib505-call-memo",
        label: "통화 기록 저장 테스트 메모",
        value: "금주 금요일 15시 현장 실사 및 대표님 미팅 확정 (주차 2대 요청)",
        targetHint: "[기록] 탭 → 통화 메모 입력란에 붙여넣고 [메모 저장]",
      },
    ],
    actionSteps: [
      "중앙 [메시지] 탭을 열어 카톡 안내 문구 편집 및 [뉴스레터 보내기] 버튼 동작을 확인합니다.",
      "[기록] 탭으로 이동해 위 [통화 기록 저장 테스트 메모]를 입력하고 [메모 저장]을 누릅니다.",
      "다른 고객 스레드를 한 번 클릭해 메모 입력창이 깨끗하게 비워지는지 본 뒤, 다시 박매수 상무로 돌아와 F5 새로고침을 실행합니다.",
    ],
    passCriteria: [
      "고객 스레드를 바꿔 클릭할 때 이전 고객의 미저장 메모 초안이 따라붙지 않습니다.",
      "저장한 통화 메모는 F5 새로고침 후에도 [기록] 타임라인 최상단에 정확히 보존됩니다.",
    ],
    failTrap: "F5 새로고침 후 방금 저장한 통화 메모가 사라지면 DB 영속화 실패로 S1 FAIL입니다.",
  },
  {
    stepNumber: 29,
    code: "IB-506",
    axisId: "axis-5",
    severity: "S0",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 0.8,
    title: "[+ 고객 직접 등록] — 관심 매물 미지정 시 엉뚱한 매물 오연결 방지",
    bugContext:
      "특정 매물을 지정하지 않고 일반 VIP 매수 고객을 등록했을 때 보유 첫 매물이나 데모 매물(bld-01)로 강제 귀속시키던 버그를 방어합니다.",
    quickLinks: [
      { label: "💬 소통관리함 열기", href: "/broker/w/inbox", variant: "emerald" },
    ],
    copySnippets: [
      {
        id: "ib506-vip-name",
        label: "직접 등록 고객명 / 연락처",
        value: "최자산 대표",
        targetHint: "[+ 고객 직접 등록] 모달 고객명 (연락처: 010-5555-4444)",
      },
      {
        id: "ib506-vip-phone",
        label: "직접 등록 연락처",
        value: "010-5555-4444",
        targetHint: "[+ 고객 직접 등록] 모달 연락처 (관심 매물란은 비워두기!)",
      },
    ],
    actionSteps: [
      "좌측 상단 [+ 고객 직접 등록] 버튼을 클릭합니다.",
      "고객명 '최자산 대표', 연락처 '010-5555-4444', 등급 'VIP'를 선택하고, [관심 매물] 칸은 일부러 비워둔 채 등록합니다.",
    ],
    passCriteria: [
      "등록된 최자산 대표 카드에 '관심 매물 미지정'(또는 일반 고객 안내)으로 정직하게 표시되며, 전혀 무관한 보유 매물이나 데모 빌딩으로 잘못 묶이지 않습니다.",
    ],
    failTrap: "관심 매물을 비웠는데 임의의 빌딩 이름이 자동으로 붙어 있으면 데이터 왜곡으로 S0 FAIL입니다.",
  },
  {
    stepNumber: 30,
    code: "IB-507",
    axisId: "axis-5",
    severity: "S1",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 0.7,
    title: "직접 등록 고객 [정보 수정] 및 [고객 삭제 → 되돌리기] 서버 복원",
    bugContext:
      "실수로 VIP 고객을 삭제했을 때 토스트 [되돌리기]로 로컬 UI뿐 아니라 서버 DB까지 완벽히 살려내는지 검증합니다.",
    quickLinks: [
      { label: "💬 소통관리함 열기", href: "/broker/w/inbox", variant: "emerald" },
    ],
    actionSteps: [
      "방금 등록한 '최자산 대표' 선택 후 우측 요약 카드에서 [정보 수정]을 눌러 메모/예산('100억대 사옥 검토')을 추가 저장합니다.",
      "이어서 [고객 삭제]를 클릭한 뒤, 화면 하단 토스트 알림의 [되돌리기] 버튼을 즉시 클릭합니다.",
      "브라우저 F5 새로고침 후에도 '최자산 대표'가 목록에 그대로 살아 있는지 확인합니다.",
    ],
    passCriteria: [
      "고객 정보 수정 사항이 즉시 반영되며, 삭제 후 [되돌리기] 클릭 시 서버 DB까지 복원되어 F5 후에도 고객이 유실되지 않습니다.",
    ],
    failTrap: "[되돌리기] 직후에는 보이다가 F5 새로고침을 누르면 고객이 사라지는 경우 FAIL입니다.",
  },

  // ────────── 축 6 (SEC-601 ~ SEC-606) ──────────
  {
    stepNumber: 31,
    code: "SEC-601",
    axisId: "axis-6",
    severity: "S0",
    windowMode: "창 B (고객 시크릿창)",
    estimatedMinutes: 1,
    title: "공개 뉴스레터 구독 시 동의 강제 및 국제번호(+82) 11자리 정규화",
    bugContext:
      "모바일 자동완성으로 '+82 10-3333-2222'가 입력될 때 앞의 82 때문에 끝자리 '2'가 잘려 잘못된 번호로 저장되던 버그와 동의 강제를 검증합니다.",
    quickLinks: [],
    copySnippets: [
      {
        id: "sec601-intl-phone",
        label: "+82 국제번호 형식 연락처",
        value: "+82 10-3333-2222",
        targetHint: "창 B 공개 뉴스레터 하단 구독 신청 연락처란에 붙여넣기",
      },
    ],
    actionSteps: [
      "창 B 공개 뉴스레터 하단의 [뉴스레터 무료 구독 신청] 카드에서 먼저 개인정보 동의 체크 없이 신청 버튼을 눌러 차단을 확인합니다.",
      "연락처 칸에 위 '+82 10-3333-2222'를 붙여넣고 성명('강구독 대표')과 개인정보 동의 체크 후 구독을 완료합니다.",
    ],
    passCriteria: [
      "개인정보 동의 미체크 시 구독 제출이 차단됩니다.",
      "'+82 10-3333-2222' 입력 시 끝자리 '2'가 잘리지 않고 '010-3333-2222' 11자리 한국 휴대폰 번호로 정확히 정규화됩니다.",
    ],
    failTrap: "끝자리가 잘려 '010-3333-222'처럼 10자리 불량 번호로 저장되거나 동의 없이 가입되면 S0 FAIL입니다.",
  },
  {
    stepNumber: 32,
    code: "SEC-602",
    axisId: "axis-6",
    severity: "S1",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 0.5,
    title: "신규 구독자 유입 → 뉴스레터 발송 대상 모수 즉시 반영",
    bugContext:
      "공개 뉴스레터에서 유입된 신규 구독자가 에디터 발송 모수와 소통관리함에 실시간 연동되는지 확인합니다.",
    quickLinks: [
      { label: "📰 뉴스레터 스튜디오 [③ 보내기] 확인", href: "/broker/magazine-editor", variant: "indigo" },
      { label: "💬 소통관리함 고객 목록 확인", href: "/broker/w/inbox", variant: "emerald" },
    ],
    actionSteps: [
      "창 A [/broker/magazine-editor] 새로고침 후 [③ 보내기] 탭의 '받을 고객 확인(전체 구독자 N명)' 숫자를 확인합니다.",
      "창 A [/broker/w/inbox]의 [전체 고객] 탭에서도 신규 구독자('강구독 대표' 또는 010-3333-2222)가 수신 동의 상태로 잡히는지 확인합니다.",
    ],
    passCriteria: [
      "방금 구독 신청한 고객이 뉴스레터 발송 대상 구독자 수에 정상 합산되어 표시됩니다.",
    ],
    failTrap: "구독 완료 토스트가 떴는데 중개사 발송 대상 수가 전혀 늘지 않으면 FAIL입니다.",
  },
  {
    stepNumber: 33,
    code: "SEC-603",
    axisId: "axis-6",
    severity: "S0",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 1,
    title: "소통함 [수신 동의 ↔ 미구독] 토글 및 수신거부 시 발송 모수 즉시 차감",
    bugContext:
      "수신거부(unsubscribed)한 고객이 broker_clients 테이블에 남아 있다는 이유로 다시 발송 모수에 합산되던 PIPA 위반 버그를 검증합니다.",
    quickLinks: [
      { label: "💬 소통관리함 열기", href: "/broker/w/inbox", variant: "emerald" },
      { label: "📰 뉴스레터 스튜디오 열기", href: "/broker/magazine-editor", variant: "indigo" },
    ],
    actionSteps: [
      "창 A 소통관리함에서 방금 구독한 고객을 선택하고, 우측 요약 카드의 '뉴스레터' 항목에서 [수신 동의] 토글을 클릭해 [미구독](수신거부)으로 변경합니다.",
      "다시 [/broker/magazine-editor] → [③ 보내기] 탭을 새로고침하여 발송 대상 구독자 수를 확인합니다.",
    ],
    passCriteria: [
      "미구독/수신거부로 전환된 고객은 고객 관리 목록에는 남더라도 뉴스레터 발송 대상 모수에서 즉시 -1명 차감되어 제외됩니다.",
    ],
    failTrap: "수신거부 처리한 고객이 여전히 뉴스레터 발송 대상 인원수에 포함되면 정보통신망법·PIPA 위반으로 즉시 S0 FAIL입니다.",
  },
  {
    stepNumber: 34,
    code: "SEC-604",
    axisId: "axis-6",
    severity: "S0",
    windowMode: "창 A (중개사 일반창)",
    estimatedMinutes: 0.5,
    title: "수신 동의 없는 일반 고객 등록 시 마케팅 발송 자동 편입 금지",
    bugContext:
      "중개사가 통화 메모용으로 직접 등록한 일반 고객(수신 동의 미체크)에게 무단으로 뉴스레터가 발송되지 않는지 확인합니다.",
    quickLinks: [
      { label: "💬 소통관리함 열기", href: "/broker/w/inbox", variant: "emerald" },
    ],
    actionSteps: [
      "앞서 [IB-506]에서 뉴스레터 수신 동의 없이 등록한 '최자산 대표'의 우측 카드 뉴스레터 상태가 [미구독]인지 확인합니다.",
      "뉴스레터 발송 대상 모수에 동의 없는 일반 등록 고객이 자동 포함되지 않았음을 확인합니다.",
    ],
    passCriteria: [
      "명시적 수신 동의가 없는 직접 등록 고객은 기본 [미구독]으로 유지되며 발송 대상에 자동 편입되지 않습니다.",
    ],
    failTrap: "수신 동의 체크 없이 등록한 고객이 자동으로 '수신 동의'가 되어 있으면 S0 FAIL입니다.",
  },
  {
    stepNumber: 35,
    code: "SEC-605",
    axisId: "axis-6",
    severity: "S0",
    windowMode: "창 B (중개사 #2 로그인)",
    estimatedMinutes: 1,
    title: "공용 PC 다중 중개사 계정 전환 시 localStorage 개인정보 100% 격리",
    bugContext:
      "중개법인 공용 PC에서 중개사 #1이 쓰던 브라우저에 중개사 #2가 로그인했을 때 이전 중개사의 고객 이름·전화번호나 뉴스레터 초안이 노출되던 보안 취약점을 검증합니다.",
    quickLinks: [
      { label: "🔐 로그인 화면(/login)", href: "/login", variant: "slate" },
      { label: "💬 소통관리함(/broker/w/inbox)", href: "/broker/w/inbox", variant: "emerald" },
      { label: "📰 뉴스레터(/broker/magazine-editor)", href: "/broker/magazine-editor", variant: "indigo" },
    ],
    actionSteps: [
      "창 B(시크릿 창)에서 테스트용 **중개사 #2 계정**으로 로그인합니다 (또는 창 A에서 중개사 #1 로그아웃 후 중개사 #2로 로그인).",
      "중개사 #2 상태에서 ① [/broker/w/inbox]와 ② [/broker/magazine-editor]에 차례로 진입합니다.",
    ],
    passCriteria: [
      "중개사 #1의 고객('박매수 상무', '최자산 대표' 등)이나 중개사 #1이 작성하던 뉴스레터 제목·이슈 슬롯이 단 1건도 보이지 않고 100% 중개사 #2 본인 데이터만 표시됩니다.",
    ],
    failTrap: "타 중개사 계정의 고객명·연락처·메모가 1초라도 화면에 잔류하거나 섞여 나오면 즉시 S0 FAIL입니다.",
  },
  {
    stepNumber: 36,
    code: "SEC-606",
    axisId: "axis-6",
    severity: "S1",
    windowMode: "창 A · B 반응형(모바일)",
    estimatedMinutes: 1,
    title: "모바일 뷰포트(390×844) 반응형 탭 전환 및 가로 스크롤 깨짐 0건",
    bugContext:
      "외근 중인 중개사와 카톡 인앱 브라우저로 열람하는 매수 고객 모두 모바일 화면(390px)에서 깨짐 없이 사용할 수 있는지 최종 점검합니다.",
    quickLinks: [
      { label: "📰 뉴스레터 스튜디오", href: "/broker/magazine-editor", variant: "indigo" },
      { label: "💬 소통관리함", href: "/broker/w/inbox", variant: "emerald" },
    ],
    actionSteps: [
      "창 A 또는 창 B에서 키보드 F12(개발자 도구) → Ctrl + Shift + M(모바일 기기 툴바)을 눌러 화면 크기를 'iPhone 12/14 Pro (390 × 844)'로 맞춥니다.",
      "① 공개 뉴스레터 뷰어, ② 뉴스레터 에디터, ③ 소통관리함 3개 화면을 좌우로 흔들어 가로 스크롤 깨짐이 없는지 확인하고 모바일 탭 전환을 눌러봅니다.",
    ],
    passCriteria: [
      "3개 화면 모두 불필요한 가로 스크롤 오버플로가 0건입니다.",
      "모바일 탭 전환으로 목록·편집·미리보기 접근이 모두 가능하며, 포스트잇 글래스 카드와 월간 통계 막대그래프 라벨이 겹치거나 잘리지 않습니다.",
    ],
    failTrap: "모바일 폭에서 카드 텍스트가 화면 밖으로 잘려 나가거나 버튼이 겹쳐 클릭할 수 없으면 S1 FAIL입니다.",
  },
];
