// src/lib/external/address-resolver.ts
// Ported from cre-fullim — resolves Korean address strings into PNU codes,
// coordinates, and building management numbers for downstream public API calls.

import { FALLBACK_DONG_MAP, geocodeAddress } from "@/domain/verification/address-resolver";

export interface ResolvedAddress {
  pnu: string;                    // 19자리 필지고유번호
  legalDongCode: string;          // 법정동 10자리
  sigunguCd: string;              // 시군구 5자리 (건축물대장 API 파라미터)
  bjdongCd: string;               // 법정동 5자리
  bun: string;                    // 본번 4자리
  ji: string;                     // 부번 4자리
  roadAddress: string;            // 정규화된 도로명주소
  jibunAddress: string;           // 지번주소
  lat: number;
  lng: number;
  buildingMgtNo: string;          // 건물관리번호
}

function padNumber(numStr: string | number): string {
  const num = parseInt(String(numStr), 10);
  if (isNaN(num)) return "0000";
  return String(num).padStart(4, "0");
}

function getMockLegalDongCode(address: string): string {
  for (const [key, codes] of Object.entries(FALLBACK_DONG_MAP)) {
    if (address.includes(key)) return codes.sigunguCd + codes.bjdongCd;
  }
  return "1168010100"; // 기본 역삼동
}

export async function resolveAddress(rawAddress: string): Promise<ResolvedAddress | null> {
  const confirmKey = process.env.JUSO_CONFIRM_KEY;

  if (confirmKey && confirmKey !== "") {
    try {
      const url = `https://business.juso.go.kr/addrlink/addrLinkApi.do?confmKey=${confirmKey}&currentPage=1&countPerPage=1&keyword=${encodeURIComponent(rawAddress)}&resultType=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();

      const jList = data?.results?.juso;
      if (jList && jList.length > 0) {
        const item = jList[0];
        const roadAddress = item.roadAddr;
        const jibunAddress = item.jibunAddr;
        const buildingMgtNo = item.bdMgtSn || "";

        const pnu = buildingMgtNo.substring(0, 19) || "1168010100108320000";
        const legalDongCode = pnu.substring(0, 10);
        const sigunguCd = pnu.substring(0, 5);
        const bjdongCd = pnu.substring(5, 10);
        const bun = pnu.substring(11, 15) || "0000";
        const ji = pnu.substring(15, 19) || "0000";

        let lat = 37.50085;
        let lng = 127.03698;
        try {
          const geo = await geocodeAddress(rawAddress);
          if (geo) { lat = geo.lat; lng = geo.lng; }
          else applyFallbackCoords();
        } catch { applyFallbackCoords(); }

        function applyFallbackCoords() {
          if (rawAddress.includes("삼성")) { lat = 37.5088; lng = 127.0631; }
          else if (rawAddress.includes("서초")) { lat = 37.4876; lng = 127.0174; }
          else if (rawAddress.includes("성수")) { lat = 37.5447; lng = 127.0562; }
          else if (rawAddress.includes("마포") || rawAddress.includes("합정")) { lat = 37.5500; lng = 126.9099; }
        }

        return { pnu, legalDongCode, sigunguCd, bjdongCd, bun, ji, roadAddress, jibunAddress, lat, lng, buildingMgtNo };
      }
    } catch (err) {
      console.warn("[address-resolver] Juso API error, falling back to regex parser:", err);
    }
  }

  // REGEX FALLBACK
  const cleanAddr = rawAddress.trim();
  const jibunMatch = cleanAddr.match(/(?:동|로|길)\s+(\d+)(?:-(\d+))?/);

  let bun: string = "";
  let ji: string = "0000";
  if (jibunMatch) {
    bun = padNumber(jibunMatch[1]);
    ji = padNumber(jibunMatch[2] || "0");
  }

  if (!bun) {
    console.warn("[address-resolver] No jibun found in:", cleanAddr);
    return null;
  }

  const legalDongCode = getMockLegalDongCode(cleanAddr);
  const sigunguCd = legalDongCode.substring(0, 5);
  const bjdongCd = legalDongCode.substring(5, 10);
  const pnu = `${legalDongCode}1${bun}${ji}`;

  let lat = 37.50085;
  let lng = 127.03698;
  try {
    const geo = await geocodeAddress(cleanAddr);
    if (geo) { lat = geo.lat; lng = geo.lng; }
    else applyFallbackCoords2();
  } catch { applyFallbackCoords2(); }

  function applyFallbackCoords2() {
    if (cleanAddr.includes("삼성")) { lat = 37.5088; lng = 127.0631; }
    else if (cleanAddr.includes("서초")) { lat = 37.4876; lng = 127.0174; }
    else if (cleanAddr.includes("성수")) { lat = 37.5447; lng = 127.0562; }
    else if (cleanAddr.includes("마포") || cleanAddr.includes("합정")) { lat = 37.5500; lng = 126.9099; }
  }

  return {
    pnu,
    legalDongCode,
    sigunguCd,
    bjdongCd,
    bun,
    ji,
    roadAddress: cleanAddr,
    jibunAddress: cleanAddr,
    lat,
    lng,
    buildingMgtNo: pnu + "000000",
  };
}
