'use client';

/**
 * 4-Item Deal Card Confirmation Card UI (WP-P1-05)
 *
 * Requirements:
 * 1. High legibility: body >= 17px, price band >= 20px, input text 18px, touch targets >= 48px.
 * 2. 4 Items: Region, Use, PriceBand, Points ([string, string, string]).
 * 3. Inline editable points with 18-char limit counter & visual alert.
 * 4. Provenance badges: 🟢 공적장부 (public) / 🔵 직접입력 (broker) / 🟣 AI제안 (ai).
 * 5. Real-time blind-guard check & downgrade coaching alert.
 */

import React, { useMemo } from 'react';
import type { Card4Data, ProvenanceSource } from '@/lib/deal-card/card4-schema';
import { validateBlindPoints } from '@/lib/deal-card/blind-guard';
import { formatPriceRangeTooltip } from '@/lib/deal-card/price-band';

export interface Card4ConfirmCardProps {
  card4: Card4Data;
  onChange: (updated: Card4Data) => void;
  onSave?: () => void;
  onOpenPreSend?: () => void;
  isSaving?: boolean;
  isDirty?: boolean;
  className?: string;
}

const PROVENANCE_LABELS: Record<ProvenanceSource, { label: string; bg: string; text: string; dot: string }> = {
  public: {
    label: '공적장부',
    bg: 'bg-emerald-50 border-emerald-300',
    text: 'text-emerald-800',
    dot: '🟢',
  },
  broker: {
    label: '직접입력',
    bg: 'bg-blue-50 border-blue-300',
    text: 'text-blue-800',
    dot: '🔵',
  },
  ai: {
    label: 'AI제안',
    bg: 'bg-purple-50 border-purple-300',
    text: 'text-purple-800',
    dot: '🟣',
  },
};

export function Card4ConfirmCard({
  card4,
  onChange,
  onSave,
  onOpenPreSend,
  isSaving = false,
  isDirty = false,
  className = '',
}: Card4ConfirmCardProps) {
  // Validate blind guard rules in real time
  const validation = useMemo(() => {
    return validateBlindPoints(card4.points, {
      region: card4.region,
      assetType: card4.use,
    });
  }, [card4.points, card4.region, card4.use]);

  const handlePointChange = (index: 0 | 1 | 2, text: string) => {
    const nextPoints: [string, string, string] = [...card4.points];
    nextPoints[index] = text;

    // Mark updated point as broker-edited
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

  const handleFieldChange = (field: 'region' | 'use' | 'priceBand', value: string) => {
    onChange({
      ...card4,
      [field]: value,
    });
  };

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-300 shadow-sm p-6 space-y-6 ${className}`}
      data-testid="card4-confirm-card"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            📄 4항목 안심 딜카드
          </span>
          <h2 className="text-[20px] font-bold text-slate-900 mt-1">
            카카오톡 첫 연락용 4대 정보
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-xs text-amber-700 font-medium bg-amber-100 px-2 py-1 rounded-full">
              수정 사항 있음
            </span>
          )}
          <span className="text-xs text-slate-500 font-mono">
            버전 {card4.card4_version || 1}
          </span>
        </div>
      </div>

      {/* k-Anonymity Fallback Notice */}
      {validation.requiresDongToGuFallback && (
        <div
          className="p-3.5 bg-amber-50 rounded-xl border border-amber-300 text-amber-900 text-[15px] flex items-start gap-2.5"
          role="alert"
        >
          <span className="text-lg">⚠️</span>
          <div className="flex-1">
            <p className="font-semibold text-[15px]">권역 표시 권장 안내</p>
            <p className="text-sm text-amber-800 mt-0.5">
              {validation.fallbackRegionNotice ||
                '매물 식별을 방지하기 위해 구 단위 표기를 권장합니다.'}
            </p>
            {validation.suggestedRegion && validation.suggestedRegion !== card4.region && (
              <button
                type="button"
                onClick={() => handleFieldChange('region', validation.suggestedRegion!)}
                className="mt-2 text-xs font-semibold px-2.5 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-lg transition-colors"
              >
                &apos;{validation.suggestedRegion}&apos;로 적용하기
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top 3 Core Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Item 1: Region */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">
            ① 권역 (동 또는 구)
          </label>
          <input
            type="text"
            data-testid="card4-region-input"
            value={card4.region}
            onChange={(e) => handleFieldChange('region', e.target.value)}
            className="w-full h-12 px-3.5 text-[18px] text-slate-900 bg-slate-50 rounded-xl border border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition"
            placeholder="예: 강남구 신사동"
          />
        </div>

        {/* Item 2: Use */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">
            ② 주용도
          </label>
          <input
            type="text"
            data-testid="card4-use-input"
            value={card4.use}
            onChange={(e) => handleFieldChange('use', e.target.value)}
            className="w-full h-12 px-3.5 text-[18px] text-slate-900 bg-slate-50 rounded-xl border border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition"
            placeholder="예: 근린생활시설"
          />
        </div>

        {/* Item 3: Price Band */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">
            ③ 금액구간
          </label>
          <input
            type="text"
            data-testid="card4-priceband-input"
            value={card4.priceBand}
            onChange={(e) => handleFieldChange('priceBand', e.target.value)}
            className="w-full h-12 px-3.5 text-[20px] font-bold text-amber-900 bg-amber-50/50 rounded-xl border border-amber-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-amber-600 transition"
            placeholder="예: 90~100억"
          />
          <p className="text-xs text-slate-500 truncate" title={formatPriceRangeTooltip(0)}>
            {card4.priceBand ? `구간 안내: ${card4.priceBand}대 매물` : '가격 밴드'}
          </p>
        </div>
      </div>

      {/* Item 4: 3 Deal Points */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-800">
            ④ 핵심 특징 3가지 (각 18자 권장 · 지번/건물명/PII 차단)
          </label>
          <span className="text-xs text-slate-500">
            카카오톡 공유 이미지 및 말풍선에 표시됩니다
          </span>
        </div>

        {([0, 1, 2] as const).map((idx) => {
          const ptText = card4.points[idx] || '';
          const charCount = ptText.length;
          const isOverLimit = charCount > 18;
          const provSource = card4.provenance?.points?.[idx] || 'broker';
          const badge = PROVENANCE_LABELS[provSource] || PROVENANCE_LABELS.broker;

          const pointViolations = validation.violations.filter(
            (v) => v.pointIndex === idx
          );

          return (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-700">포인트 {idx + 1}</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${badge.bg} ${badge.text}`}
                  >
                    <span>{badge.dot}</span>
                    <span>{badge.label}</span>
                  </span>
                </div>
                <span
                  className={`font-mono text-xs font-medium ${
                    isOverLimit ? 'text-red-600 font-bold' : 'text-slate-400'
                  }`}
                >
                  {charCount}/18자 {isOverLimit && '(말풍선 말줄임 위험)'}
                </span>
              </div>

              <div className="relative">
                <input
                  type="text"
                  data-testid={`card4-point-input-${idx}`}
                  value={ptText}
                  onChange={(e) => handlePointChange(idx, e.target.value)}
                  className={`w-full h-12 px-3.5 text-[18px] text-slate-900 rounded-xl border ${
                    pointViolations.length > 0
                      ? 'border-red-400 bg-red-50/30 focus:ring-red-500'
                      : isOverLimit
                      ? 'border-amber-400 bg-white focus:ring-amber-500'
                      : 'border-slate-400 bg-white focus:ring-blue-600'
                  } focus:outline-none focus:ring-2 transition`}
                  placeholder={`특징 ${idx + 1}을 입력하세요 (예: 대로변 코너 각지 시인성 우수)`}
                />
              </div>

              {/* Point Violations Alert */}
              {pointViolations.length > 0 && (
                <div data-testid="card4-blind-violation-alert" className="space-y-1">
                  {pointViolations.map((violation, vIdx) => (
                    <p
                      key={vIdx}
                      className="text-xs text-red-600 flex items-center gap-1 font-medium pl-1"
                    >
                      <span>🚫</span>
                      <span>{violation.reason}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action Footer */}
      <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {card4.card4_hash ? (
            <span className="font-mono">
              해시: {card4.card4_hash.slice(0, 12)}...
            </span>
          ) : (
            <span>저장 시 고유 해시가 확정됩니다</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="min-h-[48px] px-5 py-2.5 rounded-xl border border-slate-400 text-slate-800 text-[17px] font-medium hover:bg-slate-50 transition active:scale-[0.98] disabled:opacity-50"
            >
              {isSaving ? '저장 중...' : '임시 저장'}
            </button>
          )}

          {onOpenPreSend && (
            <button
              type="button"
              onClick={onOpenPreSend}
              disabled={!validation.isValid}
              className="min-h-[48px] px-6 py-2.5 rounded-xl bg-blue-600 text-white text-[17px] font-bold shadow-sm hover:bg-blue-700 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <span>🚀</span>
              <span>확인하고 카카오톡 보내기</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
