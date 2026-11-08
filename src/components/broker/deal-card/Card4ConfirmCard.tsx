'use client';

/**
 * 4-Item Deal Card Editor UI (WP-P1-05)
 *
 * Sections:
 * 1. 어떤 매물인가요? (임대수익용 / 사옥용 / 신축·개발용)
 * 2. 카톡 썸네일 (지역 · 용도 · 면적 · 가격) & 한 줄 제목 (18자 이내)
 * 3. 장점 3줄 (각 18자 이내)
 */

import React, { useMemo, useState } from 'react';
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
import { validateBlindPoints } from '@/lib/deal-card/blind-guard';
import { POSTURE_LABELS, TERMS } from '@/lib/ux/lexicon';
import { showUndoToast } from '@/components/workspace/UndoConfirmToast';

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

  const currentPosture: DealCardPosture = card4.posture || 'income';
  const currentArea = card4.area !== undefined ? card4.area : resolveCard4AreaLabel(card4);
  const currentHeadline = (card4.headline ?? '').slice(0, 18);

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
      currentHeadline || '',
    ]);
    return check.violations;
  }, [card4.region, card4.use, currentHeadline]);

  const handleHeadlineChange = (headline: string) => {
    onChange({
      ...card4,
      headline: headline.slice(0, 18),
    });
  };

  const handleAiHeadlineGenerate = async () => {
    const prevSnapshot: Card4Data = { ...card4, points: [...card4.points] as [string, string, string] };
    setAiHeadlineBusy(true);
    setAiFeedback(null);
    try {
      const res = await fetch('/api/broker/deal-card/ai-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'headline',
          posture: currentPosture,
          region: card4.region,
          use: card4.use,
          area: currentArea,
          priceBand: card4.priceBand,
          currentHeadline,
          currentPoints: card4.points,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && typeof data.result?.headline === 'string') {
        const nextHeadline = data.result.headline.slice(0, 18);
        onChange({
          ...card4,
          headline: nextHeadline,
        });
        showUndoToast({
          message: 'AI가 한 줄 제목을 작성했어요',
          undoAction: () => onChange(prevSnapshot),
        });
      } else {
        setAiFeedback(data?.error?.message || 'AI가 잠시 쉬고 있어요. 잠시 후 다시 눌러 주세요.');
      }
    } catch {
      // Fallback for offline/unit test environment
      const fallbackHeadline = generateAiOgHeadline(card4);
      onChange({
        ...card4,
        headline: fallbackHeadline,
      });
      showUndoToast({
        message: '한 줄 제목을 추천했어요',
        undoAction: () => onChange(prevSnapshot),
      });
    } finally {
      setAiHeadlineBusy(false);
    }
  };

  const handlePostureChange = (posture: DealCardPosture) => {
    if (posture === currentPosture) return;
    const prevSnapshot: Card4Data = { ...card4, points: [...card4.points] as [string, string, string] };
    const nextArea = resolveAreaOnPostureChange(card4, posture);
    onChange({
      ...card4,
      posture,
      area: nextArea,
    });
    showUndoToast({
      message: `${POSTURE_LABELS[posture].title} 기준으로 전환했어요`,
      undoAction: () => onChange(prevSnapshot),
    });
  };

  const handlePointChange = (index: 0 | 1 | 2, text: string) => {
    const nextPoints: [string, string, string] = [...card4.points];
    nextPoints[index] = text.slice(0, 18);

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

  const handleAiRecluster = async () => {
    const prevSnapshot: Card4Data = { ...card4, points: [...card4.points] as [string, string, string] };
    setAiPointsBusy(true);
    setAiFeedback(null);
    try {
      const res = await fetch('/api/broker/deal-card/ai-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: currentHeadline.trim() ? 'points' : 'both',
          posture: currentPosture,
          region: card4.region,
          use: card4.use,
          area: currentArea,
          priceBand: card4.priceBand,
          currentHeadline,
          currentPoints: card4.points,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && Array.isArray(data.result?.points) && data.result.points.length === 3) {
        const nextPts: [string, string, string] = [
          String(data.result.points[0] || '').slice(0, 18),
          String(data.result.points[1] || '').slice(0, 18),
          String(data.result.points[2] || '').slice(0, 18),
        ];
        onChange({
          ...card4,
          ...(typeof data.result.headline === 'string' && !currentHeadline.trim()
            ? { headline: data.result.headline.slice(0, 18) }
            : {}),
          points: nextPts,
          provenance: { points: ['ai', 'ai', 'ai'] },
        });
        showUndoToast({
          message: 'AI가 장점 3줄을 작성했어요',
          undoAction: () => onChange(prevSnapshot),
        });
      } else {
        setAiFeedback(data?.error?.message || 'AI가 잠시 쉬고 있어요. 잠시 후 다시 눌러 주세요.');
      }
    } catch {
      const reclustered = reclusterDealCardPointsAsAxios(card4);
      onChange(reclustered);
      showUndoToast({
        message: '장점 3줄을 추천했어요',
        undoAction: () => onChange(prevSnapshot),
      });
    } finally {
      setAiPointsBusy(false);
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
                    onClick={() => handleFieldChange('region', validation.suggestedRegion!)}
                    className="mt-2 min-h-[48px] text-sm font-semibold px-4 py-2 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-lg transition-colors"
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
                onClick={handleAiHeadlineGenerate}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-extrabold transition cursor-pointer flex items-center gap-1.5"
              >
                <span>{aiHeadlineBusy ? TERMS.aiWriting : TERMS.aiWriteButton}</span>
              </button>
            </div>
            <input
              id="card4-headline-input"
              type="text"
              maxLength={18}
              data-testid="card4-headline-input"
              data-single-line-title="true"
              value={currentHeadline}
              onChange={(e) => handleHeadlineChange(e.target.value)}
              className="w-full min-h-[48px] px-3.5 text-[18px] font-extrabold text-slate-900 bg-slate-50 rounded-xl border border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="지역·용도 반복 없이 핵심 장점을 18자 이내로 적어 주세요"
            />
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
                    maxLength={18}
                    data-testid={`card4-point-input-${idx}`}
                    data-single-line-title="true"
                    value={ptText}
                    onChange={(e) => handlePointChange(idx, e.target.value)}
                    className={`w-full min-h-[48px] px-3.5 text-[18px] font-extrabold text-slate-950 rounded-lg border ${
                      pointViolations.length > 0
                        ? 'border-red-400 bg-red-50/60 focus:ring-red-500'
                        : 'border-slate-400/80 bg-white/95 focus:ring-blue-600'
                    } focus:outline-none focus:ring-2 transition`}
                    placeholder={`장점 ${idx + 1} (18자 이내로 적어 주세요)`}
                  />
                </div>

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
