/**
 * @file prompt-external-slice.ts
 * @description LLM 프롬프트에 넣기 전에 렌더 전용(지도 오버레이용) 필드를 제거한다.
 *
 * 배경 (2026-10-05): kakao `locationPoi.candidateSpots`(POI 선별용 후보 최대 60건)가 externalData 에 실려
 * 섹션/judge 프롬프트에 그대로 직렬화되었다.
 *  - 프롬프트의 절반 이상(842줄 중 483줄)을 차지 → 호출당 수천 토큰 낭비
 *  - 병렬 카카오 검색(2초 타임아웃)의 결과가 실행마다 달라 프롬프트가 비결정적 → LLM 녹화 재생이 전부 미스
 * 후보 목록은 PPTX 지도 렌더(location-poi-selector)에서만 쓰이므로 프롬프트에서는 제외한다.
 */
export function stripRenderOnlyExternal<T extends Record<string, any>>(external: T): T {
  const out: Record<string, any> = { ...external };
  const poi = out.locationPoi;
  if (poi && typeof poi === 'object' && 'candidateSpots' in poi) {
    const { candidateSpots: _omit, ...rest } = poi;
    out.locationPoi = rest;
  }
  return out as T;
}
