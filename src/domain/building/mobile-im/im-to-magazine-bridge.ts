/**
 * IM 생성 완료 시 매거진 소재 카드를 자동 생성하는 브릿지.
 * IM 7섹션 중 property_overview + investment_thesis를 요약하여
 * magazine_editions.featured_deal_ids에 자동 추가하기 위해
 * 임시 적재할 스니펫을 추출합니다.
 */
import type { MobileIMSection } from "@/lib/demo/mobile-im-demo-data";

export interface MagazineDealSnippet {
  buildingId: string;
  blindName: string;
  assetType: string;
  priceBand: string;
  investmentHighlight: string;  // investment_thesis 1줄 요약
  photoUrl?: string;
  generatedFrom: 'im_auto';
}

export function extractMagazineSnippet(
  imSections: MobileIMSection[],
  building: { id: string; area_signal: string; asset_type: string; price_band: string; photo_urls?: string[] },
): MagazineDealSnippet {
  const overview = imSections.find(s => s.sectionId === '01_overview' || s.sectionId === 'property_overview');
  const thesis = imSections.find(s => s.sectionId === '06_buyer_fit' || s.sectionId === 'investment_thesis');
  
  // 투자 포인트 1줄 추출 (첫 번째 불릿 또는 요약)
  let highlight = "";
  if (thesis?.content) {
    const bulletMatch = thesis.content.match(/[•\-\*]\s*(.+)/);
    if (bulletMatch && bulletMatch[1]) {
      highlight = bulletMatch[1].trim();
    } else {
      highlight = thesis.content.split('\n')[0]?.trim() || "";
    }
  }

  if (!highlight && overview?.content) {
    highlight = overview.content.slice(0, 80).replace(/[#*|]/g, '').trim() + '...';
  }

  if (!highlight) {
    highlight = '상세 투자설명서 확인 가능';
  }

  return {
    buildingId: building.id,
    blindName: building.area_signal
      ? `${building.area_signal} *** ${building.asset_type || '빌딩'}`
      : '비공개 매물',
    assetType: building.asset_type || '상업용 부동산',
    priceBand: building.price_band || '가격 비공개',
    investmentHighlight: highlight.slice(0, 100),
    photoUrl: building.photo_urls?.[0] || undefined,
    generatedFrom: 'im_auto',
  };
}
