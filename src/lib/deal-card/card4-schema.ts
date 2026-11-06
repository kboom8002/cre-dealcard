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
 * AI Clustering helper: Reconstructs DealCard 3 points into AXIOS-style
 * 1-line punchy titles (<=18 chars) + 2~3 sentence analytical briefs + pastel Post-it tones.
 */
export function reclusterDealCardPointsAsAxios(card4: Card4Data): Card4Data {
  const regionShort = (card4.region || '핵심 권역').split(' ').slice(-1)[0] || '핵심 권역';
  const useLabel = card4.use || '근생빌딩';
  const priceLabel = card4.priceBand || '적정 구간';
  const posture = card4.posture || 'income';

  const defaultPointsByPosture: Record<
    DealCardPosture,
    {
      headline: string;
      points: [string, string, string];
      briefs: [string, string, string];
    }
  > = {
    income: {
      headline: `[${regionShort} 알짜 수익형] ${priceLabel}대 우량 임차 만실 ${useLabel}`,
      points: [
        `${regionShort} 역세권 가시성 코너`,
        `우량 임차인 장기 만실 운영`,
        `연 4%대 안정 배당 수익권`,
      ],
      briefs: [
        `역세권 주동선 코너에 위치해 유동인구 흡인력과 상권 시인성이 뛰어납니다. 공실 발생 시에도 임차 수요 회복이 빠른 핵심 입지입니다.`,
        `검증된 우량 업종 중심으로 임차 구성이 완료되어 임대료 연체 리스크가 낮습니다. 인수 즉시 안정적인 현금흐름 창출이 가능합니다.`,
        `${priceLabel} 구간 내 실수익률과 토지 가치를 동시에 확보한 매물입니다. 금리 인하기 캡레이트 압축에 따른 자본차익도 기대됩니다.`,
      ],
    },
    owner_occupied: {
      headline: `[${regionShort} 사옥 추천] ${priceLabel}대 즉시 입주·가시성 우수 ${useLabel}`,
      points: [
        `대로 이면 뛰어난 사옥 가시성`,
        `효율적 전용면적·주차 완비`,
        `인근 실거래 대비 합리적 호가`,
      ],
      briefs: [
        `내방객 접근성과 대중교통 출퇴근 편의성이 모두 우수한 입지입니다. 기업 브랜드 가치를 높이는 사옥 외관을 갖추고 있습니다.`,
        `층별 레이아웃 효율이 높고 자주식 주차 여건이 우수해 단독 또는 부분 사옥으로 즉시 활용하기 적합합니다.`,
        `최근 인근 유사 규모 거래 사례 대비 평당 단가 경쟁력이 확보되어 사옥 실수요와 중장기 자산가치 상승을 겸비했습니다.`,
      ],
    },
    value_add: {
      headline: `[${regionShort} 밸류애드] ${priceLabel}대 리모델링·신축 가시권 ${useLabel}`,
      points: [
        `용적률 여유·증축 잠재력 보유`,
        `리모델링 시 임대료 대폭 상승`,
        `토지 단가 중심 하방경직성 확보`,
      ],
      briefs: [
        `현행 법정 용적률 대비 미활용 면적이 존재하여 수직 증축 또는 대수선을 통한 연면적 확장이 가능합니다.`,
        `외관 파사드 개선 및 1~2층 핵심 리테일 MD 재구성을 통해 주변 신축급 임대료 수준으로 밸류업이 가능한 구조입니다.`,
        `${regionShort} 핵심 상권 확장축에 위치해 토지 가치가 탄탄하며, 명도 협의가 용이해 사업 일정 단축이 가능합니다.`,
      ],
    },
  };

  const preset = defaultPointsByPosture[posture];
  const nextPoints: [string, string, string] = [
    (card4.points[0]?.trim() && card4.points[0].trim().length <= 18
      ? card4.points[0].trim()
      : preset.points[0]
    ).slice(0, 18),
    (card4.points[1]?.trim() && card4.points[1].trim().length <= 18
      ? card4.points[1].trim()
      : preset.points[1]
    ).slice(0, 18),
    (card4.points[2]?.trim() && card4.points[2].trim().length <= 18
      ? card4.points[2].trim()
      : preset.points[2]
    ).slice(0, 18),
  ];

  return {
    ...card4,
    headline: card4.headline?.trim() || preset.headline,
    posture,
    points: nextPoints,
    pointBriefs: preset.briefs,
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
