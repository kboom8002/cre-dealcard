/**
 * @module MagazineTeaserCards
 * @description Renders teaser cards for magazine editions using teaser-projector.
 * Replaces the legacy DealSnippet pattern from im-to-magazine-bridge.
 * @see docs/credal_v3/SDD-magazine.md MG-A1
 */

import { projectToTeaser, type TeaserView } from '@/domain/deal/teaser/teaser-projector';

export interface MagazineTeaserCard {
  teaserView: TeaserView;
  cardHtml: string;
  dealId: string;
  position: number;
}

/**
 * Generates teaser cards for inclusion in magazine editions.
 * Uses the teaser-projector to ensure no precise data leaks.
 */
export function generateMagazineTeaserCards(
  deals: Array<{ id: string; attrs: Record<string, unknown> }>,
  maxCards: number = 5
): MagazineTeaserCard[] {
  return deals.slice(0, maxCards).map((deal, idx) => {
    const teaserView = projectToTeaser(deal.attrs);
    return {
      teaserView,
      cardHtml: renderTeaserCardHtml(teaserView),
      dealId: deal.id,
      position: idx + 1,
    };
  });
}

function renderTeaserCardHtml(teaser: TeaserView): string {
  return `
<div style="border:1px solid #333; border-radius:12px; padding:20px; margin:12px 0; background:#1a1a1a;">
  <div style="font-size:12px; color:#888;">${teaser.region} · ${teaser.assetType}</div>
  <div style="font-size:18px; font-weight:700; color:#fff; margin:8px 0;">${teaser.hookCopy}</div>
  <div style="display:flex; gap:16px; margin:12px 0;">
    <span style="color:#4ade80;">💰 ${teaser.bandedPrice}</span>
    <span style="color:#60a5fa;">📐 ${teaser.bandedArea}</span>
    <span style="color:#f59e0b;">📈 ${teaser.bandedCapRate}</span>
  </div>
  <div style="font-size:12px; color:#666;">${teaser.structuralSignals.join(' · ')}</div>
  <div style="margin-top:12px; padding:8px 12px; background:#2a2a2a; border-radius:8px; text-align:center; color:#4ade80;">
    ${teaser.curiositySlot}
  </div>
</div>`.trim();
}
