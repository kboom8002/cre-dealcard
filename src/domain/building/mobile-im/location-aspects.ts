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
