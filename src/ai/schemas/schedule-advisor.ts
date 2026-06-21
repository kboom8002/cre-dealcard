import { z } from "zod/v4";

export const ScheduleRecommendationSchema = z.object({
  recommended_slots: z.array(z.object({
    slot_id: z.string().uuid(),
    date: z.string(),
    time_range: z.string(),
    fit_reason: z.string().max(100),
    fit_score: z.number().int().min(0).max(100),
    caution: z.string().nullable(),
  })).min(1).max(5),
  schedule_summary: z.string().max(200),
  flexibility_advice: z.string().max(150),
  alternative_suggestion: z.string().nullable(),
  urgency_warning: z.string().nullable(),
});

export type ScheduleRecommendation = z.infer<typeof ScheduleRecommendationSchema>;
