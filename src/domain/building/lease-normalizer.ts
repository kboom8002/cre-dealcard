import { LeaseTenant, LeaseSummaryLayer } from '@/types/database';

export function computeWALT(tenants: any[], refDate: Date = new Date()): number {
  let weightedSum = 0;
  let totalArea = 0;

  for (const t of tenants) {
    if (!t.contract_end || t.tenant_type === 'vacant') continue;

    const [year, month] = t.contract_end.split('-').map(Number);
    if (!year || !month) continue;

    const end = new Date(year, month - 1, 1);
    const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);

    // Calculate difference in months
    const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    const remaining = Math.max(0, diffMonths);

    weightedSum += remaining * t.area_sqm;
    totalArea += t.area_sqm;
  }

  if (totalArea === 0) return 0;
  return Number((weightedSum / totalArea).toFixed(1));
}

export interface LeaseSummaryOutput {
  publicLayer: Omit<LeaseSummaryLayer, 'gross_income_estimate' | 'tenants'> & {
    tenants: Omit<LeaseTenant, 'monthly_rent' | 'deposit' | 'tenant_name'>[];
    gross_income_estimate: null;
  };
  privateLayer: LeaseSummaryLayer;
}

export function buildLeaseSummaryFromInput(rawInput: any[]): LeaseSummaryOutput {
  const tenants: LeaseTenant[] = rawInput.map(t => ({
    floor: t.floor || '',
    area_sqm: Number(t.area_sqm) || 0,
    tenant_type: t.tenant_type || 'other',
    monthly_rent: t.monthly_rent !== undefined ? (t.monthly_rent === null ? null : Number(t.monthly_rent)) : null,
    deposit: t.deposit !== undefined ? (t.deposit === null ? null : Number(t.deposit)) : null,
    contract_end: t.contract_end || null,
    is_anchor: !!t.is_anchor,
    tenant_name: t.tenant_name || null,
  }));

  const totalArea = tenants.reduce((sum, t) => sum + t.area_sqm, 0);
  const vacantArea = tenants
    .filter(t => t.tenant_type === 'vacant' || !t.tenant_name)
    .reduce((sum, t) => sum + t.area_sqm, 0);

  const vacancy_rate = totalArea > 0 ? Number(((vacantArea / totalArea) * 100).toFixed(1)) : 0;
  const walt_months = computeWALT(tenants);

  // Estimate gross income (monthly rent sum * 12)
  const totalMonthlyRent = tenants.reduce((sum, t) => sum + (t.monthly_rent || 0), 0);
  const gross_income_estimate = totalMonthlyRent * 12;

  const publicTenants = tenants.map(t => {
    const { monthly_rent, deposit, tenant_name, ...rest } = t;
    return rest;
  });

  return {
    publicLayer: {
      tenants: publicTenants,
      walt_months,
      vacancy_rate,
      gross_income_estimate: null,
    },
    privateLayer: {
      tenants,
      walt_months,
      vacancy_rate,
      gross_income_estimate,
    },
  };
}
