/**
 * src/lib/magazine/period-label.ts — cre_pulses.period_label / region 매핑 단일 정의 (C-01, D2-04, 함정 #18)
 *
 * 배경
 *  - 수집·집계(`cre-signal-aggregator.ts`, B3b 소유)는 과거 `2026-W41`(연초 기준 비-ISO 주차) 형식으로 적재했고,
 *    매거진 생성기는 `W41-2026`(ISO) 형식으로 조회해 매칭이 항상 실패했다(D2-04).
 *  - 지역은 펄스 쪽이 코드(`gbd|seongsu|ybd|…`), 브로커 프로필은 한글 자유 텍스트(`'강남구 gbd'`, `'성수동'`)라 불일치했다.
 *
 * 규칙
 *  - **쓰기(적재)** 는 `pulsePeriodLabel(dateKst)` (= `isoWeekLabel`) 하나만 사용한다.
 *  - **읽기(조회)** 는 과거 적재분 호환을 위해 `pulsePeriodLabelCandidates(dateKst)` 로 여러 후보를 `.in()` 조회한다.
 *  - 지역은 `normalizePulseRegion()` 으로 코드로 정규화한다. 매핑 불가면 `null` → 호출부는 해당 섹션을 **생략**한다(기본 지역 폴백 금지).
 */
import { isoWeekLabel, isoWeekOf, parseIssueDate } from './kst';

/** 펄스가 적재되는 권역 코드 (pulse-generator.ts REGIONS 와 동일). */
export const PULSE_REGION_CODES = ['gbd', 'ybd', 'cbd', 'seongsu', 'pangyo', 'mapo', 'jongno', 'hongdae'] as const;
export type PulseRegionCode = (typeof PULSE_REGION_CODES)[number];

/** 독자 노출용 한글 권역명. */
export const PULSE_REGION_LABELS_KO: Record<PulseRegionCode, string> = {
  gbd: 'GBD(강남권역)',
  ybd: 'YBD(여의도)',
  cbd: 'CBD(광화문)',
  seongsu: '성수',
  pangyo: '판교',
  mapo: '마포',
  jongno: '종로',
  hongdae: '홍대',
};

/** 한글 자유 텍스트 → 권역 코드 매핑용 키워드 (앞쪽이 우선). */
export const PULSE_REGION_KEYWORDS: Record<PulseRegionCode, readonly string[]> = {
  gbd: ['강남', '역삼', '논현', '삼성동', '선릉', '서초', '신사', '청담', '대치'],
  ybd: ['여의도', '영등포'],
  cbd: ['광화문', '시청', '을지로', '중구', '명동'],
  seongsu: ['성수', '건대', '뚝섬', '성동'],
  pangyo: ['판교', '분당'],
  mapo: ['마포', '공덕', '상암'],
  jongno: ['종로', '종각', '혜화'],
  hongdae: ['홍대', '서교', '연남', '합정'],
};

/**
 * 브로커 specialty_regions 항목 하나(예: '강남구 gbd', '성수동', 'SEONGSU')를 권역 코드로 정규화한다.
 * 코드 토큰이 직접 들어 있으면 그것을 우선하고, 없으면 한글 키워드로 찾는다. 매핑 불가면 null.
 */
export function normalizePulseRegion(input: unknown): PulseRegionCode | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const tokens = s.split(/[^a-z가-힣0-9]+/).filter(Boolean);
  for (const code of PULSE_REGION_CODES) {
    if (tokens.includes(code)) return code;
  }
  for (const code of PULSE_REGION_CODES) {
    if (PULSE_REGION_KEYWORDS[code].some((k) => s.includes(k))) return code;
  }
  return null;
}

/** specialty_regions 배열에서 첫 번째로 매핑되는 권역 코드. 없으면 null. */
export function pickPulseRegion(regions: unknown): PulseRegionCode | null {
  if (!Array.isArray(regions)) return null;
  for (const r of regions) {
    const code = normalizePulseRegion(r);
    if (code) return code;
  }
  return null;
}

/** 쓰기용 표준 라벨 — ISO 8601 `W41-2026`. */
export function pulsePeriodLabel(dateKst: string): string {
  return isoWeekLabel(dateKst);
}

/** 과거 수집기가 쓰던 비-ISO 라벨 `2026-W41`(연초 기준) 계산. 호환 조회 전용 — 새로 쓰지 말 것. */
export function legacyAggregatorWeekLabel(dateKst: string): string | null {
  const d = parseIssueDate(dateKst);
  if (!d) return null;
  const year = d.getUTCFullYear();
  const startOfYear = Date.UTC(year, 0, 1);
  const startDow = new Date(startOfYear).getUTCDay();
  const week = Math.ceil(((d.getTime() - startOfYear) / 86400000 + startDow + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * 읽기용 후보 라벨 목록 (중복 제거, 표준 라벨이 맨 앞).
 *  - `W41-2026`  표준(ISO)
 *  - `2026-W41`  ISO 연도·주차를 뒤집은 형식
 *  - `2026-W41`  과거 수집기 계산식(연초 기준) — ISO와 다를 수 있어 별도 후보
 */
export function pulsePeriodLabelCandidates(dateKst: string): string[] {
  const { year, week } = isoWeekOf(dateKst);
  const ww = String(week).padStart(2, '0');
  const out = [isoWeekLabel(dateKst), `${year}-W${ww}`];
  const legacy = legacyAggregatorWeekLabel(dateKst);
  if (legacy) out.push(legacy);
  return Array.from(new Set(out));
}

/** 지역 필터 키워드로 쓰면 사실상 무필터가 되는 광역 지명. */
const BROAD_PLACE_WORDS: ReadonlySet<string> = new Set(['서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종', '전국', '전체', '수도권', '서울시', '경기도']);
/**
 * 지역 필터용 한글 키워드 도출. 권역 코드가 매핑되면 코드의 키워드를, 항상 원문 토큰(접미사 '구/동/시/권/지역' 제거, 2자 이상)도 포함한다.
 * 예) ['성수동'] → ['성수','건대','뚝섬','성동'], ['용산구'] → ['용산']
 */
export function deriveRegionKeywords(regions: unknown, code: PulseRegionCode | null): string[] {
  const out: string[] = [];
  if (code) out.push(...PULSE_REGION_KEYWORDS[code]);
  if (Array.isArray(regions)) {
    for (const r of regions) {
      if (typeof r !== 'string') continue;
      for (const tok of r.split(/[^가-힣A-Za-z0-9]+/)) {
        const stripped = tok.replace(/(특별시|광역시|지역|권역|구|동|시|권)$/u, '');
        if (stripped.length >= 2 && !/^[a-z]+$/i.test(stripped) && !BROAD_PLACE_WORDS.has(stripped)) out.push(stripped);
      }
    }
  }
  return Array.from(new Set(out));
}


