/**
 * 등기부등본 PDF OCR 및 권리분석 모듈 (Mock/Interface)
 * 실제 프로덕션에서는 OCR 추출 후 LLM(GPT-4o 등)을 활용해 근저당권, 전세권 등 주요 권리관계를 추출합니다.
 */

export interface RegistryRight {
  type: "근저당권" | "전세권" | "가압류" | "기타";
  creditor: string; // 채권자
  amount: number; // 채권최고액(원)
  registrationDate: string; // 등기일자
  status: "활성" | "말소";
}

export interface RegistryData {
  address: string;
  ownerName: string; // 소유자명 (마스킹 처리 권장)
  ownershipShare: string; // 소유지분
  rights: RegistryRight[];
  totalDebtEstimated: number; // 추정 총 채권액
  hasRedFlags: boolean; // 위험 요소 여부 (가압류, 경매개시 등)
}

export async function parseRealEstateRegistryPDF(file: File): Promise<RegistryData> {
  // TODO: 실제 OCR API 호출 및 권리분석 추출 로직 연동
  console.log(`Parsing real estate registry PDF: ${file.name} (${file.size} bytes)`);

  await new Promise(resolve => setTimeout(resolve, 1500));

  return {
    address: "서울특별시 강남구 역삼동 123-45",
    ownerName: "홍*동",
    ownershipShare: "1/1",
    rights: [
      {
        type: "근저당권",
        creditor: "신한은행",
        amount: 1500000000,
        registrationDate: "2018-05-12",
        status: "활성",
      }
    ],
    totalDebtEstimated: 1500000000,
    hasRedFlags: false,
  };
}
