'use client';

/**
 * HTML KakaoTalk Bubble & Mobile Recipient Detail Preview (WP-P1-08)
 *
 * - 4-item Kakao thumbnail (지역 / 용도 / 면적 / 가격) + 18-char 한 줄 제목
 * - 받는 화면 (장점 3줄 + 담당 중개사 안내 + [전화하기] [IM 요청하기] 두 버튼 고정)
 * - 내부 이중 스크롤을 제거하여 3열 전체가 위에서 아래로 자연스럽게 스크롤됨
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  resolveCard4AreaLabel,
  type Card4Data,
  type DealCardPointTone,
} from '@/lib/deal-card/card4-schema';
import { deriveDealCardHeadline, repairDealCardLine } from '@/lib/deal-card/copy-limits';
import { POSTIT_TONE_STYLES } from '@/components/broker/deal-card/Card4ConfirmCard';
import { DealCardLineText } from '@/components/broker/deal-card/DealCardLineText';
import { PreviewEditableUnit } from '@/components/workspace/preview-sync/PreviewEditableUnit';
import { TERMS } from '@/lib/ux/lexicon';

export interface KakaoBubblePreviewProps {
  card4: Card4Data;
  dealId?: string;
  brokerName?: string;
  brokerSpecialty?: string;
  brokerPhone?: string;
  activeUnitId?: string | null;
  onActivateUnit?: (unitId: string) => void;
  className?: string;
}

const DEFAULT_TONES: [DealCardPointTone, DealCardPointTone, DealCardPointTone] = [
  'amber',
  'sky',
  'mint',
];

export function KakaoBubblePreview({
  card4,
  brokerName = '중개사 프로필 미설정',
  brokerSpecialty = '상업용 부동산 중개',
  brokerPhone,
  activeUnitId = null,
  onActivateUnit,
  className = '',
}: KakaoBubblePreviewProps) {
  const [viewFilter, setViewFilter] = useState<'all' | 'bubble' | 'detail'>('all');
  const [previewHint, setPreviewHint] = useState<string | null>(null);
  const previewHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (previewHintTimerRef.current) {
        clearTimeout(previewHintTimerRef.current);
      }
    };
  }, []);

  const showPreviewHint = (msg: string) => {
    setPreviewHint(msg);
    if (previewHintTimerRef.current) {
      clearTimeout(previewHintTimerRef.current);
    }
    previewHintTimerRef.current = setTimeout(() => {
      setPreviewHint(null);
      previewHintTimerRef.current = null;
    }, 3000);
  };

  const regionText = card4.region?.trim() || '—';
  const useText = card4.use?.trim() || '—';
  const resolvedArea =
    card4.area !== undefined ? card4.area.trim() : resolveCard4AreaLabel(card4);
  const areaText = resolvedArea || '—';
  const priceText = card4.priceBand?.trim() || '—';

  const hasCardContent = Boolean(
    card4.region?.trim() ||
      card4.use?.trim() ||
      card4.priceBand?.trim() ||
      card4.points?.some((p) => p?.trim())
  );

  // SSOT: 편집기 "한 줄 제목" 입력값(card4.headline)을 그대로 18자 교정해 쓴다.
  // 비어 있을 때만 편집기의 "AI 추천"과 같은 파생 제목을 보여준다 (조용한 불일치 금지).
  const bubbleTitle =
    repairDealCardLine(card4.headline) ||
    (hasCardContent ? deriveDealCardHeadline(card4) : '한 줄 제목을 입력해 주세요');

  const wrapUnit = (
    unitId: string,
    label: string,
    node: React.ReactNode,
    opts?: {
      testId?: string;
      badgeText?: string;
      activeBadgeText?: string;
      badgePosition?: 'top-rim' | 'inside';
      className?: string;
    }
  ) => {
    if (!onActivateUnit) return node;
    return (
      <PreviewEditableUnit
        unitId={unitId}
        label={label}
        onActivate={onActivateUnit}
        isActive={activeUnitId === unitId}
        badgeText={opts?.badgeText}
        activeBadgeText={opts?.activeBadgeText}
        badgePosition={opts?.badgePosition}
        testId={opts?.testId}
        className={opts?.className}
      >
        {node}
      </PreviewEditableUnit>
    );
  };

  return (
    <div
      className={`w-full max-w-full min-w-0 overflow-hidden flex flex-col items-center bg-slate-100 rounded-2xl border border-slate-300 p-3.5 space-y-4 ${className}`}
      data-testid="kakao-bubble-preview"
    >
      {/* Top Controls: View Filter */}
      <div className="w-full min-w-0 flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
        <span className="text-sm font-extrabold text-slate-800 shrink-0">
          미리보기
        </span>

        <div
          role="tablist"
          aria-label="미리보기 화면 전환"
          className="inline-flex max-w-full overflow-x-auto no-scrollbar rounded-xl bg-slate-200 p-1 border border-slate-300 text-sm"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewFilter === 'all'}
            data-testid="preview-mode-all"
            onClick={() => setViewFilter('all')}
            className={`min-h-[44px] px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
              viewFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            전체
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewFilter === 'bubble'}
            data-testid="preview-mode-kakao"
            onClick={() => setViewFilter('bubble')}
            className={`min-h-[44px] px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
              viewFilter === 'bubble'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {TERMS.previewBubbleTab}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewFilter === 'detail'}
            data-testid="preview-mode-postit"
            onClick={() => setViewFilter('detail')}
            className={`min-h-[44px] px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
              viewFilter === 'detail'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {TERMS.previewRecipientTab}
          </button>
        </div>
      </div>

      {/* 1. KakaoTalk Bubble Preview */}
      {viewFilter !== 'detail' && (
        <div className="w-full flex flex-col items-center py-4 px-3 bg-[#BACEE0] rounded-xl overflow-hidden shadow-inner">
          <div className="w-full max-w-[300px] bg-white rounded-2xl overflow-hidden shadow-md border border-slate-200/80">
            {/* 4-Item Thumbnail Canvas (1.91:1 aspect ratio) */}
            <div
              data-testid="og-quadrant-preview"
              data-theme-lock="dark"
              className="w-full aspect-[1.91/1] bg-slate-900 text-white grid grid-cols-2 grid-rows-2 relative overflow-hidden select-none"
            >
              {/* Item 1 (Top-Left): 지역 */}
              {onActivateUnit ? (
                <PreviewEditableUnit
                  unitId="dc-unit-region"
                  label="권역·동명"
                  onActivate={onActivateUnit}
                  isActive={activeUnitId === 'dc-unit-region'}
                  badgePosition="inside"
                  badgeText="✎"
                  activeBadgeText="편집"
                  testId="og-quadrant-region"
                  className="flex items-center justify-center p-2 border-r border-b border-slate-700/80 text-center"
                >
                  <span className="font-black text-white leading-tight text-base break-keep">
                    {regionText}
                  </span>
                </PreviewEditableUnit>
              ) : (
                <div
                  data-testid="og-quadrant-region"
                  className="flex items-center justify-center p-2 border-r border-b border-slate-700/80 text-center"
                >
                  <span className="font-black text-white leading-tight text-base break-keep">
                    {regionText}
                  </span>
                </div>
              )}

              {/* Item 2 (Top-Right): 용도 */}
              {onActivateUnit ? (
                <PreviewEditableUnit
                  unitId="dc-unit-use"
                  label="건물 용도"
                  onActivate={onActivateUnit}
                  isActive={activeUnitId === 'dc-unit-use'}
                  badgePosition="inside"
                  badgeText="✎"
                  activeBadgeText="편집"
                  testId="og-quadrant-use"
                  className="flex items-center justify-center p-2 border-b border-slate-700/80 text-center"
                >
                  <span className="font-black text-sky-400 leading-tight text-base break-keep">
                    {useText}
                  </span>
                </PreviewEditableUnit>
              ) : (
                <div
                  data-testid="og-quadrant-use"
                  className="flex items-center justify-center p-2 border-b border-slate-700/80 text-center"
                >
                  <span className="font-black text-sky-400 leading-tight text-base break-keep">
                    {useText}
                  </span>
                </div>
              )}

              {/* Item 3 (Bottom-Left): 면적 */}
              {onActivateUnit ? (
                <PreviewEditableUnit
                  unitId="dc-unit-area"
                  label="핵심 면적"
                  onActivate={onActivateUnit}
                  isActive={activeUnitId === 'dc-unit-area'}
                  badgePosition="inside"
                  badgeText="✎"
                  activeBadgeText="편집"
                  testId="og-quadrant-area"
                  className="flex items-center justify-center p-2 border-r border-slate-700/80 text-center"
                >
                  <span className="font-black text-slate-100 leading-tight text-base break-keep">
                    {areaText}
                  </span>
                </PreviewEditableUnit>
              ) : (
                <div
                  data-testid="og-quadrant-area"
                  className="flex items-center justify-center p-2 border-r border-slate-700/80 text-center"
                >
                  <span className="font-black text-slate-100 leading-tight text-base break-keep">
                    {areaText}
                  </span>
                </div>
              )}

              {/* Item 4 (Bottom-Right): 가격 */}
              {onActivateUnit ? (
                <PreviewEditableUnit
                  unitId="dc-unit-price"
                  label="매각 가격대"
                  onActivate={onActivateUnit}
                  isActive={activeUnitId === 'dc-unit-price'}
                  badgePosition="inside"
                  badgeText="✎"
                  activeBadgeText="편집"
                  testId="og-quadrant-price"
                  className="flex items-center justify-center p-2 text-center"
                >
                  <span className="font-black text-amber-400 leading-tight text-base break-keep">
                    {priceText}
                  </span>
                </PreviewEditableUnit>
              ) : (
                <div
                  data-testid="og-quadrant-price"
                  className="flex items-center justify-center p-2 text-center"
                >
                  <span className="font-black text-amber-400 leading-tight text-base break-keep">
                    {priceText}
                  </span>
                </div>
              )}
            </div>

            {/* Bubble Content Area: 18-char Title + CTA Button */}
            <div className="p-3.5 space-y-2.5">
              {wrapUnit(
                'dc-unit-headline',
                '한 줄 제목',
                <DealCardLineText
                  as="h4"
                  testId="kakao-bubble-og-title"
                  text={bubbleTitle}
                  preRepaired
                  className="font-extrabold text-slate-900 text-base"
                />,
                {
                  testId: 'preview-unit-headline',
                  badgePosition: 'inside',
                  className: 'rounded-lg px-1.5 py-1 -mx-1.5',
                }
              )}

              <button
                type="button"
                data-testid="kakao-bubble-detail-btn"
                onClick={() => {
                  setViewFilter('detail');
                  showPreviewHint(
                    '고객이 카톡 말풍선에서 [자세히 보기]를 눌렀을 때 열리는 상세 화면입니다.'
                  );
                }}
                className="w-full min-h-[44px] py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-center font-bold text-sm border border-slate-200 transition-colors cursor-pointer"
              >
                자세히 보기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Recipient Detail Screen Preview (Single Scroll in Column 3) */}
      {viewFilter !== 'bubble' && (
        <div
          data-testid="dealcard-postit-preview-list"
          data-theme-lock="dark"
          className="w-full rounded-2xl bg-[#0B0F14] text-white border-2 border-slate-800 shadow-lg overflow-hidden"
        >
          <div className="px-4 py-3 bg-[#141A21] border-b border-slate-800 flex items-center justify-between">
            <span className="text-sm font-extrabold text-slate-200">
              고객이 카톡에서 눌렀을 때 보는 화면
            </span>
          </div>

          <div
            data-testid="dealcard-mobile-detail-scroll"
            className="p-4 space-y-4"
          >
            {/* Compact 4-Item Summary Strip at top of detail view */}
            <div className="rounded-xl bg-[#141A21] border border-slate-800 p-3.5 space-y-2.5">
              <div className="grid grid-cols-2 gap-2 text-center text-sm font-extrabold">
                <div className="py-2 px-2.5 rounded-lg bg-slate-800/90 text-white break-keep">
                  {regionText}
                </div>
                <div className="py-2 px-2.5 rounded-lg bg-slate-800/90 text-sky-400 break-keep">
                  {useText}
                </div>
                {resolvedArea ? (
                  <div
                    data-testid="dealcard-detail-area-chip"
                    className="py-2 px-2.5 rounded-lg bg-slate-800/90 text-slate-200 break-keep"
                  >
                    {resolvedArea}
                  </div>
                ) : null}
                <div
                  className={`py-2 px-2.5 rounded-lg bg-slate-800/90 text-amber-400 break-keep ${
                    resolvedArea ? '' : 'col-span-2'
                  }`}
                >
                  {priceText}
                </div>
              </div>
              <DealCardLineText
                testId="dealcard-preview-customer-title"
                text={bubbleTitle}
                preRepaired
                className="text-base font-extrabold text-white text-center pt-0.5"
              />
            </div>

            {/* 장점 3줄 */}
            <div className="space-y-2.5">
              <span className="block text-sm font-extrabold text-amber-400 px-0.5">
                {TERMS.pointsSectionTitle}
              </span>

              {([0, 1, 2] as const).map((idx) => {
                const ptTitle = repairDealCardLine(card4.points[idx] || '') || '—';
                const toneKey: DealCardPointTone = card4.pointTones?.[idx] || DEFAULT_TONES[idx];
                const toneStyle = POSTIT_TONE_STYLES[toneKey] || POSTIT_TONE_STYLES.amber;

                return (
                  <React.Fragment key={idx}>
                    {wrapUnit(
                      `dc-unit-point-${idx}`,
                      `핵심 장점 ${idx + 1}`,
                      <div
                        data-testid={`dealcard-postit-preview-item-${idx}`}
                        style={{
                          backgroundColor: toneStyle.bgHex,
                          borderColor: toneStyle.borderHex,
                        }}
                        className="rounded-xl border border-l-4 px-3.5 py-3 flex items-center gap-2.5 shadow-2xs"
                      >
                        <span
                          style={{
                            backgroundColor: toneStyle.badgeBgHex,
                            color: toneStyle.badgeTextHex,
                          }}
                          className="text-sm font-extrabold px-2.5 py-0.5 rounded shrink-0"
                        >
                          0{idx + 1}
                        </span>
                        <DealCardLineText
                          testId={`dealcard-postit-preview-text-${idx}`}
                          text={ptTitle}
                          preRepaired
                          className="flex-1 text-base font-extrabold text-slate-950"
                        />
                      </div>,
                      {
                        badgeText: '✎ 눌러서 수정',
                        activeBadgeText: '수정 중',
                        className: 'rounded-xl',
                      }
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* 담당 중개사 안내 카드 */}
            {wrapUnit(
              'dc-unit-broker',
              '내 연락처·중개사 정보',
              <div
                data-testid="preview-broker-profile-card"
                className="rounded-xl bg-[#141A21] border border-slate-700/80 p-3.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-extrabold text-white break-keep">
                      {brokerName}
                    </span>
                    <span className="text-sm px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold shrink-0">
                      공인중개사
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1 break-keep">
                    {brokerSpecialty}
                  </p>
                </div>
              </div>,
              {
                testId: 'preview-unit-broker',
                badgePosition: 'inside',
                badgeText: '내 정보 수정 ›',
                activeBadgeText: '이동 중',
                className: 'rounded-xl',
              }
            )}

            {/* 하단 두 버튼 고정: [전화하기] [IM 요청하기] */}
            <div
              data-testid="preview-bottom-cta-group"
              className="grid grid-cols-2 gap-2.5 pt-1"
            >
              <a
                href={brokerPhone ? `tel:${brokerPhone.replace(/[^0-9]/g, '')}` : '#call'}
                onClick={(e) => {
                  if (!brokerPhone) {
                    e.preventDefault();
                    showPreviewHint(
                      '미리보기 화면입니다 — 중개사 연락처가 연결되면 고객이 바로 전화를 걸 수 있습니다.'
                    );
                  }
                }}
                data-testid="preview-cta-call-btn"
                className="min-h-[48px] py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-extrabold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <span>{TERMS.recipientCallCta}</span>
              </a>
              <button
                type="button"
                data-testid="preview-cta-im-request-btn"
                onClick={() =>
                  showPreviewHint(
                    '미리보기 화면입니다 — 실제 고객이 누르면 소통함에 상세 자료(IM) 요청이 도착합니다.'
                  )
                }
                className="min-h-[48px] py-3 px-3 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-sm font-extrabold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <span>{TERMS.recipientImRequestCta}</span>
              </button>
            </div>
            {previewHint && (
              <p
                role="status"
                aria-live="polite"
                data-testid="preview-cta-im-request-hint"
                className="text-sm font-semibold text-amber-200 bg-amber-500/15 border border-amber-400/30 rounded-xl px-3.5 py-2.5 break-keep"
              >
                {previewHint}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
