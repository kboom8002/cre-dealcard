import type { TestCaseSpec } from './case01-seocho-medical';

export const CASE_02_SPEC: TestCaseSpec = {
  caseId: 'case02_seongsu_hq',
  name: '성수 IT밸리 통사옥 (사옥형 표준)',
  posture: 'owner_occupied',
  archetype: 'OO-01',
  building: {
    area_signal: '성수권역',
    asset_type: '단독사옥',
    price_band: '135억',
  },
  broker: {
    display_name: '이지원 이사',
    company_name: '에이커스 중개법인',
    phone: '010-8877-2211',
    specialty: '성수·강남 통사옥 매입 컨설팅',
  },
  doc: {
    title: '성수 IT밸리 단독 통사옥 투자설명서',
    body: {
      photos: [
        { url: '/test-images/01_exterior.jpg', type: 'exterior', label: '사옥 외관', caption: '성수 IT밸리 지상 6층 단독 사옥', order: 1 },
      ],
      heroCard: {
        askingPriceDisplay: '135억 원',
        equityRequiredBil: 55.0,
        posture: 'owner_occupied',
        landAreaM2: 448.9,
        totalGrossAreaM2: 1693.8,
        zoning: '준공업지역',
      },
    },
    sections: [
      {
        title: '물건 개요',
        section_type: 'property_overview',
        markdown: `### 성수 IT밸리 신축급 단독 사옥
- **위치**: 서울특별시 성동구 성수동2가 277-33
- **대지면적**: 135.8평 (448.9㎡)
- **연면적**: 512.4평 (1,693.8㎡)
- **건축규모**: 지하 1층 ~ 지상 6층
- **준공연도**: 2021년 (신축급 인테리어 완비)
- **주차**: 자주식 10대 완비 / 엘리베이터 15인승 1대`,
      },
      {
        title: '입지 및 상권',
        section_type: 'location_access',
        markdown: `### IT·스타트업 클러스터 성수역세권
- **대중교통**: 지하철 2호선 성수역 3번 출구 도보 5분
- **도로망**: 성수이로, 강변북로, 올림픽대로 3분 진입
- **주변 환경**: 무신사, 크래프톤, SM엔터 등 IT·패션 선도기업 밀집지`,
      },
      {
        title: '사옥 활용 계획 (Plan)',
        section_type: 'occupancy_fit',
        markdown: `### 50~100인 IT/바이오 기업 최적화 공간
- **1F**: 라운지 & 쇼룸 & 방문객 응접실 (층고 4.5m)
- **2F~5F**: 개방형 오피스 (층당 실면적 60평, 층고 3.8m)
- **6F**: 임원실 및 이사회 회의실 + 프라이빗 테라스
- **B1F**: 타운홀 스튜디오 및 사내 피트니스
- **명도 상태**: 전층 명도 완료로 잔금 즉시 입주 가능`,
      },
      {
        title: '자가 vs 임차 비용 비교 (Vs Lease)',
        section_type: 'cost_comparison',
        markdown: `### 성수 권역 임차 대비 연간 2.8억 절감 효과
- **인근 50인 오피스 임차 시**: 연 임대료 약 4.2억 원 소요 (평당 월 8만원 기준)
- **자가 사옥 보유 시**: 금융비용 약 1.4억 원 (LTV 50%, 금리 4.0% 가정)
- **연간 절감액**: 약 2.8억 원 순비용 절감
- **10년 환산 보유 효과**: 약 35억 원 누적 자산 가치 상승 예상`,
      },
      {
        title: '리스크 점검',
        section_type: 'risk_check',
        markdown: `| 리스크 영역 | 진단 현황 | 완화 방안 및 대응책 |
|---|---|---|
| **명도 리스크** | 100% 명도 완료 | 계약 즉시 인테리어 공사 및 잔금일 입주 확정 |
| **물리적 상태** | 2021년 준공 (3년차) | 하자보수 기간 내 주요 설비 완벽 유지보수 완료 |
| **세무 리스크** | 취득세 중과 여부 | 본점 이전 감면 혜택 및 법인 취득세 검토 완료 |`,
      },
      {
        title: '투자 논거 (Thesis)',
        section_type: 'investment_thesis',
        markdown: `### 성장 기업의 브랜드 가치 극대화 & 자산화
1. **기업 브랜딩 독점**: 사옥 단독 명칭 표기(간판 설치권) 및 옥상 브랜딩 가능
2. **인재 채용 경쟁력**: 2030 핵심 인재 선호도 1위 성수동 핵심 입지
3. **부동산 자산화**: 임대료 지출을 기업 자산 증식으로 전환
4. **유연한 확장성**: 추후 성장 시 증축 또는 지점 분리 용이`,
      },
      {
        title: '표기 기준 및 면책',
        section_type: 'next_steps',
        markdown: `본 자료는 사옥 매입 검토를 위한 요약 투자설명서이며, 세부 도면 및 실사 보고서는 사전 미팅 시 제공됩니다.`,
      },
    ],
  },
};
