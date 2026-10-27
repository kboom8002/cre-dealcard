/**
 * Card4Schema & Atomic Update SSOT (WP-P1-03)
 *
 * Requirements:
 * 1. Exactly 4 items: region (gu/dong), use (usage type), priceBand (banded), points ([string, string, string]).
 * 2. Provenance tags for points: ('public' | 'broker' | 'ai')[].
 * 3. Versioning & hash: card4_version (int), card4_hash (deterministic SHA-256 of the 4 items).
 * 4. Atomic update function with optimistic locking check on card4_version (409 conflict).
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ProvenanceSource = 'public' | 'broker' | 'ai';

export const ProvenanceSourceSchema = z.enum(['public', 'broker', 'ai']);

export const Card4ProvenanceSchema = z.object({
  points: z.tuple([
    ProvenanceSourceSchema,
    ProvenanceSourceSchema,
    ProvenanceSourceSchema,
  ]),
});

export type Card4Provenance = z.infer<typeof Card4ProvenanceSchema>;

export const Card4Schema = z.object({
  region: z.string().min(1, '권역을 입력해주세요'),
  use: z.string().min(1, '용도를 입력해주세요'),
  priceBand: z.string().min(1, '금액구간을 입력해주세요'),
  points: z.tuple([
    z.string().min(1, '특징 1을 입력해주세요'),
    z.string().min(1, '특징 2를 입력해주세요'),
    z.string().min(1, '특징 3를 입력해주세요'),
  ]),
  provenance: Card4ProvenanceSchema.default({
    points: ['public', 'public', 'public'],
  }),
  card4_version: z.number().int().positive().default(1),
  card4_hash: z.string().length(64).optional(),
});

export type Card4Data = z.infer<typeof Card4Schema>;

export interface Card4HashInput {
  region: string;
  use: string;
  priceBand: string;
  points: [string, string, string] | string[];
}

/**
 * Computes deterministic SHA-256 hash of the 4 core Deal Card items.
 */
export function computeCard4Hash(card: Card4HashInput): string {
  const normalizedPoints = Array.isArray(card.points)
    ? card.points.slice(0, 3).map((p) => (p || '').trim())
    : ['', '', ''];

  while (normalizedPoints.length < 3) {
    normalizedPoints.push('');
  }

  const canonicalObj = {
    points: normalizedPoints,
    priceBand: (card.priceBand || '').trim(),
    region: (card.region || '').trim(),
    use: (card.use || '').trim(),
  };

  const canonicalJson = JSON.stringify(canonicalObj);
  return crypto.createHash('sha256').update(canonicalJson).digest('hex');
}

export interface UpdateDealCard4Input {
  card4: {
    region: string;
    use: string;
    priceBand: string;
    points: [string, string, string];
    provenance?: {
      points: [ProvenanceSource, ProvenanceSource, ProvenanceSource];
    };
  };
  expectedVersion?: number;
  userId?: string;
}

export interface UpdateDealCard4Result {
  success: boolean;
  conflict?: boolean;
  currentVersion?: number;
  card4?: Card4Data;
  version?: number;
  hash?: string;
  error?: string;
}

/**
 * Performs atomic update with optimistic locking on card4_version.
 */
export async function updateDealCard4(
  supabase: SupabaseClient,
  buildingId: string,
  input: UpdateDealCard4Input,
): Promise<UpdateDealCard4Result> {
  if (!buildingId) {
    return { success: false, error: 'Building ID is required' };
  }

  // 1. Fetch current document_objects row for blind_teaser
  const { data: doc, error: fetchError } = await supabase
    .from('document_objects')
    .select('id, body, owner_id')
    .eq('building_id', buildingId)
    .eq('document_type', 'blind_teaser')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    return { success: false, error: fetchError.message };
  }

  const currentBody = (doc?.body as Record<string, any>) || {};
  const currentCard4 = currentBody.card4 as Partial<Card4Data> | undefined;
  const currentVersion = currentCard4?.card4_version ?? (doc ? 1 : 0);

  // 2. Optimistic locking check: if expectedVersion is provided, verify match
  if (
    input.expectedVersion !== undefined &&
    currentVersion > 0 &&
    input.expectedVersion !== currentVersion
  ) {
    return {
      success: false,
      conflict: true,
      currentVersion,
      error: `409 Version Conflict: expected version ${input.expectedVersion}, but current is ${currentVersion}`,
    };
  }

  const nextVersion = (currentVersion || 0) + 1;
  const newHash = computeCard4Hash(input.card4);

  const fullCard4: Card4Data = {
    region: input.card4.region.trim(),
    use: input.card4.use.trim(),
    priceBand: input.card4.priceBand.trim(),
    points: [
      input.card4.points[0].trim(),
      input.card4.points[1].trim(),
      input.card4.points[2].trim(),
    ],
    provenance: input.card4.provenance || currentCard4?.provenance || {
      points: ['broker', 'broker', 'broker'],
    },
    card4_version: nextVersion,
    card4_hash: newHash,
  };

  const updatedBody = {
    ...currentBody,
    card4: fullCard4,
    title: `${fullCard4.region} ${fullCard4.use} ${fullCard4.priceBand}`,
    dealPoints: [...fullCard4.points],
  };

  // 3. Update document_objects
  if (doc?.id) {
    const { error: updateDocError } = await supabase
      .from('document_objects')
      .update({
        body: updatedBody,
        title: updatedBody.title,
        updated_at: new Date().toISOString(),
      })
      .eq('id', doc.id);

    if (updateDocError) {
      return { success: false, error: updateDocError.message };
    }
  } else {
    // Insert new blind_teaser document
    const { error: insertDocError } = await supabase
      .from('document_objects')
      .insert({
        owner_id: input.userId,
        source_type: 'building_ssot_lite',
        source_id: buildingId,
        building_id: buildingId,
        document_type: 'blind_teaser',
        title: updatedBody.title,
        body: updatedBody,
        visibility: 'public_blind',
        status: 'draft',
      });

    if (insertDocError) {
      return { success: false, error: insertDocError.message };
    }
  }

  // 4. Update building_signal_cards in sync
  try {
    await supabase
      .from('building_signal_cards')
      .update({
        title: updatedBody.title,
        deal_points: [...fullCard4.points],
        area_signal: fullCard4.region,
        asset_type: fullCard4.use,
        price_band: fullCard4.priceBand,
        updated_at: new Date().toISOString(),
      })
      .eq('building_id', buildingId);
  } catch {
    // Graceful if signal card doesn't exist yet
  }

  // 5. Update building_ssot_lite signal fields
  try {
    await supabase
      .from('building_ssot_lite')
      .update({
        area_signal: fullCard4.region,
        asset_type: fullCard4.use,
        price_band: fullCard4.priceBand,
        updated_at: new Date().toISOString(),
      })
      .eq('id', buildingId);
  } catch {
    // Ignore if not applicable
  }

  return {
    success: true,
    card4: fullCard4,
    version: nextVersion,
    hash: newHash,
  };
}
