/**
 * IM 제목/서브제목/핵심 투자 포인트 생성을 위한 골든셋 (Few-shot Examples)
 * 
 * 대한민국 상업용 부동산(CRE) 투자설명서(IM) 업계의 표준 문체와 어조를 반영합니다.
 * - 간결하고 임팩트 있는 헤드라인 스타일
 * - 핵심 투자 포인트를 앞세우는 구조
 * - 지역·자산 유형·가격대가 자연스럽게 녹아든 표현
 * - "~추정", "~계열" 등 분석적/기계적 어투 지양
 * 
 * Usage:
 *   import { IM_TITLE_GOLDEN_SET, getGoldenExamplesForAssetType } from '@/lib/ai/im-title-golden-set';
 */

export interface IMTitleExample {
  /** 자산 유형 카테고리 */
  assetType: string;
  /** IM 제목 (blindName 대체) */
  title: string;
  /** 서브제목 — 핵심 투자 하이라이트 헤드카피 */
  subtitle: string;
  /** 핵심 투자 포인트 (1~2문장) */
  keyInvestmentPoint: string;
  /** 맥락 설명 (학습용) */
  context?: string;
}

/**
 * 범용 골든셋 — 20개 예시
 * 자산 유형별로 다양한 CRE IM 문체를 포괄합니다.
 */
export const IM_TITLE_GOLDEN_SET: IMTitleExample[] = [
  // ── 꼬마빌딩 (6) ──
  {
    assetType: '꼬마빌딩',
    title: '강남역 초역세권 프라임 꼬마빌딩 매각',
    subtitle: '연 수익률 5.2% · 공실 Zero · 장기 임차 기반 안정 수익형',
    keyInvestmentPoint: '강남역 도보 3분 초역세권 대로변 코너 입지로, 1층 프랜차이즈 포함 전층 만실 운영 중이며 연 5.2% 안정 수익과 중장기 밸류애드 잠재력을 동시에 갖춘 투자 적격 자산입니다.',
    context: '강남 핵심 상권, 만실, 수익형',
  },
  {
    assetType: '꼬마빌딩',
    title: '성수동 카페거리 핵심 입지 꼬마빌딩',
    subtitle: '리모델링 밸류애드 · 1층 F&B 프리미엄 · 시세 대비 저평가',
    keyInvestmentPoint: '성수동 카페거리 메인 동선 상 1층 코너 입지로, 리모델링을 통한 임대료 상향 및 자산가치 제고가 기대되는 밸류애드형 투자 기회입니다.',
    context: '성수동, 밸류애드, 저평가',
  },
  {
    assetType: '꼬마빌딩',
    title: '서초 법조타운 대로변 수익형 빌딩',
    subtitle: 'Cap Rate 4.8% · 우량 법무법인 장기 임차 · 공실 리스크 최소',
    keyInvestmentPoint: '서초 법조타운 대로변 가시성 확보 입지에 우량 법무법인이 5년 이상 장기 임차 중이며, 임대차 안정성과 자산가치 상승을 동시에 누릴 수 있는 수익형 자산입니다.',
    context: '서초, 법조타운, 안정 임차',
  },
  {
    assetType: '꼬마빌딩',
    title: '홍대입구역 신축급 리테일 빌딩 매각',
    subtitle: '신축 3년 · 1층 글로벌 SPA 입점 · MZ 상권 프리미엄',
    keyInvestmentPoint: '홍대 메인 상권 핵심 동선에 위치한 신축급 빌딩으로, 1층 글로벌 SPA 브랜드 장기 임차가 확정되어 있어 안정 수익과 상권 프리미엄을 동시에 향유할 수 있습니다.',
    context: '홍대, 신축, 리테일',
  },
  {
    assetType: '꼬마빌딩',
    title: '을지로 도심권 리노베이션 투자 기회',
    subtitle: '토지 효율 극대화 · 용적률 잔여분 확보 · 재건축 시 프리미엄',
    keyInvestmentPoint: '을지로 도심 핵심 입지에 용적률 잔여분이 충분하여, 리노베이션 또는 재건축을 통한 자산가치 극대화가 가능한 장기 투자 기회입니다.',
    context: '을지로, 용적률, 재건축',
  },
  {
    assetType: '꼬마빌딩',
    title: '판교 테크노밸리 인근 오피스 빌딩',
    subtitle: 'IT 기업 100% 임차 · NOI 4.2억 · 공실률 0%',
    keyInvestmentPoint: '판교 테크노밸리 배후 수요를 기반으로 IT/스타트업 기업이 전층 임차 중인 안정 수익형 자산으로, 판교 오피스 시장 성장에 따른 임대료 상승 여력이 큽니다.',
    context: '판교, IT 수요, 만실',
  },

  // ── 오피스빌딩 (4) ──
  {
    assetType: '오피스빌딩',
    title: '여의도 IFC 인접 프라임 오피스 매각',
    subtitle: 'A급 오피스 · 전층 기관 임차 · WALE 5.2년 잔존',
    keyInvestmentPoint: '여의도 금융 중심지 IFC 인접 A급 오피스로, 주요 금융기관 장기 임차 계약(WALE 5.2년)이 확보되어 안정적인 현금흐름과 자산가치 보전이 가능합니다.',
    context: '여의도, A급, 기관 임차',
  },
  {
    assetType: '오피스빌딩',
    title: 'GBD 역삼 프라임 오피스 블라인드 매각',
    subtitle: '연면적 3,000평 · Grade A · 리모델링 완료',
    keyInvestmentPoint: '강남 GBD 핵심 구간에 위치한 리모델링 완료 프라임 오피스로, 최신 스펙 업그레이드를 통해 임대 경쟁력이 크게 향상된 투자 적격 자산입니다.',
    context: 'GBD, 리모델링 완료, 프라임',
  },
  {
    assetType: '오피스빌딩',
    title: '광화문 도심권 랜드마크 오피스 지분 매각',
    subtitle: '임대율 97% · 신용등급 AA 이상 임차인 · 10Y DCF 양호',
    keyInvestmentPoint: '광화문 도심 핵심 입지의 랜드마크 오피스 지분 투자 기회로, AA급 이상 우량 임차인 기반의 안정 수익과 도심 프리미엄 자산가치를 동시에 확보할 수 있습니다.',
    context: '광화문, 지분 매각, AA 임차인',
  },
  {
    assetType: '오피스빌딩',
    title: '분당 정자동 IT밸리 중소형 오피스',
    subtitle: 'IT 클러스터 배후 수요 · 대중교통 허브 · 합리적 매입가',
    keyInvestmentPoint: '분당 정자동 IT 클러스터 중심에 위치하여 안정적 임차 수요가 확보되며, 합리적 매입가 대비 높은 수익률이 기대되는 중소형 오피스 투자 기회입니다.',
    context: '분당, 중소형, IT 수요',
  },

  // ── 물류센터 (3) ──
  {
    assetType: '물류센터',
    title: '이천 물류단지 A급 풀필먼트 센터 매각',
    subtitle: '이커머스 3PL 10년 장기 임차 · NOI 28억 · Triple Net',
    keyInvestmentPoint: '이천 물류 허브 핵심 입지에 대형 이커머스 3PL 업체가 10년 장기 Triple Net 계약으로 임차 중이며, 연 NOI 28억의 안정적 현금흐름을 제공하는 프라임 물류 자산입니다.',
    context: '이천, 3PL, 장기 임차',
  },
  {
    assetType: '물류센터',
    title: '용인 처인 신축 상온·저온 복합 물류센터',
    subtitle: '준공 1년 · 냉동·냉장 겸용 · 수도권 남부 Last Mile',
    keyInvestmentPoint: '수도권 남부 Last Mile 거점의 신축 상온·저온 복합 물류센터로, 냉동·냉장 겸용 설비를 갖추어 식품·제약 물류 수요에 대응 가능한 차별화된 투자 기회입니다.',
    context: '용인, 신축, 콜드체인',
  },
  {
    assetType: '물류센터',
    title: '인천 남동 산업단지 내 물류 창고 매각',
    subtitle: 'Sale & Leaseback · 제조업체 15년 임차 확약 · 수익률 7.1%',
    keyInvestmentPoint: '인천 남동 산업단지 내 제조업체와 15년 장기 Sale & Leaseback 계약이 체결된 물류 창고로, 연 7.1%의 높은 수익률과 장기 임차 안정성을 동시에 확보한 자산입니다.',
    context: '인천, S&LB, 고수익',
  },

  // ── 상가·근린생활시설 (3) ──
  {
    assetType: '근린생활시설',
    title: '강남 신사동 가로수길 메인 상가 매각',
    subtitle: '1층 글로벌 브랜드 · 보증금 15억 · 월세 4,200만',
    keyInvestmentPoint: '가로수길 메인 동선 1층 코너에 글로벌 패션 브랜드가 장기 임차 중이며, 월 4,200만 원의 안정 임대 수익과 가로수길 상권 프리미엄을 동시에 누릴 수 있는 프라임 상가입니다.',
    context: '가로수길, 1층, 글로벌 브랜드',
  },
  {
    assetType: '근린생활시설',
    title: '중구 을지로 도심 수익형 근생 빌딩',
    subtitle: '실사용 + 임대 겸용 · 역세권 코너 · 밸류애드 가능',
    keyInvestmentPoint: '을지로 역세권 코너 입지의 근린생활시설로, 실사용과 임대를 겸용할 수 있으며 리모델링을 통한 임대료 상향 잠재력이 높은 밸류애드형 투자 기회입니다.',
    context: '을지로, 겸용, 밸류애드',
  },
  {
    assetType: '상가',
    title: '잠실 롯데월드타워 배후 1층 상가 매각',
    subtitle: '유동인구 일 5만명 · 1층 독점 상가 · 프랜차이즈 장기 임차',
    keyInvestmentPoint: '잠실 롯데월드타워 배후 유동인구 밀집 지역의 1층 독점 상가로, 대형 프랜차이즈 장기 임차가 확정되어 공실 리스크가 극소화된 안정 수익형 자산입니다.',
    context: '잠실, 유동인구, 프랜차이즈',
  },

  // ── 호텔·숙박 (2) ──
  {
    assetType: '호텔',
    title: '명동 관광특구 비즈니스 호텔 매각',
    subtitle: 'OCC 85% · ADR 12만원 · 관광 수요 회복세',
    keyInvestmentPoint: '명동 관광특구 핵심 입지의 비즈니스 호텔로, 관광 수요 회복에 따른 OCC 85% 달성 및 ADR 상승 추세가 확인되어 운영 수익과 자산가치 동반 성장이 기대됩니다.',
    context: '명동, 호텔, 관광 회복',
  },
  {
    assetType: '호텔',
    title: '제주 중문 리조트 호텔 인수 기회',
    subtitle: '해변 접근성 · 객실 150실 · 부대시설 완비',
    keyInvestmentPoint: '제주 중문관광단지 내 해변 직접 접근 가능한 리조트 호텔로, 객실 150실과 부대시설을 완비하여 리브랜딩 또는 컨버전을 통한 자산가치 극대화가 가능합니다.',
    context: '제주, 리조트, 컨버전',
  },

  // ── 기타 (2) ──
  {
    assetType: '지식산업센터',
    title: '가산디지털단지 지식산업센터 통매각',
    subtitle: '분양률 98% · IT·제조 혼합 · 관리비 대비 경쟁 우위',
    keyInvestmentPoint: '가산디지털단지 역세권 지식산업센터로, IT·제조업 기반 98% 분양 완료 및 안정적 관리 수입이 확보된 통매각 투자 기회입니다.',
    context: '가산, 지산, 통매각',
  },
  {
    assetType: '토지',
    title: '강남 개포동 재건축 정비구역 내 토지 매각',
    subtitle: '재건축 조합 설립 인가 · 용적률 300% · 개발이익 기대',
    keyInvestmentPoint: '강남 개포동 재건축 정비구역 내 토지로, 조합 설립 인가가 완료되어 재건축 추진에 따른 개발이익 실현이 기대되는 장기 투자 자산입니다.',
    context: '강남, 재건축, 개발이익',
  },
];

/**
 * 특정 자산 유형에 맞는 골든셋 예시를 반환합니다.
 * 매칭되는 예시가 없으면 전체 골든셋에서 랜덤 3개를 반환합니다.
 */
export function getGoldenExamplesForAssetType(assetType: string, count = 3): IMTitleExample[] {
  const matched = IM_TITLE_GOLDEN_SET.filter(
    (ex) => assetType && ex.assetType.includes(assetType.replace(/\\s/g, ''))
  );
  if (matched.length >= count) return matched.slice(0, count);
  if (matched.length > 0) return matched;
  // Fallback: 랜덤 3개
  const shuffled = [...IM_TITLE_GOLDEN_SET].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * 프롬프트에 삽입할 포맷된 few-shot 텍스트를 생성합니다.
 */
export function formatGoldenSetForPrompt(examples: IMTitleExample[]): string {
  return examples
    .map(
      (ex, i) =>
        `예시 ${i + 1} (${ex.assetType}):\\n` +
        `  제목: ${ex.title}\\n` +
        `  서브제목: ${ex.subtitle}\\n` +
        `  핵심 투자 포인트: ${ex.keyInvestmentPoint}`
    )
    .join('\\n\\n');
}
