'use client';

/**
 * HTML KakaoTalk Bubble Preview (WP-P1-08)
 *
 * Requirements:
 * 1. Supports 1:1 desktop view (~380px) and realistic ~255px mobile bubble view toggle.
 * 2. Visual presentation matches KakaoTalk chat UI (Kakao background #BACEE0, white bubble).
 * 3. Renders OG v2 card preview image + title + 3 points + action button.
 * 4. High performance: re-renders instantly (<300ms) upon Card4Data state changes.
 */

import React, { useState } from 'react';
import type { Card4Data, DealCardPointTone } from '@/lib/deal-card/card4-schema';
import { POSTIT_TONE_STYLES } from '@/components/broker/deal-card/Card4ConfirmCard';

export interface KakaoBubblePreviewProps {
  card4: Card4Data;
  dealId?: string;
  className?: string;
}

const DEFAULT_TONES: [DealCardPointTone, DealCardPointTone, DealCardPointTone] = [
  'amber',
  'sky',
  'mint',
];

export function KakaoBubblePreview({
  card4,
  dealId = 'preview',
  className = '',
}: KakaoBubblePreviewProps) {
  const [scaleMode, setScaleMode] = useState<'desktop' | 'mobile' | 'postit'>('mobile');

  const headline =
    card4.headline?.trim() ||
    `${card4.use || '근린생활시설'} · ${card4.region || '서울시'} · ${card4.priceBand || '가격 협의'}`;
  const bubbleTitle =
    card4.headline?.trim() ||
    `${card4.region || '서울시'} ${card4.use || '근생'} ${card4.priceBand || ''}`.trim();

  // Mobile bubble width is ~255px; desktop preview is ~380px
  const containerWidth = scaleMode === 'mobile' ? 'w-[255px]' : 'w-[380px]';

  return (
    <div
      className={`flex flex-col items-center bg-slate-100 rounded-2xl border border-slate-300 p-5 ${className}`}
      data-testid="kakao-bubble-preview"
    >
      {/* Top Controls: Scale Toggle */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 whitespace-nowrap">
          <span>💬</span>
          <span>카카오톡 말풍선 · 수신자 화면 미리보기</span>
        </span>

        <div className="inline-flex rounded-lg bg-slate-200 p-0.5 border border-slate-300 text-xs shrink-0">
          <button
            type="button"
            onClick={() => setScaleMode('mobile')}
            className={`px-2 py-1 rounded-md font-medium transition cursor-pointer whitespace-nowrap ${
              scaleMode === 'mobile'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📱 모바일
          </button>
          <button
            type="button"
            onClick={() => setScaleMode('desktop')}
            className={`px-2 py-1 rounded-md font-medium transition cursor-pointer whitespace-nowrap ${
              scaleMode === 'desktop'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🖥️ PC
          </button>
          <button
            type="button"
            data-testid="preview-mode-postit"
            onClick={() => setScaleMode('postit')}
            className={`px-2 py-1 rounded-md font-medium transition cursor-pointer whitespace-nowrap ${
              scaleMode === 'postit'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📋 상세 뷰
          </button>
        </div>
      </div>

      {/* Realistic KakaoTalk Chat Room Background */}
      {scaleMode !== 'postit' && (
        <div className="w-full flex justify-center py-6 px-4 bg-[#BACEE0] rounded-xl overflow-hidden shadow-inner">
          {/* Kakao Bubble */}
          <div
            className={`${containerWidth} transition-all duration-200 bg-white rounded-2xl overflow-hidden shadow-md border border-slate-200/80`}
          >
            {/* OG Image Simulated Canvas (1.91:1 aspect ratio) */}
            <div
              data-theme-lock="dark"
              className="w-full aspect-[1.91/1] bg-slate-900 text-white p-3.5 flex flex-col justify-between relative overflow-hidden select-none"
            >
              {/* Background subtle gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 opacity-90 pointer-events-none" />

              <div className="relative z-10 flex items-center justify-between">
                <span className="text-[10px] font-bold text-sky-400 bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-400/30">
                  CRE DEAL CARD
                </span>
                <span className="text-[9px] text-slate-400">비밀유지 안심 매물</span>
              </div>

              <div className="relative z-10 my-auto text-center px-1">
                <p
                  data-single-line-title="true"
                  title={headline}
                  className={`font-black text-white leading-tight ${
                    scaleMode === 'mobile' ? 'text-[13px]' : 'text-[16px]'
                  } whitespace-nowrap overflow-hidden text-ellipsis truncate tracking-tight`}
                >
                  {headline}
                </p>
              </div>

              <div className="relative z-10 flex items-center justify-between border-t border-slate-700/60 pt-1 text-[9px] text-slate-400">
                <span>🛡️ 공적장부 교차검증</span>
                <span className="text-sky-400 font-semibold">상세보기 →</span>
              </div>
            </div>

            {/* Bubble Content Area */}
            <div className="p-3.5 space-y-2">
              <h4
                data-single-line-title="true"
                title={bubbleTitle}
                className={`font-bold text-slate-900 ${
                  scaleMode === 'mobile' ? 'text-[14px]' : 'text-[16px]'
                } whitespace-nowrap overflow-hidden text-ellipsis truncate leading-snug`}
              >
                {bubbleTitle}
              </h4>

              {/* 3 Bullet Points */}
              <ul className="space-y-1 text-slate-600">
                {card4.points.map((pt, idx) => (
                  <li
                    key={idx}
                    className={`flex items-start gap-1.5 ${
                      scaleMode === 'mobile' ? 'text-[12px]' : 'text-[14px]'
                    } leading-snug break-keep`}
                  >
                    <span className="text-blue-500 font-bold shrink-0">•</span>
                    <span className="line-clamp-1">{pt || `포인트 ${idx + 1}`}</span>
                  </li>
                ))}
              </ul>

              {/* Simulated Action Button */}
              <div className="pt-2">
                <div
                  className={`w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-center font-semibold ${
                    scaleMode === 'mobile' ? 'text-[12px]' : 'text-[14px]'
                  } border border-slate-200`}
                >
                  자세히 보기
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clean 3-Point Detail Preview */}
      <div
        data-testid="dealcard-postit-preview-list"
        className={`w-full rounded-lg bg-white border border-slate-200 p-4 space-y-2.5 ${
          scaleMode === 'postit' ? 'mt-0' : 'mt-3'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
            <span>📌</span>
            <span>수신자 상세 화면 · 핵심 투자 포인트 3선</span>
          </span>
          <span className="text-[11px] font-semibold text-slate-500">
            핵심 요약 + 상세 해설
          </span>
        </div>

        <div className="space-y-2">
          {([0, 1, 2] as const).map((idx) => {
            const ptTitle = card4.points[idx] || `핵심 포인트 ${idx + 1}`;
            const ptBrief =
              card4.pointBriefs?.[idx] ||
              `${card4.region || '해당 권역'} ${card4.use || '매물'}의 핵심 매수 검토 포인트입니다.`;
            const toneKey: DealCardPointTone = card4.pointTones?.[idx] || DEFAULT_TONES[idx];
            const toneStyle = POSTIT_TONE_STYLES[toneKey] || POSTIT_TONE_STYLES.amber;

            return (
              <div
                key={idx}
                data-testid={`dealcard-postit-preview-item-${idx}`}
                style={{
                  backgroundColor: toneStyle.bgHex,
                  borderColor: toneStyle.borderHex,
                }}
                className="rounded-md border border-l-4 p-3 space-y-1 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span
                    style={{
                      backgroundColor: toneStyle.badgeBgHex,
                      color: toneStyle.badgeTextHex,
                    }}
                    className="text-[11px] font-extrabold px-2 py-0.5 rounded"
                  >
                    POINT 0{idx + 1}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-600">
                    {card4.region} · {card4.priceBand}
                  </span>
                </div>
                <p
                  data-single-line-title="true"
                  title={ptTitle}
                  className="text-[15px] font-extrabold text-slate-950 whitespace-nowrap overflow-hidden text-ellipsis truncate"
                >
                  {ptTitle}
                </p>
                <p className="text-xs font-medium text-slate-700 leading-relaxed line-clamp-2">
                  {ptBrief}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Caption Notice */}
      <p className="text-[12px] text-slate-500 text-center mt-3 break-keep">
        💡 카카오톡 앱에서 수신자 말풍선 폭은 약 250~260px입니다. 제목과 각 특징이 1줄로 깔끔하게 표시됩니다.
      </p>
    </div>
  );
}
