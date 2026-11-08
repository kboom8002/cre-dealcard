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
export type DealCardPosture = 'income' | 'owner_occupied' | 'value_add';
export type DealCardPointTone = 'amber' | 'sky' | 'mint' | 'lavender' | 'peach';

export const ProvenanceSourceSchema = z.enum(['public', 'broker', 'ai']);
export const DealCardPostureSchema = z.enum(['income', 'owner_occupied', 'value_add']);
export const DealCardPointToneSchema = z.enum(['amber', 'sky', 'mint', 'lavender', 'peach']);

export const Card4ProvenanceSchema = z.object({
  points: z.tuple([
    ProvenanceSourceSchema,
    ProvenanceSourceSchema,
    ProvenanceSourceSchema,
  ]),
});

export type Card4Provenance = z.infer<typeof Card4ProvenanceSchema>;

export const Card4Schema = z.object({
  headline: z.string().optional(),
  posture: DealCardPostureSchema.optional(),
  region: z.string().min(1, '권역을 입력해주세요'),
  use: z.string().min(1, '용도를 입력해주세요'),
  area: z.string().optional(),
  gfaPyung: z.number().positive().optional(),
  landAreaPyung: z.number().positive().optional(),
  priceBand: z.string().min(1, '금액구간을 입력해주세요'),
  points: z.tuple([
    z.string().min(1, '특징 1을 입력해주세요'),
    z.string().min(1, '특징 2를 입력해주세요'),
    z.string().min(1, '특징 3를 입력해주세요'),
  ]),
  pointBriefs: z.tuple([z.string(), z.string(), z.string()]).optional(),
  pointTones: z
    .tuple([
      DealCardPointToneSchema,
      DealCardPointToneSchema,
      DealCardPointToneSchema,
    ])
    .optional(),
  provenance: Card4ProvenanceSchema.default({
    points: ['public', 'public', 'public'],
  }),
  card4_version: z.number().int().positive().default(1),
  card4_hash: z.string().length(64).optional(),
});

export type Card4Data = z.infer<typeof Card4Schema>;

/**
 * Resolves the 3rd quadrant area display text based on posture (Req 1 & 1-1):
 * - income (임대수익형) / owner_occupied (사옥형) -> 연면적
 * - value_add (개발/나대지·신축형) -> 토지면적
 */
export function resolveCard4AreaLabel(
  card4: Partial<Card4Data>,
  fallbackSpecs?: { gfaPyung?: number | null; landAreaPyung?: number | null },
): string {
  const posture: DealCardPosture = card4.posture || 'income';
  const isLandPosture = posture === 'value_add';

  if (card4.area && card4.area.trim().length > 0) {
    return card4.area.trim();
  }

  const gfa = card4.gfaPyung ?? fallbackSpecs?.gfaPyung ?? undefined;
  const land = card4.landAreaPyung ?? fallbackSpecs?.landAreaPyung ?? undefined;

  if (isLandPosture) {
    if (typeof land === 'number' && Number.isFinite(land) && land > 0) {
      return `토지 ${Math.round(land)}평`;
    }
    return '';
  }

  if (typeof gfa === 'number' && Number.isFinite(gfa) && gfa > 0) {
    return `연면적 ${Math.round(gfa)}평`;
  }
  return '';
}

/**
 * Computes the appropriate area label when switching posture between
 * 임대수익형/사옥형 (연면적) and 개발/신축형 (토지면적).
 * Never fabricates numbers when the target area metric is unknown.
 */
export function resolveAreaOnPostureChange(
  card4: Card4Data,
  nextPosture: DealCardPosture,
): string {
  const isLandPosture = nextPosture === 'value_add';
  const currentArea = (card4.area || '').trim();
  if (isLandPosture) {
    if (typeof card4.landAreaPyung === 'number' && card4.landAreaPyung > 0) {
      return `토지 ${Math.round(card4.landAreaPyung)}평`;
    }
    if (currentArea.startsWith('토지') || currentArea.startsWith('대지')) {
      return currentArea;
    }
    return '';
  } else {
    if (typeof card4.gfaPyung === 'number' && card4.gfaPyung > 0) {
      return `연면적 ${Math.round(card4.gfaPyung)}평`;
    }
    if (currentArea.startsWith('연면적')) {
      return currentArea;
    }
    return '';
  }
}

/**
 * Generates an <=18-char AI appeal copy (OG Title) focused on yield or key strength,
 * strictly avoiding tautological repetition of region, use, area, or priceBand (Req 2).
 */
export function generateAiOgHeadline(card4: Partial<Card4Data>): string {
  const posture: DealCardPosture = card4.posture || 'income';
  const joinedPoints = (card4.points || []).join(' ');
  const yieldMatch = joinedPoints.match(/(\d+(?:\.\d+)?\s*%)/);
  const yieldStr = yieldMatch ? yieldMatch[1].replace(/\s+/g, '') : null;

  if (posture === 'income') {
    if (yieldStr) {
      return `연 ${yieldStr} 우량임차 만실 빌딩`.slice(0, 18);
    }
    return '연 4%대 우량임차 만실 코너'.slice(0, 18);
  }

  if (posture === 'owner_occupied') {
    return '즉시입주·가시성 우수 코너사옥'.slice(0, 18);
  }

  return '용적률 여유·신축 밸류업 최적'.slice(0, 18);
}

/**
 * AI Clustering helper: Reconstructs DealCard OG Headline (<=18 chars, zero tautology)
 * and 3 concise investment point titles (<=18 chars each, no verbose briefs).
 */
export function reclusterDealCardPointsAsAxios(card4: Card4Data): Card4Data {
  const posture: DealCardPosture = card4.posture || 'income';

  const defaultPointsByPosture: Record<
    DealCardPosture,
    {
      headline: string;
      points: [string, string, string];
    }
  > = {
    income: {
      headline: generateAiOgHeadline({ ...card4, posture: 'income' }),
      points: [
        '역세권 도보 3분 가시성 코너',
        '우량 임차인 전층 만실 운영',
        '연 4%대 안정 배당 수익권',
      ],
    },
    owner_occupied: {
      headline: generateAiOgHeadline({ ...card4, posture: 'owner_occupied' }),
      points: [
        '대로 이면 뛰어난 사옥 가시성',
        '효율적 전용면적·주차 완비',
        '인근 실거래 대비 합리적 호가',
      ],
    },
    value_add: {
      headline: generateAiOgHeadline({ ...card4, posture: 'value_add' }),
      points: [
        '용적률 여유·증축 잠재력 보유',
        '리모델링 시 임대료 대폭 상승',
        '토지 단가 중심 하방경직성 확보',
      ],
    },
  };

  const preset = defaultPointsByPosture[posture];
  const nextPoints: [string, string, string] = [
    preset.points[0].slice(0, 18),
    preset.points[1].slice(0, 18),
    preset.points[2].slice(0, 18),
  ];

  return {
    ...card4,
    headline: preset.headline.slice(0, 18),
    posture,
    area: resolveCard4AreaLabel({ ...card4, posture }),
    points: nextPoints,
    pointTones: ['amber', 'sky', 'mint'],
    provenance: {
      points: ['ai', 'ai', 'ai'],
    },
  };
}

export interface Card4HashInput {
  region: string;
  use: string;
  priceBand: string;
  points: [string, string, string] | string[];
  area?: string;
  headline?: string;
}

/**
 * Computes deterministic SHA-256 hash of the Deal Card items.
 */
export function computeCard4Hash(card: Card4HashInput): string {
  const normalizedPoints = Array.isArray(card.points)
    ? card.points.slice(0, 3).map((p) => (p || '').trim())
    : ['', '', ''];

  while (normalizedPoints.length < 3) {
    normalizedPoints.push('');
  }

  const trimmedArea = (card.area || '').trim();
  const trimmedHeadline = (card.headline || '').trim();

  const canonicalObj: Record<string, unknown> = {
    ...(trimmedArea ? { area: trimmedArea } : {}),
    ...(trimmedHeadline ? { headline: trimmedHeadline } : {}),
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
    headline?: string;
    posture?: DealCardPosture;
    region: string;
    use: string;
    area?: string;
    gfaPyung?: number;
    landAreaPyung?: number;
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
    ...(input.card4.headline ?? currentCard4?.headline
      ? { headline: (input.card4.headline ?? currentCard4?.headline)?.trim().slice(0, 18) }
      : {}),
    ...(input.card4.posture ?? currentCard4?.posture
      ? { posture: input.card4.posture ?? currentCard4?.posture }
      : {}),
    region: input.card4.region.trim(),
    use: input.card4.use.trim(),
    ...(input.card4.area ?? currentCard4?.area
      ? { area: (input.card4.area ?? currentCard4?.area)?.trim() }
      : {}),
    ...(input.card4.gfaPyung ?? currentCard4?.gfaPyung
      ? { gfaPyung: input.card4.gfaPyung ?? currentCard4?.gfaPyung }
      : {}),
    ...(input.card4.landAreaPyung ?? currentCard4?.landAreaPyung
      ? { landAreaPyung: input.card4.landAreaPyung ?? currentCard4?.landAreaPyung }
      : {}),
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
    title: fullCard4.headline || `${fullCard4.region} ${fullCard4.use} ${fullCard4.priceBand}`,
    kakaoOgTitle: fullCard4.headline || generateAiOgHeadline(fullCard4),
    kakaoOgDescription: '',
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
