#!/usr/bin/env node
/**
 * IM 덱 LLM 보조 채점기 (2026-10-10 결정: 루브릭 보조 채점에 LLM 사용 — 합격 판정에는 쓰지 않음)
 *
 * 사용:
 *   node --env-file=.env.local scripts/income-golden/judge-deck.mjs \
 *     --slides <slideNN.jpg 폴더> --text <pptx-full-text.txt> [--reference <source_extract.md>] --out <출력 폴더> [--label ig1-corrected]
 *
 * 출력: <out>/judge.json, <out>/judge.md
 *  1) rubric   : 슬라이드별 3축 점수(1~5) — 내용 적합성 / 전체 정합성 / 지면 품질 + 근거 있는 이슈 목록
 *  2) coverage : (reference 있을 때) 원본 중개인 IM 요소별 충족/부분/미구현 판정
 * 모델: JUDGE_MODEL (기본 gpt-4o), temperature 0, JSON 응답. 비용 실측을 위해 usage 를 함께 기록한다.
 */
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const slidesDir = arg('slides');
const textFile = arg('text');
const refFile = arg('reference');
const outDir = arg('out');
const label = arg('label', path.basename(outDir ?? 'deck'));
const model = process.env.JUDGE_MODEL || 'gpt-4o';
if (!slidesDir || !textFile || !outDir) {
  console.error('usage: judge-deck.mjs --slides <dir> --text <file> [--reference <md>] --out <dir> [--label name]');
  process.exit(2);
}
const key = process.env.OPENAI_API_KEY;
if (!key) { console.error('OPENAI_API_KEY 미설정'); process.exit(2); }

const slides = fs.readdirSync(slidesDir).filter((f) => /^slide\d+\.(jpe?g|png)$/i.test(f)).sort();
const deckText = fs.readFileSync(textFile, 'utf8');
const reference = refFile && fs.existsSync(refFile) ? fs.readFileSync(refFile, 'utf8') : null;
fs.mkdirSync(outDir, { recursive: true });

const usage = { prompt_tokens: 0, completion_tokens: 0 };
async function chat(messages) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0, response_format: { type: 'json_object' }, messages }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  usage.prompt_tokens += j.usage?.prompt_tokens ?? 0;
  usage.completion_tokens += j.usage?.completion_tokens ?? 0;
  return JSON.parse(j.choices[0].message.content);
}

const RUBRIC = `당신은 한국 상업용 부동산(CRE) 매각 IM을 20년간 작성·검수한 까다로운 시니어 중개인입니다.
아래 생성된 Basic IM 덱(슬라이드 이미지 + 전체 텍스트)을 "원본 작성 중개인이 고객에게 그대로 발송할 수 있는가" 기준으로 엄격히 채점하세요.

[점수 기준 — 반드시 이 앵커를 따를 것]
5 = 수정할 점이 전혀 없음 (드묾. 자동 생성 초안에서 5는 예외적이어야 함)
4 = 사소한 다듬기만 필요 (minor 이슈만 존재)
3 = 발송 전 수정 필요 (major 이슈 1개 이상)
2 = 상당 부분 재작성 필요
1 = 사용 불가 (critical 이슈 — 사실 오류·오해 유발)
→ major 이슈가 있으면 해당 축은 3 이하, critical 이 있으면 2 이하.

[축]
- content_fit (내용 적합성): 슬라이드 목적에 맞는 핵심 정보·수치·근거가 있는가, 근거 없는 평가·상투 문구, 테스트/플레이스홀더 값(예: '0000', 'E2E', '010-0000-0000')
- consistency (전체 정합성): 같은 지표(연면적·면적·금액·수익률·공실)가 슬라이드마다 같은 값·같은 정밀도·같은 라벨인가, 합계=행 합인가, 단위 일관성
- visual (지면 품질): 잘림·넘침·겹침, 과도한 빈 여백(지면의 1/3 이상 비어 있음), 값이 모두 '-'인 열·행, 정렬·위계·가독성, 중복 표기(같은 정보가 같은 면에 두 번)

[반드시 점검할 체크리스트 — 해당되면 이슈로 기록]
1) 슬라이드 간 수치·정밀도 불일치 (예: 1,441.15㎡ vs 1,441.2㎡)
2) 표 합계/비율 계산 오류
3) 같은 면 안의 정보 중복 (표와 콜아웃이 같은 내용 반복)
4) 큰 빈 여백, 한쪽으로 쏠린 레이아웃
5) 근거 없는 평가 문구 ('우수', '잠재력', '양호' 등 수치 근거 없이)
6) 테스트·더미·플레이스홀더 값 노출
7) 출처·기준일 표기 누락 (수익률 가정, 시세 자료)
8) 투자자가 반드시 찾는 정보의 부재 (해당 면 목적 기준)

[규칙]
- 모든 이슈의 evidence 는 슬라이드에 실제로 있는 문구/수치를 따옴표로 그대로 인용. 인용할 수 없으면 이슈를 만들지 말 것.
- consistency 이슈는 서로 충돌하는 두 값을 모두 인용 (예: "\\"1,441.15㎡\\" (4면) vs \\"1,441.2\\" (8면)"). 충돌 상대가 없으면 이슈 아님. '~가능성', '~수 있음' 같은 추측성 이슈 금지.
- 다음은 테스트 환경의 중개인 프로필 값이므로 이슈에서 제외: 'E2E 테스트 …', 'CREDEAL · 0000', '010-0000-0000', 'e2e-playwright@…', 등록번호 '11560-2026-00001', 생성일 표기.
- '중개인입력', '중개인 제공 · 미검증' 같은 출처 표기는 의도된 기능이므로 이슈 아님.
- 여러 면에 공통인 문제는 슬라이드마다 반복하지 말고 deck.global_issues 에 1회만 기록.
- severity: "critical" | "major" | "minor",  axis: 이슈가 속한 축 "content_fit" | "consistency" | "visual"
- 한국어로 간결하게.
JSON 스키마: {"slides":[{"index":1,"title":"...","content_fit":n,"consistency":n,"visual":n,"issues":[{"axis":"...","severity":"...","evidence":"\\"인용\\"","problem":"...","suggestion":"..."}]}],"deck":{"overall":n,"strengths":["..."],"global_issues":[{"axis":"...","severity":"...","evidence":"...","problem":"..."}],"top_fixes":["..."]}}`;

const COVERAGE = `당신은 CRE 매각 IM 검수자입니다. [원본 중개인 IM 추출]을 기준으로 [생성 IM 텍스트]의 충족도를 판정하세요.
1) 원본의 정보 요소를 "세부 요소" 단위로 목록화하세요. 예: '임대료 현실화 방안'은 (a) 층별 목표 보증금·월세 표, (b) 임대 전환 대상(자가사용분), (c) 기존 임차인 인상 계획, (d) 기대수익률 수치 로 나눕니다. 표·지도·사진·문구·수치를 각각 요소로 봅니다.
2) 각 요소의 status: "covered"(동등 이상) | "partial"(일부 누락/약함) | "missing"(없음) | "input_gap"(생성 파이프라인에 해당 입력 경로가 없어 불가하다고 판단될 때만 — note 에 근거)
3) 생성 텍스트 전체를 꼼꼼히 검색한 뒤 판정하세요 (예: 연락처·담당자·전화번호는 마지막 면에 있을 수 있음). generated_evidence 에는 생성 텍스트의 실제 문구를 인용.
4) 수치가 있는 요소는 원본값과 생성값을 비교해 value_mismatch 에 "원본 X / 생성 Y" 로 기록. 원본이 틀렸을 가능성(공부·합계와 불일치 등)이 보이면 note 에 기록.
JSON 스키마: {"elements":[{"element":"...","original_slide":n,"status":"...","generated_evidence":"...","value_mismatch":"...","note":"..."}]}`;

// 결정적 후처리: 근거 인용 없는 이슈 제거 → 이슈 axis·severity 로 해당 축 점수 캡(앵커 강제). 원점수는 *_raw 로 보존.
function postProcessRubric(r) {
  const cap = { critical: 2, major: 3, minor: 4 };
  const AXES = ['content_fit', 'consistency', 'visual'];
  for (const s of r.slides ?? []) {
    const TEST_PROFILE = /(E2E\s*테스트|CREDEAL\s*·\s*0000|010-0000-0000|e2e-playwright|11560-2026-00001)/;
    const SPECULATIVE = /(가능성|수 있음|수 있습니다|불명확할 수)/;
    s.issues = (s.issues ?? []).filter((i) =>
      typeof i.evidence === 'string' && i.evidence.replace(/["'“”\s]/g, '').length >= 2
      && !TEST_PROFILE.test(i.evidence) && !SPECULATIVE.test(i.problem ?? ''));
    for (const k of AXES) {
      const limit = s.issues.filter((i) => i.axis === k).reduce((m, i) => Math.min(m, cap[i.severity] ?? 5), 5);
      const n = Number(s[k]);
      if (Number.isFinite(n) && n > limit) { s[`${k}_raw`] = n; s[k] = limit; }
    }
  }
  return r;
}
function coveragePct(c) {
  const els = c?.elements ?? [];
  if (els.length === 0) return null;
  const score = els.reduce((a, e) => a + (e.status === 'covered' ? 1 : e.status === 'partial' ? 0.5 : 0), 0);
  return Math.round((score / els.length) * 1000) / 10;
}

const imageParts = slides.map((f) => ({
  type: 'image_url',
  image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(path.join(slidesDir, f)).toString('base64')}`, detail: 'high' },
}));

console.log(`[judge] ${label}: ${slides.length} slides, model=${model}`);
const rubric = postProcessRubric(await chat([
  { role: 'system', content: RUBRIC },
  { role: 'user', content: [{ type: 'text', text: `[전체 텍스트]\n${deckText.slice(0, 30000)}` }, ...imageParts] },
]));

let coverage = null;
if (reference) {
  coverage = await chat([
    { role: 'system', content: COVERAGE },
    { role: 'user', content: `[원본 중개인 IM 추출]\n${reference.slice(0, 30000)}\n\n[생성 IM 텍스트]\n${deckText.slice(0, 30000)}` },
  ]);
  coverage.coverage_pct = coveragePct(coverage);
}

const result = { label, model, judgedAt: new Date().toISOString(), usage, rubric, coverage };
fs.writeFileSync(path.join(outDir, 'judge.json'), JSON.stringify(result, null, 2));

// ── markdown 리포트 ──
const avg = (k) => {
  const xs = (rubric.slides ?? []).map((s) => Number(s[k])).filter(Number.isFinite);
  return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '-';
};
const esc = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
const lines = [];
lines.push(`# LLM 보조 채점 — ${label}`, '', `> 모델 ${model} · 토큰 ${usage.prompt_tokens}+${usage.completion_tokens} · ${result.judgedAt}`, '> 보조 지표입니다. 합격 판정은 결정적 오라클/골든 단언이 담당합니다. 점수는 이슈 심각도로 축별 캡 적용(원점수 judge.json *_raw).', '');
lines.push('| 축 | 평균 |', '|---|---|', `| 내용 적합성 | ${avg('content_fit')} |`, `| 전체 정합성 | ${avg('consistency')} |`, `| 지면 품질 | ${avg('visual')} |`, `| 종합(덱, LLM) | ${rubric.deck?.overall ?? '-'} |`, '');
lines.push('## 슬라이드별', '', '| # | 제목 | 내용 | 정합 | 지면 | 이슈 (근거) |', '|---|---|---|---|---|---|');
for (const s of rubric.slides ?? []) {
  const iss = (s.issues ?? []).map((i) => `[${i.severity}/${i.axis ?? '?'}] ${esc(i.problem)} — ${esc(i.evidence)}`).join('<br>') || '-';
  lines.push(`| ${s.index} | ${esc(s.title)} | ${s.content_fit} | ${s.consistency} | ${s.visual} | ${iss} |`);
}
lines.push('', '## 덱 공통 이슈', ...((rubric.deck?.global_issues ?? []).map((i) => `- [${i.severity}/${i.axis ?? '?'}] ${esc(i.problem)} — ${esc(i.evidence)}`)));
lines.push('', '## 상위 수정 제안', ...(rubric.deck?.top_fixes ?? []).map((t) => `- ${t}`));
if (coverage) {
  lines.push('', `## 원본 IM 대비 커버리지 — ${coverage.coverage_pct ?? '-'}%`, '', '| 요소 | 원본 면 | 상태 | 생성 근거 | 값 불일치 | 비고 |', '|---|---|---|---|---|---|');
  for (const e of coverage.elements ?? []) {
    lines.push(`| ${esc(e.element)} | ${e.original_slide ?? ''} | ${e.status} | ${esc(e.generated_evidence)} | ${esc(e.value_mismatch)} | ${esc(e.note)} |`);
  }
}
fs.writeFileSync(path.join(outDir, 'judge.md'), lines.join('\n'));
console.log(`[judge] done → ${path.join(outDir, 'judge.md')} (tokens ${usage.prompt_tokens}+${usage.completion_tokens})`);
