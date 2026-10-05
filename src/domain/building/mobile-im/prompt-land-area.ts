/**
 * @file prompt-land-area.ts
 * @description 프롬프트용 외부 데이터의 대지면적을 단일 해석값으로 정렬한다.
 *
 * 배경 (oracle trading-sinsa-r3): 다필지 자산에서 건축물대장 `platArea` 는 대표 필지 면적(571.5㎡)이고,
 * 중개인 입력/필지 합 해석값(1,061.9㎡, PPTX 가 사용)과 다르다. 두 값을 모두 받은 LLM 이 뷰어 본문에
 * 대표 필지 면적을 대지면적으로 서술했다. 해석값이 대장값과 충돌하면 프롬프트의 buildingRegister.platArea 를
 * 해석값으로 교체해 한 값만 보이게 한다 (저장되는 external_data 는 건드리지 않는다 — 출처 보존).
 */

const REL_TOL = 0.005;

export function alignPlatAreaForPrompt<T extends Record<string, any>>(
  external: T | null | undefined,
  resolvedLandSqm: number | null | undefined,
): T | null {
  if (!external) return external ?? null;
  const resolved = Number(resolvedLandSqm);
  const br = (external as any).buildingRegister;
  const reg = Number(br?.platArea);
  if (!Number.isFinite(resolved) || resolved <= 0 || !Number.isFinite(reg) || reg <= 0) return external;
  if (Math.abs(reg - resolved) / Math.max(reg, resolved) <= REL_TOL) return external;
  return { ...external, buildingRegister: { ...br, platArea: resolved } };
}
