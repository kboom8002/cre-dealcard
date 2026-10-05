/**
 * spec-row-priority.ts
 *
 * 물건 개요(A04) 표준 제원 행 우선순위 선택 (Rule 63 / D4 후속).
 *
 * 배경: LLM 이 만든 building 표가 이미 maxRows 이상이면 렌더러가 뒤에 병합한 표준 제원
 * (층수, 주차 / 승강기 등)이 slice(0, maxRows) 에서 잘려 슬라이드에서 사라졌다.
 * 행이 maxRows 를 초과할 때만, 표준 제원을 우선 보존하고 나머지(비표준 행)를 잘라낸다.
 * 보존된 행의 원래 순서는 유지한다. 표준 제원이 3개 미만인 표(비-물건개요)는 건드리지 않는다.
 */

/** 낮을수록 우선. 50 = 비표준 행 (D5: 용도지역·건폐율/용적률 > 건축면적·층수 > 지목·구조) */
export function specRowPriority(key: string): number {
  const k = key.replace(/\s+/g, '');
  if (/^소재지|주소/.test(k)) return 1;
  if (/대지면적/.test(k)) return 2;
  if (/연면적/.test(k)) return 3;
  if (/건폐율|용적률/.test(k)) return 4;
  if (/용도지역|지역\/지구|지역지구/.test(k)) return 5;
  if (/건축면적/.test(k)) return 6;
  if (/층수|건축규모|규모/.test(k)) return 7;
  if (/주차|승강기|엘리베이터/.test(k)) return 8;
  if (/준공|사용승인/.test(k)) return 9;
  if (/주용도|^용도$/.test(k)) return 10;
  if (/주구조|건물구조|^구조/.test(k)) return 11;
  if (/지목/.test(k)) return 12;
  return 50;
}

export function prioritizeSpecRows<T extends [string, string]>(rows: readonly T[], maxRows: number): T[] {
  if (rows.length <= maxRows) return [...rows];
  const prios = rows.map(r => specRowPriority(String(r[0] ?? '')));
  if (prios.filter(p => p < 50).length < 3) return rows.slice(0, maxRows);
  const keep = new Set(
    prios
      .map((p, i) => ({ p, i }))
      .sort((a, b) => a.p - b.p || a.i - b.i)
      .slice(0, maxRows)
      .map(x => x.i),
  );
  return rows.filter((_, i) => keep.has(i));
}
