import type { TestCaseSpec } from './case01-seocho-medical';

export const CASE_04_SPEC: TestCaseSpec = {
  caseId: 'case04_sinsa_value_add',
  name: '신사동 가로수길 밸류애드 (밸류애드 표준)',
  posture: 'trading' as any,
  archetype: 'TR-01',
  building: {
    area_signal: '강남권역',
    asset_type: '노후빌딩',
    price_band: '98억',
  },
  broker: {
    display_name: '정현우 팀장',
    company_name: '가로수 파트너스',
    phone: '010-5544-9911',
    specialty: '강남 리모델링 및 밸류애드 전문',
  },
  doc: {
    title: '신사동 가로수길 노후빌딩 리모델링 밸류애드 제안서',
    body: {
      photos: [
        { url: '/test-images/01_exterior.jpg', type: 'exterior', label: '건물 외관', caption: '가로수길 이면 코너 노후 근생', order: 1 },
      ],
      heroCard: {
        askingPriceDisplay: '98억 원',
        equityRequiredBil: 42.0,
        posture: 'trading',
        landAreaM2: 338.2,
        totalGrossAreaM2: 712.1,
        zoning: '제2종일반주거지역',
      },
    },
    sections: [
      {
        title: '물건 개요',
        section_type: 'property_overview',
        markdown: `### 가로수길 패션·리테일 핵심 이면 노후 빌딩
- **위치**: 서울특별시 강남구 신사동 534-11
- **대지면적**: 102.3평 (338.2㎡)
- **연면적**: 215.4평 (712.1㎡)
- **건축규모**: 지하 1층 ~ 지상 4층
- **현재 용적률**: 165% (법정 200% 대비 35%p 증축 여력 보유)
- **매매가**: 98억 원 (평당 9,580만 원)`,
      },
      {
        title: '입지 및 상권',
        section_type: 'location_access',
        markdown: `### 3호선·신분당선 신사역세권 및 가로수길 핫플레이스
- **교통망**: 신사역(3호선·신분당선 더블역세권) 도보 6분
- **상권 특성**: 글로벌 플래그십 스토어 및 트렌디 F&B 집결지
- **유동 인구**: 2030 MZ 및 외국인 관광객 일평균 유동인구 6만명`,
      },
      {
        title: '시장 포지션 (Market Position)',
        section_type: 'market_position',
        markdown: `### 리모델링 전후 임대료 및 자산가치 퀀텀 점프
- **현재 현황**: 노후 임차 구성으로 월 임대료 1,100만 원 (연 순수익률 1.3%)
- **밸류애드 후**: 외관 커튼월 교체 + 1개층 수직 증축 시 월 2,600만 원 달성 가능
- **자산가치 상승**: 리모델링 투자비 12억 투입 후 자산가치 135억 원으로 증대`,
      },
      {
        title: '비교 사례 (Comps)',
        section_type: 'comparable_analysis',
        markdown: `### 인근 리모델링 밸류애드 실거래 및 임대 시세 비교
| 구분 | 본건(예상) | 인근 A사례 | 인근 B사례 |
|---|---|---|---|
| 대지(평) | 102.3평 | 95.0평 | 110.2평 |
| 매각가 | 135억(목표) | 130억(23년) | 152억(24년) |
| 평당가 | 1억 3,190만 | 1억 3,680만 | 1억 3,790만 |
| 월 임대료 | 2,600만 | 2,450만 | 2,800만 |`,
      },
      {
        title: '리스크 점검',
        section_type: 'risk_check',
        markdown: `| 리스크 영역 | 진단 현황 | 완화 방안 및 대응책 |
|---|---|---|
| **명도 리스크** | 기존 4개 임차인 잔여계약 | 3개사 만기 도래 및 1개사 명도 합의금 사전 산정 완료 |
| **구조 안전성** | 1994년 준공 조적조/라멘 | 정밀구조안전진단 통과 및 탄소섬유 보강 설계 반영 |
| **공사 기간** | 약 6개월 소요 예상 | 비수기(동절기 전) 착공 및 사전 임차의향서(LOI) 확보 |`,
      },
      {
        title: '투자 논거 (Thesis)',
        section_type: 'investment_thesis',
        markdown: `### 잔여 용적률 증축 및 리모델링 극대화 전략
1. **임대수익 2.3배 증대**: 노후 근생을 트렌디 F&B/쇼룸으로 탈바꿈하여 월세 2,600만 원 확보
2. **잔여 용적률 증축**: 법정 용적률 대비 35%p 추가 증축으로 실사용 면적 극대화
3. **가로수길 상권 회복**: 신분당선 연장 및 해외 관광객 유입으로 매매 호가 지속 상승
4. **단기 엑시트 용이**: 밸류애드 완료 후 법인 사옥 또는 리테일 펀드 매각 추진`,
      },
      {
        title: '표기 기준 및 면책',
        section_type: 'next_steps',
        markdown: `본 자료는 리모델링 밸류애드 투자 검토용 요약서이며, 구조안전진단서 및 리모델링 가견적서는 실사 시 제공됩니다.`,
      },
    ],
  },
};
