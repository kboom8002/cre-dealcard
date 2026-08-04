export interface SlotVisibility {
  slotKey: string;
  visibility: 'public' | 'gated' | 'never';
  audience: 'buyer' | 'broker_internal';
  b2cLabel?: string;
}

export function isTeaserVisible(slot: SlotVisibility): boolean {
  if (slot.visibility !== 'public') return false;
  if (slot.audience === 'broker_internal') return false;
  if (!slot.b2cLabel) return false;
  return true;
}
