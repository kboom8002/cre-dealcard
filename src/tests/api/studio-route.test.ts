import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as postLease } from '@/app/api/broker/buildings/[id]/lease/route';
import { POST as postEvidence } from '@/app/api/broker/buildings/[id]/evidence/route';
import { GET as getStudio } from '@/app/api/broker/buildings/[id]/studio/route';
import { POST as postDisclosure } from '@/app/api/broker/buildings/[id]/disclosure/route';

class MockSupabaseQuery {
  private dataCallback: () => any;
  private error: any;

  constructor(dataCallback: () => any, error: any = null) {
    this.dataCallback = dataCallback;
    this.error = error;
  }

  select() { return this; }
  eq() { return this; }
  single() { return this; }
  insert() { return this; }
  update() { return this; }
  limit() { return this; }

  then(resolve: any) {
    resolve({ data: this.dataCallback(), error: this.error });
  }
}

let mockBuildingData: any = null;
let mockFilesData: any[] = [];
let mockInsertedFileData: any = null;

vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: () => {
      return {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'mock-user-id' } },
            error: null,
          }),
        },
        from: (table: string) => {
          if (table === 'building_ssot_lite') {
            return new MockSupabaseQuery(() => mockBuildingData);
          }
          if (table === 'profiles') {
            return new MockSupabaseQuery(() => ({ id: 'mock-user-id', role: 'broker' }));
          }
          if (table === 'evidence_files') {
            const query = new MockSupabaseQuery(() => mockFilesData);
            query.insert = () => {
              return new MockSupabaseQuery(() => mockInsertedFileData);
            };
            return query;
          }
          return new MockSupabaseQuery(() => null);
        },
      };
    },
  };
});

describe('v0.2 Studio API Routes', () => {
  beforeEach(() => {
    mockBuildingData = null;
    mockFilesData = [];
    mockInsertedFileData = null;
  });

  test('POST /lease - updates lease summary and returns new completeness', async () => {
    mockBuildingData = {
      id: 'test-building-id',
      owner_id: 'mock-user-id',
      price_band: '100억',
      lease_summary: {},
      disclosure_prefs: {},
      completeness_score: 10,
    };
    mockFilesData = [];

    const req = new NextRequest('http://localhost:3000/api/broker/buildings/test-building-id/lease', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer mock-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenants: [
          {
            floor: '1F',
            area_sqm: 150,
            tenant_type: 'retail',
            monthly_rent: 5000000,
            deposit: 50000000,
            contract_end: '2028-12',
            is_anchor: true,
            tenant_name: 'Starbucks',
          },
        ],
      }),
    });

    const params = Promise.resolve({ id: 'test-building-id' });
    const res = await postLease(req, { params });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.newCompletenessScore).toBe(30); // buildingRegister=false, askingPrice=true(5), rentRoll=true(25) -> 30
    expect(data.leaseSummary.tenants.length).toBe(1);
  });

  test('POST /evidence - inserts file and updates completeness', async () => {
    mockBuildingData = {
      id: 'test-building-id',
      owner_id: 'mock-user-id',
      completeness_score: 5, // has price_band
      price_band: '100억',
    };
    mockFilesData = [];
    mockInsertedFileData = { id: 'new-evidence-id' };

    const req = new NextRequest('http://localhost:3000/api/broker/buildings/test-building-id/evidence', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer mock-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: 'register.pdf',
        fileSizeBytes: 102456,
        mimeType: 'application/pdf',
        layerCategory: 'building_register',
        storageBucket: 'evidence',
        storagePath: 'test-building-id/register.pdf',
        visibility: 'private',
      }),
    });

    const params = Promise.resolve({ id: 'test-building-id' });
    const res = await postEvidence(req, { params });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.evidenceFileId).toBe('new-evidence-id');
    expect(data.newCompletenessScore).toBe(25); // building_register(20) + asking_price(5) = 25
  });

  test('GET /studio - fetches studio status', async () => {
    mockBuildingData = {
      id: 'test-building-id',
      owner_id: 'mock-user-id',
      completeness_score: 30,
      price_band: '100억',
      lease_summary: {},
      disclosure_prefs: {},
    };
    mockFilesData = [{ layer_category: 'building_register' }];

    const req = new NextRequest('http://localhost:3000/api/broker/buildings/test-building-id/studio', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer mock-token',
      },
    });

    const params = Promise.resolve({ id: 'test-building-id' });
    const res = await getStudio(req, { params });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.completenessScore).toBe(25); // corrected score
    expect(data.checklist.buildingRegister).toBe(true);
  });

  test('POST /disclosure - updates disclosure prefs and returns new completeness', async () => {
    mockBuildingData = {
      id: 'test-building-id',
      owner_id: 'mock-user-id',
      price_band: '100억',
      lease_summary: {},
      disclosure_prefs: {},
      completeness_score: 5,
    };
    mockFilesData = [];

    const req = new NextRequest('http://localhost:3000/api/broker/buildings/test-building-id/disclosure', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer mock-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        disclosurePrefs: {
          show_area_signal: true,
          show_asset_type: true,
          show_price_band: true,
          show_tenant_count: false,
          show_walt: false,
          show_vacancy_rate: false,
          hide_exact_address: true,
          hide_tenant_names: true,
          hide_unit_rent: true,
        },
      }),
    });

    const params = Promise.resolve({ id: 'test-building-id' });
    const res = await postDisclosure(req, { params });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.newCompletenessScore).toBe(10); // askingPrice=true(5) + disclosurePolicy=true(5) = 10
    expect(data.disclosurePrefs.hide_exact_address).toBe(true);
  });
});
