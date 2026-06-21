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

export async function parseBuildingRegisterPDF(file: File): Promise<BuildingRegisterData> {
  // TODO: 실제 OCR API 호출 및 파싱 로직 연동
  console.log(`Parsing building register PDF: ${file.name} (${file.size} bytes)`);

  // 시뮬레이션 지연
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Mock 데이터 반환 (실제로는 OCR 추출 텍스트를 LLM/정규식으로 파싱하여 반환)
  return {
    address: "서울특별시 강남구 역삼동 123-45",
    platArea: 330.5,
    totalArea: 1500.0,
    buildingCoverageRatio: 59.5,
    floorAreaRatio: 249.8,
    mainPurpose: "업무시설",
    approvalDate: "2015-08-20",
    floors: {
      underground: 2,
      ground: 7,
    },
    parkingSpaces: 12,
    elevatorCount: 1,
  };
}
