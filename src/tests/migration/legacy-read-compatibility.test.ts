import { describe, it, expect } from 'vitest';
import {
  migrateLegacyDocumentRecord,
  batchMigrateDocuments,
  type LegacyDocumentObject,
} from '../../../scripts/migrate-legacy-documents';

describe('Legacy Document Migration & Read Compatibility (PR-B5-03 / Negative-Pair Obligation)', () => {
  it('Positive Pair: Legacy document with valid property summary is safely migrated to verified baseline', () => {
    const doc: LegacyDocumentObject = {
      id: 'doc-legacy-1',
      building_id: 'bldg-1',
      type: 'mobile_im_lite',
      body: {
        property_summary: {
          asking_price: 15000000000,
          land_area: 450,
          gross_floor_area: 1350,
        },
      },
      created_at: '2026-08-01T00:00:00Z',
    };

    const result = migrateLegacyDocumentRecord(doc);
    expect(result.status).toBe('migrated_verified');
  });

  it('Negative Pair: Sparse record missing price is tagged legacy_unverified and read-only', () => {
    const sparseDoc: LegacyDocumentObject = {
      id: 'doc-legacy-sparse',
      building_id: 'bldg-2',
      type: 'mobile_im_lite',
      body: {
        notes: '가격 미정인 상태로 저장된 구문서',
      },
      created_at: '2026-07-15T00:00:00Z',
    };

    const result = migrateLegacyDocumentRecord(sparseDoc);
    expect(result.status).toBe('legacy_unverified');
    expect(result.note).toContain('레거시 읽기 전용');
  });
});
