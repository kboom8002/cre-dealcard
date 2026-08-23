import { describe, it, expect } from 'vitest';
import { auditDeficiencies } from '../deficiency-ledger';
import type { LeaseRow } from '@/types/im-core';

describe('Deficiency Ledger Unit Tests', () => {
  it('clean data returns 0 deficiencies for standard income posture', () => {
    const cleanLeases: LeaseRow[] = [
      {
        unitLabel: '101',
        leaseAreaSqm: 100,
        leaseState: '임대중',
        firstContractDate: '2022-01-01',
        legalBasis: 'commercial',
        mgmtFeeKrw: 300000,
        monthlyRentKrw: 2000000,
        depositKrw: 50000000,
      },
    ];
    const deficiencies = auditDeficiencies({
      posture: 'income',
      leases: cleanLeases,
      financials: { opexKrw: 12000000 },
    });
    expect(deficiencies).toHaveLength(0);
  });

  it('detects missing firstContractDate and sets severity=block for development posture', () => {
    const leases: LeaseRow[] = [
      {
        unitLabel: '101',
        leaseAreaSqm: 100,
        leaseState: '임대중',
        legalBasis: 'commercial',
        mgmtFeeKrw: 300000,
      },
    ];
    const deficiencies = auditDeficiencies({
      posture: 'development',
      leases,
      physical: { farPct: 250, zoning: '제2종일반주거지역' },
    });
    const def = deficiencies.find(d => d.field === 'firstContractDate');
    expect(def).toBeDefined();
    expect(def?.severity).toBe('block');
    expect(def?.affects).toContain('vacate_schedule');
    expect(def?.nextBest).toContain('상임법 10년');
  });

  it('detects missing legalBasis and sets severity=degrade', () => {
    const leases: LeaseRow[] = [
      {
        unitLabel: '101',
        leaseAreaSqm: 100,
        leaseState: '임대중',
        firstContractDate: '2021-05-01',
        legalBasis: '미확인',
        mgmtFeeKrw: 100000,
      },
    ];
    const deficiencies = auditDeficiencies({
      posture: 'income',
      leases,
    });
    const def = deficiencies.find(d => d.field === 'legalBasis');
    expect(def).toBeDefined();
    expect(def?.severity).toBe('degrade');
  });

  it('detects missing zoning/FAR for development posture with block severity', () => {
    const deficiencies = auditDeficiencies({
      posture: 'development',
      physical: { farPct: null, zoning: null },
    });
    const def = deficiencies.find(d => d.field === 'zoning');
    expect(def).toBeDefined();
    expect(def?.severity).toBe('block');
    expect(def?.affects).toContain('dev_feasibility');
  });

  it('detects missing opex and missing marketRent for owner_occupied posture', () => {
    const deficiencies = auditDeficiencies({
      posture: 'owner_occupied',
      financials: { opexKrw: null },
    });
    expect(deficiencies.some(d => d.field === 'opexKrw' && d.affects.includes('yield_noi'))).toBe(true);
    expect(deficiencies.some(d => d.field === 'marketRentPerPyeong' && d.affects.includes('saved_rent'))).toBe(true);
  });
});
