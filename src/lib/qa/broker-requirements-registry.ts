/**
 * @file src/lib/qa/broker-requirements-registry.ts
 * @description 중개인 요구사항 목록(BR Registry · T4) SSOT.
 *   지난 7일간 확정된 요구사항(BR-001~BR-012)을 합격 기준·편향 태그·자동 테스트 파일과 1:1로 고정합니다.
 *   (순수 클라이언트·서버 공용 모듈 — Node fs 직접 import 금지)
 */

export type BrokerRequirementBiasTag = "공통" | "취향" | "확인필요";

export type BrokerRequirementArea =
  | "newsletter"
  | "im"
  | "dealcards"
  | "inbox"
  | "workspace_ux";

export type BrokerRequirementStatus =
  | "verified"
  | "pending_broker_confirm"
  | "planned";

export interface BrokerRequirementEntry {
  id: string;
  title: string;
  sourceSession: string;
  area: BrokerRequirementArea;
  biasTag: BrokerRequirementBiasTag;
  status: BrokerRequirementStatus;
  acceptanceCriteria: string;
  defaultPolicyNote?: string;
  linkedTestFiles: readonly string[];
}

export const BROKER_REQUIREMENTS_REGISTRY: readonly BrokerRequirementEntry[] = [
  {
    id: "BR-001",
    title: "시장브리핑 별도 소제목 제거 및 1~3줄 입력 → AI 5줄(500자 이내) 윤문",
    sourceSession: "사전 요구사항 (11/14)",
    area: "newsletter",
    biasTag: "공통",
    status: "pending_broker_confirm",
    acceptanceCriteria:
      "에디터·독자 뷰어 모두 별도 '브리핑 소제목' 입력/표시가 없으며, 1~3줄 핵심 메모 입력 후 AI 윤문 시 5줄·500자 이내 비즈니스 평어로 완성된다.",
    linkedTestFiles: ["src/tests/workspace/newsletter-70s-buyer-overhaul.test.tsx"],
  },
  {
    id: "BR-002",
    title: "뉴스레터 5단 단일 구성(제목→시장브리핑→이슈→매물→연락처) 및 중복 소제목·한줄소개 제거",
    sourceSession: "사전 요구사항 (11/14)",
    area: "newsletter",
    biasTag: "공통",
    status: "pending_broker_confirm",
    acceptanceCriteria:
      "발행본이 제목 → 시장브리핑 → 핵심이슈 → 추천매물 → 중개인 연락처 순으로만 렌더링되며, 중복 한줄소개나 불필요한 섹션 헤더가 노출되지 않는다.",
    linkedTestFiles: ["src/tests/workspace/newsletter-70s-buyer-overhaul.test.tsx"],
  },
  {
    id: "BR-003",
    title: "중개인명 + 자주 쓰는 제목 프리셋 원클릭 선택 옵션",
    sourceSession: "사전 요구사항 (11/14)",
    area: "newsletter",
    biasTag: "취향",
    status: "pending_broker_confirm",
    acceptanceCriteria:
      "제목 입력 상단 프리셋 칩 클릭 시 '○○○ 중개인의 이번 달/주 빌딩 시장 브리핑' 등 자주 쓰는 제목이 즉시 채워지고 직접 수정도 가능하다.",
    defaultPolicyNote:
      "기본값은 직접 입력 및 편집 가능 상태를 유지하고, 자주 쓰는 제목은 원클릭 선택 프리셋 칩으로만 제공합니다.",
    linkedTestFiles: ["src/tests/workspace/newsletter-70s-buyer-overhaul.test.tsx"],
  },
  {
    id: "BR-004",
    title: "모바일 독자 화면 하단 유틸리티 제거 및 간단 뉴스레터 구독 신청만 유지",
    sourceSession: "사전 요구사항 (11/14)",
    area: "newsletter",
    biasTag: "공통",
    status: "pending_broker_confirm",
    acceptanceCriteria:
      "모바일(360/390px) 독자 화면 하단에 부가 유틸리티·중복 CTA가 제거되고 간결한 뉴스레터 구독 신청 폼만 노출된다.",
    linkedTestFiles: ["src/tests/workspace/newsletter-70s-buyer-overhaul.test.tsx"],
  },
  {
    id: "BR-005",
    title: "이슈 브리핑 '이슈 1, 이슈 2' 번호 소제목 제거 및 분야 배지만 표시",
    sourceSession: "사전 요구사항 (11/14)",
    area: "newsletter",
    biasTag: "공통",
    status: "pending_broker_confirm",
    acceptanceCriteria:
      "각 이슈 카드 상단에 '이슈 1', '이슈 2' 같은 번호 매김이 없고 세무·금리·임대차 등 분야 배지만 간결하게 표시된다.",
    linkedTestFiles: ["src/tests/workspace/newsletter-70s-buyer-overhaul.test.tsx"],
  },
  {
    id: "BR-006",
    title: "70대 매수자 눈높이 평어 카피라이팅 및 제목 2줄·부제 3줄 분량 확장",
    sourceSession: "사전 요구사항 (11/14)",
    area: "newsletter",
    biasTag: "공통",
    status: "pending_broker_confirm",
    acceptanceCriteria:
      "제목 2줄(3줄 넘침 차단) · 부제 3줄(4줄 넘침 차단) 범위에서 Cap Rate/스프레드/레버리지 등 난해한 외래어 없이 매수자에게 무슨 의미인지 평어로 설명된다.",
    linkedTestFiles: ["src/tests/workspace/newsletter-70s-buyer-overhaul.test.tsx"],
  },
  {
    id: "BR-007",
    title: "월간 뉴스레터 전용 상단 통계 그래프 2선 옵션 A(통건물 실거래 중앙값 · 한은 대출금리 비교)",
    sourceSession: "옵션 A 승인 (11/14)",
    area: "newsletter",
    biasTag: "공통",
    status: "pending_broker_confirm",
    acceptanceCriteria:
      "월간(monthly) 에디션 상단에만 국토부 통건물(집합·해제 제외) 평당가 중앙값 추이 및 한국은행 기업대출금리 vs 기대수익률 그래픽 2선이 표시되고, 일간·주간에는 미노출된다.",
    linkedTestFiles: [
      "src/tests/workspace/monthly-charts-and-inbox-tiers.test.tsx",
      "src/tests/workspace/newsletter-monthly-charts-and-cadence-audit.test.tsx",
    ],
  },
  {
    id: "BR-008",
    title: "소통함 무료(인사말+링크 복사·이메일) vs 유료 Pro(카카오 알림톡 4종·업그레이드 안내) 분리",
    sourceSession: "소통함 발송 티어 승인 (11/14)",
    area: "inbox",
    biasTag: "공통",
    status: "pending_broker_confirm",
    acceptanceCriteria:
      "무료 회원은 1클릭 정중 인사말+링크 복사 및 Resend 이메일 발송을 지원하고, 유료 Pro+거래근거 충족 시 카카오 알림톡(실발송 보류 정책 준수) 및 무료 회원 업그레이드 안내 시트가 동작한다.",
    linkedTestFiles: ["src/tests/workspace/monthly-charts-and-inbox-tiers.test.tsx"],
  },
  {
    id: "BR-009",
    title: "slk.* 서명 토큰 기반 고객별 IM · 딜카드 열람 및 체류시간 분리 귀속",
    sourceSession: "소통함 추적 승인 (11/14)",
    area: "inbox",
    biasTag: "공통",
    status: "pending_broker_confirm",
    acceptanceCriteria:
      "동일 매물을 여러 고객에게 보내도 각 고객 전용 slk.* 토큰으로 /im-lite·/dc 열람 횟수 및 체류시간이 섞이지 않고 개별 고객 행에 귀속된다.",
    linkedTestFiles: ["src/tests/workspace/monthly-charts-and-inbox-tiers.test.tsx"],
  },
  {
    id: "BR-010",
    title: "딜카드 메모 우선 작성 & 공개 티저 지번·상호·연락처 비노출(블라인드 방역)",
    sourceSession: "7일간 누적 핵심 요건",
    area: "dealcards",
    biasTag: "공통",
    status: "verified",
    acceptanceCriteria:
      "원본 메모 기반 4칸 요약 생성 시 상세 번지·임차 브랜드·연락처가 /dc/[id] 및 카톡 OG 카드에 노출되지 않으며, 블라인드 위반 없이 저장·공유된다.",
    linkedTestFiles: [
      "src/tests/workspace/mece-preemptive-defense-audit.test.tsx",
      "e2e/ws-dealcard-inbox-sota-golden.auth.spec.ts",
    ],
  },
  {
    id: "BR-011",
    title: "다필지 조회 · 아이폰 HEIC 업로드 · PPTX Slide 05 지적도 경계 & Slide 07 수익률 정합성",
    sourceSession: "7일간 누적 핵심 요건",
    area: "im",
    biasTag: "확인필요",
    status: "pending_broker_confirm",
    acceptanceCriteria:
      "다필지·HEIC 사진·렌트롤 엑셀 업로드 후 생성된 Basic IM PPTX가 4대 OpenXML 검사와 Slide 05 본건 필지 표시·Slide 07 수익률 수치 정합성을 통과한다.",
    linkedTestFiles: [
      "src/tests/preventive/l8-multiparcel-edgecases.test.ts",
      "src/tests/preventive/l12-im-heic-upload-parcel-broker-hygiene.test.ts",
      "e2e/ws-dealcard-inbox-sota-golden.auth.spec.ts",
    ],
  },
  {
    id: "BR-012",
    title: "4대 작업실 단순 목록 기본화 · 미리보기↔편집 양방향 연동 · 60대 시니어 UX 물리 기준",
    sourceSession: "7일간 누적 핵심 요건",
    area: "workspace_ux",
    biasTag: "공통",
    status: "verified",
    acceptanceCriteria:
      "1440px/1180px/390px 및 '매우 크게' 글자 모드에서 모든 버튼 44px 이상·본문 14.5px 이상·잘림 0·가로 넘침 0을 충족하고 우측 미리보기 클릭 시 편집칸으로 포커스 이동한다.",
    linkedTestFiles: [
      "e2e/ws-im-newsletter-sota-golden.auth.spec.ts",
      "e2e/ws-dealcard-inbox-sota-golden.auth.spec.ts",
    ],
  },
] as const;

export const BROKER_AREA_LABELS: Readonly<Record<BrokerRequirementArea, string>> = {
  newsletter: "뉴스레터",
  im: "IM · PPTX",
  dealcards: "딜카드",
  inbox: "소통함",
  workspace_ux: "작업실 공통 UX",
};
