import { describe, it, expect } from 'vitest';
import {
  classifyAndAnalyzeRentroll,
  type RentrollUnitRow,
} from '@/domain/building/common-pipeline/rentroll-classifier';

describe('Rent Roll 4-Tier Classification & Vacancy Preservation (CIM-0404 / PR-M4-04)', () => {
  it('should correctly classify full unit level, compute physical vacancy rate, and flag owner-occupied space', () => {
    const rows: RentrollUnitRow[] = [
      {
        floor: 'B1',
        unit: 'B01',
        tenantIndustry: '음식점',
        occupancyType: 'leased',
        areaSqm: 100,
        depositKrw: 30000000,
        monthlyRentKrw: 2500000,
      },
      {
        floor: '1F',
        unit: '101',
        tenantIndustry: '카페',
        occupancyType: 'leased',
        areaSqm: 100,
        depositKrw: 50000000,
        monthlyRentKrw: 4500000,
      },
      {
        floor: '2F',
        unit: '201',
        occupancyType: 'vacant', // 공실
        areaSqm: 100,
        depositKrw: 0,
        monthlyRentKrw: 0,
      },
      {
        floor: '3F',
        unit: '301',
        tenantIndustry: '자가 사무실',
        occupancyType: 'owner_occupied', // 자가사용
        areaSqm: 100,
        depositKrw: 0,
        monthlyRentKrw: 0,
      },
    ];

    const analysis = classifyAndAnalyzeRentroll(rows, { monthlyRentKrw: 7000000 });

    expect(analysis.tier).toBe('full_unit_level');
    expect(analysis.totalAreaSqm).toBe(400);
    expect(analysis.vacantAreaSqm).toBe(100);
    expect(analysis.ownerOccupiedAreaSqm).toBe(100);
    expect(analysis.physicalVacancyRatePct).toBe(25.0); // 100/400 = 25%
    expect(analysis.hasG35Discrepancy).toBe(false);
  });

  it('should detect G35 discrepancy when rent sum deviates from control total by >1%', () => {
    const rows: RentrollUnitRow[] = [
      {
        floor: '1F',
        unit: '101',
        occupancyType: 'leased',
        areaSqm: 100,
        depositKrw: 50000000,
        monthlyRentKrw: 4000000,
      },
    ];

    // Control total claims 5,000,000 (25% difference)
    const analysis = classifyAndAnalyzeRentroll(rows, { monthlyRentKrw: 5000000 });

    expect(analysis.hasG35Discrepancy).toBe(true);
    expect(analysis.discrepancyNote).toContain('렌트롤 합계');
  });
});
