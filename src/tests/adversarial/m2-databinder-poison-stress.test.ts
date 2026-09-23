import { describe, it, expect } from 'vitest';
import pptxgen from 'pptxgenjs';
import AdmZip from 'adm-zip';
import { bindProImChapterData, bindSectionData } from '@/domain/building/mobile-im/pptx/data-binder';
import { buildProDeckSequence } from '@/domain/building/mobile-im/pptx/pro-deck-sequencer';
import { buildA23YieldFormula } from '@/domain/building/mobile-im/pptx/archetypes/a23-yield-formula';
import { buildA16InvestmentStructure } from '@/domain/building/mobile-im/pptx/archetypes/a16-investment-structure';
import { buildA12Ownership } from '@/domain/building/mobile-im/pptx/archetypes/a12-ownership';
import { buildA03LargeTable } from '@/domain/building/mobile-im/pptx/archetypes/a03-large-table';
import { SLIDE_ARCHETYPE_REGISTRY } from '@/domain/building/mobile-im/pptx/archetypes';
import type { InstitutionalTenantRosterItem } from '@/domain/building/im-core/pro-tenant-roster';
import type { InvestmentPosture } from '@/domain/ontology';

const POISON_TOKEN_REGEX = /NaN|undefined|\bnull\b|\[object Object\]/;
const EVASIVE_PHRASES_REGEX = /(추후\s*확인\s*필요|미정|상세\s*불명|확인\s*불가|자료\s*없음)/;

function scanForPoisonTokens(obj: any, path = ''): Array<{ path: string; value: any; match: string }> {
  const findings: Array<{ path: string; value: any; match: string }> = [];
  if (obj === null || obj === undefined) {
    return findings;
  }
  if (typeof obj === 'string') {
    const match = obj.match(POISON_TOKEN_REGEX);
    if (match) {
      findings.push({ path, value: obj, match: match[0] });
    }
  } else if (typeof obj === 'number') {
    if (isNaN(obj)) {
      findings.push({ path, value: obj, match: 'NaN' });
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      findings.push(...scanForPoisonTokens(item, `${path}[${idx}]`));
    });
  } else if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      findings.push(...scanForPoisonTokens(v, path ? `${path}.${k}` : k));
    }
  }
  return findings;
}

function scanForEvasivePhrases(obj: any, path = ''): Array<{ path: string; value: any; match: string }> {
  const findings: Array<{ path: string; value: any; match: string }> = [];
  if (obj === null || obj === undefined) {
    return findings;
  }
  if (typeof obj === 'string') {
    const match = obj.match(EVASIVE_PHRASES_REGEX);
    if (match) {
      findings.push({ path, value: obj, match: match[0] });
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      findings.push(...scanForEvasivePhrases(item, `${path}[${idx}]`));
    });
  } else if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      findings.push(...scanForEvasivePhrases(v, path ? `${path}.${k}` : k));
    }
  }
  return findings;
}

function createMockTenant(idx: number): InstitutionalTenantRosterItem {
  return {
    floor: `${idx + 1}F`,
    unitNumber: `${idx + 1}01호`,
    tenantName: `테넌트_${idx + 1}`,
    industry: '일반사무',
    leasedAreaM2: 150.0,
    leasedAreaPyeong: 45.4,
    depositKrw: 50_000_000,
    monthlyRentKrw: 3_500_000,
    monthlyMaintenanceKrw: 700_000,
    leaseStartDate: '2023-01-01',
    leaseEndDate: '2027-12-31',
    statutoryProtection10Y: true,
  };
}

describe('Adversarial Empirical Stress Test: M2-2 Data Binder & Poison Token Verifier', () => {

  // ==========================================================================
  // Dimension 1: Defect A Fix Verification (Raw WON vs Manwon in A23)
  // ==========================================================================
  describe('Dimension 1: Defect A Fix Verification (Raw WON Currency Units in A23)', () => {
    it('[Positive] 250억원 asset must bind raw WON (25,000,000,000 KRW) to A23 slides', async () => {
      const doc = {
        title: '양평동 더레드빌딩',
        body: {
          asking_price_krw: 25_000_000_000,
          annual_rent_krw: 1_050_000_000,
          total_deposit_krw: 2_000_000_000,
        },
      };

      const result = bindProImChapterData(doc);

      // cash_flow_snapshot
      const snapshot = result['cash_flow_snapshot'];
      expect(snapshot).toBeDefined();
      expect(snapshot.askingPrice).toBe(25_000_000_000);
      expect(snapshot.annualRent).toBe(1_050_000_000);
      expect(snapshot.totalDeposit).toBe(2_000_000_000);

      // dcf_valuation
      const valuation = result['dcf_valuation'];
      expect(valuation).toBeDefined();
      expect(valuation.askingPrice).toBe(25_000_000_000);
      expect(valuation.annualRent).toBe(1_050_000_000);
      expect(valuation.totalDeposit).toBe(2_000_000_000);
    });

    it('[Positive] Rendering A23 with raw WON outputs "250.0억원" and NOT "250만원"', async () => {
      const doc = {
        title: '양평동 더레드빌딩',
        body: {
          asking_price_krw: 25_000_000_000,
          annual_rent_krw: 1_050_000_000,
          total_deposit_krw: 2_000_000_000,
        },
      };

      const result = bindProImChapterData(doc);
      const snapshot = result['cash_flow_snapshot'];

      const pres = new pptxgen();
      buildA23YieldFormula({
        pres,
        slideNum: 8,
        docno: 'TEST-A23-WON',
        data: snapshot,
        grade: 'A',
        provenance: {},
      });

      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      expect(slideXml).toContain('250.0억원');
      expect(slideXml).not.toContain('250만원');
      expect(slideXml).not.toContain('105만원');
      expect(slideXml).toContain('10.5억원');
    });

    it('[Negative Pair] Passing manwon unit (2,500,000) causes Defect A regression to "250만원"', async () => {
      const pres = new pptxgen();
      buildA23YieldFormula({
        pres,
        slideNum: 8,
        docno: 'TEST-A23-DEFECT-A',
        data: {
          annualRent: 105_000, // passed in manwon (defect)
          askingPrice: 2_500_000, // passed in manwon (defect)
          totalDeposit: 200_000,
          capRateAsIs: 4.2,
        },
        grade: 'A',
        provenance: {},
      });

      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      // Demonstrating that passing manwon produces the bug:
      expect(slideXml).toContain('250만원');
      expect(slideXml).not.toContain('250.0억원');
    });
  });

  // ==========================================================================
  // Dimension 2: Defect B Fix Verification (A16 LTV Scenarios & Equity Breakdown)
  // ==========================================================================
  describe('Dimension 2: Defect B Fix Verification (A16 LTV Scenarios & Equity Breakdown)', () => {
    it('[Positive] debt_financing has ltvPct: number for all scenarios and full equityBreakdown', async () => {
      const doc = {
        title: '신사동 빌딩',
        body: {
          asking_price_krw: 30_000_000_000,
          total_deposit_krw: 1_500_000_000,
        },
      };

      const result = bindProImChapterData(doc);
      const debt = result['debt_financing'];
      expect(debt).toBeDefined();

      // Check equityBreakdown
      expect(debt.equityBreakdown).toBeDefined();
      expect(debt.equityBreakdown.price).toBe(30_000_000_000);
      expect(debt.equityBreakdown.acquisitionTax).toBe(Math.round(30_000_000_000 * 0.046));
      expect(debt.equityBreakdown.brokerFee).toBe(Math.round(30_000_000_000 * 0.009));
      expect(debt.equityBreakdown.deposit).toBe(1_500_000_000);
      expect(debt.equityBreakdown.loan).toBe(15_000_000_000);
      expect(debt.equityBreakdown.equity).toBeGreaterThan(0);

      // Check ltvScenarios
      expect(Array.isArray(debt.ltvScenarios)).toBe(true);
      expect(debt.ltvScenarios!.length).toBeGreaterThanOrEqual(4);

      for (const sc of debt.ltvScenarios!) {
        expect(typeof sc.ltvPct).toBe('number');
        expect(isNaN(sc.ltvPct)).toBe(false);
        expect(sc.ltvPct).toBeGreaterThanOrEqual(0);
        expect(typeof sc.equityBil).toBe('string');
        expect(sc.equityBil.length).toBeGreaterThan(0);
        expect(sc.equityBil).not.toBe('NaN');
        expect(sc.equityBil).not.toBe('undefined');
        expect(typeof sc.yieldPct).toBe('string');
        expect(sc.yieldPct).not.toBe('NaN');
        expect(sc.yieldPct).not.toBe('undefined');
        expect(typeof sc.note).toBe('string');
        expect(sc.note.length).toBeGreaterThan(0);
      }
    });

    it('[Positive] Rendering A16 with debt_financing produces 0 "undefined%" or "LTV undefined%"', async () => {
      const doc = {
        title: '신사동 빌딩',
        body: {
          asking_price_krw: 30_000_000_000,
        },
      };

      const result = bindProImChapterData(doc);
      const debt = result['debt_financing'];

      const pres = new pptxgen();
      buildA16InvestmentStructure({
        pres,
        slideNum: 22,
        docno: 'TEST-A16-LTV',
        data: debt,
        grade: 'A',
        provenance: {},
      });

      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      expect(slideXml).not.toContain('LTV undefined%');
      expect(slideXml).not.toContain('undefined%');
      expect(slideXml).not.toContain('undefined');
      expect(slideXml).not.toContain('NaN');
      expect(slideXml).toContain('40%');
      expect(slideXml).toContain('50%');
      expect(slideXml).toContain('60%');
    });

    it('[Negative Pair] Defective ltvScenarios with missing ltvPct causes "undefined%" leak', async () => {
      const pres = new pptxgen();
      buildA16InvestmentStructure({
        pres,
        slideNum: 22,
        docno: 'TEST-A16-DEFECT-B',
        data: {
          equityBreakdown: { price: 30_000_000_000, equity: 15_000_000_000 },
          ltvScenarios: [
            { equityBil: '15.0', yieldPct: '4.5', note: '' }, // missing ltvPct!
          ],
        },
        grade: 'A',
        provenance: {},
      });

      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      expect(slideXml).toContain('undefined%');
    });
  });

  // ==========================================================================
  // Dimension 3: Defect C Fix Verification (A12 ownership 2D string matrix string[][])
  // ==========================================================================
  describe('Dimension 3: Defect C Fix Verification (A12 ownership 2D string matrix string[][])', () => {
    it('[Positive] ownershipRows is strictly string[][] with 0 plain objects', async () => {
      const doc = {
        title: '서초동 빌딩',
        body: {},
      };

      const result = bindProImChapterData(doc);
      const ownership = result['ownership'];
      expect(ownership).toBeDefined();
      expect(Array.isArray(ownership.ownershipRows)).toBe(true);
      expect(ownership.ownershipRows!.length).toBeGreaterThan(0);

      for (const row of ownership.ownershipRows!) {
        expect(Array.isArray(row)).toBe(true);
        for (const cell of row) {
          expect(typeof cell).toBe('string');
          expect(cell).not.toBe('[object Object]');
        }
      }
    });

    it('[Positive] Rendering A12 with ownership data produces 0 "[object Object]"', async () => {
      const doc = {
        title: '서초동 빌딩',
        body: {},
      };

      const result = bindProImChapterData(doc);
      const ownership = result['ownership'];

      const pres = new pptxgen();
      buildA12Ownership({
        pres,
        slideNum: 31,
        docno: 'TEST-A12-OWNERSHIP',
        data: ownership,
        grade: 'A',
        provenance: {},
      });

      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml = zip.getEntries().find(e => e.entryName.includes('slide1.xml'))?.getData().toString('utf-8') || '';

      expect(slideXml).not.toContain('[object Object]');
      expect(slideXml).not.toContain('undefined');
      expect(slideXml).not.toContain('NaN');
      expect(slideXml).toContain('TITLE &amp; OWNERSHIP');
    });

    it('[Negative Pair] Non-string matrix row representation causes "[object Object]" coercion', async () => {
      const defectiveOwnershipRows = [
        { category: '소유권자', status: '확인완료' },
      ];

      // If ownershipRows were plain objects rather than string[][],
      // array check fails and string coercion yields [object Object]
      expect(Array.isArray(defectiveOwnershipRows[0])).toBe(false);
      expect(String(defectiveOwnershipRows[0])).toBe('[object Object]');
      expect(`${defectiveOwnershipRows[0]}`).toContain('[object Object]');
    });
  });

  // ==========================================================================
  // Dimension 4: Defect D Fix Verification (Multi-page rent roll > 24 tenants)
  // ==========================================================================
  describe('Dimension 4: Defect D Fix Verification (Multi-Page Rent Roll > 24 Tenants)', () => {
    it('[Positive] 8 tenants produces rentRollPart1 and rentRollPart2 (expiry fallback)', async () => {
      const doc = {
        title: '표준 8개 임차인',
        body: {}, // uses default 8 tenants
      };

      const result = bindProImChapterData(doc);
      expect(result['rentRollPart1']).toBeDefined();
      expect(result['rentRollPart2']).toBeDefined();
      expect(result['rentRollPart3']).toBeUndefined();
    });

    it('[Positive] 24 tenants produces rentRollPart1 and rentRollPart2', async () => {
      const tenants24 = Array.from({ length: 24 }, (_, i) => createMockTenant(i));
      const doc = {
        title: '24개 임차인',
        body: { floor_leases: tenants24 },
      };

      const result = bindProImChapterData(doc);
      expect(result['rentRollPart1']).toBeDefined();
      expect(result['rentRollPart2']).toBeDefined();
      expect(result['rentRollPart3']).toBeUndefined();

      expect(result['rentRollPart1'].tableRows.length).toBe(13); // 12 items + 1 subtotal
      expect(result['rentRollPart2'].tableRows.length).toBe(14); // 12 items + 1 subtotal + 1 grand total
    });

    it('[Positive] 25 tenants produces rentRollPart1, rentRollPart2, AND rentRollPart3', async () => {
      const tenants25 = Array.from({ length: 25 }, (_, i) => createMockTenant(i));
      const doc = {
        title: '25개 임차인',
        body: { floor_leases: tenants25 },
      };

      const result = bindProImChapterData(doc);
      expect(result['rentRollPart1']).toBeDefined();
      expect(result['rentRollPart2']).toBeDefined();
      expect(result['rentRollPart3']).toBeDefined();
      expect(result['rentRollPart4']).toBeUndefined();

      // Check chunk rows
      expect(result['rentRollPart1'].tableRows.length).toBe(13); // 12 items + 1 subtotal
      expect(result['rentRollPart2'].tableRows.length).toBe(13); // 12 items + 1 subtotal
      expect(result['rentRollPart3'].tableRows.length).toBe(3);  // 1 item + 1 subtotal + 1 grand total

      // Verify final grand total matches sum of 25 tenants
      const grandTotalRow = result['rentRollPart3'].tableRows[2];
      expect(grandTotalRow[0]).toBe('합계');
      expect(grandTotalRow[2]).toBe('25개사');
      const expectedTotalDepositManwon = (50_000_000 * 25) / 10000;
      expect(grandTotalRow[6]).toBe(expectedTotalDepositManwon.toLocaleString());
    });

    it('[Positive] 36 tenants produces exactly 3 chunks of 12', async () => {
      const tenants36 = Array.from({ length: 36 }, (_, i) => createMockTenant(i));
      const doc = {
        title: '36개 임차인',
        body: { floor_leases: tenants36 },
      };

      const result = bindProImChapterData(doc);
      expect(result['rentRollPart1']).toBeDefined();
      expect(result['rentRollPart2']).toBeDefined();
      expect(result['rentRollPart3']).toBeDefined();
      expect(result['rentRollPart4']).toBeUndefined();

      expect(result['rentRollPart1'].tableRows.length).toBe(13); // 12 + 1 subtotal
      expect(result['rentRollPart2'].tableRows.length).toBe(13); // 12 + 1 subtotal
      expect(result['rentRollPart3'].tableRows.length).toBe(14); // 12 + 1 subtotal + 1 grand total
    });

    it('[Positive] 48 tenants produces 4 chunks (rentRollPart1..4)', async () => {
      const tenants48 = Array.from({ length: 48 }, (_, i) => createMockTenant(i));
      const doc = {
        title: '48개 임차인',
        body: { floor_leases: tenants48 },
      };

      const result = bindProImChapterData(doc);
      expect(result['rentRollPart1']).toBeDefined();
      expect(result['rentRollPart2']).toBeDefined();
      expect(result['rentRollPart3']).toBeDefined();
      expect(result['rentRollPart4']).toBeDefined();
      expect(result['rentRollPart5']).toBeUndefined();
    });

    it('[Positive] Rendering multi-page rent roll parts to PPTX produces 0 poison tokens', async () => {
      const tenants30 = Array.from({ length: 30 }, (_, i) => createMockTenant(i));
      const doc = {
        title: '30개 임차인 빌딩',
        body: { floor_leases: tenants30 },
      };

      const result = bindProImChapterData(doc);
      const pres = new pptxgen();

      for (let p = 1; p <= 3; p++) {
        buildA03LargeTable({
          pres,
          slideNum: 12 + p,
          docno: `TEST-A03-PART${p}`,
          data: result[`rentRollPart${p}`],
          grade: 'A',
          provenance: {},
        });
      }

      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      for (let p = 1; p <= 3; p++) {
        const slideXml = zip.getEntries().find(e => e.entryName.includes(`slide${p}.xml`))?.getData().toString('utf-8') || '';
        expect(slideXml).not.toContain('NaN');
        expect(slideXml).not.toContain('undefined');
        expect(slideXml).not.toContain('[object Object]');
      }
    });
  });

  // ==========================================================================
  // Dimension 5: Exhaustive Poison Token Stress Test Across Adversarial Inputs
  // ==========================================================================
  describe('Dimension 5: Exhaustive Poison Token Scanning Across Adversarial Inputs', () => {
    const adversarialTestCases = [
      {
        name: 'Empty doc body ({})',
        doc: { title: '빈 문서', body: {} },
      },
      {
        name: 'Nullish and undefined doc body fields',
        doc: {
          title: '널리시 문서',
          body: {
            asking_price_krw: null,
            annual_rent_krw: null,
            total_deposit_krw: null,
            floor_leases: null,
            tenantRoster: null,
            ssot_summary: null,
          },
        },
      },
      {
        name: 'Zero values in doc body',
        doc: {
          title: '0원 매물',
          body: {
            asking_price_krw: 0,
            annual_rent_krw: 0,
            total_deposit_krw: 0,
            floor_leases: [],
          },
        },
      },
      {
        name: 'Mega-Asset (1조 원: 1,000,000,000,000 KRW)',
        doc: {
          title: '1조원 프라임 빌딩',
          body: {
            asking_price_krw: 1_000_000_000_000,
            annual_rent_krw: 42_000_000_000,
            total_deposit_krw: 80_000_000_000,
            total_gross_area_py: 45_000,
            land_area_py: 3_500,
          },
        },
      },
      {
        name: 'Micro-Asset (1억 원: 100,000,000 KRW)',
        doc: {
          title: '1억원 초소형 근생',
          body: {
            asking_price_krw: 100_000_000,
            annual_rent_krw: 5_000_000,
            total_deposit_krw: 10_000_000,
            total_gross_area_py: 30,
            land_area_py: 15,
          },
        },
      },
      {
        name: 'Extreme Tenant Roster with missing and weird attributes',
        doc: {
          title: '비정형 테넌트',
          body: {
            asking_price_krw: 25_000_000_000,
            floor_leases: [
              { floor: '', unitNumber: '', tenantName: '', leasedAreaM2: 0, depositKrw: 0, monthlyRentKrw: 0 },
              { floor: 'B3', unitNumber: 'B301', tenantName: '특수임차인', leasedAreaPyeong: 123.456, deposit_manwon: 5000, monthly_rent_manwon: 350 },
              { floor: 'PH', unit_number: 'PH01', name: '펜트하우스', area_sqm: 555.55, deposit: 100000000, monthlyRent: 12000000 },
            ],
          },
        },
      },
    ];

    for (const tc of adversarialTestCases) {
      it(`[Positive] Zero poison tokens in ${tc.name}`, () => {
        const result = bindProImChapterData(tc.doc);
        const findings = scanForPoisonTokens(result);
        expect(findings).toEqual([]);
      });
    }

    it('[Positive] Zero poison tokens across all 5 investment postures via bindSectionData', async () => {
      const postures: InvestmentPosture[] = ['income', 'owner_occupied', 'development', 'operating', 'trading'];

      for (const posture of postures) {
        const doc = {
          title: `${posture} 테스트 IM`,
          body: {
            investment_posture: posture,
            asking_price_krw: 20_000_000_000,
            annual_rent_krw: 800_000_000,
            total_deposit_krw: 1_200_000_000,
          },
          sections: [
            { title: 'Executive Summary', markdown: '# 요약\n본 자산은 우량 자산입니다.', section_type: 'executive_summary' },
            { title: 'Investment Thesis', markdown: '# 투자 논거\n안정적 현금흐름.', section_type: 'investment_thesis' },
          ],
        };

        const result = bindSectionData(doc);
        const findings = scanForPoisonTokens(result);
        expect(findings).toEqual([]);
      }
    });
  });

  // ==========================================================================
  // Dimension 6: Zero Evasive Phrases Invariant
  // ==========================================================================
  describe('Dimension 6: Zero Evasive Phrases Invariant', () => {
    it('[Positive] Zero evasive phrases in standard Pro IM chapter data', async () => {
      const doc = {
        title: '양평동 더레드빌딩',
        body: {
          asking_price_krw: 25_000_000_000,
          annual_rent_krw: 1_050_000_000,
        },
      };

      const result = bindProImChapterData(doc);
      const findings = scanForEvasivePhrases(result);
      expect(findings).toEqual([]);
    });

    it('[Positive] Zero evasive phrases in empty and fallback payloads', async () => {
      const doc = {
        title: '빈 문서',
        body: {},
      };

      const result = bindProImChapterData(doc);
      const findings = scanForEvasivePhrases(result);
      expect(findings).toEqual([]);
    });

    it('[Negative Pair] Evasive phrase scanner detects injected banned phrases', async () => {
      const dirtyObj = {
        title: '자료 없음',
        check: '추후 확인 필요',
        note: '미정 및 상세 불명 상태',
        status: '확인 불가',
      };

      const findings = scanForEvasivePhrases(dirtyObj);
      expect(findings.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ==========================================================================
  // Dimension 7: Full Pro Deck PPTX Binary Archetype Rendering Stress
  // ==========================================================================
  describe('Dimension 7: Full Pro Deck PPTX Binary Archetype Rendering Stress', () => {
    it('[Positive] Render all Pro IM slides to PPTX binary and confirm 0 poison tokens in XML', async () => {
      const doc = {
        title: '강남 프라임 타워',
        body: {
          asking_price_krw: 35_000_000_000,
          annual_rent_krw: 1_470_000_000,
          total_deposit_krw: 2_800_000_000,
          land_area_py: 280,
          total_gross_area_py: 1850,
          floor_leases: Array.from({ length: 26 }, (_, i) => createMockTenant(i)),
        },
      };

      const result = bindSectionData(doc);
      const seq = buildProDeckSequence({
        posture: 'income',
        grade: 'A',
        data: doc.body,
      });

      const pres = new pptxgen();

      // Render every slide in the sequence using its assigned archetype builder
      let renderedCount = 0;
      for (let i = 0; i < seq.length; i++) {
        const spec = seq[i];
        const builder = SLIDE_ARCHETYPE_REGISTRY[spec.archetype];
        if (builder) {
          const rawSlideData = result[spec.dataKey] || {
            title: spec.title,
            kicker: spec.kicker,
            content: '',
            tables: [],
            metrics: {},
          };
          const slideData = {
            ...rawSlideData,
            totalGrossAreaPy: rawSlideData.totalGrossAreaPy || doc.body.total_gross_area_py,
          };
          await builder({
            pres,
            slideNum: i + 1,
            docno: 'TEST-FULL-PRO-DECK',
            data: slideData,
            grade: 'A',
            provenance: {},
          });
          renderedCount++;
        }
      }

      expect(renderedCount).toBeGreaterThanOrEqual(30);

      const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideEntries = zip.getEntries().filter(e => e.entryName.startsWith('ppt/slides/slide') && e.entryName.endsWith('.xml'));

      expect(slideEntries.length).toBeGreaterThanOrEqual(30);

      for (const entry of slideEntries) {
        const xml = entry.getData().toString('utf-8');
        expect(xml).not.toContain('>NaN<');
        if (xml.includes('>undefined<')) { console.log('POISON FOUND in entry:', entry.entryName); const idx = xml.indexOf('>undefined<'); console.log('XML context:', xml.substring(Math.max(0, idx - 200), idx + 200)); } expect(xml).not.toContain('>undefined<');
        expect(xml).not.toContain('>null<');
        expect(xml).not.toContain('[object Object]');
        expect(xml).not.toContain('추후 확인 필요');
        expect(xml).not.toContain('상세 불명');
        expect(xml).not.toContain('확인 불가');
      }
    });
  });
});
