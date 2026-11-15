/**
 * @file src/lib/qa/round2-verification-data.ts
 * @description v5.0 Round-2 AI-Human Collaborative QA SSOT.
 *   1) ROUND1_REMEDIATION_28_ITEMS (R1-01 ~ R1-28): Maps the 1st-round 33-slide tester feedback
 *      to the #2ce0ae24 remediation changes and 1-click verification links.
 *   2) ROUND2_CORE_MISSIONS_6 (R2-M1 ~ R2-M6): Focused regression + real-device mobile missions.
 *
 * Pure TypeScript module (zero Node/DB imports; safe for client, server, and Vitest).
 * Strict CRE Lexicon compliance: 임대수익용 / 사옥용 / 신축·개발용 ONLY.
 */

export type Round1Area = "showcase" | "hub_workspace";

export interface Round1RemediationItem {
  id: string;
  area: Round1Area;
  slideRef: string;
  issueSummary: string;
  fixApplied: string;
  verifyHref: string;
  relatedScenarioIds: readonly string[];
}

export interface Round2MissionItem {
  id: string;
  order: number;
  title: string;
  targetMin: number;
  mandatoryEveryCycle: boolean;
  targetHref: string;
  observationPoint: string;
  passCriteria: string;
  sampleMemo?: string;
  sampleKitZipHref?: string;
  sampleKitCsvHref?: string;
}

export const QA_TESTER_SHOWCASE_SESSION_ID = "qa-output-showcase-tester-r2" as const;
export const QA_TESTER_SIGNOFF_SESSION_ID = "qa-signoff-tester-r2" as const;
export const QA_BROKER_SHOWCASE_SESSION_ID = "qa-output-showcase-broker" as const;
export const QA_BROKER_SIGNOFF_SESSION_ID = "qa-signoff-broker" as const;
export const QA_ROUND2_WORKBENCH_ID = "qa-tester-round2-v5" as const;

export const ROUND1_REMEDIATION_28_ITEMS: readonly Round1RemediationItem[] = [
  // ── 쇼룸 16건 (R1-01 ~ R1-16) ──────────────────────────────────────────────
  {
    id: "R1-01",
    area: "showcase",
    slideRef: "쇼룸 #01~02",
    issueSummary: "목록 [간단히|자세히] 및 우측 탭 버튼이 컨테이너 박스 밖으로 넘침",
    fixApplied: "모바일·태블릿 플렉스 줄바꿈 및 고정 높이 제거, 44px 터치 타깃 내 정렬 정리",
    verifyHref: "/qa-tester/showcase?tab=newsletter",
    relatedScenarioIds: ["NL-D1", "NL-D2", "NL-W1", "NL-W2", "NL-M1", "NL-M2"],
  },
  {
    id: "R1-02",
    area: "showcase",
    slideRef: "쇼룸 #03",
    issueSummary: "카드·배지 모서리가 과도하게 둥글어 B2B 금융·부동산 톤과 이질적임",
    fixApplied: "B2B 실무 표준 8px 곡률 토큰 및 단정한 보더 계층으로 전체 톤 정비",
    verifyHref: "/qa-tester/showcase?tab=dealcard",
    relatedScenarioIds: ["NL-M1", "DC-01", "IM-01"],
  },
  {
    id: "R1-03",
    area: "showcase",
    slideRef: "쇼룸 #04",
    issueSummary: "페이지마다 브라우저 탭 제목(<title>)이 동일해 다중 창 전환 시 혼선",
    fixApplied: "쇼룸·허브·포털별 고유 한국어 메타데이터 <title> 분리 적용",
    verifyHref: "/qa-tester/showcase?tab=im",
    relatedScenarioIds: ["NL-D1", "DC-01", "IM-01"],
  },
  {
    id: "R1-04",
    area: "showcase",
    slideRef: "쇼룸 #05",
    issueSummary: "쇼룸 글자 크기(21px) 토글 시 검수 페이지 헤더까지 함께 커지던 문제",
    fixApplied: "부모 쇼룸 창은 표준 크기로 고정하고 하단 390px 미리보기 iframe 내부만 격리 확대",
    verifyHref: "/qa-tester/showcase?tab=newsletter&case=NL-D1",
    relatedScenarioIds: [
      "NL-D1",
      "NL-D2",
      "NL-W1",
      "NL-W2",
      "NL-M1",
      "NL-M2",
      "DC-01",
      "IM-01",
    ],
  },
  {
    id: "R1-05",
    area: "showcase",
    slideRef: "쇼룸 #06~07",
    issueSummary: "매거진 카톡 공유 OG 카드 정보 밀도가 낮고 시인성이 부족함",
    fixApplied: "핵심 헤드라인·3대 시장 지표·추천 매물 요약 3요소 OG 카드로 개편",
    verifyHref: "/qa-tester/showcase?tab=newsletter&case=NL-M1",
    relatedScenarioIds: ["NL-D1", "NL-D2", "NL-W1", "NL-W2", "NL-M1", "NL-M2"],
  },
  {
    id: "R1-06",
    area: "showcase",
    slideRef: "쇼룸 #08",
    issueSummary: "매거진 모바일 본문 흐린 회색 글씨로 70대 독자 가독성 저하",
    fixApplied: "고대비 슬레이트 톤 상향 및 행간·문단 여백 확대로 시니어 가독성 강화",
    verifyHref: "/qa-tester/showcase?tab=newsletter&case=NL-M2",
    relatedScenarioIds: ["NL-W1", "NL-W2", "NL-M1", "NL-M2"],
  },
  {
    id: "R1-07",
    area: "showcase",
    slideRef: "쇼룸 #09",
    issueSummary: "뉴스레터 6종 발행일(issueDate) 중복으로 동일 호가 열리던 혼선",
    fixApplied: "6종 시나리오별 2026-10-xx 고유 날짜 매핑 및 1:1 발행 URL 분리",
    verifyHref: "/qa-tester/showcase?tab=newsletter&case=NL-D2",
    relatedScenarioIds: ["NL-D1", "NL-D2", "NL-W1", "NL-W2", "NL-M1", "NL-M2"],
  },
  {
    id: "R1-08",
    area: "showcase",
    slideRef: "쇼룸 #10~11",
    issueSummary: "딜카드·IM 카카오톡 공유 og:description에 SaaS 홍보 문구 노출",
    fixApplied: "SaaS 광고 문구 전면 제거 후 권역·면적·포스처(임대수익용 등) 중심 실매물 요약 출력",
    verifyHref: "/qa-tester/showcase?tab=dealcard&case=DC-06",
    relatedScenarioIds: [
      "DC-01",
      "DC-02",
      "DC-06",
      "DC-08",
      "IM-01",
      "IM-06",
      "IM-08",
    ],
  },
  {
    id: "R1-09",
    area: "showcase",
    slideRef: "쇼룸 #12",
    issueSummary: "공개 뷰어(/dc, /im-lite, /magazine) 내 무반응 다크모드(🌙) 버튼 잔존",
    fixApplied: "매수 고객 공개 화면에서 무반응 다크모드 버튼 제거 및 라이트 톤 고정",
    verifyHref: "/qa-tester/showcase?tab=dealcard&case=DC-01",
    relatedScenarioIds: ["NL-M1", "DC-01", "DC-02", "IM-01"],
  },
  {
    id: "R1-10",
    area: "showcase",
    slideRef: "쇼룸 #13",
    issueSummary: "DC-03 공실 포함 다층 임차 구성에서 공실 임대료 문구 및 블라인드 누출 우려",
    fixApplied: "공실 호실 0원 깔끔 표기 및 민감 상호·지번 블라인드 자동 마스킹 강화",
    verifyHref: "/qa-tester/showcase?tab=dealcard&case=DC-03",
    relatedScenarioIds: ["DC-03"],
  },
  {
    id: "R1-11",
    area: "showcase",
    slideRef: "쇼룸 #14",
    issueSummary: "DC-06 '2,000억 · 4,313평' 콤마 포함 숫자가 쉼표 앞에서 잘려 10억 미만으로 오파싱",
    fixApplied: "메모 파서 콤마 숫자 정규식 복구로 2,000~2,050억 · 4,313평 정확 추출",
    verifyHref: "/qa-tester/showcase?tab=dealcard&case=DC-06",
    relatedScenarioIds: ["DC-06"],
  },
  {
    id: "R1-12",
    area: "showcase",
    slideRef: "쇼룸 #15",
    issueSummary: "DC-08 가격 미입력 시 '0억' 또는 어색한 단위 줄바꿈 노출",
    fixApplied: "'가격 협의' 1줄 B2B 표준 폴백 적용 및 불필요 괄호 제거",
    verifyHref: "/qa-tester/showcase?tab=dealcard&case=DC-08",
    relatedScenarioIds: ["DC-08"],
  },
  {
    id: "R1-13",
    area: "showcase",
    slideRef: "쇼룸 #16",
    issueSummary: "IM 시나리오 전환 후에도 이전 '1장씩'·'split' 모드가 남아 전체 조망이 불편함",
    fixApplied: "대분류·시나리오 전환 시 항상 [PPTX 전 슬라이드 한눈에(grid)] 및 슬라이드 01로 초기화",
    verifyHref: "/qa-tester/showcase?tab=im&case=IM-02",
    relatedScenarioIds: [
      "IM-01",
      "IM-02",
      "IM-03",
      "IM-04",
      "IM-05",
      "IM-06",
      "IM-07",
      "IM-08",
    ],
  },
  {
    id: "R1-14",
    area: "showcase",
    slideRef: "쇼룸 #17",
    issueSummary: "PPTX 슬라이드 썸네일을 한 번 클릭해 크게 확대(Lightbox)할 수 없던 불편",
    fixApplied: "슬라이드 이미지·버튼 클릭 시 전체화면 Lightbox 모달 및 좌우 키보드 이동 지원",
    verifyHref: "/qa-tester/showcase?tab=im&case=IM-01",
    relatedScenarioIds: ["IM-01", "IM-02", "IM-06", "IM-07"],
  },
  {
    id: "R1-15",
    area: "showcase",
    slideRef: "쇼룸 #18",
    issueSummary: ".pptx 다운로드 버튼 클릭 후 생성 대기 중 무반응처럼 보이던 UX",
    fixApplied: "다운로드 즉시 '생성 중...' 상태 배너 및 완료·오류 알림(aria-live) 표출",
    verifyHref: "/qa-tester/showcase?tab=im&case=IM-01",
    relatedScenarioIds: ["IM-01", "IM-06", "IM-08"],
  },
  {
    id: "R1-16",
    area: "showcase",
    slideRef: "쇼룸 #19",
    issueSummary: "IM 8종 대형 렌트롤(21호실)·스태킹 차트·지적도 필지 경계 가독성 보완 요청",
    fixApplied: "IM-06/IM-07 대형 렌트롤 TSV 파서·자동 보간 및 지적도/수익률 하단 수치 정렬 정비",
    verifyHref: "/qa-tester/showcase?tab=im&case=IM-07",
    relatedScenarioIds: ["IM-05", "IM-06", "IM-07", "IM-08"],
  },

  // ── 허브·작업실 12건 (R1-17 ~ R1-28) ──────────────────────────────────────
  {
    id: "R1-17",
    area: "hub_workspace",
    slideRef: "작업실 #20",
    issueSummary: "모바일(390px) /broker 홈 상단 헤더 메뉴 줄바꿈 겹침 및 가로 스크롤 발생",
    fixApplied: "모바일 셸 상단 헤더 반응형 정리 및 overflow-x 차단 적용",
    verifyHref: "/broker?qa=1&qaRole=tester",
    relatedScenarioIds: [],
  },
  {
    id: "R1-18",
    area: "hub_workspace",
    slideRef: "작업실 #21~22",
    issueSummary: "딜카드 마지막 1건 삭제 시 빈 상태가 어색하거나 새 카드 초기 진입이 매끄럽지 않음",
    fixApplied: "마지막 카드 삭제 시 깔끔한 초기화 토스트 및 ?fresh=1 즉시 작성 상태 보장",
    verifyHref: "/broker/w/dealcards?qa=1&qaRole=tester&fresh=1",
    relatedScenarioIds: [],
  },
  {
    id: "R1-19",
    area: "hub_workspace",
    slideRef: "작업실 #23",
    issueSummary: "/broker/profile 저장·변경 버튼 클릭 시 시각적 반응이 미약함",
    fixApplied: "버튼 클릭 피드백·저장 완료 토스트 및 연락처 하이픈 포맷팅 적용",
    verifyHref: "/broker/profile?qa=1&qaRole=tester",
    relatedScenarioIds: [],
  },
  {
    id: "R1-20",
    area: "hub_workspace",
    slideRef: "허브 #24",
    issueSummary: "M1 지시문 용어('4개 작업실' 등)가 실제 화면 버튼명과 달라 찾기 어려움",
    fixApplied: "내부 용어 제거 및 실제 UI 버튼명('[1. 딜카드] → [메모로 딜카드 생성하기]') 100% 일치화",
    verifyHref: "/broker/w/dealcards?qa=1&qaRole=tester",
    relatedScenarioIds: [],
  },
  {
    id: "R1-21",
    area: "hub_workspace",
    slideRef: "허브 #25",
    issueSummary: "M3 뉴스레터·M5 글자크기 지시어와 실제 에디터 단계 라벨 불일치",
    fixApplied: "실화면 라벨([① 제목]·[② 내용]·[③ 보내기], [아주 크게])로 안내문 전면 교체",
    verifyHref: "/broker/magazine-editor?qa=1&qaRole=tester",
    relatedScenarioIds: [],
  },
  {
    id: "R1-22",
    area: "hub_workspace",
    slideRef: "허브 #26~27",
    issueSummary: "M2 사진·렌트롤, M4 고객 연락처 샘플 파일이 없어 테스터가 직접 만들어야 했음",
    fixApplied: "인앱 샘플 키트(/api/public/qa-sample-kit .zip / UTF-8 BOM .csv) 원클릭 다운로드 구현",
    verifyHref: "/api/public/qa-sample-kit",
    relatedScenarioIds: [],
  },
  {
    id: "R1-23",
    area: "hub_workspace",
    slideRef: "작업실 #28",
    issueSummary: "고객 전화번호 숫자만 입력 시 하이픈(-)이 자동 삽입되지 않음",
    fixApplied: "010·02·지역번호 자동 하이픈 포맷터(formatKrPhoneInput) 소통함·프로필 전역 적용",
    verifyHref: "/broker/w/inbox?qa=1&qaRole=tester",
    relatedScenarioIds: [],
  },
  {
    id: "R1-24",
    area: "hub_workspace",
    slideRef: "작업실 #29",
    issueSummary: "매거진·공유 링크 열람 후 소통함 고객별 '열람' 배지 숫자가 올라가지 않던 누락",
    fixApplied: "/magazine?sid=... 열람 트래킹 API 연동으로 시크릿창 접속 시 즉시 열람 반영",
    verifyHref: "/broker/w/inbox?qa=1&qaRole=tester",
    relatedScenarioIds: [],
  },
  {
    id: "R1-25",
    area: "hub_workspace",
    slideRef: "작업실 #30",
    issueSummary: "M7 PC→모바일 이어쓰기 시 최근 작업 초안이 샘플 목록 아래로 묻히던 불편",
    fixApplied: "동일 계정 다른 기기 진입 시 최신 수정 초안을 목록 최상단 우선 노출로 정렬 개선",
    verifyHref: "/broker/w/im?qa=1&qaRole=tester",
    relatedScenarioIds: [],
  },
  {
    id: "R1-26",
    area: "hub_workspace",
    slideRef: "핀 위젯 #31",
    issueSummary: "모바일에서 검수 핀 버튼이 하단 저장·네비게이션 버튼을 가리거나 배경 대비가 약함",
    fixApplied: "라이트 테마 고대비 락 및 모바일 하단 여백(bottom-24 sm:bottom-5) 안전 배치",
    verifyHref: "/broker/w/dealcards?qa=1&qaRole=tester",
    relatedScenarioIds: [],
  },
  {
    id: "R1-27",
    area: "hub_workspace",
    slideRef: "핀 위젯 #32",
    issueSummary: "핀 등록 전 캡처된 대상 영역이 안 보이고, 허브 목록에서도 스크린샷이 안 보이던 문제",
    fixApplied: "[🎯 요소 찍기] 빨간 박스 프리뷰 즉시 생성 + 허브 인라인 썸네일 & Lightbox 확대 구현",
    verifyHref: "/qa-tester/signoff?qa=1",
    relatedScenarioIds: [],
  },
  {
    id: "R1-28",
    area: "hub_workspace",
    slideRef: "허브 #33",
    issueSummary: "운영 서버 핀/결과 저장 권한(401)과 카톡 요약 3줄 보고 절차 개선 요청",
    fixApplied: "QA 액세스 키 자동 URL 동기화 + 단일 서버 제출 + 카톡 3줄 요약 자동 복사 탑재",
    verifyHref: "/qa-tester/signoff?qa=1",
    relatedScenarioIds: [],
  },
] as const;

export const ROUND2_CORE_MISSIONS_6: readonly Round2MissionItem[] = [
  {
    id: "R2-M1",
    order: 1,
    title: "딜카드 콤마 숫자 파싱(2,000억 · 4,313평) & 마지막 카드 삭제 초기화",
    targetMin: 3,
    mandatoryEveryCycle: false,
    targetHref: "/broker/w/dealcards?qa=1&qaRole=tester&fresh=1",
    observationPoint:
      "아래 [표준 매물 메모 복사]를 붙여넣었을 때 '2,000~2,050억' · '4,313평'이 쉼표 앞에서 잘리지 않고 카톡 카드 4칸에 정확히 뜨는지, 마지막 1건을 지웠을 때 안내 토스트와 함께 깔끔히 초기화되는지 확인해 주세요.",
    passCriteria:
      "카톡 미리보기 4칸에 '강남구 삼성동 · 임대수익용 · 4,313평 · 2,000~2,050억' 범위가 누락 없이 표시되고, 삭제 시 오류가 없어야 합니다.",
    sampleMemo:
      "강남구 삼성동 143-8 코너 빌딩 / 매각가 2,000억 / 대지 520평 연면적 4,313평 / 보증금 45억 월세 3.2억 / 임대수익용 핵심 매물",
  },
  {
    id: "R2-M2",
    order: 2,
    title: "샘플 키트(.zip / .csv) 다운로드 → IM 사진·렌트롤 업로드 → .pptx 실물 열기",
    targetMin: 5,
    mandatoryEveryCycle: false,
    targetHref: "/broker/w/im?qa=1&qaRole=tester",
    observationPoint:
      "아래 샘플 키트(.zip 또는 .csv)를 내려받아 IM 작업실에 사진 5장+렌트롤을 올리고 [.pptx 다운로드]를 눌렀을 때 진행 안내 배너와 실제 PPTX 파일이 깨짐 없이 열리는지 확인해 주세요.",
    passCriteria:
      "한글 CSV가 엑셀/웹에서 깨지지 않고(.zip 내 5장 사진 포함), 생성된 .pptx가 정상 열림 + 다운로드 중 배너가 즉시 표출됩니다.",
    sampleKitZipHref: "/api/public/qa-sample-kit",
    sampleKitCsvHref: "/api/public/qa-sample-kit?format=csv",
  },
  {
    id: "R2-M3",
    order: 3,
    title: "전화번호 자동 하이픈(010-2548-2548) & ?sid= 시크릿창 열람 배지 연동",
    targetMin: 3,
    mandatoryEveryCycle: false,
    targetHref: "/broker/w/inbox?qa=1&qaRole=tester",
    observationPoint:
      "소통함 고객 등록 시 '01025482548'을 입력하면 '010-2548-2548'로 자동 치환되는지, [인사말 + 링크 복사]로 만든 URL(?sid= 포함)을 시크릿 창에서 열었을 때 고객 상태가 '미열람 → 열람'으로 바뀌는지 확인해 주세요.",
    passCriteria:
      "숫자만 입력해도 즉시 하이픈이 삽입되고, 시크릿 창 열람 후 새로고침하면 열람 배지 카운트가 1 이상 증가합니다.",
  },
  {
    id: "R2-M4",
    order: 4,
    title: "[필수] 기기 간 이어쓰기(PC→스마트폰 최상단) & 390px '아주 크게' 가로 넘침 0px",
    targetMin: 3,
    mandatoryEveryCycle: true,
    targetHref: "/broker/w/im?qa=1&qaRole=tester",
    observationPoint:
      "PC에서 IM 표지 제목을 입력·저장한 뒤 스마트폰(또는 다른 브라우저) 동일 계정으로 열었을 때 샘플보다 맨 위에 방금 초안이 바로 뜨는지, 상단 메뉴 4곳에서 글자 [아주 크게] 시 가로 밀림이 없는지 확인해 주세요.",
    passCriteria:
      "PC 마지막 입력 문구가 스마트폰 목록 최상단에 바로 복원되고, 390px 화면에서 좌우 스크롤이나 글자 잘림이 0건입니다.",
  },
  {
    id: "R2-M5",
    order: 5,
    title: "현장 검수 핀(📌) 빨간 박스 미리보기 & 테스터 허브 인라인 썸네일 확인",
    targetMin: 3,
    mandatoryEveryCycle: false,
    targetHref: "/broker/w/dealcards?qa=1&qaRole=tester",
    observationPoint:
      "작업실 왼쪽 아래 [📌 화면 검수 메모] → [🎯 요소 찍기]를 눌렀을 때 핀 창 안 미리보기에 빨간 테두리 캡처가 뜨는지, 하단 저장 버튼을 가리지 않는지, 저장 후 이 허브 하단 핀 목록에서 확대 보기가 되는지 확인해 주세요.",
    passCriteria:
      "작성자 역할이 '일반 테스터(고정)'로 잠겨 있고, 등록한 핀의 캡처 썸네일이 즉시 노출되어 클릭 시 Lightbox로 확대됩니다.",
  },
  {
    id: "R2-M6",
    order: 6,
    title: "[필수] 실제 스마트폰 카카오톡 OG 카드(DC-06 · DC-08 · NL-M1) 실물 확인",
    targetMin: 3,
    mandatoryEveryCycle: true,
    targetHref: "/qa-tester/showcase?tab=dealcard&case=DC-06",
    observationPoint:
      "쇼룸에서 DC-06(2,000억), DC-08(가격 협의), NL-M1(월간호)의 [새 창에서 실화면 열기] 주소를 본인 카카오톡 '나와의 채팅방'에 붙여넣어 실제 카톡 OG 썸네일·설명문을 눈으로 확인해 주세요.",
    passCriteria:
      "카톡 미리보기 설명문(og:description)에 SaaS 홍보 문구 없이 매물/시장 요약만 표시되고, 390px 인앱 브라우저에서도 버튼이 정상 동작합니다.",
  },
] as const;

export function getRound1ItemsForScenario(
  caseId: string
): readonly Round1RemediationItem[] {
  return ROUND1_REMEDIATION_28_ITEMS.filter((item) =>
    item.relatedScenarioIds.includes(caseId)
  );
}
