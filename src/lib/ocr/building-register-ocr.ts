/**
 * 건축물대장 PDF OCR 및 데이터 추출 모듈 (Mock/Interface)
 * 실제 프로덕션에서는 Google Cloud Vision API, 네이버 CLOVA OCR, 또는 AWS Textract를 통해 구현.
 */

export interface BuildingRegisterData {
  address: string;
  platArea: number; // 대지면적 (㎡)
  totalArea: number; // 연면적 (㎡)
  buildingCoverageRatio: number; // 건폐율 (%)
  floorAreaRatio: number; // 용적률 (%)
  mainPurpose: string; // 주용도
  approvalDate: string; // 사용승인일
  floors: {
    underground: number;
    ground: number;
  };
  parkingSpaces: number; // 주차대수
  elevatorCount: number; // 승강기대수
}

export async function parseBuildingRegisterPDF(_file: File): Promise<BuildingRegisterData> {
  throw new Error('[NOT_IMPLEMENTED] 건축물대장 OCR API 미연동 — Phase 2 구현 예정');
}
