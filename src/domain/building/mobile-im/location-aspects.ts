import type { LocationCategory } from '@/domain/ontology/enums';
import type { LocationAspectItem } from '@/domain/ontology/slots';

export type LocationAspect = 'legal' | 'appraisal' | 'accessibility';

export interface LocationItem {
  id: string;
  title: string;
  distanceMeter: number;
  description?: string;
  isPremium?: boolean;
}

export interface LocationSection {
  aspect: LocationAspect;
  items: LocationItem[];
  score: number;
}

export function buildLocationSections(data: Record<string, unknown>, tier: 'basic' | 'pro'): LocationSection[] {
  const sections: LocationSection[] = [];
  
  const aspects: LocationAspect[] = ['legal', 'appraisal', 'accessibility'];
  
  for (const aspect of aspects) {
    if (data[aspect] && Array.isArray(data[aspect])) {
      let items = data[aspect] as LocationItem[];
      
      // Filter out premium items for basic tier
      if (tier === 'basic') {
        items = items.filter(item => !item.isPremium);
      }
      
      if (items.length > 0) {
        sections.push({
          aspect,
          items,
          score: 80 // Mock score
        });
      }
    }
  }
  
  return sections;
}

// ══════════════════════════════════════════════════════════════════════
// v0.5: 입지 온톨로지 세부 속성 분류 시스템
// ══════════════════════════════════════════════════════════════════════

/** 키워드 → 입지 카테고리 매핑 테이블 */
const LOCATION_KEYWORD_MAP: Record<string, LocationCategory> = {
  // transit_access
  '역': 'transit_access',
  '지하철': 'transit_access',
  '전철': 'transit_access',
  '버스': 'transit_access',
  '도보': 'transit_access',
  '대중교통': 'transit_access',
  '노선': 'transit_access',
  '환승': 'transit_access',
  // road_network
  '도로': 'road_network',
  '대로': 'road_network',
  '차량': 'road_network',
  '접면': 'road_network',
  '코너': 'road_network',
  '접근': 'road_network',
  '진출입': 'road_network',
  '주차': 'road_network',
  // catchment_demand
  '상권': 'catchment_demand',
  '유동': 'catchment_demand',
  '배후': 'catchment_demand',
  '집객': 'catchment_demand',
  '세대': 'catchment_demand',
  '인구': 'catchment_demand',
  '오피스': 'catchment_demand',
  '업무': 'catchment_demand',
  '권역': 'catchment_demand',
  // urban_amenity
  '인프라': 'urban_amenity',
  '학교': 'urban_amenity',
  '병원': 'urban_amenity',
  '공원': 'urban_amenity',
  '관공서': 'urban_amenity',
  '편의': 'urban_amenity',
  '마트': 'urban_amenity',
  '문화': 'urban_amenity',
};

/** 카테고리별 한국어 라벨 */
export const LOCATION_CATEGORY_LABELS: Record<LocationCategory, string> = {
  transit_access: '교통 접근성',
  road_network: '도로 조건',
  catchment_demand: '배후 수요',
  urban_amenity: '주변 인프라',
};

/**
 * v0.5: 비구조화 텍스트에서 입지 카테고리를 자동 분류합니다.
 * 키워드 기반 매핑으로 반복되는 "입지 정보" 제네릭 라벨을 방지합니다.
 */
export function classifyLocationAspect(text: string): LocationCategory {
  for (const [keyword, category] of Object.entries(LOCATION_KEYWORD_MAP)) {
    if (text.includes(keyword)) {
      return category;
    }
  }
  return 'catchment_demand'; // 기본값
}

/**
 * v0.5: 비구조화 입지 텍스트 라인들을 구조화된 LocationAspectItem 배열로 변환합니다.
 */
export function structureLocationAspects(lines: string[]): LocationAspectItem[] {
  const items: LocationAspectItem[] = [];
  const seenCategories = new Set<string>();

  for (const line of lines) {
    const stripped = line
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/^[-•·]\s*/, '')
      .trim();
    if (!stripped || stripped.length < 3) continue;

    const category = classifyLocationAspect(stripped);
    const label = LOCATION_CATEGORY_LABELS[category];

    // 카테고리별 중복 라벨 방지 (최대 2개)
    const catKey = `${category}:${label}`;
    const catCount = [...seenCategories].filter(k => k.startsWith(`${category}:`)).length;
    if (catCount >= 2) continue;
    seenCategories.add(catKey);

    // 콜론 분리 시도
    const parts = stripped.split(/[：:]/);
    if (parts.length >= 2) {
      items.push({
        category,
        label: parts[0].trim().slice(0, 20),
        value: parts.slice(1).join(':').trim(),
      });
    } else {
      items.push({
        category,
        label,
        value: stripped,
      });
    }
  }

  return items;
}
