export interface SlideDefinition {
  slideNumber: number;
  archetype: string;
  title: string;
  category: 'body' | 'appendix';
  leftContent?: {
    leadText: string;
    narrative: string;
  };
  rightContent?: {
    cards: Array<{ label: string; value: string; detail?: string }>;
  };
  tables?: Array<{ headers: string[]; rows: string[][] }>;
}

export interface PPTXDeckSpec {
  deckId: string;
  dealId: string;
  corePackageHash: string;
  slides: SlideDefinition[];
  bodySlideCount: number;
  appendixSlideCount: number;
  deckHash: string;
  createdAt: string;
}
