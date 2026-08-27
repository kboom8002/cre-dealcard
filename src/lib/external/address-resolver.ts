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
  lat: number | null;             // W-3.2: nullable — 지오코딩 실패 시 null
  lng: number | null;             // W-3.2: nullable — 지오코딩 실패 시 null
  buildingMgtNo: string;          // 건물관리번호
  _mergedParcelWarning?: boolean; // W-1.2: 합필 의심 플래그
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

/**
 * W-1.2 + W-1.3: 지번주소에서 본번/부번/산 여부를 추출
 * "영등포구 당산동5가 11-47" → { bun: "11", ji: "47", isMount: false }
 * "관악구 남현동 산 1-1"    → { bun: "1",  ji: "1",  isMount: true }
 */
function parseJibunAddress(jibunAddr: string): { bun: string; ji: string; isMount: boolean } | null {
  if (!jibunAddr) return null;
  const isMount = /산\s*\d/.test(jibunAddr);
  const match = jibunAddr.match(/(\d+)(?:-(\d+))?\s*$/);
  if (!match) return null;
  return { bun: match[1], ji: match[2] || '0', isMount };
}

/**
 * W-3.2: 카카오 지오코딩 재시도 (하드코딩 폴백 좌표 제거)
 * 최대 2회 시도, 실패 시 null 반환
 */
async function geocodeWithRetry(address: string): Promise<{ lat: number; lng: number } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const geo = await geocodeAddress(address);
      if (geo) return geo;
    } catch (err) {
      if (attempt === 0) {
        console.warn(`[address-resolver] Geocoding attempt 1 failed, retrying:`, err);
      } else {
        console.warn(`[address-resolver] Geocoding failed after 2 attempts for: ${address}`);
      }
    }
  }
  
  // 폴백: 로컬 좌표 캐시에서 근사치 검색
  const fallback = localFallbackGeocode(address);
  if (fallback) {
    console.warn(`[address-resolver] API 실패, 로컬 폴백 좌표 사용: ${address}`);
    return fallback;
  }
  
  return null;
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

        const pnuFromBdMgtSn = buildingMgtNo.substring(0, 19) || "";
        const legalDongCode = pnuFromBdMgtSn.substring(0, 10);
        const sigunguCd = pnuFromBdMgtSn.substring(0, 5);
        const bjdongCd = pnuFromBdMgtSn.substring(5, 10);

        // W-1.2: 지번주소에서 PNU를 별도 생성하여 합필 의심 감지
        const jibunParsed = parseJibunAddress(jibunAddress);
        let pnuFromJibun: string | null = null;
        if (jibunParsed && legalDongCode.length === 10) {
          // W-1.3: isMount 플래그로 대지구분 자동 분류 (1=일반, 2=산)
          const landCategory = jibunParsed.isMount ? '2' : '1';
          pnuFromJibun = `${legalDongCode}${landCategory}${padNumber(jibunParsed.bun)}${padNumber(jibunParsed.ji)}`;
        }

        // 합필 감지: 두 PNU가 다르면 지번 PNU를 우선 채택
        let pnu = pnuFromBdMgtSn;
        let mergedParcelWarning = false;
        if (pnuFromJibun && pnuFromBdMgtSn && pnuFromJibun !== pnuFromBdMgtSn) {
          console.warn(`[address-resolver] 합필 의심: bdMgtSn PNU=${pnuFromBdMgtSn}, 지번 PNU=${pnuFromJibun}`);
          pnu = pnuFromJibun;
          mergedParcelWarning = true;
        }

        const bun = pnu.substring(11, 15) || "0000";
        const ji = pnu.substring(15, 19) || "0000";

        // W-3.2: 하드코딩 폴백 좌표 제거 — 재시도 후 null 허용
        const geo = await geocodeWithRetry(rawAddress);

        return {
          pnu, legalDongCode, sigunguCd, bjdongCd, bun, ji,
          roadAddress, jibunAddress,
          lat: geo?.lat ?? null,
          lng: geo?.lng ?? null,
          buildingMgtNo,
          _mergedParcelWarning: mergedParcelWarning,
        };
      }
    } catch (err) {
      console.warn("[address-resolver] Juso API error, falling back to regex parser:", err);
    }
  }

  // REGEX FALLBACK
  const cleanAddr = rawAddress.trim();
  // W-1.3: 산지 주소 지원
  const isMount = /산\s*\d/.test(cleanAddr);
  const jibunMatch = cleanAddr.match(/(?:동|로|길)\s+(?:산\s*)?(\d+)(?:-(\d+))?/);

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
  // W-1.3: 산지 대지구분 '2' 적용
  const landCategory = isMount ? '2' : '1';
  const pnu = `${legalDongCode}${landCategory}${bun}${ji}`;

  // W-3.2: 하드코딩 폴백 좌표 제거
  const geo = await geocodeWithRetry(cleanAddr);

  return {
    pnu,
    legalDongCode,
    sigunguCd,
    bjdongCd,
    bun,
    ji,
    roadAddress: cleanAddr,
    jibunAddress: cleanAddr,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    buildingMgtNo: "",
  };
}

/** 주요 상업지구 로컬 좌표 캐시 (행안부 API 장애 시 폴백) */
const MAJOR_COMMERCIAL_COORDS: Record<string, { lat: number; lng: number }> = {
  '강남구': { lat: 37.4979, lng: 127.0276 },
  '서초구': { lat: 37.4837, lng: 127.0324 },
  '중구': { lat: 37.5640, lng: 126.9975 },
  '종로구': { lat: 37.5735, lng: 126.9790 },
  '마포구': { lat: 37.5538, lng: 126.9084 },
  '영등포구': { lat: 37.5264, lng: 126.8965 },
  '송파구': { lat: 37.5145, lng: 127.1059 },
  '광진구': { lat: 37.5384, lng: 127.0823 },
  '용산구': { lat: 37.5326, lng: 126.9909 },
  '동작구': { lat: 37.5124, lng: 126.9393 },
  '강남역': { lat: 37.4981, lng: 127.0280 },
  '역삼역': { lat: 37.5008, lng: 127.0362 },
  '삼성역': { lat: 37.5089, lng: 127.0637 },
  '종로': { lat: 37.5700, lng: 126.9830 },
  '광화문': { lat: 37.5714, lng: 126.9658 },
  '여의도': { lat: 37.5253, lng: 126.9244 },
  '판교': { lat: 37.3945, lng: 127.1119 },
  '분당': { lat: 37.3826, lng: 127.1195 },
  '인천': { lat: 37.4563, lng: 126.7052 },
  '부산': { lat: 35.1796, lng: 129.0756 },
  '대구': { lat: 35.8714, lng: 128.6014 },
  '광주': { lat: 35.1595, lng: 126.8526 },
  '대전': { lat: 36.3504, lng: 127.3845 },
  '제주': { lat: 33.4996, lng: 126.5312 },
  '세종': { lat: 36.4800, lng: 127.2551 },
};

/** 주소 문자열에서 로컬 좌표 폴백 시도 */
export function localFallbackGeocode(address: string): { lat: number; lng: number } | null {
  for (const [key, coords] of Object.entries(MAJOR_COMMERCIAL_COORDS)) {
    if (address.includes(key)) return coords;
  }
  return null;
}
