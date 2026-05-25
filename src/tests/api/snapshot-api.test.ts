import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as postGenerateSnapshot } from '@/app/api/broker/buildings/[id]/snapshot/generate/route';
import { GET as getPublicSnapshot } from '@/app/api/public/buildings/[id]/snapshot/route';

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
  maybeSingle() { return this; }
  insert(row?: any) { return this; }
  update() { return this; }
  limit() { return this; }
  order() { return this; }
  in() { return this; }

  then(resolve: any) {
    resolve({ data: this.dataCallback(), error: this.error });
  }
}

let mockBuildingData: any = null;
let mockFilesData: any[] = [];
let mockDocumentData: any = null;
let mockGateRequestsData: any[] = [];
let mockInsertedDocData: any = null;
let recordedEvents: any[] = [];

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
            return new MockSupabaseQuery(() => mockFilesData);
          }
          if (table === 'document_objects') {
            const query = new MockSupabaseQuery(() => mockDocumentData);
            query.insert = () => {
              return new MockSupabaseQuery(() => mockInsertedDocData);
            };
            return query;
          }
          if (table === 'gate_requests') {
            return new MockSupabaseQuery(() => mockGateRequestsData);
          }
          if (table === 'activity_events') {
            const query = new MockSupabaseQuery(() => null);
            query.insert = (row: any) => {
              recordedEvents.push(row);
              return new MockSupabaseQuery(() => ({ id: 'mock-event-id' }));
            };
            return query;
          }
          return new MockSupabaseQuery(() => null);
        },
      };
    },
  };
});

vi.mock('@/ai/agents/BuildingSnapshotAgent', () => {
  return {
    runBuildingSnapshotAgent: vi.fn().mockResolvedValue({
      snapshot: {
        headline: '강남권역 역세권 복합 근생빌딩',
        area_signal: '강남구 역삼동권',
        asset_type: '근생빌딩',
        size_signal: '연면적 약 2,400㎡',
        price_band: '80억대',
        current_use_summary: '복합 근생 (1F 리테일 + 2-5F 오피스)',
        deal_thesis: '역세권 입지와 안정적 임차인 구성이 강점입니다.',
        risk_summary: '상층부 오피스 만기 공실 리스크 있음.',
        financial_snapshot: {
          vacancy_rate_note: '현재 공실률 약 5% (추정, 브로커 제공)',
          walt_note: 'WALT 약 2.1년 (참고용)',
          income_note: '연간 잠정 임대소득 참고 수준 (추정 수준)',
        },
        buyer_fit_types: ['수익형 투자자', '법인 사옥 겸용'],
        missing_data_note: '수선 이력 서류 미확보',
        boundary_disclaimer: '본 자료는 중개인이 제공한 참고용 정보로, 투자 권유나 법적 확약이 아닙니다. 상세 실사 및 전문가 검토가 필요합니다.',
        document_version: 'v0.3-snapshot',
      },
      model: 'gpt-4o',
      promptVersion: 'v0.3-snapshot-prompt',
    }),
  };
});

describe('v0.3 Snapshot API Routes', () => {
  beforeEach(() => {
    mockBuildingData = null;
    mockFilesData = [];
    mockDocumentData = null;
    mockGateRequestsData = [];
    mockInsertedDocData = null;
    recordedEvents = [];
  });

  test('POST /generate - rejects building with completeness < 60', async () => {
    mockBuildingData = {
      id: 'low-score-building',
      owner_id: 'mock-user-id',
      completeness_score: 55,
      lease_summary: {},
    };

    const req = new NextRequest('http://localhost:3000/api/broker/buildings/low-score-building/snapshot/generate', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer mock-token',
        'Content-Type': 'application/json',
      },
    });

    const params = Promise.resolve({ id: 'low-score-building' });
    const res = await postGenerateSnapshot(req, { params });
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.error.code).toBe('COMPLETENESS_INSUFFICIENT');
    expect(data.error.currentScore).toBe(55);
  });

  test('POST /generate - generates snapshot successfully for score >= 60', async () => {
    mockBuildingData = {
      id: 'ready-building',
      owner_id: 'mock-user-id',
      completeness_score: 65,
      lease_summary: {},
    };
    mockInsertedDocData = { id: 'new-doc-id' };

    const req = new NextRequest('http://localhost:3000/api/broker/buildings/ready-building/snapshot/generate', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer mock-token',
        'Content-Type': 'application/json',
      },
    });

    const params = Promise.resolve({ id: 'ready-building' });
    const res = await postGenerateSnapshot(req, { params });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.documentId).toBe('new-doc-id');
    expect(data.documentType).toBe('building_snapshot_draft');
    expect(data.status).toBe('draft');

    // Verify activity event recorded
    const event = recordedEvents.find(e => e.event_type === 'building_snapshot_generated');
    expect(event).toBeDefined();
    expect(event.entity_id).toBe('ready-building');
  });

  test('GET /snapshot - blocks public user if not owner and not G2 approved', async () => {
    mockBuildingData = {
      id: 'private-building',
      owner_id: 'another-user-id',
    };
    mockGateRequestsData = [];

    const req = new NextRequest('http://localhost:3000/api/public/buildings/private-building/snapshot', {
      method: 'GET',
    });

    const params = Promise.resolve({ id: 'private-building' });
    const res = await getPublicSnapshot(req, { params });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain('G2+ 승인');
  });

  test('GET /snapshot - allows public retrieval if G2 approved', async () => {
    mockBuildingData = {
      id: 'approved-building',
      owner_id: 'another-user-id',
    };
    mockGateRequestsData = [{ id: 'gate-request-id', status: 'approved', requested_level: 'G2' }];
    mockDocumentData = {
      id: 'snapshot-doc-id',
      building_id: 'approved-building',
      document_type: 'building_snapshot_draft',
      body: {
        headline: '강남권역 역세권 복합 근생빌딩',
        area_signal: '강남구 역삼동권',
        asset_type: '근생빌딩',
        size_signal: '연면적 약 2,400㎡',
        price_band: '80억대',
        boundary_disclaimer: '본 자료는 중개인이 제공한 참고용 정보로, 투자 권유나 법적 확약이 아닙니다. 상세 실사 및 전문가 검토가 필요합니다.',
      },
    };

    const req = new NextRequest('http://localhost:3000/api/public/buildings/approved-building/snapshot', {
      method: 'GET',
    });

    const params = Promise.resolve({ id: 'approved-building' });
    const res = await getPublicSnapshot(req, { params });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.headline).toBe('강남권역 역세권 복합 근생빌딩');
    expect(data.boundary_disclaimer).toBeDefined();
    expect(JSON.stringify(data)).not.toMatch(/tenant_name/);
    expect(JSON.stringify(data)).not.toMatch(/monthly_rent/);
    expect(JSON.stringify(data)).not.toMatch(/exact_address/);
  });
});
