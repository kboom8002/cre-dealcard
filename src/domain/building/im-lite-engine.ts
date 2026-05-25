export interface ImLiteSection {
  sectionId: string;
  title: string;
  locked: boolean;
  required: boolean;
}

export interface ImLitePlanResult {
  eligible: boolean;
  reason?: string;
  sections: ImLiteSection[];
}

export function planImLiteSections({
  completenessScore,
  availableLayers
}: {
  completenessScore: number;
  availableLayers?: string[];
}): ImLitePlanResult {
  if (completenessScore < 80) {
    return {
      eligible: false,
      reason: 'completeness_insufficient',
      sections: [],
    };
  }

  // If completeness is 80+ and no layers are provided, assume none are available (lock conditional ones)
  // If completeness is 100 and no layers provided, assume all are available
  const defaultLayers = completenessScore === 100 ? ['rent_roll'] : [];
  const layers = availableLayers || defaultLayers;

  const sections: ImLiteSection[] = [
    { sectionId: '01_summary', title: 'Executive Summary', locked: false, required: true },
    { sectionId: '02_property_overview', title: 'Property Overview', locked: false, required: true },
    { sectionId: '03_location_analysis', title: 'Location Analysis', locked: false, required: true },
    { sectionId: '04_building_specs', title: 'Building Specs', locked: false, required: true },
    { sectionId: '05_tenant_mix', title: 'Tenant Mix', locked: !layers.includes('rent_roll'), required: true },
    { sectionId: '06_cash_flow', title: 'Cash Flow Ref', locked: !layers.includes('rent_roll'), required: true },
    { sectionId: '07_risk_factors', title: 'Risk Factors', locked: false, required: true },
    { sectionId: '08_next_steps', title: 'Next Steps', locked: false, required: true },
    { sectionId: '09_missing_data', title: 'Missing Data', locked: false, required: true },
    { sectionId: '10_disclaimer', title: 'Disclaimer', locked: false, required: true },
  ];

  return {
    eligible: true,
    sections,
  };
}

export function validateImLiteOutput({
  sectionId,
  content
}: {
  sectionId: string;
  content: string;
}): { passed: boolean; violations: string[] } {
  const violations: string[] = [];

  const sensitiveBrands = [
    '스타벅스', 'Starbucks', '블루보틀', 'Blue Bottle', '맥도날드', '올리브영', 
    '다이소', '투썸플레이스', '투썸', '할리스', '이디야', '커피빈', '서브웨이', '버거킹', '배스킨라빈스'
  ];

  const definitiveWords = ['확정', '보장', '확약', '정확히'];

  if (sectionId !== '10_disclaimer') {
    for (const brand of sensitiveBrands) {
      if (content.includes(brand)) {
        if (!violations.includes('tenant_name_detected')) {
          violations.push('tenant_name_detected');
        }
      }
    }

    for (const word of definitiveWords) {
      if (content.includes(word)) {
        if (!violations.includes('definitive_financial_claim')) {
          violations.push('definitive_financial_claim');
        }
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
