/**
 * @file src/lib/testguide/qa-signoff-fasttrack-data.ts
 * @description 20-minute Human Fast-Track Sign-Off Checklist (Track B).
 *   Pairs with 1-Click AI Auto-Probe & In-App QA Feedback Pins on /qa-signoff.
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
