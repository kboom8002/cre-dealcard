/**
 * 국토교통부 건축HUB 건축물대장정보 서비스 API 클라이언트
 *
 * API: 건축물대장 표제부 조회 (getBrTitleInfo)
 * 문서: https://www.data.go.kr/data/15044713/openapi.do
 */

const GOVT_API_BASE = "https://apis.data.go.kr/1613000/BldRgstService_v2";

export interface GovtBuildingInfo {
  exists: boolean;
  mainPurpose?: string;      // 주용도 (e.g. "업무시설")
  totalFloorArea?: number;   // 연면적 (㎡)
  buildYear?: number;        // 사용승인일 연도
  address?: string;          // 정제된 주소
  floors?: number;           // 지상 층수
  undergroundFloors?: number;// 지하 층수
  mainStructure?: string;    // 주구조 (e.g. "철근콘크리트구조")
  buildingCoverageRatio?: number; // 건폐율 (%)
  floorAreaRatio?: number;   // 용적률 (%)
  landArea?: number;         // 대지면적 (㎡)
}

// 데모용 모의 응답 데이터
const MOCK_BUILDINGS: Record<string, GovtBuildingInfo> = {
  "11680-10100-0742-0001": {
    exists: true,
    mainPurpose: "업무시설",
    totalFloorArea: 9917.3,
    buildYear: 2015,
    address: "서울특별시 강남구 역삼동 742-1",
    floors: 15,
    undergroundFloors: 4,
    mainStructure: "철근콘크리트구조",
    buildingCoverageRatio: 58.2,
    floorAreaRatio: 799.5,
    landArea: 1240.8,
  },
  "11680-10100-0823-0021": {
    exists: true,
    mainPurpose: "업무시설",
    totalFloorArea: 12503.7,
    buildYear: 2019,
    address: "서울특별시 강남구 역삼동 823-21",
    floors: 20,
    undergroundFloors: 5,
    mainStructure: "철근콘크리트구조",
    buildingCoverageRatio: 55.1,
    floorAreaRatio: 850.3,
    landArea: 1470.2,
  },
  "11650-10800-1303-0035": {
    exists: true,
    mainPurpose: "근린생활시설",
    totalFloorArea: 3200.5,
    buildYear: 2010,
    address: "서울특별시 서초구 서초동 1303-35",
    floors: 8,
    undergroundFloors: 2,
    mainStructure: "철근콘크리트구조",
    buildingCoverageRatio: 52.0,
    floorAreaRatio: 450.0,
    landArea: 710.0,
  },
  "11200-11400-0668-0005": {
    exists: true,
    mainPurpose: "지식산업센터",
    totalFloorArea: 28050.0,
    buildYear: 2022,
    address: "서울특별시 성동구 성수동2가 668-5",
    floors: 12,
    undergroundFloors: 3,
    mainStructure: "철골철근콘크리트구조",
    buildingCoverageRatio: 60.0,
    floorAreaRatio: 600.0,
    landArea: 4675.0,
  },
};

/**
 * 국토교통부 건축물대장 서비스 표제부 조회 API 연동
 * @param sigunguCd 시군구코드 (5자리, 예: '11680')
 * @param bjdongCd 법정동코드 (5자리, 예: '10100')
 * @param bun 번 (본번, 예: '742')
 * @param ji 지 (부번, 예: '1')
 */
export async function fetchBuildingRegister(
  sigunguCd: string,
  bjdongCd: string,
  bun: string,
  ji: string,
): Promise<GovtBuildingInfo> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;

  // 본번(bun)과 부번(ji)은 4자리 문자열(앞은 0으로 패딩)
  const paddedBun = bun.padStart(4, "0");
  const paddedJi = ji.padStart(4, "0");

  // API Key가 없거나 테스트인 경우 mock 데이터 반환
  if (!apiKey || process.env.NODE_ENV === "test") {
    console.warn(
      "[govt-api-client] DATA_GO_KR_API_KEY is missing or in test environment. Returning mock data.",
    );

    const mockKey = `${sigunguCd}-${bjdongCd}-${paddedBun}-${paddedJi}`;
    const mockResult = MOCK_BUILDINGS[mockKey];
    return mockResult ?? { exists: false };
  }

  const url = new URL(`${GOVT_API_BASE}/getBrTitleInfo`);
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("sigunguCd", sigunguCd);
  url.searchParams.set("bjdongCd", bjdongCd);
  url.searchParams.set("bun", paddedBun);
  url.searchParams.set("ji", paddedJi);
  url.searchParams.set("_type", "json");
  url.searchParams.set("numOfRows", "1");
  url.searchParams.set("pageNo", "1");

  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: 86400 }, // 24h 캐시
    });

    if (!res.ok) {
      console.error(`[govt-api-client] Govt API HTTP Error: ${res.status}`);
      return { exists: false };
    }

    const data = await res.json();

    // API 응답 구조: response.header.resultCode === "00" → 성공
    const resultCode = data?.response?.header?.resultCode;
    if (resultCode && resultCode !== "00") {
      console.error(
        `[govt-api-client] API Error: ${resultCode} - ${data?.response?.header?.resultMsg}`,
      );
      return { exists: false };
    }

    const items = data?.response?.body?.items?.item;

    if (!items || (Array.isArray(items) && items.length === 0)) {
      return { exists: false };
    }

    const item = Array.isArray(items) ? items[0] : items;
    return {
      exists: true,
      mainPurpose: item.mainPurpsCdNm || undefined,
      totalFloorArea: item.totArea ? Number(item.totArea) : undefined,
      buildYear: item.useAprDay
        ? Number(String(item.useAprDay).substring(0, 4))
        : undefined,
      address: item.platPlc ? String(item.platPlc) : undefined,
      floors: item.grndFlrCnt ? Number(item.grndFlrCnt) : undefined,
      undergroundFloors: item.ugrndFlrCnt ? Number(item.ugrndFlrCnt) : undefined,
      mainStructure: item.strctCdNm || undefined,
      buildingCoverageRatio: item.bcRat ? Number(item.bcRat) : undefined,
      floorAreaRatio: item.vlRat ? Number(item.vlRat) : undefined,
      landArea: item.platArea ? Number(item.platArea) : undefined,
    };
  } catch (error) {
    console.error("[govt-api-client] Failed to fetch building register:", error);
    return { exists: false };
  }
}
