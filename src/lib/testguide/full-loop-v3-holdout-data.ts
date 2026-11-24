/**
 * @file src/lib/testguide/full-loop-v3-holdout-data.ts
 * @description Hold-out 실매물 V3 2선 (양평동4가 250억 3필지 평단위 XLSX + 잠원동 242억 신축·개발 2필지)
 *   전 주기 관통 휴먼 클릭스루 테스트 V3 정의 (/qa-full-loop-v3).
 *
 * 인지과학 설계 원칙 (2026-11-23 V3):
 *  1. 실행 간극(Gulf of Execution) 제로: 분할화면(800~950px)과 전체화면 모두에서 실제 화면에 보이는 버튼 이름·색상과 100% 일치시킨다.
 *  2. 1행동 → 1시각 확인: 각 지시 끝에 "→ 화면 확인:" 문구로 정상 동작일 때 보이는 숫자와 배지를 바로 제시한다.
 *  3. 파일·연락처 오염 제로: 모든 다운로드 파일명에 V3_ 접두어를 부여하고, 이전 회차와 겹치지 않는 전용 고객 연락처를 사용한다.
 *  4. 현업 한국어 전용: 개발자 내부 용어를 배제하고 중개 실무 표현만 사용한다.
 */

import type { TestGuideImageAsset } from '@/lib/testguide/testguide-data';
import type {
  FullLoopCaseDefinition,
  FullLoopStepItem,
  FullLoopWindowRoleCard,
} from '@/lib/testguide/full-loop-2cases-data';
import {
  HOLDOUT_V2_CASE03_ASIS_CSV,
  HOLDOUT_V2_CASE03_ASIS_TSV,
  HOLDOUT_V2_CASE03_MEMO,
  HOLDOUT_V2_CASE03_STABILIZED_TSV,
} from '@/lib/testguide/full-loop-v2-holdout-data';

export const QA_FULL_LOOP_V3_WORKBENCH_ID = 'qa-full-loop-v3-holdout' as const;

export const HOLDOUT_V3_ASSET_CDN_MAP: Record<string, string> = {
  // CASE-05 영등포구 양평동4가 117, 134, 125-2 (사진 4장 + XLSX 3종)
  '01_외관_10층코너전면_세로형.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v3-holdout/case05/01_exterior_corner_portrait.jpg',
  '02_외관_대로변접면.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v3-holdout/case05/02_exterior_avenue.jpeg',
  '03_내부_승강기홀.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v3-holdout/case05/03_interior_elevator_portrait.jpg',
  '04_내부_기준층오피스.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v3-holdout/case05/04_interior_office_floor.jpeg',
  '02_현황_렌트롤_v1.5_pyeong.xlsx':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v3-holdout/case05/02_asis_rentroll_v1.5_pyeong.xlsx',
  '03_안정화_렌트롤_v1.5_pyeong.xlsx':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v3-holdout/case05/03_stabilized_rentroll_v1.5_pyeong.xlsx',
  '99_부록_V12_단위혼동_차단게이트_체험용.xlsx':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v3-holdout/case05/99_v12_unit_mismatch_trap.xlsx',

  // CASE-03 서초구 잠원동 26-14, 26-16 (사진 5장)
  '01_외관_코너전면대표.png':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v2-holdout/case03/01_exterior_corner.png',
  '02_외관_후면자주식주차장.png':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v2-holdout/case03/02_exterior_parking.png',
  '03_외관_인근신축개발상권.png':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v2-holdout/case03/03_exterior_district.png',
  '04_내부_기준층실내현황.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v2-holdout/case03/04_interior_floor.jpeg',
  '05_내부_옥상설비및조망.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v2-holdout/case03/05_interior_rooftop.jpeg',
};

export const HOLDOUT_V3_CASE05_MEMO =
  '서울특별시 영등포구 양평동4가 117, 134, 125-2 더레드빌딩 오피스빌딩 매각 250억, 3필지 대지 156.9평 / 연면적 753.5평(B1~10F, 2018년 신축급, 주차 23대), 현 보증금 6억 8,000만 / 월세 5,150만(8층·지하1층 공실 임대 완료 시 월 6,800만·수익률 3.38%), 9호선 급행 선유도역 도보 3분 사거리 코너, 1층 기아자동차 전시장 장기 성업중 (정전무 010-7788-9900)';

export const HOLDOUT_V3_CASE05_STABILIZED_TABLE = [
  '층\t호수\t업종\t임차인\t임대면적(㎡)\t전용면적(㎡)\t보증금(만원)\t월세(만원)\t관리비(만원)\t만기일\t상태',
  '10F\t1001호\t클라우드솔루션\t네오테크아이티\t191.74\t149.42\t6500\t510\t100\t2029-09-30\t임대중',
  '9F\t901호\t바이오연구법인\t한강바이오랩\t209.92\t163.64\t6500\t540\t110\t2029-02-28\t임대중',
  '8F\t801호\t핀테크오피스\t페이브릿지코리아\t209.92\t163.64\t7000\t540\t110\t2028-12-31\t임대중',
  '7F\t701호\t물류IT플랫폼\t로지스허브코리아\t209.92\t163.64\t6500\t530\t110\t2029-06-30\t임대중',
  '6F\t601호\t특허법률사무소\t선유국제특허\t209.92\t163.64\t6500\t530\t110\t2028-12-31\t임대중',
  '5F\t501호\t콘텐츠프로덕션\t스튜디오선유\t209.92\t163.64\t6500\t520\t110\t2029-07-31\t임대중',
  '4F\t401호\t건축엔지니어링\t서남종합기술\t209.92\t163.64\t6500\t520\t110\t2029-04-30\t임대중',
  '3F\t301호\t세무회계컨설팅\t정우회계법인서부\t209.92\t163.64\t6000\t510\t105\t2028-01-31\t임대중',
  '2F\t201호\t치과의원\t선유서울치과\t209.92\t163.64\t6000\t520\t105\t2028-10-31\t임대중',
  '1F\t101호\t완성차전시장\t직영모빌리티쇼룸\t198.35\t158.68\t20000\t1300\t150\t2028-09-30\t임대중',
  'B1\tB101호\t스크린골프·라운지\t더그린골프존\t421.45\t323.97\t10000\t780\t160\t2029-12-31\t임대중',
].join('\n');

export const HOLDOUT_V3_CASE03_ASIS_CSV = HOLDOUT_V2_CASE03_ASIS_CSV;
export const HOLDOUT_V3_CASE03_ASIS_TABLE = HOLDOUT_V2_CASE03_ASIS_TSV;
export const HOLDOUT_V3_CASE03_MEMO = HOLDOUT_V2_CASE03_MEMO;
export const HOLDOUT_V3_CASE03_STABILIZED_TABLE = HOLDOUT_V2_CASE03_STABILIZED_TSV;

function buildV3Images(
  folderSlug: 'v3-case05' | 'v2-case03',
  items: Array<{ filename: string; format: 'JPG' | 'PNG' | 'WEBP'; roleLabel: string; caption: string }>,
): TestGuideImageAsset[] {
  return items.map((item) => {
    const encoded = encodeURIComponent(item.filename);
    const baseUrl = `/api/public/testguide-assets/images/${folderSlug}/${encoded}`;
    return {
      ...item,
      previewUrl: baseUrl,
      downloadUrl: `${baseUrl}?download=1`,
    };
  });
}

const CASE05_IMAGES: TestGuideImageAsset[] = buildV3Images('v3-case05', [
  {
    filename: '01_외관_10층코너전면_세로형.jpg',
    format: 'JPG',
    roleLabel: '외부 1 · 10층 코너 전면(세로형)',
    caption: '선유도역 사거리 코너 10층 외관 전경 (세로 비율 유지 확인)',
  },
  {
    filename: '02_외관_대로변접면.jpeg',
    format: 'JPG',
    roleLabel: '외부 2 · 대로변 보행로 접면',
    caption: '대로변 보행로 및 1층 쇼룸 전면 진입 구간',
  },
  {
    filename: '03_내부_승강기홀.jpg',
    format: 'JPG',
    roleLabel: '내부 3 · 승강기 홀(세로형)',
    caption: '대리석 마감 엘리베이터 홀 내부',
  },
  {
    filename: '04_내부_기준층오피스.jpeg',
    format: 'JPG',
    roleLabel: '내부 4 · 기준층 오피스',
    caption: '기준층 업무공간 채광 및 레이아웃',
  },
]);

const CASE03_IMAGES: TestGuideImageAsset[] = buildV3Images('v2-case03', [
  {
    filename: '01_외관_코너전면대표.png',
    format: 'PNG',
    roleLabel: '외부 1 · 코너 전면 대표',
    caption: '잠원동 코너 전면 외관',
  },
  {
    filename: '02_외관_후면자주식주차장.png',
    format: 'PNG',
    roleLabel: '외부 2 · 후면 자주식 주차장',
    caption: '후면 자주식 주차장 및 대지 경계 현황',
  },
  {
    filename: '03_외관_인근신축개발상권.png',
    format: 'PNG',
    roleLabel: '외부 3 · 인근 신축 상권',
    caption: '본건 인접 신사역권 신축 개발 상권 전경',
  },
  {
    filename: '04_내부_기준층실내현황.jpeg',
    format: 'JPG',
    roleLabel: '내부 4 · 기준층 실내 현황',
    caption: '리모델링 전 기준층 업무공간 내부 현황',
  },
  {
    filename: '05_내부_옥상설비및조망.jpeg',
    format: 'JPG',
    roleLabel: '내부 5 · 옥상 설비 및 조망',
    caption: '옥상 방수 및 설비 공간 조망 현황',
  },
]);

export const FULL_LOOP_V3_WINDOW_ROLES: ReadonlyArray<FullLoopWindowRoleCard> = [
  {
    id: 'windowA',
    badge: '창 A · 필수',
    title: '중개사 작업 화면',
    device: 'PC 크롬 일반 창 (로그인 상태 · 화면 분할 가능)',
    purpose: '딜카드·IM·부동산뉴스 작성 및 고객 소통함 승인·링크 잠금/해제',
  },
  {
    id: 'windowB',
    badge: '창 B · 필수',
    title: '매수자 1 (고객 화면)',
    device: '스마트폰 카카오톡 "나와의 채팅" (또는 다른 시크릿 브라우저)',
    purpose: '신규 URL 카톡 썸네일 확인, 지번·상호 비공개 확인, 자료 요청 및 열람',
  },
  {
    id: 'windowC',
    badge: '창 C · 2번 매물용',
    title: '매수자 2 (비교 고객 화면)',
    device: 'PC 크롬 시크릿 창 (Ctrl+Shift+N, 비로그인 상태)',
    purpose: '매수자 1 링크만 잠갔을 때 매수자 2 링크는 계속 열리는지 비교',
  },
];

export const FULL_LOOP_V3_CASES: ReadonlyArray<FullLoopCaseDefinition> = [
  {
    id: 'loop1',
    probeLoopId: 'v3-loop1',
    code: 'LOOP-01',
    tabLabel: 'V3 매물 1 · 양평동 250억 평단위 엑셀',
    shortLabel: '매물 1 · 영등포 양평동4가 250억 (3필지 · 평 단위 엑셀 .xlsx · 세로형 사진 4장)',
    title: '실전 #1 — 양평동4가 250억 프라임 코너 오피스 (평 단위 엑셀 · 공실 2개층 · 월간 뉴스 · 소속 표시 소통함)',
    subtitle:
      '처음 다루는 양평동 3필지(250억) 매물로 평 단위 엑셀 자동 환산, 단위 혼동 안전 안내, 공실 보증금 비활성화, 세로형 사진 비율, 카톡 새 썸네일, 고객 소속 표시까지 한 번에 확인합니다.',
    targetMinutes: 18,
    personaFocus: '빌딩 전담 대표 공인중개사(평 단위 엑셀 · 분할화면) × 자산운용사 상무(매수자)',
    deviceSetup: '창 A(PC 크롬 로그인) + 창 B(스마트폰 카카오톡)',
    sampleKitZipUrl: '/api/public/qa-sample-kit?scenario=v3-loop1',
    csvDownloadUrl: '/api/public/qa-sample-kit?scenario=v3-loop1&format=xlsx',
    primarySheetLabel: '📊 1. 현황 엑셀 받기 (V3_평단위.xlsx)',
    secondarySheetDownloadUrl: '/api/public/qa-sample-kit?scenario=v3-loop1&format=xlsx-stabilized',
    secondarySheetLabel: '📊 2. 기대수익률 엑셀 받기 (V3_평단위.xlsx)',
    dealCode: 'HOLDOUT-V3-CASE-05',
    propertyName: '양평동4가 117외2 프라임 코너 오피스',
    jibunAddress: '서울특별시 영등포구 양평동4가 117, 134, 125-2',
    roadAddress: '서울특별시 영등포구 선유동2로 73',
    askingPriceReadout: '250억 원 (2,500,000만 원)',
    domainTraps: [
      {
        code: '확인 1',
        title: '평 단위 엑셀(753.5평) 자동 ㎡ 환산 & 단위 혼동 안전 차단',
        detail:
          'V3_02_양평동_현황_렌트롤_v1.5_pyeong.xlsx 업로드 시 예시행(13행) 제외 보증금 6억 8,000만·월세 5,150만(연 2.54%)으로 정확히 합산되고, 부록 파일 업로드 시 단위 혼동 경고가 뜨는지 확인합니다.',
      },
      {
        code: '확인 2',
        title: '공실 2개층(8F·B1) 보증금 비활성 & 기대수익률 상단 배지 전환(3.38%)',
        detail:
          '공실 행의 보증금 칸이 비활성 보호되고, [+ 기대수익률 임대차 현황] 탭으로 넘어가면 상단 요약 배지가 보증금 8억 8,000만·월세 6,800만·연 3.38%로 즉시 전환되는지 봅니다.',
      },
      {
        code: '확인 3',
        title: '3필지·대기업 전시장 상호 비공개 & 세로형 사진·신규 URL 카톡 썸네일',
        detail:
          '양평동4가 번지·더레드빌딩·기아자동차가 숨겨지고, 세로형 10층 외관 사진 왜곡 없음과 처음 공유하는 링크의 카톡 미리보기 썸네일을 확인합니다.',
      },
    ],
    images: CASE05_IMAGES,
    groundTruth: {
      expectedLandAreaSqm: 518.7,
      expectedLandAreaPyeong: 156.91,
      expectedGfaSqm: 2490.88,
      expectedGfaPyeong: 753.49,
      areaToleranceSqm: 15,
      forbiddenPublicTokens: [
        '양평동4가 117',
        '125-2',
        '선유동2로 73',
        '더레드빌딩',
        '기아자동차',
        '010-7788-9900',
        '정전무',
      ],
      expectedDepositSummary: '현황 보증금 6억 8,000만 / 월세 5,150만 → 기대 보증금 8억 8,000만 / 월세 6,800만',
      expectedMonthlyRentSummary: '현황 월 5,150만 (관리비 980만) → 기대 월 6,800만 (관리비 1,280만)',
      expectedOccupancySummary:
        '총 11개 층 중 8F(63.5평)·B1(127.5평) 2개 층 공실 (임대 9개 층)',
      expectedYieldSummary: '현황 연 2.54% → 공실 2개 층 임대 완료 시 연 3.38%',
    },
    steps: [
      {
        id: 'V3-L1-S1',
        loopId: 'loop1',
        stepNumber: 1,
        subsystem: '프로필·법정표기',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 2,
        severityOnFail: 'S1',
        title: '내 프로필 법정 5항목 · 상단 [아주 크게] 글씨 · 하단 사업자 고지 확인',
        workspaceHref: '/broker/profile',
        workspaceLabel: '내 프로필 열기',
        actionChecklist: [
          '파란 [🚀 내 프로필 열기] 클릭 → 상호·소재지·연락처·개설등록번호·대표자 성명 5칸이 채워져 있는지 봅니다 (비어 있으면 아래 복사 칩으로 채운 뒤 [💾 내 프로필 · 사무소 정보 저장하기] 클릭). → 화면 확인: 저장 완료 안내 표시.',
          '상단 메뉴 [📄 딜카드] 클릭 → 상단 바 글자 크기 중 [아주 크게]를 눌러 분할화면에서도 버튼이 밖으로 밀리지 않는지 본 뒤 편한 글자 크기로 되돌립니다. 또한 이용약관(/terms) 하단에 "제이에스부동산중개(주)" 사업자 고지가 표시되는지 가볍게 확인합니다.',
        ],
        copySnippets: [
          {
            id: 'v3-h1-prof-company',
            label: '중개사무소 상호 예시 복사',
            targetHint: '내 프로필 → 중개사무소 명칭 칸',
            value: '제이에스부동산중개(주)',
          },
          {
            id: 'v3-h1-prof-reg',
            label: '개설등록번호 예시 복사',
            targetHint: '내 프로필 → 개설등록번호 칸',
            value: '11680-2025-04821',
          },
        ],
        humanFocus: '화면 분할 상태에서도 상단 글자 크기 버튼이 잘 보이고 글자가 잘리지 않는지 확인합니다.',
        autoProbeFocus: '중개사무소 법정 필수 5항목 저장 여부를 확인합니다.',
        oracleReference: '법정 표기 5항목 저장됨 · [아주 크게] 모드 잘림 없음 · 사업자 고지 정상',
      },
      {
        id: 'V3-L1-S2',
        loopId: 'loop1',
        stepNumber: 2,
        subsystem: '딜카드',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '새 딜카드 만들기 → 양평동 250억 메모 생성 → [카톡으로 보내기] 팝업 [링크 복사]',
        workspaceHref: '/broker/w/dealcards?new=1',
        workspaceLabel: '새 딜카드 작성 화면 열기',
        actionChecklist: [
          '파란 [🚀 새 딜카드 작성 화면 열기] 클릭 → 아래 [📋 1. 양평동 250억 현장 메모 복사]를 상단 "원본 매물 메모" 칸에 붙여넣고(Ctrl+V), 바로 아래 파란 [✨ 메모로 딜카드 생성하기] 버튼을 누릅니다.',
          '→ 화면 확인: 지역 "영등포구 양평동", 가격 "240~260억", 면적 "연면적 753평"이 채워지고 "117", "더레드빌딩", "기아자동차", "정전무"는 모두 가려집니다. 필요 시 [📋 2. 한 줄 제목 복사 (17자)]를 한 줄 제목 칸에 붙여넣습니다.',
          '화면 맨 아래 파란 [카톡으로 보내기] 클릭 → 열리는 팝업창의 흰색 [링크 복사] 버튼 클릭 → 바로 아래 ①번 칸에 붙여넣습니다(Ctrl+V).',
        ],
        copySnippets: [
          {
            id: 'v3-h1-dc-memo',
            label: '1. 양평동 250억 현장 메모 복사 (3필지)',
            targetHint: '새 딜카드 상단 → 원본 매물 메모 칸에 붙여넣기 후 [✨ 메모로 딜카드 생성하기] 클릭',
            value: HOLDOUT_V3_CASE05_MEMO,
          },
          {
            id: 'v3-h1-dc-headline',
            label: '2. 한 줄 제목 복사 (17자 · 18자 제한 맞춤)',
            targetHint: '딜카드 하단 → 한 줄 제목 (18자 이내) 입력칸',
            value: '선유도역 3분 코너 10층 신축급',
            isPublicFacing: true,
          },
        ],
        inlineScratchFields: [
          {
            field: 'dealCardUrl',
            label: '① [카톡으로 보내기] 팝업의 [링크 복사] 주소 붙여넣기 (/dc/...)',
            placeholder: 'https://www.credeal.net/dc/... (여기에 Ctrl+V 붙여넣기)',
            helperText: '붙여넣은 뒤 옆의 [이 링크 바로 점검]을 누르면 비공개 보호 통과 여부가 즉시 표시됩니다.',
          },
        ],
        humanFocus: '메모 생성 한 번으로 3필지 번지와 대기업 전시장 상호가 깔끔히 가려지는지 확인합니다.',
        autoProbeFocus: '딜카드 주소에 양평동4가 117·125-2·더레드빌딩·기아자동차·전화번호 노출 0건을 점검합니다.',
        oracleReference: '영등포구 양평동 · 240~260억 · 연면적 753평 · 비공개 단어 노출 0건',
      },
      {
        id: 'V3-L1-S3',
        loopId: 'loop1',
        stepNumber: 3,
        subsystem: 'IM·발표자료',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 5,
        severityOnFail: 'S0',
        title: '새 IM 3필지 조회(518.7㎡) → 평 단위 엑셀(.xlsx) 업로드 & 공실/배지 확인 → 세로형 사진 4장 & [🔗 IM 링크 복사]',
        workspaceHref: '/broker/w/im?fresh=1',
        workspaceLabel: '새 IM 작성 화면 열기',
        actionChecklist: [
          '이 화면 맨 위 파란 [📦 전체 테스트 자료 ZIP 받기]를 받아 압축을 풀어 둡니다 (파일명이 모두 V3_로 시작해 이전 파일과 섞이지 않습니다).',
          '파란 [🚀 새 IM 작성 화면 열기] 클릭 → ① 표지·기본정보의 "건물 주소 *" 칸에 [📋 1. 3필지 주소 복사]를 붙여넣고 [주소로 건물 정보 자동 채우기] 클릭 → 희망 매매가 [억 단위] 칸에 "250" 입력! → 화면 확인: 대지면적 "518.7"(약 157평) · 연면적 "2490.88"(약 753평) · "= 250억 원".',
          '상단 [② 층별 임대현황] 탭 클릭 → [📁 엑셀 파일 불러오기 ▾] 클릭 → (선택 체험: ZIP 안 "V3_99_선택체험_단위혼동_차단확인용.xlsx"를 먼저 올려 면적 단위 혼동 차단 안내를 본 뒤) "V3_02_양평동_현황_렌트롤_v1.5_pyeong.xlsx" 파일을 올립니다. → 화면 확인: [✓ 표에 적용하기]를 누르기 전 미리보기에서부터 예시행 제외 11개 층 합계와 예상 수익률("연 2.54%")이 즉시 표시되며, [✓ 표에 적용하기] 클릭 후 "보증금 6억 8,000만 원 · 월세 5,150만 원 · 연 2.54%" 및 8F·B1 공실 보증금 칸 비활성 보호가 반영됩니다.',
          '옆 [+ 기대수익률 임대차 현황 (선택)] 탭 클릭 → [📁 엑셀 파일 불러오기 ▾]로 "V3_03_양평동_기대수익률_렌트롤_v1.5_pyeong.xlsx" 업로드(또는 아래 [📋 3. 기대수익률 11행 표 복사] 후 파란 [📋 표 붙여넣기] 클릭)! → 화면 확인: 엑셀 미리보기에서도 [✓ 표에 적용하기] 클릭 전부터 예상 기대수익률("연 3.38%")이 즉시 표시되며, [✓ 표에 적용하기] 클릭 즉시 상단 요약 배지가 "보증금 8억 8,000만 원 · 월세 6,800만 원 · 연 3.38%"로 전환됩니다.',
          '상단 [③ 장점 3가지] 탭 클릭 → 시작 안내 카드 또는 상단 보라색 [AI로 쓰기] 버튼을 1번 눌러 핵심 장점 3가지를 자동 채우기로 작성한 뒤(이미 채워졌으면 내용 확인 후) 다음 단계로 이동합니다.',
          '상단 [④ 사진·위치·만들기] 탭 클릭 → V3 사진 4장(세로형 10층 외관·승강기 포함)을 올리고 파란 [IM 만들기] 클릭 → 완료 후 바로 옆(또는 하단 바) 초록색 [🔗 IM 링크 복사] 버튼을 눌러 아래 ②번 칸에 붙여넣고, [📥 PPTX 받기]로 발표자료를 내려받아 확인합니다.',
        ],
        copySnippets: [
          {
            id: 'v3-h1-im-addr',
            label: '1. 3필지 지번 주소 복사 (양평동4가 117, 134, 125-2)',
            targetHint: 'IM ① 표지·기본정보 → 건물 주소 칸 붙여넣기 후 [주소로 건물 정보 자동 채우기] 클릭',
            value: '서울특별시 영등포구 양평동4가 117, 134, 125-2',
          },
          {
            id: 'v3-h1-im-price-eok',
            label: '2. 희망 매매가 억 단위 복사 (250)',
            targetHint: 'IM ① 표지·기본정보 → 희망 매매가 [억 단위] 칸',
            value: '250',
          },
          {
            id: 'v3-h1-im-stabilized-table',
            label: '3. (선택) 기대수익률 11행 표 복사',
            targetHint: '복사 후 IM [+ 기대수익률 임대차 현황] 탭의 파란 [📋 표 붙여넣기] 버튼 1번 클릭',
            value: HOLDOUT_V3_CASE05_STABILIZED_TABLE,
          },
        ],
        inlineScratchFields: [
          {
            field: 'imShareUrl',
            label: '② 초록색 [🔗 IM 링크 복사] 버튼으로 복사한 IM 주소 붙여넣기 (/im-lite/...)',
            placeholder: 'https://www.credeal.net/im-lite/... (여기에 Ctrl+V 붙여넣기)',
            helperText: '분할화면에서도 [IM 만들기] 바로 옆과 하단 바에 초록색 [🔗 IM 링크 복사] 버튼이 나타납니다.',
          },
        ],
        humanFocus: '평 단위 엑셀이 ㎡로 정확히 환산되고, 기대수익률 탭 클릭 시 상단 수익률 배지가 2.54%에서 3.38%로 바로 바뀌는지 확인합니다.',
        autoProbeFocus: '대지면적(518.7㎡)·연면적(2,490.88㎡) 정합성과 단일 건물 ID 연결 및 IM 열람 가능 상태를 점검합니다.',
        oracleReference: '현황 연 2.54%(보 6.8억/월 5,150만) → 기대 연 3.38%(보 8.8억/월 6,800만) · 세로형 사진 비율 정상',
      },
      {
        id: 'V3-L1-S4',
        loopId: 'loop1',
        stepNumber: 4,
        subsystem: '뉴스레터',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S1',
        title: '월간 부동산뉴스 작성 · 양평동 매물 연결 · F5 새로고침 유지 · 발행일 일치 확인',
        workspaceHref: '/broker/w/newsletter',
        workspaceLabel: '부동산뉴스 작업실 열기',
        actionChecklist: [
          '파란 [🚀 부동산뉴스 작업실 열기] 클릭 → [제목] 탭 상단 발행 주기에서 [월간]이 선택되어 있는지 확인(또는 상단 [매물 선택/목록] 서랍의 [이번 달 뉴스레터 새로 쓰기] 클릭)한 뒤, [제목] → [내용] 탭에 아래 복사 칩 3개를 붙여넣고 방금 만든 양평동 매물을 추천 매물로 선택합니다.',
          '키보드 F5(새로고침)를 눌러 작성한 제목과 본문이 그대로 유지되는지 확인합니다.',
          '[보내기] 탭으로 이동해 하단 파란 [구독자에게 보내기](야간 시간대에는 안내 배너 확인 후 같은 탭의 흰색 [링크 복사])를 눌러 공개 주소를 아래 ④번 칸에 붙여넣고, 스마트폰(창 B) 카카오톡 "나와의 채팅"에도 보내 둡니다. → 화면 확인: 공개 뉴스레터 상단 발행일이 오늘 날짜와 일치하고 카톡 썸네일이 선명하게 표시됨.',
        ],
        copySnippets: [
          {
            id: 'v3-h1-nl-title',
            label: '1. 월간 부동산뉴스 표지 제목 복사',
            targetHint: '부동산뉴스 [제목] 탭 → 표지 제목 입력칸',
            value: '9호선 급행 역세권 준공업지역 코너 신축급 오피스의 공실 해소 수익률 상승 전략',
            isPublicFacing: true,
          },
          {
            id: 'v3-h1-nl-brief',
            label: '2. 시장 브리핑 본문 복사',
            targetHint: '부동산뉴스 [내용] 탭 → 시장 브리핑 본문 입력칸',
            value:
              '여의도와 마곡 업무지구를 직결하는 9호선 급행 역세권 준공업지역은 용적률 약 400% 규모의 준신축 코너 빌딩 공급이 귀해 사옥 및 수익형 투자 수요가 견조합니다. 특히 1층 대기업 직영 쇼룸 등 우량 핵심 임차인이 자리 잡은 상태에서 일부 공실 층만 시세대로 채우면 즉각적인 현금흐름 상승을 기대할 수 있습니다.',
            isPublicFacing: true,
          },
          {
            id: 'v3-h1-nl-comment',
            label: '3. 추천 매물 한 줄 소개 복사 (지번 비노출)',
            targetHint: '부동산뉴스 [내용] 탭 → 추천 매물 코멘트 입력칸',
            value:
              '9호선 급행역 도보 3분 사거리 코너 10층 준신축 오피스 · 잔여 2개 층 임대 완료 시 월세 +1,650만원 상승 여력',
            isPublicFacing: true,
          },
        ],
        inlineScratchFields: [
          {
            field: 'newsletterUrl',
            label: '④ 발행된 월간 부동산뉴스 주소 붙여넣기 (/magazine/...)',
            placeholder: 'https://www.credeal.net/magazine/... (여기에 Ctrl+V 붙여넣기)',
          },
        ],
        humanFocus: '새 매물 링크를 카톡에 붙여넣었을 때 썸네일이 깨지지 않고, 뉴스레터 상단 날짜가 오늘 날짜로 일치하는지 봅니다.',
        autoProbeFocus: '발행된 부동산뉴스에 양평동4가 117·125-2·더레드빌딩·기아자동차 노출 0건을 점검합니다.',
        oracleReference: 'F5 새로고침 유지 · 오늘 발행일 일치 · 비공개 단어 노출 0건',
      },
      {
        id: 'V3-L1-S5',
        loopId: 'loop1',
        stepNumber: 5,
        subsystem: '매수자 열람·문의',
        windowBadge: '창 B (스마트폰 카톡 매수자 1)',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '고객 화면 열람 · 매수자(최재원 상무 · 코람코자산신탁) 자료 요청 & [둘 다 받기] 구독 신청',
        actionChecklist: [
          '창 B(스마트폰 카카오톡 또는 시크릿 창)에서 방금 보낸 부동산뉴스 링크를 열고 추천 매물 딜카드 → [상세 제안서(IM) 요청] 버튼을 누른 뒤, 아래 복사 칩 5개(이름 · 연락처 · 이메일 · 소속 · 문의 내용)를 채워 제출합니다.',
          '부동산뉴스 하단 "뉴스레터 신청" 카드 상단의 3개 버튼([이메일로 받기] · [휴대폰으로 받기] · [둘 다 받기]) 중 오른쪽 [둘 다 받기]를 클릭합니다. → 화면 확인: 휴대폰 칸과 이메일 칸 2개가 동시에 열립니다.',
          '연락처(010-5842-7390)와 이메일(jw.choi@koramco-test.kr)을 넣고 필수 동의 체크 후 [뉴스레터 신청하기]를 누릅니다. (참고: PC에서 중개사 전화번호 버튼을 누르면 빈 앱 창 대신 "전화번호가 복사되었습니다" 안내가 뜹니다.)',
        ],
        copySnippets: [
          {
            id: 'v3-h1-buyer-name',
            label: '매수자 이름 복사 (최재원 상무)',
            targetHint: '자료 요청 창 → 이름 (필수)',
            value: '최재원 상무',
          },
          {
            id: 'v3-h1-buyer-phone',
            label: '매수자 연락처 복사 (010-5842-7390)',
            targetHint: '자료 요청 창 · 뉴스 구독 [둘 다 받기] 휴대폰 칸',
            value: '010-5842-7390',
          },
          {
            id: 'v3-h1-buyer-email',
            label: '매수자 이메일 복사 (jw.choi@koramco-test.kr)',
            targetHint: '자료 요청 창 · 뉴스 구독 [둘 다 받기] 이메일 칸',
            value: 'jw.choi@koramco-test.kr',
          },
          {
            id: 'v3-h1-buyer-company',
            label: '소속 · 기관명 복사 (코람코자산신탁)',
            targetHint: '자료 요청 창 → 소속 · 기관명',
            value: '코람코자산신탁',
          },
          {
            id: 'v3-h1-buyer-msg',
            label: '문의 내용 복사',
            targetHint: '자료 요청 창 → 문의 내용',
            value: '선유도역 코너 오피스 편입 검토 중입니다. 8층·지하1층 공실 임대 조건과 상세 수지표 요청드립니다.',
          },
        ],
        humanFocus: '[둘 다 받기] 선택 시 휴대폰과 이메일 두 칸이 함께 열리고 신청 완료 안내가 명확한지 확인합니다.',
        autoProbeFocus: '신규 연락처(010-5842-7390)가 소통함과 구독자 명단에 정상 접수되었는지 점검합니다.',
        oracleReference: '모바일 가독성 양호 · 소속 포함 자료 요청 및 [둘 다 받기] 구독 접수 완료',
      },
      {
        id: 'V3-L1-S6',
        loopId: 'loop1',
        stepNumber: 6,
        subsystem: '고객 소통(승인·회수)',
        windowBadge: '창 A ↔ 창 B',
        targetMinutes: 2,
        severityOnFail: 'S0',
        title: '고객 소통함에서 소속·이메일 확인 → [자료 보내기(승인)] 클릭 → 인라인 전용 링크 열람',
        workspaceHref: '/broker/w/inbox',
        workspaceLabel: '고객 소통함 열기',
        actionChecklist: [
          '창 A에서 파란 [🚀 고객 소통함 열기] 클릭 → 상단 [지금 할 일] 배너의 [확인·승인하기 ›](또는 고객 목록)에서 "최재원 상무"를 선택합니다. → 화면 확인: 고객 이름 옆에 소속("코람코자산신탁")과 파란 [✉️ 이메일: jw.choi@koramco-test.kr] 칩이 함께 표시됩니다.',
          '가운데 [할 일] 탭의 초록색 [자료 보내기(승인)] 버튼을 1번 클릭합니다. → 화면 확인: 분할화면에서도 바로 그 자리에 초록색 "✓ 승인 및 전용 링크 발급 완료" 카드와 전용 주소(?token=...)가 계속 남아 있습니다.',
          '초록색 카드 안의 [🔗 전용 링크 복사] 버튼을 눌러 아래 ②번 칸에 덮어써서 붙여넣고, 창 B에서도 열어 11개 층 표와 기대수익률(3.38%)·세로형 사진 4장이 모두 열리는지 확인합니다.',
        ],
        copySnippets: [
          {
            id: 'v3-h1-ib-memo',
            label: '상담 메모 예시 복사',
            targetHint: '고객 소통함 → [기록] 탭 메모칸',
            value: '최재원 상무(코람코자산신탁) 승인 완료 — 8층·지하1층 임대차 견적 및 3필지 토지 내역 전달',
          },
        ],
        inlineScratchFields: [
          {
            field: 'imShareUrl',
            label: '② 소통함 [🔗 전용 링크 복사]로 복사한 승인 링크 붙여넣기',
            placeholder: 'https://www.credeal.net/im-lite/...?token=... (여기에 Ctrl+V)',
          },
        ],
        humanFocus: '분할화면에서도 별도 창을 열지 않고 가운데 [할 일] 탭 카드에서 바로 전용 링크를 보고 복사할 수 있는지 확인합니다.',
        autoProbeFocus: '승인 전용 링크 활성 상태 및 최재원 상무 소통함 스레드 병합을 점검합니다.',
        oracleReference: '소속·이메일 표시 정상 · 인라인 전용 링크 영구 표시 · 고객 전체 IM 열람 성공',
      },
      {
        id: 'V3-L1-S7',
        loopId: 'loop1',
        stepNumber: 7,
        subsystem: '오라클·보안마감',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 1,
        severityOnFail: 'S1',
        title: '매물 1 자동 점검 실행 및 단계별 판정 기록',
        actionChecklist: [
          '화면 아래(또는 옆) "실시간 링크·면적 자동 점검기"의 파란색 [🔍 입력한 링크·면적 자동 점검 실행] 버튼을 누릅니다.',
          '→ 화면 확인: 대지(518.7㎡)·연면적(2,490.88㎡), 딜카드·뉴스 비공개 보호, 승인 링크 활성, 고객 등록 항목이 모두 초록색 통과인지 확인하고 각 단계의 [✅ 통과 / ✨ 손질 필요 / 🚨 결함]을 눌러 기록합니다.',
        ],
        copySnippets: [],
        humanFocus: '평 단위 엑셀 업로드부터 소통함 승인까지 헷갈리거나 멈칫한 곳이 있었다면 메모칸에 한 줄로 적어 주세요.',
        autoProbeFocus: '양평동 3필지 면적·비공개 보호·승인 링크·구독자 등록을 일괄 대조합니다.',
        oracleReference: '자동 점검 전 항목 통과 · 중복 매물 생성 없음',
      },
    ],
  },
  {
    id: 'loop2',
    probeLoopId: 'v3-loop2',
    code: 'LOOP-02',
    tabLabel: 'V3 매물 2 · 잠원동 242억 신축·주간뉴스',
    shortLabel: '매물 2 · 서초 잠원동 242억 (신축·개발 토지 186평 · 주간 뉴스 · 링크 개별 잠금/해제)',
    title: '실전 #2 — 잠원동 242억 신축·개발 부지 (토지 186평 3자 일치 · 주간 뉴스 · 매수자 2명 개별 잠금/해제)',
    subtitle:
      '아직 다루지 않은 잠원동 2필지(242억 2,680만 원)로 신축·개발용 토지 평수(약 186평)가 딜카드·IM·주간 뉴스 3곳에서 일치하는지 확인하고, 매수자 2명 개별 잠금·해제와 고객 정보 수정을 검증합니다.',
    targetMinutes: 18,
    personaFocus: '개발 부지 전담 중개사 × 개발사 대표(창 B) · 메디컬 원장(창 C)',
    deviceSetup: '창 A(PC 크롬 로그인) + 창 B(스마트폰 카톡: 매수자 1) + 창 C(PC 시크릿 창: 매수자 2)',
    sampleKitZipUrl: '/api/public/qa-sample-kit?scenario=v3-loop2',
    csvDownloadUrl: '/api/public/qa-sample-kit?scenario=v3-loop2&format=csv',
    primarySheetLabel: '📊 잠원동 현행 임대현황 CSV 받기 (V3)',
    dealCode: 'HOLDOUT-V3-CASE-03',
    propertyName: '잠원동 26-14외1 신축·개발 부지',
    jibunAddress: '서울특별시 서초구 잠원동 26-14, 26-16',
    roadAddress: '서울특별시 서초구 신반포로47길 9-6',
    askingPriceReadout: '242억 2,680만 원 (2,422,680만 원)',
    domainTraps: [
      {
        code: '확인 1',
        title: '신축·개발용 토지 평수(약 186평) 딜카드 · IM · 주간 뉴스 3곳 일치',
        detail:
          '신축·개발용으로 만들었을 때 딜카드 면적 칸, IM 표지, 주간 부동산뉴스 추천 매물 카드 3곳 모두 연면적 대신 토지면적(약 186평 · 616.1㎡) 기준으로 일관되게 표시되는지 확인합니다.',
      },
      {
        code: '확인 2',
        title: '억/만원 분리 입력(242억 2,680만) · 면적 뒤바뀜 복구 · 표 붙여넣기("업종 / 상호")',
        detail:
          '연면적↔대지면적 뒤바뀜 1클릭 복구와 파란 [📋 표 붙여넣기] 클릭 시 열 제목("업종 / 상호") 및 대수선 전후 수익률(1.37% → 4.14%)이 정확히 들어가는지 확인합니다.',
      },
      {
        code: '확인 3',
        title: '매수자 1 링크만 잠금/다시 열기 vs 건물 전체 잠금 & 고객 [정보 수정]',
        detail:
          '윤성호 대표(창 B) 링크만 잠갔을 때 송미경 원장(창 C) 링크는 계속 열리고, [🔓 링크 다시 열기]와 건물 전체 잠금·고객 [정보 수정]이 정확히 동작하는지 확인합니다.',
      },
    ],
    images: CASE03_IMAGES,
    groundTruth: {
      expectedLandAreaSqm: 616.1,
      expectedLandAreaPyeong: 186.37,
      expectedGfaSqm: 2032.59,
      expectedGfaPyeong: 614.86,
      areaToleranceSqm: 15,
      forbiddenPublicTokens: [
        '26-14',
        '26-16',
        '신반포로47길 9-6',
        '두원빌딩',
        '02-544-8784',
        '임사장',
      ],
      expectedDepositSummary: '현황 보증금 3억 9,000만 / 월세 2,720만 → 대수선 후 보증금 10억 3,000만 / 월세 8,000만',
      expectedMonthlyRentSummary: '현황 월 2,720만 (관리비 470만) → 대수선 후 월 8,000만 (관리비 1,150만)',
      expectedOccupancySummary: '6개 층 중 4층 공실 1건 · 5층/지하1층 계약만기 경과(명도 협의 대상)',
      expectedYieldSummary: '현황 연 1.37% → 메디컬 대수선 완료 시 연 4.14%',
    },
    steps: [
      {
        id: 'V3-L2-S1',
        loopId: 'loop2',
        stepNumber: 1,
        subsystem: '프로필·법정표기',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 2,
        severityOnFail: 'S0',
        title: '가짜 등록번호(11680-2024-00123) 저장 차단 확인 후 정상 번호 복원',
        workspaceHref: '/broker/profile',
        workspaceLabel: '내 프로필 열기',
        actionChecklist: [
          '파란 [🚀 내 프로필 열기] 클릭 → "개설등록번호" 칸에 [📋 1. 차단 확인용 예시 번호 복사]를 붙여넣고 [💾 내 프로필 · 사무소 정보 저장하기] 클릭! → 화면 확인: 예시 번호 저장 차단 안내가 표시됩니다.',
          '다시 [📋 2. 정상 등록번호 복원용 복사]를 붙여넣고 [💾 내 프로필 · 사무소 정보 저장하기]를 눌러 정상 상태로 복원합니다.',
        ],
        copySnippets: [
          {
            id: 'v3-h2-bad-reg',
            label: '1. 차단 확인용 예시 번호 복사',
            targetHint: '내 프로필 → 개설등록번호 칸 (저장 차단 확인용)',
            value: '11680-2024-00123',
          },
          {
            id: 'v3-h2-good-reg',
            label: '2. 정상 등록번호 복원용 복사',
            targetHint: '내 프로필 → 개설등록번호 칸 (확인 후 반드시 복원 저장)',
            value: '11680-2025-04821',
          },
        ],
        humanFocus: '가짜 예시 번호 차단 안내 문구가 명확한지 확인합니다.',
        autoProbeFocus: '정상 등록번호 복원 후 법정 필수 정보 유효 상태를 확인합니다.',
        oracleReference: '예시 번호 차단 · 정상 번호 복원 저장 완료',
      },
      {
        id: 'V3-L2-S2',
        loopId: 'loop2',
        stepNumber: 2,
        subsystem: 'IM·발표자료',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 5,
        severityOnFail: 'S0',
        title: '새 IM [신축·개발용] · 2필지(616.1㎡) · 면적 뒤바뀜 복구 · [📋 표 붙여넣기] · 사진 5장',
        workspaceHref: '/broker/w/im?fresh=1',
        workspaceLabel: '새 IM 작성 화면 열기',
        actionChecklist: [
          '파란 [🚀 새 IM 작성 화면 열기] 클릭 → ① 표지·기본정보 맨 위 "어떤 매물인가요?"에서 [신축·개발용] 카드를 클릭합니다.',
          '"건물 주소 *" 칸에 [📋 1. 2필지 지번 주소 복사]를 붙여넣고 [주소로 건물 정보 자동 채우기] 클릭 → 화면 확인: 2필지 합산 대지면적 "616.1"(약 186평) · 연면적 "2032.59"(약 615평).',
          '(실수 복구 체험) 일부러 연면적에 "616.1", 대지면적에 "2032.59"를 반대로 적어 노란 경고창의 [⇄ 연면적·대지면적 값 서로 바꾸기] 버튼을 눌러 즉시 복구되는지 확인한 뒤, 희망 매매가 [억 단위]에 "242", 옆 [만원 단위]에 "2680"을 입력합니다(= 242억 2,680만 원).',
          '[② 층별 임대현황] 탭 클릭 → [📋 4. 현행 6행 표 복사] 클릭 후 IM 화면의 파란 [📋 표 붙여넣기] 클릭(연 1.37%, 열 순서 "업종 / 상호" 확인) → 옆 [+ 기대수익률 임대차 현황 (선택)] 탭 클릭 후 [📋 5. 기대수익률 6행 표 복사] → 파란 [📋 표 붙여넣기] 클릭(상단 배지 연 4.14% 확인).',
          '[③ 장점 3가지] 탭 클릭 → 시작 안내 카드 또는 상단 보라색 [AI로 쓰기] 1클릭으로 핵심 장점 3가지를 자동 채운 뒤(이미 채워져 있으면 확인 후) 다음 단계로 이동합니다.',
          '[④ 사진·위치·만들기] 탭에 잠원동 사진 5장을 올리고 파란 [IM 만들기] 클릭 후 [📥 PPTX 받기]를 실행합니다.',
        ],
        copySnippets: [
          {
            id: 'v3-h2-im-addr',
            label: '1. 2필지 지번 주소 복사 (잠원동 26-14, 26-16)',
            targetHint: 'IM ① 표지·기본정보 → 건물 주소 칸 붙여넣기 후 자동 채우기 클릭',
            value: '서울특별시 서초구 잠원동 26-14, 26-16',
          },
          {
            id: 'v3-h2-im-eok',
            label: '2. 억 단위 복사 (242)',
            targetHint: 'IM ① 표지·기본정보 → [억 단위] 칸',
            value: '242',
          },
          {
            id: 'v3-h2-im-man',
            label: '3. 만원 단위 복사 (2680)',
            targetHint: 'IM ① 표지·기본정보 → [만원 단위] 칸',
            value: '2680',
          },
          {
            id: 'v3-h2-im-asis-table',
            label: '4. 현행 6행 표 복사 (만기경과 2개층 포함)',
            targetHint: '복사 후 IM [현행 임대차 현황]의 파란 [📋 표 붙여넣기] 클릭',
            value: HOLDOUT_V3_CASE03_ASIS_TABLE,
          },
          {
            id: 'v3-h2-im-stab-table',
            label: '5. 기대수익률 6행 표 복사 (연 4.14%)',
            targetHint: '복사 후 IM [+ 기대수익률 임대차 현황]의 파란 [📋 표 붙여넣기] 클릭',
            value: HOLDOUT_V3_CASE03_STABILIZED_TABLE,
          },
        ],
        humanFocus: '[⇄ 연면적·대지면적 값 서로 바꾸기]와 파란 [📋 표 붙여넣기] 한 번 클릭 동작이 매끄러운지 봅니다.',
        autoProbeFocus: '2필지 합산 대지면적(616.1㎡)·연면적(2,032.59㎡) 정합성을 자동 점검합니다.',
        oracleReference: '242억 2,680만 원 · 대지 616.1㎡ / 연면적 2,032.59㎡ · 1.37% → 4.14%',
      },
      {
        id: 'V3-L2-S3',
        loopId: 'loop2',
        stepNumber: 3,
        subsystem: 'IM·발표자료',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 2,
        severityOnFail: 'S0',
        title: '하단 [발표자료 꾸미기] 슬라이드 토글 & 검수 화면 민감 섹션 숨김 저장',
        workspaceHref: '/broker/w/im',
        workspaceLabel: 'IM 작업실 열기',
        actionChecklist: [
          'IM 작업실 하단 바의 흰색 [발표자료 꾸미기] 버튼을 눌러 슬라이드 1개의 포함/제외 스위치를 껐다 켜고 저장합니다.',
          '승인·검수 화면(/broker/im-approval/[건물ID])에서 민감한 섹션 1개를 숨김으로 바꾸고 저장합니다 (비밀유지 서약 필요 스위치가 있으면 함께 확인).',
        ],
        copySnippets: [
          {
            id: 'v3-h2-dc-memo',
            label: '잠원동 신축·개발 현장 메모 복사 (다음 단계 딜카드용)',
            targetHint: '새 딜카드 상단 → 원본 매물 메모 입력칸',
            value: HOLDOUT_V3_CASE03_MEMO,
          },
        ],
        humanFocus: '슬라이드 포함/제외 스위치와 고객 열람용 섹션 숨김 저장이 직관적인지 봅니다.',
        autoProbeFocus: '서버에 저장된 숨김 섹션 설정(1개 이상)을 자동 확인합니다.',
        oracleReference: '발표자료 슬라이드 저장 정상 · 민감 섹션 외부 비노출 적용',
      },
      {
        id: 'V3-L2-S4',
        loopId: 'loop2',
        stepNumber: 4,
        subsystem: '딜카드',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S1',
        title: '새 딜카드 [신축·개발용](토지 186평) 생성 & [주간] 부동산뉴스 발행 (3자 면적 일치 확인)',
        workspaceHref: '/broker/w/dealcards?new=1',
        workspaceLabel: '새 딜카드 작성 화면 열기',
        actionChecklist: [
          '파란 [🚀 새 딜카드 작성 화면 열기] 클릭 → 잠원동 메모 붙여넣고 [✨ 메모로 딜카드 생성하기] 클릭 → 매물 유형 [신축·개발용] 선택! → 화면 확인: 딜카드 면적 칸에 연면적 대신 대지면적 기준("토지 186평" / 약 186평)이 표시됩니다.',
          '하단 파란 [카톡으로 보내기] → 팝업의 흰색 [링크 복사] 주소를 아래 ①번 칸에 붙여넣습니다.',
          '상단 메뉴 [📰 부동산뉴스]로 이동 → [제목] 탭 상단의 발행 주기에서 가운데 [주간]을 클릭(또는 목록 서랍에서 [주간] 선택 후 [이번 주 뉴스레터 새로 쓰기] 클릭) → 아래 2~4번 복사 칩을 채우고 잠원동 매물을 연결한 뒤 [보내기] 탭에서 [구독자에게 보내기](또는 [링크 복사]) 주소를 아래 ④번 칸에 붙여넣습니다. → 화면 확인: 주간 뉴스레터 추천 매물 카드에도 "토지 186평"이 동일하게 표시되고 발행일이 오늘 날짜로 일치함.',
        ],
        copySnippets: [
          {
            id: 'v3-h2-dc-headline',
            label: '1. 한 줄 제목 복사 (17자 · 18자 제한 맞춤)',
            targetHint: '딜카드 → 한 줄 제목 (18자 이내) 입력칸',
            value: '신사역 3분 코너 신축·대수선지',
            isPublicFacing: true,
          },
          {
            id: 'v3-h2-nl-title',
            label: '2. 주간 부동산뉴스 표지 제목 복사',
            targetHint: '부동산뉴스 [제목] 탭 → 표지 제목 입력칸 ([주간] 주기 선택)',
            value: '이번 주 강남·서초 핵심 역세권 기득권 용적률 보유 대수선·메디컬 부지 동향',
            isPublicFacing: true,
          },
          {
            id: 'v3-h2-nl-brief',
            label: '3. 주간 시장 브리핑 본문 복사',
            targetHint: '부동산뉴스 [내용] 탭 → 시장 브리핑 본문 입력칸',
            value:
              '현행 주거지역 용적률 제한이 강화된 신사·잠원 역세권에서는 1990년대 초 준공되어 기득권 연면적을 300% 이상 확보한 코너 2필지가 높은 희소가치를 인정받고 있습니다. 신축 대비 공사 기간을 줄이면서 메디컬 타워로 대수선하는 전략이 개발 법인과 병원장 매수세의 핵심 대안으로 꼽힙니다.',
            isPublicFacing: true,
          },
          {
            id: 'v3-h2-nl-comment',
            label: '4. 추천 매물 한 줄 소개 복사 (지번 비노출)',
            targetHint: '부동산뉴스 [내용] 탭 → 추천 매물 코멘트 입력칸',
            value:
              '신사역 더블역세권 도보 3분 코너 2필지 토지 186평 · 법정 상한을 웃도는 기득권 연면적 보유 대수선 최적지',
            isPublicFacing: true,
          },
        ],
        inlineScratchFields: [
          {
            field: 'dealCardUrl',
            label: '① 잠원동 딜카드 [카톡으로 보내기] → 팝업 [링크 복사] 주소 붙여넣기',
            placeholder: 'https://www.credeal.net/dc/... (여기에 Ctrl+V)',
          },
          {
            field: 'newsletterUrl',
            label: '④ 발행된 주간 부동산뉴스 [링크 복사] 주소 붙여넣기',
            placeholder: 'https://www.credeal.net/magazine/... (여기에 Ctrl+V)',
          },
        ],
        humanFocus: '딜카드·IM·주간 부동산뉴스 3곳 모두 "토지 186평"으로 일관되게 나오고 주간호 날짜가 오늘 날짜인지 봅니다.',
        autoProbeFocus: '딜카드·주간 뉴스 내 26-14·26-16·두원빌딩·임사장·전화번호 노출 0건을 자동 점검합니다.',
        oracleReference: '딜카드·IM·주간뉴스 토지 186평 일치 · 주간 발행일 일치 · 비공개 단어 0건',
      },
      {
        id: 'V3-L2-S5',
        loopId: 'loop2',
        stepNumber: 5,
        subsystem: '매수자 열람·문의',
        windowBadge: '창 A ↔ 창 B·C',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '경쟁 매수자 2명(창 B 윤성호 대표 · 창 C 송미경 원장) 요청 및 소통함 개별 승인',
        workspaceHref: '/broker/w/inbox',
        workspaceLabel: '고객 소통함 열기',
        actionChecklist: [
          '창 B(스마트폰)에서 위 ①번 딜카드 링크를 열고 [상세 제안서(IM) 요청]에 아래 [창 B · 매수자 1] 복사 칩 4개(윤성호 대표 · 신사메디컬개발 · 010-8426-3190 · 문의 내용)를 넣어 제출합니다.',
          '창 C(PC 크롬 시크릿 창 Ctrl+Shift+N)에서도 같은 딜카드 링크를 열고 [창 C · 매수자 2] 복사 칩 4개(송미경 원장 · 더블유성형외과의원 · 010-6374-9520 · 문의 내용)를 넣어 제출합니다.',
          '창 A [🚀 고객 소통함 열기]에서 윤성호 대표와 송미경 원장을 각각 선택해 소속이 잘 뜨는지 확인한 뒤, 가운데 [할 일] 탭의 초록색 [자료 보내기(승인)] → 발급 카드의 [🔗 전용 링크 복사]를 각각 눌러 아래 ②번·③번 칸에 붙여넣습니다.',
        ],
        copySnippets: [
          {
            id: 'v3-h2-b1-name',
            label: '[창 B · 매수자 1] 이름 복사 (윤성호 대표)',
            targetHint: '창 B 자료 요청 창 → 이름 (필수)',
            value: '윤성호 대표',
          },
          {
            id: 'v3-h2-b1-company',
            label: '[창 B · 매수자 1] 소속 복사 (신사메디컬개발)',
            targetHint: '창 B 자료 요청 창 → 소속 · 기관명',
            value: '신사메디컬개발',
          },
          {
            id: 'v3-h2-b1-phone',
            label: '[창 B · 매수자 1] 연락처 복사 (010-8426-3190)',
            targetHint: '창 B 자료 요청 창 → 연락처 (필수)',
            value: '010-8426-3190',
          },
          {
            id: 'v3-h2-b1-msg',
            label: '[창 B · 매수자 1] 문의 내용 복사',
            targetHint: '창 B 자료 요청 창 → 문의 내용',
            value: '신사역권 대수선 메디컬 빌딩 사업성 검토 중입니다. 2필지 경계 현황과 명도 일정 자료 부탁드립니다.',
          },
          {
            id: 'v3-h2-b2-name',
            label: '[창 C · 매수자 2] 이름 복사 (송미경 원장)',
            targetHint: '창 C 시크릿 창 자료 요청 창 → 이름 (필수)',
            value: '송미경 원장',
          },
          {
            id: 'v3-h2-b2-company',
            label: '[창 C · 매수자 2] 소속 복사 (더블유성형외과의원)',
            targetHint: '창 C 시크릿 창 자료 요청 창 → 소속 · 기관명',
            value: '더블유성형외과의원',
          },
          {
            id: 'v3-h2-b2-phone',
            label: '[창 C · 매수자 2] 연락처 복사 (010-6374-9520)',
            targetHint: '창 C 시크릿 창 자료 요청 창 → 연락처 (필수)',
            value: '010-6374-9520',
          },
          {
            id: 'v3-h2-b2-msg',
            label: '[창 C · 매수자 2] 문의 내용 복사',
            targetHint: '창 C 시크릿 창 자료 요청 창 → 문의 내용',
            value: '병원 이전 사옥 겸 임대용 건물 검토 중입니다. 층별 전용면적 및 승강기·주차 상세 자료 요청드립니다.',
          },
        ],
        inlineScratchFields: [
          {
            field: 'imShareUrl',
            label: '② 윤성호 대표(창 B) [🔗 전용 링크 복사] 주소 붙여넣기',
            placeholder: 'https://www.credeal.net/im-lite/...?token=... (윤성호 대표용)',
          },
          {
            field: 'secondaryImShareUrl',
            label: '③ 송미경 원장(창 C) [🔗 전용 링크 복사] 주소 붙여넣기',
            placeholder: 'https://www.credeal.net/im-lite/...?token=... (송미경 원장용)',
          },
        ],
        humanFocus: '동일 매물에 두 고객이 문의했을 때 각각의 소속이 구분되어 표시되고 승인 카드가 헷갈리지 않는지 확인합니다.',
        autoProbeFocus: '②번·③번 두 승인 링크 모두 현재 열람 가능 상태인지 자동 확인합니다.',
        oracleReference: '두 고객 소속·연락처 개별 표시 · 두 승인 링크 모두 정상 열림',
      },
      {
        id: 'V3-L2-S6',
        loopId: 'loop2',
        stepNumber: 6,
        subsystem: '고객 소통(승인·회수)',
        windowBadge: '창 A ↔ 창 B·C',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '분할화면 1명 링크 잠금/다시 열기 → [자료 전달·관리] 고객 [정보 수정] & 건물 전체 잠금',
        workspaceHref: '/broker/w/inbox',
        workspaceLabel: '고객 소통함 열기',
        actionChecklist: [
          '1단계(1명만 잠그고 다시 열기): 소통함에서 "윤성호 대표" 선택 → 가운데 [할 일] 탭 카드 안의 빨간 [🔒 보낸 링크 잠그기] 클릭 → 확인 버튼을 누릅니다! → 화면 확인: 창 B 링크는 차단되고 창 C(송미경 원장) 링크는 계속 열립니다. 이어서 [🔓 링크 다시 열기]를 눌러 풀리는 것도 확인한 뒤 다시 [🔒 보낸 링크 잠그기]로 잠가 둡니다.',
          '2단계(고객 [정보 수정] & 건물 전체 잠그기): "송미경 원장" 선택 → 상단 바의 [자료 전달·관리] 버튼(넓은 화면은 우측 영역)을 열어 [정보 수정] 버튼으로 직함/소속이 수정·저장되는지 확인한 뒤, 아래 [보낸 링크 잠그기] 팝업에서 [☑ 이 건물 전체 열람 잠금 (모든 수신자 차단)]을 체크하고 [잠그기]를 누릅니다! → 화면 확인: 창 C까지 모두 차단됩니다.',
        ],
        copySnippets: [
          {
            id: 'v3-h2-corr-banner',
            label: '(선택) 조건 변경 안내 문구 복사',
            targetHint: '고객 소통함 → [자료 전달·관리] → [⚠️ 수치 정정 안내 띄우기]',
            value: '5층 및 지하 1층 만기 경과 호실의 명도 완료 일정이 계약 후 3개월 내로 확정 반영되었습니다.',
          },
        ],
        humanFocus: '분할화면에서도 [할 일] 탭 안의 [🔒 보낸 링크 잠그기]/[🔓 링크 다시 열기]와 상단 [자료 전달·관리] 서랍의 [정보 수정]·전체 잠금이 편하게 조작되는지 확인합니다.',
        autoProbeFocus: '1단계(② 잠김 / ③ 열림)와 2단계(②·③ 모두 잠김) 상태를 자동 확인합니다.',
        oracleReference: '1명 잠금·해제 정상 · 고객 [정보 수정] 반영 · 건물 전체 잠금 시 모두 차단',
      },
      {
        id: 'V3-L2-S7',
        loopId: 'loop2',
        stepNumber: 7,
        subsystem: '오라클·보안마감',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 2,
        severityOnFail: 'S1',
        title: '자동 점검 실행 · 로그아웃 후 브라우저 잔여 키 점검 · [📋 Sign-off] 서버 제출',
        workspaceHref: '/broker/w/inbox',
        workspaceLabel: '고객 소통함 열기',
        actionChecklist: [
          '파란색 [🔍 입력한 링크·면적 자동 점검 실행]으로 잠원동 결과를 확인합니다.',
          '크리딜에서 로그아웃한 뒤, 이 검수 화면 아래 [🧹 공용 PC 브라우저 잔여 키 점검]을 눌러 남은 민감 데이터가 0건인지 확인합니다.',
          '맨 위 초록색 [📋 Sign-off] 탭을 눌러 검수자 성함("이상덕")과 종합 의견을 적고 [☁️ 서버 최종 제출]을 클릭해 마무리합니다.',
        ],
        copySnippets: [],
        humanFocus: 'V3 전체 과정을 진행하면서 편해진 점이나 추가로 다듬으면 좋을 문구를 종합 의견에 편하게 남겨 주세요.',
        autoProbeFocus: '로그아웃 후 브라우저 저장소에 민감 임시 데이터가 0건인지 점검합니다.',
        oracleReference: '잔여 민감 키 0건 · 14개 단계 판정 및 서버 제출 완료',
      },
    ],
  },
];

export const FULL_LOOP_V3_ALL_STEPS: ReadonlyArray<FullLoopStepItem> = FULL_LOOP_V3_CASES.flatMap(
  (c) => c.steps,
);
