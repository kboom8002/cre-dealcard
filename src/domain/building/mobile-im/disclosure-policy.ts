import { CapRateBasis } from '../financials';

export interface DisclosurePolicy {
  dcf: 'hidden' | 'summary' | 'full';
  irr: 'hidden' | 'summary' | 'full';
  sensitivity: 'hidden' | 'full';
  totalReturn: 'hidden' | 'summary' | 'full';
  capRateBases: CapRateBasis[];
}

export const DISCLOSURE_DEFAULT: Record<'basic' | 'pro', DisclosurePolicy> = {
  basic: {
    dcf: 'hidden',
    irr: 'hidden',
    sensitivity: 'hidden',
    totalReturn: 'hidden',
    capRateBases: ['broker_price', 'broker_equity'],
  },
  pro: {
    dcf: 'full',
    irr: 'full',
    sensitivity: 'full',
    totalReturn: 'full',
    capRateBases: ['broker_price', 'broker_equity', 'noi_price', 'noi_total_cost'],
  },
};
