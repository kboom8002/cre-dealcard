/**
 * @file deal-adapter.test.ts
 * @description Comprehensive unit tests for Wave 1 Basic IM & Studio ↔ Magazine SSOT Data Bridge & Financial Parity.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  resolveDealCoverPhoto,
  resolveDealPhotoUrls,
  parsePriceBandToWon,
  adaptBuildingToMagazineDeal,
  fetchMagazineCandidateDeals,
  VALID_MAGAZINE_DEAL_STATUSES,
} from '@/domain/magazine/deal-adapter';
import { computeRoi, ROI_DEFAULTS } from '@/components/magazine/roi-calc';
import { PYEONG_RATIO } from '@/lib/utils/area-conversion';

describe('1. Photo Resolution Hierarchy (resolveDealCoverPhoto & resolveDealPhotoUrls)', () => {
  it('isCover: true가 isExterior: true 및 일반 사진보다 최우선 선택된다', () => {
    const photos = [
      { url: 'https://cdn.example.com/exterior.jpg', isExterior: true },
      { url: 'https://cdn.example.com/cover.jpg', isCover: true },
      { url: 'https://cdn.example.com/lobby.jpg' },
    ];
    expect(resolveDealCoverPhoto(photos)).toBe('https://cdn.example.com/cover.jpg');
  });

  it('isHero: true 또는 role: "cover"도 커버 사진으로 인식된다', () => {
    const photosHero = [
      { url: 'https://cdn.example.com/lobby.jpg' },
      { url: 'https://cdn.example.com/hero.jpg', isHero: true },
    ];
    expect(resolveDealCoverPhoto(photosHero)).toBe('https://cdn.example.com/hero.jpg');

    const photosRole = [
      { url: 'https://cdn.example.com/lobby.jpg' },
      { url: 'https://cdn.example.com/role-cover.jpg', role: 'cover' },
    ];
    expect(resolveDealCoverPhoto(photosRole)).toBe('https://cdn.example.com/role-cover.jpg');
  });

  it('커버가 없을 때 isExterior: true, role: "exterior", category: "exterior"가 차순위로 선택된다', () => {
    const photosExterior = [
      { url: 'https://cdn.example.com/interior.jpg' },
      { url: 'https://cdn.example.com/exterior.jpg', isExterior: true },
    ];
    expect(resolveDealCoverPhoto(photosExterior)).toBe('https://cdn.example.com/exterior.jpg');

    const photosCategory = [
      { url: 'https://cdn.example.com/interior.jpg' },
      { url: 'https://cdn.example.com/exterior-cat.jpg', category: 'exterior' },
    ];
    expect(resolveDealCoverPhoto(photosCategory)).toBe('https://cdn.example.com/exterior-cat.jpg');
  });

  it('커버/외관 메타데이터가 없을 때 첫 번째 유효 사진으로 폴백한다', () => {
    const photos = [
      { url: 'https://cdn.example.com/first.jpg' },
      { url: 'https://cdn.example.com/second.jpg' },
    ];
    expect(resolveDealCoverPhoto(photos)).toBe('https://cdn.example.com/first.jpg');
  });

  it('excluded: true 사진과 .wdp 형식 사진은 제외된다', () => {
    const photos = [
      { url: 'https://cdn.example.com/excluded-cover.jpg', isCover: true, excluded: true },
      { url: 'https://cdn.example.com/unsupported.wdp', isCover: true },
      { url: 'https://cdn.example.com/valid-photo.jpg' },
    ];
    expect(resolveDealCoverPhoto(photos)).toBe('https://cdn.example.com/valid-photo.jpg');
    expect(resolveDealPhotoUrls(photos)).toEqual(['https://cdn.example.com/valid-photo.jpg']);
  });

  it('오브젝트 스키마 ({ urls: [...] }) 및 문자열 배열 스키마를 모두 정규화하여 처리한다', () => {
    const objectSchema = {
      urls: [
        'https://cdn.example.com/obj1.jpg',
        'https://cdn.example.com/obj2.jpg',
      ],
    };
    expect(resolveDealCoverPhoto(objectSchema)).toBe('https://cdn.example.com/obj1.jpg');
    expect(resolveDealPhotoUrls(objectSchema)).toEqual([
      'https://cdn.example.com/obj1.jpg',
      'https://cdn.example.com/obj2.jpg',
    ]);

    const stringArray = [
      'https://cdn.example.com/arr1.jpg',
      'https://cdn.example.com/arr2.jpg',
    ];
    expect(resolveDealCoverPhoto(stringArray)).toBe('https://cdn.example.com/arr1.jpg');
    expect(resolveDealPhotoUrls(stringArray)).toEqual(stringArray);
  });

  it('사진이 없거나 빈 데이터일 때 null을 반환한다', () => {
    expect(resolveDealCoverPhoto(null)).toBeNull();
    expect(resolveDealCoverPhoto(undefined)).toBeNull();
    expect(resolveDealCoverPhoto([])).toBeNull();
    expect(resolveDealCoverPhoto({ urls: [] })).toBeNull();
    expect(resolveDealPhotoUrls(null)).toEqual([]);
  });
});

describe('2. Price Band Parser (parsePriceBandToWon)', () => {
  it('다양한 한국어 가격 표기 문자열을 원(KRW) 단위 정수로 정확히 환산한다', () => {
    expect(parsePriceBandToWon('50억')).toBe(5_000_000_000);
    expect(parsePriceBandToWon('760억')).toBe(76_000_000_000);
    expect(parsePriceBandToWon('225억 원')).toBe(22_500_000_000);
    expect(parsePriceBandToWon('12.5억')).toBe(1_250_000_000);
    // 밴드 범위일 경우 상한가 파싱
    expect(parsePriceBandToWon('40~50억')).toBe(5_000_000_000);
    expect(parsePriceBandToWon('40억~50억')).toBe(5_000_000_000);
    expect(parsePriceBandToWon('40억 ~ 50억 원')).toBe(5_000_000_000);
    expect(parsePriceBandToWon('40억-50억')).toBe(5_000_000_000);
    // 만원 단위 파싱 (단일 및 범위)
    expect(parsePriceBandToWon('5,000만')).toBe(50_000_000);
    expect(parsePriceBandToWon('3,000만~5,000만원')).toBe(50_000_000);
    // 숫자 원 단위
    expect(parsePriceBandToWon(5_000_000_000)).toBe(5_000_000_000);
  });

  it('유효하지 않은 입력에는 null을 반환한다', () => {
    expect(parsePriceBandToWon(null)).toBeNull();
    expect(parsePriceBandToWon(undefined)).toBeNull();
    expect(parsePriceBandToWon('')).toBeNull();
    expect(parsePriceBandToWon('가격 협의')).toBeNull();
  });
});

describe('3. Single Deal Adapter (adaptBuildingToMagazineDeal)', () => {
  const mockBuilding = {
    id: 'bldg-1234-abcd',
    raw_address: '서울 강남구 역삼동 736-1',
    area_signal: '강남',
    asset_type: '꼬마빌딩',
    price_band: '50억',
    status: 'public_signal_ready',
    matched_buyer_count: 7,
    layers: {
      askingPriceManwon: 500_000,
      totalDepositManwon: 50_000,
      monthlyRentTotalKrw: 25_000_000,
      landAreaM2: 330.58,
      grossFloorAreaM2: 991.74,
      floors: '지하 1층 / 지상 5층',
      zoning: '제2종일반주거지역',
      photos: {
        urls: ['https://cdn.example.com/bldg-ext.jpg'],
      },
    },
  };

  const mockImDoc = {
    doc_type: 'im_lite',
    body: {
      heroCard: {
        keyInvestmentPoint: '역삼역 도보 3분 초역세권 근생',
        askingPriceDisplay: '50억 원',
        assetType: '꼬마빌딩',
      },
      ssot_summary: {
        address: '서울 강남구 역삼동 736-1',
        area_signal: '강남',
        asset_type: '꼬마빌딩',
        asking_price_manwon: 500_000,
        total_deposit_manwon: 50_000,
        monthly_rent_total_krw: 25_000_000,
        land_area_sqm: 330.58,
        total_gross_area_sqm: 991.74,
        floors: 'B1/5F',
        zoning: '제2종일반주거지역',
      },
      financials: {
        depositKrw: 500_000_000,
        annualRentBil: 3.0, // 3억
        noiBaseKrw: 270_000_000,
        capRate: 5.4,
      },
      _studioSlideOverrides: {
        overview: {
          investmentPoint: '스튜디오 맞춤: 강남 테헤란로 이면 최고 입지 올근생',
          floors: '지하 1층 ~ 지상 6층 (증축 완료)',
        },
      },
      photos_v2: [
        { url: 'https://cdn.example.com/studio-cover.jpg', isCover: true },
        { url: 'https://cdn.example.com/studio-ext.jpg', isExterior: true },
      ],
    },
  };

  it('Basic IM SSOT 및 Studio Overrides를 우선 반영하여 매거진 딜 카드로 변환한다', () => {
    const deal = adaptBuildingToMagazineDeal({
      building: mockBuilding,
      imDoc: mockImDoc,
    });

    expect(deal.id).toBe('bldg-1234-abcd');
    expect(deal.areaSignal).toBe('강남');
    expect(deal.assetType).toBe('꼬마빌딩');
    expect(deal.price).toBe('50억 원');
    expect(deal.priceWon).toBe(5_000_000_000);
    // Studio 커버 사진 우선
    expect(deal.photoUrl).toBe('https://cdn.example.com/studio-cover.jpg');
    // Studio Slide Overrides 투자포인트 우선
    expect(deal.investmentPoint).toBe('스튜디오 맞춤: 강남 테헤란로 이면 최고 입지 올근생');
    // Studio Slide Overrides 층수 우선
    expect(deal.floors).toBe('지하 1층 ~ 지상 6층 (증축 완료)');
    // IM URL 생성
    expect(deal.imUrl).toBe('/im-lite/bldg-1234-abcd');
    // 면적 환산 SSOT (PYEONG_RATIO = 0.3025)
    expect(deal.landAreaM2).toBe(330.58);
    expect(deal.landAreaPyeong).toBe(Number((330.58 * PYEONG_RATIO).toFixed(1))); // 100.0
    expect(deal.grossFloorAreaM2).toBe(991.74);
    expect(deal.grossFloorAreaPyeong).toBe(Number((991.74 * PYEONG_RATIO).toFixed(1))); // 300.0
  });

  it('YieldSet SSOT 기반 실질 임대수익률(grossYieldNetOfDeposit)을 정확히 산출한다', () => {
    const deal = adaptBuildingToMagazineDeal({
      building: mockBuilding,
      imDoc: mockImDoc,
    });

    // 매매가 50억, 보증금 5억 -> 실투자 분모 45억, 연임대료 3억
    // 3억 / 45억 * 100 = 6.67%
    expect(deal.grossYieldNetOfDeposit).toBe(6.67);
    expect(deal.deposit).toBe(500_000_000);
    expect(deal.annualRent).toBe(300_000_000);
    expect(deal.monthlyRent).toBe(25_000_000);
    expect(deal.noiCapRate).toBe(5.4);
  });

  it('imDoc이 없을 때 building.layers로부터 폴백 수치를 계산한다', () => {
    const deal = adaptBuildingToMagazineDeal({
      building: mockBuilding,
      imDoc: null,
    });

    expect(deal.id).toBe('bldg-1234-abcd');
    expect(deal.priceWon).toBe(5_000_000_000);
    expect(deal.deposit).toBe(500_000_000);
    expect(deal.annualRent).toBe(300_000_000);
    expect(deal.monthlyRent).toBe(25_000_000);
    // 3억 / (50억 - 5억) * 100 = 6.67%
    expect(deal.grossYieldNetOfDeposit).toBe(6.67);
    expect(deal.photoUrl).toBe('https://cdn.example.com/bldg-ext.jpg');
    expect(deal.imUrl).toBe('/im-lite/bldg-1234-abcd');
  });
});

describe('4. Candidate Deal Query Status Filter Integrity', () => {
  it('유효 매물 상태에 phantom "active"가 없으며 public_signal_ready, snapshot_draft_ready, draft가 포함된다', () => {
    expect(VALID_MAGAZINE_DEAL_STATUSES).toContain('public_signal_ready');
    expect(VALID_MAGAZINE_DEAL_STATUSES).toContain('snapshot_draft_ready');
    expect(VALID_MAGAZINE_DEAL_STATUSES).toContain('draft');
    // @ts-expect-error - 'active'는 존재하지 않는 상태
    expect(VALID_MAGAZINE_DEAL_STATUSES.includes('active')).toBe(false);
  });

  it('fetchMagazineCandidateDeals가 DB 쿼리 시 유효한 상태만 필터링한다', async () => {
    const mockInStatuses = vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'b-1',
              raw_address: '역삼동',
              area_signal: '강남',
              asset_type: '빌딩',
              price_band: '50억',
              status: 'public_signal_ready',
              layers: {},
            },
          ],
          error: null,
        }),
      }),
    });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'building_ssot_lite') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: mockInStatuses,
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }),
    };

    const deals = await fetchMagazineCandidateDeals(mockSupabase, 'user-123');
    expect(deals).toHaveLength(1);
    expect(mockInStatuses).toHaveBeenCalledWith('status', ['public_signal_ready', 'snapshot_draft_ready', 'draft']);
  });
});

describe('5. ROI Calculator Net-of-Deposit Financial Parity', () => {
  it('computeRoi가 보증금 차감 실질 임대수익률(netYieldOnDeposit)을 정확히 산출한다', () => {
    // 양호 시나리오: 매입가 50억, 보증금 5억, 월세 2,500만 (연 3억)
    // netYieldOnDeposit = 3억 / (50억 - 5억) * 100 = 6.6666...%
    const rGood = computeRoi({
      purchasePrice: 5_000_000_000,
      ltvRatio: 50,
      interestRate: 4.5,
      deposit: 500_000_000,
      monthlyRent: 25_000_000,
      vacancyFloors: 0,
      totalFloors: 5,
    });
    expect(rGood.netYieldOnDeposit.toFixed(2)).toBe('6.67');
    expect(rGood.capRate.toFixed(2)).toBe('5.70'); // 기존 회귀 불변 검증
    expect(rGood.cashOnCash.toFixed(2)).toBe('8.63'); // 기존 회귀 불변 검증

    // 위험 시나리오: 매입가 50억, 보증금 2억, 월세 1,500만 (연 1.8억), 5개 층 중 3개 층 공실 (가동률 40%)
    // effectiveRent = 1.8억 * 0.4 = 72,000,000
    // netPurchase = 50억 - 2억 = 48억
    // netYieldOnDeposit = 72,000,000 / 4,800,000,000 * 100 = 1.50%
    const rRisk = computeRoi({
      purchasePrice: 5_000_000_000,
      ltvRatio: 70,
      interestRate: 6.0,
      deposit: 200_000_000,
      monthlyRent: 15_000_000,
      vacancyFloors: 3,
      totalFloors: 5,
    });
    expect(rRisk.netYieldOnDeposit.toFixed(2)).toBe('1.50');
    expect(rRisk.capRate.toFixed(2)).toBe('1.34'); // 기존 회귀 불변 검증
    expect(rRisk.cashOnCash.toFixed(2)).toBe('-10.06'); // 기존 회귀 불변 검증
  });
});

describe('6. Special Edition Deal Population & Reader View Consumption', () => {
  it('속보 에디션 생성 시 featured_deals와 dealHighlights가 모두 어댑터 객체로 채워져 리더 뷰에서 카드 렌더링이 보장된다', () => {
    const rawBuilding = {
      id: 'special-deal-999',
      raw_address: '서울 성동구 성수동2가 277-47',
      area_signal: '성수',
      asset_type: '근린생활시설',
      price_band: '120억',
      status: 'public_signal_ready',
      layers: {
        askingPriceDisplay: '120억 원',
        askingPriceManwon: 1_200_000,
        totalDepositManwon: 100_000,
        monthlyRentTotalKrw: 45_000_000,
        photos: {
          urls: ['https://cdn.example.com/seongsu.jpg'],
        },
      },
    };

    const adapted = adaptBuildingToMagazineDeal({ building: rawBuilding });

    // 시뮬레이션: 속보 생성기 content 구조
    const specialEditionContent: Record<string, unknown> = {
      schemaVersion: 1,
      kind: 'special',
      featured_deal_ids: [rawBuilding.id],
      featured_deals: [adapted],
      dealHighlights: [adapted],
      specialDeal: {
        id: rawBuilding.id,
        areaSignal: rawBuilding.area_signal,
        assetType: rawBuilding.asset_type,
        price: '120억 원',
        photoUrl: adapted.photoUrl,
        teaser: null,
      },
    };

    // reader view (magazine-view.tsx:124) consumption pattern:
    const featuredDeals = Array.isArray(specialEditionContent.featured_deals)
      ? specialEditionContent.featured_deals
      : Array.isArray(specialEditionContent.dealHighlights)
      ? specialEditionContent.dealHighlights
      : [];

    expect(featuredDeals).toHaveLength(1);
    expect(featuredDeals[0].id).toBe('special-deal-999');
    expect(featuredDeals[0].photoUrl).toBe('https://cdn.example.com/seongsu.jpg');
    expect(featuredDeals[0].grossYieldNetOfDeposit).toBe(4.91); // 4500만*12 / (120억-10억) = 5.4억 / 110억 = 4.909%
    expect(featuredDeals[0].imUrl).toBe('/im-lite/special-deal-999');
  });
});

