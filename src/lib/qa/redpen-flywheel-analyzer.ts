/**
 * @file src/lib/qa/redpen-flywheel-analyzer.ts
 * @description Beta Red-Pen Flywheel Analyzer (`U-04`):
 *   Aggregates `qa_pin_created` (especially `metadata.pinMode === "redpen"`) and
 *   `qa_byod_anonymized_diff` events from Supabase `activity_events` (or offline fixtures)
 *   to surface:
 *     1) Recurring `(originalText -> suggestedText)` red-pen corrections as UX lexicon candidates.
 *     2) Per-`(surface, field)` BYOD edit rates flagging `>= 40%` fields as `P0_PROMPT_TUNING`.
 */

export interface QaFlywheelPinMetadata {
  id?: string;
  sessionId?: string;
  cohort?: string | null;
  workspace?: string;
  surface?: string;
  routePath?: string;
  targetSelector?: string;
  targetLabel?: string;
  note?: string;
  severity?: 'critical' | 'major' | 'minor' | string;
  authorRole?: 'tester' | 'broker' | string;
  pinMode?: 'issue' | 'redpen' | string;
  originalText?: string | null;
  suggestedText?: string | null;
  reasonCategory?: string | null;
  createdAt?: string;
  [key: string]: unknown;
}

export interface QaFlywheelByodDiffItem {
  surface?: string;
  field: string;
  edited?: boolean;
  originalText?: string | null;
  suggestedText?: string | null;
  reasonCategory?: string | null;
}

export interface QaFlywheelByodDiffMetadata {
  sessionId?: string;
  cohort?: string | null;
  surface?: string;
  field?: string;
  edited?: boolean;
  originalText?: string | null;
  suggestedText?: string | null;
  reasonCategory?: string | null;
  editedFields?: string[];
  evaluatedFields?: string[];
  allFields?: string[];
  fields?: Record<string, boolean | { edited?: boolean }>;
  diffs?: QaFlywheelByodDiffItem[];
  [key: string]: unknown;
}

export interface QaFlywheelActivityEvent {
  id?: string;
  event_type: 'qa_pin_created' | 'qa_byod_anonymized_diff' | string;
  entity_type?: string | null;
  actor_id?: string | null;
  actor_role?: string | null;
  created_at?: string;
  metadata?: QaFlywheelPinMetadata | QaFlywheelByodDiffMetadata | Record<string, unknown> | null;
}

export interface RedpenPairSummary {
  normalizedPair: string;
  originalText: string;
  suggestedText: string;
  count: number;
  surface: string;
  surfaces: string[];
  sampleReasons: string[];
  reasonCategories: string[];
  promoteToLexicon: boolean;
}

export interface FieldEditRateSummary {
  surface: string;
  field: string;
  editedSessions: number;
  totalSessions: number;
  editRate: number;
  priority: 'P0_PROMPT_TUNING' | 'NORMAL';
  needsPromptTuning: boolean;
}

export interface BetaRedpenFlywheelReport {
  generatedAt: string;
  cohort: string;
  thresholds: {
    editRateThreshold: number;
    minRedpenRepeat: number;
  };
  summary: {
    totalEvents: number;
    totalPins: number;
    redpenPins: number;
    issuePins: number;
    uniqueRedpenPairs: number;
    lexiconPromotionCandidateCount: number;
    byodDiffEvents: number;
    trackedFieldCount: number;
    p0PromptTuningCount: number;
  };
  redpenPairs: RedpenPairSummary[];
  lexiconPromotionCandidates: RedpenPairSummary[];
  fieldEditRates: FieldEditRateSummary[];
  p0PromptTuningFields: FieldEditRateSummary[];
}

function normalizeTextToken(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim();
}

function resolvePinSurface(meta: Record<string, unknown>): string {
  const candidates = [meta.surface, meta.workspace, meta.routePath];
  for (const cand of candidates) {
    if (typeof cand === 'string' && cand.trim()) {
      return cand.trim();
    }
  }
  return 'unknown';
}

function matchesCohortFilter(
  meta: Record<string, unknown> | null | undefined,
  cohortFilter?: string,
): boolean {
  const target = typeof cohortFilter === 'string' ? cohortFilter.trim().toLowerCase() : '';
  if (!target) return true;
  if (!meta) return true;

  const explicitCohort = typeof meta.cohort === 'string' ? meta.cohort.trim().toLowerCase() : '';
  if (explicitCohort) {
    return explicitCohort === target;
  }

  const sessionId = typeof meta.sessionId === 'string' ? meta.sessionId.trim().toLowerCase() : '';
  const betaMatch = sessionId.match(/\bbeta-\d+\b/);
  if (betaMatch && betaMatch[0] !== target) {
    return false;
  }
  return true;
}

interface RedpenAccumulator {
  normalizedPair: string;
  originalText: string;
  suggestedText: string;
  count: number;
  surfaceCounts: Map<string, number>;
  sampleReasons: Set<string>;
  reasonCategories: Set<string>;
}

interface FieldAccumulator {
  surface: string;
  field: string;
  totalSessions: Set<string>;
  editedSessions: Set<string>;
}

function extractByodFieldEntries(
  meta: Record<string, unknown>,
): Array<{ surface: string; field: string; edited: boolean }> {
  const baseSurface =
    typeof meta.surface === 'string' && meta.surface.trim()
      ? meta.surface.trim()
      : typeof meta.workspace === 'string' && meta.workspace.trim()
      ? meta.workspace.trim()
      : 'unknown';

  const out: Array<{ surface: string; field: string; edited: boolean }> = [];

  if (Array.isArray(meta.diffs)) {
    for (const item of meta.diffs) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const field = normalizeTextToken(rec.field);
      if (!field) continue;
      const surface =
        typeof rec.surface === 'string' && rec.surface.trim() ? rec.surface.trim() : baseSurface;
      const edited =
        typeof rec.edited === 'boolean'
          ? rec.edited
          : Boolean(
              normalizeTextToken(rec.suggestedText) &&
                normalizeTextToken(rec.suggestedText) !== normalizeTextToken(rec.originalText),
            );
      out.push({ surface, field, edited });
    }
  }

  if (meta.fields && typeof meta.fields === 'object' && !Array.isArray(meta.fields)) {
    for (const [rawField, val] of Object.entries(meta.fields as Record<string, unknown>)) {
      const field = normalizeTextToken(rawField);
      if (!field) continue;
      let edited = false;
      if (typeof val === 'boolean') {
        edited = val;
      } else if (val && typeof val === 'object') {
        edited = Boolean((val as { edited?: unknown }).edited);
      }
      out.push({ surface: baseSurface, field, edited });
    }
  }

  const editedList = Array.isArray(meta.editedFields)
    ? meta.editedFields.map(normalizeTextToken).filter(Boolean)
    : [];
  const allList = Array.isArray(meta.allFields)
    ? meta.allFields.map(normalizeTextToken).filter(Boolean)
    : Array.isArray(meta.evaluatedFields)
    ? meta.evaluatedFields.map(normalizeTextToken).filter(Boolean)
    : [];

  if (editedList.length > 0 || allList.length > 0) {
    const editedSet = new Set(editedList);
    const union = new Set([...allList, ...editedList]);
    for (const field of union) {
      out.push({ surface: baseSurface, field, edited: editedSet.has(field) });
    }
  }

  if (out.length === 0 && typeof meta.field === 'string' && meta.field.trim()) {
    const field = normalizeTextToken(meta.field);
    const edited =
      typeof meta.edited === 'boolean'
        ? meta.edited
        : normalizeTextToken(meta.suggestedText) !== normalizeTextToken(meta.originalText) ||
          Boolean(normalizeTextToken(meta.suggestedText));
    out.push({ surface: baseSurface, field, edited });
  }

  return out;
}

/**
 * Aggregates `qa_pin_created` (redpen mode) and `qa_byod_anonymized_diff` events
 * into lexicon promotion candidates and `P0_PROMPT_TUNING` field edit-rate alerts.
 */
export function analyzeBetaRedpenFlywheel(
  events: QaFlywheelActivityEvent[],
  opts?: {
    editRateThreshold?: number;
    minRedpenRepeat?: number;
    cohort?: string;
  },
): BetaRedpenFlywheelReport {
  const editRateThreshold =
    typeof opts?.editRateThreshold === 'number' && Number.isFinite(opts.editRateThreshold)
      ? opts.editRateThreshold
      : 0.4;
  const minRedpenRepeat =
    typeof opts?.minRedpenRepeat === 'number' && Number.isFinite(opts.minRedpenRepeat)
      ? Math.max(1, Math.floor(opts.minRedpenRepeat))
      : 2;
  const cohortLabel =
    typeof opts?.cohort === 'string' && opts.cohort.trim() ? opts.cohort.trim() : 'all';

  let totalEvents = 0;
  let totalPins = 0;
  let redpenPins = 0;
  let issuePins = 0;
  let byodDiffEvents = 0;

  const pairMap = new Map<string, RedpenAccumulator>();
  const fieldMap = new Map<string, FieldAccumulator>();

  events.forEach((ev, idx) => {
    if (!ev || typeof ev !== 'object') return;
    const meta =
      ev.metadata && typeof ev.metadata === 'object' && !Array.isArray(ev.metadata)
        ? (ev.metadata as Record<string, unknown>)
        : {};

    if (!matchesCohortFilter(meta, opts?.cohort)) {
      return;
    }

    totalEvents += 1;

    if (ev.event_type === 'qa_pin_created') {
      totalPins += 1;
      if (meta.pinMode === 'redpen') {
        redpenPins += 1;
        const originalText = normalizeTextToken(meta.originalText);
        const suggestedText = normalizeTextToken(meta.suggestedText);
        if (!originalText && !suggestedText) {
          return;
        }
        const normalizedPair = `${originalText || '(빈 원문)'} -> ${suggestedText || '(삭제 제안)'}`;
        const surface = resolvePinSurface(meta);

        let acc = pairMap.get(normalizedPair);
        if (!acc) {
          acc = {
            normalizedPair,
            originalText: originalText || '(빈 원문)',
            suggestedText: suggestedText || '(삭제 제안)',
            count: 0,
            surfaceCounts: new Map<string, number>(),
            sampleReasons: new Set<string>(),
            reasonCategories: new Set<string>(),
          };
          pairMap.set(normalizedPair, acc);
        }

        acc.count += 1;
        acc.surfaceCounts.set(surface, (acc.surfaceCounts.get(surface) ?? 0) + 1);

        const reasonCategory = normalizeTextToken(meta.reasonCategory);
        const note = normalizeTextToken(meta.note);
        if (reasonCategory) {
          acc.reasonCategories.add(reasonCategory);
          acc.sampleReasons.add(reasonCategory);
        }
        if (note && acc.sampleReasons.size < 5) {
          acc.sampleReasons.add(note);
        }
      } else {
        issuePins += 1;
      }
      return;
    }

    if (ev.event_type === 'qa_byod_anonymized_diff') {
      byodDiffEvents += 1;
      const entries = extractByodFieldEntries(meta);
      const sessionKey =
        typeof meta.sessionId === 'string' && meta.sessionId.trim()
          ? meta.sessionId.trim()
          : `__event_${idx}`;

      for (const entry of entries) {
        const key = `${entry.surface}::${entry.field}`;
        let acc = fieldMap.get(key);
        if (!acc) {
          acc = {
            surface: entry.surface,
            field: entry.field,
            totalSessions: new Set<string>(),
            editedSessions: new Set<string>(),
          };
          fieldMap.set(key, acc);
        }
        acc.totalSessions.add(sessionKey);
        if (entry.edited) {
          acc.editedSessions.add(sessionKey);
        }
      }
    }
  });

  const redpenPairs: RedpenPairSummary[] = Array.from(pairMap.values())
    .map((acc) => {
      const sortedSurfaces = Array.from(acc.surfaceCounts.entries()).sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      );
      return {
        normalizedPair: acc.normalizedPair,
        originalText: acc.originalText,
        suggestedText: acc.suggestedText,
        count: acc.count,
        surface: sortedSurfaces[0]?.[0] ?? 'unknown',
        surfaces: sortedSurfaces.map(([s]) => s),
        sampleReasons: Array.from(acc.sampleReasons).slice(0, 5),
        reasonCategories: Array.from(acc.reasonCategories),
        promoteToLexicon: acc.count >= minRedpenRepeat,
      };
    })
    .sort(
      (a, b) =>
        b.count - a.count || a.normalizedPair.localeCompare(b.normalizedPair, 'ko'),
    );

  const lexiconPromotionCandidates = redpenPairs.filter((p) => p.promoteToLexicon);

  const fieldEditRates: FieldEditRateSummary[] = Array.from(fieldMap.values())
    .map((acc) => {
      const totalSessions = acc.totalSessions.size;
      const editedSessions = acc.editedSessions.size;
      const editRate =
        totalSessions > 0 ? Number((editedSessions / totalSessions).toFixed(4)) : 0;
      const needsPromptTuning = editRate >= editRateThreshold;
      return {
        surface: acc.surface,
        field: acc.field,
        editedSessions,
        totalSessions,
        editRate,
        priority: (needsPromptTuning ? 'P0_PROMPT_TUNING' : 'NORMAL') as
          | 'P0_PROMPT_TUNING'
          | 'NORMAL',
        needsPromptTuning,
      };
    })
    .sort(
      (a, b) =>
        b.editRate - a.editRate ||
        b.editedSessions - a.editedSessions ||
        a.surface.localeCompare(b.surface) ||
        a.field.localeCompare(b.field),
    );

  const p0PromptTuningFields = fieldEditRates.filter(
    (f) => f.priority === 'P0_PROMPT_TUNING',
  );

  return {
    generatedAt: new Date().toISOString(),
    cohort: cohortLabel,
    thresholds: {
      editRateThreshold,
      minRedpenRepeat,
    },
    summary: {
      totalEvents,
      totalPins,
      redpenPins,
      issuePins,
      uniqueRedpenPairs: redpenPairs.length,
      lexiconPromotionCandidateCount: lexiconPromotionCandidates.length,
      byodDiffEvents,
      trackedFieldCount: fieldEditRates.length,
      p0PromptTuningCount: p0PromptTuningFields.length,
    },
    redpenPairs,
    lexiconPromotionCandidates,
    fieldEditRates,
    p0PromptTuningFields,
  };
}

/**
 * Formats a `BetaRedpenFlywheelReport` into a concise actionable Markdown report.
 */
export function renderBetaFlywheelMarkdown(report: BetaRedpenFlywheelReport): string {
  const lines: string[] = [];
  const pct = (rate: number) => `${(rate * 100).toFixed(1)}%`;

  lines.push(`# Beta Red-Pen Flywheel Report (${report.cohort})`);
  lines.push('');
  lines.push(`- Generated: \`${report.generatedAt}\``);
  lines.push(
    `- Thresholds: \`minRedpenRepeat >= ${report.thresholds.minRedpenRepeat}\`, \`editRate >= ${pct(report.thresholds.editRateThreshold)}\``,
  );
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| :--- | ---: |');
  lines.push(`| Total Filtered Events | ${report.summary.totalEvents} |`);
  lines.push(`| Total QA Pins | ${report.summary.totalPins} |`);
  lines.push(`| Red-Pen Pins (\`pinMode=redpen\`) | ${report.summary.redpenPins} |`);
  lines.push(`| Issue Pins | ${report.summary.issuePins} |`);
  lines.push(`| Unique Red-Pen Pairs | ${report.summary.uniqueRedpenPairs} |`);
  lines.push(`| Lexicon Promotion Candidates | ${report.summary.lexiconPromotionCandidateCount} |`);
  lines.push(`| BYOD Diff Events | ${report.summary.byodDiffEvents} |`);
  lines.push(`| Tracked (Surface, Field) Pairs | ${report.summary.trackedFieldCount} |`);
  lines.push(`| P0 Prompt Tuning Fields | ${report.summary.p0PromptTuningCount} |`);
  lines.push('');

  lines.push('## Lexicon Promotion Candidates');
  lines.push('');
  if (report.lexiconPromotionCandidates.length === 0) {
    lines.push('_반복 기준을 초과한 빨간펜 용어 승격 후보가 없습니다._');
  } else {
    lines.push('| Original | Suggested | Count | Surface | Sample Reasons |');
    lines.push('| :--- | :--- | ---: | :--- | :--- |');
    for (const c of report.lexiconPromotionCandidates) {
      lines.push(
        `| ${c.originalText.replace(/\|/g, '\\|')} | ${c.suggestedText.replace(/\|/g, '\\|')} | ${c.count} | ${c.surfaces.join(', ')} | ${c.sampleReasons.join('; ').replace(/\|/g, '\\|') || '—'} |`,
      );
    }
  }
  lines.push('');

  lines.push('## BYOD Field Edit Rates');
  lines.push('');
  if (report.fieldEditRates.length === 0) {
    lines.push('_집계된 `qa_byod_anonymized_diff` 필드 수정 내역이 없습니다._');
  } else {
    lines.push('| Surface | Field | Edited / Total | Edit Rate | Priority |');
    lines.push('| :--- | :--- | ---: | ---: | :--- |');
    for (const f of report.fieldEditRates) {
      lines.push(
        `| ${f.surface} | \`${f.field}\` | ${f.editedSessions} / ${f.totalSessions} | ${pct(f.editRate)} | \`${f.priority}\` |`,
      );
    }
  }
  lines.push('');

  if (report.redpenPairs.length > 0) {
    lines.push('## All Red-Pen Corrections');
    lines.push('');
    for (const p of report.redpenPairs) {
      const badge = p.promoteToLexicon ? ' **[PROMOTE]**' : '';
      lines.push(
        `- (${p.count}x, ${p.surface}) \`${p.originalText}\` → \`${p.suggestedText}\`${badge}${
          p.sampleReasons.length > 0 ? ` — ${p.sampleReasons.join(' / ')}` : ''
        }`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}
