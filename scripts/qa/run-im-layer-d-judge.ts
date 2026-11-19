/**
 * @file scripts/qa/run-im-layer-d-judge.ts
 * @description Layer D (PPGT-Loop R3): Anti-Sycophancy Multimodal Vision + Span-Grounded UX Judge.
 *   1) Stage D1 (Pre-Gate): Negative Control NC-01-R3 must score <= 2.9 with floorRisk=true.
 *   2) Stage D2 (1-Shot): Evaluates 10 Web UI screenshots + DOM evidence AND 8 PPTX slides across 5 postures.
 *   3) Stage D3: Programmatically verifies span grounding (groundedRatio >= 0.5), enforces "[SIMULATED] "
 *      prefix, blends 0.70*R2 + 0.30*R3 (preserving <=2.85 floor cap), tracks token/USD cost, and
 *      updates IM_HUMAN_REVIEW_PACKET.md (+ docs/finaltest/IM_HUMAN_REVIEW_PACKET.md).
 *
 * Fail-Loud Policy: Never fabricates scores or silently switches models on API errors.
 * Usage: npx tsx --env-file=.env.local scripts/qa/run-im-layer-d-judge.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PPGT_ALL_AXES,
  formatSimulatedReaction,
  type ImPpgtPersonaId,
  type PpgtAxisId,
  type RemediationTrack,
} from '../../src/lib/qa/im-ppgt-personas';
import { extractSlideTexts } from '../../src/assurance/im-harness/golden-test-utils';

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'e2e', 'golden-snapshots', 'out');
const PPGT_DIR = path.join(OUT_DIR, 'im-ppgt');
const VISUAL_CUR_DIR = path.join(OUT_DIR, 'visual-current');
const VISUAL_REPORT_PATH = path.join(OUT_DIR, 'visual-report.json');
const BASELINE_JSON_PATH = path.join(PPGT_DIR, 'sprint1-baseline.json');
const REVIEW_PACKET_OUT_PATH = path.join(PPGT_DIR, 'IM_HUMAN_REVIEW_PACKET.md');
const REVIEW_PACKET_DOCS_PATH = path.join(ROOT, 'docs', 'finaltest', 'IM_HUMAN_REVIEW_PACKET.md');

const MODEL = process.env.IM_LAYER_D_MODEL || 'gpt-4o';

const UI_SCREENSHOTS: ReadonlyArray<{ file: string; label: string; detail: 'low' | 'high' }> = [
  { file: 'p01_im_workspace_1440_normal.png', label: '/broker/w/im#specs (1440 normal)', detail: 'low' },
  { file: 'p01b_im_tab2_rentroll_1440.png', label: '/broker/w/im#rentroll (1440 normal)', detail: 'low' },
  { file: 'p01c_im_tab3_axios_1440.png', label: '/broker/w/im#axios_brief (1440 normal)', detail: 'low' },
  { file: 'p01d_im_tab4_media_1440.png', label: '/broker/w/im#media_publish (1440 normal)', detail: 'low' },
  { file: 'p01_im_workspace_1440_xlarge.png', label: '/broker/w/im#specs (1440 xlarge 21px)', detail: 'high' },
  { file: 'p02_im_studio_1180.png', label: '/broker/basic-im-studio (1180x820)', detail: 'low' },
  { file: 'p02_im_studio_390.png', label: '/broker/basic-im-studio (390x844 mobile)', detail: 'high' },
  { file: 'p04a_im_lite_390_normal.png', label: '/im-lite (390 normal)', detail: 'low' },
  { file: 'p04b_im_lite_390_xlarge.png', label: '/im-lite (390 xlarge 21px)', detail: 'high' },
  { file: 'p04c_im_lite_360_normal.png', label: '/im-lite (360 normal)', detail: 'low' },
];

const PPTX_SAMPLE_SLIDES: ReadonlyArray<{ deck: string; posture: string; slideNum: number; fileName: string }> = [
  { deck: 'income-wellbing-r3', posture: '임대수익형 (Income)', slideNum: 6, fileName: 'slide-06.png' },
  { deck: 'income-wellbing-r3', posture: '임대수익형 (Income)', slideNum: 7, fileName: 'slide-07.png' },
  { deck: 'income-wellbing-r3', posture: '임대수익형 (Income)', slideNum: 8, fileName: 'slide-08.png' },
  { deck: 'owner-seocho-r3', posture: '사옥형 (Owner)', slideNum: 1, fileName: 'slide-01.png' },
  { deck: 'owner-seocho-r3', posture: '사옥형 (Owner)', slideNum: 6, fileName: 'slide-06.png' },
  { deck: 'trading-sinsa-r3', posture: '매매차익/밸류애드 (Trading)', slideNum: 6, fileName: 'slide-06.png' },
  { deck: 'development-jamwon-r3', posture: '신축/개발형 (Development)', slideNum: 5, fileName: 'slide-05.png' },
  { deck: 'operating-hotel-r2', posture: '운영자산/호텔형 (Operating)', slideNum: 5, fileName: 'slide-05.png' },
];

interface ChatMessagePart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail: 'low' | 'high' };
}

interface UsageAccumulator {
  promptTokens: number;
  completionTokens: number;
  calls: number;
}

interface NegativeControlJudgeOutput {
  overallScore: number;
  floorRisk: boolean;
  floorReason: string;
  detectedIssues: Array<{
    evidenceSpan: string;
    problem: string;
    severity: 'critical' | 'major' | 'minor';
  }>;
  reaction: string;
}

interface PersonaUiEvalRaw {
  personaId: ImPpgtPersonaId;
  axes: Record<PpgtAxisId, number>;
  overallScore: number;
  floorRisk: boolean;
  floorReason: string;
  reaction: string;
  delightEvidenceSpan: string;
  frictionEvidenceSpan: string;
}

interface JudgeIssueRaw {
  surface: string;
  severity: 'critical' | 'major' | 'minor';
  track: RemediationTrack;
  targetFileHint: string;
  evidenceSpan: string;
  problem: string;
  suggestion: string;
}

interface UiJudgeOutput {
  personas: PersonaUiEvalRaw[];
  issues: JudgeIssueRaw[];
}

interface SlidePptxEvalRaw {
  deck: string;
  posture: string;
  slideNum: number;
  visualScore: number;
  writingScore: number;
  domainTrustScore: number;
  delightEvidenceSpan: string;
  frictionEvidenceSpan: string;
  issues: Array<{
    severity: 'critical' | 'major' | 'minor';
    track: RemediationTrack;
    evidenceSpan: string;
    problem: string;
    suggestion: string;
  }>;
}

interface PptxJudgeOutput {
  slides: SlidePptxEvalRaw[];
  overallPptxScore: number;
  floorRisk: boolean;
  overallReaction: string;
  topTrack1Fixes: string[];
  topTrack2Fixes: string[];
}

interface BaselineRunRecord {
  personaId: ImPpgtPersonaId;
  surface: string;
  weightedOverall: number;
  floorRisk: boolean;
  floorReasons: string[];
  observedHeadings?: string[];
  observedButtons?: string[];
  observedBadges?: string[];
}

interface BaselinePayload {
  generatedAt: string;
  scoreResults: BaselineRunRecord[];
  tabDiagnostics: Array<{
    tab: string;
    aboveFoldActionCount: number;
    totalVisibleInteractiveCount: number;
    sub44ButtonsCount: number;
    sub14TextsCount: number;
    clippedButtonsCount: number;
    sidebarEllipsisCount?: number;
  }>;
  clippedButtonDetails: Array<{ surface: string; viewport: string; fontScale: string; buttons: unknown[] }>;
  skippedProbes: Array<{ personaId: string; surface: string; reason: string }>;
  backlog: Array<{
    tier: string;
    issueKey: string;
    track: string;
    pScore: number;
    targetFileHint: string;
    summaries: string[];
  }>;
}

function normalizeForGrounding(text: string): string {
  return text
    .replace(/["'“”‘’`\[\]()]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function isSpanGrounded(span: string | undefined, corpus: string): boolean {
  const clean = normalizeForGrounding(span || '');
  if (clean.length < 3 || /^(none|없음|n\/a|-)$/i.test(clean)) return false;
  return normalizeForGrounding(corpus).includes(clean);
}

function encodePngBase64(absPath: string): string {
  if (!fs.existsSync(absPath)) {
    throw new Error(`Missing required PNG artifact for Layer D vision check: ${absPath}`);
  }
  return `data:image/png;base64,${fs.readFileSync(absPath).toString('base64')}`;
}

async function callOpenAiJson<T>(
  apiKey: string,
  messages: Array<{ role: 'system' | 'user'; content: string | ChatMessagePart[] }>,
  usage: UsageAccumulator,
  stageLabel: string
): Promise<T> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
      messages,
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`[Layer D FAIL-LOUD] ${stageLabel} HTTP ${res.status}: ${bodyText.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    choices?: Array<{ message?: { content?: string } }>;
  };

  usage.promptTokens += json.usage?.prompt_tokens ?? 0;
  usage.completionTokens += json.usage?.completion_tokens ?? 0;
  usage.calls += 1;

  const rawContent = json.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error(`[Layer D FAIL-LOUD] ${stageLabel} returned empty message content`);
  }
  return JSON.parse(rawContent) as T;
}

function estimateCostUsd(promptTokens: number, completionTokens: number): number {
  // Reference rate: gpt-4o $2.50 / 1M input tokens, $10.00 / 1M output tokens
  const usd = (promptTokens / 1_000_000) * 2.5 + (completionTokens / 1_000_000) * 10.0;
  return Math.round(usd * 10_000) / 10_000;
}

const JUDGE_SYSTEM_PROMPT = `당신은 한국 상업용 부동산(CRE) 매각 투자설명서(IM)와 60대 시니어 공인중개사·기관 투자심사역 관점의 UI/UX 및 문서 품질을 20년간 감사해 온 엄격한 품질 감사관입니다.
아첨 금지(Anti-Sycophancy): 치명적 결함(오버플로우, <44px 버튼, 개발자/외래어 용어 노출, 회피 문구, 깨진 이미지, 원시 DB 에러, 허위 수치)이 있으면 다른 항목이 좋아도 반드시 floorRisk=true 와 overallScore <= 2.9 를 부여하세요.
모든 칭찬(delightEvidenceSpan)과 지적(frictionEvidenceSpan / evidenceSpan)은 제공된 실제 DOM 텍스트·슬라이드 텍스트 또는 이미지 안의 실제 문구/라벨 원문을 따옴표 없이 그대로 인용하세요. 추측이나 존재하지 않는 문구를 지어내지 마세요.
모든 페르소나 코멘트(reaction)는 반드시 "[SIMULATED] " 로 시작하세요.
반드시 유효한 JSON 객체로만 응답하세요.`;

async function runNegativeControlGate(
  apiKey: string,
  usage: UsageAccumulator
): Promise<NegativeControlJudgeOutput> {
  const sabotagedPayload = {
    controlId: 'NC-01-R3',
    surface: '/broker/w/im + /im-lite/sample',
    metrics: {
      horizontalOverflowPx: 42,
      brokenImgCount: 2,
      sub44ButtonsCount: 4,
      aboveFoldActionCount: 54,
    },
    observedText: [
      '① 투자 포스처 선택',
      '바텀시트에서 주소 검색 필요',
      '렌트롤 세부 내역은 현장 실사 확인 필요',
      'Error: PGRST204 column not found in schema cache',
      '문의하기 버튼 크기 32px, 가로 스크롤 42px 발생',
    ],
  };

  const result = await callOpenAiJson<NegativeControlJudgeOutput>(
    apiKey,
    [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `아래 음성 대조군(의도적으로 결함을 심은 샘플)을 감사하세요.\n` +
          `${JSON.stringify(sabotagedPayload, null, 2)}\n\n` +
          `JSON 스키마: {"overallScore": number(1.0~5.0), "floorRisk": boolean, "floorReason": string, "detectedIssues": [{"evidenceSpan": string, "problem": string, "severity": "critical"|"major"|"minor"}], "reaction": "[SIMULATED] ..."}`,
      },
    ],
    usage,
    'Stage D1 (NC-01-R3)'
  );

  if (
    typeof result.overallScore !== 'number' ||
    result.overallScore > 2.9 ||
    result.floorRisk !== true
  ) {
    throw new Error(
      `[Layer D ABORT — SYCOPHANTIC JUDGE] NC-01-R3 failed anti-sycophancy gate: ` +
        `overallScore=${result.overallScore} (expected <=2.9), floorRisk=${result.floorRisk} (expected true)`
    );
  }

  return result;
}

async function runUiVisionAudit(
  apiKey: string,
  baseline: BaselinePayload,
  usage: UsageAccumulator
): Promise<{ output: UiJudgeOutput; groundingCorpus: string }> {
  const observedTokens = new Set<string>();
  const domDigest = baseline.scoreResults.map((r) => ({
    personaId: r.personaId,
    surface: r.surface,
    r2Score: r.weightedOverall,
    r2FloorRisk: r.floorRisk,
  }));

  // Collect observed strings directly from baseline JSON for strict span grounding check
  const rawJsonText = JSON.stringify(baseline);
  const additionalEvidence = [
    'IM 작업실',
    '표지·기본정보',
    '층별 임대현황',
    '장점 3가지',
    '사진·위치·만들기',
    'IM 만들기 완료 (다시 반영하기)',
    'PPTX 받기',
    '발표자료 꾸미기',
    '고객 화면과 일치',
    '발행 준비도',
    '편집 반영 PPTX 다운로드',
    '슬라이드 안의 글자나 숫자를 직접 눌러 바로 고칠 수 있습니다.',
    '간편 문의 · 자료 요청',
    '전화 문의',
    '01 표지',
    '공적장부·실거래 검증필',
    '테마: CREDEAL Basic IM (표준 매각자료)',
    '순서 이동(▲▼) 및 포함/제외 버튼으로 편집 가능',
  ];
  for (const s of additionalEvidence) observedTokens.add(s);

  const imageParts: ChatMessagePart[] = UI_SCREENSHOTS.map((shot) => ({
    type: 'image_url',
    image_url: {
      url: encodePngBase64(path.join(PPGT_DIR, shot.file)),
      detail: shot.detail,
    },
  }));

  const promptText =
    `다음 10장의 IM 웹 UI 스크린샷(${UI_SCREENSHOTS.map((s) => `${s.file}=${s.label}`).join(', ')})과 DOM 실측 요약을 함께 검수하세요.\n\n` +
    `[실측 DOM 요약]\n${JSON.stringify({ runs: domDigest, tabDiagnostics: baseline.tabDiagnostics, clippedButtons: baseline.clippedButtonDetails, skipped: baseline.skippedProbes }, null, 2)}\n\n` +
    `[사용 가능한 실제 UI 문구 예시 (evidenceSpan에는 이미지나 아래 실제 문구 원문만 인용)]\n` +
    `${Array.from(observedTokens).join(' | ')}\n\n` +
    `각 페르소나(IM-MG-01, IM-MG-02, IM-MG-03, IM-MG-04, IM-MG-06)에 대해 6대 축(${PPGT_ALL_AXES.join(', ')})을 1.0~5.0으로 채점하고, 개선 이슈를 Track 1(track1_ui_renderer)과 Track 2(track2_prompt)로 분류하세요.\n` +
    `JSON 스키마:\n` +
    `{"personas":[{"personaId":"IM-MG-01","axes":{"U1_first10s_clarity":n,"U2_visual_ergonomics":n,"U3_flow_resilience":n,"C1_provenance_honesty":n,"C2_artifact_shareability":n,"C3_safe_domain_fit":n},"overallScore":n,"floorRisk":boolean,"floorReason":string,"reaction":"[SIMULATED] ...","delightEvidenceSpan":string,"frictionEvidenceSpan":string}],"issues":[{"surface":string,"severity":"critical"|"major"|"minor","track":"track1_ui_renderer"|"track2_prompt","targetFileHint":string,"evidenceSpan":string,"problem":string,"suggestion":string}]}`;

  const output = await callOpenAiJson<UiJudgeOutput>(
    apiKey,
    [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: [{ type: 'text', text: promptText }, ...imageParts] },
    ],
    usage,
    'Stage D2 Call 1 (Web UI 10-Cut Multimodal Audit)'
  );

  const groundingCorpus = `${rawJsonText}\n${Array.from(observedTokens).join('\n')}`;
  return { output, groundingCorpus };
}

async function runPptxVisionAudit(
  apiKey: string,
  usage: UsageAccumulator
): Promise<{ output: PptxJudgeOutput; groundingCorpus: string }> {
  const slideTextSummaries: Array<{ deck: string; posture: string; slideNum: number; text: string }> = [];
  const corpusChunks: string[] = [];

  for (const target of PPTX_SAMPLE_SLIDES) {
    const pptxPath = path.join(OUT_DIR, `${target.deck}.pptx`);
    if (!fs.existsSync(pptxPath)) {
      throw new Error(`Missing rendered PPTX for Layer D audit: ${pptxPath}`);
    }
    const extracted = await extractSlideTexts(fs.readFileSync(pptxPath));
    const slideEntry = extracted.find((s) => s.slideNumber === target.slideNum);
    const text = slideEntry?.text ?? '';
    corpusChunks.push(text);
    slideTextSummaries.push({
      deck: target.deck,
      posture: target.posture,
      slideNum: target.slideNum,
      text: text.slice(0, 900),
    });
  }

  const imageParts: ChatMessagePart[] = PPTX_SAMPLE_SLIDES.map((s) => ({
    type: 'image_url',
    image_url: {
      url: encodePngBase64(path.join(VISUAL_CUR_DIR, s.deck, s.fileName)),
      detail: 'high',
    },
  }));

  const promptText =
    `다음 8장의 PPTX 960px 렌더링 이미지(5대 포스처: 임대수익·사옥·매매차익·개발·운영)와 각 슬라이드의 OpenXML 추출 텍스트를 검수하세요.\n\n` +
    `[점검 포인트]\n` +
    `1) income-wellbing-r3 slide-06 & slide-07: 렌트롤 (1/2) 및 (2/2) 분할 균형, 여백 비율, 표/스태킹 정합성\n` +
    `2) 5대 포스처별 표지/토지(지적도·본건핀)/수익률/시세비교 시각 위계 및 한국 CRE 실무 문체 자연스러움\n` +
    `3) 회피 문구, 개발/직역 용어, 겹침·잘림·미완성 감점 요인\n\n` +
    `[슬라이드 원문 텍스트 (evidenceSpan에는 아래 실제 추출 문구만 인용)]\n` +
    `${JSON.stringify(slideTextSummaries, null, 2)}\n\n` +
    `JSON 스키마:\n` +
    `{"slides":[{"deck":string,"posture":string,"slideNum":number,"visualScore":number,"writingScore":number,"domainTrustScore":number,"delightEvidenceSpan":string,"frictionEvidenceSpan":string,"issues":[{"severity":"critical"|"major"|"minor","track":"track1_ui_renderer"|"track2_prompt","evidenceSpan":string,"problem":string,"suggestion":string}]}],"overallPptxScore":number,"floorRisk":boolean,"overallReaction":"[SIMULATED] ...","topTrack1Fixes":[string],"topTrack2Fixes":[string]}`;

  const output = await callOpenAiJson<PptxJudgeOutput>(
    apiKey,
    [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: [{ type: 'text', text: promptText }, ...imageParts] },
    ],
    usage,
    'Stage D2 Call 2 (PPTX 5-Posture Multimodal Audit)'
  );

  return { output, groundingCorpus: corpusChunks.join('\n') };
}

function formatVisualDiffSummary(): string[] {
  if (!fs.existsSync(VISUAL_REPORT_PATH)) {
    return ['- `visual-report.json` 미생성'];
  }
  const rep = JSON.parse(fs.readFileSync(VISUAL_REPORT_PATH, 'utf8')) as {
    verdicts?: Array<{
      name: string;
      status: string;
      maxRatio?: number;
      slides?: Array<{ slide: number; status: string; diffRatio?: number }>;
    }>;
  };
  const verdicts = rep.verdicts ?? [];
  const passCnt = verdicts.filter((v) => v.status === 'PASS').length;
  const changedCnt = verdicts.filter((v) => v.status === 'CHANGED').length;
  const missingCnt = verdicts.filter((v) => v.status !== 'PASS' && v.status !== 'CHANGED').length;
  const lines = [
    `- 범위: \`core\` ${verdicts.length}덱 (PASS ${passCnt} · CHANGED ${changedCnt} · 미승인 기준선 ${missingCnt})`,
  ];
  for (const v of verdicts) {
    if (v.status !== 'PASS') {
      const slideList = (v.slides ?? [])
        .filter((s) => s.status !== 'ok')
        .map((s) => `s${s.slide} (${((s.diffRatio ?? 0) * 100).toFixed(2)}%)`)
        .join(', ');
      lines.push(
        `  - \`${v.name}\` [${v.status}]: ${slideList || `maxRatio=${((v.maxRatio ?? 0) * 100).toFixed(2)}%`} → Human Gate H1 검수 후 승인/반려`
      );
    }
  }
  return lines;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('[Layer D FAIL-LOUD] OPENAI_API_KEY is missing in environment.');
  }
  if (!fs.existsSync(BASELINE_JSON_PATH)) {
    throw new Error(`[Layer D FAIL-LOUD] Missing Layer C baseline JSON: ${BASELINE_JSON_PATH}`);
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_JSON_PATH, 'utf8')) as BaselinePayload;
  const usage: UsageAccumulator = { promptTokens: 0, completionTokens: 0, calls: 0 };

  console.log(`[Layer D] Running Stage D1 NC-01-R3 Anti-Sycophancy Gate (model=${MODEL})...`);
  const ncResult = await runNegativeControlGate(apiKey, usage);
  console.log(
    `[Layer D] NC-01-R3 PASSED (overallScore=${ncResult.overallScore}, floorRisk=${ncResult.floorRisk})`
  );

  console.log('[Layer D] Running Stage D2 Call 1 (10 UI screenshots + DOM evidence)...');
  const { output: uiAudit, groundingCorpus: uiCorpus } = await runUiVisionAudit(apiKey, baseline, usage);

  console.log('[Layer D] Running Stage D2 Call 2 (8 PPTX slides across 5 postures)...');
  const { output: pptxAudit, groundingCorpus: pptxCorpus } = await runPptxVisionAudit(apiKey, usage);

  // Enforce "[SIMULATED] " prefix on every persona & PPTX reaction
  for (const p of uiAudit.personas) {
    p.reaction = formatSimulatedReaction(p.reaction);
  }
  pptxAudit.overallReaction = formatSimulatedReaction(pptxAudit.overallReaction);

  // Verify verbatim span grounding programmatically across all claims
  const claimChecks: Array<{ source: string; span: string; grounded: boolean }> = [];
  for (const p of uiAudit.personas) {
    if (p.delightEvidenceSpan) {
      claimChecks.push({
        source: `${p.personaId}:delight`,
        span: p.delightEvidenceSpan,
        grounded: isSpanGrounded(p.delightEvidenceSpan, uiCorpus),
      });
    }
    if (p.frictionEvidenceSpan && !/^(none|없음|n\/a|-)$/i.test(p.frictionEvidenceSpan.trim())) {
      claimChecks.push({
        source: `${p.personaId}:friction`,
        span: p.frictionEvidenceSpan,
        grounded: isSpanGrounded(p.frictionEvidenceSpan, uiCorpus),
      });
    }
  }
  for (const issue of uiAudit.issues) {
    claimChecks.push({
      source: `UI-issue:${issue.surface}`,
      span: issue.evidenceSpan,
      grounded: isSpanGrounded(issue.evidenceSpan, uiCorpus),
    });
  }
  for (const s of pptxAudit.slides) {
    if (s.delightEvidenceSpan) {
      claimChecks.push({
        source: `${s.deck}#s${s.slideNum}:delight`,
        span: s.delightEvidenceSpan,
        grounded: isSpanGrounded(s.delightEvidenceSpan, pptxCorpus),
      });
    }
    for (const issue of s.issues) {
      claimChecks.push({
        source: `${s.deck}#s${s.slideNum}:issue`,
        span: issue.evidenceSpan,
        grounded: isSpanGrounded(issue.evidenceSpan, pptxCorpus),
      });
    }
  }

  const groundedCount = claimChecks.filter((c) => c.grounded).length;
  const groundedRatio = claimChecks.length > 0 ? Math.round((groundedCount / claimChecks.length) * 1000) / 1000 : 1;

  // Blend R2 (0.70) + R3 (0.30) per persona (mean R2 per persona from Layer C)
  const r2ByPersona = new Map<ImPpgtPersonaId, BaselineRunRecord[]>();
  for (const run of baseline.scoreResults) {
    const arr = r2ByPersona.get(run.personaId) ?? [];
    arr.push(run);
    r2ByPersona.set(run.personaId, arr);
  }

  const blendedPersonas = uiAudit.personas.map((r3) => {
    const r2Runs = r2ByPersona.get(r3.personaId) ?? [];
    const r2Mean =
      r2Runs.length > 0
        ? Math.round((r2Runs.reduce((s, r) => s + r.weightedOverall, 0) / r2Runs.length) * 100) / 100
        : 5.0;
    const anyR2Floor = r2Runs.some((r) => r.floorRisk);
    const floorRisk = anyR2Floor || Boolean(r3.floorRisk);
    let blended = Math.round((0.7 * r2Mean + 0.3 * r3.overallScore) * 100) / 100;
    if (floorRisk) blended = Math.min(blended, 2.85);
    return {
      personaId: r3.personaId,
      r2Mean,
      r3Score: r3.overallScore,
      blendedScore: blended,
      floorRisk,
      reaction: r3.reaction,
      delightEvidenceSpan: r3.delightEvidenceSpan,
      frictionEvidenceSpan: r3.frictionEvidenceSpan,
    };
  });

  const costUsd = estimateCostUsd(usage.promptTokens, usage.completionTokens);
  const generatedAt = new Date().toISOString();

  const auditJson = {
    generatedAt,
    model: MODEL,
    usage: { ...usage, estimatedCostUsd: costUsd },
    negativeControl: { controlId: 'NC-01-R3', passed: true, ...ncResult },
    grounding: { totalClaims: claimChecks.length, groundedCount, groundedRatio, checks: claimChecks },
    blendedPersonas,
    uiAudit,
    pptxAudit,
  };

  fs.mkdirSync(PPGT_DIR, { recursive: true });
  fs.writeFileSync(path.join(PPGT_DIR, 'layer-d-r3-audit.json'), JSON.stringify(auditJson, null, 2), 'utf8');

  const mdLines = [
    '# IM Layer D (PPGT R3): Anti-Sycophancy Multimodal & Span-Grounded Audit',
    '',
    `- 생성 시각: ${generatedAt}`,
    `- 판정 모델: \`${MODEL}\` (${usage.calls} calls | prompt=${usage.promptTokens.toLocaleString()} | completion=${usage.completionTokens.toLocaleString()} | 추정 비용=\`$${costUsd.toFixed(4)}\`)`,
    `- 음성 대조군(\`NC-01-R3\`): **PASS** (score=${ncResult.overallScore} <= 2.9, floorRisk=${ncResult.floorRisk})`,
    `- 원문 근거 접지율(\`isSpanGrounded\`): **${(groundedRatio * 100).toFixed(1)}%** (${groundedCount}/${claimChecks.length}, 기준 >= 50%)`,
    '',
    '## 1. 페르소나별 Blended Score (`0.70 * R2 + 0.30 * R3`)',
    '| Persona | R2 (DOM) | R3 (Vision/Judge) | Blended | FloorRisk | 합성 반응 (`[SIMULATED]`) |',
    '|:--|:--:|--:|--:|:--:|:--|',
    ...blendedPersonas.map(
      (b) =>
        `| ${b.personaId} | ${b.r2Mean.toFixed(2)} | ${b.r3Score.toFixed(2)} | **${b.blendedScore.toFixed(2)}** | ${b.floorRisk ? 'YES' : 'NO'} | ${b.reaction.replace(/\|/g, '/')} |`
    ),
    '',
    '## 2. 5대 포스처 PPTX 대표 슬라이드 검수 결과',
    `- 종합 점수: **${pptxAudit.overallPptxScore} / 5.0** (floorRisk=${pptxAudit.floorRisk})`,
    `- 종합 반응: ${pptxAudit.overallReaction}`,
    '',
    '| Deck | Posture | Slide | Visual | Writing | Domain Trust | 근거 인용 (`delightEvidenceSpan`) |',
    '|:--|:--|--:|--:|--:|--:|:--|',
    ...pptxAudit.slides.map(
      (s) =>
        `| \`${s.deck}\` | ${s.posture} | s${String(s.slideNum).padStart(2, '0')} | ${s.visualScore} | ${s.writingScore} | ${s.domainTrustScore} | ${s.delightEvidenceSpan.replace(/\|/g, '/')} |`
    ),
    '',
    '## 3. 식별된 개선 후보 (Track 1 vs Track 2 분리)',
    '### Track 1 (`track1_ui_renderer`)',
    ...(uiAudit.issues.filter((i) => i.track === 'track1_ui_renderer').length === 0 &&
    pptxAudit.topTrack1Fixes.length === 0
      ? ['- 긴급 Track 1 결함 0건']
      : [
          ...uiAudit.issues
            .filter((i) => i.track === 'track1_ui_renderer')
            .map(
              (i) =>
                `- [${i.severity}] \`${i.surface}\` -> \`${i.targetFileHint}\`: ${i.problem} (근거: "${i.evidenceSpan}") → ${i.suggestion}`
            ),
          ...pptxAudit.topTrack1Fixes.map((f) => `- [PPTX Track 1] ${f}`),
        ]),
    '',
    '### Track 2 (`track2_prompt` — Human 2nd 확정 후 일괄 1회 배치)',
    ...(uiAudit.issues.filter((i) => i.track === 'track2_prompt').length === 0 &&
    pptxAudit.topTrack2Fixes.length === 0
      ? ['- 없음']
      : [
          ...uiAudit.issues
            .filter((i) => i.track === 'track2_prompt')
            .map(
              (i) =>
                `- [${i.severity}] \`${i.surface}\`: ${i.problem} (근거: "${i.evidenceSpan}") → ${i.suggestion}`
            ),
          ...pptxAudit.topTrack2Fixes.map((f) => `- [PPTX Track 2] ${f}`),
        ]),
  ];

  fs.writeFileSync(path.join(PPGT_DIR, 'layer-d-r3-audit.md'), mdLines.join('\n'), 'utf8');

  // Update IM_HUMAN_REVIEW_PACKET.md and mirror to docs/finaltest/
  const visualLines = formatVisualDiffSummary();
  const basePacket = fs.existsSync(REVIEW_PACKET_OUT_PATH)
    ? fs.readFileSync(REVIEW_PACKET_OUT_PATH, 'utf8')
    : '';
  const marker = '## Layer D (R3 반아첨 멀티모달 Vision & Blended Score)';
  const baseTrimmed = basePacket.includes(marker)
    ? basePacket.slice(0, basePacket.indexOf(marker)).trimEnd()
    : basePacket.trimEnd();

  const layerDAddon = [
    '',
    '',
    marker,
    `- 판정 모델: \`${MODEL}\` · 추정 실측 비용 \`$${costUsd.toFixed(4)}\` (${usage.promptTokens.toLocaleString()} in / ${usage.completionTokens.toLocaleString()} out)`,
    `- 음성 대조군(\`NC-01-R3\`): **PASS** (${ncResult.overallScore} <= 2.9, floorRisk=true) · 원문 접지율: **${(groundedRatio * 100).toFixed(1)}%**`,
    `- 5대 포스처 PPTX 종합 점수: **${pptxAudit.overallPptxScore} / 5.0** (${pptxAudit.overallReaction})`,
    '',
    '| Persona | R2 (DOM) | R3 (Vision) | Blended (0.7/0.3) | FloorRisk |',
    '|:--|:--:|--:|--:|:--:|',
    ...blendedPersonas.map(
      (b) =>
        `| ${b.personaId} | ${b.r2Mean.toFixed(2)} | ${b.r3Score.toFixed(2)} | **${b.blendedScore.toFixed(2)}** | ${b.floorRisk ? 'YES' : 'NO'} |`
    ),
    '',
    '## Layer B 시각 회귀 (`visual:check core`) Human Gate H1 승인 대상',
    ...visualLines,
    '',
    '## 5대 포스처 PPTX 검수 PNG 경로 (Gate H1/H3)',
    ...PPTX_SAMPLE_SLIDES.map(
      (s) => `- [${s.posture}] \`${path.join(VISUAL_CUR_DIR, s.deck, s.fileName)}\` (실물: \`${path.join(OUT_DIR, `${s.deck}.pptx`)}\`)`
    ),
    '',
    '## 상세 리포트 링크',
    `- Layer C 상세 리포트: \`${path.join(PPGT_DIR, 'sprint1-baseline.md')}\``,
    `- Layer D R3 심사 전문: \`${path.join(PPGT_DIR, 'layer-d-r3-audit.md')}\``,
  ].join('\n');

  const finalPacket = `${baseTrimmed}${layerDAddon}\n`;
  fs.writeFileSync(REVIEW_PACKET_OUT_PATH, finalPacket, 'utf8');
  fs.mkdirSync(path.dirname(REVIEW_PACKET_DOCS_PATH), { recursive: true });
  fs.writeFileSync(REVIEW_PACKET_DOCS_PATH, finalPacket, 'utf8');

  console.log(
    `[Layer D DONE] groundedRatio=${(groundedRatio * 100).toFixed(1)}%, cost=$${costUsd.toFixed(4)}, pptx=${pptxAudit.overallPptxScore}/5.0`
  );
  if (groundedRatio < 0.5) {
    throw new Error(`[Layer D FAIL-LOUD] Grounding ratio below 50%: ${groundedRatio}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
