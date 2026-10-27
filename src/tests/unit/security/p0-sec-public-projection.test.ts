/**
 * P0-SEC (SEC-5) — public projection poison-token tests.
 *
 * Feeds a building whose private fields (raw_input, raw_address, exact jibun, building name,
 * tenant names, unit rents, memo phone) carry poison tokens through toPublicDealCard() and
 * asserts none of them survive into the DTO that crosses the server→client boundary.
 */
import { describe, it, expect, vi } from 'vitest';

// ssot-adapter imports the service client at module load — isolate from env/network.
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }));

import {
  toPublicDealCard,
  PublicDealCardSchema,
  collectSensitiveNeedles,
  maskNeedles,
} from '@/domain/public-projection/deal-card';

const POISON_ADDR = '서울특별시 영등포구 당산동5가 POISON_ADDR_117-3번지 호산당빌딩';
const POISON_TOKENS = [
  'POISON_ADDR_117-3번지',
  '117-3',
  '호산당빌딩',
  'POISON_MEMO',
  'POISON_TENANT_스타벅스',
  'POISON_TENANT_김약국',
  '010-9999-1234',
  '12345678',
  '7654321',
  'POISON_PNU_1156012000',
  'POISON_SELLER',
];

function poisonedBuilding(): Record<string, any> {
  return {
    id: 'bldg-poison',
    owner_id: 'owner-1',
    status: 'public_signal_ready',
    input_type: 'broker_memo',
    raw_input:
      `POISON_MEMO 당산동 ${POISON_ADDR} 매매 85억, 월세 3200만, 매도자 POISON_SELLER 급매, 연락 010-9999-1234`,
    raw_address: POISON_ADDR,
    pnu: 'POISON_PNU_1156012000',
    area_signal: '당산역 권역',
    asset_type: '근린생활시설',
    price_band: '80억대',
    vacancy_signal: '만실',
    hidden_fields: ['exact_address', 'tenant_name', 'unit_rent'],
    disclosure: { guard_checked: true },
    lease_summary: {
      tenants: [
        { floor: '1F', tenant_name: 'POISON_TENANT_스타벅스', monthly_rent_krw: 12345678, deposit_krw: 7654321 },
        { floor: '2F', tenant_name: 'POISON_TENANT_김약국', monthly_rent_krw: 7654321 },
      ],
    },
    layers: {
      pnu: 'POISON_PNU_1156012000',
      location: {
        raw_address: POISON_ADDR,
        exact_address: POISON_ADDR,
        sigungu: '영등포구',
      },
      rent_roll: [
        { floor: '1F', tenant_name: 'POISON_TENANT_스타벅스', monthly_rent_krw: 12345678 },
      ],
      finance: { asking_price_krw: 8_500_000_000, monthly_rent_krw: 32_000_000 },
      total_floor_area_pyung: 420,
      land_area_pyung: 110,
    },
  };
}

function project(overrides: Partial<Parameters<typeof toPublicDealCard>[0]> = {}) {
  return toPublicDealCard({
    id: 'bldg-poison',
    building: poisonedBuilding(),
    signalCard: {
      title: '당산역 권역 근린생활시설 매각',
      area_signal: '당산역 권역',
      asset_type: '근린생활시설',
      price_band: '80억대',
      body: { shortSummary: '역세권 만실 근생' },
    },
    teaserDoc: {
      body: {
        title: '당산역 역세권 근생 매각',
        // Simulates an AI/broker copy that accidentally leaked private tokens.
        hookCopy: `호산당빌딩 1층 POISON_TENANT_스타벅스 입점`,
        dealPoints: [
          '역세권 만실 운영',
          `${POISON_ADDR} 코너 입지`,
          'POISON_TENANT_김약국 장기 임차',
        ],
      },
    },
    brokerProfile: {
      display_name: '김중개',
      phone: '010-1111-2222',
      slug: 'kim-broker',
      avatar_url: null,
      specialty: '검증 공인중개사',
      response_guarantee_hours: 2,
      closed_deals: 10,
      is_licensed: true,
    },
    hasImDoc: true,
    isPptxApproved: false,
    pptxDownloadUrl: '/api/public/im-lite/bldg-poison/pptx',
    ...overrides,
  });
}

describe('P0-SEC SEC-5: toPublicDealCard poison tokens', () => {
  it('never emits raw_input / raw_address / jibun / building name / tenant names / unit rents', () => {
    const dto = project();
    const json = JSON.stringify(dto);
    for (const token of POISON_TOKENS) {
      expect(json, `leaked token: ${token}`).not.toContain(token);
    }
  });

  it('does not expose private attr keys (strict allowlist)', () => {
    const json = JSON.stringify(project());
    for (const key of ['rawInput', 'raw_input', 'raw_address', '"address"', 'rentRoll', 'floorLeases', 'pnu', 'lease_summary', 'tenants']) {
      expect(json).not.toContain(key);
    }
    // Schema rejects unknown keys
    const dto = project();
    expect(() => PublicDealCardSchema.parse({ ...dto, rawInput: 'x' })).toThrow();
    expect(() =>
      PublicDealCardSchema.parse({ ...dto, postureWidget: { ...dto.postureWidget, address: 'x' } }),
    ).toThrow();
  });

  it('keeps the public-safe teaser values needed by the UI', () => {
    const dto = project();
    expect(dto.hero.title).toBe('당산역 역세권 근생 매각');
    expect(dto.hero.bandedPrice).toBeTruthy();
    expect(dto.dealPoints).toHaveLength(3);
    expect(dto.dealPoints[0]).toBe('역세권 만실 운영');
    expect(dto.dealPoints[1]).toContain('●●●');
    expect(dto.postureWidget.askingPriceEok).toBe(85);
    expect(dto.postureWidget.annualRentEok).toBe(3.8);
    expect(dto.postureWidget.totalFloorAreaPyung).toBe(420);
    expect(dto.broker.displayName).toBe('김중개');
    // Broker contact phone is intentionally public (TrustLine / CTA call button)
    expect(dto.broker.phone).toBe('010-1111-2222');
    // OG title precedence (unchanged): kakaoOgTitle > ogTitle > signal card title
    expect(dto.og.title).toBe('당산역 권역 근린생활시설 매각');
  });

  it('works with the not-found building shape ({} from readWithMigration) and null inputs', () => {
    const dto = toPublicDealCard({
      id: 'missing',
      building: {},
      signalCard: null,
      teaserDoc: null,
      brokerProfile: null,
      hasImDoc: false,
      isPptxApproved: false,
      pptxDownloadUrl: '/api/public/im-lite/missing/pptx',
    });
    expect(dto.id).toBe('missing');
    expect(dto.teaserConfigId).toBe('missing');
    expect(dto.broker.displayName).toBe('담당 중개사');
  });

  it('collectSensitiveNeedles / maskNeedles mask exact address tokens', () => {
    const needles = collectSensitiveNeedles(poisonedBuilding());
    expect(needles).toEqual(expect.arrayContaining([POISON_ADDR, '117-3번지', '호산당빌딩', 'POISON_TENANT_스타벅스']));
    expect(maskNeedles('호산당빌딩 117-3번지 인근', needles)).not.toMatch(/호산당빌딩|117-3/);
  });
});
