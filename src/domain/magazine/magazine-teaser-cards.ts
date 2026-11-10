/**
 * @module MagazineTeaserCards
 * @description Renders teaser cards for magazine editions using teaser-projector.
 * Replaces the legacy DealSnippet pattern from im-to-magazine-bridge.
 * @see docs/credal_v3/SDD-magazine.md MG-A1
 *
 * [M2-22] 근거 데이터가 없으면 카드를 만들지 않고(가짜 `STABLE_INCOME`/사유 문구 생성 금지),
 * 모든 텍스트는 HTML 이스케이프하며 attrs 가 null 이어도 throw 하지 않는다.
 * export 시그니처(generateMagazineTeaserCards, MagazineTeaserCard)는 weekly/special generator 가 사용하므로 불변.
 */

import { projectToTeaser, type TeaserView } from '@/domain/deal/teaser/teaser-projector';
import { cleanBlindPoints } from '@/lib/deal-card/blind-guard';
import { escapeHtml } from '@/lib/magazine/escape';
import { buildAttrsFromSsotLite } from '@/lib/ssot-adapter';

export interface MagazineTeaserCard {
  teaserView: TeaserView;
  cardHtml: string;
  dealId: string;
  position: number;
}

/** 카드에 쓸 만한 근거(가격·면적·수익률·권역·자산유형 중 하나)가 attrs 에 있는지. */
const EVIDENCE_KEYS = [
  'askingPriceKrw', 'priceBand', 'price_band',
  'totalFloorAreaPyung', 'capRatePct',
  'address', 'sigungu', 'regionLabel', 'areaSignal', 'region', 'area_signal',
  'assetType', 'asset_type',
] as const;

const NESTED_EVIDENCE_LAYER_KEYS = [
  'finance',
  'building_register',
  'deal_terms',
  'card4',
] as const;

const NESTED_EVIDENCE_FIELD_KEYS = [
  ...EVIDENCE_KEYS,
  'asking_price_krw',
  'asking_price',
  'monthly_rent_krw',
  'total_floor_area_pyung',
  'land_area_pyung',
  'cap_rate_pct',
  'use',
  'area',
  'headline',
] as const;

function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v) && v !== 0;
  return true;
}

function hasNestedLayerEvidence(attrs: Record<string, unknown>): boolean {
  const layersObj =
    attrs.layers && typeof attrs.layers === 'object'
      ? (attrs.layers as Record<string, unknown>)
      : attrs;

  for (const layerKey of NESTED_EVIDENCE_LAYER_KEYS) {
    const layer = (layersObj[layerKey] ?? attrs[layerKey]) as Record<string, unknown> | undefined;
    if (layer && typeof layer === 'object') {
      if (NESTED_EVIDENCE_FIELD_KEYS.some((fk) => hasValue(layer[fk]))) {
        return true;
      }
    }
  }
  return false;
}

function hasEvidence(attrs: Record<string, unknown>): boolean {
  if (EVIDENCE_KEYS.some((k) => hasValue(attrs[k]))) return true;
  return hasNestedLayerEvidence(attrs);
}

function normalizeDealAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  if (!hasNestedLayerEvidence(attrs)) {
    return attrs;
  }
  const ssotNormalized = buildAttrsFromSsotLite({ layers: attrs, ...attrs });
  const layersObj =
    attrs.layers && typeof attrs.layers === 'object'
      ? (attrs.layers as Record<string, unknown>)
      : attrs;
  const dealTerms = (layersObj.deal_terms ?? attrs.deal_terms ?? {}) as Record<string, unknown>;
  const card4 = (layersObj.card4 ?? attrs.card4 ?? {}) as Record<string, unknown>;

  const merged: Record<string, unknown> = {
    ...ssotNormalized,
  };
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) {
      merged[k] = v;
    }
  }

  if (!hasValue(merged.askingPriceKrw) && hasValue(dealTerms.asking_price_krw ?? dealTerms.askingPriceKrw)) {
    merged.askingPriceKrw = Number(dealTerms.asking_price_krw ?? dealTerms.askingPriceKrw);
  }
  if (!hasValue(merged.priceBand) && hasValue(card4.priceBand ?? dealTerms.price_band ?? dealTerms.priceBand)) {
    merged.priceBand = String(card4.priceBand ?? dealTerms.price_band ?? dealTerms.priceBand);
  }
  if (!hasValue(merged.areaSignal) && !hasValue(merged.regionLabel) && hasValue(card4.region)) {
    merged.areaSignal = String(card4.region);
    merged.regionLabel = String(card4.region);
  }
  if (!hasValue(merged.assetType) && hasValue(card4.use)) {
    merged.assetType = String(card4.use);
  }

  return merged;
}

/**
 * Generates teaser cards for inclusion in magazine editions.
 * Uses the teaser-projector to ensure no precise data leaks.
 * 근거 데이터가 없는 딜은 건너뛴다(빈 배열 가능 — 호출부는 teaserCards[0]? 로 안전하게 처리).
 */
export function generateMagazineTeaserCards(
  deals: Array<{ id: string; attrs: Record<string, unknown> }>,
  maxCards: number = 5
): MagazineTeaserCard[] {
  const cards: MagazineTeaserCard[] = [];
  for (const deal of deals ?? []) {
    if (cards.length >= maxCards) break;
    const rawAttrs = deal?.attrs;
    if (!deal || !rawAttrs || typeof rawAttrs !== 'object' || !hasEvidence(rawAttrs)) continue;

    const attrs = normalizeDealAttrs(rawAttrs);
    let teaserView = projectToTeaser(attrs);

    // Mask hookCopy and structuralSignals with cleanBlindPoints
    const maskedHook = cleanBlindPoints([teaserView.hookCopy || ''])[0] ?? teaserView.hookCopy;
    const maskedSignals = Array.isArray(teaserView.structuralSignals)
      ? cleanBlindPoints(teaserView.structuralSignals)
      : [];
    teaserView = {
      ...teaserView,
      hookCopy: maskedHook,
      structuralSignals: maskedSignals,
    };

    // projector 는 attrs.archetype 이 없으면 'STABLE_INCOME' 으로 두고, classifier 는 vacancyPct 가 없을 때도
    // "공실률 5% 이하" 사유(0.85)를 낸다. 근거(공실률)가 없으면 이 분류는 가짜이므로 제거한다.
    const hasExplicitArchetype = hasValue(attrs.archetype);
    const stableWithoutVacancy =
      teaserView.archetypeResult?.primaryArchetype === 'STABLE_INCOME' &&
      (attrs.vacancyPct === null || attrs.vacancyPct === undefined);
    if (!hasExplicitArchetype && stableWithoutVacancy) {
      teaserView = { ...teaserView, archetype: '', archetypeResult: undefined };
    }

    cards.push({
      teaserView,
      cardHtml: renderTeaserCardHtml(teaserView),
      dealId: deal.id,
      position: cards.length + 1,
    });
  }
  return cards;
}

function renderTeaserCardHtml(teaser: TeaserView): string {
  const signals = Array.isArray(teaser.structuralSignals) ? teaser.structuralSignals : [];
  return `
<div style="border:1px solid #333; border-radius:12px; padding:20px; margin:12px 0; background:#1a1a1a;">
  <div style="font-size:12px; color:#888;">${escapeHtml(teaser.region)} · ${escapeHtml(teaser.assetType)}</div>
  <div style="font-size:18px; font-weight:700; color:#fff; margin:8px 0;">${escapeHtml(teaser.hookCopy)}</div>
  <div style="display:flex; gap:16px; margin:12px 0;">
    <span style="color:#4ade80;">💰 ${escapeHtml(teaser.bandedPrice)}</span>
    <span style="color:#60a5fa;">📐 ${escapeHtml(teaser.bandedArea)}</span>
    <span style="color:#f59e0b;">📈 ${escapeHtml(teaser.bandedCapRate)}</span>
  </div>
  <div style="font-size:12px; color:#666;">${signals.map((s) => escapeHtml(s)).join(' · ')}</div>
  <div style="margin-top:12px; padding:8px 12px; background:#2a2a2a; border-radius:8px; text-align:center; color:#4ade80;">
    ${escapeHtml(teaser.curiositySlot)}
  </div>
</div>`.trim();
}
