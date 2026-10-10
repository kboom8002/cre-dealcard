#!/usr/bin/env node
/**
 * scripts/income-golden/build-review-kit.mjs — 중개인 검토 키트 생성 (계획 E / P4, 결정 1)
 *
 * 최신 오프라인 리렌더 산출물(e2e/golden-snapshots/out/income-igN-<variant>.*)로
 * 원본 작성 중개인에게 보낼 검토 패키지를 만든다. (생성은 오프라인 · 무료. --judge 일 때만 LLM 보조 채점 비용 발생)
 *
 *   npx tsx scripts/golden-snapshot/rerender.ts income          # 먼저 최신 코드로 리렌더
 *   node scripts/income-golden/build-review-kit.mjs [--sets ig1,ig2] [--variant corrected] [--judge] [--out docs/income-im/검토키트]
 *   (--judge 는 `node --env-file=.env.local` 로 실행해야 OPENAI_API_KEY 가 로드된다)
 *
 * 세트별 산출:
 *   <out>/<세트>/<세트>_Basic_IM_검토용.pptx   검토 대상 덱
 *   <out>/<세트>/slides/slideNN.jpg           슬라이드 이미지 (LibreOffice)
 *   <out>/<세트>/검토시트.md                   슬라이드별 체크 시트 + 시스템 확인 요청 항목 + 수정 요청 회신란
 *   <out>/<세트>/judge/judge.{json,md}        (--judge) LLM 보조 채점·원본 대비 커버리지
 * 공통: <out>/README.md (세트 인덱스 + 지표), 회신 양식은 검토시트 하단.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(`--${k}`);
const variant = arg('variant', 'corrected');
const outRoot = arg('out', 'docs/income-im/검토키트');
const wanted = arg('sets', 'ig1,ig2,ig3,ig4').split(',');
const OUT = 'e2e/golden-snapshots/out';
const DATA = 'docs/income-golden-data';

const setDirs = fs.readdirSync(DATA).filter((d) => /^ig\d/.test(d));
const SET_NAMES = {
  ig1: '당산동5가11-47', ig2: '쌍림동114', ig3: '창신동464-6', ig4: '양평동4가117',
};
const esc = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ');
const SKIP_TITLES = new Set([]);

function slideTitle(text, i) {
  if (i === 0) return '표지';
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // 형식: "02\n요약\n본문…" — 번호 줄 다음 줄이 제목
  const t = /^\d{1,2}$/.test(lines[0] ?? '') ? lines[1] : lines[0];
  return (t ?? `슬라이드 ${i + 1}`).slice(0, 30);
}
function excerpt(text) {
  const all = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const body = all.slice(/^\d{1,2}$/.test(all[0] ?? '') ? 2 : 1);
  const cut = body.findIndex((l) => /^CREDEAL\s*·|^CRE DEAL/.test(l));   // 푸터(생성 정보) 이하 제외
  return (cut >= 0 ? body.slice(0, cut) : body).join(' · ').slice(0, 150);
}

const CHECKS_BY_TITLE = [
  [/표지|cover/i, ['물건명·주소 표기', '담당자·회사명·로고']],
  [/요약/, ['매매가·면적·층수 수치', '수익률(Cap Rate/임대수익률) 정의·가정', '공실 현황 문구', '핵심 투자 포인트 3개가 사실인가']],
  [/투자 포인트|제안/, ['입력하신 포인트가 그대로 반영되었는가', '과장·확정 표현이 없는가']],
  [/개요/, ['소재지·대지/연면적·층수·사용승인일', '주차·승강기 대수', '용도지역·건폐율·용적률(대장 현황 기준)']],
  [/입지|교통/, ['최근접 역·도보 거리', '주요 시설(랜드마크) 명칭·거리', '입지 설명이 실제와 맞는가']],
  [/토지|지적/, ['지목·대지면적·공시지가', '지적도 이미지 위치·가독성']],
  [/도면/, ['도면(지구단위계획도·평면도)이 맞는 층·구역인가', '글자·범례 가독성']],
  [/규제|계획/, ['지구단위계획·개발행위허가제한 내용', '근거·기한 표기']],
  [/렌트롤|임대/, ['호실별 임차인(상호)·용도·면적', '보증금·월임대료·관리비 금액', '합계가 맞는가', '만기일·갱신 정보', '공실/자가사용 구분']],
  [/수익률|수익/, ['임대수익률/NOI 산식과 가정(운영비율·공실충당)', '안정화 수익률 근거', '토지가치 지표']],
  [/시세/, ['비교 사례의 소재지·가격·기준일', '본건 환산 토지평당가']],
  [/사진|현장/, ['사진이 해당 물건이 맞는가', '촬영 구도·누락 사진']],
  [/문의|연락|contact/i, ['담당자 연락처', '면책 문구']],
];
const checksFor = (title) => (CHECKS_BY_TITLE.find(([re]) => re.test(title)) ?? [null, ['내용 정확성', '누락 정보']])[1];

fs.mkdirSync(outRoot, { recursive: true });
const index = [];
for (const key of wanted) {
  const dir = setDirs.find((d) => d.startsWith(`${key}-`));
  if (!dir) { console.log(`⏭ ${key}: 골든 데이터 폴더 없음`); continue; }
  const name = `income-${key}-${variant}`;
  const pptx = path.join(OUT, `${name}.pptx`);
  const sj = path.join(OUT, `${name}.slides.json`);
  if (!fs.existsSync(pptx) || !fs.existsSync(sj)) { console.log(`⏭ ${key}: 리렌더 산출물 없음 (rerender.ts income 먼저)`); continue; }
  const label = SET_NAMES[key] ?? key;
  const setOut = path.join(outRoot, label);
  fs.mkdirSync(path.join(setOut, 'slides'), { recursive: true });
  fs.copyFileSync(pptx, path.join(setOut, `${label}_Basic_IM_검토용.pptx`));
  const data = JSON.parse(fs.readFileSync(sj, 'utf8'));
  const slides = Array.isArray(data.slides) ? data.slides : Object.values(data.slides);

  // 슬라이드 이미지 (LibreOffice → PDF → JPEG)
  execFileSync('python', ['-X', 'utf8', 'scripts/income-golden/render_original_slides.py', pptx, path.join(setOut, 'slides'), '110'], { stdio: 'ignore' });
  const deckTextFile = path.join(setOut, 'deck-text.txt');
  fs.writeFileSync(deckTextFile, slides.map((t, i) => `## 슬라이드 ${i + 1}\n${t}`).join('\n\n'), 'utf8');

  // 시스템 경고(중개인 확인 요청) — AREA-RECONCILE / LEASE-RECONCILE 등. 내부 렌더 측정 감사(G32 DPI·G33 넘침 추정·G34 겹침 추정)는 중개인 검토 대상이 아니므로 제외
  const INTERNAL_AUDIT = /\[AUDIT\]\s*G3[2-7]\b/;
  const warns = (data.warnings ?? []).map((w) => (typeof w === 'string' ? w : w?.message ?? JSON.stringify(w))).filter((w) => !INTERNAL_AUDIT.test(w));

  // LLM 보조 채점 (--judge 일 때 실행, 없으면 기존 judge.json 재사용)
  const jOut = path.join(setOut, 'judge');
  if (has('judge')) {
    const refFile = path.join(DATA, dir, 'reference', 'source_extract.md');
    execFileSync('node', ['scripts/income-golden/judge-deck.mjs', '--slides', path.join(setOut, 'slides'), '--text', deckTextFile,
      ...(fs.existsSync(refFile) ? ['--reference', refFile] : []), '--out', jOut, '--label', `${key}-${variant}`], { stdio: 'inherit' });
  }
  const jFile = path.join(jOut, 'judge.json');
  const j = fs.existsSync(jFile) ? JSON.parse(fs.readFileSync(jFile, 'utf8')) : null;
  let judgeNote = '-';
  if (j) {
    const avg = (k) => { const xs = (j.rubric.slides ?? []).map((s) => Number(s[k])).filter(Number.isFinite); return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '-'; };
    judgeNote = `내용 ${avg('content_fit')} / 정합 ${avg('consistency')} / 지면 ${avg('visual')} · 커버리지 ${j.coverage?.coverage_pct ?? '-'}% · 토큰 ${j.usage.prompt_tokens}+${j.usage.completion_tokens}`;
  }
  // 원본 IM 과 값이 다른 수치 항목 — 중개인이 어느 쪽이 맞는지 확인 (제목·날짜·법인·주소 표기 차이·N/A 는 제외)
  const NOISE_ELEMENT = /날짜|법인|제목|Title|Images|Photos|Status|Plan|주소|Address/i;
  const mismatches = (j?.coverage?.elements ?? []).filter((e) => e.value_mismatch && String(e.value_mismatch).includes('/')
    && !/^\.\.\.|N\/A/.test(String(e.value_mismatch)) && /\d/.test(String(e.value_mismatch)) && !NOISE_ELEMENT.test(String(e.element)));

  const md = [];
  md.push(`# ${label} — Basic IM 검토 시트`, '',
    `> 자동 생성 초안입니다. 아래 항목을 확인해 **틀린 곳·빠진 곳·고치고 싶은 문구**를 회신란에 적어 주세요. (PPTX: \`${label}_Basic_IM_검토용.pptx\` / 슬라이드 이미지: \`slides/\`)`,
    `> 생성 기준: 입력하신 메모·바텀시트 + 공공 데이터(건축물대장·토지대장·공시지가). 공공 데이터와 다른 입력은 **공공 데이터 기준**으로 표기합니다.`,
    `> 표지·문의 면의 회사명·담당자·연락처는 **테스트 계정 값**입니다. 실제 발송본에는 로그인한 중개사 정보가 들어갑니다.`, '');
  if (warns.length) {
    md.push('## 시스템이 확인을 요청하는 항목', '', ...warns.map((w) => `- [ ] ${esc(w.replace(/^\[AUDIT\]\s*/, ''))} — 확인 ✔ / 의견: ________`), '');
  }
  if (mismatches.length) {
    md.push('## 원본 IM 과 값이 다른 항목 (어느 쪽이 맞는지 확인)', '',
      '> 원본 IM 의 값과 이번 생성본의 값이 다릅니다. 공공 데이터(대장) 또는 임대차 표 합계 기준으로 표기된 경우가 많습니다. 맞는 값에 ✔ 해 주세요.', '',
      '| 항목 | 원본 / 생성 | 원본이 맞음 | 생성이 맞음 | 메모 |', '|---|---|---|---|---|',
      ...mismatches.map((e) => `| ${esc(e.element)} | ${esc(e.value_mismatch)} |  |  | ${esc(e.note)} |`), '');
  }
  md.push('## 슬라이드별 체크', '', '| # | 슬라이드 | 요약 | 확인 항목 | 결과 (○/△/×) | 수정 요청 |', '|---|---|---|---|---|---|');
  slides.forEach((t, i) => {
    const title = slideTitle(t, i);
    if (SKIP_TITLES.has(title)) return;
    md.push(`| ${i + 1} | ${esc(title)} | ${esc(excerpt(t))} | ${checksFor(title).map(esc).join('<br>')} |  |  |`);
  });
  md.push('', '## 전체 의견', '',
    '1. 원본 IM에 있었는데 빠진 정보(예: 위치도, 도면, 임대료 인상 계획, 부가수익):',
    '2. 그대로 고객에게 보낼 수 있는 수준인가 (예 / 일부 수정 후 / 불가) 와 이유:',
    '3. 가장 먼저 고쳤으면 하는 3가지:', '');
  fs.writeFileSync(path.join(setOut, '검토시트.md'), md.join('\n'), 'utf8');

  index.push({ label, slides: slides.length, warns: warns.length, judge: judgeNote });
  console.log(`✅ ${label}: ${slides.length}면, 경고 ${warns.length}건 → ${setOut}`);
}

const readme = ['# 중개인 검토 키트 (Basic IM · 수익형)', '',
  `> 생성 ${new Date().toISOString().slice(0, 10)} · 변형 \`${variant}\` · 자동 생성 초안 — 각 폴더의 \`검토시트.md\` 에 회신해 주세요.`, '',
  '| 세트 | 슬라이드 | 시스템 확인 요청 | LLM 보조 지표(참고용) |', '|---|---|---|---|',
  ...index.map((r) => `| ${r.label} | ${r.slides} | ${r.warns} | ${esc(r.judge)} |`), '',
  '회신된 수정 요청은 결함 백로그(`im_commercial_test_plan.md`)에 연결하고, 사실 관련 항목은 정답 키(expected_facts)에 반영합니다.', ''];
fs.writeFileSync(path.join(outRoot, 'README.md'), readme.join('\n'), 'utf8');
console.log(`README → ${path.join(outRoot, 'README.md')}`);
