import { describe, it, expect } from 'vitest';
import { snakeToCamel, camelToSnake, toCamelCase, toSnakeCase } from '../case-converter';

describe('case-converter (P2-3)', () => {
  describe('string conversions', () => {
    it('converts snake_case to camelCase and vice-versa', () => {
      expect(snakeToCamel('building_name')).toBe('buildingName');
      expect(snakeToCamel('total_gross_area_m2')).toBe('totalGrossAreaM2');
      expect(camelToSnake('buildingName')).toBe('building_name');
      expect(camelToSnake('totalGrossAreaM2')).toBe('total_gross_area_m2');
    });

    it('handles unchanged cases (negative pair)', () => {
      expect(snakeToCamel('alreadyCamel')).toBe('alreadyCamel');
      expect(camelToSnake('already_snake')).toBe('already_snake');
      expect(snakeToCamel('')).toBe('');
      expect(camelToSnake('')).toBe('');
    });
  });

  describe('object deep transformations', () => {
    it('converts deep nested objects to camelCase', () => {
      const dbRow = {
        asset_id: 'b-001',
        building_info: {
          plat_area_m2: 500,
          zoning_district: '일반상업지역',
          tenant_list: [
            { tenant_name: 'Starbucks', lease_end: '2028-12-31' },
          ],
        },
      };

      const domain = toCamelCase(dbRow);
      expect(domain).toEqual({
        assetId: 'b-001',
        buildingInfo: {
          platAreaM2: 500,
          zoningDistrict: '일반상업지역',
          tenantList: [
            { tenantName: 'Starbucks', leaseEnd: '2028-12-31' },
          ],
        },
      });

      // Negative check: original snake_case keys are no longer present
      expect(domain).not.toHaveProperty('asset_id');
      expect(domain.buildingInfo).not.toHaveProperty('plat_area_m2');
    });

    it('converts deep nested objects to snake_case', () => {
      const domainEntity = {
        assetId: 'b-002',
        financialMetrics: {
          capRatePct: 4.8,
          annualNoiKrw: 800_000_000,
        },
      };

      const dbRow = toSnakeCase(domainEntity);
      expect(dbRow).toEqual({
        asset_id: 'b-002',
        financial_metrics: {
          cap_rate_pct: 4.8,
          annual_noi_krw: 800_000_000,
        },
      });

      // Negative check: camelCase keys removed
      expect(dbRow).not.toHaveProperty('assetId');
      expect(dbRow.financial_metrics).not.toHaveProperty('capRatePct');
    });

    it('preserves primitives and null/undefined values (negative pair)', () => {
      expect(toCamelCase(null)).toBeNull();
      expect(toCamelCase(undefined)).toBeUndefined();
      expect(toCamelCase(12345)).toBe(12345);
      expect(toCamelCase('simple_string')).toBe('simple_string');
      expect(toSnakeCase(null)).toBeNull();
      expect(toSnakeCase(undefined)).toBeUndefined();
    });
  });
});
