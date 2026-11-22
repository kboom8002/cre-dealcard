/**
 * @file src/lib/testguide/full-loop-v2-holdout-data.ts
 * @description Hold-out 실매물 2선 (당산동5가 115억 XLSX v1.5 + 잠원동 242억 신축·개발 2필지)
 *   전 주기 관통 휴먼 클릭스루 테스트 V2 SSOT 정의 (/qa-full-loop-v2).
 *
 * 설계 원칙:
 *  - 기존 AI 회귀셋(/qa-full-loop: 부천 58억 + 역삼 1,900억)과 완벽히 분리된 Hold-out 인간 검증 세트.
 *  - 임대수익형 외 신축·개발형 매물 유형, .xlsx v1.5 업로드(㎡ 변환), 비임대(기계실)+자가사용+전세+만기경과
 *    3중 점유율 분모, 고해상도(1~3.8MB) 5~6장 다중 사진 슬라이드 분리를 직접 검증한다.
 */

import type { TestGuideImageAsset } from '@/lib/testguide/testguide-data';
import type {
  FullLoopCaseDefinition,
  FullLoopStepItem,
  FullLoopWindowRoleCard,
} from '@/lib/testguide/full-loop-2cases-data';

export const QA_FULL_LOOP_V2_WORKBENCH_ID = 'qa-full-loop-v2-holdout' as const;

export const HOLDOUT_V2_ASSET_CDN_MAP: Record<string, string> = {
  // CASE-04 영등포구 당산동5가 11-47 (사진 6장 + XLSX 2종)
  '01_외관_전면및필로티주차장.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v2-holdout/case04/01_exterior_piloti.jpeg',
  '02_외관_사거리코너전경.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v2-holdout/case04/02_exterior_corner.jpeg',
  '03_외관_영신로259주출입구.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v2-holdout/case04/03_exterior_entrance.jpeg',
  '04_내부_2층로뎀내과복도.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v2-holdout/case04/04_interior_clinic_hall.jpeg',
  '05_내부_내과수액검진실.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v2-holdout/case04/05_interior_clinic_room.jpeg',
  '06_내부_엘리베이터홀.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v2-holdout/case04/06_interior_elevator.jpeg',
  '02_현황_렌트롤_v1.5_sqm.xlsx':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v2-holdout/case04/02_asis_rentroll_v1.5_sqm.xlsx',
  '03_안정화_렌트롤_v1.5_sqm.xlsx':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/v2-holdout/case04/03_stabilized_rentroll_v1.5_sqm.xlsx',

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

export const HOLDOUT_V2_CASE04_MEMO =
  '서울특별시 영등포구 당산동5가 11-47 근생빌딩 매각 희망가 115억, 대지 153.3평 / 연면적 436.0평(B1~5F, 준공업지역), 현 보증금 6억 6,000만 / 월세 2,480만(전세 월세전환·공실해소 안정화 시 월 3,480만·수익률 3.83%), 2·9호선 당산역 도보 4분 래미안 대단지 정문 코너, 고은약국·로뎀나무내과·카페 장기 성업중 (김원장 010-2255-7711)';

export const HOLDOUT_V2_CASE04_STABILIZED_TSV = [
  '층\t호수\t업종\t임차인\t임대면적(㎡)\t전용면적(㎡)\t보증금(만원)\t월세(만원)\t관리비(만원)\t만기일\t상태',
  'B1\tB101호\t디저트카페\t데이르젤라또\t196.15\t156.90\t4000\t310\t25\t2029-04-30\t임대중',
  '1F\t101호\t약국\t고은약국\t65.00\t52.00\t9000\t450\t26\t2029-02-28\t임대중',
  '1F\t102호\t내과의원\t로뎀나무내과(접수·검진)\t115.00\t92.00\t10000\t650\t46\t2028-05-31\t임대중',
  '1F\t103호\t편의점\tGS25당산코너점\t60.00\t48.00\t5000\t300\t21\t2029-08-31\t임대중',
  '2F\t201호\t내과의원\t로뎀나무내과(진료·수액실)\t105.00\t84.00\t0\t0\t0\t2028-05-31\t공실 아님 (로뎀내과통합 통합계약)',
  '2F\t202호\t피부과의원\t당산연세피부과\t135.00\t108.00\t5000\t360\t25\t2029-12-31\t임대중',
  '3F\t301호\t기구필라테스\t클럽인디고\t70.00\t56.00\t2000\t155\t15\t2029-03-31\t임대중',
  '3F\t302호\t그룹PT\t바디핏스튜디오\t70.00\t56.00\t2000\t150\t15\t2028-08-31\t임대중',
  '3F\t303호\t주거용오피스텔(월세전환)\t주거용오피스텔(월세전환)\t50.00\t38.00\t3000\t95\t10\t2029-01-31\t임대중',
  '3F\t304호\t주거용오피스텔(월세전환)\t주거용오피스텔(월세전환)\t50.00\t38.00\t3000\t95\t10\t2029-03-14\t임대중',
  '4F\t401호\t세무회계사무소\t당산세무회계\t120.00\t96.00\t3500\t230\t21\t2028-12-31\t임대중',
  '4F\t402호\t보습학원\t당산리딩영어\t120.00\t96.00\t3500\t235\t21\t2029-02-28\t임대중',
  '5F\t501호\tIT기업연구소\t한강소프트랩\t150.00\t120.00\t4000\t290\t25\t2028-12-31\t임대중',
  '5F\t502호\t웹에이전시\t스튜디오픽셀\t90.00\t72.00\t5000\t160\t14\t2029-06-30\t임대중',
].join('\n');

export const HOLDOUT_V2_CASE03_MEMO =
  '서울특별시 서초구 잠원동 26-14, 26-16 두원빌딩 신축·리모델링 부지 매각 242억 2,680만 원(평당 1.3억), 2필지 합산 대지 186.4평 / 연면적 614.9평(1990년 준공, 기득권 용적률 325.6%), 신사역 3호선·신분당선 도보 3분 코너 각지, 대수선 밸류애드 완료 시 월세 8,000만·기대수익률 4.14% 메디컬 타워 최적 (임사장님 02-544-8784)';

export const HOLDOUT_V2_CASE03_ASIS_TSV = [
  '층\t호수\t업종\t임차인\t임대면적(㎡)\t전용면적(㎡)\t보증금(만원)\t월세(만원)\t관리비(만원)\t만기일\t상태',
  '5F\t501호\t건축사사무소\t잠원건축설계\t325.00\t260.00\t5000\t380\t80\t2025-10-31\t임대중 (만기경과·명도합의)',
  '4F\t401호\t업무시설\t공실(명도완료)\t345.00\t276.00\t0\t0\t0\t-\t공실',
  '3F\t301호\t광고에이전시\t신사미디어랩\t345.00\t276.00\t6000\t460\t90\t2026-12-31\t임대중 (재건축명도동의)',
  '2F\t201호\t한식당\t잠원북어국밥\t345.00\t276.00\t8000\t580\t100\t2027-02-28\t임대중',
  '1F\t101호\t커피·분식·중개업\t1층근생3개소\t306.59\t245.00\t15000\t980\t120\t2027-04-30\t임대중',
  'B1\tB101호\t실내골프연습장\t그린골프아카데미\t366.00\t285.00\t5000\t320\t80\t2026-09-30\t임대중 (만기경과·묵시적갱신)',
].join('\n');

export const HOLDOUT_V2_CASE03_STABILIZED_TSV = [
  '층\t호수\t업종\t임차인\t임대면적(㎡)\t전용면적(㎡)\t보증금(만원)\t월세(만원)\t관리비(만원)\t만기일\t상태',
  '5F\t501호\t피부과스킨케어\t신규메디컬임차\t325.00\t260.00\t15000\t1150\t180\t2029-12-31\t임대중',
  '4F\t401호\t성형외과수술센터\t신규메디컬임차\t345.00\t276.00\t15000\t1250\t190\t2029-12-31\t임대중',
  '3F\t301호\t성형외과상담센터\t신규메디컬임차\t345.00\t276.00\t15000\t1250\t190\t2029-12-31\t임대중',
  '2F\t201호\t프리미엄뷰티살롱\t신규뷰티임차\t345.00\t276.00\t18000\t1450\t200\t2029-12-31\t임대중',
  '1F\t101호\t플래그십약국·카페\t신규앵커리테일\t306.59\t245.00\t30000\t2150\t240\t2029-12-31\t임대중',
  'B1\tB101호\t프라이빗라운지\t신규스튜디오임차\t366.00\t285.00\t10000\t750\t150\t2029-12-31\t임대중',
].join('\n');

export const HOLDOUT_V2_CASE03_ASIS_CSV = HOLDOUT_V2_CASE03_ASIS_TSV.split('\n')
  .map((line) =>
    line
      .split('\t')
      .map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
      .join(','),
  )
  .join('\n');

function buildHoldoutImages(
  folderSlug: 'v2-case04' | 'v2-case03',
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

const CASE04_IMAGES: TestGuideImageAsset[] = buildHoldoutImages('v2-case04', [
  {
    filename: '01_외관_전면및필로티주차장.jpeg',
    format: 'JPG',
    roleLabel: '외부 · 전면/주차장 (3.2MB)',
    caption: '전면 외관 및 1층 필로티 자주식 주차장',
  },
  {
    filename: '02_외관_사거리코너전경.jpeg',
    format: 'JPG',
    roleLabel: '외부 · 코너전경 (3.9MB)',
    caption: '배후 아파트 대단지 사거리 코너 전경',
  },
  {
    filename: '03_외관_영신로259주출입구.jpeg',
    format: 'JPG',
    roleLabel: '외부 · 주출입구 (3.6MB)',
    caption: '주출입구 및 1층 약국·내과 전면',
  },
  {
    filename: '04_내부_2층로뎀내과복도.jpeg',
    format: 'JPG',
    roleLabel: '내부 · 2층 복도 (2.3MB)',
    caption: '2층 내과의원 출입구 및 내부 홀',
  },
  {
    filename: '05_내부_내과수액검진실.jpeg',
    format: 'JPG',
    roleLabel: '내부 · 진료실 (1.0MB)',
    caption: '의원 내부 복도 및 진료·수액실',
  },
  {
    filename: '06_내부_엘리베이터홀.jpeg',
    format: 'JPG',
    roleLabel: '내부 · 공용부 (1.9MB)',
    caption: '승강기 홀 및 내부 공용부 관리 상태',
  },
]);

const CASE03_IMAGES: TestGuideImageAsset[] = buildHoldoutImages('v2-case03', [
  {
    filename: '01_외관_코너전면대표.png',
    format: 'PNG',
    roleLabel: '외부 · 코너대표 (0.9MB)',
    caption: '잠원동 코너 전면 외관',
  },
  {
    filename: '02_외관_후면자주식주차장.png',
    format: 'PNG',
    roleLabel: '외부 · 후면주차장 (0.9MB)',
    caption: '후면 자주식 주차장 및 대지 경계 현황',
  },
  {
    filename: '03_외관_인근신축개발상권.png',
    format: 'PNG',
    roleLabel: '외부 · 인접상권 (0.8MB)',
    caption: '본건 인접 신사역권 신축 개발 상권 전경',
  },
  {
    filename: '04_내부_기준층실내현황.jpeg',
    format: 'JPG',
    roleLabel: '내부 · 기준층 (2.1MB)',
    caption: '리모델링 전 기준층 업무공간 내부 현황',
  },
  {
    filename: '05_내부_옥상설비및조망.jpeg',
    format: 'JPG',
    roleLabel: '내부 · 옥상설비 (1.8MB)',
    caption: '옥상 방수 및 설비 공간 조망 현황',
  },
]);

export const FULL_LOOP_V2_WINDOW_ROLES: ReadonlyArray<FullLoopWindowRoleCard> = [
  {
    id: 'windowA',
    badge: '창 A · 필수',
    title: '중개사 작업 화면',
    device: 'PC 크롬 일반 창 (로그인 상태)',
    purpose: 'XLSX 업로드·신축·개발형 IM 발행·뉴스레터·소통 승인 및 링크 닫기 수행',
  },
  {
    id: 'windowB',
    badge: '창 B · 필수',
    title: '매수자 1 (모바일 실기기)',
    device: '스마트폰 카카오톡 "나와의 채팅" 인앱 화면 (360~390px)',
    purpose: '지번·상호 마스킹, 모바일 한 손 조작, 자료 요청 제출 및 열람 해제 확인',
  },
  {
    id: 'windowC',
    badge: '창 C · Loop 2 필수',
    title: '매수자 2 (경쟁 원매자)',
    device: 'PC 크롬 시크릿 창 (Ctrl+Shift+N, 비로그인)',
    purpose: '매수자 1 링크만 닫았을 때 매수자 2 링크가 계속 열리는지 대조 비교',
  },
];

export const FULL_LOOP_V2_CASES: ReadonlyArray<FullLoopCaseDefinition> = [
  {
    id: 'loop1',
    probeLoopId: 'v2-loop1',
    code: 'LOOP-01',
    tabLabel: 'Hold-out 1 · 당산 115억 XLSX',
    shortLabel: 'Hold-out 1 · 영등포 당산동5가 115억 (XLSX v1.5 · 3중 분모 · 6장 압축)',
    title: '검증 #1 — .xlsx 표준양식 v1.5 업로드 · 기계실/자가/전세 3중 분모 · 메디컬 마스킹 완주',
    subtitle:
      '영등포 당산동5가 115억 메디컬 근생(.xlsx 직접 업로드 15행 · 통합계약 0원행 · 기계실 비임대 · 자가사용 · 전세 · 고해상도 6장)을 딜카드·IM·뉴스레터·모바일 소통까지 완주합니다.',
    targetMinutes: 19,
    personaFocus: '시니어 대표 중개사(21px 큰 글씨 · 엑셀 업로드) × 메디컬/밸류애드 투자자',
    deviceSetup: '창 A(PC 일반 창) + 창 B(실제 스마트폰 카카오톡)',
    sampleKitZipUrl: '/api/public/qa-sample-kit?scenario=v2-loop1',
    csvDownloadUrl: '/api/public/qa-sample-kit?scenario=v2-loop1&format=xlsx',
    primarySheetLabel: '📊 현황 렌트롤 XLSX (v1.5)',
    secondarySheetDownloadUrl: '/api/public/qa-sample-kit?scenario=v2-loop1&format=xlsx-stabilized',
    secondarySheetLabel: '📊 안정화 렌트롤 XLSX',
    dealCode: 'HOLDOUT-CASE-04',
    propertyName: '당산동5가 11-47 메디컬 근생빌딩',
    jibunAddress: '서울특별시 영등포구 당산동5가 11-47',
    roadAddress: '서울특별시 영등포구 영신로 259',
    askingPriceReadout: '115억 원 (1,150,000만 원)',
    domainTraps: [
      {
        code: 'TRAP-V2-1A',
        title: '.xlsx v1.5(㎡) 업로드 & 층간 통합계약 합산',
        detail:
          'TSV가 아닌 실제 .xlsx 파일을 업로드했을 때 B열 계약그룹(로뎀내과통합) 201호 0원행이 공실이나 2중 합산으로 오인되지 않아야 합니다.',
      },
      {
        code: 'TRAP-V2-1B',
        title: '기계실(비임대) · 자가사용 · 전세(0원) 3중 분모',
        detail:
          '총 15행 중 기계실 1행·자가사용 1행을 제외한 임대가능 13호실 중 공실 1호실(202호, 7.7%)과 순수익률 2.75%→3.83%를 검증합니다.',
      },
      {
        code: 'TRAP-V2-1C',
        title: '대용량 6장(외관 3 · 내부 3) 압축 & 병·의원 블라인드',
        detail:
          '1~3.9MB 사진 6장이 지연/오류 없이 업로드·분리 렌더링되고, 공개 티저에 11-47·로뎀나무내과·고은약국이 노출되지 않아야 합니다.',
      },
    ],
    images: CASE04_IMAGES,
    groundTruth: {
      expectedLandAreaSqm: 506.8,
      expectedLandAreaPyeong: 153.31,
      expectedGfaSqm: 1441.15,
      expectedGfaPyeong: 435.95,
      areaToleranceSqm: 15,
      forbiddenPublicTokens: [
        '11-47',
        '영신로 259',
        '로뎀나무내과',
        '고은약국',
        '010-2255-7711',
        '김원장',
      ],
      expectedDepositSummary: '현황 보 66,000만 / 월 2,480만 → 안정화 보 59,000만 / 월 3,480만',
      expectedMonthlyRentSummary: '현황 월 2,480만 (+관리비 215만) → 안정화 월 3,480만 (+관리비 274만)',
      expectedOccupancySummary:
        '총 15행 중 비임대(기계실)·자가사용 제외 임대가능 13호실 중 공실 1호실(202호, 7.7%)',
      expectedYieldSummary: '현황 보증금 차감 순수익률 2.75% → 안정화 전환 시 3.83%',
    },
    steps: [
      {
        id: 'H1-S1',
        loopId: 'loop1',
        stepNumber: 1,
        subsystem: '프로필·법정표기',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 2,
        severityOnFail: 'S1',
        title: '5대 법정 표기 확인 및 큰 글씨(21px) 엑셀·딜카드 작업 화면 점검',
        workspaceHref: '/broker/profile',
        workspaceLabel: '내 사무소 프로필 열기',
        actionChecklist: [
          '/broker/profile에서 상호·소재지·연락처·개설등록번호·대표자 성명 5항목이 유효한 실무 값으로 저장되어 있는지 확인합니다.',
          '/broker/w/dealcards에서 상단 글자 크기를 [크게(21px)]로 전환한 뒤, 좌측 목록과 하단 핵심 버튼이 잘리지 않는지 확인합니다.',
        ],
        copySnippets: [
          {
            id: 'h1-prof-company',
            label: '상호 예시 복사',
            targetHint: '/broker/profile → 중개사무소 명칭',
            value: '제이에스부동산중개법인 주식회사',
          },
          {
            id: 'h1-prof-reg',
            label: '유효 등록번호 예시 복사',
            targetHint: '/broker/profile → 개설등록번호',
            value: '11680-2025-04821',
          },
        ],
        humanFocus: '21px 큰 글씨 모드에서 버튼 및 목록 가독성이 깨지지 않는지 확인합니다.',
        autoProbeFocus: '법정 표시사항 5항목 유효 상태를 검증합니다.',
        oracleReference: '법정 표기 5항목 완비 · 21px 모드 가로 넘침 및 CTA 잘림 0건',
      },
      {
        id: 'H1-S2',
        loopId: 'loop1',
        stepNumber: 2,
        subsystem: '딜카드',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '당산동 메디컬 빌딩 메모 입력 · 희소 병·의원/약국 실명 블라인드 딜카드 발행',
        workspaceHref: '/broker/w/dealcards',
        workspaceLabel: '딜카드 작업실 열기',
        actionChecklist: [
          '아래 [당산동 현장 메모 원문 복사]를 눌러 /broker/w/dealcards 메모창에 붙여넣고 자동 채우기를 실행합니다.',
          '[카톡 말풍선]과 [받는 화면]에서 "11-47", "로뎀나무내과", "고은약국", "김원장", "010-2255-7711"이 모두 가려졌는지 확인한 뒤 발행합니다.',
          '발행된 공개 딜카드 링크(/dc/...)를 우측 오라클 입력창 ①에 붙여넣습니다.',
        ],
        copySnippets: [
          {
            id: 'h1-dc-memo',
            label: '당산동 현장 메모 원문 복사 (115억)',
            targetHint: '/broker/w/dealcards → 메모로 채우기 입력창',
            value: HOLDOUT_V2_CASE04_MEMO,
          },
          {
            id: 'h1-dc-headline',
            label: '블라인드 안전 한 줄 제목 복사',
            targetHint: '딜카드 → 한 줄 제목 (지번·임차인 비노출)',
            value: '2·9호선 당산역 도보 4분 대단지 앞 사거리 코너 메디컬 근생빌딩 (115억)',
            isPublicFacing: true,
          },
        ],
        humanFocus: '내과·약국 등 특정 상호명이 공개 딜카드에서 자연스럽게 일반 업종("병의원·근생")으로 치환되는지 봅니다.',
        autoProbeFocus: '공개 티저 내 금지어(11-47, 로뎀나무내과, 고은약국, 김원장, 전화번호) 0건을 자동 점검합니다.',
        oracleReference: '매각가 100~120억대 · 연면적 약 436평 표시 · 실명/지번 유출 0건',
      },
      {
        id: 'H1-S3',
        loopId: 'loop1',
        stepNumber: 3,
        subsystem: 'IM·발표자료',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 5,
        severityOnFail: 'S0',
        title: '.xlsx v1.5 직접 업로드 · 비임대/자가/전세 3중 분모 · 대용량 사진 6장 PPT 검수',
        workspaceHref: '/broker/w/im',
        workspaceLabel: 'IM 작업실 열기',
        actionChecklist: [
          '상단 [📊 현황 렌트롤 XLSX (v1.5)]와 [📦 실매물 골든 키트 ZIP]을 내려받은 뒤, /broker/w/im에서 지번 주소를 조회해 대지 506.8㎡ / 연면적 1,441.15㎡를 확인합니다.',
          '상단 [억 단위] 칸에 "115"를 입력해 "= 115억 원"을 확인합니다.',
          '② 층별 임대현황 탭에서 [엑셀 불러오기]로 02_현황_렌트롤_v1.5_sqm.xlsx 파일을 직접 업로드해 현황 합계(보증금 66,000만 / 월세 2,480만 / 순수익률 2.75% / 공실 202호 1건)를 확인합니다 (TRAP-V2-1A·1B).',
          '이어서 [+ 기대수익률 렌트롤] 서브탭에 아래 [안정화 14행 TSV 복사]를 붙여넣어 보증금 59,000만 / 월세 3,480만 / 3.83% 점프를 확인하고, ④ 사진 탭에 고해상도 6장(외관 3·내부 3)을 올려 [📥 PPTX 받기]로 15행 2면 분할 및 6장 사진 분리를 육안 검수한 뒤 IM 링크를 우측 입력창 ②에 넣습니다.',
        ],
        copySnippets: [
          {
            id: 'h1-im-addr',
            label: '지번 주소 복사 (당산동5가 11-47)',
            targetHint: '/broker/w/im → ① 기본 제원 주소 검색',
            value: '서울특별시 영등포구 당산동5가 11-47',
          },
          {
            id: 'h1-im-price-eok',
            label: '희망 매매가 (억 단위: 115)',
            targetHint: '/broker/w/im → 상단 파란 [억 단위] 칸',
            value: '115',
          },
          {
            id: 'h1-im-stabilized-tsv',
            label: '안정화 14행 TSV 복사 (+기대수익률 서브탭용)',
            targetHint: '/broker/w/im → ② 임대 현황 [+ 기대수익률 렌트롤] 탭',
            value: HOLDOUT_V2_CASE04_STABILIZED_TSV,
          },
        ],
        humanFocus: '.xlsx 파일 업로드 과정이 몇 번의 클릭으로 끝나는지, 6장의 대용량 사진이 빠르게 올라가고 PPT 2면 분할 표가 겹치지 않는지 확인합니다.',
        autoProbeFocus: '대지(506.8㎡)·연면적(1,441.15㎡) 정합성과 공유 링크 활성 여부를 자동 검증합니다.',
        oracleReference: 'XLSX 파싱 이슈 0건 · 현황 2.75%(보 66,000만/월 2,480만) → 안정화 3.83%(보 59,000만/월 3,480만)',
      },
      {
        id: 'H1-S4',
        loopId: 'loop1',
        stepNumber: 4,
        subsystem: '뉴스레터',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S1',
        title: '영등포·당산 메디컬 주간 뉴스레터 연결 · F5 보존 · 인사말·링크 복사',
        workspaceHref: '/broker/w/newsletter',
        workspaceLabel: '뉴스레터 작업실 열기',
        actionChecklist: [
          '/broker/w/newsletter에서 새 호수를 만들고 표지 제목·시장 브리핑을 붙여넣은 뒤, 방금 발행한 영등포 당산 매물을 추천 매물로 연결합니다.',
          '브라우저 F5(새로고침)를 눌러 입력값이 유지되는지 확인합니다.',
          '[구독자에게 보내기] 완료 후 [링크 복사] URL을 우측 프로브 입력창 ④에 기록하고 [인사말 + 링크 복사]를 창 B로 보냅니다.',
        ],
        copySnippets: [
          {
            id: 'h1-nl-title',
            label: '영등포·당산 주간 뉴스레터 제목 복사',
            targetHint: '/broker/w/newsletter → 표지 제목',
            value: '2·9호선 환승역 배후 대단지 앞 메디컬·근생 복합빌딩 밸류업 가이드',
            isPublicFacing: true,
          },
          {
            id: 'h1-nl-brief',
            label: '영등포 시장 브리핑 원문 복사',
            targetHint: '/broker/w/newsletter → 시장 브리핑 본문',
            value:
              '더블역세권과 대단지 주거 배후를 동시에 품은 준공업지역 코너 빌딩은 병·의원과 생활밀착 업종의 장기 임차 수요가 끊이지 않습니다. 특히 전세·자가사용 등 저수익 구간이 남아 있는 자산은 임대 구조 재편만으로도 안정화 시 현금흐름을 40% 이상 개선할 수 있어 실수요 투자자들의 관심이 높습니다.',
            isPublicFacing: true,
          },
          {
            id: 'h1-nl-comment',
            label: '추천 매물 한 줄 코멘트 복사 (지번 비노출)',
            targetHint: '/broker/w/newsletter → 추천 매물 코멘트',
            value:
              '더블역세권 도보 4분 사거리 코너 · 우량 메디컬 임차 기반에 전세·공실 전환 시 월세 +1,000만원 증액 여력 보유',
            isPublicFacing: true,
          },
        ],
        humanFocus: '주거·전세·메디컬 복합 특성이 중개사 관점에서 과장 없이 신뢰감 있게 서술되었는지 봅니다.',
        autoProbeFocus: '뉴스레터 내 11-47·로뎀나무내과·고은약국 노출 0건을 자동 검증합니다.',
        oracleReference: 'F5 초안 100% 보존 · 공개 뉴스레터 지번/임차인 노출 0건 · 법정 푸터 정상',
      },
      {
        id: 'H1-S5',
        loopId: 'loop1',
        stepNumber: 5,
        subsystem: '매수자 열람·문의',
        windowBadge: '창 B (스마트폰 카톡 매수자 1)',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '스마트폰 카톡 인앱 클릭스루 · 상세 자료 요청(강민석 팀장) 및 구독 신청',
        actionChecklist: [
          '스마트폰 카카오톡에 전달된 링크 썸네일에 "11-47"이나 "로뎀나무내과"가 노출되지 않는지 먼저 확인합니다.',
          '뉴스레터 → 추천 딜카드 → 모바일 IM으로 이동해 15행 현황표·사진 6장이 모바일 화면(390px)에서 잘림 없이 스크롤되는지 확인합니다.',
          '자료 요청 창에 아래 4개 복사 칩을 입력해 제출하고, 뉴스레터 구독 폼에서도 연락처와 이메일로 구독을 완료합니다.',
        ],
        copySnippets: [
          {
            id: 'h1-buyer-name',
            label: '성함 복사 (강민석 팀장)',
            targetHint: '자료 요청 창 → 성함',
            value: '강민석 팀장',
          },
          {
            id: 'h1-buyer-phone',
            label: '연락처 복사 (010-6193-4470)',
            targetHint: '자료 요청 창 · 구독 폼 · 우측 프로브 입력창 ⑤',
            value: '010-6193-4470',
          },
          {
            id: 'h1-buyer-email',
            label: '이메일 복사 (ms.kang@example.kr)',
            targetHint: '자료 요청 창 / 구독 폼 → 이메일',
            value: 'ms.kang@example.kr',
          },
          {
            id: 'h1-buyer-msg',
            label: '문의 내용 복사',
            targetHint: '자료 요청 창 → 문의 내용',
            value: '당산역권 100억대 메디컬 빌딩 매입 검토 중입니다. 2층 공실 조건과 안정화 수지 상세 내역 요청드립니다.',
          },
        ],
        humanFocus: '모바일에서 15행 이상의 다호실 임대차 표와 6장 사진 갤러리가 버벅임 없이 한눈에 읽히는지 봅니다.',
        autoProbeFocus: '구독자 연락처(010-6193-4470) CRM 인입 여부를 확인합니다.',
        oracleReference: '모바일 가로 넘침 0px · 6장 사진 깨짐 0건 · 자료 요청/구독 정상 접수',
      },
      {
        id: 'H1-S6',
        loopId: 'loop1',
        stepNumber: 6,
        subsystem: '고객 소통(승인·회수)',
        windowBadge: '창 A ↔ 창 B',
        targetMinutes: 2,
        severityOnFail: 'S0',
        title: '소통함 요청 확인 · 1클릭 [자료 보내기] 승인 · 창 B 6-1/6-2면 열람 해제',
        workspaceHref: '/broker/w/inbox',
        workspaceLabel: '고객 소통함 열기',
        actionChecklist: [
          '창 A(/broker/w/inbox) [할 일] 목록에서 "강민석 팀장" 문의를 확인하고 [자료 보내기(승인)]를 누릅니다.',
          '복사된 승인 링크(/im-lite/...)를 우측 오라클 입력창 ②에 갱신해 넣고 창 B로 열어 봅니다.',
          '창 B에서 전체 15행 임대차 및 6-2 기대수익률 상세 분석이 잠금 없이 열리는지 확인합니다.',
        ],
        copySnippets: [
          {
            id: 'h1-ib-memo',
            label: '상담 기록 메모 복사',
            targetHint: '/broker/w/inbox → [기록] 탭',
            value: '강민석 팀장 상담 완료 — 2층 202호 공실 피부과 임차 의향 조건 및 3층 전세 만기 일정 자료 발송',
          },
        ],
        humanFocus: '승인 후 매수자가 기대수익률 전환 스토리까지 막힘 없이 이해할 수 있는지 확인합니다.',
        autoProbeFocus: '승인 링크 토큰 활성 및 숨김 없는 상세 열람 상태를 확인합니다.',
        oracleReference: '1클릭 승인 10초 내 완료 · 모바일 6-1/6-2면 전체 열람 정상',
      },
      {
        id: 'H1-S7',
        loopId: 'loop1',
        stepNumber: 7,
        subsystem: '오라클·보안마감',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 1,
        severityOnFail: 'S1',
        title: 'Hold-out 1 자동 오라클 프로브 일괄 판정 및 체감 메모 마감',
        actionChecklist: [
          '우측 코파일럿 ①~⑤ 칸이 모두 채워졌는지 확인하고 [🔍 1초 자동 오라클 & 블라인드 프로브 실행]을 누릅니다.',
          '당산동 정답 면적(506.8㎡ / 1,441.15㎡), 블라인드 금지어 0건, 링크 활성, 구독자 인입 4중 통과를 확인합니다.',
        ],
        copySnippets: [],
        humanFocus: 'TSV가 아닌 .xlsx 엑셀 파일을 실제 중개사가 업로드해 끝까지 보낼 때 불편한 점이 없었는지 기록합니다.',
        autoProbeFocus: 'CASE-04 Ground-Truth 면적·블라인드·링크·CRM 4중 자동 대조.',
        oracleReference: '자동 프로브 전 항목 초록 통과 · S0 결함 0건',
      },
    ],
  },
  {
    id: 'loop2',
    probeLoopId: 'v2-loop2',
    code: 'LOOP-02',
    tabLabel: 'Hold-out 2 · 잠원 242억 신축개발',
    shortLabel: 'Hold-out 2 · 서초 잠원동 242억 (신축·개발형 · 2필지 · 역전복구 · 직교회수)',
    title: '검증 #2 — 신축·개발형 매물 유형 · 2필지/비정수 억·만원 · 대지↔연면적 역전 가드 · 직교 회수',
    subtitle:
      '잠원동 26-14 외 1필지(242억 2,680만 원, 기득권 용적률 325.6%, 만기경과 2개층)로 신축·개발용 매물 유형, 비정수 억·만원 입력, 대지↔연면적 역전 스왑 가드, 대수선 1.37%→4.14% 연동, 경쟁 매수자 2인 직교 회수를 완주합니다.',
    targetMinutes: 20,
    personaFocus: '개발·밸류애드 전담 중개 팀장 × 디벨로퍼·건축사 매수자 2인 (창 B vs 창 C)',
    deviceSetup: '창 A(PC 일반 창) + 창 B(스마트폰 카톡: 매수자 1) + 창 C(PC 시크릿 창: 매수자 2)',
    sampleKitZipUrl: '/api/public/qa-sample-kit?scenario=v2-loop2',
    csvDownloadUrl: '/api/public/qa-sample-kit?scenario=v2-loop2&format=csv',
    primarySheetLabel: '📊 임대 현황 CSV',
    dealCode: 'HOLDOUT-CASE-03',
    propertyName: '잠원동 26-14외1 두원빌딩 (신축·개발)',
    jibunAddress: '서울특별시 서초구 잠원동 26-14, 26-16',
    roadAddress: '서울특별시 서초구 신반포로47길 9-6',
    askingPriceReadout: '242억 2,680만 원 (2,422,680만 원)',
    domainTraps: [
      {
        code: 'TRAP-V2-2A',
        title: '2필지 합산(616.10㎡) + 비정수 242억 2,680만 + 역전 스왑 가드',
        detail:
          '단일 필지가 아닌 2필지 합산 면적과 억/만원 분리 입력(242억 + 2680만원) 및 대지↔연면적 뒤바꿈 원클릭 복구 버튼 동작을 검증합니다.',
      },
      {
        code: 'TRAP-V2-2B',
        title: '신축·개발용 매물 유형 & 만기경과(묵시적 갱신) 명도 표시',
        detail:
          '기존 임대수익용이 아닌 신축·개발용에서 토지면적(약 186평)이 최우선 강조되고, 5F·B1 만기경과 상태가 명확히 표시되는지 점검합니다.',
      },
      {
        code: 'TRAP-V2-2C',
        title: '고해상도 5장(PNG 3 · JPEG 2) 슬라이드 분리 & 직교 회수',
        detail:
          'PNG/JPEG 혼합 5장이 9~10면 PPT에 깨짐 없이 삽입되고, 매수자 1(창 B)만 닫았을 때 매수자 2(창 C)는 계속 열려 있어야 합니다.',
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
      expectedDepositSummary: '현황 보 39,000만 / 월 2,720만 → 대수선 안정화 보 103,000만 / 월 8,000만',
      expectedMonthlyRentSummary: '현황 월 2,720만 (+관리비 470만) → 안정화 월 8,000만 (+관리비 1,150만)',
      expectedOccupancySummary: '6개층 중 4F 공실 1건(83.3%) · 5F/B1 만기경과 명도 대상',
      expectedYieldSummary: '현황 순수익률 1.37% → 메디컬 대수선 안정화 시 4.14%',
    },
    steps: [
      {
        id: 'H2-S1',
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
          '1차 방어(400): /broker/profile 개설등록번호에 [차단 테스트용 샘플 번호(11680-2024-00123)]를 입력하고 저장 시 400 차단 안내가 뜨는지 확인합니다.',
          '2차 방어(422): 개설등록번호를 비워 저장한 뒤 딜카드·뉴스레터 발행 시 422 누락 차단이 뜨는지 확인하고, [정상 등록번호 복원용]을 다시 입력해 저장합니다.',
        ],
        copySnippets: [
          {
            id: 'h2-bad-reg',
            label: '1차 방어 확인용 샘플 번호 복사',
            targetHint: '/broker/profile → 개설등록번호',
            value: '11680-2024-00123',
          },
          {
            id: 'h2-good-reg',
            label: '정상 등록번호 복원용 복사',
            targetHint: '/broker/profile → 개설등록번호 (복원 저장)',
            value: '11680-2025-04821',
          },
        ],
        humanFocus: '차단 안내 문구가 불친절한 시스템 에러처럼 보이지 않고 바로 복구 동선으로 이어지는지 확인합니다.',
        autoProbeFocus: '복원 후 법정 표시사항 유효 상태를 재확인합니다.',
        oracleReference: '샘플 번호 저장 차단(400) · 누락 발행 차단(422) · 복원 즉시 정상화',
      },
      {
        id: 'H2-S2',
        loopId: 'loop2',
        stepNumber: 2,
        subsystem: 'IM·발표자료',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 5,
        severityOnFail: 'S0',
        title: '신축·개발용 · 2필지(616.1㎡) · 비정수 242억 2,680만 · 대지↔연면적 역전 가드 · 대수선 4.14%',
        workspaceHref: '/broker/w/im',
        workspaceLabel: 'IM 작업실 열기',
        actionChecklist: [
          '/broker/w/im 상단 매물 유형에서 반드시 [신축·개발용]을 고른 뒤, 지번 주소(2필지)를 붙여넣고 대지 616.1㎡ / 연면적 2,032.59㎡를 확인합니다.',
          '(역전 가드 체험) 대지면적 칸에 2032.59, 연면적 칸에 616.1을 일부러 반대로 입력해 보고 경고 배너의 [⇄ 값 서로 바꾸기] 버튼을 눌러 즉시 복원되는지 확인합니다 (TRAP-V2-2A).',
          '희망 매매가에 [억 단위: 242], [만원 단위: 2680]을 각각 입력해 "= 242억 2,680만 원" 독음을 확인한 뒤, ② 임대 현황에 [현황 6행 TSV]와 [+ 기대수익률] [안정화 6행 TSV]를 붙여넣어 1.37% → 4.14% 상승 및 5F·B1 만기경과 표시를 확인합니다 (TRAP-V2-2B).',
          '④ 사진 탭에 고해상도 5장(외관 PNG 3 + 내부 JPEG 2)을 업로드하고 [📥 PPTX 받기]로 10면 PPT 내 사진 분리·수익률·F5 보존을 확인합니다.',
        ],
        copySnippets: [
          {
            id: 'h2-im-addr',
            label: '2필지 지번 주소 복사 (잠원동 26-14, 26-16)',
            targetHint: '/broker/w/im → ① 기본 제원 주소 검색',
            value: '서울특별시 서초구 잠원동 26-14, 26-16',
          },
          {
            id: 'h2-im-eok',
            label: '억 단위 복사 (242)',
            targetHint: '/broker/w/im → [억 단위] 칸',
            value: '242',
          },
          {
            id: 'h2-im-man',
            label: '만원 단위 복사 (2680)',
            targetHint: '/broker/w/im → [만원 단위] 칸',
            value: '2680',
          },
          {
            id: 'h2-im-asis-tsv',
            label: '현황 6행 임대 현황 TSV 복사 (만기경과 2개층 포함)',
            targetHint: '/broker/w/im → ② 현황 렌트롤 [엑셀 붙여넣기]',
            value: HOLDOUT_V2_CASE03_ASIS_TSV,
          },
          {
            id: 'h2-im-stab-tsv',
            label: '대수선 안정화 6행 TSV 복사 (+기대수익률 4.14%)',
            targetHint: '/broker/w/im → ② [+ 기대수익률 렌트롤]',
            value: HOLDOUT_V2_CASE03_STABILIZED_TSV,
          },
        ],
        humanFocus: '신축·개발용 문구가 임대수익용처럼 어색하게 섞여 있지 않은지, 대지↔연면적 역전 복구 버튼이 한눈에 띄는지 확인합니다.',
        autoProbeFocus: '대지(616.1㎡)·연면적(2,032.59㎡) 및 만기경과 데이터 정합성을 검증합니다.',
        oracleReference: '242억 2,680만 표기 · 대지 616.1㎡(186.4평) / 연면적 2,032.59㎡ · 1.37% → 4.14% · 사진 5장 분리 정상',
      },
      {
        id: 'H2-S3',
        loopId: 'loop2',
        stepNumber: 3,
        subsystem: 'IM·발표자료',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '발표자료 꾸미기(슬라이드 편집) · 승인 검수 화면(/broker/im-approval) 민감 섹션 서버 숨김',
        workspaceHref: '/broker/w/im',
        workspaceLabel: 'IM 작업실에서 발표자료 꾸미기 진입',
        actionChecklist: [
          '/broker/w/im에서 [📐 발표자료 꾸미기](/broker/basic-im-studio/[buildingId])를 열어 신축·개발형 슬라이드 제목이 1180px 노트북 폭에서도 2행으로 깔끔히 보이는지 확인하고 1개 슬라이드 [제외/포함] 토글을 저장합니다.',
          '/broker/im-approval/[buildingId]로 이동해 민감 섹션 숨김을 켜고 저장해 외부 공개 /im-lite 화면에서 해당 섹션이 숨겨지는지 준비합니다.',
        ],
        copySnippets: [
          {
            id: 'h2-dc-memo',
            label: '잠원동 신축·개발 메모 원문 복사 (딜카드 겸용)',
            targetHint: '/broker/w/dealcards → 메모로 채우기',
            value: HOLDOUT_V2_CASE03_MEMO,
          },
        ],
        humanFocus: '발표자료 꾸미기의 슬라이드 포함/제외와 /im-lite 섹션 숨김 역할이 명확히 구분되는지 확인합니다.',
        autoProbeFocus: '서버에 저장된 hiddenSectionCount(>=1)를 자동 점검합니다.',
        oracleReference: '슬라이드 편집·저장 정상 · 승인 화면 숨김 섹션 외부 /im-lite 차단 정상',
      },
      {
        id: 'H2-S4',
        loopId: 'loop2',
        stepNumber: 4,
        subsystem: '딜카드',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S1',
        title: '신축·개발용 블라인드 딜카드 발행(대지 186평 우선) 및 서초 개발 브리핑 뉴스레터 편입',
        workspaceHref: '/broker/w/newsletter',
        workspaceLabel: '뉴스레터 작업실 열기',
        actionChecklist: [
          '/broker/w/dealcards에서 [신축·개발용]을 선택한 뒤 잠원동 메모를 붙여넣어, 카톡 썸네일 3번 칸에 연면적이 아닌 "대지면적 약 186평"이 강조되는지 확인하고 발행합니다(URL → 프로브 ①).',
          '/broker/w/newsletter에서 월간 개발 투자 브리핑 호수를 만들고 위 신축·개발 딜카드를 연결·발행한 뒤 URL을 우측 프로브 ④에 넣습니다.',
        ],
        copySnippets: [
          {
            id: 'h2-dc-headline',
            label: '신축·개발형 블라인드 한 줄 제목 복사',
            targetHint: '/broker/w/dealcards → 한 줄 제목 (지번·건물명 비노출)',
            value: '신사역 도보 3분 기득권 용적률 보유 대수선·신축 최적 코너 2필지 부지 (242억대)',
            isPublicFacing: true,
          },
          {
            id: 'h2-nl-title',
            label: '서초 신축·개발 월간 브리핑 제목 복사',
            targetHint: '/broker/w/newsletter → 표지 제목',
            value: '기득권 용적률 보유 신사·잠원권 노후 근생의 대수선·메디컬 밸류애드 투자 전략',
            isPublicFacing: true,
          },
          {
            id: 'h2-nl-brief',
            label: '서초 개발권 시장 브리핑 원문 복사',
            targetHint: '/broker/w/newsletter → 시장 브리핑 본문',
            value:
              '현행 주거지역 기준 용적률 제한이 강화된 강남·서초 핵심 역세권에서는 1990년대 초 준공되어 기득권 연면적을 300% 이상 확보한 코너 필지가 높은 희소가치를 인정받고 있습니다. 전면 신축 대비 공사 기간과 인허가 리스크를 줄이면서 메디컬 타워로 전관 대수선하는 전략이 주요 개발사들의 핵심 대안으로 부상하고 있습니다.',
            isPublicFacing: true,
          },
          {
            id: 'h2-nl-comment',
            label: '추천 매물 한 줄 코멘트 복사 (지번 비노출)',
            targetHint: '/broker/w/newsletter → 추천 매물 코멘트',
            value:
              '신사역 더블역세권 도보 3분 코너 2필지 대지 약 186평 · 현행 법정 상한을 상회하는 기득권 연면적 보유 대수선 최적지',
            isPublicFacing: true,
          },
        ],
        humanFocus: '신축·개발용 딜카드에서 연면적 대신 토지면적이 자연스럽게 전면에 노출되는지 확인합니다.',
        autoProbeFocus: '딜카드·뉴스레터 내 26-14·26-16·두원빌딩·임사장·02-544-8784 유출 0건을 자동 검증합니다.',
        oracleReference: '신축·개발용 대지 186평 강조 · 금지어 0건 · 월간 차트/푸터 정상',
      },
      {
        id: 'H2-S5',
        loopId: 'loop2',
        stepNumber: 5,
        subsystem: '매수자 열람·문의',
        windowBadge: '창 A ↔ 창 B·C',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '경쟁 매수자 2인(창 B 디벨로퍼 vs 창 C 건축사무소) 각각 자료 요청 및 독립 링크 발급',
        workspaceHref: '/broker/w/inbox',
        workspaceLabel: '고객 소통함 열기',
        actionChecklist: [
          '창 B(스마트폰)에서 딜카드(/dc/...) 자료 요청 창에 아래 [창 B · 매수자 1] 칩 3개를 입력·제출합니다.',
          '창 C(PC 시크릿 창)에서 동일 딜카드 자료 요청 창에 [창 C · 매수자 2] 칩 3개를 입력·제출합니다.',
          '창 A(/broker/w/inbox)에서 두 고객 요청을 각각 [자료 보내기(승인)] 해 발급된 링크 2개를 우측 프로브 ②, ③에 입력합니다.',
        ],
        copySnippets: [
          {
            id: 'h2-b1-name',
            label: '[창 B] 성함 복사 (박서연 대표 · 디벨롭파트너스)',
            targetHint: '창 B 자료 요청 창 → 성함',
            value: '박서연 대표 (디벨롭파트너스)',
          },
          {
            id: 'h2-b1-phone',
            label: '[창 B] 연락처 복사 (010-7782-1940)',
            targetHint: '창 B 자료 요청 창 · 우측 프로브 ⑤',
            value: '010-7782-1940',
          },
          {
            id: 'h2-b1-msg',
            label: '[창 B] 문의 내용 복사',
            targetHint: '창 B 자료 요청 창 → 문의 내용',
            value: '신사역권 대수선 메디컬 빌딩 사업성 검토 중입니다. 2필지 경계 현황과 명도 일정 자료 부탁드립니다.',
          },
          {
            id: 'h2-b2-name',
            label: '[창 C] 성함 복사 (한유진 소장 · 블룸건축)',
            targetHint: '창 C 시크릿 창 자료 요청 창 → 성함',
            value: '한유진 소장 (블룸건축)',
          },
          {
            id: 'h2-b2-phone',
            label: '[창 C] 연락처 복사 (010-3917-6620)',
            targetHint: '창 C 시크릿 창 자료 요청 창 → 연락처',
            value: '010-3917-6620',
          },
          {
            id: 'h2-b2-msg',
            label: '[창 C] 문의 내용 복사',
            targetHint: '창 C 시크릿 창 자료 요청 창 → 문의 내용',
            value: '기득권 용적률 활용 대수선 설계안 비교를 위해 상세 건축물 개요 및 현황 자료 요청합니다.',
          },
        ],
        humanFocus: '복수 고객이 동시에 신축·개발 매물을 문의할 때 스레드 목록에서 즉시 식별·응대할 수 있는지 봅니다.',
        autoProbeFocus: '매수자 1·2 링크 모두 열람 허용(isLocked=false) 상태인지 검증합니다.',
        oracleReference: '두 스레드 독립 생성 · 두 링크 모두 열람 허용 · 승인 화면 숨김 섹션 비노출',
      },
      {
        id: 'H2-S6',
        loopId: 'loop2',
        stepNumber: 6,
        subsystem: '고객 소통(승인·회수)',
        windowBadge: '창 A ↔ 창 B·C',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '스레드 단건 링크 닫기(창 B 차단, 창 C 유지) → 건물 전체 링크 닫기 직교 검증',
        workspaceHref: '/broker/w/inbox',
        workspaceLabel: '고객 소통함 열기',
        actionChecklist: [
          '1단계(단건 잠금): 창 A에서 "박서연 대표(창 B)" 스레드의 [보낸 링크 잠그기] → 체크박스 없이 [잠그기]를 눌러 창 B만 막히고 창 C(한유진 소장)는 계속 열리는지 확인합니다.',
          '2단계(전체 잠금): 한유진 소장 스레드에서 [보낸 링크 잠그기] → [☑ 이 건물 전체 열람 잠금 (모든 수신자 차단)] 체크 후 [잠그기]를 눌러 창 C까지 차단되는지 확인합니다.',
        ],
        copySnippets: [
          {
            id: 'h2-corr-banner',
            label: '명도 조건 정정 안내 문구 복사',
            targetHint: '/broker/w/inbox → [⚠️ 수치 정정 안내 띄우기]',
            value: '5층 및 지하 1층 만기 경과 호실의 명도 완료 시점이 계약 후 3개월 내로 확정 반영되었습니다.',
          },
        ],
        humanFocus: '단건 잠금과 건물 전체 잠금 체크박스의 시각적 경고가 실수를 막기에 충분한지 평가합니다.',
        autoProbeFocus: '②=잠김 / ③=열림 직교 상태와 전체 회수 후 둘 다 잠김 전환을 자동 판정합니다.',
        oracleReference: '단건 회수 시 타 스레드 유지 · 전체 회수 시 모든 링크 403 차단',
      },
      {
        id: 'H2-S7',
        loopId: 'loop2',
        stepNumber: 7,
        subsystem: '오라클·보안마감',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 1,
        severityOnFail: 'S1',
        title: '직접 등록 고객 삭제 · 공용 PC 민감 키 소거 점검 및 최종 Sign-off 제출',
        actionChecklist: [
          '/broker/w/inbox [+ 고객 직접 등록]으로 테스트 고객 1명을 넣었다가 [고객 삭제] 확인 입력으로 삭제·익명화합니다.',
          '우측 자동 오라클 프로브로 잠원동 2필지(616.1㎡)·블라인드·링크를 최종 검증하고, 로그아웃 후 [🧹 공용 PC 브라우저 잔여 키 점검]을 눌러 잔여 키 0건을 확인합니다.',
          '상단 [📋 Sign-off] 탭에서 V2 14스텝 종합 결과를 서버에 최종 제출합니다.',
        ],
        copySnippets: [],
        humanFocus: '이번 상보 Hold-out 2선(XLSX·신축개발형)에서 처음 발견된 어색한 문구나 개선 포인트를 종합 코멘트에 상세히 남깁니다.',
        autoProbeFocus: 'localStorage/sessionStorage 민감 임시 키 0건을 검증합니다.',
        oracleReference: '공용 PC 잔여 키 0건 · 14/14 스텝 판정 완료 및 서버 제출 성공',
      },
    ],
  },
];

export const FULL_LOOP_V2_ALL_STEPS: ReadonlyArray<FullLoopStepItem> = FULL_LOOP_V2_CASES.flatMap(
  (c) => c.steps,
);
