import type { TestCaseSpec } from './case01-seocho-medical';

export const CASE_06_SPEC: TestCaseSpec = {
  caseId: 'case06_yongsan_mixed',
  name: '용산 용리단길 복합구옥 (엣지 표준)',
  posture: 'trading' as any,
  archetype: 'TR-01',
  building: {
    area_signal: '용산권역',
    asset_type: '복합구옥',
    price_band: '43억',
  },
  broker: {
    display_name: '최유나 팀장',
    company_name: '용산 마스터스',
    phone: '010-4433-8822',
    specialty: '용산·한남 소형 꼬마빌딩 전문',
  },
  doc: {
    title: '용산 용리단길 꼬마빌딩 복합구옥 매각 제안서',
    body: {
      photos: [
        { url: '/test-images/01_exterior.jpg', type: 'exterior', label: '구옥 외관', caption: '용리단길 메인 동선 이면 코너 구옥', order: 1 },
      ],
      heroCard: {
        askingPriceDisplay: '43억 원',
        equityRequiredBil: 18.0,
        posture: 'trading',
        landAreaM2: 159.3,
        totalGrossAreaM2: 259.5,
        zoning: '제2종일반주거지역',
      },
    },
    sections: [
      {
        title: '물건 개요',
        section_type: 'property_overview',
        markdown: `### 용리단길 핫플레이스 중심 코너 복합 구옥
- **위치**: 서울특별시 용산구 원효로1가 41-10
- **대지면적**: 48.2평 (159.3㎡)
- **연면적**: 78.5평 (259.5㎡)
- **건축규모**: 지하 1층 ~ 지상 2층 (단독주택+상가 복합구조)
- **현재 상태**: 전층 명도 100% 완료 (올근생 대수선 즉시 착공 가능)
- **매매가**: 43억 원 (평당 8,920만 원)`,
      },
      {
        title: '입지 및 상권',
        section_type: 'location_access',
        markdown: `### 삼각지역·신용산역 더블역세권 및 용리단길 메인 축
- **대중교통**: 지하철 4·6호선 삼각지역 도보 4분
- **상권 동선**: 아모레퍼시픽, 하이브, BTS 본사 직장인 유입 동선
- **주변 환경**: 감성 카페, 트렌디 비스트로 밀집 골목 상권`,
      },
      {
        title: '시장 포지션 (Market Position)',
        section_type: 'market_position',
        markdown: `### 40억대 소액 투자로 용산 핵심 상권 진입
- **현재 현황**: 주택 복합 구조로 임대 수익 미미
- **대수선 플랜**: 1F F&B 와인바 + 2F 디자인 스튜디오 올근생 전환
- **예상 임대료**: 대수선 후 보증금 1.5억 / 월 1,200만 원 (연 수익률 4.1% 달성)`,
      },
      {
        title: '비교 사례 (Comps)',
        section_type: 'comparable_analysis',
        markdown: `### 용리단길 구옥 리모델링 실거래 사례 비교
| 구분 | 본건(예상) | 인근 A구옥 | 인근 B구옥 |
|---|---|---|---|
| 대지(평) | 48.2평 | 42.5평 | 51.0평 |
| 매각가 | 55억(목표) | 50억(23년) | 62억(24년) |
| 평당가 | 1억 1,410만 | 1억 1,760만 | 1억 2,150만 |
| 층수 | 지하1~지상3층 | 지상2층 | 지상3층 |`,
      },
      {
        title: '리스크 점검',
        section_type: 'risk_check',
        markdown: `| 리스크 영역 | 진단 현황 | 완화 방안 및 대응책 |
|---|---|---|
| **용도변경 리스크** | 단독주택 ➔ 제2종근생 | 용산구청 건축과 사전 용도변경 타당성 검토 완료 |
| **명도 리스크** | 100% 명도 완료 | 계약 즉시 잔금 및 착공 가능 (명도 마찰 0건) |
| **정화조 용량** | 15인조 기포식 | F&B 입점 대비 30인조 증설 인허가 도면 반영 |`,
      },
      {
        title: '투자 논거 (Thesis)',
        section_type: 'investment_thesis',
        markdown: `### 40억대 용산 입성 및 올근생 가치 극대화
1. **진입장벽 해소**: 40억대 소액으로 용산 핵심 역세권 토지 선점
2. **명도 리스크 제로**: 전층 공실 명도 완료로 신속한 밸류애드 착공
3. **용도변경 프리미엄**: 올근생 대수선 시 자산가치 55억 원 이상 증대
4. **개발 호재 수혜**: 용산국제업무지구 및 용산민족공원 인접 중장기 시세차익`,
      },
      {
        title: '표기 기준 및 면책',
        section_type: 'next_steps',
        markdown: `본 자료는 구옥 밸류애드 검토용 요약서이며, 용도변경 검토서 및 대수선 가설계안은 현장 미팅 시 열람 가능합니다.`,
      },
    ],
  },
};
