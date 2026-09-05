import { z } from 'zod';

export const SectionConfidenceSchema = z.enum(['confirmed', 'inferred', 'needs_check']);
export type SectionConfidence = z.infer<typeof SectionConfidenceSchema>;

export const SectionResponseSchema = z.object({
  title: z.string().optional(),
  markdown: z.string().min(1, 'Section markdown cannot be empty'),
  confidence: SectionConfidenceSchema.default('inferred'),
  boundaryNote: z.string().optional(),
  keyFacts: z.array(z.string()).default([]),
  metrics: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  minTier: z.enum(['internal_only', 'fact_om', 'analysis_im', 'decision_im', 'expert_required', 'public']).default('public'),
});

export type SectionResponse = z.infer<typeof SectionResponseSchema>;
