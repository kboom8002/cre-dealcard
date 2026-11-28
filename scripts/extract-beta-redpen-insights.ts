/**
 * @file scripts/extract-beta-redpen-insights.ts
 * @description Beta Red-Pen Flywheel CLI (`U-04`).
 *   Extracts `qa_pin_created` (redpen) & `qa_byod_anonymized_diff` events from Supabase
 *   `activity_events` (or built-in / `--fixture` JSON in `--dry-run` mode) and writes
 *   `beta-redpen-flywheel-report.md` and `beta-redpen-flywheel-report.json`.
 *
 * Usage:
 *   npx tsx scripts/extract-beta-redpen-insights.ts --dry-run
 *   npx tsx scripts/extract-beta-redpen-insights.ts --cohort beta-1 --out artifacts/qa
 *   npx tsx scripts/extract-beta-redpen-insights.ts --fixture path/to/events.json --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  analyzeBetaRedpenFlywheel,
  renderBetaFlywheelMarkdown,
  type QaFlywheelActivityEvent,
} from '../src/lib/qa/redpen-flywheel-analyzer';

interface CliOptions {
  cohort: string;
  fixturePath: string | null;
  dryRun: boolean;
  outDir: string;
}

function parseCliArgs(argv: string[]): CliOptions {
  let cohort = 'beta-1';
  let fixturePath: string | null = null;
  let dryRun = false;
  let outDir = 'artifacts/qa';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--cohort' && argv[i + 1]) {
      cohort = argv[i + 1].trim();
      i += 1;
    } else if (arg.startsWith('--cohort=')) {
      cohort = arg.slice('--cohort='.length).trim();
    } else if (arg === '--fixture' && argv[i + 1]) {
      fixturePath = argv[i + 1].trim();
      i += 1;
    } else if (arg.startsWith('--fixture=')) {
      fixturePath = arg.slice('--fixture='.length).trim();
    } else if (arg === '--out' && argv[i + 1]) {
      outDir = argv[i + 1].trim();
      i += 1;
    } else if (arg.startsWith('--out=')) {
      outDir = arg.slice('--out='.length).trim();
    }
  }

  return { cohort, fixturePath, dryRun, outDir };
}

function loadEnvLocalIfPresent(cwd: string): void {
  const envLocalPath = path.join(cwd, '.env.local');
  if (!fs.existsSync(envLocalPath)) return;
  const raw = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

export function buildBuiltInBetaFixture(cohort = 'beta-1'): QaFlywheelActivityEvent[] {
  return [
    {
      id: 'fx-pin-1',
      event_type: 'qa_pin_created',
      entity_type: 'qa_pin',
      created_at: '2026-11-27T09:10:00.000Z',
      metadata: {
        sessionId: `qa-broker-${cohort}-01`,
        cohort,
        workspace: 'dealcards',
        routePath: '/broker/w/dealcards',
        pinMode: 'redpen',
        originalText: '캡레이트 4.2%',
        suggestedText: '연 순수익률 4.2%',
        reasonCategory: 'jargon_plain_korean',
        note: '60대 중개사/매수인에게 영문 음차보다 연 순수익률 표기가 직관적',
      },
    },
    {
      id: 'fx-pin-2',
      event_type: 'qa_pin_created',
      entity_type: 'qa_pin',
      created_at: '2026-11-27T10:15:00.000Z',
      metadata: {
        sessionId: `qa-broker-${cohort}-02`,
        cohort,
        workspace: 'im',
        routePath: '/broker/w/im',
        pinMode: 'redpen',
        originalText: '캡레이트 4.2%',
        suggestedText: '연 순수익률 4.2%',
        reasonCategory: 'jargon_plain_korean',
        note: 'IM 요약 카드에서도 연 순수익률 통일 요청',
      },
    },
    {
      id: 'fx-pin-3',
      event_type: 'qa_pin_created',
      entity_type: 'qa_pin',
      created_at: '2026-11-27T11:20:00.000Z',
      metadata: {
        sessionId: `qa-broker-${cohort}-03`,
        cohort,
        workspace: 'dealcards',
        routePath: '/broker/w/dealcards',
        pinMode: 'redpen',
        originalText: '임대호가 월 3,200만',
        suggestedText: '월 임대료 3,200만',
        reasonCategory: 'cre_standard_term',
        note: '실무에서 임대호가라는 표현은 어색함',
      },
    },
    {
      id: 'fx-pin-4',
      event_type: 'qa_pin_created',
      entity_type: 'qa_pin',
      created_at: '2026-11-27T11:45:00.000Z',
      metadata: {
        sessionId: `qa-broker-${cohort}-04`,
        cohort,
        workspace: 'dealcards',
        routePath: '/broker/w/dealcards',
        pinMode: 'redpen',
        originalText: '임대호가 월 3,200만',
        suggestedText: '월 임대료 3,200만',
        reasonCategory: 'cre_standard_term',
        note: '딜카드 4칸 요약에서도 월 임대료로 정정',
      },
    },
    {
      id: 'fx-pin-5',
      event_type: 'qa_pin_created',
      entity_type: 'qa_pin',
      created_at: '2026-11-27T13:00:00.000Z',
      metadata: {
        sessionId: `qa-broker-${cohort}-02`,
        cohort,
        workspace: 'newsletter',
        routePath: '/broker/w/newsletter',
        pinMode: 'issue',
        note: '모바일 뷰에서 썸네일 여백 약간 넓음',
      },
    },
    // BYOD anonymized diffs: dealcard.headline edited 3/5 (60% -> P0_PROMPT_TUNING)
    // dealcard.points edited 2/5 (40% -> P0_PROMPT_TUNING)
    // im.summary edited 1/5 (20% -> NORMAL)
    ...[
      { sid: 'byod-s1', headline: true, points: true, imSummary: false },
      { sid: 'byod-s2', headline: true, points: false, imSummary: true },
      { sid: 'byod-s3', headline: true, points: true, imSummary: false },
      { sid: 'byod-s4', headline: false, points: false, imSummary: false },
      { sid: 'byod-s5', headline: false, points: false, imSummary: false },
    ].flatMap((row): QaFlywheelActivityEvent[] => [
      {
        event_type: 'qa_byod_anonymized_diff',
        entity_type: 'qa_byod_learning',
        metadata: {
          cohort,
          sessionId: row.sid,
          surface: 'dealcard',
          fields: {
            headline: row.headline,
            points: row.points,
          },
        },
      },
      {
        event_type: 'qa_byod_anonymized_diff',
        entity_type: 'qa_byod_learning',
        metadata: {
          cohort,
          sessionId: row.sid,
          surface: 'im',
          field: 'executiveSummary',
          edited: row.imSummary,
        },
      },
    ]),
  ];
}

async function fetchLiveEvents(cohort: string): Promise<QaFlywheelActivityEvent[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Use --dry-run or configure .env.local.',
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from('activity_events')
    .select('id, event_type, entity_type, actor_id, actor_role, metadata, created_at')
    .in('event_type', ['qa_pin_created', 'qa_byod_anonymized_diff'])
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) {
    throw new Error(`Supabase activity_events query failed: ${error.message}`);
  }

  const rows = (data ?? []) as QaFlywheelActivityEvent[];
  return rows.filter((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (typeof meta.cohort === 'string' && meta.cohort.trim()) {
      return meta.cohort.trim().toLowerCase() === cohort.toLowerCase();
    }
    return true;
  });
}

async function main(): Promise<void> {
  const opts = parseCliArgs(process.argv.slice(2));
  const cwd = process.cwd();

  if (!opts.dryRun) {
    loadEnvLocalIfPresent(cwd);
  }

  let events: QaFlywheelActivityEvent[];
  if (opts.fixturePath) {
    const abs = path.isAbsolute(opts.fixturePath)
      ? opts.fixturePath
      : path.resolve(cwd, opts.fixturePath);
    const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
    events = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.events) ? parsed.events : [];
  } else if (opts.dryRun) {
    events = buildBuiltInBetaFixture(opts.cohort);
  } else {
    events = await fetchLiveEvents(opts.cohort);
  }

  const report = analyzeBetaRedpenFlywheel(events, { cohort: opts.cohort });
  const markdown = renderBetaFlywheelMarkdown(report);

  const resolvedOutDir = path.isAbsolute(opts.outDir)
    ? opts.outDir
    : path.resolve(cwd, opts.outDir);

  fs.mkdirSync(resolvedOutDir, { recursive: true });
  const mdPath = path.join(resolvedOutDir, 'beta-redpen-flywheel-report.md');
  const jsonPath = path.join(resolvedOutDir, 'beta-redpen-flywheel-report.json');
  fs.writeFileSync(mdPath, markdown, 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(
    `[beta-redpen-flywheel] cohort=${report.cohort} dryRun=${opts.dryRun} ` +
      `pins=${report.summary.totalPins} (redpen=${report.summary.redpenPins}) ` +
      `lexiconCandidates=${report.summary.lexiconPromotionCandidateCount} ` +
      `p0PromptTuning=${report.summary.p0PromptTuningCount}`,
  );
  console.log(`[beta-redpen-flywheel] wrote ${mdPath}`);
  console.log(`[beta-redpen-flywheel] wrote ${jsonPath}`);
}

const isEntry =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.includes('extract-beta-redpen-insights');

if (isEntry) {
  main().catch((err) => {
    console.error('[beta-redpen-flywheel] Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
