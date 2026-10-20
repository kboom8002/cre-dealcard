// src/domain/building/mobile-im/comps-paste-parser.ts
// R11: 디스코·밸류맵·엑셀·메모 등에서 복사한 인근 시세 텍스트/표를 결정론적으로 파싱하여 MarketCompItem[] 생성

import { BROKER_EXTRAS_LIMITS, type BrokerMarketComp } from './broker-extras';

const PYEONG_TO_SQM = 3.305785;

export interface MarketCompItem extends BrokerMarketComp {
  kind: 'listing' | 'transaction';
  location: string;
  price_eok?: number;
  land_price_per_pyeong_manwon?: number;
  land_area_pyeong?: number;
  land_area_sqm?: number;
  gross_floor_area_pyeong?: number;
  gross_floor_area_sqm?: number;
  gfa_pyeong?: number;
  gfa_sqm?: number;
  road_condition?: string;
  road_side?: string;
  station_walk?: string;
  date?: string;
  as_of?: string;
  note?: string;
  selected?: boolean;
  source?: 'broker' | 'molit_tx' | 'broker_listing' | 'rtms' | 'csv';
}

const HEADER_START_RE = /^(?:구분|소재지|주소|지번|위치|사례|비교\s*사례|번호|연번|no\.?|#)(?:\s|$)/i;
const HEADER_KEYWORDS = ['소재지', '주소', '매매가', '매물가', '호가', '대지면적', '토지면적', '연면적', '평당가', '토지평당가'];

const ROAD_CONDITION_RE =
  /(?:^|[\s,|/\t(])(광대소각|광대세각|광대한면|중로한면|중로각지|소로한면|소로각지|세로한면|세로각지|대로변(?:\s*코너|\s*각지)?|이면(?:\s*코너|\s*각지|\s*도로)?|코너|각지|삼면|맹지)(?=$|[\s,|/\t)])/;

const STATION_WALK_RE =
  /([가-힣0-9A-Za-z]+역(?:\s*\([^)]+\)|\s+\d+호선|\s+[가-힣]+선)?\s*(?:도보\s*)?\d+\s*분(?:\s*\(\s*[\d,]+m\s*\))?|도보\s*\d+\s*분(?:\s*\(\s*[\d,]+m\s*\))?)/;

function parseNumeric(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/,/g, '').trim();
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function roundTo(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function isHeaderLine(line: string): boolean {
  const stripped = line.replace(/^[|\s#*\-]+/, '').trim();
  if (!stripped) return true;
  if (/^[|\s:\-]+$/.test(line)) return true;

  const firstCell = stripped.split(/[\t|,]/)[0]?.trim() ?? '';
  if (HEADER_START_RE.test(firstCell)) return true;

  const matchedHeaders = HEADER_KEYWORDS.filter((kw) => stripped.includes(kw));
  if (matchedHeaders.length >= 2 && !/\d+\s*(?:억|만|평|㎡|m2|m²)/i.test(stripped)) {
    return true;
  }
  return false;
}

function extractDateToken(line: string): { date?: string; matchedText?: string } {
  // 1) YYYY.MM / YYYY-MM / YYYY/MM / YYYY년 MM월
  const m4 = line.match(
    /(?:^|[\s,|/\t(])(20\d{2})\s*(?:[.\-/]|년\s*)(0?[1-9]|1[0-2])(?:\s*월)?(?:\s*[.\-/]\s*\d{1,2}\s*일?)?(?=$|[\s,|/\t)])/,
  );
  if (m4) {
    const yyyy = m4[1];
    const mm = String(Number(m4[2])).padStart(2, '0');
    return { date: `${yyyy}-${mm}`, matchedText: m4[0] };
  }

  // 2) '25.11 또는 25.11 (단, 뒤에 평/억/㎡/m 등이 오지 않는 경우)
  const m2 = line.match(
    /(?:^|[\s,|\t(])'?(2\d)\.(0?[1-9]|1[0-2])(?=$|[\s,|\t)])/,
  );
  if (m2) {
    const yyyy = `20${m2[1]}`;
    const mm = String(Number(m2[2])).padStart(2, '0');
    return { date: `${yyyy}-${mm}`, matchedText: m2[0] };
  }

  return {};
}

function extractExplicitPerPyeongManwon(line: string): { value?: number; strippedLine: string } {
  let working = line;
  let value: number | undefined;

  // 패턴 A: 평당 8,500만 / 토지평당가 약 1.7억 / 평당가(토지) 약 60백만원/평
  const prefixRe =
    /(?:토지\s*)?평당(?:가|가격)?(?:\s*\(\s*토지\s*\))?\s*[:=]?\s*(?:약\s*|@\s*)?(?:([\d,]+(?:\.\d+)?)\s*억(?:원)?\s*)?(?:([\d,]+(?:\.\d+)?)\s*(백만|만)(?:원)?)?(?:\s*\/\s*평)?/;
  const mA = working.match(prefixRe);
  if (mA && (mA[1] || mA[2])) {
    const eok = parseNumeric(mA[1]) ?? 0;
    const unitMul = mA[3] === '백만' ? 100 : 1;
    const man = (parseNumeric(mA[2]) ?? 0) * unitMul;
    const total = Math.round(eok * 10000 + man);
    if (total > 0) {
      value = total;
      working = working.replace(mA[0], ' ');
      return { value, strippedLine: working };
    }
  }

  // 패턴 B: 8,500만원/평, 8500만/평, 1.2억/평, 약 60백만원/평, @72백만원/평
  const suffixRe =
    /(?:약\s*|@\s*)?(?:([\d,]+(?:\.\d+)?)\s*억(?:원)?\s*)?(?:([\d,]+(?:\.\d+)?)\s*(백만|만)(?:원)?)?\s*\/\s*(?:3\.3\s*(?:㎡|m2|m²)|평)/i;
  const mB = working.match(suffixRe);
  if (mB && (mB[1] || mB[2])) {
    const eok = parseNumeric(mB[1]) ?? 0;
    const unitMul = mB[3] === '백만' ? 100 : 1;
    const man = (parseNumeric(mB[2]) ?? 0) * unitMul;
    const total = Math.round(eok * 10000 + man);
    if (total > 0) {
      value = total;
      working = working.replace(mB[0], ' ');
      return { value, strippedLine: working };
    }
  }

  return { value: undefined, strippedLine: working };
}

function extractPriceEok(workingLine: string, tokens: string[]): number | undefined {
  // 보증금 표현 제거하여 매매가 오탐 방지
  const cleaned = workingLine.replace(/보증(?:금)?\s*[\d,]+(?:\.\d+)?\s*억(?:\s*[\d,]+(?:\.\d+)?\s*만(?:원)?)?/g, ' ');

  // 1) 명시적 '억' 패턴: 95억, 95.5억, 115억 5,000만, 매도금액 30억
  const eokRe = /(?:매매가?|매도금액|매물가?|호가|거래가?|실거래가?|가격)?\s*[:=]?\s*([\d,]+(?:\.\d+)?)\s*억(?:\s*([\d,]+(?:\.\d+)?)\s*만(?:원)?)?/;
  const m = cleaned.match(eokRe);
  if (m) {
    const eok = parseNumeric(m[1]) ?? 0;
    const man = parseNumeric(m[2]) ?? 0;
    const total = roundTo(eok + man / 10000, 4);
    if (total > 0) return total;
  }

  // 2) 구분자로 나뉜 셀 중 단독 숫자(억 단위 범위: 1 ~ 9999)
  for (const tok of tokens) {
    const t = tok.trim();
    if (/^\d+(?:\.\d+)?$/.test(t)) {
      const n = Number(t);
      if (Number.isFinite(n) && n >= 1 && n < 10000) {
        return n;
      }
    }
  }

  return undefined;
}

interface AreaPair {
  pyeong?: number;
  sqm?: number;
}

function parseAreaValue(valStr: string, unitStr: string, parenValStr?: string, parenUnitStr?: string): AreaPair {
  const v1 = parseNumeric(valStr);
  if (!v1) return {};
  const u1 = unitStr.toLowerCase();
  const isPyeong1 = u1 === '평' || u1 === 'py';

  let pyeong: number | undefined;
  let sqm: number | undefined;

  if (isPyeong1) {
    pyeong = roundTo(v1, 2);
    sqm = roundTo(v1 * PYEONG_TO_SQM, 2);
  } else {
    sqm = roundTo(v1, 2);
    pyeong = roundTo(v1 / PYEONG_TO_SQM, 2);
  }

  if (parenValStr && parenUnitStr) {
    const v2 = parseNumeric(parenValStr);
    if (v2) {
      const u2 = parenUnitStr.toLowerCase();
      if (u2 === '평' || u2 === 'py') pyeong = roundTo(v2, 2);
      else sqm = roundTo(v2, 2);
    }
  }

  return { pyeong, sqm };
}

function extractAreas(line: string): { land: AreaPair; gfa: AreaPair } {
  let land: AreaPair = {};
  let gfa: AreaPair = {};

  const landPrefixRe =
    /(?:대지(?:면적)?|토지(?:면적)?)\s*[:=]?\s*([\d,]+(?:\.\d+)?)\s*(평|㎡|m2|m²|제곱미터)(?:\s*\(\s*([\d,]+(?:\.\d+)?)\s*(평|㎡|m2|m²)\s*\))?/i;
  const landSuffixRe =
    /([\d,]+(?:\.\d+)?)\s*(평|㎡|m2|m²)\s*\(\s*(?:대지|토지)\s*\)/i;

  const mLandPre = line.match(landPrefixRe);
  if (mLandPre) {
    land = parseAreaValue(mLandPre[1], mLandPre[2], mLandPre[3], mLandPre[4]);
  } else {
    const mLandSuf = line.match(landSuffixRe);
    if (mLandSuf) {
      land = parseAreaValue(mLandSuf[1], mLandSuf[2]);
    }
  }

  const gfaPrefixRe =
    /(?:연면적|연|건물(?:면적)?)\s*[:=]?\s*([\d,]+(?:\.\d+)?)\s*(평|㎡|m2|m²|제곱미터)(?:\s*\(\s*([\d,]+(?:\.\d+)?)\s*(평|㎡|m2|m²)\s*\))?/i;
  const gfaSuffixRe =
    /([\d,]+(?:\.\d+)?)\s*(평|㎡|m2|m²)\s*\(\s*(?:연면적|건물)\s*\)/i;

  const mGfaPre = line.match(gfaPrefixRe);
  if (mGfaPre) {
    gfa = parseAreaValue(mGfaPre[1], mGfaPre[2], mGfaPre[3], mGfaPre[4]);
  } else {
    const mGfaSuf = line.match(gfaSuffixRe);
    if (mGfaSuf) {
      gfa = parseAreaValue(mGfaSuf[1], mGfaSuf[2]);
    }
  }

  return { land, gfa };
}

function extractLocationFromTokens(tokens: string[], fullLine: string): string {
  const cleanCandidate = (raw: string): string => {
    let s = raw
      .replace(/^(?:매\s*물|실거래(?:가)?|거\s*래|호가|매매(?:사례)?)\s*[:·\-]?\s*/g, '')
      .replace(STATION_WALK_RE, ' ')
      .replace(/(?:토지\s*)?평당(?:가|가격)?(?:\s*\(\s*토지\s*\))?\s*[:=]?\s*(?:약\s*|@\s*)?(?:[\d,]+(?:\.\d+)?\s*억(?:원)?\s*)?(?:[\d,]+(?:\.\d+)?\s*(?:백만|만)(?:원)?)?(?:\s*\/\s*평)?/g, ' ')
      .replace(/(?:약\s*|@\s*)?(?:[\d,]+(?:\.\d+)?\s*억(?:원)?\s*)?(?:[\d,]+(?:\.\d+)?\s*(?:백만|만)(?:원)?)?\s*\/\s*(?:3\.3\s*(?:㎡|m2|m²)|평)/gi, ' ')
      .replace(/(?:대지(?:면적)?|토지(?:면적)?|연면적|연|건물(?:면적)?)\s*[:=]?\s*[\d,]+(?:\.\d+)?\s*(?:평|㎡|m2|m²|제곱미터)(?:\s*\([^)]*\))?/gi, ' ')
      .replace(/(?:매매가?|매도금액|매물가?|호가|거래가?|실거래가?|가격)?\s*[:=]?\s*[\d,]+(?:\.\d+)?\s*억(?:\s*[\d,]+(?:\.\d+)?\s*만(?:원)?)?/g, ' ')
      .replace(/(?:용도지역|특\s*성)\s*[:=]?\s*(?:제?[123]종일반(?:주거(?:지역)?)?|일반상업(?:\+준주거)?|준주거|준공업|근린상업)/g, ' ')
      .replace(ROAD_CONDITION_RE, ' ')
      .replace(/(?:^|[\s,|/\t(])(?:20\d{2}\s*[.\-/년]\s*|'2\d\s*[.\-/년]\s*|2\d\s*[.년]\s*)(?:0?[1-9]|1[0-2])(?:\s*월)?(?:\s*[.\-/]\s*\d{1,2}\s*일?)?/g, ' ')
      .replace(/(?:^|[\s,|/\t(])(?:매\s*물|실거래|거\s*래|호가|매매)(?=$|[\s,|/\t:)])/g, ' ')
      .replace(/\(\s*(?:약\s*)?\)/g, ' ')
      .replace(/^[\s,|/\-:·()]+|[\s,|/\-:·()]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (s.length > BROKER_EXTRAS_LIMITS.compLocationChars) {
      s = s.slice(0, BROKER_EXTRAS_LIMITS.compLocationChars).trim();
    }
    return s;
  };

  for (const tok of tokens) {
    const t = tok.trim();
    if (!t) continue;
    if (/^(?:매\s*물|실거래|거\s*래|호가|매매)$/.test(t)) continue;
    const cleaned = cleanCandidate(t);
    if (cleaned && /[가-힣]/.test(cleaned)) {
      return cleaned;
    }
  }

  return cleanCandidate(fullLine);
}

/**
 * 디스코·밸류맵·엑셀·메모 등에서 복사한 시세 문자열을 파싱하여 최대 10건의 MarketCompItem 배열로 반환한다.
 */
export function parseCompsPasteText(
  raw: string,
  defaultKind: 'listing' | 'transaction' = 'listing',
): MarketCompItem[] {
  if (!raw || typeof raw !== 'string') return [];

  const lines = raw.split(/\r?\n/);
  const out: MarketCompItem[] = [];

  for (const rawLine of lines) {
    if (out.length >= BROKER_EXTRAS_LIMITS.marketCompsMax) break;

    const line = rawLine.trim();
    if (!line) continue;
    if (isHeaderLine(line)) continue;

    // 탭, 파이프, 숫자 내부가 아닌 쉼표, 공백 있는 슬래시로 토큰 분리
    const tokens = line
      .split(/\t|\||,(?!\d{3}(?!\d))|\s+\/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    // 1. 구분 (kind)
    let kind: 'listing' | 'transaction' = defaultKind;
    if (/(?:매\s*물|호가)/.test(line)) {
      kind = 'listing';
    } else if (/(?:실거래|거래\s*사례|(?:^|[\s,|/\t])거\s*래(?=$|[\s,|/\t:])|매매)/.test(line)) {
      kind = 'transaction';
    }

    // 2. 명시적 토지평당가 추출 (매매가 추출 전에 수행하여 '평당 1억' 오탐 방지)
    const { value: explicitLandPriceManwon, strippedLine } = extractExplicitPerPyeongManwon(line);

    // 3. 매매가/호가(억) 추출
    const priceEok = extractPriceEok(strippedLine, tokens);

    // 4. 대지면적 / 연면적 추출
    const { land, gfa } = extractAreas( strippedLine );

    // 5. 도로 조건 추출
    const roadMatch = strippedLine.match(ROAD_CONDITION_RE);
    const roadCondition = roadMatch ? roadMatch[1].trim() : undefined;

    // 6. 역 도보 시간 추출
    const stationMatch = strippedLine.match(STATION_WALK_RE);
    const stationWalk = stationMatch ? stationMatch[1].trim().replace(/\s{2,}/g, ' ') : undefined;

    // 7. 기준일/거래일 추출
    const { date } = extractDateToken(strippedLine);

    // 8. 소재지 추출
    const location = extractLocationFromTokens(tokens, strippedLine);
    if (!location) continue;

    // 9. 토지평당가 자동 계산 (명시적 평당가가 없을 때)
    const landPyeong =
      land.pyeong ?? (land.sqm !== undefined && land.sqm > 0 ? land.sqm / PYEONG_TO_SQM : undefined);
    const computedLandPriceManwon =
      explicitLandPriceManwon ??
      (priceEok !== undefined && priceEok > 0 && landPyeong !== undefined && landPyeong > 0
        ? Math.round((priceEok * 10000) / landPyeong)
        : undefined);

    // 가격도 평당가도 없는 줄은 유효한 비교사례가 아니므로 스킵
    if (priceEok === undefined && computedLandPriceManwon === undefined) continue;

    const item: MarketCompItem = {
      kind,
      location,
      selected: true,
      source: 'csv',
    };

    if (priceEok !== undefined) item.price_eok = priceEok;
    if (computedLandPriceManwon !== undefined) {
      item.land_price_per_pyeong_manwon = computedLandPriceManwon;
    }
    if (land.pyeong !== undefined) item.land_area_pyeong = land.pyeong;
    if (land.sqm !== undefined) item.land_area_sqm = land.sqm;
    if (gfa.pyeong !== undefined) {
      item.gross_floor_area_pyeong = gfa.pyeong;
      item.gfa_pyeong = gfa.pyeong;
    }
    if (gfa.sqm !== undefined) {
      item.gross_floor_area_sqm = gfa.sqm;
      item.gfa_sqm = gfa.sqm;
    }
    if (roadCondition) {
      item.road_condition = roadCondition;
      item.road_side = roadCondition;
    }
    if (stationWalk) item.station_walk = stationWalk;
    if (date) {
      item.date = date;
      item.as_of = date;
      item.note = date;
    }

    out.push(item);
  }

  return out;
}
