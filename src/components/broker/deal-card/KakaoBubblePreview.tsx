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
import type { Card4Data } from '@/lib/deal-card/card4-schema';

export interface KakaoBubblePreviewProps {
  card4: Card4Data;
  dealId?: string;
  className?: string;
}

export function KakaoBubblePreview({
  card4,
  dealId = 'preview',
  className = '',
}: KakaoBubblePreviewProps) {
  const [scaleMode, setScaleMode] = useState<'desktop' | 'mobile'>('mobile');

  const headline = `${card4.use || '근린생활시설'} · ${card4.region || '서울시'} · ${card4.priceBand || '가격 협의'}`;
  const bubbleTitle = `${card4.region || '서울시'} ${card4.use || '근생'} ${card4.priceBand || ''}`.trim();

  // Mobile bubble width is ~255px; desktop preview is ~380px
  const containerWidth = scaleMode === 'mobile' ? 'w-[255px]' : 'w-[380px]';

  return (
    <div
      className={`flex flex-col items-center bg-slate-100 rounded-2xl border border-slate-300 p-5 ${className}`}
      data-testid="kakao-bubble-preview"
    >
      {/* Top Controls: Scale Toggle */}
      <div className="w-full flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <span>💬</span>
          <span>카카오톡 공유 말풍선 미리보기</span>
        </span>

        <div className="inline-flex rounded-lg bg-slate-200 p-0.5 border border-slate-300 text-xs">
          <button
            type="button"
            onClick={() => setScaleMode('mobile')}
            className={`px-2.5 py-1 rounded-md font-medium transition ${
              scaleMode === 'mobile'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📱 모바일 (~255px)
          </button>
          <button
            type="button"
            onClick={() => setScaleMode('desktop')}
            className={`px-2.5 py-1 rounded-md font-medium transition ${
              scaleMode === 'desktop'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🖥️ PC (1:1)
          </button>
        </div>
      </div>

      {/* Realistic KakaoTalk Chat Room Background */}
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
                className={`font-black text-white leading-tight ${
                  scaleMode === 'mobile' ? 'text-[13px]' : 'text-[17px]'
                } break-keep tracking-tight`}
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
              className={`font-bold text-slate-900 ${
                scaleMode === 'mobile' ? 'text-[14px]' : 'text-[16px]'
              } break-keep leading-snug`}
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

      {/* Caption Notice */}
      <p className="text-[12px] text-slate-500 text-center mt-3 break-keep">
        💡 카카오톡 앱에서 수신자 말풍선 폭은 약 250~260px입니다. 각 특징이 18자 이내일 때 줄바꿈 없이 깔끔하게 표시됩니다.
      </p>
    </div>
  );
}
