import { DealCardFactsSchema, type DealCardFacts } from './deal-card-facts.schema';
import {
  SectionConfidenceSchema,
  type SectionConfidence,
  SectionResponseSchema,
  type SectionResponse,
} from './section-response.schema';
import { ok, err, type Result } from '@/domain/shared/result';

export {
  DealCardFactsSchema,
  type DealCardFacts,
  SectionConfidenceSchema,
  type SectionConfidence,
  SectionResponseSchema,
  type SectionResponse,
};

/**
 * Safely parse an AI section output into a strongly-typed SectionResponse.
 * Returns Result<SectionResponse, string> without throwing.
 */
export function safeParseSectionResponse(raw: unknown): Result<SectionResponse, string> {
  const parsed = SectionResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return err(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return ok(parsed.data);
}

/**
 * Safely parse raw facts into a strongly-typed DealCardFacts object.
 */
export function safeParseDealCardFacts(raw: unknown): Result<DealCardFacts, string> {
  const parsed = DealCardFactsSchema.safeParse(raw);
  if (!parsed.success) {
    return err(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return ok(parsed.data);
}
