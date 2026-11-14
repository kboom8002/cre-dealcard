/**
 * @file src/lib/testguide/qa-signoff-fasttrack-data.ts
 * @description Role-separated AI -> Human Tester -> Tue/Thu Broker Collaborative QA SSOT.
 *   Preserves legacy 20-minute Fast-Track checklist (`FASTTRACK_STEPS`) and adds
 *   Tester Missions (`TESTER_MISSIONS_8`), Broker Readiness Gate (`BROKER_READINESS_GATE_6`),
 *   Tue/Thu Broker Sessions (`BROKER_SESSIONS_4`), and 6-item Broker Rubric (`BROKER_RUBRIC_6`).
 */

export type FastTrackStatus = "pending" | "pass" | "fail";

export interface FastTrackStep {
  id: string;
  order: number;
  title: string;
  workspaceLabel: string;
  targetHref: string;
  durationMin: number;
  checklist: string[];
  visualOracle: string;
  severityOnFail: "S0" | "S1";
}

export interface FastTrackRecord {
  status: FastTrackStatus;
  memo: string;
  updatedAt?: string;
}

export const QA_SIGNOFF_WORKBENCH_ID = "qa-signoff-fasttrack-v1";
export const QA_TESTER_MISSIONS_WORKBENCH_ID = "qa-tester-missions-v2";
export const QA_BROKER_SESSION_WORKBENCH_ID = "qa-broker-session-v2";

export const FASTTRACK_STEPS: FastTrackStep[] = [
  {
    id: "FT-01",
    order: 1,
    title: "① 딜카드 · 메모 우선 생성 & 블라인드·사전안내 검증",
    workspaceLabel: "딜카드 작업실 열기 (?qa=1)",
    targetHref: "/broker/w/dealcards?qa=1",
    durationMin: 3,
    checklist: [
      "[+ 새 딜카드 만들기] 클릭 시 우측 미리보기가 '미리보기 생성 전' 카드로 표시되는지 확인",
      "지번·상호(예: 189-6, 스타벅스, 010-1234-5678) 포함 메모 입력 후 카톡 말풍선에 비공개 정보가 숨겨지는지 확인",
      "카톡 4칸 카드(권역·용도·면적·가격) 클릭 시 왼쪽 입력칸으로 바로 이동·포커스되는지 확인",
    ],
    visualOracle:
      "오른쪽 카톡 말풍선 4칸에 정확한 구/동·용도·면적·가격대만 보이고 번지·전화번호·상호가 보이지 않아야 함",
    severityOnFail: "S0",
  },
  {
    id: "FT-02",
    order: 2,
    title: "② IM 작업실 · 4단계 작성, 공유 링크 & PPTX 지적도·수익률 검증",
    workspaceLabel: "IM 작업실 열기 (?qa=1)",
    targetHref: "/broker/w/im?qa=1",
    durationMin: 5,
    checklist: [
      "지번 조회(예: 동교동 189-6 또는 당산동1가 72-1) 후 공시지가·토지이용·매각요청가가 자동 반영되는지 확인",
      "공유 링크 발급 후 수정 시 '고객 화면 반영 전' 경고가 뜨고 재발행 시 즉시 사라지는지 확인",
      "PPTX IM 생성/미리보기에서 05 토지 정보 본건 필지 경계 표시와 07 수익률 하단 3대 지표 가독성을 육안 확인",
    ],
    visualOracle:
      "지적도 본건 필지 경계 색상과 수익률 합산 바 숫자가 또렷하게 보이며 겹치는 글자가 없어야 함",
    severityOnFail: "S0",
  },
  {
    id: "FT-03",
    order: 3,
    title: "③ 뉴스레터 · 월간/격주/일간 전환 & 발행본 독자 화면 검증",
    workspaceLabel: "뉴스레터 에디터 열기 (?qa=1)",
    targetHref: "/broker/magazine-editor?qa=1",
    durationMin: 4,
    checklist: [
      "목록과 입력 화면에서 카드 요약·기사 항목을 눌렀을 때 해당 편집 칸이 즉시 펼쳐지는지 확인",
      "월간호 그래프·문장이 어색한 끊김 없이 완결된 한국어 비즈니스 문체로 보이는지 확인",
      "발행 후 공개 링크(/magazine/...)에서 중개사 이름·전화번호와 비공개 주소 보호 상태를 확인",
    ],
    visualOracle:
      "모바일 390px 화면에서도 뉴스레터 본문과 차트·구독 버튼이 가로 스크롤 없이 자연스럽게 읽혀야 함",
    severityOnFail: "S1",
  },
  {
    id: "FT-04",
    order: 4,
    title: "④ 소통관리함 · 열람 요청 승인/거절, 상담 기록 & 링크 잠금 검증",
    workspaceLabel: "소통관리함 열기 (?qa=1)",
    targetHref: "/broker/w/inbox?qa=1",
    durationMin: 3,
    checklist: [
      "오른쪽 '열람 횟수' 카드를 눌렀을 때 왼쪽 [기록] 탭과 통화 메모 입력창으로 바로 이동하는지 확인",
      "열람 대기 고객의 [자료 보내기(승인)] 및 [보낸 링크 잠그기] 인라인 확인이 오류 없이 동작하는지 확인",
      "링크 잠금 후 해당 링크 접속 시 열람이 차단되는지 확인",
    ],
    visualOracle:
      "할 일/열람/전체 고객 탭과 오른쪽 요약 카드에서 잘리거나 작은 버튼 없이 한눈에 조작되어야 함",
    severityOnFail: "S0",
  },
  {
    id: "FT-05",
    order: 5,
    title: "⑤ 60대 시니어 UX 물리 감수 · 글자 '매우 크게' & 모바일 390px 확인",
    workspaceLabel: "글자 크게 모드 점검 (?qa=1)",
    targetHref: "/broker/w/dealcards?qa=1",
    durationMin: 3,
    checklist: [
      "상단 글자 크기 토글을 '매우 크게'로 바꿨을 때 탭·버튼 글씨가 잘리거나 겹치지 않는지 확인",
      "모든 화면의 중요 버튼이 엄지손가락으로 누르기 충분한 높이(44px 이상)인지 체감 확인",
      "불편한 UI를 발견하면 왼쪽 아래 [📌 화면 검수 핀] → [🎯 요소 찍기]로 바로 핀 등록",
    ],
    visualOracle:
      "작은 흐린 회색 글씨나 가로 넘침 없이 모든 안내 문구와 버튼이 또렷해야 함",
    severityOnFail: "S1",
  },
  {
    id: "FT-06",
    order: 6,
    title: "⑥ 최종 상용화 출시 판정 (AI 불변식 + 인간 5단계 + 핀 0건 확인)",
    workspaceLabel: "정밀 체크리스트(선택)",
    targetHref: "/dealcard-im-test",
    durationMin: 2,
    checklist: [
      "상단 [⚡ 1클릭 AI 자동 불변식 점검] 4대 항목이 모두 '통과'인지 확인",
      "아래 '현장 검수 핀(📌)' 목록에 해결되지 않은 긴급(S0) 결함이 남아 있지 않은지 확인",
      "전체 코멘트를 작성하고 [최종 출시 승인 제출] 버튼을 눌러 기록 확정",
    ],
    visualOracle:
      "AI 자동 점검 4/4 통과 및 FT-01~FT-05 모두 PASS일 때 최종 GO 판정 가능",
    severityOnFail: "S0",
  },
];

// ── Track 2: 일반 테스터 미션 8종 & 중개인 준비 완료 게이트 6조건 ─────────────

export interface TesterMissionItem {
  id: string;
  title: string;
  targetMin: number;
  mandatoryEveryCycle: boolean;
  targetHref: string;
  observationPoint: string;
}

export const TESTER_MISSIONS_8: readonly TesterMissionItem[] = [
  {
    id: "M1",
    title: "첫 로그인 → 메모로 딜카드 만들기 → 카톡 공유",
    targetMin: 5,
    mandatoryEveryCycle: false,
    targetHref: "/broker/w/dealcards?qa=1",
    observationPoint: "도움 없이 첫 버튼을 찾는 데 걸리는 시간과 지번 블라인드 이해 여부",
  },
  {
    id: "M2",
    title: "아이폰 사진 5장(HEIC 포함) + 엑셀 렌트롤로 IM 만들고 공유",
    targetMin: 15,
    mandatoryEveryCycle: false,
    targetHref: "/broker/w/im?qa=1",
    observationPoint: "업로드 중 대기 불안감, HEIC 자동 변환 성공 여부 및 PPTX 다운로드 확인",
  },
  {
    id: "M3",
    title: "월간 뉴스레터: 제목 고르기 → 브리핑 2줄 입력 → AI 다듬기 → 발행 → 독자 화면",
    targetMin: 10,
    mandatoryEveryCycle: false,
    targetHref: "/broker/magazine-editor?qa=1",
    observationPoint: "미리보기 클릭 → 왼쪽 편집 위치 이동 직관성과 상단 통계 2선 가독성",
  },
  {
    id: "M4",
    title: "소통함: 고객 등록(이메일·근거) → 인사말+링크 복사 → 이메일 발송 → 두 번째 폰 열람",
    targetMin: 3,
    mandatoryEveryCycle: false,
    targetHref: "/broker/w/inbox?qa=1",
    observationPoint: "이메일 실제 수신 화면과 두 번째 폰 열람 후 고객별 반응 배지 증가 신뢰성",
  },
  {
    id: "M5",
    title: "글자 '아주 크게'로 4개 작업실 전체 둘러보기",
    targetMin: 5,
    mandatoryEveryCycle: false,
    targetHref: "/broker/w/dealcards?qa=1",
    observationPoint: "작은 글씨, 버튼 줄바꿈 깨짐, 모바일 가로 넘침 여부",
  },
  {
    id: "M6",
    title: "[필수] 작성 중 새로고침 · 뒤로가기 · 와이파이 끄기 후 내용 보존 확인",
    targetMin: 5,
    mandatoryEveryCycle: true,
    targetHref: "/broker/w/im?qa=1",
    observationPoint: "서버리스 재기동 또는 새로고침 후 입력한 메모·수정 내용이 유실되지 않는지",
  },
  {
    id: "M7",
    title: "[필수] PC에서 작성하던 초안을 휴대폰에서 열어 이어 쓰기",
    targetMin: 5,
    mandatoryEveryCycle: true,
    targetHref: "/broker/magazine-editor?qa=1",
    observationPoint: "기기 간 저장 동기화 지연·충돌 여부",
  },
  {
    id: "M8",
    title: "무료 계정으로 알림톡 버튼 누르기 → 업그레이드 안내 이해 (실발송 금지)",
    targetMin: 2,
    mandatoryEveryCycle: false,
    targetHref: "/broker/w/inbox?qa=1",
    observationPoint: "거부감 없는 유료 전환 안내 인지 여부 및 실발송 없이 드라이런 유지 확인",
  },
] as const;

export interface ReadinessGateItem {
  id: string;
  label: string;
  ownerLabel: string;
}

export const BROKER_READINESS_GATE_6: readonly ReadinessGateItem[] = [
  {
    id: "RG-01",
    label: "자동 게이트(tsc · Vitest · 빌드 · 골든 E2E · UX 물리 위반 0) 통과",
    ownerLabel: "AI",
  },
  {
    id: "RG-02",
    label: "실제 사이트(credeal.net)에서 패키지의 모든 링크와 미리보기·OG가 정상 열림",
    ownerLabel: "AI",
  },
  {
    id: "RG-03",
    label: "직전 미팅 요구사항(BR) 전부에 상태 표시(완료/일부/보류 + 사유)",
    ownerLabel: "AI",
  },
  {
    id: "RG-04",
    label: "테스터 리허설 패스 완료 및 막힘(blocker) 0건 확인",
    ownerLabel: "테스터",
  },
  {
    id: "RG-05",
    label: "실제 화면 하단 빌드 번호(#SHA)와 패키지에 적힌 빌드 번호 일치 확인",
    ownerLabel: "AI·테스터",
  },
  {
    id: "RG-06",
    label: "중개인 세션 24시간 전까지 테스트·피드백 요청 패키지 전달 완료",
    ownerLabel: "AI",
  },
] as const;

// ── Track 3: 중개인 1인 회차 패키지 (화 · 목 확정 일정) ───────────────────────

export interface BrokerExpertTask {
  id: string;
  title: string;
  promptQuestion: string;
  targetHref: string;
}

export interface BrokerSessionSpec {
  id: "S1" | "S2" | "S3" | "S4";
  label: string;
  weekdayLabel: string;
  cycleNote: string;
  focusTitle: string;
  tasks: readonly BrokerExpertTask[];
  agendaItems: readonly string[];
}

export const BROKER_SESSIONS_4: readonly BrokerSessionSpec[] = [
  {
    id: "S1",
    label: "1회차 · 화요일",
    weekdayLabel: "화",
    cycleNote: "0주차 준비 완료 → 화요일 첫 점검 (뉴스레터 5단 개편)",
    focusTitle: "월간 뉴스레터 5단 구성 · 70대 문체 · 상단 통계 2선 판정",
    tasks: [
      {
        id: "S1-T1",
        title: "월간호 제목 프리셋 · 시장브리핑 5줄 AI 윤문 확인",
        promptQuestion:
          "브리핑 소제목 없이 1~3줄 입력 → AI 윤문된 5줄 브리핑과 제목 프리셋을 70대 매수 고객에게 그대로 보내실 수 있나요?",
        targetHref: "/broker/magazine-editor?qa=1",
      },
      {
        id: "S1-T2",
        title: "이슈 카드(번호 소제목 제거 · 70대 평어) 및 월간 상단 통계 2선(옵션 A)",
        promptQuestion:
          "상단 '국토부 통건물 실거래 중앙값 + 한국은행 대출금리 vs 기대수익률' 그래프 2건과 이슈 5선 문체가 매수자에게 설득력이 있나요?",
        targetHref: "/broker/magazine-editor?qa=1",
      },
      {
        id: "S1-T3",
        title: "모바일 발행 독자 화면(하단 구독만 남김) 열람 확인",
        promptQuestion:
          "카톡으로 받은 휴대폰 화면에서 하단이 깔끔해졌고 내 이름·연락처가 신뢰감 있게 보이나요?",
        targetHref: "/broker/magazine-editor?qa=1",
      },
    ],
    agendaItems: [
      "월간 통계 2선 옵션 A 유지 vs 금액대별 비중(옵션 B) 선호 결정",
      "상용화 전 반드시 고쳐야 할 Top 5 우선순위 합의",
      "목요일(2회차)용 두 번째 실매물 자료 확인",
    ],
  },
  {
    id: "S2",
    label: "2회차 · 목요일",
    weekdayLabel: "목",
    cycleNote: "화→목 1.5일 단기 보완 사이클 (문구·수정 확인 중심)",
    focusTitle: "실매물 IM 수치·지적도·수익률 & Basic PPTX 품격 판정",
    tasks: [
      {
        id: "S2-T1",
        title: "1회차 반영 결과 1장 확인 & 사전 생성된 모바일 IM 수치 대조",
        promptQuestion:
          "대지/연면적·매매가·임대료 합계·수익률이 중개인님이 계산한 숫자와 일치하고 고객에게 믿고 보여줄 수 있나요?",
        targetHref: "/broker/w/im?qa=1",
      },
      {
        id: "S2-T2",
        title: "Basic IM PPTX 다운로드 및 05 토지 지적도 · 07 수익률 슬라이드 검수",
        promptQuestion:
          "PPTX 파일 디자인과 지적도 필지 경계, 수익률 페이지 설명이 내 이름으로 법인·자산가에게 보낼 품격인가요?",
        targetHref: "/broker/w/im?qa=1",
      },
    ],
    agendaItems: [
      "IM 가격·면적·수익률 표현 기준 확정 (취향 항목 옵션화 구분)",
      "화요일(3회차) 소통함 테스트용 실제 인사말·알림톡 예시 문구 확인",
    ],
  },
  {
    id: "S3",
    label: "3회차 · 화요일",
    weekdayLabel: "화",
    cycleNote: "목→화 4.5일 집중 고도화 사이클 (구조·기능 반영)",
    focusTitle: "딜카드 블라인드 수위 & 소통함 이메일 실발송·고객별 반응 배지",
    tasks: [
      {
        id: "S3-T1",
        title: "사전 생성된 블라인드 딜카드 공개 화면(/dc) 확인",
        promptQuestion:
          "번지·상호·연락처는 안전하게 가려졌고, 대신 권역·용도·면적·가격만 보고도 매수자가 문의하고 싶어지나요?",
        targetHref: "/broker/w/dealcards?qa=1",
      },
      {
        id: "S3-T2",
        title: "소통함 1클릭 인사말+링크 복사 및 이메일 실발송 점검",
        promptQuestion:
          "고객 이메일 등록 → 이메일 발송(실제 수신함 확인)과 1클릭 복사 인사말이 실무에서 실례 없이 자연스러운가요?",
        targetHref: "/broker/w/inbox?qa=1",
      },
      {
        id: "S3-T3",
        title: "고객별 열람 횟수·체류시간 배지 & 알림톡 4종 템플릿 문구 검토 (실발송 보류)",
        promptQuestion:
          "고객 A/B 반응 숫자를 영업 우선순위 판단에 쓸 수 있는지, 알림톡 4종 문구(드라이런)에 다듬을 곳은 없는지 확인해 주세요.",
        targetHref: "/broker/w/inbox?qa=1",
      },
    ],
    agendaItems: [
      "이메일·복사(무료) vs 카카오 알림톡(유료 Pro) 경계와 유료 전환 가치 확인",
      "알림톡 템플릿 검수 신청용 최종 문구 확정",
    ],
  },
  {
    id: "S4",
    label: "4회차 · 목요일",
    weekdayLabel: "목",
    cycleNote: "화→목 최종 마감 사이클 (전 과정 리허설 & 출시 판정)",
    focusTitle: "실매물 1건으로 한 주 영업 전 과정 완주 & 상용화 GO 판정",
    tasks: [
      {
        id: "S4-T1",
        title: "딜카드 → IM·PPTX → 뉴스레터 추천매물 수록 → 이메일 발송·반응 확인 일괄 수행",
        promptQuestion:
          "별도 안내 없이 실무 순서대로 1건 매물의 마케팅·자료 발송을 처음부터 끝까지 막힘없이 끝낼 수 있었나요?",
        targetHref: "/broker/w/dealcards?qa=1",
      },
    ],
    agendaItems: [
      "상용화 출시 최종 GO / 조건부 GO 판정",
      "유료 구독 지불 의사 및 초기 2~3인 실사용 검증 계획 합의",
    ],
  },
] as const;

export interface BrokerRubricCriterion {
  id: string;
  label: string;
  lowAnchor: string;
  highAnchor: string;
}

export const BROKER_RUBRIC_6: readonly BrokerRubricCriterion[] = [
  {
    id: "send_readiness",
    label: "① 발송 의향",
    lowAnchor: "못 보냄",
    highAnchor: "그대로 보냄",
  },
  {
    id: "number_trust",
    label: "② 수치 신뢰",
    lowAnchor: "틀림·의심",
    highAnchor: "정확·신뢰",
  },
  {
    id: "domain_terms",
    label: "③ 용어 정확도",
    lowAnchor: "어색함",
    highAnchor: "전문적·자연",
  },
  {
    id: "buyer_clarity",
    label: "④ 70대 매수자 이해도",
    lowAnchor: "어려움",
    highAnchor: "한눈에 이해",
  },
  {
    id: "brand_dignity",
    label: "⑤ 품격·디자인",
    lowAnchor: "민망함",
    highAnchor: "내 이름 걸 만함",
  },
  {
    id: "time_value",
    label: "⑥ 시간 대비 가치",
    lowAnchor: "직접이 나음",
    highAnchor: "업무시간 크게 절약",
  },
] as const;

export const BROKER_PREREQ_REQUEST_TEMPLATE = `[크리딜 1회차(화요일) 사전 자료 요청 안내]

중개인님, 다음 주 화요일 첫 테스트·피드백 세션 1시간을 가장 알차게 쓰기 위해
AI와 테스터가 미리 중개인님 실제 스타일로 초안을 만들어 두고 사전 점검하려 합니다.

바쁘시겠지만 이번 주 중 아래 자료만 전달 부탁드립니다 (고객 이름·연락처는 가명으로 바꿔 주셔도 됩니다):
1) 테스트할 실제 매물 1건 자료: 평소 쓰시는 매물 메모 1건 + 렌트롤(임대현황) 엑셀 + 건물·내부 사진 5~10장
2) 실제 쓰시는 뉴스레터/칼럼 제목 예시 3개
3) 고객에게 카톡·이메일로 자료 보낼 때 실제 쓰시는 첫 인사말 3개

전달 주시면 화요일 24시간 전까지 미리 생성된 링크·PPTX와 확인용 체크리스트 1부를 보내드리겠습니다.`;
