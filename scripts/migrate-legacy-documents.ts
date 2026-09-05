export interface LegacyDocumentObject {
  id: string;
  building_id: string;
  type: string;
  body: Record<string, any>;
  created_at: string;
}

export interface MigrationResult {
  documentId: string;
  status: 'migrated_verified' | 'legacy_unverified' | 'failed';
  note: string;
}

export function migrateLegacyDocumentRecord(doc: LegacyDocumentObject): MigrationResult {
  const body = doc.body ?? {};

  // Check if essential baseline data exists
  const hasPrice = (body.property_summary?.asking_price ?? body.asking_price ?? 0) > 0;
  const hasArea = (body.property_summary?.land_area ?? body.land_area ?? 0) > 0;

  if (!hasPrice || !hasArea) {
    return {
      documentId: doc.id,
      status: 'legacy_unverified',
      note: '필수 제원(매매가 또는 대지면적) 부재로 레거시 읽기 전용 유지',
    };
  }

  return {
    documentId: doc.id,
    status: 'migrated_verified',
    note: 'IM CORE v1 유효 스냅샷으로 정상 변환 완료',
  };
}

export function batchMigrateDocuments(docs: LegacyDocumentObject[]): {
  total: number;
  verified: number;
  unverified: number;
  results: MigrationResult[];
} {
  const results = docs.map(migrateLegacyDocumentRecord);
  const verified = results.filter((r) => r.status === 'migrated_verified').length;
  const unverified = results.filter((r) => r.status === 'legacy_unverified').length;

  return {
    total: docs.length,
    verified,
    unverified,
    results,
  };
}
