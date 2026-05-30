export type GateLevel = 'none' | 'G1' | 'G2' | 'G3';
export type ViewerRole = 'anonymous' | 'authenticated' | 'broker' | 'owner' | 'admin';

// Gate Level별 공개 가능 필드
const GATE_LEVEL_FIELDS: Record<GateLevel, string[]> = {
  none: ['area_signal', 'asset_type', 'fit_summary'],
  G1: ['area_signal', 'asset_type', 'fit_summary', 'deal_points', 'caution_points', 'price_band'],
  G2: ['area_signal', 'asset_type', 'fit_summary', 'deal_points', 'caution_points', 
       'price_band', 'size_detail', 'floor_info', 'build_year'],
  G3: ['*'],  // 전체 공개 (owner/admin 제외한 최대 범위)
};

// 항상 마스킹되는 필드 (owner/admin만 열람 가능)
const ALWAYS_MASKED = ['raw_input', 'seller_motivation', 'internal_notes'];

export function maskBuildingResponse<T extends Record<string, unknown>>(
  data: T,
  hiddenFields: string[],
  viewerRole: ViewerRole,
  gateLevel: GateLevel = 'none',
): T {
  // 소유주 또는 관리자는 마스킹 없이 전체 열람 가능
  if (viewerRole === 'owner' || viewerRole === 'admin') {
    return data;
  }

  const allowedFields = GATE_LEVEL_FIELDS[gateLevel];
  const masked = { ...data };

  // 1. 항상 마스킹되어야 하는 원시/비공개 필드 제거
  for (const field of ALWAYS_MASKED) {
    if (field in masked) {
      delete (masked as Record<string, unknown>)[field];
    }
  }

  // 2. hiddenFields 에 지정된 민감한 필드들에 대해 허용 여부 체크 후 마스킹
  for (const field of hiddenFields) {
    // 만약 게이트 레벨이 * 이거나, 해당 필드를 명시적으로 노출 허용하고 있다면 스킵
    if (allowedFields.includes('*') || allowedFields.includes(field)) {
      continue;
    }
    
    // 허용되지 않은 필드라면 ****로 가림
    if (field in masked) {
      (masked as Record<string, unknown>)[field] = '****';
    }
  }

  return masked;
}
