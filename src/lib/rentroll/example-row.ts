export interface ExampleRentRollRowInput {
  floor?: unknown;
  biz?: unknown;
  tenantName?: unknown;
  note?: unknown;
}

export const EXAMPLE_PREFIX_RE = /^\s*\[예시\]/i;
export const EXAMPLE_ROW_NOTE_RE = /예시\s*행/;

/**
 * 템플릿 13행(작성 예시 행) 여부 단일 판정 SSOT.
 * - `[예시]` 접두어가 floor/biz/tenantName 에 있으면 예시 행으로 제외한다.
 * - 비고에 `예시 행` 표식이 있을 때는 빈 floor, `[예시]` floor, 또는 레거시 v1.2/v1.3 무수정 예시(`3F` + `사무실`)만 제외한다.
 * - 실제 `3F` 또는 실제 `사무실` 행(예: `3F 치과`, `5F 사무실`, `3F 한강소프트`)은 오탐으로 탈락시키지 않는다.
 */
export function isExampleRentRollRow(input: ExampleRentRollRowInput): boolean {
  const floor = String(input.floor ?? "").trim();
  const biz = String(input.biz ?? "").trim();
  const tenantName = String(input.tenantName ?? "").trim();
  const note = String(input.note ?? "").trim();

  if (
    EXAMPLE_PREFIX_RE.test(floor) ||
    EXAMPLE_PREFIX_RE.test(biz) ||
    EXAMPLE_PREFIX_RE.test(tenantName)
  ) {
    return true;
  }

  if (EXAMPLE_ROW_NOTE_RE.test(note)) {
    if (!floor || EXAMPLE_PREFIX_RE.test(floor)) {
      return true;
    }
    if (floor === "3F" && biz === "사무실" && (!tenantName || tenantName === "사무실")) {
      return true;
    }
  }

  return false;
}
