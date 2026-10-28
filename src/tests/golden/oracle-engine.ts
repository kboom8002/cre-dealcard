/**
 * @file src/tests/golden/oracle-engine.ts
 * @description 사실 오라클 평가 엔진 (순수 함수 — I/O 없음).
 *
 * expected_facts.json 스키마는 docs/golden-test-data/README-oracle.md 참조.
 * 정답값은 픽스처(bottom_sheet/memo/rent roll) 및 공공 건축물대장 API 값에서만 가져오고
 * 현재 PPTX 출력에서 역산하지 않는다 (Rule 34 날조 금지 / Rule 37 결측은 '-').
 */

export type Where = 'pptx' | 'viewer' | 'both';
export type Source = 'fixture' | 'register' | 'derived';
/** W1~W3: 기존 결함 묶음 · P2: LLM 뷰어 본문 재녹화 대기(추정 법정 한도·구 수치 인용) */
export type PendingTag = 'W1' | 'W2' | 'W3' | 'P2';

interface Base {
  id?: string;
  label: string;
  where?: Where;
  source?: Source;
  /** 알려진 미해결 결함 묶음 — 실패해도 PENDING 으로 보고 (ORACLE_STRICT=1 이면 FAIL) */
  pending?: PendingTag;
  /** 출처/충돌 설명 (사람용) */
  note?: string;
}
export interface ContainFact extends Base { anyOf: string[] }
export interface DashFact extends Base { labelRegex?: string; regexNearLabel: string; window?: number }
export interface NumericFact extends Base { labelRegex?: string; value: number; unit: '㎡' | '평' | '%'; tolerancePct: number }
export interface TenantsFact extends Base { names: string[] }
export interface DupFact extends Base { min_len?: number; ignore?: string[] }

export interface ExpectedFacts {
  schemaVersion: 1;
  golden: string;
  fixture: string;
  notes?: string[];
  must_contain: ContainFact[];
  must_not_contain: ContainFact[];
  must_not_be_dash: DashFact[];
  landmarks: ContainFact[];
  tenants?: TenantsFact;
  numeric: NumericFact[];
  duplicate_sentences?: DupFact;
}

export interface OracleContext {
  slides: string[];
  pptxText: string;
  viewerText: string;
}

export type Status = 'PASS' | 'FAIL' | 'PENDING';
export interface FactResult {
  golden: string;
  id: string;
  kind: 'must_contain' | 'must_not_contain' | 'must_not_be_dash' | 'landmark' | 'tenants' | 'numeric' | 'duplicate' | 'universal';
  label: string;
  where: Where;
  source?: Source;
  pending?: PendingTag;
  status: Status;
  /** pending 태그가 있는데 통과함 → 태그 제거 후보 */
  stalePending?: boolean;
  detail: string;
}

const squash = (s: string) => s.replace(/\s+/g, '');
const collapse = (s: string) => s.replace(/\s+/g, ' ');

function compile(m: string): RegExp | null {
  return m.startsWith('re:') ? new RegExp(m.slice(3), 'u') : null;
}

/** 단일 매처가 텍스트에 존재하는지 (literal 은 공백 무시 비교 포함) */
export function matches(text: string, m: string): boolean {
  const re = compile(m);
  if (re) return re.test(text) || re.test(collapse(text));
  return text.includes(m) || collapse(text).includes(collapse(m)) || squash(text).includes(squash(m));
}
export function firstMatch(text: string, m: string): string | null {
  const re = compile(m);
  if (re) { const x = text.match(re) ?? collapse(text).match(re); return x ? x[0] : null; }
  return matches(text, m) ? m : null;
}

function textsFor(where: Where, ctx: OracleContext): Array<[string, string]> {
  if (where === 'pptx') return [['pptx', ctx.pptxText]];
  if (where === 'viewer') return [['viewer', ctx.viewerText]];
  return [['pptx', ctx.pptxText], ['viewer', ctx.viewerText]];
}

function parseNum(s: string): number {
  return Number(s.replace(/,/g, ''));
}

function finalize(base: Omit<FactResult, 'status' | 'stalePending'>, ok: boolean, strict: boolean): FactResult {
  if (ok) return { ...base, status: 'PASS', stalePending: base.pending ? true : undefined };
  return { ...base, status: base.pending && !strict ? 'PENDING' : 'FAIL' };
}

function mk(golden: string, kind: FactResult['kind'], f: Base, idx: number, fallbackWhere: Where): Omit<FactResult, 'status' | 'stalePending' | 'detail'> {
  return {
    golden, kind, id: f.id ?? `${kind}-${idx + 1}`, label: f.label,
    where: f.where ?? fallbackWhere, source: f.source, pending: f.pending,
  };
}

export function evaluateOracle(facts: ExpectedFacts, ctx: OracleContext, opts: { strict?: boolean } = {}): FactResult[] {
  const strict = !!opts.strict;
  const g = facts.golden;
  const out: FactResult[] = [];

  // must_contain / landmarks — anyOf 중 하나라도 있으면 통과 (where=both 는 양쪽 모두)
  const contain = (list: ContainFact[] | undefined, kind: 'must_contain' | 'landmark') => {
    (list ?? []).forEach((f, i) => {
      const base = mk(g, kind, f, i, kind === 'landmark' ? 'pptx' : 'both');
      const parts: string[] = [];
      let ok = true;
      for (const [name, text] of textsFor(base.where, ctx)) {
        const hit = f.anyOf.map(m => firstMatch(text, m)).find(Boolean);
        parts.push(`${name}:${hit ? `✓"${String(hit).slice(0, 30)}"` : '✗'}`);
        if (!hit) ok = false;
      }
      out.push(finalize({ ...base, detail: ok ? parts.join(' ') : `${parts.join(' ')} | 기대 ${f.anyOf.map(a => a.replace(/^re:/, '').replace(/\(\?<!\[[^\]]*\]\)|\(\?!\[[^\]]*\]\)/g, '')).join(' 또는 ').slice(0, 70)}` }, ok, strict));
    });
  };
  contain(facts.must_contain, 'must_contain');
  contain(facts.landmarks, 'landmark');

  // must_not_contain — 하나라도 있으면 실패
  (facts.must_not_contain ?? []).forEach((f, i) => {
    const base = mk(g, 'must_not_contain', f, i, 'both');
    const found: string[] = [];
    for (const [name, text] of textsFor(base.where, ctx)) {
      for (const m of f.anyOf) {
        const hit = firstMatch(text, m);
        if (hit) found.push(`${name}:"${String(hit).slice(0, 40)}"`);
      }
    }
    out.push(finalize({ ...base, detail: found.length ? `발견 ${found.slice(0, 4).join(', ')}` : '없음' }, found.length === 0, strict));
  });

  // must_not_be_dash — 원천에 값이 있는데 '-' 또는 행 누락
  (facts.must_not_be_dash ?? []).forEach((f, i) => {
    const base = mk(g, 'must_not_be_dash', f, i, 'pptx');
    const labelRe = new RegExp(f.labelRegex ?? f.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gu');
    const valueRe = new RegExp(f.regexNearLabel.replace(/^re:/, ''), 'u');
    const win = f.window ?? 40;
    let ok = true;
    const parts: string[] = [];
    for (const [name, text] of textsFor(base.where, ctx)) {
      let occ = 0, good = 0, dash = 0;
      for (const m of text.matchAll(labelRe)) {
        occ++;
        const tail = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + win);
        if (valueRe.test(tail)) good++;
        else if (/^[\s|*:]*[-–—]\s*(\n|\||$)/.test(tail)) dash++;
      }
      if (good > 0) parts.push(`${name}:✓`);
      else { ok = false; parts.push(`${name}:${occ === 0 ? '행 누락' : dash > 0 ? "'-' 표시" : '값 불일치'}(라벨 ${occ}회)`); }
    }
    out.push(finalize({ ...base, detail: parts.join(' ') }, ok, strict));
  });

  // numeric — 라벨 직후(15자 이내) 숫자+단위가 전부 기대값 허용오차 이내여야 함 (평↔㎡ 환산 허용, 1회 이상 필요)
  (facts.numeric ?? []).forEach((f, i) => {
    const base = mk(g, 'numeric', f, i, 'pptx');
    const labelRe = new RegExp(f.labelRegex ?? f.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gu');
    const unitRe = f.unit === '%' ? /^[^\d-]{0,15}?(\d[\d,]*(?:\.\d+)?)\s*%/u : /^[^\d-]{0,15}?(\d[\d,]*(?:\.\d+)?)\s*(㎡|평)/u;
    const tol = f.tolerancePct / 100;
    let ok = true;
    const parts: string[] = [];
    for (const [name, text] of textsFor(base.where, ctx)) {
      const seen: string[] = [];
      let bad = 0;
      for (const m of text.matchAll(labelRe)) {
        const tail = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 40);
        const u = tail.match(unitRe);
        if (!u) continue;
        let n = parseNum(u[1]);
        let unit = f.unit === '%' ? '%' : u[2];
        let exp = f.value;
        if (f.unit !== '%') {
          if (unit === '평' && f.unit === '㎡') exp = f.value / 3.305785;
          else if (unit === '㎡' && f.unit === '평') exp = f.value * 3.305785;
        }
        const within = Math.abs(n - exp) <= Math.max(Math.abs(exp) * tol, 0.051);
        seen.push(`${u[1]}${unit}${within ? '✓' : '✗'}`);
        if (!within) bad++;
      }
      if (seen.length === 0) { ok = false; parts.push(`${name}:수치 없음`); }
      else if (bad > 0) { ok = false; parts.push(`${name}:${seen.join(',')} (기대 ${f.value}${f.unit} ±${f.tolerancePct}%)`); }
      else parts.push(`${name}:${seen.join(',')}`);
    }
    out.push(finalize({ ...base, detail: parts.join(' ') }, ok, strict));
  });

  // tenants — 렌트롤 상호 그대로 (공백 무시)
  if (facts.tenants) {
    const t = facts.tenants;
    const base = mk(g, 'tenants', { ...t, label: t.label || '임차인 실명' }, 0, 'both');
    const missing: string[] = [];
    for (const [name, text] of textsFor(base.where, ctx)) {
      for (const n of t.names) if (!squash(text).includes(squash(n))) missing.push(`${name}:${n}`);
    }
    const total = t.names.length * textsFor(base.where, ctx).length;
    out.push(finalize({ ...base, detail: missing.length ? `누락 ${missing.length}/${total} — ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ' …' : ''}` : `전부 존재 (${total})` }, missing.length === 0, strict));
  }

  // duplicate — 서로 다른 슬라이드에 동일 문장 반복
  if (facts.duplicate_sentences) {
    const d = facts.duplicate_sentences;
    const base = mk(g, 'duplicate', { ...d, label: d.label || '슬라이드 간 동일 문장 중복' }, 0, 'pptx');
    const minLen = d.min_len ?? 28;
    const ignore = (d.ignore ?? []).map(s => new RegExp(s, 'u'));
    const seenIn = new Map<string, Set<number>>();
    ctx.slides.forEach((s, si) => {
      for (const raw of s.split('\n')) {
        const line = collapse(raw).trim();
        if (line.length < minLen || ignore.some(r => r.test(line))) continue;
        if (!seenIn.has(line)) seenIn.set(line, new Set());
        seenIn.get(line)!.add(si);
      }
    });
    const dups = [...seenIn.entries()].filter(([, set]) => set.size >= 2);
    out.push(finalize({ ...base, detail: dups.length ? `중복 ${dups.length}건: "${dups[0][0].slice(0, 50)}…" (슬라이드 ${[...dups[0][1]].map(x => x + 1).join(',')})` : '없음' }, dups.length === 0, strict));
  }

  // universal — 모든 골든 덱에 자동 적용되는 상용화 불변식 (U1~U6)
  const pushUniversal = (id: string, label: string, badHit: string | null) => {
    out.push(finalize({
      golden: g,
      id,
      kind: 'universal',
      label,
      where: 'pptx',
      detail: badHit ? `위반: ${badHit}` : '정상',
    }, !badHit, strict));
  };

  // U1: 스태킹 플랜 바 또는 렌트롤 층 열에 물리적 층 접두사 없이 단독 호실번호('101호') 표출 금지
  const u1Match = ctx.pptxText.match(/(?:^|\n)\s*(B?\d{3,4}호)\s*(?=\n|$)/u);
  pushUniversal('u1-no-unit-as-floor', 'U1: 층열/스태킹 바 단독 호실번호 금지', u1Match ? u1Match[1] : null);

  // U2: 공실 행 금액 열에 상동 부호('〃') 표출 금지
  const u2Match = ctx.pptxText.match(/\n\s*공실\s*\n(?:[^\n]*\n){0,6}\s*(〃)\s*\n/u);
  pushUniversal('u2-no-vacant-ditto', 'U2: 공실 행 상동(〃) 표기 금지', u2Match ? '공실 행 내 〃 발견' : null);

  // U3: 엑셀 날짜 시리얼 정수(45000~49999) 원문 노출 금지
  const u3Match = ctx.pptxText.match(/\b(4[5-9]\d{3}\s*기준|계약[^\n]{0,15}\b4[5-9]\d{3})/u);
  pushUniversal('u3-no-excel-serial-date', 'U3: 엑셀 날짜 시리얼 원문 노출 금지', u3Match ? u3Match[1] : null);

  // U4: 역명 노선 이중 접미사('보정역 수인분당선역') 금지
  const u4Match = ctx.pptxText.match(/([가-힣A-Za-z0-9]+역\s+[가-힣0-9]+(?:선|라인)역)/u);
  pushUniversal('u4-no-double-station-suffix', 'U4: 역명 노선 이중 역 접미사 금지', u4Match ? u4Match[1] : null);

  // U5: 물건 개요 슬라이드 내 층수·규모 중복 행 또는 사용승인일 4자리 연도 단독 표기 금지
  const overviewSlide = ctx.slides.find(s => /(?:^|\n)물건 개요(?:\n|$)/u.test(s)) ?? '';
  const hasBothFloorAndScale = /(?:^|\n)\s*층수\s*(?:\n|$)/u.test(overviewSlide) && /(?:^|\n)\s*규모\s*(?:\n|$)/u.test(overviewSlide);
  const bareYearApproval = overviewSlide.match(/(?:사용승인일|준공연도)\s*\n\s*(\d{4})\s*(?=\n|$)/u);
  pushUniversal(
    'u5-no-dup-floor-scale-or-bare-year',
    'U5: 물건개요 층수·규모 중복 및 사용승인일 연도단독 금지',
    hasBothFloorAndScale ? '층수+규모 동시 표출' : (bareYearApproval ? `사용승인일 ${bareYearApproval[1]} 단독 표출` : null),
  );

  // U6: 면적 소수점 3자리 이상('723.510㎡') 원문 표출 금지
  const u6Match = ctx.pptxText.match(/(\d[\d,]*\.\d{3,}\s*㎡)/u);
  pushUniversal('u6-no-three-decimal-area', 'U6: 면적 소수점 3자리 이상 표기 금지', u6Match ? u6Match[1] : null);

  return out;
}

/** 읽기 쉬운 골든 × 사실 표 (markdown). onlyNonPass 면 FAIL/PENDING 만 */
export function renderTable(all: FactResult[], opts: { onlyNonPass?: boolean } = {}): string {
  const icon = (r: FactResult) => r.status === 'PASS' ? (r.stalePending ? 'PASS*' : 'PASS') : r.status;
  const list = opts.onlyNonPass ? all.filter(r => r.status !== 'PASS') : all;
  const rows = list.map(r =>
    `| ${r.golden} | ${r.kind} | ${r.label}${r.where !== 'pptx' ? ` [${r.where}]` : ''} | ${icon(r)}${r.pending ? ` (${r.pending})` : ''} | ${r.detail.replace(/\|/g, '¦').replace(/\n/g, ' ').slice(0, 140)} |`);
  return ['| golden | 종류 | 사실 | 결과 | 상세 |', '|:--|:--|:--|:--|:--|', ...rows].join('\n');
}

/** 골든별 PASS/FAIL/PENDING 집계 표 */
export function renderSummary(all: FactResult[]): string {
  const goldens = [...new Set(all.map(r => r.golden))];
  const rows = goldens.map(g => {
    const s = summarize(all.filter(r => r.golden === g));
    return `| ${g} | ${s.pass} | ${s.fail} | ${s.pending} | ${s.stale} |`;
  });
  return ['| golden | PASS | FAIL | PENDING | PASS*(pending 태그 제거 후보) |', '|:--|--:|--:|--:|--:|', ...rows].join('\n');
}

export function summarize(all: FactResult[]): { pass: number; fail: number; pending: number; stale: number } {
  return {
    pass: all.filter(r => r.status === 'PASS').length,
    fail: all.filter(r => r.status === 'FAIL').length,
    pending: all.filter(r => r.status === 'PENDING').length,
    stale: all.filter(r => r.status === 'PASS' && r.stalePending).length,
  };
}
