export type MobileIMLevel = 'L1' | 'L1.5';

export interface MobileIMSection {
  sectionType: string;
  title: string;
  content: string;
  tables?: Array<{ headers: string[]; rows: string[][] }>;
}

export interface MobileIMPackage {
  packageId: string;
  dealId: string;
  corePackageHash: string;
  level: MobileIMLevel;
  sections: MobileIMSection[];
  claims: any[];
  harnessReportId: string;
  packageHash: string;
  createdAt: string;
}
