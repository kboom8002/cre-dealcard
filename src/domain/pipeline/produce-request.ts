export interface ProduceRequest {
  dealId: string;
  dealVersion: number;
  tier: 'basic' | 'pro';
  ontologyVersion: string;        // 'v0.2.0' — Pin 필수
  disclosure: import('../building/mobile-im/disclosure-policy').DisclosurePolicy;
  leaseMode: 'standard' | 'precise';
  grade: { score: number; grade: 'A' | 'B' | 'C' | 'D' };
}

export function createProduceRequest(
  dealId: string,
  dealVersion: number,
  tier: 'basic' | 'pro',
  ontologyVersion: string,
  disclosure: import('../building/mobile-im/disclosure-policy').DisclosurePolicy,
  leaseMode: 'standard' | 'precise',
  grade: { score: number; grade: 'A' | 'B' | 'C' | 'D' }
): ProduceRequest {
  return {
    dealId,
    dealVersion,
    tier,
    ontologyVersion,
    disclosure,
    leaseMode,
    grade,
  };
}
