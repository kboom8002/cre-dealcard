/**
 * 한국 상업용 부동산(CRE) 권역 온톨로지 + 가격대 밴딩
 *
 * 설계 원칙:
 * 1. 권역: 정규화 테이블 기반 룩업 + AI 추론 폴백
 *    - 역명, 동명, 구명, 주요 랜드마크를 키워드로 매칭
 *    - 매칭 실패 시 AI가 자유 추론한 값을 그대로 수용
 * 2. 가격대: 한국 실무 관행에 부합하는 자연스러운 단위
 *    - 10억 미만(꼬마): 1억 단위
 *    - 10~50억(소형빌딩): 5억 단위
 *    - 50~200억(중소형): 10억 단위
 *    - 200~500억(중형): 50억 단위
 *    - 500~2000억(중대형): 100억 단위
 *    - 2000억+(대형): 500억 단위
 */

// ─── 권역 온톨로지 ──────────────────────────────────────────────────────────

export interface AreaOntologyEntry {
  /** 정규 권역명 (표시용) */
  canonical: string;
  /** 매칭 키워드 — 역명, 동명, 구명, 도로명, 랜드마크 */
  keywords: string[];
}

/**
 * 수도권 주요 CRE 권역 정규화 테이블
 * - 3대 업무지구(CBD/GBD/YBD) 및 주요 투자 권역 수록
 * - keywords는 하위 포함(substring) 매칭으로 사용
 */
export const CRE_AREA_ONTOLOGY: AreaOntologyEntry[] = [
  // ── 3대 업무지구 ──
  { canonical: "강남권역",     keywords: ["강남역", "강남구 역삼", "강남구 삼성", "강남대로", "테헤란로", "GBD", "역삼동", "삼성동", "대치동"] },
  { canonical: "서초권역",     keywords: ["서초역", "서초구", "서초동", "방배동", "서초대로", "법조타운"] },
  { canonical: "종로/광화문권역", keywords: ["종로", "광화문", "중구", "을지로", "CBD", "세종대로", "종각역", "광화문역", "시청역", "을지로역"] },
  { canonical: "여의도권역",   keywords: ["여의도", "여의나루", "영등포구 여의도", "YBD", "국회대로", "여의대방로"] },

  // ── 서울 주요 투자 권역 ──
  { canonical: "성수권역",     keywords: ["성수역", "성수동", "성동구 성수", "서울숲", "뚝섬역"] },
  { canonical: "합정/마포권역", keywords: ["합정역", "마포구", "합정동", "상수역", "상수동", "망원동", "양화로"] },
  { canonical: "홍대권역",     keywords: ["홍대입구역", "홍대", "홍익대", "연남동", "서교동", "동교동"] },
  { canonical: "이태원/한남권역", keywords: ["이태원역", "이태원", "한남동", "용산구 한남", "한강대로"] },
  { canonical: "용산권역",     keywords: ["용산역", "용산구", "용산동", "한강로", "신용산역"] },
  { canonical: "신사/압구정권역", keywords: ["신사역", "압구정역", "신사동", "압구정동", "가로수길", "청담동", "도산대로"] },
  { canonical: "잠실권역",     keywords: ["잠실역", "잠실동", "송파구", "잠실새내역", "올림픽로"] },
  { canonical: "건대/성수권역", keywords: ["건대입구역", "건대", "광진구", "화양동", "자양동"] },
  { canonical: "신촌권역",     keywords: ["신촌역", "신촌", "연세대", "이화여대", "서대문구 대현동"] },
  { canonical: "가산/구로권역", keywords: ["가산디지털단지역", "구로디지털단지역", "가산동", "구로동", "금천구", "G밸리"] },
  { canonical: "문정/가락권역", keywords: ["문정역", "문정동", "가락동", "송파구 문정", "법조단지"] },
  { canonical: "상암/수색권역", keywords: ["상암동", "수색역", "DMC", "상암", "디지털미디어시티"] },
  { canonical: "왕십리/행당권역", keywords: ["왕십리역", "왕십리", "행당동", "성동구 행당"] },
  { canonical: "노원/도봉권역", keywords: ["노원역", "노원구", "도봉구", "상계동", "중계동"] },
  { canonical: "목동권역",     keywords: ["목동", "양천구", "오목교역", "신정동"] },

  // ── 수도권 광역 ──
  { canonical: "판교권역",     keywords: ["판교역", "판교", "성남시 분당구 판교", "판교테크노밸리"] },
  { canonical: "분당권역",     keywords: ["분당", "서현역", "정자역", "수내역", "분당구"] },
  { canonical: "인천/송도권역", keywords: ["송도", "인천", "연수구", "송도동", "인천광역시"] },
  { canonical: "일산/파주권역", keywords: ["일산", "파주", "킨텍스", "고양시", "운정"] },
  { canonical: "수원권역",     keywords: ["수원", "영통구", "권선구", "수원역", "광교"] },
];

/**
 * 주소/메모 텍스트에서 CRE 권역을 추론합니다.
 * 
 * 1단계: 정규화 테이블에서 키워드 매칭 (가장 많은 키워드 히트 기준)
 * 2단계: 매칭 실패 시 null 반환 → AI 추론값 또는 "XX권역" 포맷 폴백
 *
 * @param text - 주소, 역명, 또는 메모 텍스트 (복합 문자열 가능)
 * @returns 정규 권역명 또는 null
 */
export function resolveAreaSignal(text: string): string | null {
  if (!text) return null;

  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const entry of CRE_AREA_ONTOLOGY) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (text.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry.canonical;
    }
  }

  return bestMatch;
}

// ─── 가격대 밴딩 ────────────────────────────────────────────────────────────

/**
 * 매각 희망가(만원) → 한국 CRE 실무 관행에 맞는 가격대 문자열
 *
 * 밴딩 규칙 (한국 중개인/매수자 상식 기준):
 * |  매각가 범위   | 밴딩 단위 | 예시                        | 시장 분류     |
 * |:-------------|:--------:|:---------------------------|:------------|
 * | ~10억         | 1억      | "3억대", "7억대"             | 초소형       |
 * | 10~50억       | 5억      | "15억대", "30억대", "45억대"  | 꼬마빌딩     |
 * | 50~200억      | 10억     | "60억대", "120억대", "180억대"| 중소형빌딩   |
 * | 200~500억     | 50억     | "200억대", "350억대"         | 중형빌딩     |
 * | 500~2,000억   | 100억    | "500억대", "800억대"         | 중대형빌딩   |
 * | 2,000억+      | 500억    | "2,000억대", "3,500억대"     | 대형/트로피  |
 *
 * @param manwon - 매각 희망가 (만원 단위)
 * @returns 가격대 문자열 (e.g., "80억대") 또는 빈 문자열
 */
export function derivePriceBand(manwon: number): string {
  const eok = manwon / 10000; // 만원 → 억
  if (eok <= 0) return "";

  let band: number;

  if (eok < 10) {
    // 10억 미만: 1억 단위
    band = Math.floor(eok) || 1;
  } else if (eok < 50) {
    // 10~50억: 5억 단위 (내림)
    band = Math.floor(eok / 5) * 5;
  } else if (eok < 200) {
    // 50~200억: 10억 단위
    band = Math.floor(eok / 10) * 10;
  } else if (eok < 500) {
    // 200~500억: 50억 단위
    band = Math.floor(eok / 50) * 50;
  } else if (eok < 2000) {
    // 500~2000억: 100억 단위
    band = Math.floor(eok / 100) * 100;
  } else {
    // 2000억+: 500억 단위
    band = Math.floor(eok / 500) * 500;
  }

  // 천 단위 구분 쉼표 (1,000억 이상)
  const formatted = band >= 1000 ? band.toLocaleString("ko-KR") : String(band);
  return `${formatted}억대`;
}

/**
 * area_signal이 정규 권역 테이블에 등록된 값인지 확인합니다.
 * (UI에서 자동완성/드롭다운 지원 시 사용 가능)
 */
export function getCanonicalAreas(): string[] {
  return CRE_AREA_ONTOLOGY.map(e => e.canonical);
}
