/**
 * V5-1: 레거시 게이트 코드 → 신규 QG 코드 매핑
 * 기존 로그/데이터에서 구 코드를 참조하는 경우 역변환용
 */
export const LEGACY_GATE_MAP: Readonly<Record<string, string>> = {
  'G01': 'QG01', 'G02': 'QG02', 'G03': 'QG03', 'G04': 'QG04',
  'G05': 'QG05', 'G06': 'QG06', 'G07': 'QG07', 'G08': 'QG08',
  'G09': 'QG09', 'G10': 'QG10', 'G11': 'QG11', 'G12': 'QG12',
  'G13': 'QG13', 'G14': 'QG14', 'G15': 'QG15', 'G16': 'QG16',
  'G20': 'QG20',
} as const;

/** 구 코드를 신규 QG 코드로 변환. 매핑 없으면 원본 반환. */
export function migrateGateCode(code: string): string {
  return (LEGACY_GATE_MAP as Record<string, string>)[code] ?? code;
}
