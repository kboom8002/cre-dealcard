/**
 * @file src/lib/testguide/broker-full-loop-data.ts
 * @description 현업 중개인 전용 2단계 페어 전 과정 클릭스루 검수 SSOT (/qa-broker/full-loop)
 *
 * 구성:
 *  - Stage 1 (Loop 1): 표준 골든 1선 — 서초구 서초동 1364-28 사옥형 오피스 230억 (실사진 10장 고밀도 키트)
 *    · 사용법 영점 조절(Calibration) + 9장 이상(10장) 사진 일괄 업로드·대표 지정·발표자료(PPT) 2면 배치 검증
 *  - Stage 2 (Loop 2): 내 매물 실전 완주 (BYOD: Bring Your Own Deal)
 *    · 평소 중개하시는 실제 매물 1건(현장 사진 9장 이상 권장)으로 완주하며 현업 용어·대장 괴리·발송 심리 수집
 *    · 커스텀 비공개 키워드 노출 0건 실시간 판정 + 테스트 직후 원클릭 매물·딜카드·IM 완전 삭제 지원
 */

import type { TestGuideImageAsset } from '@/lib/testguide/testguide-data';
import type {
  FullLoopCaseDefinition,
  FullLoopWindowRoleCard,
} from '@/lib/testguide/full-loop-2cases-data';

export const QA_BROKER_FULL_LOOP_WORKBENCH_ID = 'qa-broker-full-loop-v1' as const;

export const BROKER_CASE02_ASSET_CDN_MAP: Record<string, string> = {
  '01_외관_코너전면대표.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/broker-case02/01_exterior_corner_main.jpeg',
  '02_외관_정면파사드.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/broker-case02/02_exterior_front_facade.jpeg',
  '03_외관_측면자주식주차장.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/broker-case02/03_exterior_side_parking.jpeg',
  '04_외관_인접대로변오피스상권.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/broker-case02/04_exterior_avenue_context.jpeg',
  '05_내부_승강기홀_세로형.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/broker-case02/05_interior_elevator_portrait.jpg',
  '06_내부_6층대표실사옥홀.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/broker-case02/06_interior_6f_hq_hall.jpeg',
  '07_내부_5층개발본부오피스.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/broker-case02/07_interior_5f_office.jpeg',
  '08_내부_B1크리에이티브라운지.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/broker-case02/08_interior_b1_studio_lounge.jpeg',
  '09_내부_B1스튜디오쇼룸.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/broker-case02/09_interior_b1_studio_showroom.jpeg',
  '10_내부_옥상설비및서초조망.jpeg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/broker-case02/10_interior_rooftop_seocho_view.jpeg',
};

export const BROKER_CASE02_MEMO =
  '서울특별시 서초구 서초동 1364-28 FM빌딩 사옥용 오피스 매각 230억, 대지 180.3평 / 연면적 636.7평(B1~6F), 자주식 주차 20대 완비, 양재역 3호선·신분당선 도보 4분 코너 각지, 상층 4~6층(약 274평) 잔금 즉시 사옥 입주 가능하며 저층부 월세 3,200만 안정 수취, 전층 임대 전환 시 월 6,500만 기대 (최상무 010-3344-8899)';

export const BROKER_CASE02_ASIS_TSV = [
  '층\t호수\t업종\t임차인\t임대면적(㎡)\t전용면적(㎡)\t보증금(만원)\t월세(만원)\t관리비(만원)\t만기일\t상태',
  '6F\t601호\tIT솔루션본사\t매도법인(대표실)\t298.00\t238.40\t0\t0\t0\t-\t자가사용',
  '5F\t501호\tIT솔루션본사\t매도법인(개발본부)\t304.00\t243.20\t0\t0\t0\t-\t자가사용',
  '4F\t401호\t업무시설\t공실(즉시입주)\t304.00\t243.20\t0\t0\t0\t-\t공실',
  '3F\t301호\t세무회계법인\t서초세무회계\t304.00\t243.20\t10000\t780\t150\t2027-08-31\t임대중',
  '2F\t201호\t엔지니어링오피스\t한빛설계기술\t304.00\t243.20\t10000\t820\t150\t2027-11-30\t임대중',
  '1F\t101호\t중식레스토랑\t도화다이닝\t292.88\t234.30\t15000\t1150\t180\t2028-04-30\t임대중',
  'B1\tB101호\t크리에이티브스튜디오\t조이너스스튜디오\t298.00\t220.00\t5000\t450\t100\t2027-05-31\t임대중',
].join('\n');

export const BROKER_CASE02_STABILIZED_TSV = [
  '층\t호수\t업종\t임차인\t임대면적(㎡)\t전용면적(㎡)\t보증금(만원)\t월세(만원)\t관리비(만원)\t만기일\t상태',
  '6F\t601호\t기업부설연구소\t신규우량법인A\t298.00\t238.40\t12000\t920\t155\t2028-12-31\t임대중',
  '5F\t501호\t클라우드사업부\t신규우량법인A\t304.00\t243.20\t12000\t940\t160\t2028-12-31\t임대중',
  '4F\t401호\tIT업무시설\t신규우량법인B\t304.00\t243.20\t12000\t940\t160\t2028-12-31\t임대중',
  '3F\t301호\t세무회계법인\t서초세무회계\t304.00\t243.20\t11000\t880\t160\t2028-08-31\t임대중',
  '2F\t201호\t엔지니어링오피스\t한빛설계기술\t304.00\t243.20\t11000\t920\t160\t2028-11-30\t임대중',
  '1F\t101호\t중식레스토랑\t도화다이닝\t292.88\t234.30\t18000\t1350\t200\t2029-04-30\t임대중',
  'B1\tB101호\t크리에이티브스튜디오\t조이너스스튜디오\t298.00\t220.00\t6000\t550\t110\t2028-05-31\t임대중',
].join('\n');

export const BROKER_CASE02_WON_TRAP_TSV = [
  '층\t호수\t업종\t임차인\t임대면적(㎡)\t전용면적(㎡)\t보증금(만원)\t월세(만원)\t관리비(만원)\t만기일\t상태',
  '3F\t301호\t세무회계법인\t서초세무회계\t304.00\t243.20\t100,000,000\t7,800,000\t1,500,000\t2027-08-31\t임대중',
  '2F\t201호\t엔지니어링오피스\t한빛설계기술\t304.00\t243.20\t100,000,000\t8,200,000\t1,500,000\t2027-11-30\t임대중',
].join('\n');

export const BROKER_CASE02_ASIS_CSV = BROKER_CASE02_ASIS_TSV.split('\n')
  .map((line) =>
    line
      .split('\t')
      .map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
      .join(','),
  )
  .join('\n');

function buildBrokerCase02Images(
  items: Array<{ filename: string; format: 'JPG' | 'PNG' | 'WEBP'; roleLabel: string; caption: string }>,
): TestGuideImageAsset[] {
  return items.map((item) => {
    const encoded = encodeURIComponent(item.filename);
    const baseUrl = `/api/public/testguide-assets/images/broker-case02/${encoded}`;
    return {
      ...item,
      previewUrl: baseUrl,
      downloadUrl: `${baseUrl}?download=1`,
    };
  });
}

export const BROKER_CASE02_IMAGES_10: TestGuideImageAsset[] = buildBrokerCase02Images([
  {
    filename: '01_외관_코너전면대표.jpeg',
    format: 'JPG',
    roleLabel: '외부 1 · 코너대표 (3.1MB)',
    caption: '양면 도로 코너 곡면 커튼월 외관 전경',
  },
  {
    filename: '02_외관_정면파사드.jpeg',
    format: 'JPG',
    roleLabel: '외부 2 · 정면파사드 (2.8MB)',
    caption: '건물 정면 파사드 및 1층 근생 전면',
  },
  {
    filename: '03_외관_측면자주식주차장.jpeg',
    format: 'JPG',
    roleLabel: '외부 3 · 자주식주차 (2.8MB)',
    caption: '자주식 주차 구역 및 측면 외관',
  },
  {
    filename: '04_외관_인접대로변오피스상권.jpeg',
    format: 'JPG',
    roleLabel: '외부 4 · 인접상권 (2.6MB)',
    caption: '양재역권 인접 오피스·메디컬 대로변 여건',
  },
  {
    filename: '05_내부_승강기홀_세로형.jpg',
    format: 'JPG',
    roleLabel: '내부 1 · 승강기홀 세로 (0.2MB)',
    caption: '승강기 홀 및 대리석 공용부 (스마트폰 세로형)',
  },
  {
    filename: '06_내부_6층대표실사옥홀.jpeg',
    format: 'JPG',
    roleLabel: '내부 2 · 6층 사옥홀 (2.0MB)',
    caption: '상층부 사옥 전용 홀 및 회의실 구획',
  },
  {
    filename: '07_내부_5층개발본부오피스.jpeg',
    format: 'JPG',
    roleLabel: '내부 3 · 5층 업무공간 (2.1MB)',
    caption: '기준층 업무시설 내부 집기 및 채광 현황',
  },
  {
    filename: '08_내부_B1크리에이티브라운지.jpeg',
    format: 'JPG',
    roleLabel: '내부 4 · 지하1층 라운지 (2.3MB)',
    caption: '지하 1층 크리에이티브 스튜디오·라운지 홀',
  },
  {
    filename: '09_내부_B1스튜디오쇼룸.jpeg',
    format: 'JPG',
    roleLabel: '내부 5 · 지하1층 쇼룸 (2.5MB)',
    caption: '지하 1층 스튜디오 바 및 쇼룸 구역',
  },
  {
    filename: '10_내부_옥상설비및서초조망.jpeg',
    format: 'JPG',
    roleLabel: '내부 6 · 옥상·조망 (1.8MB)',
    caption: '옥상 우레탄 방수·실외기 설비 및 서초권 스카이라인',
  },
]);

export const BROKER_FULL_LOOP_WINDOW_ROLES: ReadonlyArray<FullLoopWindowRoleCard> = [
  {
    id: 'windowA',
    badge: '창 A · 필수',
    title: '중개사 작업 화면 (대표님 PC)',
    device: 'PC 일반 브라우저 (본인 중개사 계정 로그인)',
    purpose: '딜카드 · IM · 부동산뉴스 작성, 자료 보내기, 테스트 후 내 매물 원클릭 삭제',
  },
  {
    id: 'windowB',
    badge: '창 B · 권장',
    title: '매수 고객 1 체험 화면',
    device: '대표님 스마트폰 카카오톡 나에게 보내기 (또는 새 시크릿 창)',
    purpose: '실제 손님이 카톡에서 받아보는 썸네일·블라인드 수위·모바일 IM 가독성 직접 체감',
  },
  {
    id: 'windowC',
    badge: '창 C · 선택/비교용',
    title: '매수 고객 2 대조 화면',
    device: 'PC 크롬 시크릿 창 (Ctrl+Shift+N, 비로그인)',
    purpose: '손님 1의 링크만 닫았을 때 손님 2의 링크는 그대로 열리는지 확인',
  },
];

export const BROKER_FULL_LOOP_CASES: ReadonlyArray<FullLoopCaseDefinition> = [
  {
    id: 'loop1',
    probeLoopId: 'broker-loop1',
    code: 'LOOP-01',
    tabLabel: 'Stage 1 · 서초 사옥 10장 골든',
    shortLabel: 'Stage 1 · 서초동 230억 법인사옥 (실사진 10장 · 자가사용 복합 · 사용법 익히기)',
    title: 'Stage 1 — 표준 골든 매물(실사진 10장)로 전 과정 손에 익히기 & 다중 사진 품격 점검',
    subtitle:
      '양재역 더블역세권 서초동 사옥형 빌딩(230억 · 자가사용 2개층+공실 1개층+임대 4개층 · 실사진 10장)으로 딜카드부터 IM·발표자료(PPT)·부동산뉴스·고객 소통까지 먼저 한 바퀴 완주합니다.',
    targetMinutes: 17,
    personaFocus: '법인 사옥 이전 수요 대표 × 전속 매각 대표공인중개사',
    deviceSetup: '창 A(PC 중개사) + 창 B(본인 스마트폰 카톡 또는 시크릿 창)',
    sampleKitZipUrl: '/api/public/qa-sample-kit?scenario=broker-loop1',
    csvDownloadUrl: '/api/public/qa-sample-kit?scenario=broker-loop1&format=csv',
    primarySheetLabel: '📊 현행 임대 현황 CSV',
    secondarySheetDownloadUrl: '/api/public/qa-sample-kit?scenario=broker-loop1&format=tsv-stabilized',
    secondarySheetLabel: '📊 전층 임대 전환 시트(TSV)',
    dealCode: 'BROKER-GOLDEN-CASE02',
    propertyName: '서초동 1364-28 코너 사옥빌딩 (실사진 10장)',
    jibunAddress: '서울특별시 서초구 서초동 1364-28',
    roadAddress: '서울특별시 서초구 강남대로37길 56-18',
    askingPriceReadout: '230억 원 (2,300,000만 원)',
    domainTraps: [
      {
        code: 'TRAP-BR-1A',
        title: '현장 사진 10장(외부 4 · 내부 6) 큐레이션 & PPT 2면 배치',
        detail:
          '9장 이상(10장, 세로형 승강기 포함) 일괄 업로드 시 슬라이드 배정 안내와 [★ 1번 대표로] 버튼이 편한지, PPT 2면 갤러리 밀도가 깔끔한지 확인합니다.',
      },
      {
        code: 'TRAP-BR-1B',
        title: '매도법인 자가사용(5~6F) + 공실(4F) 사옥 입주 면적 표현',
        detail:
          '자가사용 2개층이 공실로 오인되지 않고(임대가능 5개층 중 공실 1건 20%), 상층 3개층 즉시 사옥 입주 강점이 잘 드러나는지 봅니다.',
      },
      {
        code: 'TRAP-BR-1C',
        title: '원 단위 오입력(100,000,000) 자동 보정 & 건물명 블라인드',
        detail:
          '원 단위로 잘못 복사한 숫자가 만원 단위(10,000만)로 안전 보정되는지, 공개 티저에 FM빌딩·1364-28·최상무가 숨겨지는지 확인합니다.',
      },
    ],
    images: BROKER_CASE02_IMAGES_10,
    groundTruth: {
      expectedLandAreaSqm: 596,
      expectedLandAreaPyeong: 180.29,
      expectedGfaSqm: 2104.88,
      expectedGfaPyeong: 636.73,
      areaToleranceSqm: 10,
      forbiddenPublicTokens: [
        '1364-28',
        '강남대로37길 56-18',
        'FM빌딩',
        '010-3344-8899',
        '최상무',
      ],
      expectedDepositSummary: '현행 보 40,000만 / 월 3,200만 → 전층 임대 전환 시 보 82,000만 / 월 6,500만',
      expectedMonthlyRentSummary: '현행 월 3,200만 (+관리비 580만) → 전환 시 월 6,500만 (+관리비 1,105만)',
      expectedOccupancySummary: '자가사용 2개층(분모 제외) · 임대가능 5개층 중 4F 공실 1건 (공실률 20.0%)',
      expectedYieldSummary: '현행 연 순수익률 1.70% → 전층 임대 전환 시 3.52% (+1.82%p)',
    },
    steps: [
      {
        id: 'B1-S1',
        loopId: 'loop1',
        stepNumber: 1,
        subsystem: '프로필·법정표기',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 1,
        severityOnFail: 'S1',
        title: '중개사무소 법정 표기(상호·대표자·등록번호·연락처) 확인',
        workspaceHref: '/broker/settings/profile',
        workspaceLabel: '중개사 프로필 설정 열기',
        actionChecklist: [
          '중개사무소 상호, 대표 공인중개사 성명, 개설등록번호, 소재지, 연락처가 입력되어 있는지 확인합니다.',
          '저장 후 딜카드·IM·부동산뉴스 하단에 중개사 명함이 일관되게 붙을 준비가 되었는지 봅니다.',
        ],
        copySnippets: [],
        humanFocus: '실제 손님에게 나가는 제안서 하단 명함 표기가 공인중개사법 표시의무 및 현업 관행에 비추어 안심되는지 확인합니다.',
        autoProbeFocus: '발행된 공개 딜카드·뉴스레터에 중개사 식별 정보가 정상 반영되는지 확인합니다.',
        oracleReference: '상호 · 대표자 성명 · 등록번호 · 연락처 누락 없음',
      },
      {
        id: 'B1-S2',
        loopId: 'loop1',
        stepNumber: 2,
        subsystem: '딜카드',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S0',
        title: '서초동 230억 사옥 메모 붙여넣기 → [사옥용] 선택 → 블라인드 링크 복사',
        workspaceHref: '/broker/w/dealcards',
        workspaceLabel: '딜카드 작업실 열기',
        actionChecklist: [
          '아래 [사옥 현장 메모 복사]를 눌러 메모 입력창에 붙여넣고 [메모로 딜카드 생성하기]를 클릭합니다.',
          '매물 유형을 [사옥용]으로 선택했을 때 연면적(약 637평)·주차 20대·즉시 입주 포인트가 돋보이는지 확인합니다.',
          '우측 카톡 말풍선에 "서초구 서초동"만 표시되고 "1364-28", "FM빌딩", "010-3344-8899", "최상무"가 숨겨졌는지 확인한 뒤 공개 링크를 오른쪽 판정 보드 ①번 칸에 붙여넣습니다.',
        ],
        copySnippets: [
          {
            id: 'b1-dc-memo',
            label: '사옥 현장 메모 복사 (지번·건물명·연락처 포함)',
            targetHint: '/broker/w/dealcards → 메모 입력창',
            value: BROKER_CASE02_MEMO,
          },
          {
            id: 'b1-dc-headline',
            label: '추천 한 줄 제목 복사 (16자)',
            targetHint: '한 줄 제목 (18자 이내) 다듬기 시 활용',
            value: '양재역 코너 사옥·주차 20대',
            isPublicFacing: true,
          },
        ],
        humanFocus: '사옥을 찾는 법인 대표에게 카톡으로 첫 티저를 보낼 때 정보 노출 수위(블라인드)와 핵심 제원 배치가 적당한지 평가합니다.',
        autoProbeFocus: '공개 딜카드 HTML 내 금지어(1364-28, FM빌딩, 010-3344-8899, 최상무) 0건 여부를 자동 검사합니다.',
        oracleReference: '서초구 서초동 · 업무시설 · 연면적 약 637평 · 230억 (상세 번지·건물명 비노출)',
      },
      {
        id: 'B1-S3',
        loopId: 'loop1',
        stepNumber: 3,
        subsystem: 'IM·발표자료',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 6,
        severityOnFail: 'S0',
        title: '임대 현황(자가사용+공실+원단위 보정) & 실사진 10장 일괄 업로드 → PPT 2면 갤러리 검증',
        workspaceHref: '/broker/w/im',
        workspaceLabel: 'IM 작업실 열기',
        actionChecklist: [
          '① 기본 제원: 주소에 "서울특별시 서초구 서초동 1364-28", 매매 희망가에 "2300000"(= 230억 원)을 입력하고 대지 596㎡ / 연면적 2,104.88㎡ / 주차 20대를 확인합니다.',
          '② 층별 임대 현황: (선택 체험) [원단위 오입력 부록 복사]를 먼저 붙여넣어 100,000,000원이 10,000만 원으로 자동 보정되는지 본 뒤, [현행 임대 현황 TSV 복사]를 덮어써 보 40,000만 / 월 3,200만을 확인합니다. 이어서 [+ 기대수익률 렌트롤] 탭에 [전층 임대 전환 TSV 복사]를 붙여넣어 보 82,000만 / 월 6,500만을 확인합니다.',
          '③ 핵심 장점: 아래 사옥 맞춤 포인트 3줄을 넣거나 [AI로 쓰기] 초안과 비교합니다.',
          '④ 사진·발행: 상단에서 내려받은 골든 ZIP 속 실사진 10장(외부 4장 + 내부 6장, 세로형 포함)을 올리고, 상단 배지("발표자료 사진 2면(10장) 자동 배치")와 카드 편집의 [★ 1번 대표로] 버튼을 직접 써 본 뒤 IM 생성·PPT 내려받기 후 공유 링크를 판정 보드 ②번 칸에 붙여넣습니다.',
        ],
        copySnippets: [
          {
            id: 'b1-im-addr',
            label: '지번 주소 복사',
            targetHint: 'IM ① 기본 제원 → 주소 검색창',
            value: '서울특별시 서초구 서초동 1364-28',
          },
          {
            id: 'b1-im-price',
            label: '매매가(만원) 복사',
            targetHint: 'IM ① 기본 제원 → 매매 희망가(만원)',
            value: '2300000',
          },
          {
            id: 'b1-im-won-trap',
            label: '(체험용) 원 단위 오입력 부록 TSV 복사',
            targetHint: 'IM ② 현행 임대 현황 첫 칸 클릭 후 Ctrl+V (자동 보정 배너 확인용)',
            value: BROKER_CASE02_WON_TRAP_TSV,
          },
          {
            id: 'b1-im-asis-tsv',
            label: '현행 임대 현황 TSV 복사 (자가사용 2층 포함)',
            targetHint: 'IM ② 현행 임대 현황 첫 칸 클릭 후 Ctrl+V',
            value: BROKER_CASE02_ASIS_TSV,
          },
          {
            id: 'b1-im-stab-tsv',
            label: '전층 임대 전환(기대수익률) TSV 복사',
            targetHint: 'IM ② [+ 기대수익률 렌트롤] 탭 첫 칸 클릭 후 Ctrl+V',
            value: BROKER_CASE02_STABILIZED_TSV,
          },
          {
            id: 'b1-im-pt1',
            label: '사옥 포인트 1 복사 (더블역세권 코너 가시성)',
            targetHint: 'IM ③ 장점 1',
            value: '양재역(3호선·신분당선·GTX-C 예정) 도보 4분 양면 도로 코너 각지로 곡면 커튼월 외관의 기업 사옥 가시성 탁월',
            isPublicFacing: true,
          },
          {
            id: 'b1-im-pt2',
            label: '사옥 포인트 2 복사 (주차 20대 & 즉시 입주)',
            targetHint: 'IM ③ 장점 2',
            value: '서초권에서 희소한 자주식 포함 총 20대 주차 설비 확보 및 상층부 3개 층(4F~6F, 약 274평) 잔금 즉시 사옥 입주 가능',
            isPublicFacing: true,
          },
          {
            id: 'b1-im-pt3',
            label: '사옥 포인트 3 복사 (저층 임대수익 금융비용 상쇄)',
            targetHint: 'IM ③ 장점 3',
            value: '저층부(B1~3F) 우량 임차인 월 3,200만 원 임대수익으로 사옥 이자비용을 상쇄하며 전층 임대 전환 시 연 순수익률 3.52% 기대',
            isPublicFacing: true,
          },
        ],
        humanFocus: '사진 10장을 올렸을 때 외부 4컷·내부 6컷 2면 PPT 배치와 세로형 승강기 사진 크롭 상태가 실제 법인 브리핑에 바로 쓸 수준인지 집중 확인합니다.',
        autoProbeFocus: 'IM 공유 링크 열람 가능 상태, 대지 596㎡ / 연면적 2,104.88㎡ 일치 여부를 자동 검증합니다.',
        oracleReference: '현행 순수익률 1.70% → 전환 3.52% · 사진 10장 PPT 갤러리 2면 누락 0장',
      },
      {
        id: 'B1-S4',
        loopId: 'loop1',
        stepNumber: 4,
        subsystem: '뉴스레터',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S1',
        title: '강남·서초 사옥 수요 법인 대상 부동산뉴스 발행 및 공개 주소 확인',
        workspaceHref: '/broker/magazine-editor',
        workspaceLabel: '뉴스레터 에디터 열기',
        actionChecklist: [
          '이달의 시장 요약에 아래 브리핑 문구를 넣고 방금 만든 서초동 사옥 딜카드를 추천 매물로 연결해 발행합니다.',
          '발행된 공개 뉴스레터 주소를 오른쪽 판정 보드 ④번 칸에 붙여넣고, 모바일 화면에서도 상세 번지 노출 없이 깔끔하게 읽히는지 확인합니다.',
        ],
        copySnippets: [
          {
            id: 'b1-nl-title',
            label: '뉴스레터 제목 복사',
            targetHint: '/broker/magazine-editor → 제목',
            value: '양재·서초권 중소형 사옥 매수세 유입과 자주식 주차 빌딩 희소성 점검',
            isPublicFacing: true,
          },
          {
            id: 'b1-nl-summary',
            label: '시장 브리핑 본문 복사',
            targetHint: '/broker/magazine-editor → 시장 요약',
            value: '임차료 상승과 주차난으로 인해 강남·서초권에서 상층부는 직접 사옥으로 쓰고 저층부 임대료로 금융비용을 충당하는 실사용 매수 문의가 꾸준히 이어지고 있습니다.',
            isPublicFacing: true,
          },
        ],
        humanFocus: '단골 매수 법인 대표들에게 월간 안부 겸 시장 브리핑으로 보내기에 문체와 구성이 자연스러운지 평가합니다.',
        autoProbeFocus: '공개 뉴스레터 200 응답 및 비공개 번지·건물명 노출 0건을 검증합니다.',
        oracleReference: '중개사 명함 정상 노출 · 비공개 번지(1364-28)·건물명(FM빌딩) 노출 0건',
      },
      {
        id: 'B1-S5',
        loopId: 'loop1',
        stepNumber: 5,
        subsystem: '매수자 열람·문의',
        windowBadge: '창 B (스마트폰 카톡 매수자 1)',
        targetMinutes: 2,
        severityOnFail: 'S0',
        title: '스마트폰(또는 시크릿창)에서 매수 고객 시점으로 열람 후 상세 IM 자료 요청',
        actionChecklist: [
          '창 B(스마트폰 카카오톡 나에게 보내기 또는 시크릿 창)에서 ①번 딜카드 공개 링크를 열어 카톡 썸네일과 첫 화면 인상을 확인합니다.',
          '[상세 제안서(IM) 요청] 버튼을 눌러 아래 예시 고객 정보로 문의를 남깁니다.',
        ],
        copySnippets: [
          {
            id: 'b1-buyer-name',
            label: '[창 B] 매수 문의자 성함 복사',
            targetHint: '창 B 자료 요청 창 → 성함',
            value: '정현우 대표 (넥스트클라우드)',
          },
          {
            id: 'b1-buyer-phone',
            label: '[창 B] 매수 문의자 연락처 복사',
            targetHint: '창 B 자료 요청 창 → 연락처',
            value: '010-5581-2390',
          },
          {
            id: 'b1-buyer-msg',
            label: '[창 B] 문의 내용 복사',
            targetHint: '창 B 자료 요청 창 → 문의 내용',
            value: '임직원 45명 규모 IT 법인 사옥 이전 검토 중입니다. 4~6층 즉시 입주 가능 면적과 주차 대수 상세 IM 요청드립니다.',
          },
        ],
        humanFocus: '손님 입장에서 전화번호를 남기고 상세 IM을 요청하는 과정이 부담스럽거나 복잡하지 않은지 체감합니다.',
        autoProbeFocus: '공개 딜카드 게이트 정상 응답 및 비로그인 상태 상세 정보 보호를 확인합니다.',
        oracleReference: '문의 접수 즉시 완료 · 비승인 상태에서 상세 지번 비노출',
      },
      {
        id: 'B1-S6',
        loopId: 'loop1',
        stepNumber: 6,
        subsystem: '고객 소통(승인·회수)',
        windowBadge: '창 A ↔ 창 B·C',
        targetMinutes: 2,
        severityOnFail: 'S0',
        title: '고객 소통함에서 [자료 보내기] 승인 → 열람 확인 → [링크 닫기] 차단 체험',
        workspaceHref: '/broker/w/inbox',
        workspaceLabel: '고객 소통함 열기',
        actionChecklist: [
          '창 A 고객 소통함에서 방금 도착한 "정현우 대표" 문의를 선택해 [자료 보내기]로 승인하고 인사말+IM 링크를 복사해 창 B에서 열어 봅니다 (사진 10장 갤러리 확인).',
          '다시 창 A 소통함에서 [보낸 링크 잠그기]를 실행한 뒤, 창 B에서 새로고침했을 때 즉시 열람이 닫히는지 확인합니다 (확인 후 원하시면 다시 열거나 판정 보드에서 점검).',
        ],
        copySnippets: [],
        humanFocus: '매물 정보가 외부에 무한정 돌아다니지 않도록 원하는 시점에 링크를 닫을 수 있는 기능이 현업에 얼마나 유용한지 평가합니다.',
        autoProbeFocus: '링크 잠금/열림 상태 전환이 즉시 반영되는지 자동 점검합니다.',
        oracleReference: '승인 시 모바일 IM 10장 전체 열람 · 링크 닫기 즉시 열람 차단',
      },
      {
        id: 'B1-S7',
        loopId: 'loop1',
        stepNumber: 7,
        subsystem: '오라클·보안마감',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 1,
        severityOnFail: 'S0',
        title: '우측 [실시간 정답 오라클 & 블라인드 판정 실행] 클릭 후 Stage 2(내 매물)로 이동',
        actionChecklist: [
          '오른쪽 보드에 붙여넣은 딜카드·IM·뉴스레터 링크를 기준으로 [🔍 실시간 정답 오라클 & 블라인드 판정 실행]을 눌러 면적·블라인드 이상 없음을 확인합니다.',
          '손에 익은 흐름 그대로 상단 [Stage 2 · 내 매물 실전 (BYOD)] 탭을 눌러 대표님의 실제 매물 1건으로 넘어가 주세요.',
        ],
        copySnippets: [],
        humanFocus: 'Stage 1을 거치며 4대 작업공간 동선이 자연스럽게 이해되었는지 점검합니다.',
        autoProbeFocus: '대지 596㎡ · 연면적 2,104.88㎡ · 금지어 0건 종합 자동 판정',
        oracleReference: '오라클·블라인드 전 항목 정상',
      },
    ],
  },
  {
    id: 'loop2',
    probeLoopId: 'broker-byod',
    isByodMode: true,
    enableByodCleanup: true,
    byodSafetyNotice:
      '안심하고 실제 매물로 테스트하세요: ① 고객 연락처는 실제 손님 대신 대표님 본인 휴대폰/시크릿 창으로만 테스트하며, ② 검수 직후 우측 [🧹 내 테스트 매물·딜카드·IM 즉시 삭제] 버튼 하나로 서버에서 즉시 폐기할 수 있습니다.',
    code: 'LOOP-02',
    tabLabel: 'Stage 2 · 내 매물 실전 (BYOD)',
    shortLabel: 'Stage 2 · 대표님 보유 실매물 1건 자율 완주 (사진 9장+ 권장 · 현업 피드백 집중 수집)',
    title: 'Stage 2 — 대표님이 실제 중개 중이신 매물 1건으로 전 과정 실전 테스트 (BYOD)',
    subtitle:
      '평소 가지고 계신 실제 매물 메모·임대 현황·현장 사진(9장 이상 권장)을 그대로 넣어 보며, 정제된 샘플에서는 절대 알 수 없는 현장 용어·공부 괴리·간판 노출 부담·실제 발송 망설임 요인을 들려주세요.',
    targetMinutes: 20,
    personaFocus: '대표님의 실제 진행 매물 × 실제 타깃 매수 고객 페르소나',
    deviceSetup: '창 A(PC 중개사) + 창 B(대표님 본인 스마트폰 카톡 — 실제 고객 오발송 주의!)',
    sampleKitZipUrl: '',
    csvDownloadUrl: '',
    dealCode: 'BROKER-BYOD-LIVE',
    propertyName: '대표님 보유 실매물 1건 (임대수익·사옥·신축개발 자유 선택)',
    jibunAddress: '진행 중이신 실제 매물 지번 주소',
    roadAddress: '대장 자동 매칭 도로명 주소',
    askingPriceReadout: '실제 매각 희망가 (억/만원)',
    domainTraps: [
      {
        code: 'BYOD-FOCUS-1',
        title: '날것의 현장 메모·엑셀 용어 & 공부↔현장 괴리',
        detail:
          '렌트프리·조절가·부가세·위반건축물·실사용 업종 차이 등 현업 매물만의 특이사항이 막힘없이 입력·표현되는지 봅니다.',
      },
      {
        code: 'BYOD-FOCUS-2',
        title: '직접 찍은 현장 사진(9장+) 선별 & 간판 노출 부담',
        detail:
          '스마트폰으로 찍어 두신 외관·내부·설비 사진 9장 이상을 올릴 때 간판 노출 걱정이나 순서·비율 아쉬움이 없는지 확인합니다.',
      },
      {
        code: 'BYOD-FOCUS-3',
        title: '진짜 VIP 손님 카톡방에 바로 보낼 수 있는가?',
        detail:
          '완성된 딜카드·모바일 IM·발표자료(PPT)를 실제 매수 손님에게 지금 당장 보낼 수 있는지, 망설여진다면 무엇 때문인지 기록합니다.',
      },
    ],
    images: [],
    groundTruth: {
      expectedLandAreaSqm: 0,
      expectedLandAreaPyeong: 0,
      expectedGfaSqm: 0,
      expectedGfaPyeong: 0,
      areaToleranceSqm: 0,
      forbiddenPublicTokens: [],
      expectedDepositSummary: '내 매물 실제 보증금 합계와 화면 합계 일치 여부 확인',
      expectedMonthlyRentSummary: '내 매물 실제 월세·관리비 합계와 수익률 일치 여부 확인',
      expectedOccupancySummary: '공실·자가사용·비임대 호실이 내 의도대로 분류되는지 확인',
      expectedYieldSummary: '우측 보드에 비공개 키워드(번지·건물명·소유주 번호) 입력 시 노출 0건 자동 검증',
    },
    steps: [
      {
        id: 'B2-S1',
        loopId: 'loop2',
        stepNumber: 1,
        subsystem: '딜카드',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 3,
        severityOnFail: 'S1',
        title: '평소 쓰시는 내 매물 메모 그대로 붙여넣어 딜카드 만들기 & 블라인드 점검',
        workspaceHref: '/broker/w/dealcards',
        workspaceLabel: '딜카드 작업실 열기',
        actionChecklist: [
          '수첩·카톡 나에게 보내기·엑셀 등에 적어 두신 실제 매물 메모 1건을 있는 그대로 붙여넣고 딜카드를 생성합니다.',
          '매물 유형(임대수익용 / 사옥용 / 신축·개발용)을 고른 뒤, 우측 카톡 말풍선에 상세 번지·건물명·건물주 연락처가 새어 나오지 않았는지 확인합니다.',
          '발행된 공개 딜카드 링크를 오른쪽 판정 보드 ①번 칸에, 절대 노출되면 안 되는 단어(예: 번지, 건물명, 소유주 번호)를 [🔒 내 매물 비공개 확인 키워드] 칸에 적어 주세요.',
        ],
        copySnippets: [],
        humanFocus: '다듬지 않은 현업 메모를 넣었을 때 금액·면적·용도 추출 정확도와 블라인드 처리가 믿음직한지 봐주세요.',
        autoProbeFocus: '우측에 적어 주신 내 매물 비공개 키워드(번지·건물명·전화번호)가 공개 딜카드에 0건인지 실시간 검사합니다.',
        oracleReference: '내 매물 비공개 키워드 공개 화면 노출 0건',
        brokerInsightPrompt:
          'Q1. 평소 쓰시는 매물 메모를 그대로 넣었을 때, 인식이 안 되거나 입력 칸이 없어 아쉬웠던 현업 용어가 있었나요?',
        brokerQuickTags: [
          '평소 메모 그대로 잘 인식됨',
          '매매가·보증금 조절가 표현 필요',
          '렌트프리·인테리어 기간 표기 희망',
          '부가세·관리비 별도 표기 아쉬움',
          '공동중개·수수료 비공개 메모칸 희망',
        ],
      },
      {
        id: 'B2-S2',
        loopId: 'loop2',
        stepNumber: 2,
        subsystem: 'IM·발표자료',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 5,
        severityOnFail: 'S1',
        title: '내 매물 주소 조회(공부 연동) & 실제 임대 현황(엑셀/표) 입력해 수치 대조하기',
        workspaceHref: '/broker/w/im',
        workspaceLabel: 'IM 작업실 열기',
        actionChecklist: [
          '① 기본 제원에서 실제 매물 지번을 조회해 대장 면적·층수·주차·공시지가가 실제 알고 계신 값과 맞는지 비교합니다.',
          '② 층별 임대 현황에 가지고 계신 엑셀 파일을 올리거나 표로 입력해 보증금·월세·관리비 합계와 연 순수익률이 대표님 계산과 일치하는지 확인합니다.',
        ],
        copySnippets: [],
        humanFocus: '건축물대장 공부상 내용과 실제 현장 현황(용도변경, 무허가/옥탑, 분할임대, 묵시적 갱신 등)이 다를 때 어떻게 입력·표기되는지가 핵심입니다.',
        autoProbeFocus: 'IM 문서 정상 생성 및 공유 링크 응답 무결성을 점검합니다.',
        oracleReference: '보증금·월세·연 순수익률 현업 계산치와 일치',
        brokerInsightPrompt:
          'Q2. 대장 자동 조회 수치와 실제 현장 상태(업종 차이·증축·임대 조건 등)가 다를 때 고치거나 표현하기 편했나요?',
        brokerQuickTags: [
          '대장 연동과 수동 보정이 자연스러움',
          '공부상 용도와 실제 영업 업종 차이 표기 필요',
          '내 엑셀 렌트롤 양식과 열 구성이 달라 손봄',
          '위반건축물·특약사항 기재란 희망',
          '전세·자가사용·공실 구분이 명확함',
        ],
      },
      {
        id: 'B2-S3',
        loopId: 'loop2',
        stepNumber: 3,
        subsystem: 'IM·발표자료',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 5,
        severityOnFail: 'S1',
        title: '직접 촬영한 내 매물 사진(9장 이상 권장) 업로드 · 대표 지정 · PPT 내려받기',
        workspaceHref: '/broker/w/im',
        workspaceLabel: 'IM 사진·발행 단계 열기',
        actionChecklist: [
          '휴대폰이나 PC에 보관 중인 해당 매물 현장 사진(가능하면 9장 이상, 외관·로비·내부·주차·옥상 등)을 일괄 업로드합니다.',
          '[★ 1번 대표로] 버튼과 외부↔내부 전환, 빠른 캡션 선택을 써 보고 IM 생성 후 발표자료(PPT)를 내려받아 열어 봅니다.',
          '발급된 IM 공유 링크를 오른쪽 판정 보드 ②번 칸에 붙여넣습니다.',
        ],
        copySnippets: [],
        humanFocus: '실제 현장 사진에는 상호 간판, 차량 번호판, 세로 촬영본, 어두운 복도 사진 등이 섞여 있습니다. 이를 선별해 PPT로 뽑을 때의 체감을 알려주세요.',
        autoProbeFocus: '모바일 IM 공유 링크 정상 열람 및 사진 로드 상태를 확인합니다.',
        oracleReference: '다중 사진 업로드 지연 없음 · PPT 사진 슬라이드 깨짐 없음',
        brokerInsightPrompt:
          'Q3. 직접 찍은 현장 사진(9장+)을 올리고 PPT로 뽑았을 때, 간판 노출 부담이나 사진 배치·크롭에서 아쉬운 점이 있었나요?',
        brokerQuickTags: [
          '9장 이상 자동 2면 배치가 깔끔함',
          '외관 간판·번호판 간편 가리기(모자이크) 희망',
          '세로 사진 잘림 위치 미세조정 희망',
          '1번 대표사진 지정·순서 변경이 편함',
          '일부 사진만 PPT에서 빼고 웹에만 두기 희망',
        ],
      },
      {
        id: 'B2-S4',
        loopId: 'loop2',
        stepNumber: 4,
        subsystem: '매수자 열람·문의',
        windowBadge: '창 B (스마트폰 카톡 매수자 1)',
        targetMinutes: 3,
        severityOnFail: 'S1',
        title: '내 스마트폰 카톡(나에게 보내기)으로 내 매물 딜카드·모바일 IM 직접 열어 보기',
        actionChecklist: [
          '⚠️ 주의: 실제 고객에게 보내지 마시고, 카카오톡 [나와의 채팅]에 내 매물 딜카드 링크와 IM 공유 링크를 붙여넣어 스마트폰으로 열어 봅니다.',
          '진짜 VIP 매수 손님이 이 화면과 내려받은 PPT를 받았을 때의 첫인상과 신뢰감을 냉정하게 점검합니다.',
        ],
        copySnippets: [],
        humanFocus: '가장 중요한 질문입니다: "오늘 당장 실제 매수 손님 카톡방에 이 링크와 PPT를 보낼 수 있는가? 멈칫한다면 딱 무엇 때문인가?"',
        autoProbeFocus: '모바일 화면 응답 및 공유 링크 잠금 보호 동작을 검증합니다.',
        oracleReference: '모바일 카톡 미리보기·본문 가독성 우수',
        brokerInsightPrompt:
          'Q4. 이 결과물을 실제 매수 고객에게 지금 바로 카톡·이메일로 보낸다면, 가장 만족스러운 점 또는 망설여지는 단 1가지는 무엇인가요?',
        brokerQuickTags: [
          '지금 당장 실제 고객에게 발송 가능',
          '수익률·기대치 문구 톤을 더 보수적으로 조정 희망',
          '표지·요약표 디자인이 손님 응대에 품격 있음',
          '지적도·입지 지도에 내 코멘트 한 줄 추가 희망',
          '매도인 비밀유지 안내 문구 강조 희망',
        ],
      },
      {
        id: 'B2-S5',
        loopId: 'loop2',
        stepNumber: 5,
        subsystem: '뉴스레터',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 2,
        severityOnFail: 'S2',
        title: '내 매물을 엮어 단골 고객용 부동산뉴스 발행해 보기',
        workspaceHref: '/broker/magazine-editor',
        workspaceLabel: '뉴스레터 에디터 열기',
        actionChecklist: [
          '내 매물이 속한 권역 동향을 2~3줄 적거나 AI 다듬기를 거친 뒤, 내 매물 딜카드를 연결해 뉴스레터를 발행합니다.',
          '공개 뉴스레터 주소를 오른쪽 판정 보드 ④번 칸에 붙여넣습니다.',
        ],
        copySnippets: [],
        humanFocus: '연락이 뜸했던 기존 매수 대기 고객들에게 안부 겸 매물 소식을 자연스럽게 전하는 용도로 쓸 만한지 평가합니다.',
        autoProbeFocus: '공개 뉴스레터 내 비공개 키워드(번지·건물명·연락처) 유출 0건을 자동 검사합니다.',
        oracleReference: '공개 뉴스레터 내 비공개 키워드 노출 0건',
        brokerInsightPrompt:
          'Q5. 단골 자산가·법인 고객에게 정기 발송하는 부동산뉴스로 활용하실 때 보완하고 싶은 점이 있나요?',
        brokerQuickTags: [
          '안부 겸 매물 소개용으로 매우 유용함',
          '인사말 말투를 내 스타일대로 고정 저장 희망',
          '실거래 사례·금리 요약이 설득력 있음',
          '카톡 단체방·개별톡 발송 안내가 직관적임',
        ],
      },
      {
        id: 'B2-S6',
        loopId: 'loop2',
        stepNumber: 6,
        subsystem: '고객 소통(승인·회수)',
        windowBadge: '창 A ↔ 창 B',
        targetMinutes: 1,
        severityOnFail: 'S1',
        title: '본인 테스트 문의 등록 → 소통함에서 승인 및 [링크 닫기] 점검',
        workspaceHref: '/broker/w/inbox',
        workspaceLabel: '고객 소통함 열기',
        actionChecklist: [
          '창 B에서 본인 이름(예: 테스트매수자)으로 자료 요청을 남긴 뒤, 창 A 소통함에서 [자료 보내기]와 [보낸 링크 잠그기]를 한 번씩 실행해 봅니다.',
        ],
        copySnippets: [],
        humanFocus: '전속·비공개 매물이 시중에 도는 것을 막아 주는 승인제 열람·링크 잠금 흐름이 현업 중개 사고 예방에 도움이 되는지 봅니다.',
        autoProbeFocus: '링크 잠금 시 외부 열람 즉시 차단 여부를 점검합니다.',
        oracleReference: '링크 잠금 후 비인가 열람 즉시 차단',
        brokerInsightPrompt:
          'Q6. 매물 유출 방지(승인 후 열람 · 원할 때 링크 닫기)와 고객 열람 횟수 확인 기능에 대한 의견을 남겨 주세요.',
        brokerQuickTags: [
          '전속·알짜 매물 보호에 꼭 필요한 기능임',
          '누가 몇 번 열어봤는지 보여 영업 타이밍 잡기 좋음',
          '공동중개 중개사용 별도 열람 권한도 있으면 좋겠음',
        ],
      },
      {
        id: 'B2-S7',
        loopId: 'loop2',
        stepNumber: 7,
        subsystem: '오라클·보안마감',
        windowBadge: '창 A (PC 중개사)',
        targetMinutes: 1,
        severityOnFail: 'S0',
        title: '내 매물 비공개 무결성 판정 실행 → (선택) 원클릭 내 테스트 매물 삭제 → 최종 제출',
        actionChecklist: [
          '오른쪽 보드의 [🔍 실시간 보안·블라인드 판정 실행]을 눌러 내가 지정한 번지·건물명·소유주 번호가 공개 화면에 단 한 글자도 노출되지 않았음을 확인합니다.',
          '테스트에 쓰신 실제 매물 데이터를 서버에 남기지 않으려면 바로 아래 [🧹 내 테스트 매물·딜카드·IM 즉시 삭제] 버튼을 눌러 깨끗이 지웁니다.',
          '상단 [📋 Sign-off] 탭으로 이동해 현업 총평을 남기고 [☁️ 서버 최종 제출]을 눌러 마무리합니다.',
        ],
        copySnippets: [],
        humanFocus: '기존 한글·PPT·엑셀 수작업 대비 체감 시간 단축 효과와 유료 도입 의향에 결정적인 한 가지를 들려주세요.',
        autoProbeFocus: '커스텀 비공개 금지어 0건 및 삭제 후 공개 링크 비활성화를 확인합니다.',
        oracleReference: '비공개 정보 유출 0건 · 클린업 실행 시 즉시 폐기 완료',
        brokerInsightPrompt:
          'Q7. 기존 수작업(PPT·한글·엑셀) 대비 체감 작성 시간은 얼마나 줄었나요? 현업 도입을 위해 가장 바라는 개선 1가지를 적어 주세요.',
        brokerQuickTags: [
          '기존 반나절 작업이 15~20분으로 단축됨',
          '사진 정리·수익률 표 자동화가 가장 만족스러움',
          '현장 외근 중 모바일 수정 기능 강화 희망',
          '테스트 매물 원클릭 삭제가 있어 안심됨',
        ],
      },
    ],
  },
];

export const BROKER_FULL_LOOP_ALL_STEPS = BROKER_FULL_LOOP_CASES.flatMap(
  (c) => c.steps,
);
