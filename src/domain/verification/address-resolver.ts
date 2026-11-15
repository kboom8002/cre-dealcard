/**
 * 도로명주소 API 클라이언트 (행정안전부 juso.go.kr)
 *
 * 자유형식 주소 입력 → 정규화된 도로명주소 + 지번주소 + 법정동코드 + 시군구코드 반환
 * API 문서: https://business.juso.go.kr/addrlink/openApi/searchApi.do
 */

import { getVWorldApiKey, getVWorldReferer, getVWorldDomain } from "@/lib/external/vworld-config";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('address-resolver');


// ── 타입 정의 ────────────────────────────────────────────────────────────

export interface ResolvedAddress {
  /** 도로명주소 (예: "서울특별시 강남구 테헤란로 152") */
  roadAddr: string;
  /** 지번주소 (예: "서울특별시 강남구 역삼동 742-1") */
  jibunAddr: string;
  /** 시도명 */
  siNm: string;
  /** 시군구명 */
  sggNm: string;
  /** 읍면동명 */
  emdNm: string;
  /** 행정동코드 (10자리, 예: "1168010100") */
  admCd: string;
  /** 도로명관리번호 */
  rnMgtSn: string;
  /** 건물관리번호 */
  bdMgtSn: string;
  /** 우편번호 */
  zipNo: string;
  /** 19자리 표준 PNU */
  pnu?: string;
  /** 건물명 */
  bdNm?: string;
}

export interface AddressComponents {
  sigunguCd: string;
  bjdongCd: string;
  bun: string;
  ji: string;
  platGbCd?: '0' | '1';
  isMount?: boolean;
  pnu?: string;
}

export type ResolveKind = 'exact' | 'ambiguous' | 'partial' | 'failed';

export interface ResolveResult {
  kind: ResolveKind;
  primary: AddressComponents | null;
  alternatives: AddressComponents[];
  message?: string;
}

/** 
 * Represents a reference to a parcel of land.
 */
export interface ParcelRef {
  sigunguCd: string;
  bjdongCd: string;
  bun: string;
  ji: string;
}

// ── 하드코딩 폴백 매핑 (API 미연결 시 데모용) ────────────────────────────

export const FALLBACK_DONG_MAP: Record<string, { sigunguCd: string; bjdongCd: string }> = {
  "역삼":     { sigunguCd: "11680", bjdongCd: "10100" },
  "삼성":     { sigunguCd: "11680", bjdongCd: "10200" },
  "대치":     { sigunguCd: "11680", bjdongCd: "10300" },
  "청담":     { sigunguCd: "11680", bjdongCd: "10400" },
  " 신사":    { sigunguCd: "11680", bjdongCd: "10700" },
  "신사":     { sigunguCd: "11680", bjdongCd: "10700" },
  "논현":     { sigunguCd: "11680", bjdongCd: "10800" },
  "서초":     { sigunguCd: "11650", bjdongCd: "10800" },
  "반포":     { sigunguCd: "11650", bjdongCd: "10500" },
  "잠원":     { sigunguCd: "11650", bjdongCd: "10200" },
  "당산동5가": { sigunguCd: "11560", bjdongCd: "11500" },
  "당산":     { sigunguCd: "11560", bjdongCd: "11500" },
  "양평동4가": { sigunguCd: "11560", bjdongCd: "12800" },
  "양평":     { sigunguCd: "11560", bjdongCd: "12800" },
  "여의도":   { sigunguCd: "11560", bjdongCd: "11000" },
  "성수":     { sigunguCd: "11200", bjdongCd: "11400" },
  "충무로":   { sigunguCd: "11140", bjdongCd: "10700" },
  "평창동":   { sigunguCd: "11110", bjdongCd: "18300" },
  "평창":     { sigunguCd: "11110", bjdongCd: "18300" },
  "종로":     { sigunguCd: "11110", bjdongCd: "11500" },
  "용산":     { sigunguCd: "11170", bjdongCd: "10100" },
  "마포":     { sigunguCd: "11440", bjdongCd: "10100" },
  "서교동":   { sigunguCd: "11440", bjdongCd: "12000" },
  "동교동":   { sigunguCd: "11440", bjdongCd: "12100" },
  "합정동":   { sigunguCd: "11440", bjdongCd: "12200" },
  "망원동":   { sigunguCd: "11440", bjdongCd: "12300" },
  "연남동":   { sigunguCd: "11440", bjdongCd: "12400" },
  "상수동":   { sigunguCd: "11440", bjdongCd: "11500" },
  "송파":     { sigunguCd: "11710", bjdongCd: "10100" },
  "을지로":   { sigunguCd: "11140", bjdongCd: "10100" },
  "광화문":   { sigunguCd: "11110", bjdongCd: "14000" },
  "테헤란":   { sigunguCd: "11680", bjdongCd: "10100" },
};

const SEOUL_AUTONOMOUS_DISTRICTS = new Set([
  "강남구", "강동구", "강북구", "강서구", "관악구",
  "광진구", "구로구", "금천구", "노원구", "도봉구",
  "동대문구", "동작구", "마포구", "서대문구", "서초구",
  "성동구", "성북구", "송파구", "양천구", "영등포구",
  "용산구", "은평구", "종로구", "중구", "중랑구",
]);

const NON_SEOUL_REGION_PREFIX_RE =
  /^(?:부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|충청|전북|전남|전라|경북|경남|경상|제주|성남|수원|용인|고양|화성|부천|안양|안산|남양주|평택|의정부|파주|시흥|김포|광명|하남|군포|오산|이천|구리|안성|포천|의왕|양주|여주|과천|창원|천안|청주|전주|포항|김해|구미|진주|원주|춘천|강릉|목포|여수|순천|익산|군산|경주|양산|거제|아산)(?:특별시|광역시|특별자치시|특별자치도|도|시|군)?(?:\s|$)/;

/**
 * FALLBACK_DONG_MAP(서울 전용 정적 법정동 코드표) 적용 허용 여부 검증.
 * - 명시적 '서울' / '서울시' / '서울특별시' 접두어가 있으면 허용
 * - 비서울 광역시/도/시/군 또는 비서울 자치구(예: 분당구, 서구, 해운대구)가 포함되면 즉시 차단
 */
export function isEligibleForSeoulFallback(address: string | null | undefined): boolean {
  if (!address) return false;
  const trimmed = address.trim();
  if (!trimmed) return false;

  if (/^서울(?:특별시|시)?(?:\s|$)/.test(trimmed)) {
    return true;
  }

  if (NON_SEOUL_REGION_PREFIX_RE.test(trimmed)) {
    return false;
  }

  // 비서울 도/광역시/시/군 토큰 존재 시 차단 ("경기도 ...", "성남시 ...", "양평군 ...")
  const tokens = trimmed.split(/\s+/);
  for (const token of tokens) {
    if (/^(?!서울)[가-힣]+(?:광역시|특별자치시|특별자치도|도|시|군)$/.test(token)) {
      return false;
    }
    if (/^[가-힣]+구$/.test(token) && !SEOUL_AUTONOMOUS_DISTRICTS.has(token)) {
      return false;
    }
  }

  return true;
}

/**
 * 지번 문자열 내 임야(산지) 지번 여부 판정 ("산 12-3", "산12" → true, "독산1동 100" → false)
 */
export function isMountainLotAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  return /(?:^|[\s,(])산\s*\d+(?:-\d+)?(?:\s*번지)?(?:\s|$|,|\))/.test(address.trim());
}

// ── API 호출 ─────────────────────────────────────────────────────────────

const JUSO_API_URL = "https://business.juso.go.kr/addrlink/addrLinkApi.do";

/**
 * 다중 백엔드 주소 및 PNU 검색 (카카오 로컬 API → VWorld 2.0 API → 행안부 도로명주소 API)
 *
 * 1. 카카오 로컬 검색: 도로명, 지번, 건물명, 행정동/법정동 코드 및 산/번/지 기반 19자리 PNU 자동 합성
 * 2. VWorld 2.0 검색: 국토부 공식 19자리 PNU 및 건물명 직접 반환
 * 3. 행안부 Juso API: 표준 도로명주소 백업
 */
export async function searchAddress(
  keyword: string,
  countPerPage = 5,
): Promise<ResolvedAddress[]> {
  const trimmed = keyword.trim();
  if (!trimmed || trimmed.length < 2) return [];

  if (process.env.NODE_ENV === "test") {
    return [];
  }

  // Tier 1: 카카오 로컬 주소 검색 API (19자리 PNU 직접 합성 및 건물명 제공)
  const kakaoKey = process.env.KAKAO_REST_API_KEY || process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
  if (kakaoKey) {
    try {
      const res = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?size=${countPerPage}&query=${encodeURIComponent(trimmed)}`, {
        headers: { Authorization: `KakaoAK ${kakaoKey}` },
        signal: AbortSignal.timeout(5000),
        next: { revalidate: 86400 },
      });
      if (res.ok) {
        const data = await res.json();
        const docs = data?.documents || [];
        if (Array.isArray(docs) && docs.length > 0) {
          return docs.map((doc: any) => {
            const jibun = doc.address || {};
            const road = doc.road_address || {};
            let pnu = '';
            if (jibun.b_code && jibun.main_address_no) {
              const isSan = jibun.mountain_yn === 'Y' ? '2' : '1';
              const bun = String(jibun.main_address_no).padStart(4, '0');
              const ji = String(jibun.sub_address_no || '0').padStart(4, '0');
              pnu = jibun.b_code + isSan + bun + ji;
            }
            return {
              roadAddr: road.address_name || '',
              jibunAddr: jibun.address_name || doc.address_name || '',
              siNm: jibun.region_1depth_name || '',
              sggNm: jibun.region_2depth_name || '',
              emdNm: jibun.region_3depth_name || '',
              admCd: jibun.b_code || jibun.h_code || '',
              rnMgtSn: '',
              bdMgtSn: pnu,
              zipNo: road.zone_no || '',
              pnu,
              bdNm: road.building_name || '',
            };
          });
        }
      }
    } catch (err) {
      log.warn("[address-resolver] Kakao address search failed, trying fallback:", err);
    }
  }

  // Tier 2: 국토부 VWorld 2.0 검색 API (공식 19자리 PNU 직접 획득)
  const vworldKey = getVWorldApiKey();
  if (vworldKey) {
    try {
      const vworldUrl = `https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=${countPerPage}&page=1&query=${encodeURIComponent(trimmed)}&type=address&category=parcel&format=json&errorformat=json&key=${vworldKey}&domain=${encodeURIComponent(getVWorldDomain())}`;
      const res = await fetch(vworldUrl, {
        headers: { Referer: getVWorldReferer() },
        signal: AbortSignal.timeout(5000),
        next: { revalidate: 86400 },
      });
      if (res.ok) {
        const json = await res.json();
        const items = json?.response?.result?.items;
        if (Array.isArray(items) && items.length > 0) {
          return items.map((item: any) => {
            const pnu = item.id || '';
            return {
              roadAddr: item.address?.road || '',
              jibunAddr: item.address?.parcel || '',
              siNm: '',
              sggNm: '',
              emdNm: '',
              admCd: pnu.length >= 10 ? pnu.substring(0, 10) : '',
              rnMgtSn: '',
              bdMgtSn: pnu,
              zipNo: item.address?.zipcode || '',
              pnu,
              bdNm: item.address?.bldnm || '',
            };
          });
        }
      }
    } catch (err) {
      log.warn("[address-resolver] VWorld address search failed, trying fallback:", err);
    }
  }

  // Tier 3: 행안부 Juso API (레거시 백업)
  const confmKey = process.env.JUSO_CONFIRM_KEY;
  if (confmKey) {
    const params = new URLSearchParams({
      confmKey,
      currentPage: "1",
      countPerPage: String(countPerPage),
      keyword: trimmed,
      resultType: "json",
    });
    try {
      const res = await fetch(`${JUSO_API_URL}?${params}`, {
        signal: AbortSignal.timeout(5000),
        next: { revalidate: 86400 },
      });
      if (res.ok) {
        const json = await res.json();
        const results = json?.results;
        const jusoList = results?.juso;
        if (results?.common?.errorCode === "0" && Array.isArray(jusoList) && jusoList.length > 0) {
          return jusoList.map((j: Record<string, string>) => ({
            roadAddr: j.roadAddr ?? "",
            jibunAddr: j.jibunAddr ?? "",
            siNm: j.siNm ?? "",
            sggNm: j.sggNm ?? "",
            emdNm: j.emdNm ?? "",
            admCd: j.admCd ?? "",
            rnMgtSn: j.rnMgtSn ?? "",
            bdMgtSn: j.bdMgtSn ?? "",
            zipNo: j.zipNo ?? "",
            pnu: j.bdMgtSn ? j.bdMgtSn.slice(0, 19) : undefined,
            bdNm: j.bdNm ?? "",
          }));
        }
      }
    } catch (error) {
      log.error("[address-resolver] Juso API search failed:", error);
    }
  }

  return [];
}

/**
 * 메모 텍스트 또는 비정형 문자열에서 한국 주소를 정확하게 추출합니다.
 * '매매가', '보증금', '월세', '대지', '연면적' 등의 비주소 단어가 도로명/지번으로 오인식되지 않도록 방지합니다.
 */
export function extractCleanKoreanAddress(rawText: string | null | undefined): string | null {
  if (!rawText) return null;
  const text = rawText.trim();

  // 비주소 키워드 (오인식 방지용)
  const nonAddressWords = [
    '매매가', '매각가', '매매', '매각', '보증금', '월세', '임대료', '임대',
    '관리비', '수익률', '대지', '연면적', '건물', '근생', '빌딩', '상가',
    '호가', '가격', '대출', '융자', '수익형', '직영', '공실', '평형', '지상', '지하'
  ];

  const containsNonAddressWord = (segment: string) => {
    return nonAddressWords.some(word => segment.includes(word));
  };

  // 1. 시/도 + 시/군/구 + 읍/면/동/로/길 + 번지(선택)
  // 예: "서울특별시 마포구 서교동 354-22", "서울시 마포구 서교동", "서울특별시 마포구 양화로 45"
  const sidoPattern = /(?:서울(?:특별시|시)?|부산(?:광역시|시)?|대구(?:광역시|시)?|인천(?:광역시|시)?|광주(?:광역시|시)?|대전(?:광역시|시)?|울산(?:광역시|시)?|세종(?:특별자치시|시)?|경기(?:도)?|강원(?:특별자치도|도)?|충청[북남]도|충[북남](?:도)?|전라[북남]도|전[북남](?:도)?|경상[북남]도|경[북남](?:도)?|제주(?:특별자치도|도)?)/;
  
  const fullRegex = new RegExp(
    `(${sidoPattern.source}\\s+[가-힣0-9]+(?:시|군|구)\\s+[가-힣0-9]+(?:읍|면|동|가|로|길)(?:\\s+\\d+(?:-\\d+)?(?:번지)?)?)`,
    'g'
  );

  const fullMatches = [...text.matchAll(fullRegex)];
  for (const m of fullMatches) {
    const candidate = m[1].trim();
    if (!containsNonAddressWord(candidate)) {
      return candidate;
    }
  }

  // 2. 시/군/구 + 읍/면/동/로/길 + [번지] (시/도 생략형)
  // 예: "마포구 서교동 354-22", "마포구 서교동", "강남구 역삼동"
  const sigunguRegex = /([가-힣]+(?:구|군|시)\s+[가-힣0-9]+(?:읍|면|동|가|로|길)(?:\s+\d+(?:-\\d+)?(?:번지)?)?)/g;
  const sigunguMatches = [...text.matchAll(sigunguRegex)];
  for (const m of sigunguMatches) {
    const candidate = m[1].trim();
    if (!containsNonAddressWord(candidate)) {
      return candidate;
    }
  }

  // 3. 읍/면/동 + 번지 (예: "서교동 354-22" or "서교동")
  const dongRegex = /([가-힣0-9]{2,}(?:동[0-9]*가?|읍|면|로[0-9]*가?|길)(?:\s+\d+(?:-\\d+)?(?:번지)?)?)/g;
  const dongMatches = [...text.matchAll(dongRegex)];
  for (const m of dongMatches) {
    const candidate = m[0].trim();
    if (!containsNonAddressWord(candidate) && !candidate.includes('매매') && !candidate.includes('임대')) {
      return candidate;
    }
  }

  return null;
}

/**
 * 주소 문자열이 실제 상세 지번/건물번호를 포함하는지 확인합니다.
 * "당산동5가", "역삼동" 같은 행정구역명/권역명만 있는 경우는 false를 반환합니다.
 */
export function hasValidBuildingNumber(addr: string | null | undefined): boolean {
  if (!addr) return false;
  // 행정동 구분 숫자(예: 당산동5가, 종로3가, 한강로2가)를 건물번호로 오인하지 않도록 방지
  // 1. "동/로/길/가/리/면/읍" 뒤에 반드시 공백과 함께 지번/건물번호 숫자(임야 '산' 포함)가 올 것
  // 2. 또는 주소 끝부분에 공백과 함께 숫자(임야 '산' 포함)가 올 것
  return /(?:동|로|길|가|리|면|읍)\s+(?:산\s*)?\d+(?:-\d+)?(?:번지)?(?:\s|$)/.test(addr) ||
         /\s+(?:산\s*)?\d+(?:-\d+)?(?:번지)?$/.test(addr);
}

function buildAddressComponents(
  sigunguCd: string,
  bjdongCd: string,
  bun: string,
  ji: string,
  isMount: boolean
): AddressComponents {
  const platGbCd: '0' | '1' = isMount ? '1' : '0';
  const landDigit = isMount ? '2' : '1';
  const pnu =
    sigunguCd.length === 5 && bjdongCd.length === 5
      ? `${sigunguCd}${bjdongCd}${landDigit}${String(bun).padStart(4, '0')}${String(ji).padStart(4, '0')}`
      : undefined;
  return {
    sigunguCd,
    bjdongCd,
    bun,
    ji,
    platGbCd,
    isMount,
    ...(pnu ? { pnu } : {}),
  };
}

/**
 * 주소 문자열에서 건축물대장 조회에 필요한 시군구코드/법정동코드/번/지를 추출합니다.
 *
 * 1순위: 도로명주소 API로 정확한 행정코드 획득
 * 2순위: API 실패 시 하드코딩 폴백 매핑으로 최선의 추정 (서울 한정)
 */
export async function resolveAddressToComponents(
  address: string,
): Promise<AddressComponents | null> {
  if (!address) return null;

  // 1순위: 도로명주소 API로 행정코드 획득
  const apiResults = await searchAddress(address, 1);
  if (apiResults.length > 0) {
    const result = apiResults[0];
    const admCd = result.admCd; // 10자리 행정동코드

    if (admCd && admCd.length >= 10) {
      const sigunguCd = admCd.substring(0, 5);
      const bjdongCd = admCd.substring(5, 10);

      // 지번 주소에서 번-지 및 산지 여부 추출
      const targetAddr = result.jibunAddr || address;
      const { bun, ji, isMount: parsedMount } = extractBunJi(targetAddr);
      const isMount = parsedMount || result.pnu?.charAt(10) === '2' || isMountainLotAddress(address);

      return buildAddressComponents(sigunguCd, bjdongCd, bun, ji, isMount);
    }
  }

  // 2순위: 폴백 — 하드코딩 법정동 매핑 (서울 주소 한정)
  return fallbackParseAddress(address);
}

/**
 * 주소 문자열에서 번-지 및 산지 여부를 추출합니다.
 * 예: "서울특별시 강남구 역삼동 742-1" → { bun: "742", ji: "1", isMount: false }
 * 예: "서울 종로구 평창동 산 12-3" → { bun: "12", ji: "3", isMount: true }
 */
function extractBunJi(address: string): { bun: string; ji: string; isMount: boolean } {
  const isMount = isMountainLotAddress(address);
  const mountMatch = address.match(/(?:^|\s)산\s*(\d{1,4})(?:-(\d{1,4}))?(?:번지)?(?:\s|$)/);
  if (mountMatch) {
    return { bun: mountMatch[1], ji: mountMatch[2] || "0", isMount: true };
  }

  const regex = /^(\d{1,4})(?:-(\d{1,4}))?(?:번지)?$/;
  const parts = address.trim().split(/\s+/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const match = parts[i].match(regex);
    if (match) {
      return { bun: match[1], ji: match[2] || "0", isMount };
    }
  }
  return { bun: "0", ji: "0", isMount };
}

/**
 * 서울 주소 문자열에서 FALLBACK_DONG_MAP 기반 법정동 코드(sigunguCd, bjdongCd)를 조회합니다.
 * 비서울 주소는 절대 매칭하지 않고 null을 반환합니다.
 */
export function lookupSeoulFallbackDong(
  address: string,
  dongHint?: string
): { sigunguCd: string; bjdongCd: string } | null {
  if (!isEligibleForSeoulFallback(address)) {
    return null;
  }

  if (dongHint) {
    const rawDong = dongHint.trim();
    const dongName = rawDong.replace(/(?:동\d+가|[동로가])$/, "");

    if (FALLBACK_DONG_MAP[rawDong]) {
      return FALLBACK_DONG_MAP[rawDong];
    }
    for (const [key, codes] of Object.entries(FALLBACK_DONG_MAP)) {
      const cleanKey = key.trim().replace(/(?:동\d+가|[동로가])$/, "");
      if (dongName.length >= 2 && cleanKey === dongName) {
        return codes;
      }
    }
    if (dongName.length >= 2) {
      for (const [key, codes] of Object.entries(FALLBACK_DONG_MAP)) {
        const cleanKey = key.trim();
        if (dongName.includes(cleanKey) || cleanKey.includes(dongName)) {
          return codes;
        }
      }
    }
  }

  // 도로명 또는 전체 주소에서 매핑 시도 — 더 긴 키 우선 + 자치구명("종로구" 내 "종로") 오매칭 방지
  const sortedEntries = Object.entries(FALLBACK_DONG_MAP).sort(
    (a, b) => b[0].trim().length - a[0].trim().length,
  );
  const addressWithoutGu = address.replace(/[가-힣]+구(?=\s)/g, "").trim();
  for (const [key, codes] of sortedEntries) {
    const cleanKey = key.trim();
    if (cleanKey && addressWithoutGu.includes(cleanKey)) {
      return codes;
    }
  }
  for (const [key, codes] of sortedEntries) {
    const cleanKey = key.trim();
    if (cleanKey && address.includes(cleanKey)) {
      return codes;
    }
  }

  return null;
}

/**
 * 하드코딩 폴백: 서울 주소에서 동이름을 매칭하여 코드를 반환합니다.
 * 비서울 주소('부산 중구 신사동', '성남시 분당구 정자동' 등)는 null을 반환합니다.
 */
function fallbackParseAddress(address: string): AddressComponents | null {
  if (!isEligibleForSeoulFallback(address)) {
    return null;
  }

  // 지번 패턴 (예: "역삼동 742-1", "당산동5가 11-47", "평창동 산 12-3", "평창동 산12")
  const regex = /([가-힣0-9]+)\s+(산\s*)?(\d{1,4})(?:-(\d{1,4}))?(?:번지)?/;
  const match = address.match(regex);

  if (!match) return null;

  const rawDong = match[1].trim();
  const isMount = Boolean(match[2]) || isMountainLotAddress(address);
  const bun = match[3];
  const ji = match[4] || "0";

  const codes = lookupSeoulFallbackDong(address, rawDong);
  if (!codes) return null;

  return buildAddressComponents(codes.sigunguCd, codes.bjdongCd, bun, ji, isMount);
}

/**
 * 카카오 로컬 API를 사용해 주소를 위경도(WGS84)로 변환합니다.
 * @param address 검색할 주소
 * @returns { lat: number, lng: number } 또는 null
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const kakaoAppKey = process.env.KAKAO_REST_API_KEY || process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
  if (!kakaoAppKey || !address) return null;

  try {
    const params = new URLSearchParams({ query: address });
    const res = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?${params}`, {
      headers: {
        Authorization: `KakaoAK ${kakaoAppKey}`,
      },
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 86400 * 30 }, // 30일 캐싱
    });

    if (!res.ok) {
      log.warn(`[geocodeAddress] Kakao API HTTP Error: ${res.status}`);
      return null;
    }

    const json = await res.json();
    const documents = json?.documents;

    if (!documents || documents.length === 0) {
      return null;
    }

    const bestMatch = documents[0];
    return {
      lat: parseFloat(bestMatch.y),
      lng: parseFloat(bestMatch.x),
    };
  } catch (error) {
    log.error("[geocodeAddress] Failed to geocode:", error);
    return null;
  }
}

/**
 * Parses raw text and attempts to resolve it into single or multiple parcels.
 * Handles cases where building spans multiple parcels (e.g. "역삼동 742-1, 742-2").
 */
export async function resolveMultiParcelAddress(address: string): Promise<ResolveResult> {
  if (!address || !address.trim()) {
    return { kind: 'failed', primary: null, alternatives: [] };
  }

  // Multi-parcel input parsing (e.g. "역삼동 742-1, 742-2" or "당산동5가 11-47, 11-48")
  const segments = address.split(',').map(s => s.trim()).filter(Boolean);

  if (segments.length > 1) {
    const primaryResult = await resolveAddressToComponents(segments[0]);
    if (!primaryResult) {
      // Fallback: try resolving whole address string
      const whole = await resolveAddressToComponents(address);
      if (!whole) return { kind: 'failed', primary: null, alternatives: [] };
      return { kind: 'exact', primary: whole, alternatives: [] };
    }

    const alternatives: AddressComponents[] = [];
    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i];
      // 1. Check if it's just a parcel number in the same dong: e.g. "742-2" or "산 12-3" or "산12"
      const parcelMatch = seg.match(/^(산\s*)?(\d{1,4})(?:-(\d{1,4}))?$/);
      if (parcelMatch) {
        alternatives.push(
          buildAddressComponents(
            primaryResult.sigunguCd,
            primaryResult.bjdongCd,
            parcelMatch[2],
            parcelMatch[3] || "0",
            Boolean(parcelMatch[1])
          )
        );
      } else {
        // 2. Try resolving as full address
        const altResult = await resolveAddressToComponents(seg);
        if (altResult) {
          alternatives.push(altResult);
        } else {
          // 3. Extract bun-ji and inherit primary's sigunguCd/bjdongCd
          const bunJi = extractBunJi(seg);
          if (bunJi.bun !== "0") {
            alternatives.push(
              buildAddressComponents(
                primaryResult.sigunguCd,
                primaryResult.bjdongCd,
                bunJi.bun,
                bunJi.ji,
                bunJi.isMount
              )
            );
          }
        }
      }
    }

    return {
      kind: alternatives.length > 0 ? 'ambiguous' : 'exact',
      primary: primaryResult,
      alternatives,
    };
  }

  const result = await resolveAddressToComponents(address);
  if (!result) {
    return { kind: 'failed', primary: null, alternatives: [] };
  }

  return {
    kind: 'exact',
    primary: result,
    alternatives: []
  };
}
