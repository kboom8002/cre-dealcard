/**
 * Region Hierarchy Matcher (P0-1)
 *
 * Implements Seoul district-neighborhood (Gu-Dong) mapping
 * and dynamic hierarchical region matching.
 */

export const SEOUL_GUS: Record<string, string[]> = {
  '성동구': ['성수동', '성수동1가', '성수동2가', '금호동', '옥수동', '마장동', '사근동', '송정동', '용답동', '행당동', '왕십리동', '도선동', '응봉동', '왕십리도선동'],
  '강남구': ['역삼동', '개포동', '청담동', '삼성동', '대치동', '신사동', '논현동', '압구정동', '세곡동', '자곡동', '율현동', '일원동', '수서동', '도곡동', '역삼1동', '역삼2동', '대치1동', '대치2동', '대치4동', '도곡1동', '도곡2동', '논현1동', '논현2동', '삼성1동', '삼성2동', '일원본동', '일원1동', '일원2동', '개포1동', '개포2동', '개포4동'],
  '서초구': ['서초동', '잠원동', '반포동', '방배동', '양재동', '우면동', '원지동', '내곡동', '염곡동', '신원동', '서초1동', '서초2동', '서초3동', '서초4동', '반포본동', '반포1동', '반포2동', '반포3동', '반포4동', '방배본동', '방배1동', '방배2동', '방배3동', '방배4동', '양재1동', '양재2동'],
  '마포구': ['아현동', '공덕동', '신공덕동', '도화동', '용강동', '토정동', '마포동', '대흥동', '염리동', '노고산동', '신수동', '현석동', '구수동', '창전동', '상수동', '하중동', '신정동', '당인동', '서교동', '동교동', '합정동', '망원동', '망원1동', '망원2동', '연남동', '성산동', '성산1동', '성산2동', '상암동'],
  '용산구': ['후암동', '용산동', '갈월동', '남영동', '동자동', '서계동', '청파동', '원효로', '신계동', '문배동', '한강로', '이촌동', '이태원동', '한남동', '서빙고동', '보광동', '동부이촌동'],
  '송파구': ['풍납동', '거여동', '마천동', '방이동', '오금동', '송파동', '석촌동', '삼전동', '가락동', '문정동', '장지동', '잠실동', '신천동', '잠실본동'],
  '광진구': ['중곡동', '능동', '구의동', '광장동', '자양동', '화양동', '군자동'],
  '중구': ['소공동', '회현동', '명동', '필동', '장충동', '광희동', '을지로동', '신당동', '다산동', '약수동', '청구동', '동화동', '황학동', '중림동'],
  '종로구': ['사직동', '삼청동', '부암동', '평창동', '무악동', '교남동', '가회동', '종로1가', '종로2가', '종로3가', '종로4가', '종로5가', '종로6가', '혜화동', '창신동', '숭인동', '이화동'],
  '영등포구': ['여의도동', '당산동', '양평동', '문래동', '영등포동', '신길동', '대림동', '도림동'],
  '동작구': ['노량진동', '상도동', '흑석동', '사당동', '대방동', '신대방동'],
  '관악구': ['봉천동', '신림동', '남현동'],
  '서대문구': ['충현동', '천연동', '북아현동', '신촌동', '연희동', '홍제동', '홍은동', '남가좌동', '북가좌동'],
  '성북구': ['성북동', '삼선동', '동선동', '돈암동', '안암동', '보문동', '정릉동', '길음동', '종암동', '월곡동', '장위동', '석관동'],
  '동대문구': ['용신동', '제기동', '전농동', '답십리동', '장안동', '청량리동', '회기동', '휘경동', '이문동'],
  '강동구': ['강일동', '상일동', '명일동', '고덕동', '암사동', '천호동', '성내동', '둔촌동', '길동'],
  '중랑구': ['면목동', '상봉동', '중화동', '묵동', '망우동', '신내동'],
  '노원구': ['월계동', '공릉동', '하계동', '중계동', '상계동'],
  '도봉구': ['쌍문동', '방학동', '창동', '도봉동'],
  '강북구': ['번동', '수유동', '삼양동', '미아동', '송중동', '송천동', '삼각산동', '우이동', '인수동'],
  '은평구': ['녹번동', '불광동', '갈현동', '구산동', '대조동', '응암동', '역촌동', '신사동', '증산동', '수색동', '진관동'],
  '양천구': ['목동', '신월동', '신정동'],
  '강서구': ['염창동', '등촌동', '화곡동', '가양동', '발산동', '공항동', '방화동', '우장산동'],
  '구로구': ['신도림동', '구로동', '가리봉동', '고척동', '개봉동', '오류동', '수궁동', '항동'],
  '금천구': ['가산동', '독산동', '시흥동']
};

// Normalized lookup tables
const NORM_GU_TO_DONG: Record<string, string[]> = {};
const NORM_DONG_TO_GU: Record<string, string> = {};

// Initialize normalized lookup maps
for (const [gu, dongs] of Object.entries(SEOUL_GUS)) {
  const normGu = normalizeName(gu);
  NORM_GU_TO_DONG[normGu] = dongs.map(d => normalizeName(d)).filter(Boolean);
  for (const dong of dongs) {
    const normDong = normalizeName(dong);
    if (normDong) {
      NORM_DONG_TO_GU[normDong] = normGu;
    }
  }
}

export function normalizeName(name: string): string {
  if (!name) return '';
  const clean = name.trim();
  if (clean === '성동구' || clean === '성동') return '성동';
  if (clean === '강동구' || clean === '강동') return '강동';
  return clean
    .replace(/(특별시|광역시|특별자치시|자치구|시|구|동|읍|면|리|가|\d+가|\d+동)*$/, '')
    .trim();
}

/**
 * Split a full address into individual normalized tokens.
 */
export function getAddressTokens(address: string): string[] {
  if (!address) return [];
  const clean = address.replace(/\s+/g, ' ').trim();
  return clean.split(' ').map(token => normalizeName(token)).filter(Boolean);
}

/**
 * Robust region matching considering administrative levels and partial/fuzzy matches.
 */
export function matchRegion(
  propertyArea: string,
  buyerRegions: string[]
): { matched: boolean; matchedRegion: string; matchType: 'exact' | 'hierarchy' | 'fuzzy' } {
  if (!propertyArea || !buyerRegions || buyerRegions.length === 0) {
    return { matched: false, matchedRegion: '', matchType: 'exact' };
  }

  // Get raw tokens before normalization to check for suffixes (e.g. '동')
  const rawTokens = propertyArea.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const propTokens = rawTokens.map(token => normalizeName(token)).filter(Boolean);

  for (const buyerRegion of buyerRegions) {
    const normBuyer = normalizeName(buyerRegion);
    if (!normBuyer) continue;

    // 1. Exact / Suffix-abbreviation match
    for (let i = 0; i < propTokens.length; i++) {
      const normProp = propTokens[i];
      const rawProp = rawTokens[i];

      if (normProp === normBuyer) {
        if (rawProp === buyerRegion) {
          return { matched: true, matchedRegion: buyerRegion, matchType: 'exact' };
        }
        // If either the property token or buyer preferred region ended with '동' or '가' (ignoring '성동', '강동' Gus),
        // classify as 'fuzzy' to denote neighborhood shorthand matching (Scenario 4)
        const endsWithDongGu = ['성동', '강동'];
        const endsWithDongOrGa = (str: string) => {
          const norm = normalizeName(str);
          return (str.endsWith('동') || str.endsWith('가')) && !endsWithDongGu.includes(norm);
        };
        const hasDongSuffix = endsWithDongOrGa(rawProp) || endsWithDongOrGa(buyerRegion);
        if (hasDongSuffix) {
          return { matched: true, matchedRegion: buyerRegion, matchType: 'fuzzy' };
        }
        return { matched: true, matchedRegion: buyerRegion, matchType: 'exact' };
      }
    }

    // 2. City Level Hierarchy (서울 ⊃ Gu / Dong)
    if (normBuyer === '서울') {
      const hasSeoulToken = propTokens.includes('서울');
      const isKnownSeoulArea = propTokens.some(
        t => NORM_GU_TO_DONG[t] !== undefined || NORM_DONG_TO_GU[t] !== undefined
      );
      if (hasSeoulToken || isKnownSeoulArea) {
        return { matched: true, matchedRegion: buyerRegion, matchType: 'hierarchy' };
      }
    }

    // 3. District-to-Neighborhood Hierarchy (Gu ⊃ Dong)
    if (NORM_GU_TO_DONG[normBuyer]) {
      const propertyDongs = propTokens.filter(t => NORM_DONG_TO_GU[t] === normBuyer);
      if (propertyDongs.length > 0) {
        return { matched: true, matchedRegion: buyerRegion, matchType: 'hierarchy' };
      }
    }

    // Neighborhood-to-District Hierarchy (Dong ⊂ Gu)
    if (NORM_DONG_TO_GU[normBuyer]) {
      const parentGu = NORM_DONG_TO_GU[normBuyer];
      if (propTokens.includes(parentGu)) {
        return { matched: true, matchedRegion: buyerRegion, matchType: 'hierarchy' };
      }
    }

    // 4. Fuzzy / Partial substring match for other boundaries
    for (const propToken of propTokens) {
      if (
        propToken.length >= 2 &&
        normBuyer.length >= 2 &&
        (propToken.includes(normBuyer) || normBuyer.includes(propToken))
      ) {
        return { matched: true, matchedRegion: buyerRegion, matchType: 'fuzzy' };
      }
    }
  }

  return { matched: false, matchedRegion: '', matchType: 'exact' };
}
