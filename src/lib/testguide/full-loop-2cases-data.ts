/**
 * @file src/lib/testguide/full-loop-2cases-data.ts
 * @description 실매물 골든 데이터 기반 4대 작업공간(딜카드 → IM·발표자료 → 뉴스레터 → 고객 소통)
 *   전 주기 관통 휴먼 클릭스루 테스트 2선 SSOT 정의.
 *
 * 설계 원칙:
 *  1. 시드(DB 강제 주입) 대신 실제 UI 입력 경로를 타되, 1-Click 복사 칩과 ZIP 키트로 타이핑 노동을 0초화한다.
 *  2. Loop 1(중소형 밸류애드·모바일 리드 전환)과 Loop 2(프라임 다필지·보안 게이트·직교 링크 닫기) 2건으로
 *     CRE 중개 실무의 양극단 함정·권한·기기를 직교 커버한다 (각 17~19분, 총 36분 완주).
 *  3. 수치 오차·블라인드 누출·권한 잠금은 Live Auto-Probe가 자동 판정하고, 인간은 동선·어감·실기기 레이아웃에 집중한다.
 */

import {
  TESTGUIDE_DEALS,
  type TestGuideDeal,
  type TestGuideImageAsset,
} from '@/lib/testguide/testguide-data';

export const QA_FULL_LOOP_WORKBENCH_ID = 'qa-full-loop-2cases-v1' as const;

export type FullLoopCaseId = 'loop1' | 'loop2';
export type FullLoopVerdict = 'PENDING' | 'PASS' | 'NEEDS_POLISH' | 'FAIL';
export type FullLoopSeverity = 'S0' | 'S1' | 'S2';

export type FullLoopSubsystem =
  | '프로필·법정표기'
  | '딜카드'
  | 'IM·발표자료'
  | '뉴스레터'
  | '매수자 열람·문의'
  | '고객 소통(승인·회수)'
  | '오라클·보안마감';

export type FullLoopWindowBadge =
  | '창 A (PC 중개사)'
  | '창 B (스마트폰 카톡 매수자 1)'
  | '창 C (PC 시크릿 매수자 2)'
  | '창 A ↔ 창 B'
  | '창 A ↔ 창 B·C';

export interface FullLoopCopySnippet {
  id: string;
  label: string;
  targetHint: string;
  value: string;
  isPublicFacing?: boolean;
}

export interface FullLoopStepItem {
  id: string;
  loopId: FullLoopCaseId;
  stepNumber: number;
  subsystem: FullLoopSubsystem;
  windowBadge: FullLoopWindowBadge;
  targetMinutes: number;
  severityOnFail: FullLoopSeverity;
  title: string;
  workspaceHref?: string;
  workspaceLabel?: string;
  actionChecklist: string[];
  copySnippets: FullLoopCopySnippet[];
  humanFocus: string;
  autoProbeFocus: string;
  oracleReference: string;
}

export interface FullLoopGroundTruthSpec {
  expectedLandAreaSqm: number;
  expectedLandAreaPyeong: number;
  expectedGfaSqm: number;
  expectedGfaPyeong: number;
  areaToleranceSqm: number;
  singleParcelTrapSqm?: number;
  forbiddenPublicTokens: string[];
  expectedDepositSummary: string;
  expectedMonthlyRentSummary: string;
  expectedOccupancySummary: string;
  expectedYieldSummary: string;
}

export interface FullLoopCaseDefinition {
  id: FullLoopCaseId;
  code: 'LOOP-01' | 'LOOP-02';
  tabLabel: string;
  shortLabel: string;
  title: string;
  subtitle: string;
  targetMinutes: number;
  personaFocus: string;
  deviceSetup: string;
  sampleKitZipUrl: string;
  csvDownloadUrl: string;
  dealCode: string;
  propertyName: string;
  jibunAddress: string;
  roadAddress: string;
  askingPriceReadout: string;
  domainTraps: Array<{ code: string; title: string; detail: string }>;
  images: TestGuideImageAsset[];
  groundTruth: FullLoopGroundTruthSpec;
  steps: FullLoopStepItem[];
}

export interface FullLoopWindowRoleCard {
  id: 'windowA' | 'windowB' | 'windowC';
  badge: string;
  title: string;
  device: string;
  purpose: string;
}

export const FULL_LOOP_WINDOW_ROLES: ReadonlyArray<FullLoopWindowRoleCard> = [
  {
    id: 'windowA',
    badge: '창 A · 필수',
    title: '중개사 작업 화면',
    device: 'PC 크롬 일반 창 (로그인 상태)',
    purpose: '프로필 설정 · 딜카드 · IM · 뉴스레터 발행 · 고객 소통 승인 및 링크 닫기 수행',
  },
  {
    id: 'windowB',
    badge: '창 B · 필수',
    title: '매수자 1 (모바일 실기기)',
    device: '스마트폰 카카오톡 "나와의 채팅" 인앱 화면 (360~390px)',
    purpose: '카톡 썸네일 지번 비노출 · 모바일 가독성 · 자료 요청 제출 및 열람 승인 해제 확인',
  },
  {
    id: 'windowC',
    badge: '창 C · Loop 2 필수',
    title: '매수자 2 (경쟁 원매자)',
    device: 'PC 크롬 시크릿 창 (Ctrl+Shift+N, 비로그인)',
    purpose: '매수자 1 링크만 닫았을 때 매수자 2 링크는 살아 있는지(스레드 vs 매물 직교 분리) 비교',
  },
];

function findDealOrThrow(dealId: TestGuideDeal['id']): TestGuideDeal {
  const found = TESTGUIDE_DEALS.find((d) => d.id === dealId);
  if (!found) {
    throw new Error(`[full-loop-2cases-data] Missing TESTGUIDE_DEALS entry: ${dealId}`);
  }
  return found;
}

const DEAL_BUCHEON = findDealOrThrow('deal2');
const DEAL_YEOKSAM = findDealOrThrow('deal3');

export const FULL_LOOP_CASES: ReadonlyArray<FullLoopCaseDefinition> = [
  {
    id: 'loop1',
    code: 'LOOP-01',
    tabLabel: 'Loop 1 · 부천 58억',
    shortLabel: 'Loop 1 · 부천 동아빌딩 58억 (속도·모바일·리드전환)',
    title: '테스트 #1 — 중소형 밸류애드 근생 마케팅 발신 → 카톡 매수자 유입 → 승인 완주',
    subtitle:
      '비서울 역세권 코너빌딩(58억, 17행 임대 현황 + 주차타워 부대수익)을 딜카드·IM·뉴스레터로 발행해 스마트폰 카톡에서 자료 요청을 받고 승인까지 이어지는 실전 루프',
    targetMinutes: 17,
    personaFocus: '시니어 대표 중개사(21px 큰 글씨 포함) × 개인 자산가·병의원 원장 매수자',
    deviceSetup: '창 A(PC 일반 창) + 창 B(실제 스마트폰 카카오톡)',
    sampleKitZipUrl: '/api/public/qa-sample-kit?scenario=loop1',
    csvDownloadUrl: DEAL_BUCHEON.csvDownloadUrl,
    dealCode: DEAL_BUCHEON.code,
    propertyName: DEAL_BUCHEON.name,
    jibunAddress: DEAL_BUCHEON.jibunAddress,
    roadAddress: DEAL_BUCHEON.roadAddress,
    askingPriceReadout: '58억 원 (580,000만 원)',
    domainTraps: DEAL_BUCHEON.traps.map((t) => ({
      code: t.code,
      title: t.title,
      detail: t.description,
    })),
    images: DEAL_BUCHEON.images,
    groundTruth: {
      expectedLandAreaSqm: 535.6,
      expectedLandAreaPyeong: 162.02,
      expectedGfaSqm: 2758.21,
      expectedGfaPyeong: 834.36,
      areaToleranceSqm: 0.5,
      forbiddenPublicTokens: ['349-10', '부천로39번길 8', '동아빌딩'],
      expectedDepositSummary: '현황(201호 공실 제외) 45,500만원 → 만실 전환 시 50,500만원',
      expectedMonthlyRentSummary: '현황 월 2,230만원 → 만실 전환 시 월 2,520만원 (관리비·주차타워 별도)',
      expectedOccupancySummary: '현황 94.1% → 201호 임대 전환 시 100.0%',
      expectedYieldSummary: '보증금 차감 연 순수익률 5.01% → 만실 전환 시 5.71%',
    },
    steps: [
      {
        id: 'L1-S1',
        loopId: 'loop1',
        stepNumber: 1,
        subsystem: '프로필·법정표기',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 2,
        severityOnFail: 'S1',
        title: '5대 법정 표기 확인 및 큰 글씨(21px) 작업 화면 무결성 점검',
        workspaceHref: '/broker/profile',
        workspaceLabel: '내 사무소 프로필 열기',
        actionChecklist: [
          '/broker/profile에서 상호·소재지·연락처·개설등록번호·대표자 성명 5칸이 샘플 문구(홍길동, 010-0000-0000 등) 없이 채워져 있는지 확인하고 저장합니다.',
          '/broker/w/dealcards로 이동해 상단 글자 크기를 [크게(21px)]로 전환한 뒤, 좌측 매물 목록과 하단 버튼 글자가 말줄임표(…)로 잘리지 않는지 확인합니다.',
        ],
        copySnippets: [
          {
            id: 'l1-prof-company',
            label: '상호 예시 복사',
            targetHint: '/broker/profile → 중개사무소 명칭',
            value: '제이에스부동산중개법인 주식회사',
          },
          {
            id: 'l1-prof-reg',
            label: '유효 등록번호 예시 복사',
            targetHint: '/broker/profile → 개설등록번호',
            value: '11680-2025-04821',
          },
        ],
        humanFocus: '21px 큰 글씨 모드에서 시니어 중개사가 버튼과 좌측 매물명을 한눈에 읽을 수 있는지 확인합니다.',
        autoProbeFocus: '발행 단계에서 중개사 연락처 내 이메일 기호(@) 혼입 및 법정 표기 누락 여부를 자동 검사합니다.',
        oracleReference: '법정 필수 표기 5항목 완비 · 21px 모드 가로 넘침 및 핵심 CTA 잘림 0건',
      },
      {
        id: 'L1-S2',
        loopId: 'loop1',
        stepNumber: 2,
        subsystem: '딜카드',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '부천 동아빌딩 메모 1클릭 입력 및 지번 블라인드 딜카드 발행',
        workspaceHref: '/broker/w/dealcards',
        workspaceLabel: '딜카드 작업실 열기',
        actionChecklist: [
          '아래 [현장 메모 원문 복사]를 눌러 /broker/w/dealcards 메모 입력창에 붙여넣고 자동 채우기를 실행합니다.',
          '매물 유형(임대수익용), 지역(부천역 역세권), 가격(58억), 장점 3줄을 확인합니다.',
          '[받는 화면]과 [카톡 말풍선] 미리보기에서 상세 지번("349-10")과 건물명("동아빌딩")이 마스킹되었는지 확인한 뒤 발행하고, 공개 딜카드 링크(/dc/...)를 우측 프로브 입력창 ①에 붙여넣습니다.',
        ],
        copySnippets: [
          {
            id: 'l1-dc-memo',
            label: '현장 메모 원문 복사 (58억 동아빌딩)',
            targetHint: '/broker/w/dealcards → 메모로 채우기 입력창',
            value: DEAL_BUCHEON.brokerMemoText,
          },
          {
            id: 'l1-dc-headline',
            label: '블라인드 안전 한 줄 제목 복사',
            targetHint: '딜카드 → 한 줄 제목 (지번·건물명 비노출)',
            value: '1호선 부천역 도보 3분 전관 리모델링 완료 역세권 코너 근생빌딩 (58억)',
            isPublicFacing: true,
          },
        ],
        humanFocus: '메모 붙여넣기 직후 장점 3줄과 카톡 말풍선 요약이 현업 중개사가 바로 보낼 만한 자연스러운 문장인지 봅니다.',
        autoProbeFocus: '딜카드 공개 레코드 내 지번(349-10)·도로명 번지·건물명 유출 여부를 자동 탐지합니다.',
        oracleReference: '매각가 58억 · 연면적 약 834평 표시 · 공개 티저 내 상세 지번 노출 0건',
      },
      {
        id: 'L1-S3',
        loopId: 'loop1',
        stepNumber: 3,
        subsystem: 'IM·발표자료',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 4,
        severityOnFail: 'S0',
        title: '비서울 주소 자동 조회 · 17행 임대 현황 붙여넣기 · 발표자료(PPT) 검수',
        workspaceHref: '/broker/w/im',
        workspaceLabel: 'IM 작업실 열기',
        actionChecklist: [
          '/broker/w/im에서 주소를 붙여넣고 자동 조회를 눌러 경기도 부천시 원미구 건축물대장 면적(대지 535.60㎡ / 연면적 2,758.21㎡)이 즉시 채워지는지 확인합니다 (TRAP-2A).',
          '희망 매매가 기본 파란 입력칸(억 단위)에 숫자 "58"을 입력(또는 아래 1억 배 검증용 하단 [\'원\' 직접 입력] 칸에 "5800000000" 붙여넣기)하고 한글 독음 "= 58억 원"을 확인합니다.',
          '② 임대 현황 탭에 아래 [17행 임대 현황 TSV 복사]를 붙여넣고, 기계식 주차타워(월 198만원)가 연면적을 왜곡하지 않는지(TRAP-2B), 201호 치과를 [공실 → 임대중]으로 바꿀 때 수익률이 즉시 상승하는지 확인합니다.',
          '실매물 사진 4장(JPG·PNG·WebP)을 올린 뒤 [📥 PPTX 받기]로 내려받아 실제 PowerPoint에서 6~7면 임대 현황 2면 분할(TRAP-2C)과 스태킹 여백을 확인하고, 생성된 IM 공유 링크를 우측 프로브 입력창 ②에 붙여넣습니다.',
        ],
        copySnippets: [
          {
            id: 'l1-im-addr',
            label: '지번 주소 복사 (부천 심곡동)',
            targetHint: '/broker/w/im → ① 기본 제원 주소 검색',
            value: DEAL_BUCHEON.jibunAddress,
          },
          {
            id: 'l1-im-price-eok',
            label: '희망 매매가 (기본 파란칸 억 단위: 58)',
            targetHint: '/broker/w/im → 상단 파란 [억 단위] 칸 전용',
            value: '58',
          },
          {
            id: 'l1-im-price',
            label: '희망 매매가 (하단 원 단위 칸: 5800000000)',
            targetHint: "/broker/w/im → 하단 보조 ['원' 직접 입력] 칸 전용",
            value: '5800000000',
          },
          {
            id: 'l1-im-tsv',
            label: '17행 임대 현황 TSV 복사 (주차타워 포함)',
            targetHint: '/broker/w/im → ② 임대 현황 [엑셀 붙여넣기]',
            value: DEAL_BUCHEON.tsvContent,
          },
        ],
        humanFocus: '내려받은 PPT 파일을 실제 PowerPoint에서 열었을 때 표 여백·스태킹 도식·수익률 각주가 겹침 없이 깔끔한지 눈으로 확인합니다.',
        autoProbeFocus: '서버 저장 문서의 대지(535.60㎡)·연면적(2,758.21㎡)·공시지가 및 공유 링크 유효성을 자동 대조합니다.',
        oracleReference:
          '대지 535.60㎡ / 연면적 2,758.21㎡ · 현황 보 45,500만·월 2,230만 → 만실 보 50,500만·월 2,520만 · PPT 임대 현황 2면 분할 정상',
      },
      {
        id: 'L1-S4',
        loopId: 'loop1',
        stepNumber: 4,
        subsystem: '뉴스레터',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S1',
        title: '주간 뉴스레터에 동아빌딩 추천 연결 · 새로고침 보존 · 링크·인사말 복사',
        workspaceHref: '/broker/w/newsletter',
        workspaceLabel: '뉴스레터 작업실 열기',
        actionChecklist: [
          '/broker/w/newsletter에서 새 호수를 만들고 표지 제목·시장 브리핑 원문을 붙여넣은 뒤, 추천 매물로 방금 만든 부천 역세권 근생 매물을 체크하고 한 줄 추천 코멘트를 입력합니다.',
          '브라우저 F5(새로고침)를 눌러 입력한 표지 제목·시장 브리핑·선택 매물이 초기화되지 않고 그대로 보존되는지 확인합니다.',
          '[확인하고 보내기] 단계에서 [구독자에게 보내기](또는 [발행하기])를 완료한 뒤 [링크 복사]로 공개 뉴스레터 URL을 우측 프로브 입력창 ④에 넣고, [인사말 + 링크 복사]로 1,000자 이하 · 5대 법정 표기가 포함된 카톡 전달문을 확인합니다.',
        ],
        copySnippets: [
          {
            id: 'l1-nl-title',
            label: '주간 뉴스레터 제목 복사',
            targetHint: '/broker/w/newsletter → 표지 제목',
            value: '금리 인하기 수도권 1호선 초역세권 전관 리모델링 수익형 빌딩 선별 전략',
            isPublicFacing: true,
          },
          {
            id: 'l1-nl-brief',
            label: '이번 주 시장 이야기 원문 복사',
            targetHint: '/broker/w/newsletter → 시장 브리핑 본문',
            value:
              '대출 금리 하향 안정화와 함께 추가 수선비(CapEx) 부담이 없는 전관 리모델링 완료 근생 빌딩으로 개인 자산가와 병의원 매수 문의가 집중되고 있습니다. 특히 일일 유동인구가 풍부한 수도권 전철 핵심 역세권 코너 자산은 서울 대비 2%p 이상 높은 연 5%대 임대수익률을 확보할 수 있어 실투자금이 빠르게 유입되는 흐름입니다.',
            isPublicFacing: true,
          },
          {
            id: 'l1-nl-comment',
            label: '추천 매물 한 줄 코멘트 복사 (지번 비노출)',
            targetHint: '/broker/w/newsletter → 추천 매물 코멘트',
            value:
              '2025년 9월 전관 리모델링 완료 · 우량 메디컬·학원 임차 구성 및 고정 주차수익으로 안정적 현금흐름 확보',
            isPublicFacing: true,
          },
        ],
        humanFocus: '카톡 홍보 문구와 이메일 하단에 내 중개사무소 5대 법정 표기가 어색함 없이 자연스럽게 붙었는지 확인합니다.',
        autoProbeFocus: '발행된 뉴스레터 내 지번(349-10) 노출 0건, UUID 제목 노출 0건, 매물 카드 연결 상태를 자동 검사합니다.',
        oracleReference: '발행 상태 published · 표지·브리핑·매물 F5 보존 · 카톡 공유문 1,000자 이하 & 5대 법정 표기 완비',
      },
      {
        id: 'L1-S5',
        loopId: 'loop1',
        stepNumber: 5,
        subsystem: '매수자 열람·문의',
        windowBadge: '창 B (스마트폰 카톡 매수자 1)',
        targetMinutes: 2,
        severityOnFail: 'S0',
        title: '스마트폰 카톡 인앱 열람 → 매물 카드 클릭 → 상세 자료 요청 및 구독 신청',
        actionChecklist: [
          '스마트폰 카카오톡 "나와의 채팅"에 복사한 인사말·뉴스레터·딜카드 링크를 전송하고, 카톡 말풍선 썸네일에 지번("349-10")이 노출되지 않는지 확인합니다.',
          '스마트폰으로 뉴스레터를 열어 모바일 가독성을 확인한 뒤, 추천 매물 카드를 눌러 딜카드(/dc/...) → 모바일 IM(/im-lite/...)으로 이동합니다.',
          '모바일 IM 하단 버튼이 잘리지 않는지 확인하고 자료 요청 창에 아래 4개 칸(성함·연락처·이메일·문의 내용)을 붙여넣어 제출한 뒤, 뉴스레터 구독 폼에서도 연락처와 확인용 이메일(sb.jung@example.kr)을 입력해 구독 신청을 완료합니다.',
        ],
        copySnippets: [
          {
            id: 'l1-buyer-name',
            label: '성함 복사 (정수빈 원장)',
            targetHint: '자료 요청 창 → 성함',
            value: '정수빈 원장',
          },
          {
            id: 'l1-buyer-phone',
            label: '연락처 복사 (010-5501-2389)',
            targetHint: '자료 요청 창 · 구독 폼 · 우측 프로브 입력창 ⑤',
            value: '010-5501-2389',
          },
          {
            id: 'l1-buyer-email',
            label: '확인용 이메일 복사 (sb.jung@example.kr)',
            targetHint: '자료 요청 창 이메일(선택) · 뉴스레터 구독 이메일(필수)',
            value: 'sb.jung@example.kr',
          },
          {
            id: 'l1-buyer-msg',
            label: '문의 내용 복사',
            targetHint: '자료 요청 창 → 문의 내용',
            value: '2층 공실 치과 직접 개원 겸 매입 검토 중입니다. 층별 임대차 상세 내역과 주차타워 수익 자료 요청드립니다.',
          },
        ],
        humanFocus: '실제 스마트폰 한 손 조작 시 카톡 인앱 화면 가로 스크롤이 없고 하단 문의 버튼이 엄지손가락으로 편하게 눌리는지 봅니다.',
        autoProbeFocus: '제출한 구독자 연락처(010-5501-2389)가 구독자 명단 및 고객 목록에 정상 인입되었는지 확인합니다.',
        oracleReference: '카톡 인앱 가로 스크롤 0px · 자료 요청 접수 모달 정상 노출 · 구독 신청 완료',
      },
      {
        id: 'L1-S6',
        loopId: 'loop1',
        stepNumber: 6,
        subsystem: '고객 소통(승인·회수)',
        windowBadge: '창 A ↔ 창 B',
        targetMinutes: 2,
        severityOnFail: 'S0',
        title: '고객 소통함 문의 도착 확인 · 1클릭 [자료 보내기] 승인 · 스마트폰 상세 열람 해제',
        workspaceHref: '/broker/w/inbox',
        workspaceLabel: '고객 소통함 열기',
        actionChecklist: [
          '창 A(/broker/w/inbox)의 [할 일] 목록 최상단에 "정수빈 원장" 요청이 깨진 기호(JSON 문자열 등) 없이 도착했는지 확인합니다.',
          '[자료 보내기(승인)] 버튼을 클릭해 복사된 열람 링크(/im-lite/...)를 우측 프로브 입력창 ②에 갱신해 넣고 스마트폰(창 B)으로 전달합니다.',
          '스마트폰(창 B)에서 승인된 링크를 열어 전체 층별 임대 현황과 수익률 분석이 잠금 없이 선명하게 열리는지 확인합니다.',
        ],
        copySnippets: [
          {
            id: 'l1-ib-memo',
            label: '상담 통화 메모 샘플 복사',
            targetHint: '/broker/w/inbox → [기록] 탭 메모 입력칸',
            value: '정수빈 원장 통화 완료 — 금주 토요일 오후 2시 부천 현장 답사 예정 (2층 치과 직접 입주 및 대출 승계 조건 안내)',
          },
        ],
        humanFocus: '문의 확인부터 자료 승인·전달까지 중개사가 망설이지 않고 10초 이내에 끝낼 수 있는지 체감 속도를 점검합니다.',
        autoProbeFocus: '발급된 열람 링크 서명 유효성(valid=true, isLocked=false)을 실시간 검증합니다.',
        oracleReference: '소통함 날것 JSON 노출 0건 · 승인 후 모바일 상세 섹션 100% 열람 · F5 후 상담 기록 유지',
      },
      {
        id: 'L1-S7',
        loopId: 'loop1',
        stepNumber: 7,
        subsystem: '오라클·보안마감',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 1,
        severityOnFail: 'S1',
        title: 'Loop 1 자동 오라클 프로브 일괄 판정 및 체감 기록 마감',
        actionChecklist: [
          '우측 코파일럿 패널에 ① 딜카드 URL, ② IM 열람 링크, ④ 뉴스레터 URL, ⑤ 매수자 연락처(010-5501-2389)가 채워졌는지 확인하고 [🔍 1초 자동 오라클 프로브 실행]을 누릅니다.',
          '4개 항목이 모두 초록색 통과 배지로 뜨는지 확인하고, 테스트 중 5초 이상 망설였던 지점이 있다면 메모에 남긴 뒤 Loop 2로 넘어갑니다.',
        ],
        copySnippets: [],
        humanFocus: '전체 17분 동선에서 "고객에게 바로 보내도 손색없다"는 신뢰감이 들었는지 종합 평가합니다.',
        autoProbeFocus: '부천 동아빌딩 Ground-Truth 면적(535.60㎡ / 2,758.21㎡) + 블라인드 + 링크 활성 + CRM 인입 4중 대조.',
        oracleReference: '자동 프로브 전 항목 통과 · 중대한 수치/블라인드 결함(S0) 0건',
      },
    ],
  },
  {
    id: 'loop2',
    code: 'LOOP-02',
    tabLabel: 'Loop 2 · 역삼 2,000억',
    shortLabel: 'Loop 2 · 역삼 여삼빌딩 2,000억 (정밀·보안·직교회수)',
    title: '테스트 #2 — 프라임 다필지 오피스 법정 2중 게이트 → 스튜디오·가격 연동 → 복수 매수자 직교 회수',
    subtitle:
      '테헤란로 3필지 합산 코어 오피스(2,000억, 다층 통합계약·자가사용 21행)로 법정 2중 차단 게이트(400·422), 섹션 숨김, 가격 조정 연동, 경쟁 매수자 단건 vs 건물 전체 링크 닫기까지 검증하는 고강도 보안·거버넌스 루프',
    targetMinutes: 19,
    personaFocus: '전속·기관 실무 팀장 중개사(1440px·1180px) × 경쟁 매수자 2인(패밀리오피스 vs 자산운용사)',
    deviceSetup: '창 A(PC 일반 창) + 창 B(스마트폰 카톡: 매수자 1) + 창 C(PC 시크릿 창: 매수자 2)',
    sampleKitZipUrl: '/api/public/qa-sample-kit?scenario=loop2',
    csvDownloadUrl: DEAL_YEOKSAM.csvDownloadUrl,
    dealCode: DEAL_YEOKSAM.code,
    propertyName: DEAL_YEOKSAM.name,
    jibunAddress: '서울특별시 강남구 역삼동 648-23 외 2필지 (648-23, 648-24, 648-25)',
    roadAddress: DEAL_YEOKSAM.roadAddress,
    askingPriceReadout: '2,000억 원 (가격 조정 시 1,900억 원)',
    domainTraps: DEAL_YEOKSAM.traps.map((t) => ({
      code: t.code,
      title: t.title,
      detail: t.description,
    })),
    images: DEAL_YEOKSAM.images,
    groundTruth: {
      expectedLandAreaSqm: 1452.2,
      expectedLandAreaPyeong: 439.29,
      expectedGfaSqm: 14256.64,
      expectedGfaPyeong: 4312.61,
      areaToleranceSqm: 0.5,
      singleParcelTrapSqm: 555.7,
      forbiddenPublicTokens: ['648-23', '648-24', '648-25', '테헤란로 123', '여삼빌딩'],
      expectedDepositSummary: '총 보증금 464,776만원 (46억 4,776만원)',
      expectedMonthlyRentSummary: '총 월임대료 40,686.9만원 (약 4억 687만원) · 관리비 14,776.1만원',
      expectedOccupancySummary: '점유율 100.0% (농협·서우회계법인 0원 합산행 및 303호 자가사용 포함 공실 0)',
      expectedYieldSummary: '2,000억 기준 연 순수익률 2.50% → 1,900억 조정 시 2.63%',
    },
    steps: [
      {
        id: 'L2-S1',
        loopId: 'loop2',
        stepNumber: 1,
        subsystem: '프로필·법정표기',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 2,
        severityOnFail: 'S0',
        title: '법정 표기 2중 차단 게이트(저장 시 400 샘플 차단 + 발행 시 422 누락 차단) 체험 후 복원',
        workspaceHref: '/broker/profile',
        workspaceLabel: '내 사무소 프로필 열기',
        actionChecklist: [
          '1차 방어(400): /broker/profile 개설등록번호 칸에 [차단 테스트용 샘플 번호(11680-2024-00123)]를 입력하고 저장을 눌러, 저장 단계에서 즉시 400 차단 안내가 뜨는지 확인합니다.',
          '2차 방어(422): 개설등록번호 칸을 아예 비운 채 저장한 뒤 딜카드 또는 뉴스레터 발행을 시도하여, 발행 단계에서 422 누락 차단 안내("유효한 중개사무소 개설등록번호")가 뜨는지 확인합니다.',
          '복구: 다시 /broker/profile에서 [정상 등록번호 복원용 값]을 입력해 저장합니다.',
        ],
        copySnippets: [
          {
            id: 'l2-bad-reg',
            label: '1차 방어 확인용 샘플 번호 복사',
            targetHint: '/broker/profile → 개설등록번호 (저장 400 차단 확인)',
            value: '11680-2024-00123',
          },
          {
            id: 'l2-good-reg',
            label: '정상 등록번호 복원용 복사',
            targetHint: '/broker/profile → 개설등록번호 (복구 저장용)',
            value: '11680-2025-04821',
          },
        ],
        humanFocus: '저장 차단(400)과 발행 차단(422) 안내 문구가 시스템 오류처럼 놀라게 하지 않고 "과태료 예방을 위한 보호 장치"로 친절히 읽히는지 확인합니다.',
        autoProbeFocus: '복원 후 프로필 연락처 및 법정 표기 유효 상태를 재검증합니다.',
        oracleReference: '샘플 번호 저장 100% 차단(400) · 공란 시 발행 100% 차단(422) · 정상 번호 복원 즉시 통과',
      },
      {
        id: 'L2-S2',
        loopId: 'loop2',
        stepNumber: 2,
        subsystem: 'IM·발표자료',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 4,
        severityOnFail: 'S0',
        title: '3필지 합산(1,452.20㎡) · 21행 통합계약 100% 만실 · 1조원대 표기 · 1,900억 수익률 실시간 연동',
        workspaceHref: '/broker/w/im',
        workspaceLabel: 'IM 작업실 열기',
        actionChecklist: [
          '/broker/w/im에서 역삼동 648-23 외 2필지를 입력해 단일 대표필지(555.7㎡)가 아닌 3필지 합산 대지면적 1,452.20㎡(439.29평)가 잡히는지 확인합니다 (TRAP-3A).',
          '상단 파란 [억 단위] 입력칸에 [10500]을 잠시 넣어 "1조 500억대" 구간 표기가 절삭되지 않는지 눈으로 확인한 뒤, 본 매매가 [2000](2,000억)으로 되돌리고 ② 임대 현황에 [21행 TSV]를 붙여넣어 0원 합산행·자가사용 포함 점유율 100.0%(2.50%)를 확인합니다 (TRAP-3B).',
          '이어서 [억 단위] 칸을 [1900](1,900억)으로 낮췄을 때 연 순수익률이 2.50% → 2.63%로 즉시 연동되고 브라우저 F5 새로고침 후에도 유지되는지 확인합니다.',
        ],
        copySnippets: [
          {
            id: 'l2-im-addr',
            label: '대표 지번 주소 복사 (역삼동 648-23)',
            targetHint: '/broker/w/im → ① 기본 제원 주소 검색',
            value: DEAL_YEOKSAM.jibunAddress,
          },
          {
            id: 'l2-im-trillion-eok',
            label: '1조 500억 스모크 (파란 억 단위: 10500)',
            targetHint: '/broker/w/im → 상단 파란 [억 단위] 칸 (확인 후 복원)',
            value: '10500',
          },
          {
            id: 'l2-im-2000-eok',
            label: '본 매매가 2,000억 (파란 억 단위: 2000)',
            targetHint: '/broker/w/im → 상단 파란 [억 단위] 칸 전용',
            value: '2000',
          },
          {
            id: 'l2-im-1900-eok',
            label: '조정 매매가 1,900억 (파란 억 단위: 1900)',
            targetHint: '/broker/w/im → 상단 파란 [억 단위] 칸 (2.50% → 2.63% 연동)',
            value: '1900',
          },
          {
            id: 'l2-im-2000eok',
            label: '하단 원 단위 입력용: 200000000000',
            targetHint: "/broker/w/im → 하단 보조 ['원' 직접 입력] 칸 전용",
            value: '200000000000',
          },
          {
            id: 'l2-im-tsv',
            label: '21행 프라임 오피스 임대 현황 TSV 복사',
            targetHint: '/broker/w/im → ② 임대 현황 [엑셀 붙여넣기]',
            value: DEAL_YEOKSAM.tsvContent,
          },
        ],
        humanFocus: '억 단위 칸 입력 시 한글 독음과 연 순수익률(2.50% → 2.63%)이 지연 없이 즉시 따라오는지 체감합니다.',
        autoProbeFocus: '단일 필지 오판(555.7㎡) 여부와 총 대지면적(1,452.20㎡)·연면적(14,256.64㎡) 정합성을 자동 판정합니다.',
        oracleReference: '대지 1,452.20㎡(439.29평) · 연면적 14,256.64㎡ · 보 464,776만 / 월 40,686.9만 · 점유율 100.0% · 1,900억 2.63%',
      },
      {
        id: 'L2-S3',
        loopId: 'loop2',
        stepNumber: 3,
        subsystem: 'IM·발표자료',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '발표자료 꾸미기(슬라이드 구성) · 승인 검수 화면(/broker/im-approval) 민감 섹션 서버 숨김',
        workspaceHref: '/broker/w/im',
        workspaceLabel: 'IM 작업실에서 발표자료 꾸미기 진입',
        actionChecklist: [
          '/broker/w/im에서 [📐 발표자료 꾸미기](/broker/basic-im-studio/[buildingId])로 진입해 위치·지적도 저장과 좌측 슬라이드 제목이 1180px 노트북 폭에서도 2행 전폭으로 선명히 보이는지 확인합니다.',
          '발표자료(PPT) 출력물에서 특정 면을 빼고 싶다면 슬라이드 좌측 목록에서 [포함/제외] 토글을 눌러 저장합니다.',
          '모바일 열람(/im-lite) 외부 공개 화면에서 민감 섹션을 아예 숨기려면 검수·승인 화면(/broker/im-approval/[buildingId])에서 해당 섹션 숨김을 켜고 저장합니다.',
        ],
        copySnippets: [
          {
            id: 'l2-dc-memo',
            label: '프라임 오피스 메모 원문 복사 (딜카드 겸용)',
            targetHint: '/broker/w/dealcards → 메모로 채우기',
            value: DEAL_YEOKSAM.brokerMemoText,
          },
        ],
        humanFocus: '1180px 노트북 폭에서도 좌측 슬라이드 제목이 1글자로 찌그러지지 않고, PPT 슬라이드 포함/제외와 모바일 섹션 숨김 역할이 헷갈리지 않는지 확인합니다.',
        autoProbeFocus: '서버 문서에 저장된 숨김 섹션 수(hiddenSectionCount)와 인근 사례 가짜 지번(123-45) 0건을 검증합니다.',
        oracleReference: '스튜디오 PPT 포함/제외 정상 저장 · 승인 화면 숨김 섹션 /im-lite 서버 차단 · 가짜 지번(123-45) 0건(TRAP-3C)',
      },
      {
        id: 'L2-S4',
        loopId: 'loop2',
        stepNumber: 4,
        subsystem: '딜카드',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S1',
        title: '역삼 코어 오피스 블라인드 딜카드 발행 및 강남권역(GBD) 월간 뉴스레터 편입',
        workspaceHref: '/broker/w/newsletter',
        workspaceLabel: '뉴스레터 작업실 열기',
        actionChecklist: [
          '/broker/w/dealcards에서 위 프라임 오피스 메모를 붙여넣어 여삼빌딩 딜카드를 발행하고(지번 648-23·건물명 비노출 확인) 공개 URL을 우측 프로브 입력창 ①에 넣습니다.',
          '/broker/w/newsletter에서 강남권역(GBD) 월간 호수를 작성해 방금 발행한 프라임 오피스 딜카드를 추천 매물로 체크하고 추천 코멘트를 입력합니다.',
          '[구독자에게 보내기](또는 [발행하기]) 완료 후 [링크 복사]로 공개 뉴스레터 URL을 우측 프로브 입력창 ④에 기록합니다 (야간 시간대 실행 시 익일 08:00 예약 보류 안내 확인).',
        ],
        copySnippets: [
          {
            id: 'l2-nl-title',
            label: 'GBD 월간 뉴스레터 제목 복사',
            targetHint: '/broker/w/newsletter → 표지 제목',
            value: '테헤란로 프라임 오피스 수급 재편과 장기 마스터리스 코어 빌딩 투자 전략',
            isPublicFacing: true,
          },
          {
            id: 'l2-nl-brief',
            label: 'GBD 월간 시장 브리핑 복사',
            targetHint: '/broker/w/newsletter → 시장 브리핑 본문',
            value:
              '강남권역(GBD) 대형 오피스는 IT·금융·회계법인의 본사 통합 수요에 힘입어 자연공실률 미만의 견조한 임차 시장을 유지하고 있습니다. 특히 대로변 다필지 상업지역에 위치한 중대형 빌딩은 장기 마스터리스 기반의 안정적 배당과 향후 신축·리모델링 개발 옵션을 동시에 확보할 수 있어 패밀리오피스와 기관 투자자의 핵심 타깃이 되고 있습니다.',
            isPublicFacing: true,
          },
          {
            id: 'l2-nl-comment',
            label: '추천 매물 한 줄 코멘트 복사 (지번 비노출)',
            targetHint: '/broker/w/newsletter → 추천 매물 코멘트',
            value:
              '강남·역삼 더블역세권 왕복 8차선 대로변 대지 약 439평 코어 오피스 · 금융기관·회계법인 등 전 층 100% 만실 운영',
            isPublicFacing: true,
          },
        ],
        humanFocus: '기관·법인 고객에게 보내는 월간 리포트로서 숫자와 어조가 절제되고 신뢰감 있게 읽히는지 확인합니다.',
        autoProbeFocus: '뉴스레터 및 딜카드 내 다필지 지번(648-23, 648-24, 648-25) 및 건물명 노출 0건을 자동 검증합니다.',
        oracleReference: '블라인드 위반 0건 · 월간 차트/지표 깨짐 0건 · 법정 표기 5항목 푸터 정상',
      },
      {
        id: 'L2-S5',
        loopId: 'loop2',
        stepNumber: 5,
        subsystem: '매수자 열람·문의',
        windowBadge: '창 A ↔ 창 B·C',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '경쟁 매수자 2인(창 B 패밀리오피스 vs 창 C 자산운용사) 각각 자료 요청 및 승인 링크 분리 발급',
        workspaceHref: '/broker/w/inbox',
        workspaceLabel: '고객 소통함 열기',
        actionChecklist: [
          '창 B(스마트폰)에서 딜카드(/dc/...)의 자료 요청 폼을 열어 아래 [창 B · 매수자 1] 개별 복사 칩 3개를 순서대로 붙여넣어 제출합니다.',
          '창 C(PC 시크릿 창)에서 동일 딜카드의 자료 요청 폼을 열어 아래 [창 C · 매수자 2] 개별 복사 칩 3개를 순서대로 붙여넣어 제출합니다.',
          '창 A(/broker/w/inbox)에서 두 요청을 각각 [자료 보내기(승인)] 처리한 뒤, 발급된 두 개의 서로 다른 열람 링크를 우측 프로브 입력창 ②(매수자 1)와 ③(매수자 2)에 붙여넣습니다.',
        ],
        copySnippets: [
          {
            id: 'l2-b1-name',
            label: '[창 B] 성함 복사 (윤지혜 매니저 · 한빛패밀리오피스)',
            targetHint: '창 B 자료 요청 창 → 성함/기업명',
            value: '윤지혜 매니저 (한빛패밀리오피스)',
          },
          {
            id: 'l2-b1-phone',
            label: '[창 B] 연락처 복사 (010-2849-7105)',
            targetHint: '창 B 자료 요청 창 → 연락처 & 우측 프로브 ⑤',
            value: '010-2849-7105',
          },
          {
            id: 'l2-b1-msg',
            label: '[창 B] 문의 내용 복사',
            targetHint: '창 B 자료 요청 창 → 문의 내용',
            value: '장기 보유 목적 테헤란로 코어 빌딩 투자검토서 요청드립니다.',
          },
          {
            id: 'l2-b2-name',
            label: '[창 C] 성함 복사 (박매수 상무 · 케이리츠자산운용)',
            targetHint: '창 C 시크릿 창 자료 요청 창 → 성함/기업명',
            value: '박매수 상무 (케이리츠자산운용)',
          },
          {
            id: 'l2-b2-phone',
            label: '[창 C] 연락처 복사 (010-8888-7777)',
            targetHint: '창 C 시크릿 창 자료 요청 창 → 연락처',
            value: '010-8888-7777',
          },
          {
            id: 'l2-b2-msg',
            label: '[창 C] 문의 내용 복사',
            targetHint: '창 C 시크릿 창 자료 요청 창 → 문의 내용',
            value: '투심위 상정용 상세 IM 및 필지별 토지 현황 요청드립니다.',
          },
        ],
        humanFocus: '복수 원매자가 동시에 문의했을 때 소통함에서 두 고객 스레드가 헷갈리지 않고 명확히 구분되는지 확인합니다.',
        autoProbeFocus: '매수자 1·2 각각의 열람 링크가 모두 활성(isLocked=false) 상태인지 동시에 대조합니다.',
        oracleReference: '두 스레드 독립 생성 · 두 링크 모두 열람 가능 · 숨김 섹션 비노출 유지',
      },
      {
        id: 'L2-S6',
        loopId: 'loop2',
        stepNumber: 6,
        subsystem: '고객 소통(승인·회수)',
        windowBadge: '창 A ↔ 창 B·C',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '스레드 단건 링크 닫기(창 B만 차단, 창 C 유지) → 매물 전체 링크 닫기(전체 차단) 직교 검증',
        workspaceHref: '/broker/w/inbox',
        workspaceLabel: '고객 소통함 열기',
        actionChecklist: [
          '1단계(단건 잠금): 창 A(/broker/w/inbox)에서 "윤지혜 매니저(매수자 1)" 스레드를 선택해 우측 패널 [보낸 링크 잠그기] 클릭 → 인라인 확인창에서 체크박스 없이 바로 [잠그기]를 누릅니다.',
          '직교 확인: 창 B(매수자 1)를 새로고침해 열람이 차단되는지 확인하고, 동시에 창 C(매수자 2 박매수 상무)를 새로고침해 **매수자 2의 링크는 끊기지 않고 계속 열리는지** 확인합니다! (우측 프로브로 ②=잠김, ③=열림 동시 확인)',
          '2단계(건물 전체 잠금): 창 A에서 박매수 상무 스레드를 선택한 뒤 [보낸 링크 잠그기] → 인라인 확인창의 [☑ 이 건물 전체 열람 잠금 (모든 수신자 차단)]을 체크하고 [잠그기]를 눌러 창 C까지 완전히 차단되는지 확인합니다.',
        ],
        copySnippets: [
          {
            id: 'l2-corr-banner',
            label: '수치 정정 안내 배너 문구 복사',
            targetHint: '/broker/w/inbox → 우측 [⚠️ 수치 정정 안내 띄우기]',
            value: '매도인 측 협의에 따라 희망 매각가가 2,000억 원에서 1,900억 원으로 조정 반영되었습니다.',
          },
        ],
        humanFocus: '인라인 확인창의 "이 고객의 열람 링크를 잠글까요?"(단건)와 "이 건물 전체 열람 잠금 (모든 수신자 차단)" 체크박스를 중개사가 실수 없이 구분해 누를 수 있는지 확인합니다.',
        autoProbeFocus: '단건 회수 시 [매수자 1 링크=잠김, 매수자 2 링크=열림] 직교 상태 및 건물 전체 회수 시 [둘 다 잠김] 전환을 자동 판정합니다.',
        oracleReference: '단건 회수 시 타 스레드 영향 0% · 건물 전체 회수 시 모든 수신자 차단 · 다시 열기 복원 정상',
      },
      {
        id: 'L2-S7',
        loopId: 'loop2',
        stepNumber: 7,
        subsystem: '오라클·보안마감',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 1,
        severityOnFail: 'S1',
        title: '직접 등록 고객 삭제(개인정보 익명화) 및 공용 PC 로그아웃 잔여 데이터 소거 점검',
        actionChecklist: [
          '/broker/w/inbox 좌측 상단 [+ 고객 직접 등록]으로 테스트 고객 1명을 등록한 뒤, 우측 고객 요약 카드 하단의 [고객 삭제] 버튼을 누르고 확인 입력란에 고객명을 그대로 입력한 뒤 [삭제 확인]을 눌러 정상 삭제·익명화되는지 확인합니다.',
          '우측 코파일럿 패널의 [🔍 1초 자동 오라클 프로브 실행]으로 역삼 여삼빌딩 최종 상태를 검증한 뒤, 로그아웃 후 [🧹 공용 PC 브라우저 잔여 키 점검] 버튼을 눌러 임시 메모·카톡 문구 키가 0건인지 확인합니다.',
          '상단 [최종 Sign-off 리포트] 탭으로 이동해 2건 통합 검수 리포트를 저장·제출합니다.',
        ],
        copySnippets: [],
        humanFocus: '사무실 공용 PC에서 퇴근·자리 비움 시 직전 매물 메모나 고객 카톡 문구가 남지 않는 보안 완결성을 확인합니다.',
        autoProbeFocus: '브라우저 localStorage / sessionStorage 내 memo_transfer, kakao_text_* 잔여 키 0건을 즉시 스캔합니다.',
        oracleReference: '공용 PC 민감 임시 키 잔류 0건 · 14개 전 문항 판정 완료 및 서버 제출 성공',
      },
    ],
  },
];

export const FULL_LOOP_ALL_STEPS: ReadonlyArray<FullLoopStepItem> = FULL_LOOP_CASES.flatMap(
  (c) => c.steps
);
