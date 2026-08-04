export function enforceFloorAreaRatio(data: {aboveGround: number, total: number}): {rows: [string, string, string][], note: string} {
  return {
    rows: [
      ['지상', data.aboveGround.toString(), '㎡'],
      ['전체', data.total.toString(), '㎡'],
      ['용적률 산정용', data.aboveGround.toString(), '㎡']
    ],
    note: '* 용적률은 지상 연면적을 기준으로 산정'
  };
}

export function enforceCapRateLabel(basis: string): string {
  switch (basis.toLowerCase()) {
    case 'noi': return 'NOI Cap Rate';
    case 'ncf': return 'NCF Cap Rate';
    case 'gop': return 'GOP Cap Rate';
    default: return 'Cap Rate';
  }
}

export function validateGopPlacement(hasGop: boolean, hasNoi: boolean): {valid: boolean, warning?: string} {
  if (hasGop && !hasNoi) {
    return { valid: false, warning: 'NOI without GOP is misleading' };
  }
  return { valid: true };
}

export function enforceLeaseLaw(leases: {unit: string, use: string, law?: string}[]): {unit: string, use: string, law: string}[] {
  return leases.map(lease => ({
    ...lease,
    law: lease.law || '확인 중'
  }));
}

export function computeTableTotal(values: number[]): number {
  return values.reduce((sum, val) => sum + (val || 0), 0);
}

export function enforceDeficiency(value: any, label: string): string {
  if (value === null || value === undefined || value === '') {
    return '확인 중';
  }
  return String(value);
}

export function enforceRentCeiling(current: number, planned: number, legalMax: number): {display: string, note: string} {
  if (planned > legalMax) {
    return {
      display: legalMax.toString(),
      note: `* 임대료 상한선 초과로 법적 최대치인 ${legalMax} 적용`
    };
  }
  return {
    display: planned.toString(),
    note: ''
  };
}
