// src/domain/building/mobile-im/__tests__/ontology-v4.test.ts
import { describe, it, expect } from 'vitest';
import {
  resolvePriceBand,
  requirePosture,
  classifyAssetType,
  InputRequiredError,
  PRICE_BANDS,
} from '@/types/ontology';

describe('Ontology v0.4 & Price Band Contracts (Phase 2-1)', () => {
  describe('PriceBand resolution (30억~500억 주력 대역)', () => {
    it('PB-01: resolves B1 (30억~80억)', () => {
      expect(resolvePriceBand(5_000_000_000)).toBe('B1');
      expect(resolvePriceBand(3_000_000_000)).toBe('B1');
    });

    it('PB-02: resolves B2 (80억~150억)', () => {
      expect(resolvePriceBand(11_500_000_000)).toBe('B2');
      expect(resolvePriceBand(8_000_000_000)).toBe('B2');
    });

    it('PB-03: resolves B3 (150억~300억)', () => {
      expect(resolvePriceBand(25_000_000_000)).toBe('B3');
      expect(resolvePriceBand(15_000_000_000)).toBe('B3');
    });

    it('PB-04: resolves B4 (300억~500억 — 주력 상단)', () => {
      expect(resolvePriceBand(45_000_000_000)).toBe('B4');
      expect(resolvePriceBand(30_000_000_000)).toBe('B4');
    });

    it('PB-05: resolves below (< 30억) and above (>= 500억)', () => {
      expect(resolvePriceBand(2_000_000_000)).toBe('below');
      expect(resolvePriceBand(60_000_000_000)).toBe('above');
    });
  });

  describe('requirePosture (posture 기본값 제거 강제)', () => {
    it('RP-01: returns valid posture', () => {
      expect(requirePosture({ posture: 'income' })).toBe('income');
      expect(requirePosture({ posture: 'development' })).toBe('development');
      expect(requirePosture({ posture: 'owner_occupied' })).toBe('owner_occupied');
      expect(requirePosture({ posture: 'operating' })).toBe('operating');
      expect(requirePosture({ posture: 'trading' })).toBe('trading');
    });

    it('RP-02: throws InputRequiredError when posture is missing', () => {
      expect(() => requirePosture({})).toThrow(InputRequiredError);
      expect(() => requirePosture({ posture: null })).toThrow(InputRequiredError);
    });
  });

  describe('classifyAssetType (대장 주용도 기반 자산유형 판별)', () => {
    it('CAT-01: 업무시설 -> office', () => {
      const result = classifyAssetType('업무시설', 2000, 10);
      expect(result.assetType).toBe('office');
      expect(result.confidence).toBe('high');
      expect(result.needsConfirmation).toBe(false);
    });

    it('CAT-02: 제1/2종근린생활시설 소형 -> small_building', () => {
      const result = classifyAssetType('제2종근린생활시설', 1000, 5);
      expect(result.assetType).toBe('small_building');
      expect(result.confidence).toBe('high');
    });

    it('CAT-03: 숙박시설 -> hotel', () => {
      const result = classifyAssetType('숙박시설', 3000, 8);
      expect(result.assetType).toBe('hotel');
      expect(result.confidence).toBe('high');
    });

    it('CAT-04: 주용도 미확보 시 -> unknown with confirmation request', () => {
      const result = classifyAssetType(null, null, null);
      expect(result.assetType).toBe('unknown');
      expect(result.confidence).toBe('low');
      expect(result.needsConfirmation).toBe(true);
    });
  });
});
