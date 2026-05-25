export interface SnapshotValidationResult {
  passed: boolean;
  violations: string[];
}

export function validateSnapshotOutput(obj: any): SnapshotValidationResult {
  const violations: string[] = [];

  const sensitiveBrands = [
    '스타벅스', 'Starbucks', '블루보틀', 'Blue Bottle', '맥도날드', '올리브영', 
    '다이소', '투썸플레이스', '투썸', '할리스', '이디야', '커피빈', '서브웨이', '버거킹', '배스킨라빈스'
  ];

  const definitiveWords = ['확정', '보장', '확약', '정확히'];

  function walk(value: any, keyName?: string) {
    if (keyName === 'boundary_disclaimer') return;

    if (typeof value === 'string') {
      // Check brand names
      for (const brand of sensitiveBrands) {
        if (value.includes(brand)) {
          if (!violations.includes('tenant_name_detected')) {
            violations.push('tenant_name_detected');
          }
        }
      }

      // Check definitive claims
      for (const word of definitiveWords) {
        if (value.includes(word)) {
          if (!violations.includes('definitive_financial_claim')) {
            violations.push('definitive_financial_claim');
          }
        }
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, keyName);
      }
    } else if (value !== null && typeof value === 'object') {
      for (const k of Object.keys(value)) {
        walk(value[k], k);
      }
    }
  }

  walk(obj);

  return {
    passed: violations.length === 0,
    violations,
  };
}
