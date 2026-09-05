import { z } from 'zod';

export const DealCardFactsSchema = z.object({
  buildingName: z.string().optional(),
  address: z.string().optional(),
  askingPriceKrw: z.number().nonnegative().optional(),
  totalAreaSqm: z.number().positive().optional(),
  landAreaSqm: z.number().positive().optional(),
  zoning: z.string().optional(),
  capRatePct: z.number().min(0).max(100).optional(),
  annualNoiKrw: z.number().optional(),
  monthlyRentKrw: z.number().optional(),
  totalDepositKrw: z.number().optional(),
  occupancyPct: z.number().min(0).max(100).optional(),
  majorTenants: z.array(z.string()).default([]),
  hospitalitySignals: z.array(z.string()).default([]),
  riskFactors: z.array(z.string()).default([]),
  investmentTheses: z.array(z.string()).default([]),
});

export type DealCardFacts = z.infer<typeof DealCardFactsSchema>;
