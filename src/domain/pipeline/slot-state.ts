export type SlotState = 
  | 'pending'
  | 'fetching'
  | 'fetched'
  | 'manual_required'
  | 'broker_entered'
  | 'seller_declared'
  | 'verified'
  | 'failed'
  | 'not_applicable';

export interface SlotStateRecord {
  state: SlotState;
  updatedAt: Date;
  expiresAt?: Date;
  errorReason?: string;
}

export function isStale(record: SlotStateRecord): boolean {
  if (!record.expiresAt) {
    return false;
  }
  return new Date() > record.expiresAt;
}
