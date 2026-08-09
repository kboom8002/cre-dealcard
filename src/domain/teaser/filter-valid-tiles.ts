const EMPTY_PATTERNS = /미정|확인 필요|확인 중|정보 없음/;

export interface HeroTile {
  emoji: string;
  label: string;
  value: string;
}

/**
 * 미정/확인 필요 등 전달 가치가 없는 빈값 타일을 스크리닝하여 반환
 */
export function filterValidTiles(tiles: HeroTile[]): HeroTile[] {
  if (!tiles || !Array.isArray(tiles)) return [];
  return tiles.filter(tile => tile.value && !EMPTY_PATTERNS.test(tile.value));
}
