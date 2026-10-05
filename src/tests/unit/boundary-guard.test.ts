/**
 * @file src/tests/unit/boundary-guard.test.ts
 * @description 경계 정규화 가드 (quality-strategy §3-③) — grep 스타일.
 *
 * 렌더러(pptx/**)가 **원시 건축물대장 API 키**를 직접 읽으면 필드명 불일치 결함이 재발한다
 * (예: bcrPct/farPct/groundFloors vs 대장 실제 키 bcRat/vlRat/floorsAbove). 대장은 정규화 함수
 * (`normalizeBuildingRegister`, spec-resolver.ts)를 한 번만 거쳐야 한다.
 *
 * 두 겹:
 *  1) STRICT  — 대장 수신자(br/reg/register/buildingRegister…)에서 원시 키를 읽는 코드는 ALLOWLIST 파일 밖에서 금지.
 *  2) BASELINE — 같은 키 이름을 **어떤 수신자에서든** 읽는 횟수를 파일별로 기록(현재 부채). 증가/신규 파일이면 실패.
 *     (대부분 im-core `core.physical.*`, ssot, heroCard 같은 정규화된 모델 필드라 대장 원시 키가 아닐 수 있음 — register agent 가 감사 후 축소)
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const PPTX_DIR = path.resolve(__dirname, '..', '..', 'domain', 'building', 'mobile-im', 'pptx');

const RAW_KEYS = ['grndFlrCnt', 'ugrndFlrCnt', 'bcrPct', 'farPct', 'groundFloors', 'undergroundFloors', 'approvalDate'];

/** 대장 수신자로 쓰이는 변수명 (br = building register) */
const REGISTER_RECEIVERS = ['br', 'reg', 'register', 'buildingRegister', 'rawRegister', 'bldgRegister'];

/**
 * STRICT 허용 파일 (pptx/ 기준 상대경로). 새 파일을 추가하지 말 것 —
 * 대장 키 해석은 spec-resolver.ts 또는 향후 normalize 함수 한 곳에서만 한다.
 * DONE: spec-resolver.ts 의 raw 대장 키는 normalizeBuildingRegister 로 이관되어 이 목록은 비어 있다.
 */
const STRICT_ALLOWLIST = new Set<string>([]);

/**
 * BASELINE: 파일별 허용 횟수 (현재 부채 스냅샷). 줄이는 것은 자유, 늘리거나 새 파일을 추가하면 실패.
 * TODO(register agent): 각 항목이 대장 원시 키인지 감사 → 아니면(정규화 모델 필드) 이름 변경/예외 문서화, 맞으면 normalize 로 이관 후 삭제.
 */
const BASELINE: Record<string, number> = {
  // 2026-10-05 스냅샷 (대장 수신자가 아닌 정규화 모델/ssot/heroCard 필드 접근이 대부분 — 감사 필요)
  'archetypes/a04-asymmetric-7-5.ts': 2, // ssot.bcrPct / ssot.farPct
  'archetypes/a17-pre-completion-marketing.ts': 2, // input.data.bcrPct / farPct
  'binder/core-binders.ts': 8, // core.physical.bcrPct / farPct (im-core 정규화 모델)
  'spec-resolver.ts': 2, // h.bcrPct / h.farPct (heroCard 폴백 — resolver 내부)
  'summary-highlights.ts': 4, // f.farPct (자체 정규화 팩트 객체)
};

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name === '__tests__') continue; out.push(...listTs(p)); }
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** 주석 줄 제외한 코드 줄만 */
function codeLines(file: string): Array<{ n: number; text: string }> {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let inBlock = false;
  const res: Array<{ n: number; text: string }> = [];
  lines.forEach((raw, i) => {
    let line = raw;
    if (inBlock) { const end = line.indexOf('*/'); if (end < 0) return; line = line.slice(end + 2); inBlock = false; }
    // 한 줄 안의 /* ... */ 제거, 열린 블록 처리
    line = line.replace(/\/\*.*?\*\//g, '');
    const open = line.indexOf('/*');
    if (open >= 0) { line = line.slice(0, open); inBlock = true; }
    line = line.replace(/\/\/.*$/, '');
    if (line.trim()) res.push({ n: i + 1, text: line });
  });
  return res;
}

const keyAlt = RAW_KEYS.join('|');
const STRICT_RE = new RegExp(`\\b(?:${REGISTER_RECEIVERS.join('|')})\\??\\.(?:${keyAlt})\\b|\\b(?:${REGISTER_RECEIVERS.join('|')})\\??\\[\\s*['"](?:${keyAlt})['"]\\s*\\]`, 'g');
const BROAD_RE = new RegExp(`\\b[A-Za-z_$][\\w$]*\\??\\.(?:${keyAlt})\\b|\\[\\s*['"](?:${keyAlt})['"]\\s*\\]`, 'g');

interface Scan { strict: Array<{ file: string; n: number; text: string }>; broad: Record<string, number> }

export function scanPptxBoundary(): Scan {
  const strict: Scan['strict'] = [];
  const broad: Record<string, number> = {};
  for (const f of listTs(PPTX_DIR)) {
    const rel = path.relative(PPTX_DIR, f).replace(/\\/g, '/');
    for (const { n, text } of codeLines(f)) {
      if ((text.match(STRICT_RE) ?? []).length) strict.push({ file: rel, n, text: text.trim() });
      const b = (text.match(BROAD_RE) ?? []).length;
      if (b) broad[rel] = (broad[rel] ?? 0) + b;
    }
  }
  return { strict, broad };
}

describe('boundary-guard: pptx 렌더러의 원시 건축물대장 키 직접 접근 금지', () => {
  const scan = scanPptxBoundary();

  it('STRICT: 대장 수신자에서 원시 키(grndFlrCnt/ugrndFlrCnt/bcrPct/farPct/groundFloors/undergroundFloors/approvalDate)를 읽는 코드는 allowlist 파일에만', () => {
    const offenders = scan.strict.filter(o => !STRICT_ALLOWLIST.has(o.file));
    expect(offenders.map(o => `${o.file}:${o.n} ${o.text}`)).toEqual([]);
  });

  it('STRICT allowlist 에 더 이상 위반이 없는 항목이 있으면 경고 (register agent 가 이관 완료 시 항목 삭제)', () => {
    const used = new Set(scan.strict.map(o => o.file));
    const stale = [...STRICT_ALLOWLIST].filter(f => !used.has(f));
    if (stale.length) console.warn(`[boundary-guard] 정리 가능한 STRICT allowlist 항목: ${stale.join(', ')}`);
    expect(true).toBe(true);
  });

  it('BASELINE: 동일 키 이름의 접근 횟수가 기록된 부채(파일별)를 넘지 않는다 — 신규 파일/증가 금지', () => {
    const regressions: string[] = [];
    for (const [file, count] of Object.entries(scan.broad)) {
      const allowed = BASELINE[file] ?? 0;
      if (count > allowed) regressions.push(`${file}: ${count}회 (허용 ${allowed})`);
    }
    expect(regressions).toEqual([]);
  });
});

if (process.env.BOUNDARY_GUARD_PRINT === '1') {
  // eslint-disable-next-line no-console
  console.log('BASELINE =', JSON.stringify(scanPptxBoundary().broad, null, 2));
}
