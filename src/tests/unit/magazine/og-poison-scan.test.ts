import { describe, it, expect } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

type ScanMod = {
  RULES: { id: string }[];
  scanContent: (text: string) => Record<string, { line: number; text: string }[]>;
  diffAgainstBaseline: (
    cur: Record<string, number>,
    base: Record<string, number>,
  ) => { key: string; baseline: number; current: number }[];
};

async function load(): Promise<ScanMod> {
  const p = path.resolve(process.cwd(), 'scripts', 'magazine-poison-scan.mjs');
  return (await import(/* @vite-ignore */ pathToFileURL(p).href)) as ScanMod;
}

describe('magazine poison-scan (T-01)', () => {
  it('독 패턴을 규칙별로 검출한다', async () => {
    const { scanContent } = await load();
    const src = [
      'const n = Math.max(5, count);',
      'const s = "62/100";',
      "const slug = profile?.slug || 'demo';",
      'const p = "010-0000-0000";',
      'const d = new Date().toISOString().slice(0, 10);',
      'const k = process.env.X || "fallback_secret";',
      'const b = name ?? "JS 부동산";',
    ].join('\n');
    const hits = scanContent(src);
    expect(Object.keys(hits).sort()).toEqual(
      ['demo-slug-fallback', 'dummy-phone', 'fake-62-100', 'fake-broker-name', 'fallback-secret', 'social-proof-floor', 'utc-date-slice'].sort(),
    );
  });

  it('주석 줄과 깨끗한 코드는 무시한다', async () => {
    const { scanContent } = await load();
    const src = ['// Math.max(5, n) 금지 예시', ' * 010-0000-0000', 'const today = todayKst();'].join('\n');
    expect(scanContent(src)).toEqual({});
  });

  it('기준선 대비 증가분만 회귀로 판정한다', async () => {
    const { diffAgainstBaseline } = await load();
    const base = { 'a.ts::utc-date-slice': 2 };
    expect(diffAgainstBaseline({ 'a.ts::utc-date-slice': 2 }, base)).toEqual([]);
    expect(diffAgainstBaseline({ 'a.ts::utc-date-slice': 1 }, base)).toEqual([]);
    expect(diffAgainstBaseline({ 'a.ts::utc-date-slice': 3 }, base)).toEqual([
      { key: 'a.ts::utc-date-slice', baseline: 2, current: 3 },
    ]);
    expect(diffAgainstBaseline({ 'b.ts::dummy-phone': 1 }, base)).toHaveLength(1);
  });
});
