/**
 * 도로명주소 API 클라이언트 (행정안전부 juso.go.kr)
 *
 * 자유형식 주소 입력 → 정규화된 도로명주소 + 지번주소 + 법정동코드 + 시군구코드 반환
 * API 문서: https://business.juso.go.kr/addrlink/openApi/searchApi.do
 */

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
  "역삼":   { sigunguCd: "11680", bjdongCd: "10100" },
  "삼성":   { sigunguCd: "11680", bjdongCd: "10200" },
  "대치":   { sigunguCd: "11680", bjdongCd: "10300" },
  "논현":   { sigunguCd: "11680", bjdongCd: "10800" },
  "서초":   { sigunguCd: "11650", bjdongCd: "10800" },
  "반포":   { sigunguCd: "11650", bjdongCd: "10500" },
  "잠원":   { sigunguCd: "11650", bjdongCd: "10200" },
  "여의도": { sigunguCd: "11560", bjdongCd: "11000" },
  "성수":   { sigunguCd: "11200", bjdongCd: "11400" },
  "충무로": { sigunguCd: "11140", bjdongCd: "10700" },
  "종로":   { sigunguCd: "11110", bjdongCd: "11500" },
  "용산":   { sigunguCd: "11170", bjdongCd: "10100" },
  "마포":   { sigunguCd: "11440", bjdongCd: "10100" },
  "송파":   { sigunguCd: "11710", bjdongCd: "10100" },
  "을지로": { sigunguCd: "11140", bjdongCd: "10100" },
  "광화문": { sigunguCd: "11110", bjdongCd: "14000" },
  "테헤란": { sigunguCd: "11680", bjdongCd: "10100" },
};

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
      console.warn("[address-resolver] Kakao address search failed, trying fallback:", err);
    }
  }

  // Tier 2: 국토부 VWorld 2.0 검색 API (공식 19자리 PNU 직접 획득)
  const vworldKey = process.env.VWORLD_API_KEY || process.env.NEXT_PUBLIC_VWORLD_KEY;
  if (vworldKey) {
    try {
      const vworldUrl = `https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=${countPerPage}&page=1&query=${encodeURIComponent(trimmed)}&type=address&category=parcel&format=json&errorformat=json&key=${vworldKey}`;
      const res = await fetch(vworldUrl, { next: { revalidate: 86400 } });
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
      console.warn("[address-resolver] VWorld address search failed, trying fallback:", err);
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
      const res = await fetch(`${JUSO_API_URL}?${params}`, { next: { revalidate: 86400 } });
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
      console.error("[address-resolver] Juso API search failed:", error);
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
  // 1. "동/로/길/가/리/면/읍" 뒤에 반드시 공백과 함께 지번/건물번호 숫자가 올 것
  // 2. 또는 주소 끝부분에 공백과 함께 숫자가 올 것
  return /(?:동|로|길|가|리|면|읍)\s+\d+(?:-\d+)?(?:번지)?(?:\s|$)/.test(addr) ||
         /\s+\d+(?:-\d+)?(?:번지)?$/.test(addr);
}

/**
 * 주소 문자열에서 건축물대장 조회에 필요한 시군구코드/법정동코드/번/지를 추출합니다.
 *
 * 1순위: 도로명주소 API로 정확한 행정코드 획득
 * 2순위: API 실패 시 하드코딩 폴백 매핑으로 최선의 추정
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

      // 지번 주소에서 번-지 추출
      const { bun, ji } = extractBunJi(result.jibunAddr || address);

      return { sigunguCd, bjdongCd, bun, ji };
    }
  }

  // 2순위: 폴백 — 하드코딩 법정동 매핑
  return fallbackParseAddress(address);
}

/**
 * 주소 문자열에서 번-지를 추출합니다.
 * 예: "서울특별시 강남구 역삼동 742-1" → { bun: "742", ji: "1" }
 */
function extractBunJi(address: string): { bun: string; ji: string } {
  const regex = /(\d{1,4})(?:-(\d{1,4}))?(?:\s|$)/;
  // 주소 뒷부분에서 번지를 찾기 위해 뒤에서부터 매칭
  const parts = address.split(/\s+/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const match = parts[i].match(regex);
    if (match) {
      return { bun: match[1], ji: match[2] || "0" };
    }
  }
  return { bun: "0", ji: "0" };
}

/**
 * 하드코딩 폴백: 주소에서 동이름을 매칭하여 코드를 반환합니다.
 */
function fallbackParseAddress(address: string): AddressComponents | null {
  // 지번 패턴 (예: "역삼동 742-1")
  const regex = /([가-힣]+)\s+(\d{1,4})(?:-(\d{1,4}))?/;
  const match = address.match(regex);

  if (!match) return null;

  const dongName = match[1].replace(/[동로가]/g, ""); // "역삼동" → "역삼"
  const bun = match[2];
  const ji = match[3] || "0";

  // 동 이름으로 매핑 탐색
  for (const [key, codes] of Object.entries(FALLBACK_DONG_MAP)) {
    if (dongName.includes(key) || key.includes(dongName)) {
      return { sigunguCd: codes.sigunguCd, bjdongCd: codes.bjdongCd, bun, ji };
    }
  }

  // 도로명에서 매핑 시도 (예: "테헤란로 152")
  for (const [key, codes] of Object.entries(FALLBACK_DONG_MAP)) {
    if (address.includes(key)) {
      return { sigunguCd: codes.sigunguCd, bjdongCd: codes.bjdongCd, bun, ji };
    }
  }

  return null;
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
      next: { revalidate: 86400 * 30 }, // 30일 캐싱
    });

    if (!res.ok) {
      console.warn(`[geocodeAddress] Kakao API HTTP Error: ${res.status}`);
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
    console.error("[geocodeAddress] Failed to geocode:", error);
    return null;
  }
}

/**
 * Parses raw text and attempts to resolve it into single or multiple parcels.
 * Handles cases where building spans multiple parcels.
 */
export async function resolveMultiParcelAddress(address: string): Promise<ResolveResult> {
  const result = await resolveAddressToComponents(address);
  if (!result) {
    return { kind: 'failed', primary: null, alternatives: [] };
  }
  
  // Here we would implement true multi-parcel discovery from Building Ledger API.
  // For now, return exact match.
  return {
    kind: 'exact',
    primary: result,
    alternatives: []
  };
}
