/**
 * Zod schemas for Deal Curiosity Report
 * Source: docs/09-ai-agent-contracts.md section 11
 */
import { z } from "zod/v4";

export const DealCuriosityReportSchema = z.object({
  oneLineDiagnosis: z.string(),
  dealCuriosityScore: z.number().min(0).max(100),
  scoreMeaning: z.string(),
  ssotReadiness: z.object({
    publicSignalReady: z.boolean(),
    teaserReady: z.boolean(),
    snapshotDraftReady: z.boolean(),
    fullImReady: z.boolean(),
    missingData: z.array(z.string()),
  }),
  dealPoints: z.array(z.string()).min(3).max(7),
  riskQuestions: z.array(z.string()).min(3).max(7),
  buyerFitTypes: z.array(z.string()),
  dealStories: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        requiredValidation: z.array(z.string()),
      }),
    )
    .min(1)
    .max(5),
  ctas: z.array(
    z.object({
      label: z.string(),
      action: z.enum([
        "create_blind_teaser",
        "request_expert_note",
        "check_full_im_readiness",
        "save_report",
      ]),
    }),
  ),
  boundaryNote: z.string(),
});

export type DealCuriosityReport = z.infer<typeof DealCuriosityReportSchema>;
