import { z } from "zod/v4";

// ---- Crowdfunding Project Structured Output ----
export const FundingProjectOutputSchema = z.object({
  projectName: z.string(),
  assetType: z.enum(["real_estate", "startup", "art", "ip"]),
  targetAmount: z.coerce.number().min(1), // 만원 단위 혹은 원 단위 (여기선 원 단위 혹은 만원 단위로 공통 제어)
  minInvestment: z.coerce.number().min(1),
  expectedReturnPct: z.coerce.number().min(0.1),
  investmentPeriodMonths: z.coerce.number().min(1),
  riskLevel: z.coerce.number().int().min(1).max(5),
  tokenType: z.enum(["sto", "equity", "profit_share"]),
  regulatoryStatus: z.string().nullable().catch(null),
  descriptionMemo: z.string().nullable().catch(null),
  detectedSensitiveFields: z.array(z.string()).catch([]),
  warnings: z.array(z.string()).catch([]),
});

export type FundingProjectOutput = z.infer<typeof FundingProjectOutputSchema>;


// ---- Crowdfunding Blind Teaser Output ----
export const FundingBlindTeaserOutputSchema = z.object({
  title: z.string(),
  shortSummary: z.string(),
  dealPoints: z.array(z.string()).min(2).max(7),
  cautionPoints: z.array(z.string()).min(1).max(7),
  forbiddenWordsNotice: z.string().nullable().catch(null),
  gateMessage: z.string(),
  kakaoText: z.string(),
  boundaryNote: z.string(),
});

export type FundingBlindTeaserOutput = z.infer<typeof FundingBlindTeaserOutputSchema>;


// ---- Investor Profile Output ----
export const InvestorProfileOutputSchema = z.object({
  investorType: z.enum(["general", "qualified", "professional"]),
  investmentPreference: z.array(z.string()).catch([]),
  preferredSectors: z.array(z.string()).catch([]),
  investmentMin: z.coerce.number().nullable().catch(null),
  investmentMax: z.coerce.number().nullable().catch(null),
  maxRiskTolerance: z.coerce.number().int().min(1).max(5).catch(3),
  expectedReturnMin: z.coerce.number().nullable().catch(null),
  investmentHorizonMonths: z.coerce.number().nullable().catch(null),
  mustHaveCriteria: z.array(z.string()).catch([]),
  niceToHaveCriteria: z.array(z.string()).catch([]),
});

export type InvestorProfileOutput = z.infer<typeof InvestorProfileOutputSchema>;
