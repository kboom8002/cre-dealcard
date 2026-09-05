export interface ContentSectionPlan {
  sectionType: string;
  title: string;
  order: number;
}

export function executeM10ContentPlan(targetLevel: 'L1' | 'L1.5'): ContentSectionPlan[] {
  const plan: ContentSectionPlan[] = [
    { sectionType: 'property_overview', title: '부동산 개요', order: 1 },
    { sectionType: 'financial_summary', title: '재무 및 수익 분석', order: 2 },
    { sectionType: 'lease_status', title: '임대차 현황', order: 3 },
  ];

  if (targetLevel === 'L1.5') {
    plan.push(
      { sectionType: 'investment_thesis', title: '투자 핵심 전략', order: 4 },
      { sectionType: 'risk_check', title: '리스크 및 권리관계 점검', order: 5 }
    );
  }

  plan.push({ sectionType: 'disclaimer', title: '유의사항 및 면책고지', order: 6 });

  return plan.sort((a, b) => a.order - b.order);
}
