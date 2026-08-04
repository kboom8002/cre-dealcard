/**
 * @module B2CLabels
 * @description Internal slot → buyer-facing label mapping.
 * Slots without a b2cLabel MUST NOT appear on public teaser pages.
 */

export interface B2CSlotLabel {
  slotKey: string;
  internalName: string;
  b2cLabel: string;
  category: 'hero' | 'chip' | 'curiosity' | 'slider' | 'regulation';
}

export const B2C_LABEL_MAP: B2CSlotLabel[] = [
  // Hero tiles
  { slotKey: 'askingPriceKrw', internalName: '매각 희망가', b2cLabel: '매각가', category: 'hero' },
  { slotKey: 'capRatePct', internalName: 'Cap Rate', b2cLabel: '임대수익률', category: 'hero' },
  { slotKey: 'totalFloorAreaPyung', internalName: '연면적(평)', b2cLabel: '규모', category: 'hero' },
  { slotKey: 'landAreaPyung', internalName: '대지면적(평)', b2cLabel: '대지', category: 'hero' },
  { slotKey: 'vacancyPct', internalName: '공실률(%)', b2cLabel: '공실', category: 'hero' },
  { slotKey: 'farHeadroomPp', internalName: '용적률여유(%p)', b2cLabel: '개발 가능 규모', category: 'hero' },
  { slotKey: 'roomCount', internalName: '객실수', b2cLabel: '객실 수', category: 'hero' },
  
  // Chips
  { slotKey: 'roadAccessGrade', internalName: '도로접면등급', b2cLabel: '도로접면', category: 'chip' },
  { slotKey: 'parkingCapacity', internalName: '주차대수', b2cLabel: '주차', category: 'chip' },
  { slotKey: 'zoningRegion', internalName: '용도지역', b2cLabel: '용도지역', category: 'chip' },
  { slotKey: 'floorsAboveGround', internalName: '지상층수', b2cLabel: '층수', category: 'chip' },
  { slotKey: 'buildingAge', internalName: '건물연식', b2cLabel: '준공', category: 'chip' },
  
  // Curiosity - these have NO b2cLabel (internal only)
  { slotKey: 'rentGapPct', internalName: '임대료갭(%)', b2cLabel: '', category: 'curiosity' },
  { slotKey: 'noiKrw', internalName: 'NOI', b2cLabel: '', category: 'curiosity' },
  
  // Regulation
  { slotKey: 'permitKind', internalName: '인허가항목', b2cLabel: '인허가 확인', category: 'regulation' },
  { slotKey: 'isTransactionPermitArea', internalName: '토지거래허가구역', b2cLabel: '토지거래허가', category: 'regulation' },
];

/** Get the buyer-facing label for a slot. Returns undefined if not mapped. */
export function getB2CLabel(slotKey: string): string | undefined {
  const entry = B2C_LABEL_MAP.find(e => e.slotKey === slotKey);
  return entry?.b2cLabel || undefined;
}

/** Check if a slot should be visible to buyers (has non-empty b2cLabel) */
export function isSlotBuyerVisible(slotKey: string): boolean {
  const entry = B2C_LABEL_MAP.find(e => e.slotKey === slotKey);
  if (!entry) return false;
  return entry.b2cLabel.length > 0;
}
