import type { TestCaseSpec } from './case01-seocho-medical';

export const CASE_03_SPEC: TestCaseSpec = {
  caseId: 'case03_yeoksam_dev',
  name: '역삼 테헤란로 신축부지 (개발형 표준)',
  posture: 'development' as any,
  archetype: 'DEV-01',
  building: {
    area_signal: '강남권역',
    asset_type: '신축부지',
    price_band: '210억',
  },
  broker: {
    display_name: '김태진 본부장',
    company_name: '테헤란 디벨로퍼스',
    phone: '010-3322-7788',
    specialty: '강남권역 상업용 개발부지 전문',
  },
  doc: {
    title: '역삼 테헤란로 복합 신축부지 개발 제안서',
    body: {
      photos: [
        { url: '/test-images/01_exterior.jpg', type: 'exterior', label: '부지 전경', caption: '테헤란로 이면 코너 신축 부지', order: 1 },
      ],
      heroCard: {
        askingPriceDisplay: '210억 원',
        equityRequiredBil: 85.0,
        posture: 'development',
        landAreaM2: 557.0,
        totalGrossAreaM2: 2247.9,
        zoning: '제3종일반주거지역',
      },
    },
    sections: [
      {
        title: '물건 개요',
        section_type: 'property_overview',
        markdown: `### 역삼동 테헤란로 이면 코너 신축 부지
- **위치**: 서울특별시 강남구 역삼동 735-8
- **대지면적**: 168.5평 (557.0㎡)
- **용도지역**: 제3종일반주거지역 (법정 용적률 250%)
- **도로접면**: 8m × 6m 코너 부지 (일조권 사선제한 유리)
- **매매가**: 210억 원 (평당 1억 2,460만 원)
- **현재 상태**: 단층 구옥 100% 명도 완료 (즉시 착공 가능)`,
      },
      {
        title: '입지 및 상권',
        section_type: 'location_access',
        markdown: `### 테헤란 밸리 중심 오피스 배후 거점
- **교통 접근성**: 2호선 역삼역 도보 3분 초역세권
- **도로망**: 테헤란로, 언주로, 논현로 직결 차량 접근성 우수
- **개발 환경**: 인근 센터필드 및 IT 스타트업 신사옥 밀집 수요 폭발`,
      },
      {
        title: '토지 상세 (Land Detail)',
        section_type: 'site_analysis',
        markdown: `### 8m 코너 장방형 대지로 건축 효율 극대화
- **형상/지세**: 평지 장방형 대지로 지하 굴착 효율 최상
- **건폐율/용적률**: 건폐율 50% / 용적률 250% (인센티브 적용 가능)
- **지하 개발성**: 지하 2층 주차 16대 및 근린생활시설 배치 최적`,
      },
      {
        title: '개발 개요 및 수지 분석 (Feasibility)',
        section_type: 'development_feasibility',
        markdown: `### 지하 2층 ~ 지상 7층 신축 연면적 680평 개발 계획
- **예상 공사비**: 평당 850만 원 (약 57.8억 원 소요)
- **총 사업비**: 약 285억 원 (토지비 210억 + 공사비/부대비용 75억)
- **준공 후 예상 가치**: 약 360억 원 (Cap Rate 4.2% 기준 매각 환산가)
- **예상 개발 마진**: 약 75억 원 (세전 개발 수익률 26.3%)`,
      },
      {
        title: '리스크 점검',
        section_type: 'risk_check',
        markdown: `| 리스크 영역 | 진단 현황 | 완화 방안 및 대응책 |
|---|---|---|
| **인허가 리스크** | 제3종일반주거지역 | 사전 건축심의 및 법정 인센티브 용적률 확보 계획 수립 |
| **공사비 변동성** | 원자재가 상승 | 책임준공 및 확정 도급계약(GMP) 방식 시공사 선정 |
| **분양/임대 리스크** | 오피스 공실률 1.2% | 준공 6개월 전 테크 기업 통임대(Master Lease) 사전 마케팅 |`,
      },
      {
        title: '투자 논거 (Thesis)',
        section_type: 'investment_thesis',
        markdown: `### 강남 핵심지 희소 코너 부지 가치 극대화
1. **입지 희소성**: 역삼역 도보 3분 테헤란로 핵심 배후 오피스 입지
2. **개발 마진 확보**: 신축 완료 시 세전 26.3% 개발 마진 실현 가능
3. **인허가 안전성**: 명도 완료 및 8m 코너로 건축 설계 제약 최소화
4. **유동성 프리미엄**: 준공 즉시 기관 및 프라이빗 바이어 통매각 용이`,
      },
      {
        title: '표기 기준 및 면책',
        section_type: 'next_steps',
        markdown: `본 자료는 개발 사업성 검토를 위한 요약 제안서이며, 가설계 도면 및 세부 수지분석표는 NDA 체결 후 제공됩니다.`,
      },
    ],
  },
};
