// src/lib/external/building-register-api.ts
// 국토교통부 건축물대장 API — 연면적, 대지면적, 층수, 구조, 승인일 조회
// API 키 없을 때 결정적 fallback 데이터 반환 (seed 기반)

export interface BuildingRegisterData {
  totalArea: number;          // 연면적 (sqm)
  platArea: number;           // 대지면적 (sqm)
  useAprDay: string;          // 사용승인일 (YYYYMMDD)
  mainPurpose: string;        // 주용도
  structure: string;          // 구조
  floorsAbove: number;        // 지상층수
  floorsBelow: number;        // 지하층수
  bcRat: number;              // 건폐율 (%)
  vlRat: number;              // 용적률 (%)
  buildingName?: string;      // 건물명
  archArea?: number;          // 건축면적 (㎡)
  elevatorCount?: number;     // 승강기 수 (대)
  parkingCount?: number;      // 주차 대수 (대)
  heatMethod?: string;        // 난방 방식
  _isFallback?: boolean;
}

export async function fetchBuildingRegister(
  sigunguCd: string,
  bjdongCd: string,
  bun: string,
  ji: string
): Promise<BuildingRegisterData | null> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;

  if (apiKey && apiKey !== "") {
    try {
      const url = `https://apis.data.go.kr/1613000/BldRgstService_v2/getBrTitleInfo?ServiceKey=${apiKey}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&bun=${bun}&ji=${ji}&numOfRows=1&pageNo=1&_type=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
      const data = await res.json();

      const item = data?.response?.body?.items?.item;
      const targetItem = Array.isArray(item) ? item[0] : item;

      if (targetItem) {
        return {
          totalArea: parseFloat(targetItem.totArea || "0"),
          platArea: parseFloat(targetItem.platArea || "0"),
          useAprDay: String(targetItem.useAprDay || "20150601"),
          mainPurpose: String(targetItem.mainPurpsCdNm || "업무시설"),
          structure: String(targetItem.strctCdNm || "철근콘크리트구조"),
          floorsAbove: parseInt(targetItem.grndFlrCnt || "0", 10),
          floorsBelow: parseInt(targetItem.ugrndFlrCnt || "0", 10),
          bcRat: parseFloat(targetItem.bcRat || "0"),
          vlRat: parseFloat(targetItem.vlRat || "0"),
          buildingName: targetItem.bldNm || "",
        };
      }
    } catch (err) {
      console.warn("[building-register-api] API failed, using deterministic fallback:", err);
    }
  }

  // DETERMINISTIC FALLBACK (seed-based, consistent per address)
  const seed = parseInt(bun + ji, 10) || 1234;
  const isLarge = seed % 2 === 0;

  return {
    totalArea: isLarge ? 4850.5 : 1850.2,
    platArea: isLarge ? 550.8 : 280.5,
    useAprDay: isLarge ? "20180425" : "20121015",
    mainPurpose: isLarge ? "업무시설 (사무소)" : "근린생활시설",
    structure: "철근콘크리트조",
    floorsAbove: isLarge ? 10 : 5,
    floorsBelow: isLarge ? 3 : 1,
    bcRat: isLarge ? 58.4 : 59.8,
    vlRat: isLarge ? 598.2 : 249.5,
    buildingName: isLarge ? "강남 센트럴타워" : "테헤란 팰리스",
    _isFallback: true,
  };
}

export interface BuildingRecapData {
  archArea: number;           // 건축면적 (㎡)
  rideUseElvtCnt: number;     // 승용 승강기 수
  emgenUseElvtCnt: number;    // 비상용 승강기 수
  indrAutoUtcnt: number;      // 옥내 기계식 주차 대수
  oudrAutoUtcnt: number;      // 옥외 주차 대수
  indrMechUtcnt: number;      // 옥내 자주식 주차 대수
  heatMethodNm: string;       // 난방 방식
  _isFallback?: boolean;
}

export async function fetchBuildingRecap(
  sigunguCd: string,
  bjdongCd: string,
  bun: string,
  ji: string
): Promise<BuildingRecapData | null> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;

  if (apiKey && apiKey !== "") {
    try {
      const url = `https://apis.data.go.kr/1613000/BldRgstService_v2/getBrRecapTitleInfo?ServiceKey=${apiKey}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&bun=${bun}&ji=${ji}&numOfRows=1&pageNo=1&_type=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
      const data = await res.json();

      const item = data?.response?.body?.items?.item;
      const row = Array.isArray(item) ? item[0] : item;

      if (row) {
        return {
          archArea: parseFloat(row.archArea || "0"),
          rideUseElvtCnt: parseInt(row.rideUseElvtCnt || "0", 10),
          emgenUseElvtCnt: parseInt(row.emgenUseElvtCnt || "0", 10),
          indrAutoUtcnt: parseInt(row.indrAutoUtcnt || "0", 10),
          oudrAutoUtcnt: parseInt(row.oudrAutoUtcnt || "0", 10),
          indrMechUtcnt: parseInt(row.indrMechUtcnt || "0", 10),
          heatMethodNm: String(row.heatMthdCdNm || ""),
        };
      }
    } catch (err) {
      console.warn("[building-register-api] Recap API failed:", err);
    }
  }

  // DETERMINISTIC FALLBACK
  const seed = parseInt(bun + ji, 10) || 1234;
  const isLarge = seed % 2 === 0;

  return {
    archArea: isLarge ? 283.5 : 167.8,
    rideUseElvtCnt: isLarge ? 2 : 1,
    emgenUseElvtCnt: isLarge ? 1 : 0,
    indrAutoUtcnt: 0,
    oudrAutoUtcnt: isLarge ? 10 : 4,
    indrMechUtcnt: isLarge ? 20 : 6,
    heatMethodNm: "개별난방",
    _isFallback: true,
  };
}
