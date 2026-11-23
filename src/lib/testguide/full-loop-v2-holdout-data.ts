/**
 * @file src/lib/testguide/full-loop-v2-holdout-data.ts
 * @description Hold-out 실매물 2선 (당산동5가 115억 XLSX v1.5 + 잠원동 242억 신축·개발 2필지)
 *   전 주기 관통 휴먼 클릭스루 테스트 V2 SSOT 정의 (/qa-full-loop-v2).
 *
 * 인지과학 설계 원칙 (2026-11-23 개편):
 *  1. 실행 간극(Gulf of Execution) 제로: 모든 지시문은 실제 화면에 보이는 버튼 이름·색상·위치를 토씨 하나 다르지 않게 그대로 표기한다.
 *  2. 외재적 인지부하 제거: '오라클', '도메인 함정(TRAP)', 'TSV', '직교 회수', '400/422 코드' 등 개발자 용어를 배제하고 현업 한국어로 안내한다.
 *  3. 시선 분산(Split-Attention) 제거: 딜카드·IM·부동산뉴스 링크를 만든 단계 카드 바로 안에 링크 붙여넣기 칸을 배치한다.
 *  4. 입력 제약 정합성: 딜카드 '한 줄 제목 (18자 이내)' 복사 칩은 반드시 18자 이하로 제공한다.
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
  '서울특별시 영등포구 당산동5가 11-47 근생빌딩 매각 희망가 115억, 대지 506.8㎡(153.3평) / 연면적 1,441.15㎡(436.0평, B1~5F, 준공업지역), 현 보증금 6억 6,000만 / 월세 2,480만(전세 월세전환·공실해소 안정화 시 월 3,480만·수익률 3.83%), 2·9호선 당산역 도보 4분 래미안 대단지 정문 코너, 고은약국·로뎀나무내과·카페 장기 성업중 (김원장 010-2255-7711)';

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
  '서울특별시 서초구 잠원동 26-14, 26-16 두원빌딩 신축·리모델링 부지 매각 242억 2,680만 원(평당 1.3억), 2필지 합산 대지 616.1㎡(186.4평) / 연면적 2,032.59㎡(614.9평, 1990년 준공, 기득권 용적률 325.6%), 신사역 3호선·신분당선 도보 3분 코너 각지, 대수선 밸류애드 완료 시 월세 8,000만·기대수익률 4.14% 메디컬 타워 최적 (임사장님 02-544-8784)';

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
    roleLabel: '외부 1 · 전면/필로티 주차장',
    caption: '전면 외관 및 1층 필로티 자주식 주차장',
  },
  {
    filename: '02_외관_사거리코너전경.jpeg',
    format: 'JPG',
    roleLabel: '외부 2 · 사거리 코너 전경',
    caption: '배후 아파트 대단지 사거리 코너 전경',
  },
  {
    filename: '03_외관_영신로259주출입구.jpeg',
    format: 'JPG',
    roleLabel: '외부 3 · 1층 주출입구',
    caption: '주출입구 및 1층 약국·내과 전면',
  },
  {
    filename: '04_내부_2층로뎀내과복도.jpeg',
    format: 'JPG',
    roleLabel: '내부 4 · 2층 내과 복도',
    caption: '2층 내과의원 출입구 및 내부 홀',
  },
  {
    filename: '05_내부_내과수액검진실.jpeg',
    format: 'JPG',
    roleLabel: '내부 5 · 수액·검진실',
    caption: '의원 내부 복도 및 진료·수액실',
  },
  {
    filename: '06_내부_엘리베이터홀.jpeg',
    format: 'JPG',
    roleLabel: '내부 6 · 엘리베이터 홀',
    caption: '승강기 홀 및 내부 공용부 관리 상태',
  },
]);

const CASE03_IMAGES: TestGuideImageAsset[] = buildHoldoutImages('v2-case03', [
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

export const FULL_LOOP_V2_WINDOW_ROLES: ReadonlyArray<FullLoopWindowRoleCard> = [
  {
    id: 'windowA',
    badge: '창 A · 필수',
    title: '중개사 작업 화면',
    device: 'PC 크롬 일반 창 (로그인 상태)',
    purpose: '딜카드·IM·부동산뉴스 작성 및 고객 소통함 승인·링크 잠금',
  },
  {
    id: 'windowB',
    badge: '창 B · 필수',
    title: '매수자 1 (고객 화면)',
    device: '스마트폰 카카오톡 "나와의 채팅" (또는 다른 시크릿 브라우저)',
    purpose: '고객 눈높이에서 지번·상호 비공개 확인, 자료 요청 및 열람 확인',
  },
  {
    id: 'windowC',
    badge: '창 C · 2번 매물용',
    title: '매수자 2 (비교 고객 화면)',
    device: 'PC 크롬 시크릿 창 (Ctrl+Shift+N, 비로그인 상태)',
    purpose: '매수자 1 링크만 잠갔을 때 매수자 2 링크는 계속 열리는지 비교',
  },
];

export const FULL_LOOP_V2_CASES: ReadonlyArray<FullLoopCaseDefinition> = [
  {
    id: 'loop1',
    probeLoopId: 'v2-loop1',
    code: 'LOOP-01',
    tabLabel: 'Hold-out 1 · 당산 115억 XLSX',
    shortLabel: '매물 1 · 영등포 당산동5가 115억 (엑셀 .xlsx 업로드 · 사진 6장)',
    title: '실전 #1 — 당산동 115억 메디컬 빌딩 (엑셀 파일 업로드 → 딜카드 → IM → 뉴스 → 소통)',
    subtitle:
      '메모 1줄로 블라인드 딜카드를 만들고, 엑셀(.xlsx) 파일 2개와 현장 사진 6장을 올려 IM 발표자료·부동산뉴스·고객 승인까지 순서대로 체험합니다.',
    targetMinutes: 19,
    personaFocus: '대표 공인중개사(아주 크게 글씨 · 엑셀 파일 업로드) × 메디컬 빌딩 매수자',
    deviceSetup: '창 A(PC 크롬 로그인) + 창 B(스마트폰 카카오톡)',
    sampleKitZipUrl: '/api/public/qa-sample-kit?scenario=v2-loop1',
    csvDownloadUrl: '/api/public/qa-sample-kit?scenario=v2-loop1&format=xlsx',
    primarySheetLabel: '📊 1. 현황 엑셀(.xlsx) 받기',
    secondarySheetDownloadUrl: '/api/public/qa-sample-kit?scenario=v2-loop1&format=xlsx-stabilized',
    secondarySheetLabel: '📊 2. 기대수익률 엑셀(.xlsx) 받기',
    dealCode: 'HOLDOUT-CASE-04',
    propertyName: '당산동5가 11-47 메디컬 근생빌딩',
    jibunAddress: '서울특별시 영등포구 당산동5가 11-47',
    roadAddress: '서울특별시 영등포구 영신로 259',
    askingPriceReadout: '115억 원 (1,150,000만 원)',
    domainTraps: [
      {
        code: '확인 1',
        title: '엑셀(.xlsx) 업로드 시 통합계약(201호 0원) 자동 인식',
        detail:
          '02_현황_렌트롤_v1.5_sqm.xlsx 업로드 시 1·2층 통합계약인 201호(0원)가 공실로 잘못 잡히지 않고 공실은 202호 1건만 집계되는지 확인합니다.',
      },
      {
        code: '확인 2',
        title: '기계실·자가사용 제외 수익률 (현황 2.75% → 기대 3.83%)',
        detail:
          '현황 보증금 6억 6,000만·월세 2,480만(연 2.75%)과 기대수익률 보증금 5억 9,000만·월세 3,480만(연 3.83%)이 정확히 계산되는지 봅니다.',
      },
      {
        code: '확인 3',
        title: '병·의원/약국 상호 비공개 보호 & 사진 6장 배치',
        detail:
          '공개 딜카드·뉴스레터에 지번(11-47)과 상호(로뎀나무내과·고은약국)가 숨겨지고, 사진 6장이 PPT와 모바일 IM에 깔끔히 나뉘어 들어가는지 봅니다.',
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
      expectedDepositSummary: '현황 보증금 6억 6,000만 / 월세 2,480만 → 기대 보증금 5억 9,000만 / 월세 3,480만',
      expectedMonthlyRentSummary: '현황 월 2,480만 (관리비 215만) → 기대 월 3,480만 (관리비 274만)',
      expectedOccupancySummary:
        '총 15개 호실 중 기계실·자가사용 제외 임대가능 13호실 (공실 202호 1건)',
      expectedYieldSummary: '현황 연 2.75% → 전세 월세전환·공실해소 시 연 3.83%',
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
        title: '내 프로필 법정 5항목 확인 & 상단 [아주 크게] 글씨 모드 화면 점검',
        workspaceHref: '/broker/profile',
        workspaceLabel: '내 프로필 열기',
        actionChecklist: [
          '파란 [🚀 내 프로필 열기] 버튼을 눌러 상호·소재지·연락처·개설등록번호·대표자 성명 5칸이 모두 채워져 있는지 확인합니다 (비어 있으면 아래 복사 버튼을 눌러 채운 뒤 [저장] 클릭).',
          '상단 메뉴의 [📄 딜카드] 탭으로 이동한 뒤, 오른쪽 위 글자 크기 버튼 중 [아주 크게]를 눌러 왼쪽 목록과 아래 버튼 글자가 잘리지 않는지 확인하고 편한 글자 크기로 되돌립니다.',
        ],
        copySnippets: [
          {
            id: 'h1-prof-company',
            label: '중개사무소 상호 예시 복사',
            targetHint: '내 프로필 → 중개사무소 명칭 칸',
            value: '제이에스부동산중개법인 주식회사',
          },
          {
            id: 'h1-prof-reg',
            label: '개설등록번호 예시 복사',
            targetHint: '내 프로필 → 개설등록번호 칸',
            value: '11680-2025-04821',
          },
        ],
        humanFocus: '[아주 크게] 글씨 모드에서 버튼이나 목록 글자가 겹치거나 잘리지 않는지 봅니다.',
        autoProbeFocus: '중개사무소 법정 필수 5항목 저장 여부를 확인합니다.',
        oracleReference: '법정 표기 5항목 저장됨 · [아주 크게] 모드에서 버튼 잘림 없음',
      },
      {
        id: 'H1-S2',
        loopId: 'loop1',
        stepNumber: 2,
        subsystem: '딜카드',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '새 딜카드 만들기 → 당산동 메모 붙여넣기 → [카톡으로 보내기] 팝업에서 링크 복사',
        workspaceHref: '/broker/w/dealcards?new=1',
        workspaceLabel: '새 딜카드 작성 화면 열기',
        actionChecklist: [
          '파란 [🚀 새 딜카드 작성 화면 열기]를 누르면 빈 새 딜카드 메모창이 열립니다 (기존 서교동 샘플 카드에 덮어쓰지 않도록 반드시 새 딜카드에서 시작하세요).',
          '아래 [📋 1. 당산동 현장 메모 원문 복사]를 눌러 상단 "원본 매물 메모" 입력칸에 붙여넣고(Ctrl+V), 바로 아래 파란 [✨ 메모로 딜카드 생성하기] (또는 [↻ 메모 내용으로 딜카드 다시 채우기]) 버튼을 반드시 누릅니다.',
          '자동 채워진 카드에서 "11-47", "로뎀나무내과", "고은약국", "010-2255-7711"이 가려졌는지 확인합니다. "한 줄 제목 (18자 이내)" 칸을 바꾸고 싶다면 [📋 2. 한 줄 제목 복사 (16자)]를 붙여넣습니다.',
          '화면 맨 아래 파란 [카톡으로 보내기] 버튼을 누른 뒤 → 열리는 "카톡으로 보낼까요?" 팝업창에서 흰색 [링크 복사] 버튼을 누르고 → 바로 아래 ①번 칸에 붙여넣습니다(Ctrl+V). (참고: 보내고 나면 왼쪽 목록에 "● 보냄" 표시가 붙으며, 이전에 만든 카드가 있다면 날짜별로 함께 보관됩니다.)',
        ],
        copySnippets: [
          {
            id: 'h1-dc-memo',
            label: '1. 당산동 현장 메모 원문 복사 (115억)',
            targetHint: '새 딜카드 상단 → 원본 매물 메모 입력칸에 붙여넣기 후 생성 버튼 클릭',
            value: HOLDOUT_V2_CASE04_MEMO,
          },
          {
            id: 'h1-dc-headline',
            label: '2. 한 줄 제목 복사 (16자 · 18자 제한 맞춤)',
            targetHint: '딜카드 하단 → 한 줄 제목 (18자 이내) 입력칸',
            value: '당산역 4분 코너 메디컬 근생',
            isPublicFacing: true,
          },
        ],
        inlineScratchFields: [
          {
            field: 'dealCardUrl',
            label: '① 방금 팝업에서 [링크 복사]로 복사한 딜카드 주소 붙여넣기',
            placeholder: 'https://www.credeal.net/dc/... (여기에 Ctrl+V 붙여넣기)',
            helperText: '화면 맨 아래 [카톡으로 보내기] → 팝업의 [링크 복사]를 누른 뒤 여기에 붙여넣으세요.',
          },
        ],
        humanFocus: '메모 생성 버튼을 눌렀을 때 지역("영등포구 당산동")·가격("100~120억")이 한 번에 채워지고 병원 실명이 일반 업종으로 순화되는지 봅니다.',
        autoProbeFocus: '복사한 딜카드 주소에 11-47·로뎀나무내과·고은약국·김원장·전화번호 노출이 0건인지 자동 점검합니다.',
        oracleReference: '지역 영등포구 당산동 · 가격 100~120억 · 지번/상호 비노출 통과',
      },
      {
        id: 'H1-S3',
        loopId: 'loop1',
        stepNumber: 3,
        subsystem: 'IM·발표자료',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 5,
        severityOnFail: 'S0',
        title: '새 IM 주소 조회(506.8㎡) → 현황·기대수익률 엑셀(.xlsx) 업로드 → 사진 6장 & PPT 받기',
        workspaceHref: '/broker/w/im?fresh=1',
        workspaceLabel: '새 IM 작성 화면 열기',
        actionChecklist: [
          '이 페이지 맨 위 파란 [📦 전체 테스트 자료 ZIP 받기]를 내려받아 압축을 풀거나, [📊 1. 현황 엑셀(.xlsx) 받기]·[📊 2. 기대수익률 엑셀(.xlsx) 받기] 파일을 받아 둡니다 (ZIP 안 00_대장면적_및_수익률_기준값_대조표.txt에 대지면적 506.80㎡·연면적 1,441.15㎡ 비교표가 들어 있습니다).',
          '파란 [🚀 새 IM 작성 화면 열기] 클릭 → ① 표지·기본정보 탭의 "건물 주소 *" 칸에 아래 [📋 지번 주소 복사]를 붙여넣고 오른쪽 [주소로 건물 정보 자동 채우기] 클릭 → 연면적 "1441.15"(약 436평) · 대지면적 "506.8"(약 153평) 확인 후 위 "억 단위" 칸에 "115"를 입력합니다.',
          '상단 [② 층별 임대현황] 탭 클릭 → 표 오른쪽 위 흰색 [📁 엑셀 파일 불러오기 ▾] 클릭 → 점선 박스에 "02_현황_렌트롤_v1.5_sqm.xlsx" 파일을 선택해 올리고, 상단 합계가 "보증금 6억 6,000만 원 · 월세 2,480만 원 · 연 2.75%"로 바뀌는지 확인합니다.',
          '바로 옆 파란 [+ 기대수익률 임대차 현황 (선택)] 탭 클릭 → 두 가지 방법 중 편한 방법으로 채웁니다: (방법 A) 표 오른쪽 위 [📁 엑셀 파일 불러오기 ▾]를 눌러 "03_안정화_렌트롤_v1.5_sqm.xlsx" 업로드! / (방법 B) 아래 [📋 기대수익률 14행 표 복사] 버튼을 누른 뒤 IM 화면의 파란 [📋 표 붙여넣기] 버튼만 한 번 클릭!',
          '상단 [④ 사진·위치·만들기] 탭 클릭 → ZIP 압축을 푼 photos 폴더의 사진 6장을 드래그해 올리고 → 파란 [IM 만들기] 버튼을 누릅니다. 완료되면 바로 옆(또는 오른쪽 아래) 초록색 [🔗 IM 링크 복사] 버튼을 눌러 아래 ②번 칸에 붙여넣고, 오른쪽 아래 [📥 PPTX 받기]로 발표자료 슬라이드를 확인합니다.',
        ],
        copySnippets: [
          {
            id: 'h1-im-addr',
            label: '1. 지번 주소 복사 (당산동5가 11-47)',
            targetHint: 'IM ① 표지·기본정보 → 건물 주소 칸에 붙여넣고 [주소로 건물 정보 자동 채우기] 클릭',
            value: '서울특별시 영등포구 당산동5가 11-47',
          },
          {
            id: 'h1-im-price-eok',
            label: '2. 희망 매매가 억 단위 복사 (115)',
            targetHint: 'IM ① 표지·기본정보 → 희망 매매가 [억 단위] 칸',
            value: '115',
          },
          {
            id: 'h1-im-stabilized-tsv',
            label: '3. (선택) 기대수익률 14행 표 복사',
            targetHint: '복사 후 IM [+ 기대수익률 임대차 현황] 탭의 파란 [📋 표 붙여넣기] 버튼 1번 클릭',
            value: HOLDOUT_V2_CASE04_STABILIZED_TSV,
          },
        ],
        inlineScratchFields: [
          {
            field: 'imShareUrl',
            label: '② [🔗 IM 링크 복사] 버튼으로 복사한 IM 주소 붙여넣기 (/im-lite/...)',
            placeholder: 'https://www.credeal.net/im-lite/... (여기에 Ctrl+V 붙여넣기)',
            helperText: '파란 [IM 만들기] 클릭 후 바로 옆 또는 오른쪽 아래 초록색 [🔗 IM 링크 복사] 버튼을 눌러 붙여넣으세요 (상단 주소창 URL도 자동 인식됩니다).',
          },
        ],
        humanFocus: '현황 엑셀과 기대수익률 엑셀 모두 [📁 엑셀 파일 불러오기 ▾] 또는 파란 [📋 표 붙여넣기]로 헤매지 않고 바로 채워지는지 확인합니다.',
        autoProbeFocus: '대지면적(506.8㎡)·연면적(1,441.15㎡) 일치 여부와 IM 링크 열람 가능 상태를 자동 점검합니다.',
        oracleReference: '현황 연 2.75%(보 6.6억/월 2,480만) → 기대 연 3.83%(보 5.9억/월 3,480만) · 사진 6장 정상',
      },
      {
        id: 'H1-S4',
        loopId: 'loop1',
        stepNumber: 4,
        subsystem: '뉴스레터',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S1',
        title: '부동산뉴스 작성 · 당산동 딜카드 연결 · 새로고침(F5) 유지 확인 · 발행 링크 복사',
        workspaceHref: '/broker/w/newsletter',
        workspaceLabel: '부동산뉴스 작업실 열기',
        actionChecklist: [
          '파란 [🚀 부동산뉴스 작업실 열기] 클릭 → 왼쪽 위 [+ 새 호수 만들기]를 누른 뒤, 아래 복사 버튼 3개로 표지 제목·시장 브리핑·추천 매물 코멘트를 붙여넣고 방금 만든 당산동 매물을 추천 매물로 선택합니다.',
          '키보드 F5(새로고침)를 한 번 눌러 작성한 글이 날아가지 않고 그대로 남아 있는지 확인합니다.',
          '오른쪽 아래 [구독자에게 보내기] 완료 후 [링크 복사]를 눌러 바로 아래 ④번 칸에 붙여넣고, 스마트폰(창 B) 카카오톡 "나와의 채팅"에도 보내 둡니다.',
        ],
        copySnippets: [
          {
            id: 'h1-nl-title',
            label: '1. 부동산뉴스 표지 제목 복사',
            targetHint: '부동산뉴스 → ① 표지 제목 입력칸',
            value: '2·9호선 환승역 배후 대단지 앞 메디컬·근생 복합빌딩 밸류업 가이드',
            isPublicFacing: true,
          },
          {
            id: 'h1-nl-brief',
            label: '2. 시장 브리핑 본문 복사',
            targetHint: '부동산뉴스 → ② 시장 브리핑 본문 입력칸',
            value:
              '더블역세권과 대단지 주거 배후를 동시에 품은 준공업지역 코너 빌딩은 병·의원과 생활밀착 업종의 장기 임차 수요가 끊이지 않습니다. 특히 전세·자가사용 등 저수익 구간이 남아 있는 자산은 임대 구조 재편만으로도 안정화 시 현금흐름을 40% 이상 개선할 수 있어 실수요 투자자들의 관심이 높습니다.',
            isPublicFacing: true,
          },
          {
            id: 'h1-nl-comment',
            label: '3. 추천 매물 한 줄 소개 복사 (지번 비노출)',
            targetHint: '부동산뉴스 → 추천 매물 코멘트 입력칸',
            value:
              '더블역세권 도보 4분 사거리 코너 · 우량 메디컬 임차 기반에 전세·공실 전환 시 월세 +1,000만원 증액 여력 보유',
            isPublicFacing: true,
          },
        ],
        inlineScratchFields: [
          {
            field: 'newsletterUrl',
            label: '④ 발행된 부동산뉴스 주소 붙여넣기 (/magazine/...)',
            placeholder: 'https://www.credeal.net/magazine/... (여기에 Ctrl+V 붙여넣기)',
          },
        ],
        humanFocus: '메디컬·근생 투자 포인트가 과장 없이 신뢰감 있게 읽히는지 확인합니다.',
        autoProbeFocus: '발행된 부동산뉴스에 11-47·로뎀나무내과·고은약국 노출이 0건인지 자동 점검합니다.',
        oracleReference: '새로고침 후 내용 100% 유지 · 지번/상호 노출 0건 · 하단 사무소 표기 정상',
      },
      {
        id: 'H1-S5',
        loopId: 'loop1',
        stepNumber: 5,
        subsystem: '매수자 열람·문의',
        windowBadge: '창 B (스마트폰 카톡 매수자 1)',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '스마트폰 카톡 열람 · 매수자(강민석 팀장) 상세 자료 요청 & 뉴스 구독 신청',
        actionChecklist: [
          '창 B(스마트폰 카카오톡 또는 시크릿 창)에서 방금 보낸 링크 미리보기에 "11-47"이나 "로뎀나무내과"가 보이지 않는지 확인합니다.',
          '부동산뉴스 → 추천 매물 딜카드 → [상세 IM 자료 요청하기] 버튼을 눌러 아래 복사 칩 4개로 성함·연락처·이메일·문의 내용을 넣고 제출합니다.',
          '부동산뉴스 하단 "뉴스레터 신청" 칸에서 [둘 다 받기](또는 [휴대폰으로 받기] 아래 선택 이메일 칸)를 선택해 연락처(010-6193-4470)와 이메일(ms.kang@example.kr)을 함께 입력하고 [뉴스레터 신청하기]를 누릅니다.',
        ],
        copySnippets: [
          {
            id: 'h1-buyer-name',
            label: '매수자 성함 복사 (강민석 팀장)',
            targetHint: '고객 화면 자료 요청 창 → 성함',
            value: '강민석 팀장',
          },
          {
            id: 'h1-buyer-phone',
            label: '매수자 연락처 복사 (010-6193-4470)',
            targetHint: '자료 요청 창 · 뉴스 구독 칸',
            value: '010-6193-4470',
          },
          {
            id: 'h1-buyer-email',
            label: '매수자 이메일 복사 (ms.kang@example.kr)',
            targetHint: '자료 요청 창 · 뉴스 구독 칸',
            value: 'ms.kang@example.kr',
          },
          {
            id: 'h1-buyer-msg',
            label: '문의 내용 복사',
            targetHint: '자료 요청 창 → 문의 내용',
            value: '당산역권 100억대 메디컬 빌딩 매입 검토 중입니다. 2층 공실 조건과 안정화 수지 상세 내역 요청드립니다.',
          },
        ],
        humanFocus: '모바일 화면에서 글자 크기와 입력칸 터치가 편한지 확인합니다.',
        autoProbeFocus: '고객 연락처(010-6193-4470)가 소통함과 구독자 명단에 들어왔는지 자동 점검합니다.',
        oracleReference: '모바일 화면 좌우 넘침 없음 · 자료 요청 및 구독 접수 완료',
      },
      {
        id: 'H1-S6',
        loopId: 'loop1',
        stepNumber: 6,
        subsystem: '고객 소통(승인·회수)',
        windowBadge: '창 A ↔ 창 B',
        targetMinutes: 2,
        severityOnFail: 'S0',
        title: '고객 소통함에서 [자료 보내기] 1클릭 승인 → 고객 화면에서 전체 IM 열람 확인',
        workspaceHref: '/broker/w/inbox',
        workspaceLabel: '고객 소통함 열기',
        actionChecklist: [
          '창 A에서 파란 [🚀 고객 소통함 열기] 클릭 → 왼쪽 [할 일] 목록에 뜬 "강민석 팀장"의 초록색 [자료 보내기] 버튼을 누릅니다.',
          '자동 복사된 승인 전용 IM 링크(/im-lite/...?t=...)를 바로 아래 ②번 칸에 덮어써서 붙여넣고, 창 B에서도 열어 15개 호실 표와 기대수익률(3.83%)·사진 6장이 모두 열리는지 확인합니다.',
        ],
        copySnippets: [
          {
            id: 'h1-ib-memo',
            label: '상담 메모 예시 복사',
            targetHint: '고객 소통함 → [기록] 탭 메모칸',
            value: '강민석 팀장 상담 완료 — 2층 202호 공실 피부과 임차 의향 조건 및 3층 전세 만기 일정 자료 발송',
          },
        ],
        inlineScratchFields: [
          {
            field: 'imShareUrl',
            label: '② 소통함 [자료 보내기] 클릭 시 복사된 승인 링크 붙여넣기',
            placeholder: 'https://www.credeal.net/im-lite/...?t=... (여기에 Ctrl+V)',
          },
        ],
        humanFocus: '초록색 [자료 보내기] 버튼 한 번으로 승인 링크가 즉시 복사되고 고객 화면이 바로 열리는지 확인합니다.',
        autoProbeFocus: '승인 전용 링크가 잠금 없이 정상 열람 상태인지 자동 점검합니다.',
        oracleReference: '1클릭 승인 완료 · 모바일에서 현황(2.75%)과 기대수익률(3.83%) 모두 열람됨',
      },
      {
        id: 'H1-S7',
        loopId: 'loop1',
        stepNumber: 7,
        subsystem: '오라클·보안마감',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 1,
        severityOnFail: 'S1',
        title: '매물 1 자동 점검 버튼 실행 및 체감 판정 기록',
        actionChecklist: [
          '오른쪽(또는 화면 아래) "실시간 링크·면적 자동 점검기"의 [🔍 입력한 링크·면적 자동 점검 실행] 검은색 버튼을 누릅니다.',
          '대지(506.8㎡)·연면적(1,441.15㎡), 딜카드·뉴스 비공개 보호, IM 링크 활성, 고객 등록까지 초록색 통과가 뜨는지 확인하고 각 단계의 [✅ 통과 / ✨ 손질 필요 / 🚨 결함]을 선택합니다.',
        ],
        copySnippets: [],
        humanFocus: '엑셀(.xlsx) 업로드부터 카톡 전달까지 막히거나 헷갈린 지점이 있었다면 메모칸에 한 줄로 남겨 주세요.',
        autoProbeFocus: '당산동 대지면적·연면적·비공개 보호·공유 링크·구독자 등록을 일괄 대조합니다.',
        oracleReference: '자동 점검 전 항목 통과 · 막힘 없이 완주',
      },
    ],
  },
  {
    id: 'loop2',
    probeLoopId: 'v2-loop2',
    code: 'LOOP-02',
    tabLabel: 'Hold-out 2 · 잠원 242억 신축개발',
    shortLabel: '매물 2 · 서초 잠원동 242억 (신축·개발용 · 2필지 · 링크 개별 잠금)',
    title: '실전 #2 — 잠원동 242억 신축·개발 부지 (2필지 합산 · 면적 뒤바뀜 복구 · 매수자별 링크 잠금)',
    subtitle:
      '잠원동 26-14, 26-16 2필지(242억 2,680만 원)로 신축·개발용 매물 작성, 연면적↔대지면적 뒤바뀜 1클릭 복구, 경쟁 매수자 2명 중 1명만 링크 잠그기를 체험합니다.',
    targetMinutes: 20,
    personaFocus: '개발·빌딩 전담 중개사 × 디벨로퍼(매수자 1) · 건축사사무소(매수자 2)',
    deviceSetup: '창 A(PC 크롬 로그인) + 창 B(스마트폰 카톡: 매수자 1) + 창 C(PC 시크릿 창: 매수자 2)',
    sampleKitZipUrl: '/api/public/qa-sample-kit?scenario=v2-loop2',
    csvDownloadUrl: '/api/public/qa-sample-kit?scenario=v2-loop2&format=csv',
    primarySheetLabel: '📊 현행 임대현황 CSV 받기',
    dealCode: 'HOLDOUT-CASE-03',
    propertyName: '잠원동 26-14외1 두원빌딩 (신축·개발)',
    jibunAddress: '서울특별시 서초구 잠원동 26-14, 26-16',
    roadAddress: '서울특별시 서초구 신반포로47길 9-6',
    askingPriceReadout: '242억 2,680만 원 (2,422,680만 원)',
    domainTraps: [
      {
        code: '확인 1',
        title: '2필지 자동 합산(616.1㎡) · 억/만원 분리 입력 · 면적 뒤바뀜 복구',
        detail:
          '26-14와 26-16 두 필지 합산 대지면적(616.1㎡), 242억 + 2,680만 원 입력, 연면적·대지면적을 반대로 적었을 때 뜨는 [⇄ 연면적·대지면적 값 서로 바꾸기] 버튼을 확인합니다.',
      },
      {
        code: '확인 2',
        title: '신축·개발용 토지면적(약 186평) 우선 표시 & 만기경과 안내',
        detail:
          '신축·개발용 선택 시 딜카드 3번 칸에 연면적 대신 대지면적(약 186평)이 강조되고, 대수선 후 수익률(1.37% → 4.14%)이 반영되는지 확인합니다.',
      },
      {
        code: '확인 3',
        title: '매수자 1 링크만 잠갔을 때 매수자 2 링크는 그대로 유지',
        detail:
          '박서연 대표(창 B) 링크만 잠갔을 때 한유진 소장(창 C) 링크는 계속 열리고, 이후 "이 건물 전체 열람 잠금"을 켜면 둘 다 잠기는지 확인합니다.',
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
        id: 'H2-S1',
        loopId: 'loop2',
        stepNumber: 1,
        subsystem: '프로필·법정표기',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 2,
        severityOnFail: 'S0',
        title: '가짜 등록번호 저장 차단 & 빈칸일 때 발송 차단 확인 후 정상 번호 복원',
        workspaceHref: '/broker/profile',
        workspaceLabel: '내 프로필 열기',
        actionChecklist: [
          '파란 [🚀 내 프로필 열기] 클릭 → "개설등록번호" 칸에 아래 [📋 1. 예시 가짜 번호 복사(11680-2024-00123)]를 붙여넣고 [저장]을 눌렀을 때 예시 번호 차단 안내가 뜨는지 확인합니다.',
          '개설등록번호를 비운 채 저장한 뒤 딜카드 보내기를 시도하면 법정 정보 입력 안내가 뜨는지 확인하고, 다시 [📋 2. 정상 등록번호 복원용 복사]를 붙여넣어 [저장]합니다.',
        ],
        copySnippets: [
          {
            id: 'h2-bad-reg',
            label: '1. 차단 확인용 예시 번호 복사',
            targetHint: '내 프로필 → 개설등록번호 칸 (저장 차단 확인용)',
            value: '11680-2024-00123',
          },
          {
            id: 'h2-good-reg',
            label: '2. 정상 등록번호 복원용 복사',
            targetHint: '내 프로필 → 개설등록번호 칸 (확인 후 반드시 복원 저장)',
            value: '11680-2025-04821',
          },
        ],
        humanFocus: '차단 안내 문구가 이해하기 쉽고 프로필 수정 화면으로 바로 안내하는지 확인합니다.',
        autoProbeFocus: '정상 등록번호 복원 후 법정 필수 정보 유효 상태를 확인합니다.',
        oracleReference: '예시 번호 저장 차단 · 누락 시 발송 차단 · 복원 저장 즉시 정상화',
      },
      {
        id: 'H2-S2',
        loopId: 'loop2',
        stepNumber: 2,
        subsystem: 'IM·발표자료',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 5,
        severityOnFail: 'S0',
        title: '새 IM [신축·개발용] 선택 · 2필지(616.1㎡) · 면적 뒤바뀜 복구 · 242억 2,680만 · 사진 5장',
        workspaceHref: '/broker/w/im?fresh=1',
        workspaceLabel: '새 IM 작성 화면 열기',
        actionChecklist: [
          '파란 [🚀 새 IM 작성 화면 열기] 클릭 → ① 표지·기본정보 맨 위 "어떤 매물인가요?"에서 오른쪽 [신축·개발용] 카드를 클릭합니다.',
          '"건물 주소 *" 칸에 [📋 1. 2필지 주소 복사]를 붙여넣고 [주소로 건물 정보 자동 채우기] 클릭 → 연면적 "2032.59"(약 615평) · 대지면적 "616.1"(약 186평) 2필지 합산값을 확인합니다.',
          '(실수 복구 체험) 일부러 연면적 칸에 "616.1", 대지면적 칸에 "2032.59"를 반대로 적어 노란 경고창의 [⇄ 연면적·대지면적 값 서로 바꾸기] 버튼을 눌러 원래대로 복구되는지 확인합니다.',
          '희망 매매가 [억 단위] 칸에 "242", 옆 [만원 단위] 칸에 "2680"을 입력해 "= 242억 2,680만 원"을 확인합니다.',
          '[② 층별 임대현황] 탭 클릭 → 아래 [📋 4. 현행 6행 표 복사] 클릭 후 IM 화면의 파란 [📋 표 붙여넣기] 버튼 클릭(연 1.37%) → 옆 [+ 기대수익률 임대차 현황 (선택)] 탭 클릭 후 [📋 5. 기대수익률 6행 표 복사] → 파란 [📋 표 붙여넣기] 클릭(연 4.14%) → [④ 사진·위치·만들기] 탭에 사진 5장을 올리고 [📥 PPTX 받기] 및 파란 [IM 만들기]를 실행합니다.',
        ],
        copySnippets: [
          {
            id: 'h2-im-addr',
            label: '1. 2필지 지번 주소 복사 (잠원동 26-14, 26-16)',
            targetHint: 'IM ① 표지·기본정보 → 건물 주소 칸 붙여넣기 후 자동 채우기 클릭',
            value: '서울특별시 서초구 잠원동 26-14, 26-16',
          },
          {
            id: 'h2-im-eok',
            label: '2. 억 단위 복사 (242)',
            targetHint: 'IM ① 표지·기본정보 → [억 단위] 칸',
            value: '242',
          },
          {
            id: 'h2-im-man',
            label: '3. 만원 단위 복사 (2680)',
            targetHint: 'IM ① 표지·기본정보 → [만원 단위] 칸',
            value: '2680',
          },
          {
            id: 'h2-im-asis-tsv',
            label: '4. 현행 6행 표 복사 (만기경과 2개층 포함)',
            targetHint: '복사 후 IM [현행 임대차 현황]의 파란 [📋 표 붙여넣기] 버튼 클릭',
            value: HOLDOUT_V2_CASE03_ASIS_TSV,
          },
          {
            id: 'h2-im-stab-tsv',
            label: '5. 기대수익률 6행 표 복사 (연 4.14%)',
            targetHint: '복사 후 IM [+ 기대수익률 임대차 현황]의 파란 [📋 표 붙여넣기] 버튼 클릭',
            value: HOLDOUT_V2_CASE03_STABILIZED_TSV,
          },
        ],
        humanFocus: '[⇄ 연면적·대지면적 값 서로 바꾸기] 버튼과 파란 [📋 표 붙여넣기] 동작이 직관적인지 확인합니다.',
        autoProbeFocus: '2필지 합산 대지면적(616.1㎡)·연면적(2,032.59㎡) 정합성을 자동 점검합니다.',
        oracleReference: '242억 2,680만 원 · 대지 616.1㎡ / 연면적 2,032.59㎡ · 1.37% → 4.14% · 사진 5장 정상',
      },
      {
        id: 'H2-S3',
        loopId: 'loop2',
        stepNumber: 3,
        subsystem: 'IM·발표자료',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '하단 [발표자료 꾸미기] 슬라이드 끄기/켜기 & 검수 화면 민감 섹션 숨기기',
        workspaceHref: '/broker/w/im',
        workspaceLabel: 'IM 작업실 열기',
        actionChecklist: [
          'IM 작업실 화면 오른쪽 아래 흰색 [발표자료 꾸미기] 버튼을 눌러 슬라이드 편집 화면으로 이동한 뒤, 슬라이드 1개의 포함/제외 스위치를 껐다 켜고 저장합니다.',
          '이어서 승인·검수 화면(/broker/im-approval/[건물ID])에서 민감한 섹션 1개를 숨김으로 전환하고 저장합니다.',
        ],
        copySnippets: [
          {
            id: 'h2-dc-memo',
            label: '잠원동 신축·개발 현장 메모 복사 (다음 단계 딜카드용)',
            targetHint: '새 딜카드 상단 → 원본 매물 메모 입력칸',
            value: HOLDOUT_V2_CASE03_MEMO,
          },
        ],
        humanFocus: '슬라이드 포함/제외 토글과 고객 열람용 섹션 숨김 조작이 이해하기 쉬운지 확인합니다.',
        autoProbeFocus: '서버에 저장된 숨김 섹션 설정(1개 이상)을 자동 확인합니다.',
        oracleReference: '발표자료 슬라이드 저장 정상 · 민감 섹션 외부 비노출 적용',
      },
      {
        id: 'H2-S4',
        loopId: 'loop2',
        stepNumber: 4,
        subsystem: '딜카드',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S1',
        title: '새 딜카드 [신축·개발용](대지면적 약 186평 강조) 생성 & 서초 부동산뉴스 발행',
        workspaceHref: '/broker/w/dealcards?new=1',
        workspaceLabel: '새 딜카드 작성 화면 열기',
        actionChecklist: [
          '파란 [🚀 새 딜카드 작성 화면 열기] 클릭 → 이전 단계의 잠원동 메모를 붙여넣고 [✨ 메모로 딜카드 생성하기] 클릭 → 매물 유형에서 [신축·개발용]을 골라 3번 면적 칸이 "토지면적 약 186평"(대지면적)으로 표시되는지 확인합니다.',
          '필요 시 아래 [📋 1. 한 줄 제목 복사 (17자)]를 한 줄 제목 칸에 넣은 뒤, 맨 아래 파란 [카톡으로 보내기] → 팝업의 흰색 [링크 복사]를 눌러 아래 ①번 칸에 붙여넣습니다.',
          '상단 메뉴 [📰 부동산뉴스]로 이동해 [+ 새 호수 만들기] 후 아래 2~4번 복사 칩을 붙여넣고 잠원동 딜카드를 연결 → [구독자에게 보내기] → [링크 복사] 주소를 아래 ④번 칸에 붙여넣습니다.',
        ],
        copySnippets: [
          {
            id: 'h2-dc-headline',
            label: '1. 한 줄 제목 복사 (17자 · 18자 제한 맞춤)',
            targetHint: '딜카드 → 한 줄 제목 (18자 이내) 입력칸',
            value: '신사역 3분 코너 신축·대수선지',
            isPublicFacing: true,
          },
          {
            id: 'h2-nl-title',
            label: '2. 부동산뉴스 표지 제목 복사',
            targetHint: '부동산뉴스 → ① 표지 제목 입력칸',
            value: '기득권 용적률 보유 신사·잠원권 노후 근생의 대수선·메디컬 밸류애드 투자 전략',
            isPublicFacing: true,
          },
          {
            id: 'h2-nl-brief',
            label: '3. 서초 개발 시장 브리핑 본문 복사',
            targetHint: '부동산뉴스 → ② 시장 브리핑 본문 입력칸',
            value:
              '현행 주거지역 기준 용적률 제한이 강화된 강남·서초 핵심 역세권에서는 1990년대 초 준공되어 기득권 연면적을 300% 이상 확보한 코너 필지가 높은 희소가치를 인정받고 있습니다. 전면 신축 대비 공사 기간과 인허가 리스크를 줄이면서 메디컬 타워로 전관 대수선하는 전략이 주요 개발사들의 핵심 대안으로 부상하고 있습니다.',
            isPublicFacing: true,
          },
          {
            id: 'h2-nl-comment',
            label: '4. 추천 매물 한 줄 소개 복사 (지번 비노출)',
            targetHint: '부동산뉴스 → 추천 매물 코멘트 입력칸',
            value:
              '신사역 더블역세권 도보 3분 코너 2필지 대지 약 186평 · 현행 법정 상한을 상회하는 기득권 연면적 보유 대수선 최적지',
            isPublicFacing: true,
          },
        ],
        inlineScratchFields: [
          {
            field: 'dealCardUrl',
            label: '① 딜카드 [카톡으로 보내기] → 팝업 [링크 복사] 주소 붙여넣기',
            placeholder: 'https://www.credeal.net/dc/... (여기에 Ctrl+V)',
          },
          {
            field: 'newsletterUrl',
            label: '④ 발행된 부동산뉴스 [링크 복사] 주소 붙여넣기',
            placeholder: 'https://www.credeal.net/magazine/... (여기에 Ctrl+V)',
          },
        ],
        humanFocus: '[신축·개발용] 선택 시 연면적 대신 토지면적(약 186평)이 썸네일에 강조되는지 확인합니다.',
        autoProbeFocus: '딜카드·부동산뉴스 내 26-14·26-16·두원빌딩·임사장·전화번호 노출 0건을 자동 점검합니다.',
        oracleReference: '토지면적 약 186평 표시 · 비공개 키워드 노출 0건',
      },
      {
        id: 'H2-S5',
        loopId: 'loop2',
        stepNumber: 5,
        subsystem: '매수자 열람·문의',
        windowBadge: '창 A ↔ 창 B·C',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '경쟁 매수자 2명(창 B 박서연 대표 · 창 C 한유진 소장) 자료 요청 및 소통함 개별 승인',
        workspaceHref: '/broker/w/inbox',
        workspaceLabel: '고객 소통함 열기',
        actionChecklist: [
          '창 B(스마트폰)에서 위 ①번 딜카드 링크를 열고 [상세 IM 자료 요청하기]에 [창 B · 매수자 1] 복사 칩 3개를 넣어 제출합니다.',
          '창 C(PC 크롬 시크릿 창 Ctrl+Shift+N)에서도 같은 딜카드 링크를 열고 [창 C · 매수자 2] 복사 칩 3개를 넣어 제출합니다.',
          '창 A [🚀 고객 소통함 열기]에서 박서연 대표와 한유진 소장의 초록색 [자료 보내기] 버튼을 각각 눌러 복사된 링크 2개를 바로 아래 ②번·③번 칸에 각각 붙여넣습니다.',
        ],
        copySnippets: [
          {
            id: 'h2-b1-name',
            label: '[창 B · 매수자 1] 성함 복사 (박서연 대표)',
            targetHint: '창 B 자료 요청 창 → 성함',
            value: '박서연 대표 (디벨롭파트너스)',
          },
          {
            id: 'h2-b1-phone',
            label: '[창 B · 매수자 1] 연락처 복사 (010-7782-1940)',
            targetHint: '창 B 자료 요청 창 → 연락처',
            value: '010-7782-1940',
          },
          {
            id: 'h2-b1-msg',
            label: '[창 B · 매수자 1] 문의 내용 복사',
            targetHint: '창 B 자료 요청 창 → 문의 내용',
            value: '신사역권 대수선 메디컬 빌딩 사업성 검토 중입니다. 2필지 경계 현황과 명도 일정 자료 부탁드립니다.',
          },
          {
            id: 'h2-b2-name',
            label: '[창 C · 매수자 2] 성함 복사 (한유진 소장)',
            targetHint: '창 C 시크릿 창 자료 요청 창 → 성함',
            value: '한유진 소장 (블룸건축)',
          },
          {
            id: 'h2-b2-phone',
            label: '[창 C · 매수자 2] 연락처 복사 (010-3917-6620)',
            targetHint: '창 C 시크릿 창 자료 요청 창 → 연락처',
            value: '010-3917-6620',
          },
          {
            id: 'h2-b2-msg',
            label: '[창 C · 매수자 2] 문의 내용 복사',
            targetHint: '창 C 시크릿 창 자료 요청 창 → 문의 내용',
            value: '기득권 용적률 활용 대수선 설계안 비교를 위해 상세 건축물 개요 및 현황 자료 요청합니다.',
          },
        ],
        inlineScratchFields: [
          {
            field: 'imShareUrl',
            label: '② 박서연 대표(창 B) [자료 보내기] 승인 링크 붙여넣기',
            placeholder: 'https://www.credeal.net/im-lite/...?t=... (박서연 대표용)',
          },
          {
            field: 'secondaryImShareUrl',
            label: '③ 한유진 소장(창 C) [자료 보내기] 승인 링크 붙여넣기',
            placeholder: 'https://www.credeal.net/im-lite/...?t=... (한유진 소장용)',
          },
        ],
        humanFocus: '동일 매물에 두 고객이 문의했을 때 소통함 목록에서 헷갈리지 않고 각각 승인할 수 있는지 봅니다.',
        autoProbeFocus: '②번·③번 두 승인 링크 모두 현재 열람 가능 상태인지 자동 확인합니다.',
        oracleReference: '두 고객 별도 표시 · 두 승인 링크 모두 정상 열림',
      },
      {
        id: 'H2-S6',
        loopId: 'loop2',
        stepNumber: 6,
        subsystem: '고객 소통(승인·회수)',
        windowBadge: '창 A ↔ 창 B·C',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '1명만 링크 잠그기(창 B 차단 · 창 C 유지) → 건물 전체 링크 잠그기 비교 확인',
        workspaceHref: '/broker/w/inbox',
        workspaceLabel: '고객 소통함 열기',
        actionChecklist: [
          '1단계(1명만 잠그기): 소통함에서 "박서연 대표" 선택 → [보낸 링크 잠그기] 클릭 → 체크박스는 건드리지 말고 그대로 [잠그기] 클릭! → 창 B는 잠기고 창 C(한유진 소장)는 계속 열리는지 확인합니다.',
          '2단계(건물 전체 잠그기): "한유진 소장" 선택 → [보낸 링크 잠그기] 클릭 → 팝업 안의 [☑ 이 건물 전체 열람 잠금 (모든 수신자 차단)]을 체크한 뒤 [잠그기] 클릭! → 창 C까지 모두 잠기는지 확인합니다.',
        ],
        copySnippets: [
          {
            id: 'h2-corr-banner',
            label: '(선택) 조건 변경 안내 문구 복사',
            targetHint: '고객 소통함 → [⚠️ 수치 정정 안내 띄우기]',
            value: '5층 및 지하 1층 만기 경과 호실의 명도 완료 시점이 계약 후 3개월 내로 확정 반영되었습니다.',
          },
        ],
        humanFocus: '특정 고객 1명만 잠그는 것과 건물 전체를 잠그는 체크박스 구분이 명확한지 봅니다.',
        autoProbeFocus: '1단계(② 잠김 / ③ 열림)와 2단계(②·③ 모두 잠김) 상태를 자동 확인합니다.',
        oracleReference: '1명 잠금 시 다른 고객 링크 유지 · 전체 잠금 시 모든 링크 차단',
      },
      {
        id: 'H2-S7',
        loopId: 'loop2',
        stepNumber: 7,
        subsystem: '오라클·보안마감',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 1,
        severityOnFail: 'S1',
        title: '고객 등록·삭제 확인 · 로그아웃 후 브라우저 잔여 데이터 점검 · [Sign-off] 최종 제출',
        workspaceHref: '/broker/w/inbox',
        workspaceLabel: '고객 소통함 열기',
        actionChecklist: [
          '소통함 왼쪽의 [+ 고객 직접 등록]으로 테스트 고객 1명을 등록했다가 [고객 삭제]로 지워 봅니다.',
          '검은색 [🔍 입력한 링크·면적 자동 점검 실행]으로 잠원동 결과를 확인한 뒤, 크리딜에서 로그아웃하고 아래 [🧹 공용 PC 브라우저 잔여 키 점검]을 눌러 남은 민감 데이터가 0건인지 확인합니다.',
          '맨 위 초록색 [📋 Sign-off] 탭을 눌러 검수자 성함과 종합 의견을 적고 [☁️ 서버 최종 제출]을 누릅니다.',
        ],
        copySnippets: [],
        humanFocus: '전체 과정을 진행하면서 멈칫했거나 문구가 어색했던 지점을 종합 코멘트에 편하게 적어 주세요.',
        autoProbeFocus: '로그아웃 후 브라우저 저장소에 민감 임시 데이터가 0건인지 점검합니다.',
        oracleReference: '잔여 민감 키 0건 · 14개 단계 판정 및 서버 제출 완료',
      },
    ],
  },
];

export const FULL_LOOP_V2_ALL_STEPS: ReadonlyArray<FullLoopStepItem> = FULL_LOOP_V2_CASES.flatMap(
  (c) => c.steps,
);
