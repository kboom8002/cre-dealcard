'use client';

/**
 * 4-Item Deal Card Editor UI (WP-P1-05)
 *
 * Sections:
 * 1. 어떤 매물인가요? (임대수익용 / 사옥용 / 신축·개발용)
 * 2. 카톡 썸네일 (지역 · 용도 · 면적 · 가격) & 한 줄 제목 (18자 이내)
 * 3. 장점 3줄 (각 18자 이내)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  generateAiOgHeadline,
  reclusterDealCardPointsAsAxios,
  resolveAreaOnPostureChange,
  resolveCard4AreaLabel,
  type Card4Data,
  type DealCardPointTone,
  type DealCardPosture,
  type ProvenanceSource,
} from '@/lib/deal-card/card4-schema';
import { cleanBlindPoints, validateBlindPoints } from '@/lib/deal-card/blind-guard';
import {
  DEAL_CARD_LINE_MAX,
  assessDealCardLine,
  countDealCardChars,
  deriveDealCardHeadline,
  repairDealCardLine,
} from '@/lib/deal-card/copy-limits';
import { POSTURE_LABELS, TERMS } from '@/lib/ux/lexicon';
import { showUndoToast } from '@/components/workspace/UndoConfirmToast';

/**
 * 입력 변경 시 18자 처리 규칙:
 * - 한 글자씩 타이핑: 원문 그대로 둔다 (카운터가 넘침을 경고, blur 시 교정).
 * - 붙여넣기/자동완성처럼 한 번에 2자 이상 늘어난 경우: 넘치거나 말줄임이 있으면 즉시 어절 경계 교정.
 */
function applyTypedLine(prev: string, next: string): string {
  const jumped = countDealCardChars(next) - countDealCardChars(prev) > 1;
  if (!jumped) return next;
  const a = assessDealCardLine(next);
  return a.isOver || a.hasEllipsis ? a.repaired : next;
}

function LineCounter({ text, testId, id }: { text: string; testId: string; id?: string }) {
  const a = assessDealCardLine(text);
  const warn = a.isOver || a.isDangling || a.hasEllipsis;
  return (
    <span
      id={id}
      data-testid={testId}
      data-state={warn ? 'warn' : 'ok'}
      aria-live="polite"
      className={`text-sm font-extrabold tabular-nums shrink-0 ${warn ? 'text-red-700' : 'text-slate-500'}`}
    >
      {a.count}/{DEAL_CARD_LINE_MAX}
    </span>
  );
}

function LineRepairHint({
  text,
  testId,
  onApply,
}: {
  text: string;
  testId: string;
  onApply?: (repaired: string) => void;
}) {
  const a = assessDealCardLine(text);
  if (!text.trim() || a.ok) return null;
  const reason = a.isOver ? '18자를 넘었어요' : a.hasEllipsis ? '말줄임표는 쓰지 않아요' : '문장이 끝나지 않았어요';
  return (
    <div
      data-testid={testId}
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-red-700"
    >
      <p className="break-keep">
        ⚠ {reason} · 고객 화면에는 「{a.repaired || '—'}」로 보여요 (입력칸을 벗어나면 자동으로 다듬어요)
      </p>
      {onApply && a.repaired && (
        <button
          type="button"
          data-testid={`${testId}-apply`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onApply(a.repaired)}
          className="min-h-[36px] px-3 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-900 border border-red-300 text-sm font-extrabold transition cursor-pointer shrink-0"
        >
          적용
        </button>
      )}
    </div>
  );
}

export interface Card4ConfirmCardProps {
  card4: Card4Data;
  onChange: (updated: Card4Data) => void;
  onSave?: () => void;
  onOpenPreSend?: () => void;
  isSaving?: boolean;
  isDirty?: boolean;
  className?: string;
}

export const POSTIT_TONE_STYLES: Record<
  DealCardPointTone,
  {
    label: string;
    bgHex: string;
    borderHex: string;
    badgeBgHex: string;
    badgeTextHex: string;
    dotHex: string;
  }
> = {
  amber: {
    label: '노란 강조',
    bgHex: '#FEF9C3',
    borderHex: '#FDE047',
    badgeBgHex: '#FEF08A',
    badgeTextHex: '#854D0E',
    dotHex: '#EAB308',
  },
  sky: {
    label: '하늘 강조',
    bgHex: '#E0F2FE',
    borderHex: '#7DD3FC',
    badgeBgHex: '#BAE6FD',
    badgeTextHex: '#075985',
    dotHex: '#0284C7',
  },
  mint: {
    label: '초록 강조',
    bgHex: '#DCFCE7',
    borderHex: '#86EFAC',
    badgeBgHex: '#BBF7D0',
    badgeTextHex: '#166534',
    dotHex: '#16A34A',
  },
  lavender: {
    label: '보라 강조',
    bgHex: '#F3E8FF',
    borderHex: '#D8B4FE',
    badgeBgHex: '#E9D5FF',
    badgeTextHex: '#6B21A8',
    dotHex: '#9333EA',
  },
  peach: {
    label: '주황 강조',
    bgHex: '#FFEDD5',
    borderHex: '#FDBA74',
    badgeBgHex: '#FED7AA',
    badgeTextHex: '#9A3412',
    dotHex: '#EA580C',
  },
};

const DEFAULT_TONES: [DealCardPointTone, DealCardPointTone, DealCardPointTone] = [
  'amber',
  'sky',
  'mint',
];

const POSTURE_IDS: DealCardPosture[] = ['income', 'owner_occupied', 'value_add'];

export function Card4ConfirmCard({
  card4,
  onChange,
  onOpenPreSend,
  className = '',
}: Card4ConfirmCardProps) {
  const [aiHeadlineBusy, setAiHeadlineBusy] = useState(false);
  const [aiPointsBusy, setAiPointsBusy] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const card4Ref = useRef(card4);
  const onChangeRef = useRef(onChange);
  const blurTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  card4Ref.current = card4;
  onChangeRef.current = onChange;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      for (const timer of blurTimersRef.current) {
        clearTimeout(timer);
      }
      blurTimersRef.current = [];
    };
  }, []);

  const shouldDeferBlurRepair = (e: React.FocusEvent<HTMLInputElement>): boolean => {
    const rt = e.relatedTarget;
    return Boolean(
      rt instanceof HTMLElement &&
        rt.closest('button, a, [role="button"], [role="tab"]')
    );
  };

  const currentPosture: DealCardPosture = card4.posture || 'income';
  const currentArea = card4.area !== undefined ? card4.area : resolveCard4AreaLabel(card4);
  const currentHeadline = card4.headline ?? '';
  const hasCardContent = Boolean(
    card4.region?.trim() || card4.use?.trim() || card4.priceBand?.trim() || card4.points?.some((p) => p?.trim()),
  );
  // 제목이 비어 있으면 미리보기와 **같은** 파생 제목을 편집기에 "AI 추천"으로 노출한다 (조용한 불일치 금지).
  const suggestedHeadline = useMemo(
    () => (hasCardContent && !currentHeadline.trim() ? deriveDealCardHeadline(card4) : ''),
    [hasCardContent, currentHeadline, card4],
  );

  // Validate blind guard rules across points + headline + quadrant fields
  const validation = useMemo(() => {
    return validateBlindPoints(card4.points, {
      region: card4.region,
      assetType: card4.use,
    });
  }, [card4.points, card4.region, card4.use]);

  const headerFieldViolations = useMemo(() => {
    const check = validateBlindPoints([
      card4.region || '',
      card4.use || '',
      card4.area || '',
      card4.priceBand || '',
      card4.headline || '',
    ]);
    return check.violations;
  }, [card4.region, card4.use, card4.area, card4.priceBand, card4.headline]);

  const handleHeadlineChange = (headline: string) => {
    onChange({
      ...card4,
      headline: applyTypedLine(card4.headline ?? '', headline),
    });
  };

  const handleHeadlineBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = card4.headline ?? '';
    if (!raw.trim() || assessDealCardLine(raw).ok) return;
    if (shouldDeferBlurRepair(e)) {
      const timer = setTimeout(() => {
        if (!isMountedRef.current) return;
        const latest = card4Ref.current;
        const latestRaw = latest.headline ?? '';
        if (!latestRaw.trim() || assessDealCardLine(latestRaw).ok) return;
        onChangeRef.current({ ...latest, headline: repairDealCardLine(latestRaw) });
      }, 120);
      blurTimersRef.current.push(timer);
      return;
    }
    onChange({ ...card4, headline: repairDealCardLine(raw) });
  };

  const handleApplySuggestedHeadline = () => {
    if (!suggestedHeadline) return;
    onChange({ ...card4, headline: suggestedHeadline });
  };

  const handleAiHeadlineGenerate = async () => {
    const prevSnapshot: Card4Data = { ...card4, points: [...card4.points] as [string, string, string] };
    const commitForCard = onChange;
    setAiHeadlineBusy(true);
    setAiFeedback(null);
    try {
      const res = await fetch('/api/broker/deal-card/ai-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'headline',
          posture: currentPosture,
          region: prevSnapshot.region,
          use: prevSnapshot.use,
          area: currentArea,
          priceBand: prevSnapshot.priceBand,
          currentHeadline,
          currentPoints: prevSnapshot.points,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && typeof data.result?.headline === 'string') {
        const nextHeadline = repairDealCardLine(data.result.headline);
        commitForCard({
          ...prevSnapshot,
          headline: nextHeadline,
        });
        if (isMountedRef.current && Array.isArray(data.warnings) && data.warnings.length > 0) {
          setAiFeedback(String(data.warnings[0]));
        }
        showUndoToast({
          message: 'AI가 한 줄 제목을 작성했어요',
          undoAction: () => commitForCard(prevSnapshot),
        });
      } else if (isMountedRef.current) {
        setAiFeedback(data?.error?.message || 'AI가 잠시 쉬고 있어요. 잠시 후 다시 눌러 주세요.');
      }
    } catch {
      // Fallback for offline/unit test environment
      const fallbackHeadline = generateAiOgHeadline(prevSnapshot);
      commitForCard({
        ...prevSnapshot,
        headline: fallbackHeadline,
      });
      showUndoToast({
        message: '한 줄 제목을 추천했어요',
        undoAction: () => commitForCard(prevSnapshot),
      });
    } finally {
      if (isMountedRef.current) {
        setAiHeadlineBusy(false);
      }
    }
  };

  const handlePostureChange = (posture: DealCardPosture) => {
    if (posture === currentPosture) return;
    const prevSnapshot: Card4Data = { ...card4, points: [...card4.points] as [string, string, string] };
    const commitForCard = onChange;
    const nextArea = resolveAreaOnPostureChange(card4, posture);
    commitForCard({
      ...card4,
      posture,
      area: nextArea,
    });
    showUndoToast({
      message: `${POSTURE_LABELS[posture].title} 기준으로 전환했어요`,
      undoAction: () => commitForCard(prevSnapshot),
    });
  };

  const handlePointChange = (index: 0 | 1 | 2, text: string) => {
    const nextPoints: [string, string, string] = [...card4.points];
    nextPoints[index] = applyTypedLine(card4.points[index] ?? '', text);

    const nextProvenance = { ...card4.provenance };
    const provenanceList: [ProvenanceSource, ProvenanceSource, ProvenanceSource] = [
      ...nextProvenance.points,
    ];
    provenanceList[index] = 'broker';
    nextProvenance.points = provenanceList;

    onChange({
      ...card4,
      points: nextPoints,
      provenance: nextProvenance,
    });
  };

  const handlePointBlur = (index: 0 | 1 | 2, e: React.FocusEvent<HTMLInputElement>) => {
    const raw = card4.points[index] ?? '';
    if (!raw.trim() || assessDealCardLine(raw).ok) return;
    if (shouldDeferBlurRepair(e)) {
      const timer = setTimeout(() => {
        if (!isMountedRef.current) return;
        const latest = card4Ref.current;
        const latestRaw = latest.points[index] ?? '';
        if (!latestRaw.trim() || assessDealCardLine(latestRaw).ok) return;
        const deferredPoints: [string, string, string] = [...latest.points];
        deferredPoints[index] = repairDealCardLine(latestRaw);
        onChangeRef.current({ ...latest, points: deferredPoints });
      }, 120);
      blurTimersRef.current.push(timer);
      return;
    }
    const nextPoints: [string, string, string] = [...card4.points];
    nextPoints[index] = repairDealCardLine(raw);
    onChange({ ...card4, points: nextPoints });
  };

  const handleAiRecluster = async () => {
    const prevSnapshot: Card4Data = { ...card4, points: [...card4.points] as [string, string, string] };
    const commitForCard = onChange;
    setAiPointsBusy(true);
    setAiFeedback(null);
    try {
      const res = await fetch('/api/broker/deal-card/ai-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: currentHeadline.trim() ? 'points' : 'both',
          posture: currentPosture,
          region: prevSnapshot.region,
          use: prevSnapshot.use,
          area: currentArea,
          priceBand: prevSnapshot.priceBand,
          currentHeadline,
          currentPoints: prevSnapshot.points,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && Array.isArray(data.result?.points) && data.result.points.length === 3) {
        const nextPts: [string, string, string] = [
          repairDealCardLine(String(data.result.points[0] || '')),
          repairDealCardLine(String(data.result.points[1] || '')),
          repairDealCardLine(String(data.result.points[2] || '')),
        ];
        commitForCard({
          ...prevSnapshot,
          ...(typeof data.result.headline === 'string' && !currentHeadline.trim()
            ? { headline: repairDealCardLine(data.result.headline) }
            : {}),
          points: nextPts,
          provenance: { points: ['ai', 'ai', 'ai'] },
        });
        if (isMountedRef.current && Array.isArray(data.warnings) && data.warnings.length > 0) {
          setAiFeedback(String(data.warnings[0]));
        }
        showUndoToast({
          message: 'AI가 장점 3줄을 작성했어요',
          undoAction: () => commitForCard(prevSnapshot),
        });
      } else if (isMountedRef.current) {
        setAiFeedback(data?.error?.message || 'AI가 잠시 쉬고 있어요. 잠시 후 다시 눌러 주세요.');
      }
    } catch {
      const reclustered = reclusterDealCardPointsAsAxios(prevSnapshot);
      commitForCard({
        ...reclustered,
        ...(prevSnapshot.area !== undefined ? { area: prevSnapshot.area } : {}),
      });
      showUndoToast({
        message: '장점 3줄을 추천했어요',
        undoAction: () => commitForCard(prevSnapshot),
      });
    } finally {
      if (isMountedRef.current) {
        setAiPointsBusy(false);
      }
    }
  };

  const handleFieldChange = (
    field: 'region' | 'use' | 'area' | 'priceBand',
    value: string,
  ) => {
    onChange({
      ...card4,
      [field]: value,
    });
  };

  const handleAutoClean = () => {
    const prevSnapshot: Card4Data = {
      ...card4,
      points: [...card4.points] as [string, string, string],
    };
    const commitForCard = onChange;
    const cleanedPts = cleanBlindPoints(card4.points).map((p) =>
      repairDealCardLine(p)
    ) as [string, string, string];
    const cleanedHeadline = card4.headline
      ? repairDealCardLine(cleanBlindPoints([card4.headline])[0] ?? '')
      : card4.headline;
    const cleanedRegion = cleanBlindPoints([card4.region])[0] || card4.region;
    const cleanedUse = cleanBlindPoints([card4.use])[0] || card4.use;
    const cleanedArea = card4.area ? cleanBlindPoints([card4.area])[0] : card4.area;
    const cleanedPriceBand = card4.priceBand ? cleanBlindPoints([card4.priceBand])[0] : card4.priceBand;

    commitForCard({
      ...card4,
      region: cleanedRegion,
      use: cleanedUse,
      area: cleanedArea,
      priceBand: cleanedPriceBand,
      ...(cleanedHeadline !== undefined ? { headline: cleanedHeadline } : {}),
      points: cleanedPts,
    });

    showUndoToast({
      message: '위치가 드러나는 표현을 자동으로 가렸어요',
      undoAction: () => commitForCard(prevSnapshot),
    });
  };

  const postureInfo = POSTURE_LABELS[currentPosture];

  return (
    <div
      className={`space-y-6 ${className}`}
      data-testid="card4-confirm-card"
      data-canvas-mode="zero-tab-single"
    >
      {/* ══════════════════════════════════════════════════════════════════
       * SECTION 1: 어떤 매물인가요?
       * ══════════════════════════════════════════════════════════════════ */}
      <section
        data-testid="card4-section-posture"
        className="bg-white rounded-2xl border-2 border-slate-300 shadow-xs overflow-hidden"
      >
        <div className="bg-slate-100 border-b border-slate-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-extrabold text-slate-900">
            {TERMS.postureSectionTitle}
          </h3>
          <span className="text-sm font-semibold text-slate-600">
            선택한 유형에 맞춰 면적 표시(연면적/토지면적)가 자동으로 바뀝니다
          </span>
        </div>

        <div className="p-5" data-testid="card4-posture-chips">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="group" aria-label={TERMS.postureSectionTitle}>
            {POSTURE_IDS.map((id) => {
              const opt = POSTURE_LABELS[id];
              const active = currentPosture === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`card4-posture-chip-${id}`}
                  onClick={() => handlePostureChange(id)}
                  className={`min-h-[64px] px-4 py-3.5 rounded-xl border-2 text-left transition cursor-pointer ${
                    active
                      ? 'bg-blue-700 text-white border-blue-700 shadow-sm'
                      : 'bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-base font-extrabold break-keep">
                    {opt.title}
                  </div>
                  <div
                    className={`text-sm mt-1 break-keep ${
                      active ? 'text-blue-100' : 'text-slate-600'
                    }`}
                  >
                    {opt.subtitle} · {opt.areaRuleNote}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
       * SECTION 2: 카톡 썸네일 & 한 줄 제목
       * ══════════════════════════════════════════════════════════════════ */}
      <section
        data-testid="card4-section-og-editor"
        className="bg-white rounded-2xl border-2 border-blue-300 shadow-xs overflow-hidden"
      >
        <div className="bg-blue-50/90 border-b border-blue-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-extrabold text-slate-900">
            {TERMS.thumbnailSectionTitle}
          </h3>
          <span className="text-sm font-bold text-blue-800">
            카톡 말풍선 이미지에 4가지 항목이 큰 글씨로 들어갑니다
          </span>
        </div>

        <div className="p-5 space-y-5">
          {/* Dong -> Gu Fallback Notice */}
          {validation.requiresDongToGuFallback && (
            <div
              className="p-3.5 bg-amber-50 rounded-xl border border-amber-300 text-amber-900 text-base flex items-start gap-2.5"
              role="alert"
            >
              <span className="text-lg" aria-hidden="true">⚠</span>
              <div className="flex-1">
                <p className="font-semibold text-base">지역 표시 안내</p>
                <p className="text-sm text-amber-800 mt-0.5">
                  {validation.fallbackRegionNotice ||
                    '건물 위치가 특정되지 않도록 구 단위 표기를 권장합니다.'}
                </p>
                {validation.suggestedRegion && validation.suggestedRegion !== card4.region && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleFieldChange('region', validation.suggestedRegion!)}
                    className="mt-2 min-h-[48px] text-sm font-semibold px-4 py-2 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-lg transition-colors cursor-pointer"
                  >
                    &apos;{validation.suggestedRegion}&apos;로 바꾸기
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 4-Item Thumbnail Input Grid (2x2) */}
          <div
            data-testid="card4-og-quadrant-grid"
            data-theme-lock="dark"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-4 rounded-xl bg-slate-900 text-white border border-slate-700"
          >
            {/* Item 1: 지역 */}
            <div className="p-3.5 rounded-lg bg-slate-800/90 border border-slate-700 space-y-1.5">
              <label
                htmlFor="card4-region-input"
                className="block text-sm font-bold text-slate-200"
              >
                {TERMS.regionLabel}
              </label>
              <input
                id="card4-region-input"
                type="text"
                data-testid="card4-region-input"
                value={card4.region}
                onChange={(e) => handleFieldChange('region', e.target.value)}
                className="w-full min-h-[48px] px-3 text-[18px] font-extrabold text-white bg-slate-900/90 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-400 transition"
                placeholder="예: 서초구 잠원동"
              />
            </div>

            {/* Item 2: 용도 */}
            <div className="p-3.5 rounded-lg bg-slate-800/90 border border-slate-700 space-y-1.5">
              <label
                htmlFor="card4-use-input"
                className="block text-sm font-bold text-sky-300"
              >
                {TERMS.useLabel}
              </label>
              <input
                id="card4-use-input"
                type="text"
                data-testid="card4-use-input"
                value={card4.use}
                onChange={(e) => handleFieldChange('use', e.target.value)}
                className="w-full min-h-[48px] px-3 text-[18px] font-extrabold text-sky-300 bg-slate-900/90 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-400 transition"
                placeholder="예: 근린생활시설"
              />
            </div>

            {/* Item 3: 면적 (연면적 / 토지면적) */}
            <div className="p-3.5 rounded-lg bg-slate-800/90 border border-slate-700 space-y-1.5">
              <label
                htmlFor="card4-area-input"
                className="block text-sm font-bold text-emerald-300"
              >
                {postureInfo.areaFieldLabel}
              </label>
              <input
                id="card4-area-input"
                type="text"
                data-testid="card4-area-input"
                value={currentArea}
                onChange={(e) => handleFieldChange('area', e.target.value)}
                className="w-full min-h-[48px] px-3 text-[18px] font-extrabold text-white bg-slate-900/90 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"
                placeholder={postureInfo.areaPlaceholder}
              />
            </div>

            {/* Item 4: 가격 */}
            <div className="p-3.5 rounded-lg bg-slate-800/90 border border-slate-700 space-y-1.5">
              <label
                htmlFor="card4-priceband-input"
                className="block text-sm font-bold text-amber-300"
              >
                {TERMS.priceLabel}
              </label>
              <input
                id="card4-priceband-input"
                type="text"
                data-testid="card4-priceband-input"
                value={card4.priceBand}
                onChange={(e) => handleFieldChange('priceBand', e.target.value)}
                className="w-full min-h-[48px] px-3 text-[18px] font-extrabold text-amber-300 bg-slate-900/90 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
                placeholder="예: 80~90억"
              />
            </div>
          </div>

          {/* 한 줄 제목 (18자 이내) */}
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="card4-headline-input"
                className="text-base font-extrabold text-slate-900"
              >
                {TERMS.headlineLabel} (18자 이내)
              </label>
              <button
                type="button"
                data-testid="card4-ai-headline-btn"
                disabled={aiHeadlineBusy}
                aria-busy={aiHeadlineBusy}
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleAiHeadlineGenerate}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-extrabold transition cursor-pointer flex items-center gap-1.5"
              >
                <span>{aiHeadlineBusy ? TERMS.aiWriting : TERMS.aiWriteButton}</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="card4-headline-input"
                type="text"
                data-testid="card4-headline-input"
                data-single-line-title="true"
                aria-describedby="card4-headline-counter"
                aria-invalid={!assessDealCardLine(currentHeadline).ok && currentHeadline.trim().length > 0}
                value={currentHeadline}
                onChange={(e) => handleHeadlineChange(e.target.value)}
                onBlur={handleHeadlineBlur}
                className="w-full min-h-[48px] px-3.5 text-[18px] font-extrabold text-slate-900 bg-slate-50 rounded-xl border border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="지역·용도 반복 없이 핵심 장점을 18자 이내로 적어 주세요"
              />
              <LineCounter text={currentHeadline} testId="card4-headline-counter" id="card4-headline-counter" />
            </div>
            <LineRepairHint
              text={currentHeadline}
              testId="card4-headline-repair-hint"
              onApply={(repaired) => onChange({ ...card4, headline: repaired })}
            />
            {suggestedHeadline && (
              <div
                data-testid="card4-headline-suggestion"
                className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-blue-50 border border-blue-200"
              >
                <p className="text-sm font-bold text-blue-950 break-keep">
                  AI 추천: <span data-testid="card4-headline-suggestion-text">{suggestedHeadline}</span>
                  <span className="block text-sm font-semibold text-blue-800">
                    지금 미리보기·카톡 썸네일에는 이 제목이 보여요
                  </span>
                </p>
                <button
                  type="button"
                  data-testid="card4-headline-suggestion-apply"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleApplySuggestedHeadline}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-extrabold transition cursor-pointer shrink-0"
                >
                  적용
                </button>
              </div>
            )}
            {headerFieldViolations.length > 0 && (
              <div className="space-y-1 pt-1" role="alert">
                {headerFieldViolations.map((v, idx) => (
                  <p key={idx} className="text-sm text-red-700 font-bold">
                    ⚠ {v.reason}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
       * SECTION 3: 장점 3줄 (각 18자 이내)
       * ══════════════════════════════════════════════════════════════════ */}
      <section
        data-testid="card4-section-detail-points"
        className="bg-white rounded-2xl border-2 border-indigo-300 shadow-xs overflow-hidden"
      >
        <div className="bg-indigo-50/90 border-b border-indigo-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              {TERMS.pointsSectionTitle} (각 18자 이내)
            </h3>
            <p className="text-sm text-slate-600 mt-0.5">
              상세 화면에 큰 글씨로 보여줄 장점 3가지를 적어 주세요
            </p>
          </div>
          <button
            type="button"
            data-testid="card4-ai-recluster-btn"
            disabled={aiPointsBusy}
            aria-busy={aiPointsBusy}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleAiRecluster}
            className="min-h-[48px] px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-60 text-white text-sm font-extrabold shadow-xs transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span>{aiPointsBusy ? TERMS.aiWriting : 'AI로 3줄 쓰기'}</span>
          </button>
        </div>

        <div className="p-5 space-y-3">
          {aiFeedback && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm font-semibold"
            >
              {aiFeedback}
            </div>
          )}

          {(!validation.isValid || headerFieldViolations.length > 0) && (
            <div
              data-testid="card4-blind-alert"
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-950 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="space-y-0.5">
                <p className="text-base font-extrabold text-rose-900">
                  ⚠ 건물 위치가 드러날 수 있는 단어가 있어요
                </p>
                <p className="text-sm font-semibold text-rose-800">
                  오른쪽 단추를 누르면 번지·건물명·상호를 안전한 표현으로 바로 가려 드립니다.
                </p>
              </div>
              <button
                type="button"
                data-testid="card4-blind-clean-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleAutoClean}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-sm font-extrabold shadow-xs transition cursor-pointer shrink-0"
              >
                자동으로 가리기
              </button>
            </div>
          )}

          {([0, 1, 2] as const).map((idx) => {
            const ptText = card4.points[idx] || '';
            const ptTone: DealCardPointTone = card4.pointTones?.[idx] || DEFAULT_TONES[idx];
            const toneStyle = POSTIT_TONE_STYLES[ptTone] || POSTIT_TONE_STYLES.amber;

            const pointViolations = validation.violations.filter(
              (v) => v.pointIndex === idx
            );

            return (
              <div
                key={idx}
                data-testid={`card4-postit-card-${idx}`}
                style={{
                  backgroundColor: toneStyle.bgHex,
                  borderColor: toneStyle.borderHex,
                }}
                className="rounded-xl border border-l-4 p-3.5 space-y-2 shadow-2xs transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <label
                    htmlFor={`card4-point-input-${idx}`}
                    style={{
                      backgroundColor: toneStyle.badgeBgHex,
                      color: toneStyle.badgeTextHex,
                    }}
                    className="font-extrabold px-3 py-1.5 rounded-md text-sm shrink-0"
                  >
                    장점 {idx + 1}
                  </label>
                  <input
                    id={`card4-point-input-${idx}`}
                    type="text"
                    data-testid={`card4-point-input-${idx}`}
                    data-single-line-title="true"
                    aria-describedby={`card4-point-counter-${idx}`}
                    value={ptText}
                    onChange={(e) => handlePointChange(idx, e.target.value)}
                    onBlur={(e) => handlePointBlur(idx, e)}
                    className={`w-full min-h-[48px] px-3.5 text-[18px] font-extrabold text-slate-950 rounded-lg border ${
                      pointViolations.length > 0
                        ? 'border-red-400 bg-red-50/60 focus:ring-red-500'
                        : 'border-slate-400/80 bg-white/95 focus:ring-blue-600'
                    } focus:outline-none focus:ring-2 transition`}
                    placeholder={`장점 ${idx + 1} (18자 이내로 적어 주세요)`}
                  />
                  <LineCounter
                    text={ptText}
                    testId={`card4-point-counter-${idx}`}
                    id={`card4-point-counter-${idx}`}
                  />
                </div>
                <LineRepairHint
                  text={ptText}
                  testId={`card4-point-repair-hint-${idx}`}
                  onApply={(repaired) => {
                    const nextPts: [string, string, string] = [...card4.points];
                    nextPts[idx] = repaired;
                    onChange({ ...card4, points: nextPts });
                  }}
                />

                {/* Point Violations Alert (Blind Guard) */}
                {pointViolations.length > 0 && (
                  <div data-testid="card4-blind-violation-alert" className="space-y-1" role="alert">
                    {pointViolations.map((violation, vIdx) => (
                      <p
                        key={vIdx}
                        className="text-sm text-red-700 flex items-center gap-1 font-bold pl-1"
                      >
                        <span aria-hidden="true">⚠</span>
                        <span>{violation.reason}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {onOpenPreSend && (
          <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onOpenPreSend}
              disabled={!validation.isValid || headerFieldViolations.length > 0}
              className="min-h-[48px] px-6 py-2.5 rounded-xl bg-blue-600 text-white text-base font-bold shadow-sm hover:bg-blue-700 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
            >
              <span>{TERMS.sendKakao}</span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
