export type StudioStage =
  | 'S00_INIT'
  | 'S10_COMPOSITION'
  | 'S20_COPY'
  | 'S30_LAYOUT'
  | 'S40_PREVIEW'
  | 'S50_GATE_CHECK'
  | 'S60_EDITORIAL_APPROVAL'
  | 'S70_FILE_APPROVAL';

export interface PptxSlide {
  id: string;
  projectId: string;
  slideIndex: number;
  layoutType: string;
  category: 'body' | 'appendix';
  contentUnitIds: string[];
  slideOverrides: Record<string, unknown>;
  createdAt: string;
}

export interface PptxProject {
  id: string;
  dealId: string;
  packageId: string;
  version: number;
  title: string;
  themeId: string;
  targetAudience: string;
  lockVersion: number;
  stage: StudioStage;
  slides: PptxSlide[];
  editorialApprovedBy?: string;
  editorialApprovedAt?: string;
  fileApprovedBy?: string;
  fileApprovedAt?: string;
  artifactFileHash?: string;
  createdAt: string;
  updatedAt: string;
}
