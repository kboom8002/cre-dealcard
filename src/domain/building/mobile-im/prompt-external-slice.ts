/**
 * @file prompt-external-slice.ts
 * @description LLM 프롬프트에 넣기 전에 렌더 전용(지도 오버레이용) 필드를 제거한다.
 *
 * 배경 (2026-10-05): kakao `locationPoi.candidateSpots`(POI 선별용 후보 최대 60건)가 externalData 에 실려
 * 섹션/judge 프롬프트에 그대로 직렬화되었다.
 *  - 프롬프트의 절반 이상(842줄 중 483줄)을 차지 → 호출당 수천 토큰 낭비
 *  - 병렬 카카오 검색(2초 타임아웃)의 결과가 실행마다 달라 프롬프트가 비결정적 → LLM 녹화 재생이 전부 미스
 * 후보 목록은 PPTX 지도 렌더(location-poi-selector)에서만 쓰이므로 프롬프트에서는 제외한다.
 *
 * 배경 (2026-10-05, 건축물대장 보완): 래퍼가 표제부의 건축면적/승강기/주차 및 대표지번 provenance 를
 * buildingRegister 에 추가했다. 이 값들은 PPTX 개요표/출처 기록 전용이므로 프롬프트 바이트가 달라지지 않도록
 * (= LLM 녹화 재생 미스 방지) 여기서 제거한다. 이 목록에 키를 추가하면 해당 키는 프롬프트에서 사라진다.
 */
export const RENDER_ONLY_BUILDING_REGISTER_KEYS = [
  'archArea',
  'elevatorCount',
  'passengerElevatorCount',
  'emergencyElevatorCount',
  'parkingCount',
  'selfParkingCount',
  'mechanicalParkingCount',
  'mainPnu',
  'attachedLots',
] as const;

export function stripRenderOnlyExternal<T extends Record<string, any>>(external: T): T {
  const out: Record<string, any> = { ...external };
  const poi = out.locationPoi;
  if (poi && typeof poi === 'object' && 'candidateSpots' in poi) {
    const { candidateSpots: _omit, ...rest } = poi;
    out.locationPoi = rest;
  }
  // 입지도 랜드마크 풀(landmark-pool): PPTX 지도 렌더 전용(최대 수백 건). 현재 externalData 에는 실리지 않으나 방어적으로 제거.
  if ('landmarkPool' in out) delete out.landmarkPool;
  if (out.locationPoi && typeof out.locationPoi === 'object' && 'landmarkPool' in out.locationPoi) {
    const { landmarkPool: _lp, ...restPoi } = out.locationPoi;
    out.locationPoi = restPoi;
  }
  const br = out.buildingRegister;
  if (br && typeof br === 'object' && !Array.isArray(br)
    && RENDER_ONLY_BUILDING_REGISTER_KEYS.some((k) => k in br)) {
    const rest: Record<string, any> = { ...br };
    for (const k of RENDER_ONLY_BUILDING_REGISTER_KEYS) delete rest[k];
    out.buildingRegister = rest;
  }
  return out as T;
}
