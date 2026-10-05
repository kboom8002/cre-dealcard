/**
 * 역명 파싱 단일 유틸 (D11b).
 *
 * 입력 예:
 *   '동대문역사문화공원역 5호선'      → { name: '동대문역사문화공원역', lines: ['5호선'] }
 *   '동대문역사문화공원역(2·4·5호선)' → { name: '동대문역사문화공원역', lines: ['2호선','4호선','5호선'] }
 *   '당산역(2호선/9호선)'            → { name: '당산역', lines: ['2호선','9호선'] }
 *   '선유도역(9호선) 4번출구'         → { name: '선유도역', lines: ['9호선'] }
 *   '강남' / '서울대입구역'           → { name: '강남역' / '서울대입구역', lines: [] }
 *
 * 핵심: '역'이 역명 중간에 들어가는 경우('동대문역사문화공원역')를 위해 첫 '역'에서 끊지 않고,
 * 알려진 노선 토큰(호선·신분당선 등)이 시작되는 지점까지를 역명 접두로 취한다.
 */

/** 노선 토큰 (인천N호선은 N호선보다 먼저 매칭되도록 앞에 둔다) */
const LINE_TOKEN =
  '인천\\d호선|\\d+호선|신분당선|수인분당선|공항철도|경의중앙선|경춘선|GTX-?[A-Z]|우이신설선|서해선|경강선|신림선|김포골드라인';

/** '2·4·5호선' / '2,4,5호선' / '2/4호선' → '2호선 4호선 5호선' */
function expandNumberedLines(s: string): string {
  return s.replace(/(\d+)((?:\s*[·ㆍ,/]\s*\d+)+)\s*호선/g, (_m, first: string, rest: string) => {
    const nums = [first, ...(rest.match(/\d+/g) ?? [])];
    return nums.map((n) => `${n}호선`).join(' ');
  });
}

export interface ParsedStationName {
  /** '…역'으로 끝나는 정규화된 역명 ('' = 입력 없음) */
  name: string;
  /** 중복 제거된 노선 목록 (입력 순서 유지) */
  lines: string[];
}

export function parseStationName(raw: string | null | undefined): ParsedStationName {
  const src = String(raw ?? '').replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, ' ').trim();
  if (!src) return { name: '', lines: [] };

  const s = expandNumberedLines(src);
  const lineRe = new RegExp(LINE_TOKEN, 'g');
  const first = lineRe.exec(s);

  const lines: string[] = [];
  let prefix = s;
  if (first) {
    prefix = s.slice(0, first.index);
    lineRe.lastIndex = first.index;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(s)) !== null) {
      if (!lines.includes(m[0])) lines.push(m[0]);
    }
  }

  // 접두 말미의 여는 괄호/구분자 제거 ('당산역(' → '당산역'), 노선 없는 말미 괄호 주석 제거 ('강남역(출구)')
  prefix = prefix.replace(/[\s(\[\-–·,/]+$/, '');
  prefix = prefix.replace(/\s*[(\[][^)\]]*[)\]]\s*$/, '').trim();
  if (!prefix) return { name: '', lines };

  let name: string;
  if (/역$/.test(prefix)) {
    name = prefix;
  } else {
    // '선유도역 4번출구' → '선유도역' (역 뒤에 경계가 있어야 함), 그 외 '강남' → '강남역'
    const m = prefix.match(/^(\S*?역)(?=[\s(\[·,]|$)/);
    name = m ? m[1] : `${prefix.replace(/\s+.*$/, '')}역`;
  }
  return { name, lines };
}

/** '양재역 신분당선' → '양재역' (노선·부가 문구 제거, 항상 '역'으로 끝남) */
export function stationNameOnly(raw: string | null | undefined): string {
  return parseStationName(raw).name;
}

/** 표시용 라벨: '동대문역사문화공원역(2호선·4호선·5호선)' / 노선 없으면 역명만 */
export function formatStationLabel(name: string, lines: string[]): string {
  if (!name) return '';
  return lines.length > 0 ? `${name}(${lines.join('·')})` : name;
}
