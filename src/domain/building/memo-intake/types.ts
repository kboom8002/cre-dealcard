import { z } from 'zod';

export const MemoObservationSchema = z.object({
  id: z.string().uuid(),
  sourceText: z.string(),
  position: z.object({ start: z.number(), end: z.number() }),
  candidateType: z.enum([
    'address',
    'asking_price',
    'land_area',
    'total_area',
    'floors',
    'yield',
    'tenant_summary',
    'other',
  ]),
  candidateValue: z.union([z.string(), z.number(), z.null()]),
  confidence: z.enum(['confirmed', 'inferred', 'ambiguous']),
  ambiguityReason: z.string().optional(),
});

export type MemoObservation = z.infer<typeof MemoObservationSchema>;

export const SensitiveSegmentSchema = z.object({
  type: z.enum([
    'exact_address',
    'owner_name',
    'tenant_name',
    'phone_number',
    'corporate_reg_no',
  ]),
  rawText: z.string(),
  position: z.object({ start: z.number(), end: z.number() }),
  action: z.enum(['mask', 'generalize', 'remove']),
});

export type SensitiveSegment = z.infer<typeof SensitiveSegmentSchema>;

export const MemoObservationSetSchema = z.object({
  id: z.string().uuid(),
  memoRawHash: z.string(),
  rawMemoText: z.string(),
  observations: z.array(MemoObservationSchema),
  sensitiveSegments: z.array(SensitiveSegmentSchema),
  capturedAt: z.string().datetime(),
});

export type MemoObservationSet = z.infer<typeof MemoObservationSetSchema>;
