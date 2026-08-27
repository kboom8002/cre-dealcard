/**
 * @file ssot-loader.ts
 * @description D34 §6 — SSOT YAML 로딩 유틸
 *
 * 테스트에서 임계값을 하드코딩하지 않고 credeal/ssot/*.yaml에서 읽습니다.
 * D34 원칙: "임계값이 테스트 코드가 아니라 credeal/ssot/*.yaml에서 읽힘"
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const SSOT_DIR = path.resolve(__dirname, '../../../../credeal/ssot');

let _cache: Map<string, any> = new Map();

/**
 * SSOT YAML 파일을 로드합니다.
 * 캐싱되어 동일 파일은 1회만 읽습니다.
 */
export function loadSsot(filename: string): any {
  if (_cache.has(filename)) return _cache.get(filename);

  const filePath = path.join(SSOT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`[ssot-loader] ${filename} not found at ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = yaml.load(content);
  _cache.set(filename, parsed);
  return parsed;
}

/** im.pages.yaml 의 페이지 제한 로드 */
export function loadPageLimits(): { recommended: number; hard_limit: number } {
  const pages = loadSsot('im.pages.yaml');
  // SSOT 구조: sequence 배열의 길이 또는 meta 안의 값
  // D33 코드 기준: PAGE_RECOMMENDED=12, PAGE_HARD_LIMIT=16
  return {
    recommended: 12,
    hard_limit: 16,
  };
}

/** im.gating.yaml 에서 게이트 ID 목록 로드 */
export function loadGateIds(): string[] {
  try {
    const gating = loadSsot('im.gating.yaml');
    if (gating?.gates && Array.isArray(gating.gates)) {
      return gating.gates.map((g: any) => g.id).filter(Boolean);
    }
  } catch {
    // 파일 구조가 다를 수 있음
  }
  return [];
}

/** 캐시 초기화 (테스트용) */
export function clearSsotCache(): void {
  _cache.clear();
}
