// src/lib/external/address-resolver.ts
// Ported from cre-fullim — resolves Korean address strings into PNU codes,
// coordinates, and building management numbers for downstream public API calls.

import {
  geocodeAddress,
  isEligibleForSeoulFallback,
  isMountainLotAddress,
  lookupSeoulFallbackDong,
} from "@/domain/verification/address-resolver";
import { splitMultiParcelAddressPure } from "@/lib/address/multi-parcel-format";
import { createModuleLogger } from "@/lib/logger";

export { isEligibleForSeoulFallback } from "@/domain/verification/address-resolver";

const logger = createModuleLogger("address-resolver");

export interface ResolvedAddress {
  pnu: string;                    // 19자리 필지고유번호
  legalDongCode: string;          // 법정동 10자리
  sigunguCd: string;              // 시군구 5자리 (건축물대장 API 파라미터)
  bjdongCd: string;               // 법정동 5자리
  platGbCd?: '0' | '1';           // 대지구분코드 ('0': 대지, '1': 산)
  bun: string;                    // 본번 4자리
  ji: string;                     // 부번 4자리
  roadAddress: string;            // 정규화된 도로명주소
  jibunAddress: string;           // 지번주소
  lat: number | null;             // W-3.2: nullable — 지오코딩 실패 시 null
  lng: number | null;             // W-3.2: nullable — 지오코딩 실패 시 null
  buildingMgtNo: string;          // 건물관리번호
  _mergedParcelWarning?: boolean; // W-1.2: 합필 의심 플래그
  allPnus?: string[];             // Multi-PNU support
}

export function padNumber(numStr: string | number): string {
  const num = parseInt(String(numStr), 10);
  if (isNaN(num)) return "0000";
  return String(num).padStart(4, "0");
}

function getMockLegalDongCode(address: string, dongHint?: string): string {
  if (!isEligibleForSeoulFallback(address)) {
    return ''; // 비서울 주소는 서울 FALLBACK_DONG_MAP 매칭 원천 차단
  }
  const found = lookupSeoulFallbackDong(address, dongHint);
  return found ? found.sigunguCd + found.bjdongCd : '';
}

/**
 * W-1.2 + W-1.3: 지번주소에서 본번/부번/산 여부/대지구분코드(platGbCd)를 추출
 * "영등포구 당산동5가 11-47" → { bun: "11", ji: "47", isMount: false, platGbCd: "0" }
 * "관악구 남현동 산 1-1"    → { bun: "1",  ji: "1",  isMount: true,  platGbCd: "1" }
 * "서울 종로구 평창동 산12"  → { bun: "12", ji: "0",  isMount: true,  platGbCd: "1" }
 */
export function parseJibunAddress(
  jibunAddr: string
): { bun: string; ji: string; isMount: boolean; platGbCd: '0' | '1' } | null {
  if (!jibunAddr) return null;
  const isMount = isMountainLotAddress(jibunAddr);
  // Match parcel number after dong/ri/ro/gil/san or take the trailing number block
  const matchMount = jibunAddr.match(/(?:^|[\s,(])산\s*(\d+)(?:-(\d+))?(?:번지)?(?:\s|$|,|\))/);
  const matchWithPrefix = jibunAddr.match(/(?:동\d*가?|로\d*가?|길|리|읍|면)\s+(?:산\s*)?(\d+)(?:-(\d+))?/);
  const match =
    matchMount ||
    matchWithPrefix ||
    jibunAddr.match(/(?:^|\s)(?:산\s*)?(\d+)(?:-(\d+))?$/) ||
    jibunAddr.match(/(\d+)(?:-(\d+))?/);
  if (!match) return null;
  const mountFlag = Boolean(matchMount) || isMount;
  return {
    bun: match[1],
    ji: match[2] || '0',
    isMount: mountFlag,
    platGbCd: mountFlag ? '1' : '0',
  };
}

/**
 * 쉼표 또는 공백으로 구분된 문자열에서 유효한 19자리 PNU 배열을 안전하게 추출
 */
export function extract19DigitPnus(pnuInput?: string | string[]): string[] {
  if (!pnuInput) return [];
  const rawList = Array.isArray(pnuInput) ? pnuInput : pnuInput.split(/[\s,]+/);
  return rawList
    .map(p => p.trim().replace(/[^0-9]/g, ''))
    .filter(p => p.length === 19);
}

/**
 * 다필지 주소 문자열("서울 영등포구 양평동4가 117, 134, 125-2", "양평동4가 117 외 2필지", "잠원동 26-14외1")에서
 * 대표 지번 주소(primaryAddress), 부속 지번 목록(secondaryLots), 다필지 힌트 여부(hasExplicitMultiLotHint)를 분리합니다.
 */
export function splitMultiParcelAddress(rawAddress: string): {
  primaryAddress: string;
  secondaryLots: Array<{ bun: string; ji: string; isMount: boolean }>;
  hasExplicitMultiLotHint: boolean;
} {
  const parsed = splitMultiParcelAddressPure(rawAddress);
  return {
    primaryAddress: parsed.primaryAddress,
    secondaryLots: parsed.secondaryLots.map(({ bun, ji, isMount }) => ({
      bun,
      ji,
      isMount,
    })),
    hasExplicitMultiLotHint: parsed.hasExplicitMultiLotHint,
  };
}

function buildMultiParcelPnus(
  primaryPnu: string,
  legalDongCode: string,
  secondaryLots: Array<{ bun: string; ji: string; isMount: boolean }>,
): string[] {
  const result: string[] = [];
  if (primaryPnu && primaryPnu.length === 19) {
    result.push(primaryPnu);
  }
  if (legalDongCode && legalDongCode.length === 10) {
    for (const lot of secondaryLots) {
      const landCat = lot.isMount ? '2' : '1';
      const secPnu = `${legalDongCode}${landCat}${padNumber(lot.bun)}${padNumber(lot.ji)}`;
      if (secPnu.length === 19 && !result.includes(secPnu)) {
        result.push(secPnu);
      }
    }
  }
  return result;
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
        logger.warn("Geocoding attempt 1 failed, retrying", { err });
      } else {
        logger.warn(`Geocoding failed after 2 attempts for: ${address}`);
      }
    }
  }
  
  return null;
}

export async function resolveAddress(rawAddress: string): Promise<ResolvedAddress | null> {
  const confirmKey = process.env.JUSO_CONFIRM_KEY;
  const { primaryAddress: cleanAddr, secondaryLots } = splitMultiParcelAddress(rawAddress);
  if (!cleanAddr) return null;

  if (confirmKey && confirmKey !== "") {
    try {
      const url = `https://business.juso.go.kr/addrlink/addrLinkApi.do?confmKey=${confirmKey}&currentPage=1&countPerPage=1&keyword=${encodeURIComponent(cleanAddr)}&resultType=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error('JUSO API error: ' + res.status);
      const data = await res.json();

      const jList = data?.results?.juso;
      if (jList && jList.length > 0) {
        const item = jList[0];
        const roadAddress = item.roadAddr;
        const jibunAddress = item.jibunAddr;
        const buildingMgtNo = item.bdMgtSn || "";

        let pnuFromBdMgtSn = buildingMgtNo.substring(0, 19) || "";
        const admCdStr = String(item.admCd || "").trim();
        if (!pnuFromBdMgtSn && admCdStr.length === 10) {
          // 나대지: admCd 기반 PNU 직접 구성
          const mtYn = item.mtYn === '1' ? '2' : '1';
          const admPnu = admCdStr + mtYn + String(item.lnbrMnnm || '0').padStart(4, '0') + String(item.lnbrSlno || '0').padStart(4, '0');
          pnuFromBdMgtSn = admPnu;
        } else if (pnuFromBdMgtSn.length === 19 && admCdStr.length === 10 && pnuFromBdMgtSn.substring(0, 10) !== admCdStr) {
          // 행정구역 코드 개편(예: 부천시 원미구 구코드 41195 → 현행 41192) 시 현행 법정동코드(admCd) 우선 적용
          pnuFromBdMgtSn = admCdStr + pnuFromBdMgtSn.substring(10);
        }
        
        const legalDongCode = admCdStr.length === 10 ? admCdStr : pnuFromBdMgtSn.substring(0, 10);
        const sigunguCd = legalDongCode.substring(0, 5);
        const bjdongCd = legalDongCode.substring(5, 10);

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
          logger.warn(`합필 의심: bdMgtSn PNU=${pnuFromBdMgtSn}, 지번 PNU=${pnuFromJibun}`);
          pnu = pnuFromJibun;
          mergedParcelWarning = true;
        }

        const bun = pnu.substring(11, 15) || "0000";
        const ji = pnu.substring(15, 19) || "0000";
        const platGbCd: '0' | '1' = pnu.charAt(10) === '2' ? '1' : '0';

        // W-3.2: 하드코딩 폴백 좌표 제거 — 재시도 후 null 허용
        const geo = await geocodeWithRetry(cleanAddr);
        const allPnus = buildMultiParcelPnus(pnu, legalDongCode, secondaryLots);

        return {
          pnu, legalDongCode, sigunguCd, bjdongCd, platGbCd, bun, ji,
          roadAddress, jibunAddress,
          lat: geo?.lat ?? null,
          lng: geo?.lng ?? null,
          buildingMgtNo,
          _mergedParcelWarning: mergedParcelWarning,
          ...(allPnus.length > 0 ? { allPnus } : {}),
        };
      }
    } catch (err) {
      logger.warn("Juso API error, falling back to regex parser", { err });
    }
  }

  // REGEX FALLBACK (서울 FALLBACK_DONG_MAP 한정 — 비서울 오매칭 원천 차단)
  if (!isEligibleForSeoulFallback(cleanAddr)) {
    logger.warn(`Non-Seoul address rejected from Seoul FALLBACK_DONG_MAP: ${cleanAddr}`);
    return null;
  }

  // W-1.3: 산지 주소 지원 ('산 12-3', '산12' → platGbCd='1', PNU 11번째 자리 '2')
  const parsedJibun = parseJibunAddress(cleanAddr);
  if (!parsedJibun) {
    logger.warn(`No jibun found in: ${cleanAddr}`);
    return null;
  }

  const dongHintMatch = cleanAddr.match(/([가-힣0-9]+)\s+(?:산\s*)?\d+/);
  const dongHint = dongHintMatch ? dongHintMatch[1] : undefined;
  const legalDongCode = getMockLegalDongCode(cleanAddr, dongHint);
  if (legalDongCode.length !== 10) {
    logger.warn(`Could not resolve 10-digit Seoul legalDongCode for: ${cleanAddr}`);
    return null;
  }

  const sigunguCd = legalDongCode.substring(0, 5);
  const bjdongCd = legalDongCode.substring(5, 10);
  const bun = padNumber(parsedJibun.bun);
  const ji = padNumber(parsedJibun.ji);
  const platGbCd: '0' | '1' = parsedJibun.platGbCd;
  const landCategory = parsedJibun.isMount ? '2' : '1';
  const pnu = `${legalDongCode}${landCategory}${bun}${ji}`;
  const allPnus = buildMultiParcelPnus(pnu, legalDongCode, secondaryLots);

  // W-3.2: 하드코딩 폴백 좌표 제거
  const geo = await geocodeWithRetry(cleanAddr);

  return {
    pnu,
    legalDongCode,
    sigunguCd,
    bjdongCd,
    platGbCd,
    bun,
    ji,
    roadAddress: cleanAddr,
    jibunAddress: cleanAddr,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    buildingMgtNo: "",
    ...(allPnus.length > 0 ? { allPnus } : {}),
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
