import type { TestCaseSpec } from './case01-seocho-medical';

export const CASE_05_SPEC: TestCaseSpec = {
  caseId: 'case05_icheon_logistics',
  name: '이천 복합물류센터 (운영형 표준)',
  posture: 'operating' as any,
  archetype: 'OP-01',
  building: {
    area_signal: '이천권역',
    asset_type: '물류센터',
    price_band: '450억',
  },
  broker: {
    display_name: '강동원 상무',
    company_name: '로지스 파트너스',
    phone: '010-7766-3399',
    specialty: '수도권 상온·저온 복합물류센터 전문',
  },
  doc: {
    title: '이천 복합물류센터 우량 자산 매각 제안서',
    body: {
      photos: [
        { url: '/test-images/01_exterior.jpg', type: 'exterior', label: '센터 외관', caption: '지상 3층 복합온도 물류센터', order: 1 },
      ],
      heroCard: {
        askingPriceDisplay: '450억 원',
        capRateBase: 5.33,
        noiBaseBil: 24.0,
        equityRequiredBil: 180.0,
        posture: 'operating',
        landAreaM2: 9917.4,
        totalGrossAreaM2: 18181.8,
        zoning: '계획관리지역',
      },
    },
    sections: [
      {
        title: '물건 개요',
        section_type: 'property_overview',
        markdown: `### 경기도 이천시 마장면 복합온도 물류센터
- **위치**: 경기도 이천시 마장면 덕평리 450-12
- **대지면적**: 3,000평 (9,917.4㎡)
- **연면적**: 5,500평 (18,181.8㎡)
- **건축규모**: 지상 3층 (지하 없음)
- **준공연도**: 2020년 8월 (신축급 특A급 설비)
- **접안시설**: 도크 12개 / 도크레벨러 8개 완비 / 유효층고 12m`,
      },
      {
        title: '입지 및 상권',
        section_type: 'location_access',
        markdown: `### 수도권 1시간 이내 배송 핵심 로지스틱스 축
- **고속도로 접근성**: 영동고속도로 덕평IC 3.2km, 이천IC 4.5km
- **간선 도로망**: 42번 국도 직결, 중부고속도로 호법JC 5분 진입
- **물류 입지성**: 쿠팡, 마켓컬리, CJ 메가허브 인접 핵심 물류 벨트`,
      },
      {
        title: '운영 지표 (KPI Overview)',
        section_type: 'operation_overview',
        markdown: `### CJ대한통운 10년 장기 Master Lease 만실 운영
- **임대율(Occupancy)**: 100% (잔여 임대기간 6.5년 확정)
- **일평균 처리 물동량**: 대형 윙바디(11톤 이상) 일 120대 입출고
- **전력/냉동 설비**: 2,500kW 수전용량 및 친환경 복합온도 냉동기 가동`,
      },
      {
        title: '매출 및 수익 분석 (Revenue & GOP)',
        section_type: 'gop_analysis',
        markdown: `### 연 실질 영업이익(GOP) 24억 원 및 Cap Rate 5.33%
- **연간 임대 매출**: 28.8억 원 (월 2억 4,000만 원)
- **운영 관리비/제세공과금**: 연 4.8억 원
- **연간 실질 영업이익 (GOP)**: 24.0억 원
- **매매가 대비 연 순수익률**: 5.33% 확정 수익 창출`,
      },
      {
        title: '리스크 점검',
        section_type: 'risk_check',
        markdown: `| 리스크 영역 | 진단 현황 | 완화 방안 및 대응책 |
|---|---|---|
| **임차인 신용도** | 대기업 CJ대한통운 10년 계약 | 임대료 연체 이력 0건, 모기업 보증 완비 |
| **화재 안전성** | 1급 방화구획 및 ESFR 스프링클러 | 2024년 소방안전 특별점검 최우수 등급 획득 |
| **설비 노후화** | 2020년 준공 4년차 | 냉동콤프레셔 정기 유지보수 계약 체결 |`,
      },
      {
        title: '투자 논거 (Thesis)',
        section_type: 'investment_thesis',
        markdown: `### 수도권 핵심 물류 거점 및 연 5.33% 고수익
1. **임차 안정성**: 대기업 10년 장기 책임임차로 공실 리스크 완전 해소
2. **설비 경쟁력**: 12m 층고 및 냉동·냉장·상온 풀옵션 복합 스펙
3. **입지 희소성**: 영동·중부고속도로 직결 수도권 1시간 배송 축
4. **수익률 매력**: 연 순수익률 (Cap Rate) 5.33%의 우량 현금흐름`,
      },
      {
        title: '표기 기준 및 면책',
        section_type: 'next_steps',
        markdown: `본 자료는 물류센터 매입 검토를 위한 요약 제안서이며, 정밀 설비진단서 및 마스터리스 원본은 사전 인터뷰 시 열람 가능합니다.`,
      },
    ],
  },
};
