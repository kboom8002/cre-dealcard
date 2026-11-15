// @vitest-environment jsdom
/**
 * Wave 3 — WP-09: 공인중개사법 제18조의2 5대 법정 표시의무 전구간 검증
 *
 * (a) validateBrokerStatutoryFields & formatBrokerStatutoryDisclosureLines
 * (b) GET / PUT /api/broker/profile — 샘플 번호·성명 400 차단 및 office_address + representative_name 저장·조회
 * (c) toPublicDealCard + <TrustLine /> — 5대 법정 표시항목 렌더링 & 샘플 플레이스홀더 제거 & 자산 본주소 블라인드 격리
 * (d) /im-lite Section 10 (<MobileIMViewer />) & /magazine (<MagazineView />) — 실데이터 표기 & 샘플 값 비노출
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireBroker = vi.fn();
const mockCreateServiceClient = vi.fn();
const mockGetBrokerSubscriptionTier = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: unknown[]) => mockRequireBroker(...args),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}));

vi.mock('@/domain/subscription/tier-gate', () => ({
  getBrokerSubscriptionTier: (...args: unknown[]) => mockGetBrokerSubscriptionTier(...args),
}));

vi.mock('@/platform/im-pipeline/realtime/use-dealcard-realtime-sync', () => ({
  useDealcardRealtimeSync: vi.fn(),
}));

import {
  SAMPLE_BROKER_NAMES,
  SAMPLE_REGISTRATION_NUMBERS,
  formatBrokerStatutoryDisclosureLines,
  validateBrokerStatutoryFields,
} from '@/lib/legal/broker-statutory-disclosure';
import { GET as getBrokerProfile, PUT as putBrokerProfile } from '@/app/api/broker/profile/route';
import { toPublicDealCard } from '@/domain/public-projection/deal-card';
import { TrustLine } from '@/components/teaser/TrustLine';
import { MobileIMViewer } from '@/app/(public)/im-lite/[buildingId]/mobile-im-viewer';
import { MagazineView } from '@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view';
import { buildBasicImDocument } from '@/domain/building/im-core/basic-im-document';
import { extractPureBuildingFacts } from '@/domain/building/im-core/facts';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

interface FakeBrokerDbState {
  profile: Record<string, any> | null;
  brokerProfile: Record<string, any> | null;
  failRepresentativeColumnOnce?: boolean;
  updatePayloads: Array<Record<string, any>>;
}

function createFakeSupabase(state: FakeBrokerDbState) {
  return {
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: { user: { user_metadata: {} } },
        }),
      },
    },
    from(table: string) {
      const builder: any = {
        _mode: 'select' as 'select' | 'update' | 'upsert' | 'insert',
        _payload: null as any,
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        neq() {
          return builder;
        },
        limit() {
          if (table === 'broker_profiles') {
            return Promise.resolve({ data: [], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        upsert(payload: Record<string, any>) {
          builder._mode = 'upsert';
          builder._payload = payload;
          if (table === 'profiles') {
            state.profile = { ...(state.profile ?? {}), ...payload };
          } else if (table === 'broker_profiles') {
            state.brokerProfile = { ...(state.brokerProfile ?? {}), ...payload };
          }
          return builder;
        },
        update(payload: Record<string, any>) {
          builder._mode = 'update';
          builder._payload = payload;
          return builder;
        },
        insert(payload: Record<string, any>) {
          builder._mode = 'insert';
          builder._payload = payload;
          return builder;
        },
        maybeSingle() {
          if (table === 'profiles') {
            return Promise.resolve({ data: state.profile, error: null });
          }
          if (table === 'broker_profiles') {
            return Promise.resolve({ data: state.brokerProfile, error: null });
          }
          if (table === 'magazine_settings') {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        single() {
          if (table === 'profiles') {
            return Promise.resolve({ data: state.profile, error: null });
          }
          return Promise.resolve({ data: state.brokerProfile, error: null });
        },
        then(onFulfilled: (val: any) => any, onRejected?: (err: any) => any) {
          let result: { data: any; error: any } = { data: null, error: null };
          if (table === 'broker_profiles' && (builder._mode === 'update' || builder._mode === 'insert')) {
            if (
              state.failRepresentativeColumnOnce &&
              builder._payload &&
              'representative_name' in builder._payload
            ) {
              state.failRepresentativeColumnOnce = false;
              result = {
                data: null,
                error: {
                  code: '42703',
                  message: 'column "representative_name" of relation "broker_profiles" does not exist',
                },
              };
            } else {
              state.updatePayloads.push({ ...builder._payload });
              state.brokerProfile = { ...(state.brokerProfile ?? {}), ...builder._payload };
              result = { data: state.brokerProfile, error: null };
            }
          } else if (table === 'profiles' && builder._mode === 'upsert') {
            state.profile = { ...(state.profile ?? {}), ...builder._payload };
            result = { data: state.profile, error: null };
          }
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

describe('Wave 3 — WP-09: 공인중개사법 제18조의2 5대 법정 표시의무 전구간 검증', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    (global as any).IntersectionObserver = MockIntersectionObserver;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    mockGetBrokerSubscriptionTier.mockResolvedValue({ tier: 'free', isPaid: false });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('(a) validateBrokerStatutoryFields rejects sample registration numbers & names and reports missing statutory items', () => {
    expect(SAMPLE_REGISTRATION_NUMBERS).toContain('11680-2024-00123');
    expect(SAMPLE_REGISTRATION_NUMBERS).toContain('00000-0000-00000');
    expect(SAMPLE_BROKER_NAMES).toContain('홍길동');

    const badReg = validateBrokerStatutoryFields({
      company: '크리딜 부동산중개법인',
      office_address: '서울특별시 강남구 테헤란로 152',
      phone: '02-555-9876',
      office_reg_number: '11680-2024-00123',
      representative_name: '박성훈',
    });
    expect(badReg.ok).toBe(false);
    if (!badReg.ok) {
      expect(badReg.field).toBe('office_reg_number');
      expect(badReg.message).toContain('샘플');
    }
    // Because '11680-2024-00123' is a sample, completeness treats office_reg_number as missing
    expect(badReg.completeness.isComplete).toBe(false);
    expect(badReg.completeness.missingFields).toContain('office_reg_number');

    const badName = validateBrokerStatutoryFields({
      company: '크리딜 부동산중개법인',
      office_address: '서울특별시 강남구 테헤란로 152',
      phone: '02-555-9876',
      office_reg_number: '11680-2025-09876',
      representative_name: '홍길동',
    });
    expect(badName.ok).toBe(false);
    if (!badName.ok) {
      expect(badName.field).toBe('representative_name');
    }

    const partial = validateBrokerStatutoryFields({
      company: '크리딜 부동산중개법인',
      phone: '02-555-9876',
      display_name: '박성훈',
    });
    expect(partial.ok).toBe(true);
    expect(partial.completeness.isComplete).toBe(false);
    expect(partial.completeness.missingFields).toEqual(['office_address', 'office_reg_number']);
    expect(partial.completeness.filledCount).toBe(3);

    const full = validateBrokerStatutoryFields({
      company: '크리딜 부동산중개법인',
      office_address: '서울특별시 강남구 테헤란로 152, 8층',
      phone: '02-555-9876',
      office_reg_number: '11680-2025-09876',
      display_name: '박성훈',
    });
    expect(full.ok).toBe(true);
    expect(full.completeness.isComplete).toBe(true);
    expect(full.completeness.missingFields).toEqual([]);

    const lines = formatBrokerStatutoryDisclosureLines({
      company: '크리딜 부동산중개법인',
      office_address: '서울특별시 강남구 테헤란로 152',
      phone: '02-555-9876',
      office_reg_number: '11680-2024-00123', // sample -> must be omitted
      representative_name: '홍길동', // sample -> must be omitted
      display_name: '박성훈', // real fallback -> used for 대표자
    });
    expect(lines).toEqual([
      '상호: 크리딜 부동산중개법인',
      '대표자: 박성훈',
      '소재지: 서울특별시 강남구 테헤란로 152',
      '연락처: 02-555-9876',
    ]);
  });

  it('(b) PUT /api/broker/profile blocks sample registration number/name with 400 and saves office_address + representative_name', async () => {
    const state: FakeBrokerDbState = {
      profile: {
        id: 'broker-uuid-01',
        role: 'broker',
        display_name: '박성훈',
        phone: '02-555-9876',
        company: '크리딜 부동산중개법인',
      },
      brokerProfile: {
        user_id: 'broker-uuid-01',
        slug: 'park-cre',
        office_reg_number: null,
        office_address: null,
        representative_name: null,
      },
      updatePayloads: [],
    };
    mockRequireBroker.mockResolvedValue({
      user: { id: 'broker-uuid-01', email: 'park@credeal.kr' },
      error: null,
    });
    mockCreateServiceClient.mockImplementation(() => createFakeSupabase(state));

    // 1. Sample registration number -> 400
    const badRegReq = new NextRequest('http://localhost/api/broker/profile', {
      method: 'PUT',
      body: JSON.stringify({
        display_name: '박성훈',
        office_reg_number: '11680-2024-00123',
      }),
      headers: { 'content-type': 'application/json' },
    });
    const badRegRes = await putBrokerProfile(badRegReq);
    expect(badRegRes.status).toBe(400);
    const badRegJson = await badRegRes.json();
    expect(badRegJson.field).toBe('office_reg_number');
    expect(state.updatePayloads).toHaveLength(0);

    // 2. Sample broker name -> 400
    const badNameReq = new NextRequest('http://localhost/api/broker/profile', {
      method: 'PUT',
      body: JSON.stringify({
        display_name: '홍길동',
      }),
      headers: { 'content-type': 'application/json' },
    });
    const badNameRes = await putBrokerProfile(badNameReq);
    expect(badNameRes.status).toBe(400);
    const badNameJson = await badNameRes.json();
    expect(badNameJson.field).toBe('display_name');

    // 3. Valid statutory payload -> 200 & saves office_address + representative_name
    const validReq = new NextRequest('http://localhost/api/broker/profile', {
      method: 'PUT',
      body: JSON.stringify({
        display_name: '박성훈',
        representative_name: '이대표',
        company: '크리딜 부동산중개법인',
        phone: '02-555-9876',
        office_address: '서울특별시 강남구 테헤란로 152, 8층',
        office_reg_number: '11680-2025-09876',
      }),
      headers: { 'content-type': 'application/json' },
    });
    const validRes = await putBrokerProfile(validReq);
    expect(validRes.status).toBe(200);
    expect(state.brokerProfile?.office_address).toBe('서울특별시 강남구 테헤란로 152, 8층');
    expect(state.brokerProfile?.representative_name).toBe('이대표');
    expect(state.brokerProfile?.office_reg_number).toBe('11680-2025-09876');

    // 4. GET returns representative_name, office_address, and complete statutoryCompleteness
    const getReq = new NextRequest('http://localhost/api/broker/profile', { method: 'GET' });
    const getRes = await getBrokerProfile(getReq);
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.data.broker.office_address).toBe('서울특별시 강남구 테헤란로 152, 8층');
    expect(getJson.data.broker.representative_name).toBe('이대표');
    expect(getJson.data.statutoryCompleteness.isComplete).toBe(true);

    // 5. Unmigrated DB column retry strips representative_name gracefully without 500
    state.failRepresentativeColumnOnce = true;
    const retryReq = new NextRequest('http://localhost/api/broker/profile', {
      method: 'PUT',
      body: JSON.stringify({
        representative_name: '최대표',
        office_address: '서울특별시 서초구 서초대로 396',
      }),
      headers: { 'content-type': 'application/json' },
    });
    const retryRes = await putBrokerProfile(retryReq);
    expect(retryRes.status).toBe(200);
    expect(state.brokerProfile?.office_address).toBe('서울특별시 서초구 서초대로 396');
  });

  it('(c) toPublicDealCard + <TrustLine /> renders all 5 statutory items while stripping sample placeholders and keeping asset jibun blind', async () => {
    const dto = toPublicDealCard({
      id: 'dc-statutory-01',
      building: {
        id: 'dc-statutory-01',
        raw_address: '서울특별시 마포구 동교동 189-6',
        building_name: '비공개테스트타워',
        area_signal: '마포구 홍대입구',
        asset_type: '근린생활시설',
        price_band: '70억~80억',
      },
      signalCard: {
        title: '마포구 홍대입구 수익형 빌딩',
        area_signal: '마포구 홍대입구',
        asset_type: '근린생활시설',
        price_band: '70억~80억',
      },
      teaserDoc: null,
      brokerProfile: {
        display_name: '박성훈',
        representative_name: '이대표',
        company: '크리딜 부동산중개법인',
        office_address: '서울특별시 강남구 테헤란로 152, 8층',
        office_reg_number: '11680-2025-09876',
        phone: '02-555-9876',
        is_licensed: true,
      },
      hasImDoc: true,
      isPptxApproved: true,
      pptxDownloadUrl: '/api/public/im-lite/dc-statutory-01/pptx',
    });

    // Blind asset exact jibun never leaks, while brokerage office statutory fields are populated
    expect(JSON.stringify(dto)).not.toContain('189-6');
    expect(dto.broker.officeName).toBe('크리딜 부동산중개법인');
    expect(dto.broker.officeAddress).toBe('서울특별시 강남구 테헤란로 152, 8층');
    expect(dto.broker.officeRegNumber).toBe('11680-2025-09876');
    expect(dto.broker.representativeName).toBe('이대표');
    expect(dto.broker.phone).toBe('02-555-9876');

    await act(async () => {
      root.render(
        <TrustLine
          brokerName={dto.broker.displayName}
          brokerPhone={dto.broker.phone}
          specialty={dto.broker.specialty}
          officeName={dto.broker.officeName}
          officeAddress={dto.broker.officeAddress}
          officeRegNumber={dto.broker.officeRegNumber}
          representativeName={dto.broker.representativeName}
          isLicensed={dto.broker.isLicensed}
        />,
      );
    });

    const trustEl = container.querySelector('[data-testid="public-dealcard-trustline"]')!;
    expect(trustEl).not.toBeNull();
    const disclosureEl = trustEl.querySelector('[data-testid="broker-statutory-disclosure"]')!;
    expect(disclosureEl).not.toBeNull();
    expect(disclosureEl.textContent).toContain('상호');
    expect(disclosureEl.textContent).toContain('크리딜 부동산중개법인');
    expect(disclosureEl.textContent).toContain('소재지');
    expect(disclosureEl.textContent).toContain('서울특별시 강남구 테헤란로 152, 8층');
    expect(disclosureEl.textContent).toContain('등록번호');
    expect(disclosureEl.textContent).toContain('11680-2025-09876');
    expect(disclosureEl.textContent).toContain('대표자');
    expect(disclosureEl.textContent).toContain('이대표');
    expect(disclosureEl.textContent).toContain('연락처');
    expect(disclosureEl.textContent).toContain('02-555-9876');

    // Sample values are stripped by both toPublicDealCard and TrustLine
    const sampleDto = toPublicDealCard({
      id: 'dc-statutory-sample',
      building: { id: 'dc-statutory-sample', area_signal: '강남구', asset_type: '오피스', price_band: '100억대' },
      signalCard: null,
      teaserDoc: null,
      brokerProfile: {
        display_name: '홍길동',
        representative_name: '홍길동',
        company: '크리딜 부동산중개법인',
        office_address: '미등록',
        office_reg_number: '11680-2024-00123',
        phone: '010-0000-0000',
      },
      hasImDoc: false,
      isPptxApproved: false,
      pptxDownloadUrl: '/api/public/im-lite/dc-statutory-sample/pptx',
    });

    expect(sampleDto.broker.officeRegNumber).toBeNull();
    expect(sampleDto.broker.representativeName).toBeNull();
    expect(sampleDto.broker.officeAddress).toBeNull();
    expect(sampleDto.broker.phone).toBeNull();

    await act(async () => {
      root.render(
        <TrustLine
          brokerName="홍길동"
          officeName="크리딜 부동산중개법인"
          officeRegNumber="11680-2024-00123"
          representativeName="홍길동"
          brokerPhone="010-0000-0000"
        />,
      );
    });

    const sanitizedText = container.textContent || '';
    expect(sanitizedText).toContain('크리딜 부동산중개법인');
    expect(sanitizedText).not.toContain('11680-2024-00123');
    expect(sanitizedText).not.toContain('홍길동');
    expect(sanitizedText).not.toContain('010-0000-0000');
  });

  it('(d) /im-lite Section 10 and /magazine footer render real officeAddress & representativeName and hide sample placeholders', async () => {
    const basicDoc = buildBasicImDocument(
      extractPureBuildingFacts({
        title: '역삼동 코너 빌딩',
        address: '서울특별시 강남구 역삼동 700-1',
        posture: 'core_income',
        asking_price_manwon: 1200000,
        brokerOffice: {
          name: '담당 중개법인 (확인 중)',
          representative: '홍길동',
          registrationNo: '11680-2024-00123',
          phone: '-',
        },
      } as any),
    );

    const compositeRealDoc = {
      ...basicDoc,
      basicImDocument: basicDoc,
      brokerProfile: {
        company: '트러스트 부동산중개법인',
        representativeName: '정수현',
        officeAddress: '서울특별시 서초구 강남대로 465, 11층',
        registrationNo: '11650-2025-04321',
        phone: '02-588-4321',
      },
    };

    await act(async () => {
      root.render(
        <MobileIMViewer
          document={compositeRealDoc as any}
          buildingId="bld-wp09-real"
          isBroker={false}
        />,
      );
    });

    const sec10Real = container.querySelector('[data-section-id="10_contact"]')!;
    expect(sec10Real).not.toBeNull();
    expect(sec10Real.textContent).toContain('트러스트 부동산중개법인');
    expect(sec10Real.textContent).toContain('정수현');
    expect(sec10Real.textContent).toContain('서울특별시 서초구 강남대로 465, 11층');
    expect(sec10Real.textContent).toContain('11650-2025-04321');
    expect(sec10Real.textContent).toContain('02-588-4321');
    expect(sec10Real.textContent).not.toContain('홍길동');
    expect(sec10Real.textContent).not.toContain('11680-2024-00123');

    // When only sample placeholders exist in IM doc, Section 10 hides them
    await act(async () => {
      root.render(
        <MobileIMViewer
          document={{ ...basicDoc, basicImDocument: basicDoc } as any}
          buildingId="bld-wp09-sample"
          isBroker={false}
        />,
      );
    });

    const sec10Sample = container.querySelector('[data-section-id="10_contact"]')!;
    expect(sec10Sample.textContent).not.toContain('홍길동');
    expect(sec10Sample.textContent).not.toContain('11680-2024-00123');
    expect(sec10Sample.querySelector('[data-testid="mobile-im-broker-office-address"]')).toBeNull();

    // MagazineView statutory footer renders real items and strips sample regNo
    await act(async () => {
      root.render(
        <MagazineView
          brokerId="trust-cre"
          brokerSlug="trust-cre"
          date="2026-11-15"
          dateLabel="2026년 11월 15일 (일)"
          data={{
            headline: '강남권 프라임 중소형 빌딩 주간 동향',
            briefing: '역세권 우량 사옥 수요가 견조하게 이어지고 있습니다.',
            broker: {
              name: '정수현',
              company: '트러스트 부동산중개법인',
              officeAddress: '서울특별시 서초구 강남대로 465, 11층',
              officeRegNumber: '11680-2024-00123', // sample -> stripped
              representativeName: '정수현',
              phone: '02-588-4321',
            },
          }}
        />,
      );
    });

    const magFooter = container.querySelector('[data-testid="magazine-broker-statutory-disclosure"]')!;
    expect(magFooter).not.toBeNull();
    expect(magFooter.textContent).toContain('트러스트 부동산중개법인');
    expect(magFooter.textContent).toContain('서울특별시 서초구 강남대로 465, 11층');
    expect(magFooter.textContent).toContain('정수현');
    expect(magFooter.textContent).toContain('02-588-4321');
    expect(magFooter.textContent).not.toContain('11680-2024-00123');
  });
});
