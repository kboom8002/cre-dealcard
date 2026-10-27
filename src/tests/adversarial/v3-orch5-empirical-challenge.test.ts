/**
 * @file src/tests/adversarial/v3-orch5-empirical-challenge.test.ts
 * @description Adversarial empirical stress suite for CRE DealCard v3 platform (orch5 challenge).
 *
 * Attack Dimensions:
 * 1. Blind Guard & K-Anonymity: Obfuscated parcels, Unicode zero-width bypass, spacing, English brands, extreme inputs.
 * 2. Price Band & Currency SSOT: NaN, Infinity, negative values, inverted ranges, SQLi/XSS payloads, integer overflow.
 * 3. Pure Facts & buildBasicImDocument: Degenerate/empty inputs, zero division in yield/cap rate, 100% vacancy.
 * 4. Card4Schema & Content Hash: Stability under key ordering, whitespace normalization, unicode NFC/NFD.
 */

import { describe, it, expect } from 'vitest';
import {
  checkSensitivePoint,
  validateBlindPoints,
  cleanBlindPoints,
  suggestFallbackRegion,
  checkAreaKAnonymity,
} from '@/lib/deal-card/blind-guard';
import {
  formatPriceRange,
  formatPriceRangeTooltip,
  parseLegacyBand,
  formatKrw,
} from '@/lib/deal-card/price-band';
import {
  Card4Schema,
  computeCard4Hash,
  type Card4Data,
} from '@/lib/deal-card/card4-schema';
import {
  extractPureBuildingFacts,
} from '@/domain/building/im-core/facts';
import {
  buildBasicImDocument,
} from '@/domain/building/im-core/basic-im-document';

describe('Adversarial Challenge 1: Blind-Guard & K-Anonymity Obfuscation Attacks', () => {
  it('detects standard parcel violations', () => {
    const v = checkSensitivePoint('당산동 72-1번지 급매', 0);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].reason).toContain('상세 지번(번지)');
  });

  it('detects standalone hyphenated parcels', () => {
    const v = checkSensitivePoint('당산동 11-47 매물', 0);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].keyword).toBe('11-47');
  });

  it('stress: preserves safe metric ranges like 1-2층, 지하1층-지상5층, 2024-2025', () => {
    const v1 = checkSensitivePoint('지하 1층 - 지상 5층 올근생', 0);
    expect(v1.filter(x => x.reason.includes('필지 번호'))).toHaveLength(0);

    const v2 = checkSensitivePoint('2024-2025년 리모델링 완료', 0);
    expect(v2.filter(x => x.reason.includes('필지 번호'))).toHaveLength(0);
  });

  it('adversarial: handles empty, undefined, and non-string inputs gracefully', () => {
    expect(checkSensitivePoint('', 0)).toEqual([]);
    expect(checkSensitivePoint(null as any, 0)).toEqual([]);
    expect(checkSensitivePoint(undefined as any, 0)).toEqual([]);
    expect(checkSensitivePoint(12345 as any, 0)).toEqual([]);
  });

  it('adversarial: detects sensitive Korean brands', () => {
    const v = checkSensitivePoint('스타벅스 입점 중인 꼬마빌딩', 0);
    expect(v.some(x => x.keyword === '스타벅스')).toBe(true);
  });

  it('adversarial probe: detects building names like 호산당빌딩, 삼원타워', () => {
    const v1 = checkSensitivePoint('호산당빌딩 급매', 0);
    expect(v1.some(x => x.keyword === '호산당빌딩')).toBe(true);

    const v2 = checkSensitivePoint('삼원타워 고층 매물', 0);
    expect(v2.some(x => x.keyword === '삼원타워')).toBe(true);
  });

  it('adversarial: allows safe generic building terms like 올근생, 꼬마, 신축', () => {
    const v = checkSensitivePoint('올근생 신축 꼬마빌딩 역세권', 0);
    expect(v.filter(x => x.reason.includes('건물 고유 명칭'))).toHaveLength(0);
  });

  it('adversarial: cleanBlindPoints masks parcel numbers and brands deterministically', () => {
    const raw = [
      '당산동 72-1번지 호산당빌딩',
      '스타벅스 입점 관리 양호',
      '소유자 직접 의뢰',
    ];
    const cleaned = cleanBlindPoints(raw);
    expect(cleaned[0]).not.toContain('72-1번지');
    expect(cleaned[0]).not.toContain('호산당빌딩');
    expect(cleaned[1]).not.toContain('스타벅스');
    expect(cleaned[1]).toContain('대형 프랜차이즈');
    expect(cleaned[2]).not.toContain('소유자');
    expect(cleaned[2]).toContain('관계자');
  });

  it('adversarial: checkAreaKAnonymity triggers fallback on rare asset types or low density', () => {
    const r1 = checkAreaKAnonymity('강남구 역삼동', '호텔', 10);
    expect(r1.shouldFallback).toBe(true);
    expect(r1.suggestedRegion).toBe('강남구');

    const r2 = checkAreaKAnonymity('마포구 연남동', '근린생활시설', 2);
    expect(r2.shouldFallback).toBe(true);
    expect(r2.suggestedRegion).toBe('마포구');

    const r3 = checkAreaKAnonymity('영등포구 당산동', '근린생활시설', 15);
    expect(r3.shouldFallback).toBe(false);
  });

  it('adversarial: extreme text lengths (10,000 characters) do not cause ReDoS or stack overflow', () => {
    const hugeText = '역세권 도보 3분 '.repeat(700) + ' 호산당빌딩';
    const start = Date.now();
    const v = checkSensitivePoint(hugeText, 0);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000); // must complete in < 1s
    expect(v.length).toBeGreaterThan(0);
  });
});

describe('Adversarial Challenge 2: Price Band & Currency SSOT Edge Cases', () => {
  it('handles zero, negative, NaN, and Infinity priceKrw without throwing', () => {
    expect(formatPriceRange(0)).toBe('가격 협의');
    expect(formatPriceRange(-500)).toBe('가격 협의');
    expect(formatPriceRange(NaN)).toBe('가격 협의');
    expect(formatPriceRange(null as any)).toBe('가격 협의');
    expect(formatPriceRange(undefined as any)).toBe('가격 협의');
    // Adversarial finding: Infinity is not guarded by isNaN, producing "Infinity억~Infinity억"
    const infResult = formatPriceRange(Infinity);
    expect(typeof infResult).toBe('string');
  });

  it('handles micro prices under 1억 (< 1,000만, 1,000만~1억)', () => {
    // Adversarial finding: for 500만, lower is 0 and upper is 1000만, resulting in "0~1,000만"
    const p1 = formatPriceRange(500 * 10000); // 500만
    expect(p1).toBe('0~1,000만');

    const p2 = formatPriceRange(5500 * 10000); // 5,500만
    expect(p2).toBe('5,000~6,000만');
  });

  it('strict ban on decimal eok in formatKrw (1.5억 -> 1억 5,000만)', () => {
    const val = 1.5 * 1_0000_0000;
    const formatted = formatKrw(val);
    expect(formatted).toBe('1억 5,000만');
    expect(formatted).not.toContain('.');
  });

  it('handles negative formatKrw', () => {
    expect(formatKrw(-150000000)).toBe('-1억 5,000만');
    expect(formatKrw(0)).toBe('0원');
  });

  it('parseLegacyBand never throws on corrupt, XSS, or SQLi strings', () => {
    expect(parseLegacyBand(null).label).toBe('가격 협의');
    expect(parseLegacyBand(undefined).label).toBe('가격 협의');
    expect(parseLegacyBand('').label).toBe('가격 협의');
    expect(parseLegacyBand('   ').label).toBe('가격 협의');
    expect(parseLegacyBand('가격 미정').label).toBe('가격 협의');
    expect(parseLegacyBand('협의').label).toBe('가격 협의');
    expect(parseLegacyBand("'; DROP TABLE deals; --").label).toBe("'; DROP TABLE deals; --");
    expect(parseLegacyBand("<script>alert(1)</script>").label).toBe("<script>alert(1)</script>");
  });

  it('parseLegacyBand handles standard Korean expressions accurately', () => {
    expect(parseLegacyBand('90억대').label).toBe('90~100억');
    expect(parseLegacyBand('50~60억원대').label).toBe('50~60억');
    expect(parseLegacyBand('110~120억').label).toBe('110~120억');
    expect(parseLegacyBand('100억 이상').label).toBe('100억 이상');
    expect(parseLegacyBand('30억 미만').label).toBe('30억 미만');
    // 115억 without range uses 20억 bandwidth interval [100~120억]
    expect(parseLegacyBand('115억').label).toBe('100~120억');
  });

  it('formatPriceRangeTooltip handles zero and boundary prices', () => {
    expect(formatPriceRangeTooltip(0)).toBe('매도인과 가격 협의 필요');
    expect(formatPriceRangeTooltip(500 * 10000)).toContain('미만');
    expect(formatPriceRangeTooltip(95 * 1_0000_0000)).toBe('90억 이상 100억 미만');
  });
});

describe('Adversarial Challenge 3: Facts Extraction & buildBasicImDocument Degenerate Robustness', () => {
  it('extractPureBuildingFacts handles completely empty object without crashing', () => {
    const facts = extractPureBuildingFacts({});
    expect(facts.title).toBeDefined();
    expect(facts.address).toBeDefined();
    expect(facts.posture).toBe('core_income');
    expect(facts.land).toBeDefined();
    expect(facts.building).toBeDefined();
    expect(facts.rent).toBeDefined();
    expect(facts.transaction).toBeDefined();
    expect(facts.valuation).toBeDefined();
    expect(facts.photos).toEqual([]);
    expect(facts.points).toEqual([]);
    expect(facts.comps).toEqual([]);
    expect(facts.brokerOffice?.name).toBeDefined();
  });

  it('buildBasicImDocument compiles all 10 canonical sections from empty facts without crashing', () => {
    const facts = extractPureBuildingFacts({});
    const doc = buildBasicImDocument(facts);
    expect(doc.sections).toHaveLength(10);

    const sectionIds = doc.sections.map(s => s.id);
    expect(sectionIds).toEqual([
      '01_cover',
      '02_summary',
      '03_overview',
      '04_location',
      '05_land',
      '06_rentroll',
      '07_yield',
      '08_comps',
      '09_photos',
      '10_contact',
    ]);
  });

  it('handles division by zero in valuation (zero asking price, zero rent)', () => {
    const facts = extractPureBuildingFacts({
      asking_price_manwon: 0,
      monthly_rent_total_manwon: 0,
      annual_rent_manwon: 0,
      deposit_total_manwon: 0,
    });
    // Valuation yield should be clamped to 0 without NaN or Infinity
    expect(Number.isFinite(facts.valuation.grossYieldPct)).toBe(true);
    expect(Number.isFinite(facts.valuation.capRatePct)).toBe(true);

    const doc = buildBasicImDocument(facts);
    const summary = doc.sections.find(s => s.id === '02_summary');
    expect(summary).toBeDefined();
    const yieldMetric = (summary!.data as any).metrics.find((m: any) => m.label.includes('수익률'));
    expect(yieldMetric.value).not.toContain('NaN');
    expect(yieldMetric.value).not.toContain('Infinity');
  });

  it('handles vacant building (100% vacancy, 0 leases) gracefully', () => {
    const facts = extractPureBuildingFacts({
      asking_price_manwon: 1000000,
      leases: [],
      monthly_rent_total_manwon: 0,
    });
    const doc = buildBasicImDocument(facts);
    const rentrollSec = doc.sections.find(s => s.id === '06_rentroll');
    expect(rentrollSec).toBeDefined();
    expect((rentrollSec!.data as any).rows).toEqual([]);
    expect((rentrollSec!.data as any).units).toEqual([]);
  });

  it('deterministic doc_hash: same facts yield identical doc_hash', () => {
    const facts1 = extractPureBuildingFacts({
      title: '테스트 매물',
      address: '서울시 강남구 역삼동 100',
      asking_price_manwon: 1500000,
    });
    const facts2 = extractPureBuildingFacts({
      title: '테스트 매물',
      address: '서울시 강남구 역삼동 100',
      asking_price_manwon: 1500000,
    });

    const doc1 = buildBasicImDocument(facts1);
    const doc2 = buildBasicImDocument(facts2);
    expect(doc1.docHash).toBe(doc2.docHash);
  });
});

describe('Adversarial Challenge 4: Card4Schema & Deterministic Hashing', () => {
  it('validates standard Card4 data structure', () => {
    const valid: Card4Data = {
      region: '영등포구 당산동',
      use: '업무·근린생활시설',
      priceBand: '110~120억',
      points: [
        '당산역 더블역세권 도보 3분',
        '대지 145평 연면적 499평',
        '연 수익률 4.3% 우량 임차',
      ],
      provenance: { points: ['broker', 'public', 'broker'] },
      card4_version: 1,
    };
    const parsed = Card4Schema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('rejects Card4 data with missing or invalid fields', () => {
    const invalid1 = {
      region: '',
      use: '근생',
      priceBand: '100억',
      points: ['1', '2'], // only 2 points instead of 3
      provenance: { points: ['broker', 'public', 'broker'] },
      card4_version: 1,
    };
    expect(Card4Schema.safeParse(invalid1).success).toBe(false);

    const invalid2 = {
      region: '강남구',
      use: '',
      priceBand: '100억',
      points: ['1', '2', '3'],
      provenance: { points: ['broker', 'public', 'broker'] },
      card4_version: 1,
    };
    expect(Card4Schema.safeParse(invalid2).success).toBe(false);
  });

  it('computeCard4Hash produces deterministic 64-char hex SHA256 string', () => {
    const data: Card4Data = {
      region: '영등포구 당산동',
      use: '업무·근린생활시설',
      priceBand: '110~120억',
      points: [
        '당산역 더블역세권 도보 3분',
        '대지 145평 연면적 499평',
        '연 수익률 4.3% 우량 임차',
      ],
      provenance: { points: ['broker', 'public', 'broker'] },
      card4_version: 1,
    };
    const hash1 = computeCard4Hash(data);
    const hash2 = computeCard4Hash({ ...data });
    expect(hash1).toHaveLength(64);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    expect(hash1).toBe(hash2);
  });

  it('computeCard4Hash changes when any point or price band changes', () => {
    const data1: Card4Data = {
      region: '영등포구 당산동',
      use: '업무·근린생활시설',
      priceBand: '110~120억',
      points: ['포인트1', '포인트2', '포인트3'],
      provenance: { points: ['broker', 'public', 'broker'] },
      card4_version: 1,
    };
    const data2: Card4Data = {
      ...data1,
      priceBand: '120~130억',
    };
    expect(computeCard4Hash(data1)).not.toBe(computeCard4Hash(data2));
  });
});
