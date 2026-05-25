/**
 * Zod schemas for Tenant Intent Normalizer
 */
import { z } from "zod/v4";

export const TenantIntentOutputSchema = z.object({
  businessType: z.string().catch("알 수 없음"),
  preferredRegions: z.array(z.string()).catch([]),
  areaMin: z.coerce.number().nullable().catch(null),
  areaMax: z.coerce.number().nullable().catch(null),
  budgetDepositMax: z.coerce.number().nullable().catch(null),  // 만원 단위
  budgetMonthlyMax: z.coerce.number().nullable().catch(null),  // 만원 단위
  preferredFloors: z.array(z.string()).catch([]),
  moveInTargetText: z.string().nullable().catch(null),
  mustHave: z.array(z.string()).catch([]),
  niceToHave: z.array(z.string()).catch([]),
  missingQuestions: z.array(z.string()).catch([]),
});

export type TenantIntentOutput = z.infer<typeof TenantIntentOutputSchema>;
