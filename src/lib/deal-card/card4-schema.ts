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
import {
  deriveDealCardHeadline,
  repairDealCardLine,
  repairDealCardPoints,
} from './copy-limits';

export type ProvenanceSource = 'public' | 'broker' | 'ai';
export type DealCardPosture = 'income' | 'owner_occupied' | 'value_add';
export type DealCardPointTone = 'amber' | 'sky' | 'mint' | 'lavender' | 'peach';
export type DealCardGenerationSource = 'ai_memo' | 'manual';

export const ProvenanceSourceSchema = z.enum(['public', 'broker', 'ai']);
export const DealCardPostureSchema = z.enum(['income', 'owner_occupied', 'value_add']);
export const DealCardPointToneSchema = z.enum(['amber', 'sky', 'mint', 'lavender', 'peach']);
export const DealCardGenerationSourceSchema = z.enum(['ai_memo', 'manual']);

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
  pairedMemoId: z.string().optional(),
  generationSource: DealCardGenerationSourceSchema.optional(),
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
 *
 * Grounded: 수익률·특징은 장점 3줄에 실제로 있는 사실만 사용한다 (임의 "연 4%대" 생성 금지).
 * SSOT: `deriveDealCardHeadline` (src/lib/deal-card/copy-limits.ts).
 */
export function generateAiOgHeadline(card4: Partial<Card4Data>): string {
  return deriveDealCardHeadline({
    posture: card4.posture || 'income',
    points: card4.points || [],
  });
}

/**
 * AI Clustering helper (offline fallback): Reconstructs DealCard OG Headline (<=18 chars, zero tautology)
 * and 3 concise investment point titles (<=18 chars each, no verbose briefs).
 * - 기존 장점이 있으면 18자 체언형으로 교정해 재사용하고, 빈 칸만 숫자 없는 정성 문구로 채운다.
 */
export function reclusterDealCardPointsAsAxios(card4: Card4Data): Card4Data {
  const posture: DealCardPosture = card4.posture || 'income';

  const fallbackPointsByPosture: Record<DealCardPosture, [string, string, string]> = {
    income: ['접근성 좋은 입지', '안정적 임차 구성', '꾸준한 임대수익 구조'],
    owner_occupied: ['사옥 활용 쉬운 구조', '출퇴근 편한 입지', '즉시 검토 가능 매물'],
    value_add: ['신축·리모델링 검토 부지', '밸류업 여지 보유', '토지 가치 중심 매물'],
  };

  const nextPoints = repairDealCardPoints(card4.points, {
    fillEmpty: true,
    fallbacks: fallbackPointsByPosture[posture],
  });

  return {
    ...card4,
    headline: deriveDealCardHeadline({ posture, points: nextPoints }),
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
    pointBriefs?: [string, string, string];
    pointTones?: [DealCardPointTone, DealCardPointTone, DealCardPointTone];
    provenance?: {
      points: [ProvenanceSource, ProvenanceSource, ProvenanceSource];
    };
    pairedMemoId?: string;
    generationSource?: DealCardGenerationSource;
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

  // 18자 SSOT 교정: 장점 3줄은 어절 경계 교정, 한 줄 제목은 비어 있으면 근거 기반 파생 제목으로
  // **같은 필드(card4.headline)** 에 채운다 → 편집기·OG·고객 화면이 한 값만 본다.
  const repairedPoints = repairDealCardPoints(input.card4.points);
  const requestedHeadline = repairDealCardLine(input.card4.headline ?? currentCard4?.headline ?? '');
  const resolvedHeadline =
    requestedHeadline ||
    deriveDealCardHeadline({
      posture: input.card4.posture ?? currentCard4?.posture,
      points: repairedPoints,
    });
  const newHash = computeCard4Hash({ ...input.card4, headline: resolvedHeadline, points: repairedPoints });

  const resolvedPointBriefs = input.card4.pointBriefs ?? currentCard4?.pointBriefs;
  const resolvedPointTones = input.card4.pointTones ?? currentCard4?.pointTones;
  const resolvedPairedMemoId = input.card4.pairedMemoId ?? currentCard4?.pairedMemoId;
  const resolvedGenerationSource =
    input.card4.generationSource ?? currentCard4?.generationSource;

  const fullCard4: Card4Data = {
    headline: resolvedHeadline,
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
    points: repairedPoints,
    ...(resolvedPointBriefs ? { pointBriefs: resolvedPointBriefs } : {}),
    ...(resolvedPointTones ? { pointTones: resolvedPointTones } : {}),
    ...(resolvedPairedMemoId ? { pairedMemoId: resolvedPairedMemoId } : {}),
    ...(resolvedGenerationSource ? { generationSource: resolvedGenerationSource } : {}),
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
    // 레거시 OG 라우트가 ogTitle 을 우선 읽으므로, 중개사 편집 제목과 항상 동기화한다.
    ...(fullCard4.headline ? { ogTitle: fullCard4.headline } : {}),
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
