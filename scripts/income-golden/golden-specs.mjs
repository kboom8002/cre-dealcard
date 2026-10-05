/**
 * income 골든 데이터 — 매물별 명세(spec).
 *
 * 금액: 만원, 면적: ㎡, 날짜: YYYY-MM-DD.
 * 두 변형:
 *  - corrected : 원본 결함을 보완한 입력 (날짜는 IM 작성월 → 기준일로 일괄 이동)
 *  - as-is     : 원본 IM 내용 그대로 (오기·누락·만료 포함) — 앱의 경고/방어 동작 검증용
 * 출처 태그(src): 원본 | 원본(정정) | 공부 | 가정
 *
 * 원본: docs/income-im/*.pptx  /  공부: data.go.kr 건축물대장(표제부·층별개요), scripts/income-golden/p0-register-check.ts
 */

export const AS_OF = '2026-10-05';

// ─────────────────────────────────────────────────────────────
// ig1 당산동5가 11-47 (호산당빌딩)
// ─────────────────────────────────────────────────────────────
const ig1 = {
  id: 'ig1-dangsan5ga-11-47',
  title: '당산동 근생빌딩(호산당빌딩)',
  sourcePrefix: '2505',
  broker: '제이에스부동산중개법인',
  imDate: '2025-05',
  shiftMonths: 17, // 2025-05 → 2026-10
  pnu: '1156011500100110047',
  address: '서울특별시 영등포구 당산동5가 11-47',
  askingPriceManwon: 1150000,
  parking: 8,
  elevator: 1,
  images: [
    { media: 'image3.jpeg', file: '01_exterior_건물외관', category: 'exterior', caption: '건물 외관', role: 'exterior', isHero: true },
    { media: 'image7.jpeg', file: '02_exterior_건물측면', category: 'exterior', caption: '건물 측면' },
    { media: 'image9.jpeg', file: '03_entrance_정문', category: 'entrance', caption: '정문' },
    { media: 'image8.jpeg', file: '04_parking_주차장', category: 'parking', caption: '주차장' },
    { media: 'image10.jpeg', file: '05_exterior_전면도로', category: 'exterior', caption: '전면 도로' },
    { media: 'image13.jpeg', file: '06_lobby_1층로비', category: 'lobby', caption: '1층 로비' },
    { media: 'image11.jpeg', file: '07_interior_EV', category: 'interior', caption: 'EV' },
    { media: 'image12.jpeg', file: '08_interior_복도', category: 'interior', caption: '복도' },
    { media: 'image15.jpeg', file: '09_interior_카페1', category: 'interior', caption: '카페 1' },
    { media: 'image14.jpeg', file: '10_interior_카페2', category: 'interior', caption: '카페 2' },
  ],
  references: [
    { media: 'image4.png', file: '위치도' },
    { media: 'image6.png', file: '토지이용및지적' },
    { media: 'image16.png', file: '인근매물_지도' },
    { media: 'image17.png', file: '인근매물_시세비교' },
    { media: 'image18.png', file: '인근매물_사진1' },
    { media: 'image19.png', file: '인근매물_사진2' },
    { media: 'image20.png', file: '인근매물_사진3' },
    { media: 'image21.png', file: '인근매물_사진4' },
  ],
  register: { platArea: 506.8, totArea: 1441.15, vlRatEstmTotArea: 1123.93, bcRat: 51.89, vlRat: 221.76, useAprDay: '2002-12-12', floors: 'B1~5F', parking: 8, elevator: 1, mainPurpose: '제2종근린생활시설', bldNm: '호산당빌딩' },
  variants: {
    corrected: {
      memo: `당산동5가 11-47 호산당빌딩 근생 매각
매각가 115억 (토지평당 약 7,500만원)
대지 506.8㎡(153.3평), 연면적 1,441.15㎡(435.9평), 준공업지역
2002년 준공, B1~5F, 자주식 주차 8대, EV 1대, 층별 구분등기(형제 공동소유)
당산역(2·9호선) 도보 5분, 배후 아파트 밀집, 국회대로·올림픽대로 접근 용이

임대현황 (보증금/월세, 만원)
B1 카페 96평 자가사용
1F 고은약국 6,000/183 ~28.01 (임대 11년차)
1F 로뎀나무내과 14,000/883 ~28.01 (2F와 통합계약)
2F 로뎀나무내과 (1F 계약에 포함)
3F 헬스장 5,000/455 ~27.09
4F 국제와인 3,000/260 ~27.09
4F 일부 25평 자가사용
5F 로뎀나무내과 1,000/165 ~28.01
합계 보증금 29,000 / 월세 1,946

제안 포인트
- 깨끗하게 잘 관리된 건물, 병원·약국 우량 임차로 공실 리스크 낮음
- 인근 우량 입지 매물(토지평당 1.3억 이상) 대비 저렴한 토지평당가
- 서울시 준공업지역 제도개선(2024.10) 수혜: 지구단위계획 수립 시 주거용도 용적률 상한 400%, 준주거·3종일반주거 용도지역 변경 추진
- 매입 후 임대료 현실화 여지: 자가사용분(B1 전체, 4F 일부) 임대 전환, 약국·병원 약 10년간 임대료 동결 → 현실화 시 기대수익률 약 3.1%

인근 매물: 당산동5가 11-30 200억(토지평당 1.39억), 영등포3가 1 430억(1.52억), 영등포7가 29-28 180억(0.89억), 영등포7가 94-14 430억(1.62억)`,
      brokerHighlight: '당산역 도보 5분 · 병원/약국 11년 장기임차 · 토지평당 7,500만원',
      brokerExtras: {
        "investment_points": [
          "깨끗하게 관리된 건물, 병원·약국 우량 임차로 공실 리스크 낮음",
          "인근 매물(토지평당 1.3억 이상) 대비 낮은 토지평당가",
          "서울시 준공업지역 제도개선(2024.10) — 지구단위계획 수립 시 용적률 상한 400%",
          "자가사용분(B1 전체, 4F 일부) 임대 전환 시 기대수익률 약 3.1%"
        ],
        "closing_line": "병원·약국 우량 임차 구성의 당산역 도보권 근생",
        "regulatory_notes": [
          {
            "kind": "zoning_special",
            "title": "준공업지역 제도개선",
            "detail": "지구단위계획 수립 시 주거용도 용적률 상한 400%, 준주거·3종일반주거 용도지역 변경 추진 (서울시 2024.10)"
          }
        ],
        "market_comps": [
          {
            "kind": "listing",
            "location": "당산동5가 11-30",
            "price_eok": 200,
            "land_price_per_pyeong_manwon": 13900
          },
          {
            "kind": "listing",
            "location": "영등포3가 1",
            "price_eok": 430,
            "land_price_per_pyeong_manwon": 15200
          },
          {
            "kind": "listing",
            "location": "영등포7가 29-28",
            "price_eok": 180,
            "land_price_per_pyeong_manwon": 8900
          },
          {
            "kind": "listing",
            "location": "영등포7가 94-14",
            "price_eok": 430,
            "land_price_per_pyeong_manwon": 16200
          }
        ],
        "location_note": "당산역(2·9호선) 도보 5분, 배후 아파트 밀집, 국회대로·올림픽대로 접근 용이",
        "post_acquisition_plan": [
          "자가사용 B1 임대 전환 (현실화안 보증 5,000만 / 월 458만)",
          "4F 자가사용분 임대 전환 (현실화안 보증 3,000만 / 월 144만)"
        ],
        "target_rent_per_pyeong_manwon": 5
      },
      brokerExtrasSrc: "원본(제안 포인트·인근 매물·현실화안) / 목표임대료=원본 현실화안 환산(가정)",
      vacancy: '만실',
      leases: [
        { floor: 'B1', area: 317.22, tenant: '데이르 카페(자가)', state: '자가사용', note: '매도인 자가 운영 카페. 매입 후 임대 전환 가능(현실화안 보증 5,000만/월 458만)', src: '원본' },
        { floor: '1F', area: 78.39, tenant: '고은약국', law: '상가', dep: 6000, rent: 183, first: '2014-09-01', end: '2026-08-31', renewal: '모름', state: '임대중', note: '임대 11년 경과(IM 작성 시점), 약 10년간 임대료 동결', src: '원본 / 최초계약일=가정' },
        { floor: '1F', group: '로뎀나무내과', area: 105.6, tenant: '로뎀나무내과', law: '상가', dep: 14000, rent: 883, first: '2014-09-01', end: '2026-08-31', renewal: '모름', state: '임대중', note: '1F·2F 통합계약 대표 행', src: '원본 / 계약그룹=원본(정정)' },
        { floor: '2F', group: '로뎀나무내과', area: 252.09, tenant: '로뎀나무내과', law: '상가', end: '2026-08-31', renewal: '모름', state: '임대중', note: '1F 계약에 포함(금액은 대표 행)', src: '원본(정정): 원본은 금액 공란' },
        { floor: '3F', area: 252.09, tenant: '헬스장', law: '상가', dep: 5000, rent: 455, end: '2026-04-17', renewal: '모름', state: '임대중', src: '원본(정정): 헬쓰장→헬스장' },
        { floor: '4F', area: 169.06, tenant: '국제와인', law: '상가', dep: 3000, rent: 260, end: '2026-04-30', renewal: '모름', state: '임대중', note: '원 만기 2025-04-30 경과 → 묵시적 갱신(1년) 처리', src: '원본(정정)' },
        { floor: '4F', area: 83.03, tenant: '(자가)', state: '자가사용', note: '4F 일부 자가사용. 현실화안 보증 3,000만/월 144만', src: '원본' },
        { floor: '5F', area: 183.67, tenant: '로뎀나무내과', law: '상가', dep: 1000, rent: 165, first: '2014-09-01', end: '2026-08-31', renewal: '모름', state: '임대중', note: '임대 11년 경과(IM 작성 시점), 1F와 별도 계약', src: '원본 / 최초계약일=가정' },
      ],
    },
    'as-is': {
      memo: `[ 매각 IM ] 당산동 근생빌딩 매각(당산동5가 11-47) 2025. 05월
제안 Point: 깨끗하게 잘 관리된 건물 상태 / 쾌적한 주변환경과 교통·차량 접근성 / 우량 임차인(병원/약국)으로 인해 낮은 공실리스크 / 인근 매물 대비 저렴한 토지평당가 / 준공업지역 규제완화 수혜
주소 영등포구 당산동5가 11-47, 대지면적 506.8㎡ (153.31평), 지목 대, 준공업지역
건축면적 263.01㎡ (79.6평), 건폐율 51.9%, 연면적 1,141.15㎡ (307.9평), 용적률 221.8%
준공 2002년, B1~5F, 자주식 8대, E/V 1대, 층별구분등기
매각가 11,500,000 천원, 토지평당가 약 75 백만원/평
입지: 당산역 도보 5분, 배후 아파트 밀집하여 상권 배후 풍부, 국회대로·올림픽대로 등 간선도로 접근성 용이
준공업 건폐율 60%, 용적률 400%(주거용도 등 250%). 서울시 준공업지역 제도개선 방안(2024.10): 지구단위계획 수립시 주거용도 용적률 상한 400%, 준주거/3종일반주거 용도지역 변경 추진
층별 임대현황: B1 317.22㎡ 데이르 카페(자가) / 1F 78.39㎡ 고은약국 60,000천원 1,830천원 ~26.08.31 임대 11년 경과 / 1F 105.60㎡ 로뎀나무내과 140,000천원 8,830천원 ~26.08.31 / 2F 252.09㎡ 로뎀나무내과 / 3F 252.09㎡ 헬쓰장 50,000천원 4,550천원 ~26.04.17 / 4F 169.06㎡ 국제와인 30,000천원 2,600천원 ~25.04.30 / 4F 83.03㎡ (자가) / 5F 183.67㎡ 로뎀나무내과 10,000천원 1,650천원 ~26.08.31 / 계 1,141.15㎡ 290,000천원 19,460천원
매입후 임대료 현실화를 통한 수익률 확대 가능 — 기대 수익률 연 3.1%`,
      brokerHighlight: '우량 임차인(병원/약국) · 토지평당 약 75백만원',
      vacancy: '만실',
      leases: [
        { floor: 'B1', area: 317.22, tenant: '데이르 카페(자가)', state: '자가사용' },
        { floor: '1F', area: 78.39, tenant: '고은약국', dep: 6000, rent: 183, end: '2026-08-31', state: '임대중', note: '임대 11년 경과' },
        { floor: '1F', area: 105.6, tenant: '로뎀나무내과', dep: 14000, rent: 883, end: '2026-08-31', state: '임대중', note: '임대 11년 경과' },
        { floor: '2F', area: 252.09, tenant: '로뎀나무내과', state: '임대중' },
        { floor: '3F', area: 252.09, tenant: '헬쓰장', dep: 5000, rent: 455, end: '2026-04-17', state: '임대중' },
        { floor: '4F', area: 169.06, tenant: '국제와인', dep: 3000, rent: 260, end: '2025-04-30', state: '임대중' },
        { floor: '4F', area: 83.03, tenant: '(자가)', state: '자가사용' },
        { floor: '5F', area: 183.67, tenant: '로뎀나무내과', dep: 1000, rent: 165, end: '2026-08-31', state: '임대중', note: '임대 11년 경과' },
      ],
      totalsOverride: null,
    },
  },
  defects: [
    ['연면적 오기', '개요·렌트롤 계에 연면적 1,141.15㎡(307.9평). 층별 면적 합은 1,441.15㎡(436.0평)', '건축물대장 연면적 1,441.15㎡(용적률산정 1,123.93㎡) → 원본(정정)', 'as-is: memo에 1,141.15 유지'],
    ['계약그룹 미표기', '2F 로뎀나무내과 금액 공란 — 1F 내과와 통합계약으로 추정', 'contract_group=로뎀나무내과 (대표 행 1F)', 'as-is: 그룹 없이 공란'],
    ['만기 경과 계약', '4F 국제와인 ~25.04.30 (IM 작성 25.05 시점 이미 만료)', '묵시적 갱신 1년(→2026-04-30) 후 일괄 이동', 'as-is: 2025-04-30 유지'],
    ['현재 수익률 미표기', '표기된 3.1%는 임대료 현실화 시나리오 수익률. 현재 기준은 미표기', '현재 기준 2.08% (1,946×12 ÷ (1,150,000−29,000)) 를 기대값으로', '-'],
    ['오탈자', '"헬쓰장"', '헬스장', 'as-is 유지'],
    ['관리비 미기재', '렌트롤에 관리비 없음', '공란 유지(날조 금지). 기존 p1 골든의 관리비 30/20은 근거 없음', '-'],
    ['최초 계약일', '"임대 11년 경과"만 기재', '2014-09-01 가정(만기 08-31 주기) → 이동', '가정'],
    ['소유자 실명', '개요 "층별구분등기(신현재 외 1인-형제)"', '실명 제거: "형제 공동소유"', '두 변형 모두 제거'],
    ['공부 대조', '대장 건물명 호산당빌딩, 주차 옥내3+옥외5=8, 3F 용도 학원(실사용 헬스장)', '대장값과 일치(주차·면적)', '-'],
  ],
  expected: {
    corrected: { totals: { deposit: 29000, rent: 1946 }, capRatePct: 2.08, floors: ['B1', '1F', '2F', '3F', '4F', '5F'], keywords: ['당산', '115억', '로뎀나무내과', '고은약국'], areaMode: 'lease', contractGroupFollowers: 1, ownerUseRows: 2, vacantRows: 0, mustNotInclude: ['1,141.15', '헬쓰장', '신현재'] },
    'as-is': { totals: { deposit: 29000, rent: 1946 }, floors: ['B1', '1F', '2F', '3F', '4F', '5F'], keywords: ['당산', '115억'], mustNotInclude: ['신현재'], observations: ['연면적 1,141.15(메모) vs 1,441.15(대장) 충돌 시 대장값 우선 또는 경고', '4F 2025-04-30 만료 계약을 만료/확인 필요로 표기', '2F 금액 공란을 0원으로 표기하지 않음', '현재 수익률을 3.1%(시나리오)로 오표기하지 않음'] },
  },
};

// ─────────────────────────────────────────────────────────────
// ig2 쌍림동 114 (운남빌딩)
// ─────────────────────────────────────────────────────────────
const ig2 = {
  id: 'ig2-ssangnim-114',
  title: '쌍림동 운남빌딩',
  sourcePrefix: '2506',
  broker: '제이에스부동산중개법인',
  imDate: '2025-06',
  shiftMonths: 16,
  pnu: '1114014700101140000',
  address: '서울특별시 중구 쌍림동 114',
  askingPriceManwon: 950000,
  parking: 6,
  elevator: 1,
  images: [
    { media: 'image3.jpeg', file: '01_exterior_건물외관', category: 'exterior', caption: '건물 외관', role: 'exterior', isHero: true },
    { media: 'image13.jpeg', file: '02_exterior_측면경사로', category: 'exterior', caption: '측면/경사로' },
    { media: 'image14.jpeg', file: '03_entrance_1층전면', category: 'entrance', caption: '1층 전면' },
    { media: 'image12.jpeg', file: '04_interior_B1층공실1', category: 'interior', caption: 'B1층 공실' },
    { media: 'image11.jpeg', file: '05_interior_B1층공실2', category: 'interior', caption: 'B1층 공실' },
    { media: 'image15.jpeg', file: '06_parking_주차장1', category: 'parking', caption: '주차장' },
    { media: 'image16.jpeg', file: '07_parking_주차장2', category: 'parking', caption: '주차장' },
    { media: 'image21.jpeg', file: '08_floor_plan_B1도면', category: 'floor_plan', caption: 'B1 도면' },
    { media: 'image18.jpeg', file: '09_floor_plan_1F도면', category: 'floor_plan', caption: '1F 도면' },
  ],
  references: [
    { media: 'image4.png', file: '위치도' },
    { media: 'image8.png', file: '지구단위계획_용도규제' },
    { media: 'image6.png', file: '지구단위계획_규모' },
    { media: 'image7.png', file: '지적도' },
    { media: 'image9.png', file: '지구단위계획_범례1' },
    { media: 'image10.png', file: '지구단위계획_범례2' },
    { media: 'image17.png', file: '매물시세' },
    { media: 'image20.jpeg', file: '도면_2F' },
    { media: 'image19.jpeg', file: '도면_3F' },
    { media: 'image22.jpeg', file: '도면_4F' },
    { media: 'image23.jpeg', file: '도면_5F' },
    { media: 'image24.jpeg', file: '도면_6F' },
  ],
  register: { platArea: 420.6, totArea: 1687.51, vlRatEstmTotArea: 1243.65, bcRat: 59.71, vlRat: 295.68, useAprDay: '2003-06-24', floors: 'B1~7F', parking: 6, elevator: 1, mainPurpose: '제1종근린생활시설', bldNm: '(대장 미기재)' },
  variants: {
    corrected: {
      memo: `중구 쌍림동 114 운남빌딩 근생 매각
매각가 95억 (토지평당 약 7,470만원, 건물평당 약 1,860만원)
대지 420.6㎡(127.2평), 연면적 1,687.51㎡(510.5평), 제3종일반주거지역
2003년 준공, B1~7F, 주차 6대, EV 1대
동대문역사문화공원역·동대입구역·충무로역 3개 역 도보 10분 이내, 장충체육관·신라호텔·동국대 인접
서울 지리적 중심부, 오피스 수요 많고 인쇄 등 특화 업종 상권 형성

임대현황 (보증금/월세, 만원)
B1 소매점 78평 공실 (희망 4,000/400)
1F 소매점 8,000/700
2F 제조업 2,000/175 (2F 나머지는 주차장)
3F 소매점 5,000/460
4F 사무소 2,000/442
5F 사무소 4,000/300
6F 기원 3,000/280
7F 사무소 15평 자가사용
합계(공실·자가 제외) 보증금 24,000 / 월세 2,357, 관리비 별도

특이사항
- 지하층 외 실질적인 공실 없음, 입지 양호하여 사무소·인쇄 관련 업종 수요 풍부
- 지구단위계획(용도): 불허용도 제조(인쇄, 고무류)·정신병원·창고·위험물저장 등 / 1층 지정용도 소매·휴게·음식·사무소·서점·사진·관공/노유자 시설
- 지구단위계획(규모): 건폐율 50% 이하, 기준/허용 용적률 250% 이하, 높이 20m 이하 / 높이 16m 이하 시 부설주차장 설치 100% 완화
- 7F는 연와조(벽돌구조)로 이후 증축, 건축물대장 등재

인근 시세: 거래 쌍림동 258 30억(토지평당 약 6,000만), 묵정동 27-4 18.3억(약 6,500만) / 매물 묵정동 29-6 56억(약 7,000만), 묵정동 24-13 95억(약 8,100만), 묵정동 28-6 65억(약 6,100만)`,
      brokerHighlight: '3개 역 도보권 · 지하 외 실공실 없음 · 토지평당 7,470만원',
      brokerExtras: {
        "investment_points": [
          "3개 역 도보 10분 이내, 장충체육관·신라호텔·동국대 인접",
          "지하층 외 실질적인 공실 없음",
          "사무소·인쇄 관련 업종 수요 풍부"
        ],
        "regulatory_notes": [
          {
            "kind": "district_plan",
            "title": "지구단위계획(용도)",
            "detail": "불허용도 제조(인쇄·고무류)·정신병원·창고·위험물저장 등 / 1층 지정용도 소매·휴게·음식·사무소·서점·사진·관공·노유자"
          },
          {
            "kind": "district_plan",
            "title": "지구단위계획(규모)",
            "detail": "건폐율 50% 이하, 용적률 250% 이하, 높이 20m 이하 (16m 이하 시 부설주차장 100% 완화)"
          }
        ],
        "market_comps": [
          {
            "kind": "transaction",
            "location": "쌍림동 258",
            "price_eok": 30,
            "land_price_per_pyeong_manwon": 6000
          },
          {
            "kind": "transaction",
            "location": "묵정동 27-4",
            "price_eok": 18.3,
            "land_price_per_pyeong_manwon": 6500
          },
          {
            "kind": "listing",
            "location": "묵정동 29-6",
            "price_eok": 56,
            "land_price_per_pyeong_manwon": 7000
          },
          {
            "kind": "listing",
            "location": "묵정동 24-13",
            "price_eok": 95,
            "land_price_per_pyeong_manwon": 8100
          },
          {
            "kind": "listing",
            "location": "묵정동 28-6",
            "price_eok": 65,
            "land_price_per_pyeong_manwon": 6100
          }
        ],
        "location_note": "동대문역사문화공원역·동대입구역·충무로역 도보 10분 이내. 서울 지리적 중심부, 인쇄 등 특화 업종 상권 형성",
        "target_rent_per_pyeong_manwon": 5.1
      },
      brokerExtrasSrc: "원본(특이사항·인근 시세) / 목표임대료=원본 B1 희망 400만÷78평(가정)",
      vacancy: '~20%',
      leases: [
        { floor: 'B1', area: 259.25, tenant: '소매점', law: '상가', state: '공실', note: '공실. 희망 임대료 보증 4,000만/월 400만(관리비 별도)', src: '원본 / 면적=공부(184.91+74.34)' },
        { floor: '1F', area: 251.16, tenant: '소매점', law: '상가', dep: 8000, rent: 700, start: '2025-04-01', end: '2027-03-31', renewal: '모름', state: '임대중', src: '원본 / 면적=공부 / 기간=가정' },
        { floor: '2F', area: 89.73, tenant: '제조업', law: '상가', dep: 2000, rent: 175, start: '2025-09-01', end: '2027-08-31', renewal: '모름', state: '임대중', note: '2F 나머지 153.87㎡는 주차장(임대 대상 아님)', src: '원본 / 면적=공부 / 기간=가정' },
        { floor: '3F', area: 243.6, tenant: '소매점', law: '상가', dep: 5000, rent: 460, start: '2026-03-01', end: '2028-02-29', renewal: '모름', state: '임대중', src: '원본 / 면적=공부 / 기간=가정' },
        { floor: '4F', area: 230.6, tenant: '사무소', law: '상가', dep: 2000, rent: 442, start: '2025-12-01', end: '2027-11-30', renewal: '모름', state: '임대중', src: '원본 / 면적=공부 / 기간=가정' },
        { floor: '5F', area: 206.08, tenant: '사무소', law: '상가', dep: 4000, rent: 300, start: '2026-06-01', end: '2028-05-31', renewal: '모름', state: '임대중', src: '원본 / 면적=공부 / 기간=가정' },
        { floor: '6F', area: 148.42, tenant: '기원', law: '상가', dep: 3000, rent: 280, start: '2025-07-01', end: '2027-06-30', renewal: '모름', state: '임대중', src: '원본 / 면적=공부 / 기간=가정' },
        { floor: '7F', area: 50.6, tenant: '사무소(자가)', state: '자가사용', note: '자가사용(환산 보증 2,000만/월 100만). 연와조 증축분', src: '원본 / 면적=공부' },
      ],
      noDateShift: true, // 기간 자체가 가정값(기준일 기준으로 직접 배치)
    },
    'as-is': {
      memo: `[ 매각 IM ] 쌍림동 운남빌딩 매각 2025. 06월
주소 중구 쌍림동 114, 대지면적 424.6㎡(128.4평), 지목 대, 3종일반
건축면적 251.16㎡ (76.0평), 건폐율 59.7%, 연면적 1,687.51㎡ (510.5평), 용적률 295.7%
준공 2003년, B1~7F, 주차 6대, E/V 1대
매각가 95 억원, 토지평당가 약 72 백만원/평, 건물평당가 약 19 백만원/평
입지: 서울 지리적 중심부에 위치, 3개 역사 10분이내 도보권, 오피스 수요 많고 인쇄 등의 특화 업종 상권 형성 (장충체육관, 신라호텔, 동국대학교, 동대문역사문화공원역, 동대입구역, 충무로역)
사용 현황(천원): B1 소매점 78평 공실 (40,000)/(4,000) 관리비 별도 / B1 기계실 16평 / 1F 소매점 75평 임대 80,000/7,000 / 2F 주차장 47평 / 2F 제조업 27평 임대 20,000/1,750 / 3F 소매점 74평 임대 50,000/4,600 / 4F 사무소 70평 임대 20,000/4,420 / 5F 사무소 62평 임대 40,000/3,000 / 6F 기원 45평 임대 30,000/2,800 / 7F 사무소 15평 자가 (20,000)/(1,000)
계 510평 — 공실/자가 제외 240,000/23,570 수익률 3.1%, 공실/자가 포함 300,000/28,570 수익률 3.7%
지하층 외 실질적인 공실 없음, 입지 양호하여 사무소/인쇄관련 업종 수요 풍부, 기대 수익률 3.7%
지구단위계획: 불허용도 제조(인쇄, 고무류), 정신병원, 창고, 위험물저장 등 / 1층 지정 소매, 휴게, 음식, 사무소, 서점, 사진, 관공/노유자 시설 / 규모 제한 건폐율 50% 이하, 기준/허용 용적률 250% 이하, 높이 20m 이하 / 제한적 주차장 설치 완화: 높이 16m 이하시 부설주차장설치 100% 완화
7F : 연와조로 이후 증축함.`,
      brokerHighlight: '3개 역사 10분이내 도보권 · 기대 수익률 3.7%',
      vacancy: '~20%',
      leases: [
        { floor: 'B1', areaText: '78평', tenant: '소매점', dep: 4000, rent: 400, state: '공실', note: '(40,000)/(4,000) 관리비 별도' },
        { floor: 'B1', areaText: '16평', tenant: '기계실' },
        { floor: '1F', areaText: '75평', tenant: '소매점', dep: 8000, rent: 700, state: '임대중' },
        { floor: '2F', areaText: '47평', tenant: '주차장' },
        { floor: '2F', areaText: '27평', tenant: '제조업', dep: 2000, rent: 175, state: '임대중' },
        { floor: '3F', areaText: '74평', tenant: '소매점', dep: 5000, rent: 460, state: '임대중' },
        { floor: '4F', areaText: '70평', tenant: '사무소', dep: 2000, rent: 442, state: '임대중' },
        { floor: '5F', areaText: '62평', tenant: '사무소', dep: 4000, rent: 300, state: '임대중' },
        { floor: '6F', areaText: '45평', tenant: '기원', dep: 3000, rent: 280, state: '임대중' },
        { floor: '7F', areaText: '15평', tenant: '사무소', dep: 2000, rent: 100, state: '자가사용', note: '(20,000)/(1,000) 자가' },
      ],
      totalsOverride: { deposit: 24000, rent: 2357 },
    },
  },
  defects: [
    ['대지면적 불일치', 'IM 424.6㎡(128.4평)', '건축물대장 대지 420.6㎡(127.2평) → 공부', 'as-is 유지'],
    ['토지평당가 계산', 'IM "약 72백만원/평" (95억÷128.4평=7,399만)', '95억÷127.2평 ≈ 7,470만원', 'as-is 유지'],
    ['임대차 기간 전부 누락', '계약 시작·만기 없음', '2년 계약 가정, 기준일 이후 2027-03~2028-05로 분산 배치(가정)', 'as-is: 공란'],
    ['면적 단위', '계약면적(평)만 기재, ㎡·전용 없음', '건축물대장 층별 면적(㎡)으로 대체(공부). 평 환산값이 원본과 일치', 'as-is: "78평" 문자열'],
    ['괄호 금액(희망·환산)', 'B1 공실 (40,000)/(4,000), 7F 자가 (20,000)/(1,000)', '금액 칸 비우고 비고에 기재(실수입 제외)', 'as-is: 금액 칸에 입력(앱의 공실/자가 금액 제외 동작 검증)'],
    ['임대 불가 행', 'B1 기계실 16평, 2F 주차장 47평이 렌트롤 행으로 존재', '렌트롤에서 제외(비고/메모로 이동)', 'as-is: 행 유지'],
    ['수익률 2종', '3.1%(공실·자가 제외) / 3.7%(포함), 결론 문구는 3.7%', '실수입 기준 3.05% (2,357×12 ÷ (950,000−24,000))', '-'],
    ['7F 증축', '"연와조로 이후 증축함"', '건축물대장 7F 벽돌구조 50.6㎡ 등재 확인 → 위반 아님', '-'],
    ['임차인명 없음', '용도만 기재', '용도를 임차인명으로 복사하지 않는지 검증(Rule 4)', '-'],
    ['건물명', 'IM "운남빌딩", 대장 건물명 공란', '메모에 운남빌딩 유지', '-'],
    ['기존 용적률 > 지구단위 허용', '현 용적률 295.7% vs 지구단위 허용 250%', '메모에 추론 문구 미추가(앱 서술 관찰용)', '-'],
  ],
  expected: {
    corrected: { totals: { deposit: 24000, rent: 2357 }, capRatePct: 3.05, floors: ['B1', '1F', '2F', '3F', '4F', '5F', '6F', '7F'], keywords: ['중구', '95억', '지구단위'], gapKeywords: [], areaMode: 'lease', contractGroupFollowers: 0, ownerUseRows: 1, vacantRows: 1, mustNotInclude: ['424.6'] },
    'as-is': { totals: { deposit: 24000, rent: 2357 }, floors: ['B1', '1F', '2F', '3F', '4F', '5F', '6F', '7F'], keywords: ['중구', '95억'], mustNotInclude: [], observations: ['공실(B1)·자가(7F) 행의 괄호 금액을 실수입에 합산하지 않음 (렌트롤 합계 ≠ 바텀시트 합계 시 경고)', '기계실·주차장 행을 임차 호실로 오인하지 않음', '수익률 3.7%(공실·자가 포함)를 현재 수익률로 오표기하지 않음', '대지 424.6(메모) vs 420.6(대장) 충돌 처리', '계약기간 없음 → WALE/만기 표기 생략 또는 확인 필요'] },
  },
};

// ─────────────────────────────────────────────────────────────
// ig3 창신동 464-6 (선일빌딩)
// ─────────────────────────────────────────────────────────────
const ig3 = {
  id: 'ig3-changsin-464-6',
  title: '창신동 선일빌딩',
  sourcePrefix: '2508',
  broker: '제이에스부동산중개법인',
  imDate: '2025-08',
  shiftMonths: 14,
  pnu: '1111017400104640006',
  address: '서울특별시 종로구 창신동 464-6',
  askingPriceManwon: 2250000,
  parking: 2,
  elevator: 1,
  images: [
    { media: 'image3.jpeg', file: '01_exterior_건물외관', category: 'exterior', caption: '건물 외관', role: 'exterior', isHero: true },
    { media: 'image8.jpeg', file: '02_exterior_지하철출구에서본전경', category: 'exterior', caption: '지하철 출구에서 본 전경' },
    { media: 'image10.png', file: '03_exterior_대로에서본전경', category: 'exterior', caption: '대로에서 본 전경' },
    { media: 'image9.jpeg', file: '04_parking_주차환경', category: 'parking', caption: '주차 환경' },
    { media: 'image7.jpeg', file: '05_exterior_상권', category: 'exterior', caption: '상권' },
  ],
  references: [
    { media: 'image4.png', file: '위치도' },
    { media: 'image5.png', file: '지적및규제_1' },
    { media: 'image6.png', file: '지적및규제_2' },
    { media: 'image11.png', file: '주변매물시세' },
    { media: 'image12.png', file: '건축물현황도_배치도' },
  ],
  register: { platArea: 547.1, totArea: 2300.46, vlRatEstmTotArea: 1780.22, bcRat: 65.35, vlRat: 325.39, useAprDay: '1989-09-23', floors: 'B2~5F', parking: 2, elevator: 1, mainPurpose: '숙박시설', bldNm: '선일빌딩', annex: '부속 단독주택(1940, 목조, 49.59㎡) 별동 등재' },
  variants: {
    corrected: {
      memo: `종로구 창신동 464-6 선일빌딩 매각 (도로명 종로 294)
매각가 225억 (토지평당 약 1.36억)
대지 547.1㎡(165.5평), 연면적 2,300.46㎡(695.9평), 일반상업지역
1989년 준공, 2024년 5월 대수선, B2~5F, 주차 2대(거주자우선 포함 추가 확보 가능), EV 1대
동대문 사거리 코너, 동대문 상권 초입부. 지하철 1·4호선 동대문역 출구가 만나는 지점, 활성화된 상권이 안정적으로 유지
DDP·흥인지문공원·동대문스퀘어 인접, 종로5가역·동묘역 도보권

임대현황 (보증금/월세/관리비, 만원, VAT 별도)
B1 게임장 2,000/900/-
1F 하동추어탕 30,000/900/100
1F 순대국 5,000/280/40
1F 커피숍 750/50/-
2F 교촌치킨 13,000/1,500/100
3F 게스트하우스 11,000/800/85
4F 게스트하우스 13,000/850/85
5F 치과 5,000/370/30
5F 일부 공실 (기존 자가사용, 희망 7,000/450/40)
합계(공실 제외) 보증금 79,750 / 월세 5,650 / 관리비 440
SK 통신 안테나 수입 별도 연 325만원

규제 검토
- 일반상업지역: 건폐율 60%, 용적률 기준 600%(허용 660%), 고도·문화재 관련은 협의사항
- 개발행위허가제한: 근거 도시환경정비 예정구역(창신1구역 도시정비), 제한행위 신축 및 공작물 설치(증개축 가능), 기한 도시환경정비 계획 수립 시까지

주변 시세(토지평당): 실거래 창신동 510 53억(약 1.7억), 창신동 497-1 77억(약 1.7억), 창신동 510-3 61억(약 1.7억) / 매물 창신동 446-1 33억(약 1.2억), 창신동 550-1 200억(약 1.9억)
최근 5년 내 실거래 토지평당 약 1.7억 내외 대비 본 물건 약 1.36억으로 가격경쟁력 있음`,
      brokerHighlight: '동대문역 출구 접면 코너 · 일반상업 · 토지평당 1.36억',
      brokerExtras: {
        "investment_points": [
          "동대문 사거리 코너, 1·4호선 동대문역 출구 접점",
          "최근 5년 실거래 토지평당 약 1.7억 대비 본건 약 1.36억",
          "SK 통신 안테나 수입 별도 연 325만원"
        ],
        "regulatory_notes": [
          {
            "kind": "dev_restriction",
            "title": "개발행위허가제한",
            "detail": "도시환경정비 예정구역(창신1구역) 내 개발행위허가 제한",
            "basis": "도시환경정비 예정구역(창신1구역 도시정비)",
            "restricted_acts": "신축 및 공작물 설치 (증개축 가능)",
            "period": "도시환경정비 계획 수립 시까지"
          },
          {
            "kind": "zoning_special",
            "title": "일반상업지역",
            "detail": "건폐율 60%, 용적률 기준 600%(허용 660%). 고도·문화재 관련은 협의사항"
          }
        ],
        "market_comps": [
          {
            "kind": "transaction",
            "location": "창신동 510",
            "price_eok": 53,
            "land_price_per_pyeong_manwon": 17000
          },
          {
            "kind": "transaction",
            "location": "창신동 497-1",
            "price_eok": 77,
            "land_price_per_pyeong_manwon": 17000
          },
          {
            "kind": "transaction",
            "location": "창신동 510-3",
            "price_eok": 61,
            "land_price_per_pyeong_manwon": 17000
          },
          {
            "kind": "listing",
            "location": "창신동 446-1",
            "price_eok": 33,
            "land_price_per_pyeong_manwon": 12000
          },
          {
            "kind": "listing",
            "location": "창신동 550-1",
            "price_eok": 200,
            "land_price_per_pyeong_manwon": 19000
          }
        ],
        "location_note": "DDP·흥인지문공원·동대문스퀘어 인접, 종로5가역·동묘역 도보권",
        "post_acquisition_plan": [
          "5F 일부 공실(기존 자가사용) 임대 — 희망 보증 7,000만 / 월 450만"
        ],
        "target_rent_per_pyeong_manwon": 7.7
      },
      brokerExtrasSrc: "원본(규제 검토·주변 시세·안테나) / 목표임대료=원본 5F 희망 450만÷58.1평(가정)",
      vacancy: '~10%',
      leases: [
        { floor: 'B1', area: 327.92, tenant: '게임장', law: '상가', dep: 2000, rent: 900, start: '2025-11-01', end: '2027-10-31', renewal: '모름', state: '임대중', src: '원본 / 면적=공부 / 기간=가정' },
        { floor: '1F', area: 256.59, tenant: '하동추어탕', law: '상가', dep: 30000, rent: 900, mgmt: 100, start: '2026-03-01', end: '2028-02-29', renewal: '모름', state: '임대중', src: '원본 / 면적=공부(휴게음식점 구획 배정=가정) / 기간=가정' },
        { floor: '1F', area: 93.43, tenant: '순대국', law: '상가', dep: 5000, rent: 280, mgmt: 40, start: '2025-08-01', end: '2027-07-31', renewal: '모름', state: '임대중', src: '원본 / 면적=공부(일반음식점 구획) / 기간=가정' },
        { floor: '1F', area: 49.59, tenant: '커피숍', law: '상가', dep: 750, rent: 50, start: '2025-12-01', end: '2027-11-30', renewal: '모름', state: '임대중', note: '부속 별동(대장상 단독주택 49.59㎡) 배정=가정', src: '원본 / 면적=공부·배정=가정 / 기간=가정' },
        { floor: '2F', area: 357.55, tenant: '교촌치킨', law: '상가', dep: 13000, rent: 1500, mgmt: 100, start: '2026-05-01', end: '2028-04-30', renewal: '모름', state: '임대중', src: '원본 / 면적=공부 / 기간=가정' },
        { floor: '3F', area: 357.55, tenant: '게스트하우스', law: '상가', dep: 11000, rent: 800, mgmt: 85, start: '2025-10-01', end: '2027-09-30', renewal: '모름', state: '임대중', src: '원본 / 면적=공부(289.05+68.5) / 기간=가정' },
        { floor: '4F', area: 357.55, tenant: '게스트하우스', law: '상가', dep: 13000, rent: 850, mgmt: 85, start: '2026-01-01', end: '2027-12-31', renewal: '모름', state: '임대중', src: '원본 / 면적=공부(289.08+68.47) / 기간=가정' },
        { floor: '5F', area: 165.5, tenant: '치과', law: '상가', dep: 5000, rent: 370, mgmt: 30, start: '2026-07-01', end: '2028-06-30', renewal: '모름', state: '임대중', src: '원본 / 면적=공부 / 기간=가정' },
        { floor: '5F', area: 192.05, tenant: '공실', law: '상가', state: '공실', note: '기존 자가사용. 희망 임대료 보증 7,000만/월 450만/관리비 40만', src: '원본(정정): 원본은 희망 금액을 합계에 포함 / 면적=공부(37.49+154.56)' },
      ],
      noDateShift: true,
    },
    'as-is': {
      memo: `[ 매각 IM ] 창신동 464-6 매각(선일빌딩) 2025. 08월
주소 종로구 창신동 464-6, 대지면적 547.1㎡ (165.5평), 지목 대, 일반상업, 개발허가제한, 문화보호(동대문)
건축면적 357.55㎡ (108.2평), 건폐율 65.35%, 연면적 2,300.46㎡ (695.9평), 용적률 325.39%
준공시점 89. 09월 → 24. 5월 대수선, B2 ~ 5F, 주차 5대 → 실제 거주자우선 포함 추가 가능
매각가 225 억원, 토지평당가 약 1.4억원/평
위치: 동대문 사거리 코너, 동대문 상권 초입부, 지하철 1, 4호선 출구 만나는 지점, 활성화된 상권이 안정적으로 유지 (동대문, DDP, 종로5가역, 동묘역, 메리어트, 동대문스퀘어, 흥인지문공원)
일반상업지역 건폐율 60%, 용적률 기준 600%(허용 660%) ※ 고도/문화재 관련은 협의사항
개발행위허가제한 근거: 도시환경정비 예정구역(창신1구역 도시정비) / 제한행위: 신축 및 공작물 설치(증개축 가능) / 기한: 도시환경정비 계획 수립시까지
임대현황(단위 천원, VAT별도): B1 게임장 20,000/9,000/- / 1 하동추어탕 300,000/9,000/1,000 / 순대국 50,000/2,800/400 / 커피숍 7,500/500/- / 2 교촌치킨 130,000/15,000/1,000 / 3 게스트하우스 110,000/8,000/850 / 4 게스트하우스 130,000/8,500/850 / 5 치과 50,000/3,700/300 / 공실 70,000/4,500/400 기존 자가사용
계 867,500/61,000/4,800, 연 수입 732,000/57,600, 기대 수익률 약 3.4%, SK안테나 수입 별도 연 3,250천원
주변 매물 시세: 실거래 창신동 510 31.3평 53억 약 1.7억원/평, 창신동 497-1 46.3평 77억 약 1.7억원/평, 창신동 510-3 36.1평 61억 약 1.7억원/평 / 매물 창신동 446-1 26.7평 33억 약 1.2억원/평, 창신동 550-1 108.0평 200억 약 1.9억원/평 → 시세 대비 가격경쟁력 있음`,
      brokerHighlight: '동대문 사거리 코너 · 기대 수익률 약 3.4%',
      vacancy: '~10%',
      parking: 5, // 원본 IM 표기(공부 2대)
      leases: [
        { floor: 'B1', tenant: '게임장', dep: 2000, rent: 900, state: '임대중' },
        { floor: '1F', tenant: '하동추어탕', dep: 30000, rent: 900, mgmt: 100, state: '임대중' },
        { floor: '1F', tenant: '순대국', dep: 5000, rent: 280, mgmt: 40, state: '임대중' },
        { floor: '1F', tenant: '커피숍', dep: 750, rent: 50, state: '임대중' },
        { floor: '2F', tenant: '교촌치킨', dep: 13000, rent: 1500, mgmt: 100, state: '임대중' },
        { floor: '3F', tenant: '게스트하우스', dep: 11000, rent: 800, mgmt: 85, state: '임대중' },
        { floor: '4F', tenant: '게스트하우스', dep: 13000, rent: 850, mgmt: 85, state: '임대중' },
        { floor: '5F', tenant: '치과', dep: 5000, rent: 370, mgmt: 30, state: '임대중' },
        { floor: '5F', tenant: '공실', dep: 7000, rent: 450, mgmt: 40, state: '공실', note: '기존 자가사용' },
      ],
      totalsOverride: { deposit: 86750, rent: 6100 },
    },
  },
  defects: [
    ['공실 희망임대료 합계 포함', '렌트롤 계 867,500/61,000/4,800 및 연 수입·수익률 3.4%에 5F 공실 희망 금액(70,000/4,500/400 천원) 포함', '공실 제외 실수입 79,750/5,650/440(만원), 수익률 3.12% (5,650×12 ÷ (2,250,000−79,750))', 'as-is: 바텀시트 합계 86,750/6,100 + 공실 행 금액 입력'],
    ['층별 면적 없음', '렌트롤에 면적 열 없음', '건축물대장 층별 면적(공부). 1F 3개 임차 구획 배정과 5F 공실 면적(37.49+154.56)은 가정', 'as-is: 공란'],
    ['임대차 기간 없음', '-', '2년 계약 가정, 기준일 이후 분산 배치', 'as-is: 공란'],
    ['주차대수 불일치', 'IM 5대(+거주자우선)', '건축물대장 옥외 자주식 2대 → 공부, 거주자우선 문구는 메모 유지', 'as-is: 5대'],
    ['층 표기', '1·2·3·4·5 (F 없음), 1층 임차 3개 호실 구분 없음', '1F~5F 표기', 'as-is: 1F 표기(템플릿 입력 시 정규화)'],
    ['B2 누락', '개요 B2~5F, 렌트롤에 B2 없음', '대장 B2 기계실 192.32㎡ → 임대 대상 아님(렌트롤 미포함)', '-'],
    ['부가수입', 'SK안테나 연 3,250천원', 'Basic 바텀시트 필드 없음(Pro 전용) → 메모로만 입력', '-'],
    ['대장 주용도', 'IM 미기재', '대장 주용도 숙박시설(3·4F 게스트하우스), 부속 단독주택 별동(1940, 목조 49.59㎡)', '-'],
    ['토지평당가 반올림', 'IM 약 1.4억', '225억÷165.5평 ≈ 1.36억', 'as-is 유지'],
  ],
  expected: {
    corrected: { totals: { deposit: 79750, rent: 5650 }, capRatePct: 3.12, floors: ['B1', '1F', '2F', '3F', '4F', '5F'], keywords: ['창신', '225억', '교촌치킨', '개발행위허가제한'], gapKeywords: [], areaMode: 'lease', contractGroupFollowers: 0, ownerUseRows: 0, vacantRows: 1, mustNotInclude: ['3.4%'] },
    'as-is': { totals: { deposit: 86750, rent: 6100 }, floors: ['B1', '1F', '2F', '3F', '4F', '5F'], keywords: ['창신', '225억'], mustNotInclude: [], observations: ['공실 행(5F) 금액을 실수입에서 제외 → 렌트롤 실수입(79,750/5,650)과 바텀시트 합계(86,750/6,100) 불일치 경고', '수익률을 3.4%로 표기하면 공실 포함 오류', '면적 없는 렌트롤 → 면적 열 "-" 처리(날조 금지)', '개발행위허가제한 리스크 공시'] },
  },
};

// ─────────────────────────────────────────────────────────────
// ig4 양평동4가 117 외 2필지 (더레드빌딩) — 기존 p5 골든 이관
// ─────────────────────────────────────────────────────────────
const ig4 = {
  id: 'ig4-yangpyeong4ga-117',
  title: '양평동 더레드빌딩',
  sourcePrefix: '양평',
  broker: '제네시스에셋',
  imDate: '2024-04', // IM에 작성일 미표기 — 계약기간(최초 만기 2024-05-29 유효)으로 추정
  shiftMonths: 30,
  pnu: '1156012800101170000',
  address: '서울특별시 영등포구 양평동4가 117',
  multiParcel: true,
  parcels: [
    { address: '양평동4가 117', pnu: '1156012800101170000' },
    { address: '양평동4가 134', pnu: '1156012800101340000' },
    { address: '양평동4가 125-2', pnu: '1156012800101250002' },
  ],
  askingPriceManwon: 2500000,
  parking: 23,
  elevator: 1,
  images: [
    { media: 'image7.png', file: '01_exterior_건물사진', category: 'exterior', caption: '건물 사진', role: 'exterior', isHero: true },
  ],
  references: [
    { media: 'image6.png', file: '위치도' },
    { media: 'image8.png', file: '임대현황표_원본이미지' },
    { media: 'image9.png', file: '건축물현황_1' },
    { media: 'image10.png', file: '건축물현황_2' },
    { media: 'image11.png', file: '토지이용계획원_1' },
    { media: 'image12.png', file: '토지이용계획원_2' },
  ],
  register: { platArea: 518.7, totArea: 2490.88, vlRatEstmTotArea: 2068.63, bcRat: 58.4, vlRat: 398.8, useAprDay: '2018-09-12', floors: 'B1~10F', parking: 23, elevator: 1, mainPurpose: '업무시설', bldNm: '선유테라피스타워' },
  variants: {
    corrected: {
      memo: `영등포구 양평동4가 117 외 2필지(134, 125-2) 더레드빌딩 매각
매각가 250억 (토지평당 약 1억5,930만원)
대지 518.7㎡(156.9평), 연면적 2,490.88㎡(753.5평), 준공업지역, 공시지가 9,484,000원/㎡(2023.01)
2018년 9월 준공, B1~10F, 철근콘크리트구조, 업무시설, 개별 냉난방
주차 23대(옥외 자주식 1, 기계식 22), EV 1대
선유도역(9호선) 4번 출구 도보 1분, 대로변 초역세권

임대현황 (보증금/월세/관리비, 만원, VAT 별도, 후불·말일 납부)
1F 부동산 3,500/250/15
2F 미용실 5,000/540/60
3F 치과 7,000/310/53
4F 사무실 5,000/440/55
5F 사무실 5,700/528/66
6F 사무실 4,000/483/69
7F 사무실 5,000/588/62
8F 사무실 5,000/560/80
9F 스튜디오렌탈 2,000/199/22
9F 사무실 3,000/300/43
10F 운동시설 4,300/459/51
B1 공실
합계 보증금 49,500 / 월세 4,657 / 관리비 576

특이사항
- 대로변, 초역세권 (9호선 선유도역 1분)
- 2018년 신축 건물로 내외관 아주 수려함
- 선유도역 대로변 위치하여 사무실 임차수요 풍부, 안정적 임대수익 기대
- 현재 지하1층 공실상태`,
      brokerHighlight: '선유도역 1분 대로변 · 2018년 신축 · 10층 업무시설',
      brokerExtras: {
        "investment_points": [
          "선유도역(9호선) 4번 출구 도보 1분, 대로변 초역세권",
          "2018년 준공 B1~10F 업무시설, 개별 냉난방",
          "공시지가 9,484,000원/㎡ (2023.01)"
        ],
        "location_note": "선유도역(9호선) 4번 출구 도보 1분, 대로변 초역세권"
      },
      brokerExtrasSrc: "원본(메모) — 규제·시세 자료 없음(해당 입력 생략 경로 검증)",
      vacancy: '~10%',
      // 원본 계약기간(2022~2025) → +30개월 이동. 면적=공부(9F 분할은 월세 비례 가정)
      leases: [
        { floor: 'B1', area: 212.19, tenant: '공실', law: '상가', state: '공실', note: '지하1층 공실(관리비 후불·말일)', src: '원본 / 면적=공부(사진관 구획)' },
        { floor: '1F', area: 130.02, tenant: '부동산', law: '상가', dep: 3500, rent: 250, mgmt: 15, start: '2023-11-11', end: '2025-11-11', renewal: '모름', state: '임대중', note: '후불, 말일 납부', src: '원본 / 면적=공부' },
        { floor: '2F', area: 198.21, tenant: '미용실', law: '상가', dep: 5000, rent: 540, mgmt: 60, start: '2024-02-22', end: '2026-02-21', renewal: '모름', state: '임대중', note: '후불, 말일 납부', src: '원본 / 면적=공부' },
        { floor: '3F', area: 194.09, tenant: '치과', law: '상가', dep: 7000, rent: 310, mgmt: 53, start: '2022-11-01', end: '2024-10-31', renewal: '모름', state: '임대중', note: '후불, 말일 납부', src: '원본 / 면적=공부' },
        { floor: '4F', area: 181.98, tenant: '사무실', law: '상가', dep: 5000, rent: 440, mgmt: 55, start: '2022-06-30', end: '2024-06-29', renewal: '모름', state: '임대중', note: '후불, 말일 납부', src: '원본 / 면적=공부' },
        { floor: '5F', area: 219.52, tenant: '사무실', law: '상가', dep: 5700, rent: 528, mgmt: 66, start: '2022-05-30', end: '2024-05-29', renewal: '모름', state: '임대중', note: '후불, 말일 납부', src: '원본 / 면적=공부' },
        { floor: '6F', area: 227.69, tenant: '사무실', law: '상가', dep: 4000, rent: 483, mgmt: 69, start: '2024-03-01', end: '2026-02-28', renewal: '모름', state: '임대중', note: '후불, 말일 납부', src: '원본 / 면적=공부' },
        { floor: '7F', area: 275.89, tenant: '사무실', law: '상가', dep: 5000, rent: 588, mgmt: 62, start: '2023-10-04', end: '2025-10-03', renewal: '모름', state: '임대중', note: '후불, 말일 납부', src: '원본 / 면적=공부' },
        { floor: '8F', area: 264.09, tenant: '사무실', law: '상가', dep: 5000, rent: 560, mgmt: 80, start: '2023-09-08', end: '2025-09-07', renewal: '모름', state: '임대중', note: '후불, 말일 납부', src: '원본 / 면적=공부' },
        { floor: '9F-1', area: 82.68, tenant: '스튜디오렌탈', law: '상가', dep: 2000, rent: 199, mgmt: 22, start: '2023-11-01', end: '2025-10-31', renewal: '모름', state: '임대중', note: '9F 분할임대(1). 면적은 월세 비례 배분(가정)', src: '원본 / 면적=공부 207.4㎡ 분할=가정' },
        { floor: '9F-2', area: 124.72, tenant: '사무실', law: '상가', dep: 3000, rent: 300, mgmt: 43, start: '2023-12-01', end: '2025-11-30', renewal: '모름', state: '임대중', note: '9F 분할임대(2). 면적은 월세 비례 배분(가정)', src: '원본 / 면적=공부 207.4㎡ 분할=가정' },
        { floor: '10F', area: 169.74, tenant: '운동시설', law: '상가', dep: 4300, rent: 459, mgmt: 51, start: '2022-10-01', end: '2024-09-30', renewal: '모름', state: '임대중', note: '후불, 말일 납부', src: '원본 / 면적=공부' },
      ],
    },
    'as-is': {
      memo: `Start Your Property Application with Genesis Asset
서울시 강남구 양평동4가 117외 2필지 더레드빌딩
위치 서울시 영등포구 양평동4가 117, 134, 125-2번지
토지 면적 518.7㎡ (157평), 용도지역 준공업지역, 공시지가 9,484,000원/㎡ (3,135만원/평) -2023.01-, 도로/교통 선유도역(9호선) 4번출구 도보1분
건물 연면적 2,490.88㎡ (753평), 건축면적 302.94㎡ (92평), 건폐율 58.4%, 용적률 398.8%, 지하 1층/지상 10층, 개별식 냉난방, 준공 2018년 9월 12일, 승강기 1대, 옥외자주식 1대/기계식 22대, 철근콘크리트구조, 업무시설
금액 보증금 5억3,500만원, 임대료 5,017만원, 관리비 648만원, 수익률 %, 매매가 250억(15,923만원/평)
대로변, 초역세권 (9호선 선유도역 1분) / 2018년 신축건물로 내외관 아주 수려함 / 선유도역 대로변 위치하여 사무실 임차수요 풍부하여 안정적 임대수익 기대됨 / 현재 지하1층 공실상태`,
      brokerHighlight: '대로변, 초역세권 (9호선 선유도역 1분)',
      vacancy: '~10%',
      leases: [
        { floor: '10F', tenant: '운동시설', dep: 4300, rent: 459, mgmt: 51, start: '2022-10-01', end: '2024-09-30', state: '임대중', note: '후불, 말일' },
        { floor: '9F (2)', tenant: '사무실', dep: 3000, rent: 300, mgmt: 43, start: '2023-12-01', end: '2025-11-30', state: '임대중', note: '후불, 말일' },
        { floor: '9F (1)', tenant: '스튜디오렌탈', dep: 2000, rent: 199, mgmt: 22, start: '2023-11-01', end: '2025-10-31', state: '임대중', note: '후불, 말일' },
        { floor: '8F', tenant: '사무실', dep: 5000, rent: 560, mgmt: 80, start: '2023-09-08', end: '2025-09-07', state: '임대중', note: '후불, 말일' },
        { floor: '7F', tenant: '사무실', dep: 5000, rent: 588, mgmt: 62, start: '2023-10-04', end: '2025-10-03', state: '임대중', note: '후불, 말일' },
        { floor: '6F', tenant: '사무실', dep: 4000, rent: 483, mgmt: 69, start: '2024-03-01', end: '2026-02-28', state: '임대중', note: '후불, 말일' },
        { floor: '5F', tenant: '사무실', dep: 5700, rent: 528, mgmt: 66, start: '2022-05-30', end: '2024-05-29', state: '임대중', note: '후불, 말일' },
        { floor: '4F', tenant: '사무실', dep: 5000, rent: 440, mgmt: 55, start: '2022-06-30', end: '2024-06-29', state: '임대중', note: '후불, 말일' },
        { floor: '3F', tenant: '치과', dep: 7000, rent: 310, mgmt: 53, start: '2022-11-01', end: '2024-10-31', state: '임대중', note: '후불, 말일' },
        { floor: '2F', tenant: '미용실', dep: 5000, rent: 540, mgmt: 60, start: '2024-02-22', end: '2026-02-21', state: '임대중', note: '후불, 말일' },
        { floor: '1F', tenant: '부동산', dep: 3500, rent: 250, mgmt: 15, start: '2023-11-11', end: '2025-11-11', state: '임대중', note: '후불, 말일' },
        { floor: 'B1', tenant: '', note: '후불, 말일' },
      ],
      totalsOverride: { deposit: 53500, rent: 5017 },
    },
  },
  defects: [
    ['소재지 오기', '표지 "서울시 강남구 양평동4가"', '영등포구 (본문 위치·PNU 일치)', 'as-is: memo에 강남구 유지 → 생성 IM에 강남구가 나오면 실패'],
    ['요약 vs 임대현황 불일치', '요약 보증금 5억3,500만/임대료 5,017만/관리비 648만', '임대현황표 합계 49,500/4,657/576(만원) (차이 4,000/360/72 = B1 희망임대료 추정)', 'as-is: 바텀시트 53,500/5,017 + 렌트롤 49,500/4,657 → 불일치 경고 관찰'],
    ['수익률 공란', '"수익률 %"', '2.28% (4,657×12 ÷ (2,500,000−49,500))', '-'],
    ['임대현황 이미지', '표가 이미지(image8.png)로만 존재, 면적 없음', '판독 전사 + 건축물대장 층별 면적(공부). 9F 분할 면적은 월세 비례(가정)', 'as-is: 면적 공란'],
    ['만료 계약 다수', '계약기간 2022~2026, 작성일 미표기', 'IM 작성 2024-04 추정 → +30개월 일괄 이동', 'as-is: 원본 날짜(2024~2025 만료 다수)'],
    ['대지 평 환산', '518.7㎡ (157평)', '156.9평 (518.7×0.3025)', '-'],
    ['건물명 불일치', 'IM 더레드빌딩', '대장 건물명 선유테라피스타워 (메모는 더레드빌딩 유지)', '-'],
    ['다필지', '117, 134, 125-2 (3필지)', '필지별 PNU 해소 확인(P0). 대장 대지면적 518.7은 3필지 합산값', '-'],
    ['기존 p5 골든과 상이', 'docs/golden-test-data/p5 렌트롤은 원본 IM과 다른 임차 구성(카페·IT 등)', '본 세트(ig4)를 원본 기준으로 대체. p5는 레거시로 유지', '-'],
  ],
  expected: {
    corrected: { totals: { deposit: 49500, rent: 4657 }, capRatePct: 2.28, floors: ['B1', '1F', '2F', '3F', '4F', '5F', '6F', '7F', '8F', '9F', '10F'], keywords: ['양평', '250억', '선유도역'], areaMode: 'lease', contractGroupFollowers: 0, ownerUseRows: 0, vacantRows: 1, mustNotInclude: ['강남구'] },
    'as-is': { totals: { deposit: 53500, rent: 5017 }, floors: ['1F', '2F', '3F', '10F'], keywords: ['양평', '250억'], mustNotInclude: ['강남구'], observations: ['바텀시트 합계(53,500/5,017) vs 렌트롤 합계(49,500/4,657) 불일치 경고', '만료 계약(2024~2025) 만기 표기·WALE 처리', '면적 없는 렌트롤 처리', '사진 1장 → 갤러리 축소/생략'] },
  },
};

export const GOLDEN_SPECS = [ig1, ig2, ig3, ig4];
