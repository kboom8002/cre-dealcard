/**
 * @file wave1-magazine-adversarial-stress.test.ts
 * @description Adversarial stress-testing suite for Wave 1 Magazine SSOT bridge & ROI parity.
 * Tests edge cases, boundary conditions, zero/negative inputs, divide-by-zero vulnerabilities,
 * photo schemas, price parsing, and special edition deals.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  adaptBuildingToMagazineDeal,
  parsePriceBandToWon,
  resolveDealCoverPhoto,
  resolveDealPhotoUrls,
  fetchMagazineCandidateDeals,
  VALID_MAGAZINE_DEAL_STATUSES,
} from '@/domain/magazine/deal-adapter';
import { computeRoi, clampInput, ROI_DEFAULTS } from '@/components/magazine/roi-calc';
import { PYEONG_RATIO } from '@/lib/utils/area-conversion';

describe('Adversarial Stress Test: Photo Resolution Hierarchy & Schema Robustness', () => {
  it('handles null, undefined, empty object, and empty array without throwing', () => {
    expect(resolveDealCoverPhoto(null)).toBeNull();
    expect(resolveDealCoverPhoto(undefined)).toBeNull();
    expect(resolveDealCoverPhoto([])).toBeNull();
    expect(resolveDealCoverPhoto({})).toBeNull();
    expect(resolveDealCoverPhoto({ urls: [] })).toBeNull();
    expect(resolveDealCoverPhoto({ photos: [] })).toBeNull();

    expect(resolveDealPhotoUrls(null)).toEqual([]);
    expect(resolveDealPhotoUrls(undefined)).toEqual([]);
    expect(resolveDealPhotoUrls([])).toEqual([]);
    expect(resolveDealPhotoUrls({})).toEqual([]);
    expect(resolveDealPhotoUrls({ urls: [] })).toEqual([]);
    expect(resolveDealPhotoUrls({ photos: [] })).toEqual([]);
  });

  it('supports single string legacy photo schema', () => {
    const single = 'https://cdn.example.com/legacy-cover.jpg';
    expect(resolveDealCoverPhoto(single)).toBe(single);
    expect(resolveDealPhotoUrls(single)).toEqual([single]);
  });

  it('ignores unsupported .wdp image formats across all priority tiers', () => {
    const photos = [
      { url: 'https://cdn.example.com/cover.wdp', isCover: true },
      { url: 'https://cdn.example.com/exterior.wdp', isExterior: true },
      { url: 'https://cdn.example.com/valid-fallback.jpg' },
    ];
    expect(resolveDealCoverPhoto(photos)).toBe('https://cdn.example.com/valid-fallback.jpg');
    expect(resolveDealPhotoUrls(photos)).toEqual(['https://cdn.example.com/valid-fallback.jpg']);
  });

  it('filters out excluded: true photos even if marked isCover: true', () => {
    const photos = [
      { url: 'https://cdn.example.com/excluded-cover.jpg', isCover: true, excluded: true },
      { url: 'https://cdn.example.com/good-exterior.jpg', isExterior: true },
    ];
    expect(resolveDealCoverPhoto(photos)).toBe('https://cdn.example.com/good-exterior.jpg');
    expect(resolveDealPhotoUrls(photos)).toEqual(['https://cdn.example.com/good-exterior.jpg']);
  });

  it('returns null and empty array when ALL photos are excluded or invalid', () => {
    const photos = [
      { url: 'https://cdn.example.com/1.wdp' },
      { url: 'https://cdn.example.com/2.jpg', excluded: true },
      { url: '   ' },
      null,
      undefined,
      12345,
    ];
    expect(resolveDealCoverPhoto(photos)).toBeNull();
    expect(resolveDealPhotoUrls(photos)).toEqual([]);
  });

  it('handles object photo schema with urls array ({ urls: [...] })', () => {
    const photoObj = {
      urls: [
        'https://cdn.example.com/nested-1.jpg',
        'https://cdn.example.com/nested-2.jpg',
      ],
    };
    expect(resolveDealCoverPhoto(photoObj)).toBe('https://cdn.example.com/nested-1.jpg');
    expect(resolveDealPhotoUrls(photoObj)).toEqual([
      'https://cdn.example.com/nested-1.jpg',
      'https://cdn.example.com/nested-2.jpg',
    ]);
  });

  it('correctly handles case-insensitivity on role/category/type ("COVER", "Exterior")', () => {
    const photos = [
      { url: 'https://cdn.example.com/exterior.jpg', role: 'EXTERIOR' },
      { url: 'https://cdn.example.com/cover.jpg', role: 'COVER' },
    ];
    expect(resolveDealCoverPhoto(photos)).toBe('https://cdn.example.com/cover.jpg');
  });
});

describe('Adversarial Stress Test: Price Band Parsing (parsePriceBandToWon)', () => {
  it('returns null for zero, negative, empty, or unparseable price strings', () => {
    expect(parsePriceBandToWon(0)).toBeNull();
    expect(parsePriceBandToWon(-500)).toBeNull();
    expect(parsePriceBandToWon('0')).toBeNull();
    expect(parsePriceBandToWon('0억')).toBeNull();
    expect(parsePriceBandToWon('0원')).toBeNull();
    expect(parsePriceBandToWon('')).toBeNull();
    expect(parsePriceBandToWon('   ')).toBeNull();
    expect(parsePriceBandToWon(null)).toBeNull();
    expect(parsePriceBandToWon(undefined)).toBeNull();
    expect(parsePriceBandToWon('가격 미정')).toBeNull();
    expect(parsePriceBandToWon('협의')).toBeNull();
    expect(parsePriceBandToWon('월세 500만')).toBe(5_000_000);
    expect(parsePriceBandToWon('보증금 1억')).toBe(100_000_000);
  });

  it('parses typical and irregular Korean price representations', () => {
    expect(parsePriceBandToWon('50억')).toBe(5_000_000_000);
    expect(parsePriceBandToWon('225억 원')).toBe(22_500_000_000);
    expect(parsePriceBandToWon('760억')).toBe(76_000_000_000);
    expect(parsePriceBandToWon('12.5억')).toBe(1_250_000_000);
    expect(parsePriceBandToWon('0.8억')).toBe(80_000_000);
    expect(parsePriceBandToWon('1,200억')).toBe(120_000_000_000);
    expect(parsePriceBandToWon('5,000만원')).toBe(50_000_000);
    expect(parsePriceBandToWon('300만')).toBe(3_000_000);
  });

  it('parses range strings by extracting valid upper/bound eok values', () => {
    expect(parsePriceBandToWon('40~50억')).toBe(5_000_000_000);
    expect(parsePriceBandToWon('50-60억')).toBe(6_000_000_000);
    // When written as 50억~60억, upper bound is 60억
    expect(parsePriceBandToWon('50억~60억')).toBe(6_000_000_000);
  });

  it('handles numeric numbers in Won vs Eok heuristics', () => {
    // Large number > 10,000,000 is treated as Won
    expect(parsePriceBandToWon(5_000_000_000)).toBe(5_000_000_000);
    expect(parsePriceBandToWon(50_000_000)).toBe(50_000_000);
    // Small number <= 100,000 is treated as Eok
    expect(parsePriceBandToWon(50)).toBe(5_000_000_000);
    expect(parsePriceBandToWon(225)).toBe(22_500_000_000);
    expect(parsePriceBandToWon(1.5)).toBe(150_000_000);
  });
});

describe('Adversarial Stress Test: Single Deal Adapter (adaptBuildingToMagazineDeal)', () => {
  it('handles completely empty / minimal building object without crashing', () => {
    const minimalBuilding = {
      id: 'bldg-empty',
    };
    const deal = adaptBuildingToMagazineDeal({ building: minimalBuilding });

    expect(deal.id).toBe('bldg-empty');
    expect(deal.address).toBe('');
    expect(deal.areaSignal).toBe('');
    expect(deal.assetType).toBe('상업용 부동산');
    expect(deal.price).toBe('가격 비공개');
    expect(deal.priceWon).toBeNull();
    expect(deal.photoUrl).toBeNull();
    expect(deal.photoUrls).toEqual([]);
    expect(deal.buyerInterestCount).toBe(0);
    expect(deal.investmentPoint).toBe('핵심 상권 상업용 부동산');
    expect(deal.imUrl).toBe('/im-lite/bldg-empty');
    expect(deal.grossYieldNetOfDeposit).toBeNull();
    expect(deal.noiCapRate).toBeNull();
    expect(deal.grossYieldOnPrice).toBeNull();
    expect(deal.deposit).toBeNull();
    expect(deal.monthlyRent).toBeNull();
    expect(deal.annualRent).toBeNull();
    expect(deal.landAreaM2).toBeNull();
    expect(deal.landAreaPyeong).toBeNull();
    expect(deal.grossFloorAreaM2).toBeNull();
    expect(deal.grossFloorAreaPyeong).toBeNull();
    expect(deal.floors).toBeNull();
    expect(deal.zoning).toBeNull();
    expect(deal.status).toBe('draft');
  });

  it('handles null layers and null imDoc gracefully', () => {
    const deal = adaptBuildingToMagazineDeal({
      building: {
        id: 'bldg-null-layers',
        raw_address: null,
        area_signal: null,
        asset_type: null,
        layers: null,
      },
      imDoc: null,
    });
    expect(deal.id).toBe('bldg-null-layers');
    expect(deal.address).toBe('');
    expect(deal.attrs).toEqual({});
  });

  it('zero price results in null priceWon and null yields (no divide-by-zero)', () => {
    const deal = adaptBuildingToMagazineDeal({
      building: {
        id: 'bldg-zero-price',
        price_band: '0원',
        layers: {
          askingPriceManwon: 0,
          totalDepositManwon: 50_000,
          monthlyRentTotalKrw: 25_000_000,
        },
      },
    });
    expect(deal.priceWon).toBeNull();
    expect(deal.grossYieldNetOfDeposit).toBeNull();
    expect(deal.grossYieldOnPrice).toBeNull();
  });

  it('price == deposit produces null net yield (does NOT divide by zero or yield Infinity)', () => {
    const deal = adaptBuildingToMagazineDeal({
      building: {
        id: 'bldg-equal-deposit',
        price_band: '50억',
        layers: {
          askingPriceManwon: 500_000, // 50억
          totalDepositManwon: 500_000, // 50억 (price == deposit)
          monthlyRentTotalKrw: 25_000_000,
        },
      },
    });
    expect(deal.priceWon).toBe(5_000_000_000);
    // net = 50억 - 50억 = 0 => net > 0 is false, grossYieldNetOfDeposit must be null
    expect(deal.grossYieldNetOfDeposit).toBeNull();
    // grossYieldOnPrice is 2500만*12 / 50억 = 6.00%
    expect(deal.grossYieldOnPrice).toBe(6.0);
  });

  it('price < deposit produces null net yield (does NOT produce negative yield)', () => {
    const deal = adaptBuildingToMagazineDeal({
      building: {
        id: 'bldg-deposit-exceeds-price',
        price_band: '30억',
        layers: {
          askingPriceManwon: 300_000, // 30억
          totalDepositManwon: 500_000, // 50억 (deposit > price)
          monthlyRentTotalKrw: 25_000_000,
        },
      },
    });
    expect(deal.priceWon).toBe(3_000_000_000);
    expect(deal.grossYieldNetOfDeposit).toBeNull();
  });

  it('zero or negative monthly rent does not calculate yields', () => {
    const dealZeroRent = adaptBuildingToMagazineDeal({
      building: {
        id: 'bldg-zero-rent',
        price_band: '50억',
        layers: {
          askingPriceManwon: 500_000,
          totalDepositManwon: 50_000,
          monthlyRentTotalKrw: 0,
        },
      },
    });
    expect(dealZeroRent.grossYieldNetOfDeposit).toBeNull();
    expect(dealZeroRent.grossYieldOnPrice).toBeNull();

    const dealNegativeRent = adaptBuildingToMagazineDeal({
      building: {
        id: 'bldg-neg-rent',
        price_band: '50억',
        layers: {
          askingPriceManwon: 500_000,
          totalDepositManwon: 50_000,
          monthlyRentTotalKrw: -5_000_000,
        },
      },
    });
    expect(dealNegativeRent.grossYieldNetOfDeposit).toBeNull();
    expect(dealNegativeRent.grossYieldOnPrice).toBeNull();
  });

  it('missing deposit defaults to 0 and calculates net yield on full price', () => {
    const dealNoDeposit = adaptBuildingToMagazineDeal({
      building: {
        id: 'bldg-no-deposit',
        price_band: '50억',
        layers: {
          askingPriceManwon: 500_000,
          monthlyRentTotalKrw: 25_000_000, // 3억/년
        },
      },
    });
    expect(dealNoDeposit.priceWon).toBe(5_000_000_000);
    expect(dealNoDeposit.deposit).toBe(0);
    // 3억 / (50억 - 0) * 100 = 6.00%
    expect(dealNoDeposit.grossYieldNetOfDeposit).toBe(6.0);
    expect(dealNoDeposit.grossYieldOnPrice).toBe(6.0);
  });

  it('performs area conversion with high-precision fractional values correctly (PYEONG_RATIO = 0.3025)', () => {
    const deal = adaptBuildingToMagazineDeal({
      building: {
        id: 'bldg-fractional-area',
        layers: {
          landAreaM2: 330.5785,
          grossFloorAreaM2: 991.7355,
        },
      },
    });
    // 330.5785 rounds to 330.58 m2
    expect(deal.landAreaM2).toBe(330.58);
    // 330.58 * 0.3025 = 100.00045 => 100.0 pyeong
    expect(deal.landAreaPyeong).toBe(100.0);

    // 991.7355 rounds to 991.74 m2
    expect(deal.grossFloorAreaM2).toBe(991.74);
    // 991.74 * 0.3025 = 300.00135 => 300.0 pyeong
    expect(deal.grossFloorAreaPyeong).toBe(300.0);
  });

  it('handles negative or invalid area inputs without producing NaN', () => {
    const deal = adaptBuildingToMagazineDeal({
      building: {
        id: 'bldg-invalid-area',
        layers: {
          landAreaM2: -100,
          grossFloorAreaM2: 'invalid-string',
        },
      },
    });
    expect(deal.landAreaM2).toBeNull();
    expect(deal.landAreaPyeong).toBeNull();
    expect(deal.grossFloorAreaM2).toBeNull();
    expect(deal.grossFloorAreaPyeong).toBeNull();
  });

  it('extracts investment thesis from body sections when heroCard/overrides are missing', () => {
    const deal = adaptBuildingToMagazineDeal({
      building: {
        id: 'bldg-sections-thesis',
        area_signal: '성수',
        asset_type: '근생',
      },
      imDoc: {
        body: {
          sections: [
            {
              sectionId: '06_buyer_fit',
              content: '• 성수동 연무장길 인근 F&B 플래그십 적합지\n• 추가 리모델링 가능',
            },
          ],
        },
      },
    });
    expect(deal.investmentPoint).toBe('성수동 연무장길 인근 F&B 플래그십 적합지');
  });

  it('uses pendingSnippet photo and investmentPoint when body/layers lack them', () => {
    const deal = adaptBuildingToMagazineDeal({
      building: {
        id: 'bldg-pending',
      },
      pendingSnippet: {
        photoUrl: 'https://cdn.example.com/pending-photo.jpg',
        investmentPoint: '펜딩 스니펫 투자 포인트',
      },
    });
    expect(deal.photoUrl).toBe('https://cdn.example.com/pending-photo.jpg');
    expect(deal.investmentPoint).toBe('펜딩 스니펫 투자 포인트');
  });
});

describe('Adversarial Stress Test: ROI Engine Parity (computeRoi & clampInput)', () => {
  it('does NOT divide by zero when purchasePrice == deposit', () => {
    const result = computeRoi({
      purchasePrice: 500_000_000,
      ltvRatio: 0,
      interestRate: 4.5,
      deposit: 500_000_000, // purchasePrice == deposit
      monthlyRent: 2_500_000,
      vacancyFloors: 0,
      totalFloors: 5,
    });
    expect(Number.isFinite(result.netYieldOnDeposit)).toBe(true);
    expect(result.netYieldOnDeposit).toBe(0);
    expect(result.capRate).toBeGreaterThan(0);
  });

  it('does NOT divide by zero or yield negative net yield when purchasePrice < deposit', () => {
    const result = computeRoi({
      purchasePrice: 400_000_000,
      ltvRatio: 0,
      interestRate: 4.5,
      deposit: 500_000_000, // purchasePrice < deposit
      monthlyRent: 2_500_000,
      vacancyFloors: 0,
      totalFloors: 5,
    });
    expect(Number.isFinite(result.netYieldOnDeposit)).toBe(true);
    expect(result.netYieldOnDeposit).toBe(0);
  });

  it('does NOT divide by zero when purchasePrice is 0', () => {
    const result = computeRoi({
      purchasePrice: 0,
      ltvRatio: 50,
      interestRate: 4.5,
      deposit: 0,
      monthlyRent: 0,
      vacancyFloors: 0,
      totalFloors: 5,
    });
    expect(Number.isFinite(result.capRate)).toBe(true);
    expect(result.capRate).toBe(0);
    expect(result.netYieldOnDeposit).toBe(0);
    expect(Number.isFinite(result.cashOnCash)).toBe(true);
    expect(result.equity).toBe(1); // Protected by Math.max(..., 1)
  });

  it('handles zero totalFloors safely without division by zero', () => {
    const result = computeRoi({
      ...ROI_DEFAULTS,
      totalFloors: 0,
    });
    expect(Number.isFinite(result.occupancyRate)).toBe(true);
    expect(result.occupancyRate).toBe(100);
    expect(Number.isFinite(result.netYieldOnDeposit)).toBe(true);
  });

  it('handles 100% vacancy (vacancyFloors == totalFloors)', () => {
    const result = computeRoi({
      ...ROI_DEFAULTS,
      vacancyFloors: 5,
      totalFloors: 5,
    });
    expect(result.occupancyRate).toBe(0);
    expect(result.annualRent).toBe(0);
    expect(result.netYieldOnDeposit).toBe(0);
  });

  it('handles zero deposit and zero rent', () => {
    const resultZeroRent = computeRoi({
      ...ROI_DEFAULTS,
      monthlyRent: 0,
    });
    expect(resultZeroRent.annualRent).toBe(0);
    expect(resultZeroRent.netYieldOnDeposit).toBe(0);

    const resultZeroDeposit = computeRoi({
      ...ROI_DEFAULTS,
      deposit: 0,
    });
    // 1500만*12 = 1.8억 / 30억 = 6.0%
    expect(resultZeroDeposit.netYieldOnDeposit).toBe(6.0);
  });

  it('clampInput rejects NaN, Infinity, -Infinity and clamps bounds correctly', () => {
    expect(clampInput(NaN, 1, 60)).toBeNull();
    expect(clampInput(Infinity, 1, 60)).toBeNull();
    expect(clampInput(-Infinity, 1, 60)).toBeNull();
    expect(clampInput(-10, 1, 60)).toBe(1);
    expect(clampInput(100, 1, 60)).toBe(60);
    expect(clampInput(5, 1, 60)).toBe(5);
  });
});

describe('Adversarial Stress Test: Candidate Deal Fetcher Query Error & Edge Resilience', () => {
  it('returns empty array when Supabase returns an error', async () => {
    const mockSupabaseError = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Database connection failed' },
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const deals = await fetchMagazineCandidateDeals(mockSupabaseError, 'user-xyz');
    expect(deals).toEqual([]);
  });

  it('returns empty array when no deals match query', async () => {
    const mockSupabaseEmpty = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const deals = await fetchMagazineCandidateDeals(mockSupabaseEmpty, 'user-xyz');
    expect(deals).toEqual([]);
  });

  it('handles document_objects query exception gracefully without failing deal adaptation', async () => {
    const mockDeals = [
      {
        id: 'deal-doc-fail',
        raw_address: '서울시 역삼동',
        price_band: '50억',
        status: 'draft',
      },
    ];

    const mockSupabaseDocCrash = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'building_ssot_lite') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: mockDeals,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'document_objects') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                in: vi.fn().mockRejectedValue(new Error('document_objects table timeout')),
              }),
            }),
          };
        }
        return {};
      }),
    };

    const deals = await fetchMagazineCandidateDeals(mockSupabaseDocCrash, 'user-xyz');
    expect(deals).toHaveLength(1);
    expect(deals[0].id).toBe('deal-doc-fail');
    expect(deals[0].address).toBe('서울시 역삼동');
  });
});

describe('Adversarial Stress Test: Special Edition Deals with Missing Title or Address', () => {
  it('generates a valid MagazineDealItem when both building and imDoc have no title or address', () => {
    const headlessSpecialBuilding = {
      id: 'special-missing-meta',
      raw_address: null,
      area_signal: null,
      asset_type: null,
      price_band: '225억 원',
      status: 'public_signal_ready',
      layers: {
        askingPriceDisplay: '225억 원',
        askingPriceManwon: 2_250_000,
        totalDepositManwon: 150_000,
        monthlyRentTotalKrw: 80_000_000,
      },
    };

    const adapted = adaptBuildingToMagazineDeal({
      building: headlessSpecialBuilding,
      imDoc: null,
    });

    expect(adapted.id).toBe('special-missing-meta');
    expect(adapted.address).toBe('');
    expect(adapted.areaSignal).toBe('');
    expect(adapted.assetType).toBe('상업용 부동산');
    expect(adapted.price).toBe('225억 원');
    expect(adapted.priceWon).toBe(22_500_000_000);
    // Fallback thesis when areaSignal and title are absent
    expect(adapted.investmentPoint).toBe('핵심 상권 상업용 부동산');
    expect(adapted.imUrl).toBe('/im-lite/special-missing-meta');
    // Financial yield calculation is preserved even without address
    // 8000만 * 12 / (225억 - 15억) = 9.6억 / 210억 = 4.5714% => 4.57%
    expect(adapted.grossYieldNetOfDeposit).toBe(4.57);
  });

  it('safely integrates into Special Edition reader structure without throwing', () => {
    const specialDealAdapted = adaptBuildingToMagazineDeal({
      building: {
        id: 'special-deal-reader-safe',
        raw_address: undefined,
        price_band: '50억',
      },
    });

    const specialEditionDoc = {
      schemaVersion: 1,
      kind: 'special',
      title: '긴급 속보: 강남권 급매물',
      featured_deals: [specialDealAdapted],
      dealHighlights: [specialDealAdapted],
      specialDeal: {
        id: specialDealAdapted.id,
        areaSignal: specialDealAdapted.areaSignal,
        assetType: specialDealAdapted.assetType,
        price: specialDealAdapted.price,
        photoUrl: specialDealAdapted.photoUrl,
        teaser: null,
      },
    };

    expect(specialEditionDoc.featured_deals[0].address).toBe('');
    expect(specialEditionDoc.featured_deals[0].imUrl).toBe('/im-lite/special-deal-reader-safe');
    expect(specialEditionDoc.featured_deals[0].investmentPoint).toBeTruthy();
  });
});

