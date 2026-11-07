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
import {
  reclusterDealCardPointsAsAxios,
  type Card4Data,
  type DealCardPointTone,
  type DealCardPosture,
  type ProvenanceSource,
} from '@/lib/deal-card/card4-schema';
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
    label: '앰버 강조',
    bgHex: '#FEF9C3',
    borderHex: '#FDE047',
    badgeBgHex: '#FEF08A',
    badgeTextHex: '#854D0E',
    dotHex: '#EAB308',
  },
  sky: {
    label: '스카이 강조',
    bgHex: '#E0F2FE',
    borderHex: '#7DD3FC',
    badgeBgHex: '#BAE6FD',
    badgeTextHex: '#075985',
    dotHex: '#0284C7',
  },
  mint: {
    label: '민트 강조',
    bgHex: '#DCFCE7',
    borderHex: '#86EFAC',
    badgeBgHex: '#BBF7D0',
    badgeTextHex: '#166534',
    dotHex: '#16A34A',
  },
  lavender: {
    label: '라벤더 강조',
    bgHex: '#F3E8FF',
    borderHex: '#D8B4FE',
    badgeBgHex: '#E9D5FF',
    badgeTextHex: '#6B21A8',
    dotHex: '#9333EA',
  },
  peach: {
    label: '피치 강조',
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

const POSTURE_OPTIONS: Array<{
  id: DealCardPosture;
  label: string;
  desc: string;
}> = [
  { id: 'income', label: '🏦 임대수익형', desc: '안정 배당·만실 현금흐름' },
  { id: 'owner_occupied', label: '🏢 사옥·자가사용형', desc: '즉시 입주·가시성·주차' },
  { id: 'value_add', label: '🔨 밸류애드·신축형', desc: '증축·리모델링·토지가치' },
];

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

  const currentHeadline =
    card4.headline ??
    `${card4.region || '서울 핵심권역'} ${card4.use || '근린생활시설'} ${card4.priceBand || '매매'}`.trim();

  const currentPosture: DealCardPosture = card4.posture || 'income';

  const handleHeadlineChange = (headline: string) => {
    onChange({
      ...card4,
      headline,
    });
  };

  const handlePostureChange = (posture: DealCardPosture) => {
    onChange({
      ...card4,
      posture,
    });
  };

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

  const handlePointBriefChange = (index: 0 | 1 | 2, brief: string) => {
    const currentBriefs: [string, string, string] = card4.pointBriefs
      ? [...card4.pointBriefs]
      : ['', '', ''];
    currentBriefs[index] = brief;
    onChange({
      ...card4,
      pointBriefs: currentBriefs,
    });
  };

  const handlePointToneChange = (index: 0 | 1 | 2, tone: DealCardPointTone) => {
    const currentTones: [DealCardPointTone, DealCardPointTone, DealCardPointTone] =
      card4.pointTones ? [...card4.pointTones] : [...DEFAULT_TONES];
    currentTones[index] = tone;
    onChange({
      ...card4,
      pointTones: currentTones,
    });
  };

  const handleAiRecluster = () => {
    const reclustered = reclusterDealCardPointsAsAxios(card4);
    onChange(reclustered);
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
      data-canvas-mode="zero-tab-single"
    >
      {/* Header — 매매 딜카드 전용 원스크린 즉시 편집 (탭 없음) */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              📄 매매 전용 · 4항목 안심 딜카드
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
              ⚡ 탭 없는 한 화면 즉시 편집
            </span>
          </div>
          <h2 className="text-[20px] font-bold text-slate-900 mt-1.5">
            카카오톡 첫 연락용 매매 딜카드 (대표 제목 + 핵심 요약 3선)
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

      {/* 매수 타깃 포스처 선택 칩 + 딜카드 대표 제목 (Single-Line Title Guard) */}
      <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-4">
        <div className="space-y-2" data-testid="card4-posture-chips">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-slate-800">
              매수 타깃 포스처 (딜카드 핵심 소구점)
            </label>
            <span className="text-xs text-slate-500">선택 포스처에 맞춰 핵심 투자 포인트가 최적화됩니다</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {POSTURE_OPTIONS.map((opt) => {
              const active = currentPosture === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`card4-posture-chip-${opt.id}`}
                  onClick={() => handlePostureChange(opt.id)}
                  className={`px-3 py-2.5 rounded-xl border text-left transition cursor-pointer ${
                    active
                      ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
                      : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-sm font-extrabold whitespace-nowrap truncate">{opt.label}</div>
                  <div className={`text-xs mt-0.5 whitespace-nowrap truncate ${active ? 'text-blue-100' : 'text-slate-500'}`}>
                    {opt.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 딜카드 대표 제목 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-slate-800">
              딜카드 대표 제목 (한 줄 표시)
            </label>
            <span
              className={`text-xs font-mono font-bold ${
                currentHeadline.length > 28 ? 'text-amber-700' : 'text-slate-500'
              }`}
            >
              {currentHeadline.length}/28자 권장
            </span>
          </div>
          <input
            type="text"
            data-testid="card4-headline-input"
            value={currentHeadline}
            onChange={(e) => handleHeadlineChange(e.target.value)}
            className="w-full h-12 px-3.5 text-[18px] font-extrabold text-slate-900 bg-white rounded-xl border border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 whitespace-nowrap overflow-hidden text-ellipsis"
            placeholder="예: [양평동 역세권 코너] 연 4.2% 우량 프랜차이즈 만실 빌딩"
          />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm">
            <span className="text-amber-400 font-bold shrink-0">제목 미리보기:</span>
            <span
              data-single-line-title="true"
              className="font-bold whitespace-nowrap overflow-hidden text-ellipsis truncate"
            >
              {currentHeadline}
            </span>
          </div>
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

      {/* Item 4: 3 Deal Points — Institutional Highlight Cards */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <label className="text-base font-extrabold text-slate-900 flex items-center gap-1.5">
              <span>📌 ④ 핵심 투자 포인트 3선</span>
            </label>
            <p className="text-xs text-slate-600 mt-0.5">
              핵심 요약 제목(18자 권장)과 상세 해설(2~3문장)로 구성됩니다 (지번·건물명 자동 보호)
            </p>
          </div>
          <button
            type="button"
            data-testid="card4-ai-recluster-btn"
            onClick={handleAiRecluster}
            className="px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-extrabold shadow-xs transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span>✨</span>
            <span>AI 핵심 포인트 3선 자동 생성</span>
          </button>
        </div>

        {([0, 1, 2] as const).map((idx) => {
          const ptText = card4.points[idx] || '';
          const ptBrief = card4.pointBriefs?.[idx] || '';
          const ptTone: DealCardPointTone = card4.pointTones?.[idx] || DEFAULT_TONES[idx];
          const toneStyle = POSTIT_TONE_STYLES[ptTone] || POSTIT_TONE_STYLES.amber;
          const charCount = ptText.length;
          const isOverLimit = charCount > 18;
          const provSource = card4.provenance?.points?.[idx] || 'broker';
          const badge = PROVENANCE_LABELS[provSource] || PROVENANCE_LABELS.broker;

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
              className="rounded-lg border border-l-4 p-4 space-y-2.5 shadow-xs transition-colors"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      backgroundColor: toneStyle.badgeBgHex,
                      color: toneStyle.badgeTextHex,
                    }}
                    className="font-extrabold px-2.5 py-0.5 rounded text-xs"
                  >
                    POINT 0{idx + 1}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${badge.bg} ${badge.text}`}
                  >
                    <span>{badge.dot}</span>
                    <span>{badge.label}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Tone Picker */}
                  <div className="flex items-center gap-1 bg-white/80 px-2 py-0.5 rounded-full border border-slate-300/70">
                    {(Object.keys(POSTIT_TONE_STYLES) as DealCardPointTone[]).map((toneKey) => (
                      <button
                        key={toneKey}
                        type="button"
                        title={POSTIT_TONE_STYLES[toneKey].label}
                        onClick={() => handlePointToneChange(idx, toneKey)}
                        style={{ backgroundColor: POSTIT_TONE_STYLES[toneKey].dotHex }}
                        className={`w-3.5 h-3.5 rounded-full transition-transform cursor-pointer ${
                          ptTone === toneKey ? 'scale-125 ring-2 ring-slate-900' : 'opacity-65 hover:opacity-100'
                        }`}
                      />
                    ))}
                  </div>

                  <span
                    className={`font-mono text-xs font-bold ${
                      isOverLimit ? 'text-red-700' : 'text-slate-700'
                    }`}
                  >
                    {charCount}/18자 {isOverLimit && '(말줄임 주의)'}
                  </span>
                </div>
              </div>

              {/* 핵심 제목 */}
              <div className="relative">
                <input
                  type="text"
                  data-testid={`card4-point-input-${idx}`}
                  value={ptText}
                  onChange={(e) => handlePointChange(idx, e.target.value)}
                  className={`w-full h-12 px-3.5 text-[18px] font-extrabold text-slate-950 rounded-lg border ${
                    pointViolations.length > 0
                      ? 'border-red-400 bg-red-50/60 focus:ring-red-500'
                      : isOverLimit
                      ? 'border-amber-500 bg-white/95 focus:ring-amber-500'
                      : 'border-slate-400/80 bg-white/95 focus:ring-blue-600'
                  } focus:outline-none focus:ring-2 transition whitespace-nowrap overflow-hidden text-ellipsis`}
                  placeholder={`포인트 ${idx + 1} 핵심 제목 (예: 역세권 도보 3분 코너 가시성 우수)`}
                />
              </div>

              {/* 요약 해설 2~3문장 */}
              <div>
                <textarea
                  rows={2}
                  data-testid={`card4-point-brief-${idx}`}
                  value={ptBrief}
                  onChange={(e) => handlePointBriefChange(idx, e.target.value)}
                  className="w-full px-3.5 py-2 text-[14px] font-medium text-slate-800 bg-white/85 rounded-lg border border-slate-300/90 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition leading-relaxed"
                  placeholder={`매수자가 주목할 핵심 투자 근거를 2~3문장으로 적어주세요 (수신자 상세 화면에 표시)`}
                />
              </div>

              {/* Point Violations Alert */}
              {pointViolations.length > 0 && (
                <div data-testid="card4-blind-violation-alert" className="space-y-1">
                  {pointViolations.map((violation, vIdx) => (
                    <p
                      key={vIdx}
                      className="text-xs text-red-700 flex items-center gap-1 font-bold pl-1"
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
              data-testid="card4-save-btn"
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
