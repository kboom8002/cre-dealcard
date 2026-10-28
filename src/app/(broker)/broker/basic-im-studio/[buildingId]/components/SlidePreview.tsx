'use client';

import React, { useState } from 'react';
import type { PptxSlide } from '@/domain/building/pptx-studio/studio-service';
import { useTheme } from '@/contexts/ThemeContext';
import { formatSlidePageNumber } from '@/domain/building/mobile-im/pptx/header-footer';
import { splitFloorAndUnit } from '@/domain/building/mobile-im/floor-unit-resolver';
import { sqmToPyeong } from '@/lib/utils/area-conversion';

interface SlidePreviewProps {
  slide: PptxSlide;
  totalSlides?: number;
  visibleSlideNumber?: number;
  buildingContext?: Record<string, any>;
  onInlineChange?: (fieldKey: string, value: unknown) => void;
  onTitleChange?: (title: string) => void;
  onKickerChange?: (kicker: string) => void;
  onPrevSlide?: () => void;
  onNextSlide?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

interface InlineEditableProps {
  fieldKey: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onCommit?: (fieldKey: string, nextValue: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

function InlineEditableText({
  fieldKey,
  value,
  placeholder = '클릭하여 입력',
  multiline = false,
  onCommit,
  className = '',
  style,
}: InlineEditableProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!onCommit) {
    return (
      <span className={className} style={style}>
        {value || placeholder}
      </span>
    );
  }

  if (editing) {
    const commit = () => {
      setEditing(false);
      if (draft !== value) {
        onCommit(fieldKey, draft);
      }
    };
    if (multiline) {
      return (
        <textarea
          autoFocus
          rows={3}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              setDraft(value);
              setEditing(false);
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              commit();
            }
          }}
          className="w-full px-2 py-1 text-xs font-medium rounded border-2 border-[#1D4ED8] bg-white text-[#0F172A] shadow-lg focus:outline-none z-30 relative"
        />
      );
    }
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="w-full min-w-[80px] px-1.5 py-0.5 text-inherit font-bold rounded border-2 border-[#1D4ED8] bg-white text-[#0F172A] shadow-lg focus:outline-none z-30 relative"
      />
    );
  }

  return (
    <span
      onClick={e => {
        e.stopPropagation();
        setDraft(value);
        setEditing(true);
      }}
      title="클릭하여 슬라이드 위에서 바로 수정"
      className={`group/edit cursor-pointer rounded px-1 -mx-1 transition-all hover:ring-2 hover:ring-[#1D4ED8]/60 hover:bg-[#EFF6FF]/25 inline-block ${className}`}
      style={style}
    >
      {value || <span className="opacity-60 italic">{placeholder}</span>}
    </span>
  );
}

export function SlidePreview({
  slide,
  totalSlides = 10,
  visibleSlideNumber,
  buildingContext,
  onInlineChange,
  onTitleChange,
  onKickerChange,
  onPrevSlide,
  onNextSlide,
  isFullscreen = false,
  onToggleFullscreen,
}: SlidePreviewProps) {
  const { tokens, coverStyle, layoutStyle, headerFooterConfig } = useTheme();
  const [galleryPreviewPage, setGalleryPreviewPage] = useState<0 | 1>(0);
  const ov = (slide.slideOverrides || {}) as Record<string, any>;
  const ssot = buildingContext?.ssot_summary ?? {};
  const enrichment = buildingContext?.enrichment ?? {};
  const dataKey = slide.dataKey || 'overview';
  const slideNo = visibleSlideNumber ?? slide.slideIndex;

  const isDarkSlide = dataKey === 'cover' || dataKey === 'closing';
  const pageNumText = headerFooterConfig.showPageNumbers
    ? formatSlidePageNumber(slideNo, totalSlides, headerFooterConfig.pageNumberFormat)
    : '';

  const handleFieldCommit = (fieldKey: string, nextValue: string) => {
    if (fieldKey === '__slide_title__') {
      onTitleChange?.(nextValue);
      onInlineChange?.('title', nextValue);
      return;
    }
    if (fieldKey === '__slide_kicker__') {
      onKickerChange?.(nextValue);
      onInlineChange?.('kicker', nextValue);
      return;
    }
    onInlineChange?.(fieldKey, nextValue);
  };

  // Layout frame border helper
  const frameBorderStyle: React.CSSProperties =
    layoutStyle === 'executive'
      ? { borderTop: `4px solid #${tokens.accent}`, borderBottom: `3px solid #${tokens.ink}` }
      : layoutStyle === 'modern'
      ? { borderTop: `3px solid #${tokens.accent}` }
      : layoutStyle === 'dramatic'
      ? { borderLeft: `6px solid #${tokens.accent}` }
      : {};

  // ── 01 COVER SLIDE ──
  const renderCoverSlide = () => {
    const titleVal = String(ov.title || slide.title || buildingContext?.buildingName || '상업용 빌딩 매각 IM');
    const subVal = String(ov.subtitle || ssot.main_use || '상업용 부동산 매각 투자설명서');
    const addrVal = String(ov.address || ssot.address || '');
    const askVal = String(ov.askingPrice || '');
    const dateVal = String(ov.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '.');
    const companyVal = String(headerFooterConfig.companyName || ov.brokerCompany || tokens.companyName);

    return (
      <div
        className="w-full h-full relative flex flex-col justify-between p-7 sm:p-9 overflow-hidden select-none"
        style={{
          backgroundColor: `#${tokens.darkCard}`,
          color: `#${tokens.darkBody}`,
        }}
      >
        {/* Cover Style Geometric Decorations */}
        {coverStyle === 'split' ? (
          <div
            className="absolute right-0 top-0 bottom-0 w-[34%] flex flex-col justify-end p-6"
            style={{ backgroundColor: `#${tokens.accent}` }}
          >
            <div className="text-xs font-extrabold tracking-widest uppercase text-white/90 text-right">
              {headerFooterConfig.companyTagline || tokens.companyTagline}
            </div>
          </div>
        ) : coverStyle === 'hero_dark' ? (
          <>
            <div className="absolute top-0 left-0 right-0 h-2" style={{ backgroundColor: `#${tokens.accent}` }} />
            <div className="absolute bottom-0 left-0 right-0 h-2" style={{ backgroundColor: `#${tokens.accent}` }} />
            <div
              className="absolute inset-6 rounded-xl pointer-events-none"
              style={{ border: `1.5px solid #${tokens.accent}66` }}
            />
          </>
        ) : coverStyle === 'corporate_card' ? (
          <div
            className="absolute right-6 top-6 bottom-6 w-[30%] rounded-xl p-5 flex flex-col justify-between"
            style={{
              backgroundColor: `#${tokens.darkBlock}`,
              border: `1px solid #${tokens.darkBorder}`,
            }}
          >
            <div className="text-[10px] font-bold tracking-widest uppercase" style={{ color: `#${tokens.accentL}` }}>
              EXECUTIVE BRIEFING
            </div>
            <div className="space-y-2">
              {askVal && (
                <div>
                  <div className="text-[10px]" style={{ color: `#${tokens.darkMute}` }}>매매 희망가</div>
                  <div className="text-lg font-black" style={{ color: `#${tokens.accentL}` }}>{askVal}</div>
                </div>
              )}
              {addrVal && (
                <div>
                  <div className="text-[10px]" style={{ color: `#${tokens.darkMute}` }}>소재지</div>
                  <div className="text-xs font-bold text-white line-clamp-2">{addrVal}</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Default: institutional_masses / obsidian_glow */
          <div className="absolute right-0 top-0 flex items-start gap-1.5 pr-4">
            <div className="w-16 h-44" style={{ backgroundColor: `#${tokens.ink}` }} />
            <div className="w-14 h-36 mt-6" style={{ backgroundColor: `#${tokens.ink2}` }} />
            <div className="w-14 h-28 mt-12" style={{ backgroundColor: `#${tokens.accentD}` }} />
          </div>
        )}

        {/* Top Bar: Kicker + Confidentiality Badge */}
        <div className="relative z-10 flex items-center justify-between max-w-[64%]">
          <div className="flex items-center gap-2">
            <span
              className="px-2.5 py-0.5 rounded text-[10px] font-extrabold tracking-widest uppercase"
              style={{
                backgroundColor: `#${tokens.darkAccentBg}`,
                color: `#${tokens.darkAccentText}`,
                border: `1px solid #${tokens.darkAccentBorder}`,
              }}
            >
              <InlineEditableText
                fieldKey="__slide_kicker__"
                value={slide.kicker || 'INVESTMENT MEMORANDUM'}
                onCommit={handleFieldCommit}
              />
            </span>
            <span className="text-[10px] font-bold tracking-wider" style={{ color: `#${tokens.darkMute}` }}>
              {headerFooterConfig.confidentialityBadge}
            </span>
          </div>
        </div>

        {/* Center Hero Title & Key Metadata */}
        <div className="relative z-10 max-w-[64%] my-auto space-y-3">
          <div className="w-14 h-1 rounded-full" style={{ backgroundColor: `#${tokens.accent}` }} />
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
            <InlineEditableText
              fieldKey="title"
              value={titleVal}
              placeholder="빌딩 매각 제목 입력"
              onCommit={handleFieldCommit}
            />
          </h2>
          <p className="text-sm sm:text-base font-semibold" style={{ color: `#${tokens.accentL}` }}>
            <InlineEditableText
              fieldKey="subtitle"
              value={subVal}
              placeholder="부제목 입력"
              onCommit={handleFieldCommit}
            />
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-3 text-xs">
            {addrVal && (
              <span
                className="px-3 py-1 rounded-lg font-bold"
                style={{ backgroundColor: `#${tokens.darkBlock}`, color: '#FFFFFF' }}
              >
                📍{' '}
                <InlineEditableText
                  fieldKey="address"
                  value={addrVal}
                  onCommit={handleFieldCommit}
                />
              </span>
            )}
            {askVal && (
              <span
                className="px-3 py-1 rounded-lg font-extrabold"
                style={{
                  backgroundColor: `#${tokens.darkAccentBg}`,
                  color: `#${tokens.darkAccentText}`,
                }}
              >
                매매 희망가:{' '}
                <InlineEditableText
                  fieldKey="askingPrice"
                  value={askVal}
                  onCommit={handleFieldCommit}
                />
              </span>
            )}
          </div>
        </div>

        {/* Bottom Branding Footer */}
        <div
          className="relative z-10 pt-3 border-t flex items-center justify-between text-xs max-w-[64%]"
          style={{ borderColor: `#${tokens.darkBorder}` }}
        >
          <div className="flex items-center gap-2.5">
            {headerFooterConfig.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headerFooterConfig.logoUrl}
                alt="로고"
                className="h-5 w-auto object-contain rounded bg-white/90 px-1"
              />
            )}
            <span className="font-extrabold text-white">
              <InlineEditableText
                fieldKey="brokerCompany"
                value={companyVal}
                onCommit={handleFieldCommit}
              />
            </span>
            {ov.brokerName && (
              <span style={{ color: `#${tokens.darkMute}` }}>
                · 담당: <InlineEditableText fieldKey="brokerName" value={String(ov.brokerName)} onCommit={handleFieldCommit} />
              </span>
            )}
          </div>
          <span className="font-mono text-[11px]" style={{ color: `#${tokens.darkMute}` }}>
            작성일: <InlineEditableText fieldKey="date" value={dateVal} onCommit={handleFieldCommit} />
          </span>
        </div>
      </div>
    );
  };

  // ── 02 HIGHLIGHTS / SUMMARY SLIDE ──
  const renderHighlightsSlide = () => {
    const kpis = [
      { key: 'askingPrice', label: '매매 희망가', value: ov.askingPrice || '상담 요망', highlight: true },
      { key: 'grossYield', label: '현행 임대수익률', value: ov.grossYield || '-', highlight: true },
      { key: 'stabilizedYield', label: '안정화 기대수익률', value: ov.stabilizedYield || ov.grossYield || '-', highlight: false },
      { key: 'vacancySignal', label: '임대 가동 현황', value: ov.vacancySignal || '안정 운영', highlight: false },
    ];

    const points = [
      { key: 'keyInvestmentPoint', num: '01', title: '핵심 입지 및 수익 구조', text: ov.keyInvestmentPoint || '' },
      { key: 'investmentPoint2', num: '02', title: '토지·건물 물리적 제원 강점', text: ov.investmentPoint2 || '' },
      { key: 'investmentPoint3', num: '03', title: '밸류애드(Value-Add) 및 수익 상승 여력', text: ov.investmentPoint3 || '' },
    ];

    return (
      <div className="flex-1 flex flex-col justify-between gap-2 min-h-0">
        {/* Lead Sentence Banner */}
        <div
          className="px-3.5 py-2 rounded-xl border-l-4 text-xs sm:text-sm font-extrabold leading-snug"
          style={{
            backgroundColor: `#${tokens.accentT}`,
            borderColor: `#${tokens.accent}`,
            color: `#${tokens.ink}`,
          }}
        >
          <InlineEditableText
            fieldKey="leadSentence"
            value={String(ov.leadSentence || ov.keyInvestmentPoint || '')}
            placeholder="핵심 투자 리드 문장을 입력하세요"
            onCommit={handleFieldCommit}
          />
        </div>

        {/* 4 KPI Stat Cards */}
        <div className="grid grid-cols-4 gap-2">
          {kpis.map(k => (
            <div
              key={k.key}
              className="p-2.5 rounded-xl border flex flex-col justify-between"
              style={{
                backgroundColor: k.highlight ? `#${tokens.ink}` : `#${tokens.tint}`,
                borderColor: k.highlight ? `#${tokens.ink2}` : `#${tokens.line}`,
                color: k.highlight ? '#FFFFFF' : `#${tokens.ink}`,
              }}
            >
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: k.highlight ? `#${tokens.accentL}` : `#${tokens.slate}` }}
              >
                {k.label}
              </span>
              <div className="text-sm sm:text-base font-black mt-0.5 truncate">
                <InlineEditableText
                  fieldKey={k.key}
                  value={String(k.value)}
                  onCommit={handleFieldCommit}
                />
              </div>
            </div>
          ))}
        </div>

        {/* 3 Investment Highlight Pillars */}
        <div className="space-y-1.5 flex-1 flex flex-col justify-center min-h-0">
          {points.map(pt => (
            <div
              key={pt.key}
              className="px-3 py-1.5 rounded-xl border flex items-center gap-2.5 bg-white"
              style={{ borderColor: `#${tokens.line}` }}
            >
              <span
                className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 text-white"
                style={{ backgroundColor: `#${tokens.accent}`, color: '#FFFFFF' }}
              >
                {pt.num}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-[#0F172A] leading-snug line-clamp-2">
                  <InlineEditableText
                    fieldKey={pt.key}
                    value={String(pt.text)}
                    placeholder={`${pt.title} 내용을 입력하세요`}
                    onCommit={handleFieldCommit}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── 03 OVERVIEW SLIDE ──
  const renderOverviewSlide = () => {
    const specRows = [
      { key: 'address', label: '소재지', val: ov.address },
      { key: 'landArea', label: '대지면적', val: ov.landArea },
      { key: 'archArea', label: '건축면적', val: ov.archArea || '-' },
      { key: 'grossArea', label: '연면적', val: ov.grossArea },
      { key: 'floors', label: '건축규모', val: ov.floors },
      { key: 'zoning', label: '용도지역', val: ov.zoning },
      { key: 'bcrFar', label: '건폐율 / 용적률', val: ov.bcrFar },
      { key: 'completionYear', label: '사용승인연도', val: ov.completionYear },
      { key: 'parkingElevator', label: '주차 / 승강기', val: ov.parkingElevator },
      { key: 'mainUse', label: '주용도 / 주구조', val: [ov.mainUse, ov.structureType].filter(Boolean).join(' · ') },
    ];

    const rawCtxPhotos: any[] =
      Array.isArray(buildingContext?.photos_v2) && buildingContext.photos_v2.length > 0
        ? buildingContext.photos_v2
        : Array.isArray(buildingContext?.photos)
        ? buildingContext.photos
        : [];
    const activeCtxPhotos = rawCtxPhotos.filter((p: any) => p && p.included !== false && p.excluded !== true);
    const pickedHeroOrExt =
      activeCtxPhotos.find((p: any) => typeof p === 'object' && (p.isHero || p.role === 'cover')) ||
      activeCtxPhotos.find((p: any) => typeof p === 'object' && (p.role === 'exterior' || p.category === 'exterior')) ||
      activeCtxPhotos[0];
    const firstPhoto = typeof pickedHeroOrExt === 'string' ? pickedHeroOrExt : pickedHeroOrExt?.url;

    return (
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* Left 7 cols: 9-row Spec Table + Price Bar */}
        <div className="col-span-7 flex flex-col justify-between min-h-0">
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: `#${tokens.line}` }}>
            <div
              className="px-3 py-1.5 text-[11px] font-extrabold text-white flex items-center justify-between"
              style={{ backgroundColor: `#${tokens.ink}` }}
            >
              <span>건축물대장 · 토지이용계획확인서 제원</span>
              <span className="text-[10px] opacity-80">✓ 공부확인</span>
            </div>
            <div className="divide-y" style={{ borderColor: `#${tokens.line2}` }}>
              {specRows.map((r, i) => (
                <div
                  key={r.key}
                  className="grid grid-cols-12 px-3 py-1 text-[11px] items-center"
                  style={{ backgroundColor: i % 2 === 1 ? `#${tokens.tint}` : '#FFFFFF' }}
                >
                  <span className="col-span-4 font-bold" style={{ color: `#${tokens.slate}` }}>
                    {r.label}
                  </span>
                  <span className="col-span-8 font-extrabold text-[#0F172A] truncate">
                    <InlineEditableText
                      fieldKey={r.key}
                      value={String(r.val || '-')}
                      onCommit={handleFieldCommit}
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Price Box */}
          <div
            className="mt-2 px-3.5 py-2 rounded-xl flex items-center justify-between text-xs"
            style={{ backgroundColor: `#${tokens.ink}`, color: '#FFFFFF' }}
          >
            <div>
              <span className="text-[10px] font-bold" style={{ color: `#${tokens.accentL}` }}>매매 희망가</span>
              <div className="text-sm font-black">
                <InlineEditableText fieldKey="askingPrice" value={String(ov.askingPrice || '상담')} onCommit={handleFieldCommit} />
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold" style={{ color: `#${tokens.accentL}` }}>토지 평당가</span>
              <div className="text-sm font-black">
                <InlineEditableText fieldKey="landUnitPrice" value={String(ov.landUnitPrice || '-')} onCommit={handleFieldCommit} />
              </div>
            </div>
          </div>
        </div>

        {/* Right 5 cols: Exterior Photo / Callout Box */}
        <div className="col-span-5 flex flex-col gap-2.5 min-h-0">
          <div
            className="h-36 rounded-xl border overflow-hidden relative flex items-center justify-center"
            style={{ backgroundColor: `#${tokens.tint}`, borderColor: `#${tokens.line}` }}
          >
            {typeof firstPhoto === 'string' && firstPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={firstPhoto} alt="건물 외관" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center p-3">
                <div className="text-xl mb-1">🏢</div>
                <div className="text-[11px] font-bold" style={{ color: `#${tokens.ink}` }}>
                  {ov.buildingName || buildingContext?.buildingName || '본건 외관 대표 이미지'}
                </div>
              </div>
            )}
          </div>

          <div
            className="flex-1 p-3 rounded-xl border flex flex-col justify-between"
            style={{
              backgroundColor: `#${tokens.accentT}`,
              borderColor: `#${tokens.accentL}`,
            }}
          >
            <div>
              <div className="text-[11px] font-extrabold mb-1" style={{ color: `#${tokens.ink}` }}>
                ✦ 자산 핵심 체크포인트
              </div>
              <div className="text-[11px] font-medium text-[#1E293B] whitespace-pre-line leading-relaxed line-clamp-5">
                <InlineEditableText
                  fieldKey="rightCallout"
                  value={String(ov.rightCallout || '')}
                  multiline
                  onCommit={handleFieldCommit}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── 04 LOCATION SLIDE ──
  const renderLocationSlide = () => {
    const locRows = [
      { key: 'address', label: '소재지', val: ov.address },
      { key: 'transitInfo', label: '대중교통 · 역세권', val: ov.transitInfo },
      { key: 'roadInfo', label: '접면도로 · 진입성', val: ov.roadInfo },
      { key: 'areaInfo', label: '배후 상권 · 권역', val: ov.areaInfo },
    ];

    return (
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* Left 6 cols: Location Map / POI Radar */}
        <div
          className="col-span-6 rounded-xl border overflow-hidden relative flex flex-col justify-between p-4"
          style={{ backgroundColor: `#${tokens.tint}`, borderColor: `#${tokens.line}` }}
        >
          {ov.mapImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ov.mapImageUrl} alt="위치도" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <>
              {/* Stylized Vector Map Radar */}
              <svg className="absolute inset-0 w-full h-full opacity-35" viewBox="0 0 400 300">
                <circle cx="200" cy="150" r="45" fill="none" stroke={`#${tokens.accent}`} strokeWidth="1.5" strokeDasharray="4 4" />
                <circle cx="200" cy="150" r="95" fill="none" stroke={`#${tokens.ink}`} strokeWidth="1" strokeDasharray="4 4" />
                <line x1="0" y1="150" x2="400" y2="150" stroke={`#${tokens.line}`} strokeWidth="2" />
                <line x1="200" y1="0" x2="200" y2="300" stroke={`#${tokens.line}`} strokeWidth="2" />
                <line x1="40" y1="30" x2="360" y2="270" stroke={`#${tokens.line}`} strokeWidth="6" />
              </svg>
              <div className="relative z-10 flex items-center justify-between">
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-extrabold text-white"
                  style={{ backgroundColor: `#${tokens.ink}` }}
                >
                  반경 500m 입지·교통 분석도
                </span>
                <span className="text-[10px] font-bold text-[#475569]">© 카카오맵 · 국토부 공간정보</span>
              </div>
              <div className="relative z-10 my-auto mx-auto text-center">
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black text-white shadow-md"
                  style={{ backgroundColor: `#${tokens.accent}` }}
                >
                  <span>📍 본건 위치</span>
                </div>
                <div className="mt-2 text-xs font-extrabold text-[#0F172A] bg-white/90 px-2.5 py-1 rounded-md border border-[#CBD5E1]">
                  {ov.transitInfo || '역세권 핵심 입지'}
                </div>
              </div>
              <div className="relative z-10 text-[10px] font-bold text-[#334155] bg-white/85 px-2.5 py-1 rounded border border-[#E2E8F0]">
                소재지: {ov.address || '-'}
              </div>
            </>
          )}
        </div>

        {/* Right 6 cols: Location Table + Callout */}
        <div className="col-span-6 flex flex-col justify-between gap-3 min-h-0">
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: `#${tokens.line}` }}>
            <div
              className="px-3 py-1.5 text-[11px] font-extrabold text-white"
              style={{ backgroundColor: `#${tokens.ink}` }}
            >
              교통 · 도로 · 상권 여건 요약
            </div>
            <div className="divide-y" style={{ borderColor: `#${tokens.line2}` }}>
              {locRows.map((r, i) => (
                <div
                  key={r.key}
                  className="grid grid-cols-12 px-3 py-2 text-xs items-center"
                  style={{ backgroundColor: i % 2 === 1 ? `#${tokens.tint}` : '#FFFFFF' }}
                >
                  <span className="col-span-4 font-bold" style={{ color: `#${tokens.slate}` }}>
                    {r.label}
                  </span>
                  <span className="col-span-8 font-extrabold text-[#0F172A]">
                    <InlineEditableText
                      fieldKey={r.key}
                      value={String(r.val || '-')}
                      onCommit={handleFieldCommit}
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="flex-1 p-3.5 rounded-xl border flex flex-col justify-center"
            style={{
              backgroundColor: `#${tokens.accentT}`,
              borderColor: `#${tokens.accent}`,
            }}
          >
            <div className="text-xs font-extrabold mb-1" style={{ color: `#${tokens.ink}` }}>
              🚇 입지 및 상권 종합 의견
            </div>
            <div className="text-xs font-medium text-[#1E293B] leading-relaxed">
              <InlineEditableText
                fieldKey="locationCallout"
                value={String(ov.locationCallout || '')}
                multiline
                onCommit={handleFieldCommit}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── 05 LAND & ZONING SLIDE ──
  const renderLandSlide = () => {
    const rawCad = ov.cadastralMapImage || enrichment?.cadastralMapImage;
    const cadastralSrc = typeof rawCad === 'object' && rawCad !== null ? (rawCad as any).base64 : rawCad;
    const hasCadastralImg =
      typeof cadastralSrc === 'string' &&
      (cadastralSrc.startsWith('data:image') || cadastralSrc.startsWith('http') || cadastralSrc.startsWith('/'));
    const landRows = [
      { key: 'landArea', label: '대지면적', val: ov.landArea },
      { key: 'landCategory', label: '지목', val: ov.landCategory || '대' },
      { key: 'zoningInfo', label: '용도지역·지구', val: ov.zoningInfo },
      { key: 'bcrFar', label: '건폐율 / 용적률', val: ov.bcrFar },
      { key: 'officialLandPrice', label: '개별공시지가', val: ov.officialLandPrice },
    ];

    return (
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* Left 5 cols: Cadastral Map */}
        <div
          className="col-span-5 rounded-xl border overflow-hidden relative flex flex-col justify-between p-3"
          style={{ backgroundColor: `#${tokens.tint}`, borderColor: `#${tokens.line}` }}
        >
          {hasCadastralImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cadastralSrc} alt="지적도" className="w-full h-full object-cover rounded-lg" />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-3">
              <svg className="w-28 h-24 mb-2" viewBox="0 0 120 100">
                <polygon
                  points="25,20 95,15 105,75 20,85"
                  fill={`#${tokens.accent}22`}
                  stroke={`#${tokens.accent}`}
                  strokeWidth="2.5"
                />
                <line x1="5" y1="88" x2="115" y2="78" stroke={`#${tokens.ink}`} strokeWidth="3" />
              </svg>
              <div className="text-xs font-extrabold text-[#0F172A]">V-World 연속지적도 · 필지 경계</div>
              <div className="text-[11px] font-medium text-[#475569] mt-0.5">
                {ov.landArea || '단일/다필지 대지 제원'}
              </div>
            </div>
          )}
          <div className="text-[10px] font-bold text-[#475569] text-right">
            출처: 토지이음 · 국토교통부 V-World
          </div>
        </div>

        {/* Right 7 cols: Land Use Plan Official Format */}
        <div className="col-span-7 flex flex-col justify-between gap-2.5 min-h-0">
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: `#${tokens.line}` }}>
            <div
              className="px-3 py-1.5 text-[11px] font-extrabold text-white flex justify-between"
              style={{ backgroundColor: `#${tokens.ink}` }}
            >
              <span>토지이용계획확인원 핵심 제원</span>
              <span>✓ 공부확인</span>
            </div>
            <div className="divide-y" style={{ borderColor: `#${tokens.line2}` }}>
              {landRows.map((r, i) => (
                <div
                  key={r.key}
                  className="grid grid-cols-12 px-3 py-1.5 text-xs items-center"
                  style={{ backgroundColor: i % 2 === 1 ? `#${tokens.tint}` : '#FFFFFF' }}
                >
                  <span className="col-span-4 font-bold" style={{ color: `#${tokens.slate}` }}>
                    {r.label}
                  </span>
                  <span className="col-span-8 font-extrabold text-[#0F172A] truncate">
                    <InlineEditableText fieldKey={r.key} value={String(r.val || '-')} onCommit={handleFieldCommit} />
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-xl border bg-white" style={{ borderColor: `#${tokens.line}` }}>
              <div className="text-[10px] font-extrabold mb-0.5" style={{ color: `#${tokens.ink}` }}>
                국토의 계획 및 이용에 관한 법률
              </div>
              <div className="text-[11px] font-medium text-[#1E293B] line-clamp-2">
                <InlineEditableText fieldKey="nationalLaw" value={String(ov.nationalLaw || '-')} onCommit={handleFieldCommit} />
              </div>
            </div>
            <div className="p-2.5 rounded-xl border bg-white" style={{ borderColor: `#${tokens.line}` }}>
              <div className="text-[10px] font-extrabold mb-0.5" style={{ color: `#${tokens.ink}` }}>
                다른 법령 등에 따른 지역·지구
              </div>
              <div className="text-[11px] font-medium text-[#1E293B] line-clamp-2">
                <InlineEditableText fieldKey="otherLaws" value={String(ov.otherLaws || '-')} onCommit={handleFieldCommit} />
              </div>
            </div>
          </div>

          <div
            className="p-2.5 rounded-xl border text-xs"
            style={{ backgroundColor: `#${tokens.accentT}`, borderColor: `#${tokens.accent}` }}
          >
            <span className="font-extrabold mr-1.5" style={{ color: `#${tokens.ink}` }}>📋 공법 검토 의견:</span>
            <InlineEditableText fieldKey="landCallout" value={String(ov.landCallout || '')} onCommit={handleFieldCommit} />
          </div>
        </div>
      </div>
    );
  };

  // ── 06 RENT ROLL & STACKING PLAN SLIDE ──
  const renderRentRollSlide = () => {
    const rawLeases: any[] = Array.isArray(ov.tenantData) && ov.tenantData.length > 0
      ? ov.tenantData
      : (Array.isArray(buildingContext?.floor_leases) ? buildingContext.floor_leases : []);

    const parsedLeases = rawLeases.map((r: any, idx: number) => {
      const split = splitFloorAndUnit(String(r?.floor ?? `${idx + 1}F`), r?.unit_label ?? r?.unit_number ?? r?.unit);
      const isVac = Boolean(r?.is_vacant || String(r?.status || '').includes('공실') || String(r?.tenant_name || r?.tenant || '').includes('공실'));
      const rawPy = Number(r?.area_pyeong);
      const rawSqm = Number(r?.area_sqm ?? r?.area);
      const areaPy = Number.isFinite(rawPy) && rawPy > 0
        ? rawPy
        : Number.isFinite(rawSqm) && rawSqm > 0
        ? sqmToPyeong(rawSqm)
        : null;
      const tenant = isVac
        ? '공실'
        : String(r?.tenant_name || r?.tenant || r?.tenant_type || r?.use || '임차 운영 중').trim();
      return {
        ...r,
        floorKey: split.floorKey,
        floorLabel: split.floorLabel,
        floorOrder: split.order,
        unitLabel: split.unitLabel,
        isVac,
        areaPy,
        tenant,
      };
    });

    // Floor-grouped stacking plan (top floor first)
    const floorGroupMap = new Map<string, { floorLabel: string; floorOrder: number; tenants: string[]; vacantCount: number; unitCount: number }>();
    for (const row of parsedLeases) {
      const g = floorGroupMap.get(row.floorKey) || {
        floorLabel: row.floorLabel,
        floorOrder: row.floorOrder,
        tenants: [] as string[],
        vacantCount: 0,
        unitCount: 0,
      };
      g.unitCount += 1;
      if (row.isVac) g.vacantCount += 1;
      else if (row.tenant && !g.tenants.includes(String(row.tenant))) g.tenants.push(String(row.tenant));
      floorGroupMap.set(row.floorKey, g);
    }
    const stackingFloors = Array.from(floorGroupMap.values())
      .sort((a, b) => b.floorOrder - a.floorOrder)
      .slice(0, 7);

    const displayLeases = parsedLeases.slice(0, 6);
    const hasUnitColumn = parsedLeases.some(r => Boolean(r.unitLabel));

    return (
      <div className="flex-1 flex flex-col justify-between gap-2.5 min-h-0">
        {/* Top Summary KPI Strip */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { key: 'depositTotal', label: '총 보증금 합계', val: ov.depositTotal || '-' },
            { key: 'monthlyRentTotal', label: '월 임대료 합계', val: ov.monthlyRentTotal || '-' },
            { key: 'occupancyRate', label: '임대 가동률 · 공실현황', val: ov.occupancyRate || ov.vacancySignal || '100%' },
          ].map(m => (
            <div
              key={m.key}
              className="px-3.5 py-2 rounded-xl border flex items-center justify-between"
              style={{ backgroundColor: `#${tokens.tint}`, borderColor: `#${tokens.line}` }}
            >
              <span className="text-[11px] font-bold" style={{ color: `#${tokens.slate}` }}>{m.label}</span>
              <span className="text-sm font-black text-[#0F172A]">
                <InlineEditableText fieldKey={m.key} value={String(m.val)} onCommit={handleFieldCommit} />
              </span>
            </div>
          ))}
        </div>

        {/* Center: Left Stacking Plan (4 cols) + Right Rent Roll Table (8 cols) */}
        <div className="grid grid-cols-12 gap-3 flex-1 min-h-0">
          {/* Left Floor-Grouped Stacking Plan */}
          <div
            className="col-span-4 rounded-xl border overflow-hidden flex flex-col"
            style={{ borderColor: `#${tokens.line}`, backgroundColor: `#${tokens.tint}` }}
          >
            <div
              className="px-2.5 py-1.5 text-[10px] font-extrabold text-white flex items-center justify-between"
              style={{ backgroundColor: `#${tokens.ink}` }}
            >
              <span>층별 스태킹 플랜</span>
              <span className="opacity-80">{floorGroupMap.size}개 층</span>
            </div>
            {stackingFloors.length > 0 ? (
              <div className="p-2 space-y-1 flex-1 flex flex-col justify-center">
                {stackingFloors.map(fl => {
                  const allVacant = fl.vacantCount === fl.unitCount;
                  const firstTenant = fl.tenants[0] || (allVacant ? '공실' : '임차 중');
                  const shortFirst = firstTenant.length > 7 ? `${firstTenant.slice(0, 7)}…` : firstTenant;
                  const summaryLabel =
                    fl.unitCount > 1
                      ? `${shortFirst}(외${fl.unitCount - 1})`
                      : firstTenant;
                  return (
                    <div
                      key={fl.floorLabel}
                      className="px-2 py-1 rounded border flex items-center justify-between text-[10px]"
                      style={{
                        backgroundColor: allVacant ? `#${tokens.redL}` : '#FFFFFF',
                        borderColor: allVacant ? `#${tokens.red}` : `#${tokens.line}`,
                      }}
                    >
                      <span className="font-mono font-extrabold text-[#0F172A] w-8">{fl.floorLabel}</span>
                      <span
                        className="font-bold truncate flex-1 text-right"
                        style={{ color: allVacant ? `#${tokens.red}` : '#0F172A' }}
                      >
                        {summaryLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 text-center text-[11px] text-[#475569] my-auto">층별 스태킹 자동 생성</div>
            )}
          </div>

          {/* Right Rent Roll Table */}
          <div className="col-span-8 rounded-xl border overflow-hidden flex flex-col" style={{ borderColor: `#${tokens.line}` }}>
            <div
              className="grid grid-cols-12 px-3 py-1.5 text-[10px] font-extrabold text-white items-center"
              style={{ backgroundColor: `#${tokens.ink}` }}
            >
              <span className={hasUnitColumn ? 'col-span-1' : 'col-span-2'}>층</span>
              {hasUnitColumn && <span className="col-span-2">호수</span>}
              <span className={hasUnitColumn ? 'col-span-3' : 'col-span-4'}>임차인 · 업종</span>
              <span className="col-span-2 text-right">면적(평)</span>
              <span className="col-span-2 text-right">보증금</span>
              <span className="col-span-2 text-right">월임대료</span>
            </div>
            {displayLeases.length > 0 ? (
              <div className="divide-y flex-1" style={{ borderColor: `#${tokens.line2}` }}>
                {displayLeases.map((r: any, idx: number) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 px-3 py-1 text-[10px] items-center"
                    style={{
                      backgroundColor: r.isVac ? `#${tokens.redL}` : idx % 2 === 1 ? `#${tokens.tint}` : '#FFFFFF',
                    }}
                  >
                    <span className={`${hasUnitColumn ? 'col-span-1' : 'col-span-2'} font-extrabold text-[#0F172A]`}>
                      {r.floorLabel}
                    </span>
                    {hasUnitColumn && (
                      <span className="col-span-2 font-mono font-bold text-[#334155] truncate">
                        {r.unitLabel || '-'}
                      </span>
                    )}
                    <span
                      className={`${hasUnitColumn ? 'col-span-3' : 'col-span-4'} font-bold truncate`}
                      style={{ color: r.isVac ? `#${tokens.red}` : '#0F172A' }}
                    >
                      {r.isVac ? '공실 (즉시 입주)' : r.tenant}
                    </span>
                    <span className="col-span-2 text-right font-mono text-[#334155]">
                      {r.areaPy != null ? `${r.areaPy.toFixed(1)}평` : '-'}
                    </span>
                    <span className="col-span-2 text-right font-mono font-bold text-[#0F172A]">
                      {r.deposit_manwon != null ? `${Number(r.deposit_manwon).toLocaleString()}만` : '-'}
                    </span>
                    <span className="col-span-2 text-right font-mono font-extrabold text-[#0F172A]">
                      {r.rent_manwon != null ? `${Number(r.rent_manwon).toLocaleString()}만` : '-'}
                    </span>
                  </div>
                ))}
                {parsedLeases.length > 6 && (
                  <div className="px-3 py-1 text-[10px] font-bold text-[#1E3A8A] bg-[#EFF6FF] flex items-center justify-between">
                    <span>외 {parsedLeases.length - 6}개 호실</span>
                    {parsedLeases.length > 12 && (
                      <span>📄 총 {parsedLeases.length}개 호실 — PPTX 다운로드 시 2면 분할</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-center text-xs font-medium text-[#475569] my-auto">
                층별 상세 임대차 내역은 우측 편집 패널 또는 딜카드 렌트롤 탭에서 연동됩니다.
              </div>
            )}
          </div>
        </div>

        {/* Bottom Turnaround / Value-Add Strategy Banner */}
        <div
          className="px-3.5 py-2 rounded-xl border"
          style={{ backgroundColor: `#${tokens.accentT}`, borderColor: `#${tokens.accent}` }}
        >
          <div className="text-[11px] font-extrabold" style={{ color: `#${tokens.ink}` }}>
            <InlineEditableText
              fieldKey="stabilizedYieldTitle"
              value={String(ov.stabilizedYieldTitle || '매입 후 임대차 재구성(Value-Add) 전략')}
              onCommit={handleFieldCommit}
            />
          </div>
          <div className="text-[11px] font-medium text-[#1E293B] truncate mt-0.5">
            <InlineEditableText
              fieldKey="turnaroundStrategy"
              value={String(ov.turnaroundStrategy || ov.rentrollNotes || '')}
              onCommit={handleFieldCommit}
            />
          </div>
        </div>
      </div>
    );
  };

  // ── 07 YIELD FORMULA & 10-YR LAND PRICE SLIDE ──
  const renderYieldSlide = () => {
    const rawHistory: Array<{ year: number; pricePerSqm: number }> = Array.isArray(
      enrichment?.landPriceHistory?.history
    )
      ? enrichment.landPriceHistory.history.slice(-10)
      : [];
    const maxHistPrice =
      rawHistory.length >= 2
        ? Math.max(...rawHistory.map(h => Number(h.pricePerSqm) || 0), 1)
        : 100;
    const chartBars =
      rawHistory.length >= 2
        ? rawHistory.map(h => ({
            yearLabel: `'${String(h.year).slice(-2)}`,
            pct: Math.max(18, Math.round(((Number(h.pricePerSqm) || 0) / maxHistPrice) * 100)),
            tooltip: `${h.year}년: ${Number(h.pricePerSqm || 0).toLocaleString()}원/㎡`,
          }))
        : [42, 48, 53, 60, 68, 76, 84, 89, 94, 100].map((pct, i) => ({
            yearLabel: `'${17 + i}`,
            pct,
            tooltip: `개별공시지가 추이`,
          }));

    return (
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* Left 7 cols: Yield Formula Cards */}
        <div className="col-span-7 flex flex-col justify-between gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div
              className="p-3.5 rounded-xl border text-white"
              style={{ backgroundColor: `#${tokens.ink}`, borderColor: `#${tokens.ink2}` }}
            >
              <div className="text-[10px] font-bold uppercase" style={{ color: `#${tokens.accentL}` }}>
                현행 임대수익률 (보증금 차감)
              </div>
              <div className="text-2xl font-black mt-1">
                <InlineEditableText fieldKey="capRateBase" value={String(ov.capRateBase || '-')} onCommit={handleFieldCommit} />
              </div>
              <div className="text-[10px] mt-1 opacity-80">연 임대료 ÷ (매매가 − 보증금)</div>
            </div>

            <div
              className="p-3.5 rounded-xl border"
              style={{ backgroundColor: `#${tokens.accentT}`, borderColor: `#${tokens.accent}` }}
            >
              <div className="text-[10px] font-extrabold uppercase" style={{ color: `#${tokens.accentD}` }}>
                안정화 기대수익률 (전환 시)
              </div>
              <div className="text-2xl font-black mt-1" style={{ color: `#${tokens.ink}` }}>
                <InlineEditableText
                  fieldKey="capRateStabilized"
                  value={String(ov.capRateStabilized || ov.capRateBase || '-')}
                  onCommit={handleFieldCommit}
                />
              </div>
              <div className="text-[10px] font-bold text-[#334155] mt-1 truncate">
                <InlineEditableText fieldKey="stabilizedAssumption" value={String(ov.stabilizedAssumption || '')} onCommit={handleFieldCommit} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border overflow-hidden" style={{ borderColor: `#${tokens.line}` }}>
            {[
              { key: 'askingPrice', label: '매매 희망가 (A)', val: ov.askingPrice },
              { key: 'totalDeposit', label: '총 임대보증금 (B)', val: ov.totalDeposit },
              { key: 'annualRent', label: '연간 임대수익 (C = 월세×12)', val: ov.annualRent },
              { key: 'pricePerPyeong', label: '토지 평당 단가', val: ov.pricePerPyeong },
            ].map((r, i) => (
              <div
                key={r.key}
                className="grid grid-cols-12 px-3 py-1.5 text-xs items-center border-b last:border-b-0"
                style={{
                  backgroundColor: i % 2 === 1 ? `#${tokens.tint}` : '#FFFFFF',
                  borderColor: `#${tokens.line2}`,
                }}
              >
                <span className="col-span-5 font-bold" style={{ color: `#${tokens.slate}` }}>{r.label}</span>
                <span className="col-span-7 font-extrabold text-[#0F172A] text-right">
                  <InlineEditableText fieldKey={r.key} value={String(r.val || '-')} onCommit={handleFieldCommit} />
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right 5 cols: 10-Year Official Land Price Trend Chart */}
        <div
          className="col-span-5 rounded-xl border p-3.5 flex flex-col justify-between"
          style={{ backgroundColor: `#${tokens.tint}`, borderColor: `#${tokens.line}` }}
        >
          <div>
            <div className="text-xs font-extrabold text-[#0F172A]">📈 개별공시지가 10년 우상향 추이</div>
            <div className="text-[10px] font-bold text-[#475569]">국토교통부 · 한국부동산원(R-ONE) 지가변동률</div>
          </div>
          <div className="h-32 flex items-end justify-between gap-1.5 px-2 pt-4">
            {chartBars.map((bar, i) => {
              const isLast = i === chartBars.length - 1;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={bar.tooltip}>
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${bar.pct}%`,
                      backgroundColor: isLast ? `#${tokens.accent}` : `#${tokens.ink}`,
                      opacity: isLast ? 1 : 0.35 + i * 0.06,
                    }}
                  />
                  <span className="text-[8px] font-mono font-bold text-[#475569]">
                    {bar.yearLabel}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="text-[11px] font-medium text-[#1E293B] bg-white p-2 rounded-lg border border-[#CBD5E1]">
            <InlineEditableText fieldKey="yieldNotes" value={String(ov.yieldNotes || '')} onCommit={handleFieldCommit} />
          </div>
        </div>
      </div>
    );
  };

  // ── 08 MARKET COMPARABLES SLIDE ──
  const renderCompsSlide = () => {
    const rawComps: any[] =
      Array.isArray(ov.comparables) && ov.comparables.length > 0
        ? ov.comparables
        : Array.isArray(ov.compsRows) && ov.compsRows.length > 0
        ? ov.compsRows
        : Array.isArray(buildingContext?.manual_comps) && buildingContext.manual_comps.length > 0
        ? buildingContext.manual_comps
        : Array.isArray(buildingContext?.broker_extras?.market_comps)
        ? buildingContext.broker_extras.market_comps
        : [];

    return (
      <div className="flex-1 flex flex-col justify-between gap-3 min-h-0">
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl border" style={{ backgroundColor: `#${tokens.tint}`, borderColor: `#${tokens.line}` }}>
          <span className="text-xs font-extrabold text-[#0F172A]">
            <InlineEditableText fieldKey="compsTitle" value={String(ov.compsTitle || '인근 유사 매매 실거래 비교 사례')} onCommit={handleFieldCommit} />
          </span>
          <span className="text-xs font-black" style={{ color: `#${tokens.accentD}` }}>
            본건 토지평당가:{' '}
            <InlineEditableText fieldKey="targetLandPricePerPy" value={String(ov.targetLandPricePerPy || '-')} onCommit={handleFieldCommit} />
          </span>
        </div>

        <div className="rounded-xl border overflow-hidden flex-1" style={{ borderColor: `#${tokens.line}` }}>
          <div
            className="grid grid-cols-12 px-3 py-1.5 text-[11px] font-extrabold text-white"
            style={{ backgroundColor: `#${tokens.ink}` }}
          >
            <span className="col-span-4">비교사례 소재지 · 건물명</span>
            <span className="col-span-2 text-center">거래시점</span>
            <span className="col-span-2 text-right">거래금액</span>
            <span className="col-span-2 text-right">대지(평)</span>
            <span className="col-span-2 text-right">토지평당가</span>
          </div>
          {rawComps.length > 0 ? (
            <div className="divide-y" style={{ borderColor: `#${tokens.line2}` }}>
              {rawComps.slice(0, 5).map((c: any, idx: number) => {
                const landPy = c.land_area_pyeong ?? c.land_pyeong;
                const unitPrice = c.land_price_per_pyeong_manwon ?? c.land_unit_manwon;
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-12 px-3 py-1.5 text-xs items-center"
                    style={{ backgroundColor: idx % 2 === 1 ? `#${tokens.tint}` : '#FFFFFF' }}
                  >
                    <span className="col-span-4 font-bold text-[#0F172A] truncate">
                      {c.location || c.name || c.address || `인근 비교사례 #${idx + 1}`}
                    </span>
                    <span className="col-span-2 text-center font-mono text-[#475569]">
                      {c.as_of || c.trade_date || c.date || '-'}
                    </span>
                    <span className="col-span-2 text-right font-mono font-bold text-[#0F172A]">
                      {c.price_eok ? `${c.price_eok}억` : (c.price || '-')}
                    </span>
                    <span className="col-span-2 text-right font-mono text-[#334155]">
                      {landPy ? `${landPy}평` : '-'}
                    </span>
                    <span className="col-span-2 text-right font-mono font-extrabold" style={{ color: `#${tokens.ink}` }}>
                      {unitPrice ? `${Number(String(unitPrice).replace(/,/g, '')).toLocaleString()}만/평` : '-'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center text-xs font-medium text-[#475569]">
              우측 패널에서 인근 비교 사례를 추가하거나 시세 비교 코멘트를 입력할 수 있습니다.
            </div>
          )}
        </div>

        <div
          className="px-3.5 py-2 rounded-xl border text-xs font-medium text-[#1E293B]"
          style={{ backgroundColor: `#${tokens.accentT}`, borderColor: `#${tokens.accent}` }}
        >
          <span className="font-extrabold mr-1.5" style={{ color: `#${tokens.ink}` }}>📊 시세 비교 시사점:</span>
          <InlineEditableText fieldKey="compsNotes" value={String(ov.compsNotes || '')} onCommit={handleFieldCommit} />
        </div>
      </div>
    );
  };

  // ── 09 GALLERY SLIDE ──
  const renderGallerySlide = () => {
    const rawPhotos: any[] = Array.isArray(ov.photos) && ov.photos.length > 0
      ? ov.photos
      : Array.isArray(buildingContext?.photos_v2) && buildingContext.photos_v2.length > 0
      ? buildingContext.photos_v2
      : Array.isArray(buildingContext?.photos)
      ? buildingContext.photos
      : [];

    const activePhotos = rawPhotos
      .map((p: any, i: number) =>
        typeof p === 'string'
          ? { url: p, caption: `현장 실사 #${i + 1}`, included: true }
          : {
              ...p,
              url: p?.url || '',
              caption: p?.caption || `현장 실사 #${i + 1}`,
              included: p?.included !== false && p?.excluded !== true,
            }
      )
      .filter(p => p.included && p.url)
      .sort((a: any, b: any) => {
        const rank = (p: any) => (p.isHero || p.role === 'cover') ? 0 : p.role === 'exterior' ? 1 : 2;
        return rank(a) - rank(b);
      })
      .slice(0, 12);

    const isTwoPage = activePhotos.length > 6;
    const firstPageCount = isTwoPage ? Math.ceil(activePhotos.length / 2) : activePhotos.length;
    const page1Photos = activePhotos.slice(0, firstPageCount);
    const page2Photos = activePhotos.slice(firstPageCount);
    const currentBatch = isTwoPage && galleryPreviewPage === 1 ? page2Photos : page1Photos;

    const placeholders = [
      '전면 외관 및 가시성',
      '주출입구 및 1층 근생',
      '기준층 내부 공간',
      '접면도로 및 주변 여건',
      '주차시설 및 설비',
      '옥상 및 주변 스카이라인',
    ];

    const slotCount = Math.max(4, Math.min(6, currentBatch.length || 4));
    const gridColsClass = slotCount >= 5 ? 'grid-cols-3 grid-rows-2' : 'grid-cols-2 grid-rows-2';

    return (
      <div className="flex-1 flex flex-col gap-2 min-h-0">
        {isTwoPage && (
          <div className="flex items-center justify-between px-3 py-1 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-[11px]">
            <span className="font-bold text-[#1E3A8A]">
              📸 총 {activePhotos.length}장 — 갤러리 2면(1/2, 2/2) 자동 확장 미리보기
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setGalleryPreviewPage(0)}
                className={`px-2 py-0.5 rounded font-extrabold ${
                  galleryPreviewPage === 0 ? 'bg-[#1D4ED8] text-white' : 'bg-white text-[#334155]'
                }`}
              >
                1/2면 ({page1Photos.length}장)
              </button>
              <button
                type="button"
                onClick={() => setGalleryPreviewPage(1)}
                className={`px-2 py-0.5 rounded font-extrabold ${
                  galleryPreviewPage === 1 ? 'bg-[#1D4ED8] text-white' : 'bg-white text-[#334155]'
                }`}
              >
                2/2면 ({page2Photos.length}장)
              </button>
            </div>
          </div>
        )}
        <div className={`flex-1 grid ${gridColsClass} gap-3 min-h-0`}>
          {Array.from({ length: slotCount }).map((_, idx) => {
            const item = currentBatch[idx];
            const isHero = Boolean(item?.isHero || item?.role === 'cover');
            const isExt = !isHero && item?.role === 'exterior';
            const globalIdx = isTwoPage && galleryPreviewPage === 1 ? firstPageCount + idx : idx;
            return (
              <div
                key={idx}
                className="rounded-xl border overflow-hidden relative flex flex-col justify-end bg-[#F8FAFC]"
                style={{ borderColor: `#${tokens.line}` }}
              >
                {item?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt={item.caption} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="my-auto mx-auto text-center p-2">
                    <div className="text-lg">📷</div>
                    <div className="text-[11px] font-bold text-[#475569]">{placeholders[idx]}</div>
                  </div>
                )}
                {(isHero || isExt) && (
                  <span
                    className={`absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded text-[9px] font-extrabold text-white ${
                      isHero ? 'bg-[#D97706]' : 'bg-[#1D4ED8]'
                    }`}
                  >
                    {isHero ? '★ 대표사진' : '외관'}
                  </span>
                )}
                <div
                  className="relative z-10 px-2.5 py-1 text-[11px] font-bold text-white flex items-center justify-between"
                  style={{ backgroundColor: `#${tokens.ink}DD` }}
                >
                  <span className="truncate">{item?.caption || placeholders[idx]}</span>
                  <span className="text-[9px] opacity-75">{String(globalIdx + 1).padStart(2, '0')}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── 10 CLOSING SLIDE ──
  const renderClosingSlide = () => {
    const steps = [
      { num: '01', title: '매수의향 및 자료 검토', desc: '담당 컨설턴트 상담 및 핵심 제원 확인' },
      { num: '02', title: '현장 실사 · 상세 실사', desc: '내외부 컨디션 및 임대차 계약 원본 대조' },
      { num: '03', title: '매수의향서(LOI) 및 본계약', desc: '매매 조건 협의 및 에스크로·소유권 이전' },
    ];

    return (
      <div
        className="w-full h-full flex flex-col justify-between p-6 sm:p-8 select-none"
        style={{ backgroundColor: `#${tokens.darkCard}`, color: `#${tokens.darkBody}` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: `#${tokens.darkBorder}` }}>
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: `#${tokens.accentL}` }}>
              {slide.kicker || 'DISCLAIMER & CONTACT'}
            </div>
            <h3 className="text-lg font-black text-white">
              <InlineEditableText fieldKey="__slide_title__" value={slide.title || '문의 및 유의사항'} onCommit={handleFieldCommit} />
            </h3>
          </div>
          {pageNumText && (
            <span className="font-mono text-xs font-bold" style={{ color: `#${tokens.accentL}` }}>
              {pageNumText}
            </span>
          )}
        </div>

        {/* 3-Step Acquisition Process */}
        <div className="grid grid-cols-3 gap-2.5 my-2">
          {steps.map(s => (
            <div
              key={s.num}
              className="p-2.5 rounded-xl flex items-center gap-2.5"
              style={{ backgroundColor: `#${tokens.darkBlock}`, border: `1px solid #${tokens.darkBorder}` }}
            >
              <span
                className="w-7 h-7 rounded-full text-xs font-black flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: `#${tokens.accent}` }}
              >
                {s.num}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">{s.title}</div>
                <div className="text-[10px] truncate" style={{ color: `#${tokens.darkMute}` }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Contact Card + Provenance & Legal Disclaimer */}
        <div className="grid grid-cols-12 gap-4 items-stretch">
          <div
            className="col-span-6 p-3.5 rounded-xl flex flex-col justify-between"
            style={{ backgroundColor: `#${tokens.darkBlock}`, border: `1px solid #${tokens.accent}` }}
          >
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: `#${tokens.accentL}` }}>
                EXCLUSIVE ADVISORY CONTACT
              </div>
              <div className="text-sm font-black text-white mt-1">
                <InlineEditableText
                  fieldKey="brokerCompany"
                  value={String(headerFooterConfig.companyName || ov.brokerCompany || tokens.companyName)}
                  onCommit={handleFieldCommit}
                />
              </div>
              <div className="text-xs font-semibold mt-1.5 space-y-0.5" style={{ color: `#${tokens.darkBody}` }}>
                <div>
                  담당자: <InlineEditableText fieldKey="brokerName" value={String(ov.brokerName || '전담 매각자문팀')} onCommit={handleFieldCommit} />
                </div>
                <div>
                  연락처: <InlineEditableText fieldKey="brokerPhone" value={String(ov.brokerPhone || '문의 요망')} onCommit={handleFieldCommit} />
                </div>
              </div>
            </div>
            <div className="text-[11px] font-medium pt-2 border-t mt-2" style={{ borderColor: `#${tokens.darkBorder}`, color: `#${tokens.accentL}` }}>
              <InlineEditableText fieldKey="closingLine" value={String(ov.closingLine || '')} onCommit={handleFieldCommit} />
            </div>
          </div>

          <div
            className="col-span-6 p-3.5 rounded-xl flex flex-col justify-between"
            style={{ backgroundColor: `#${tokens.darkBlock}`, border: `1px solid #${tokens.darkBorder}` }}
          >
            <div>
              <div className="text-xs font-extrabold text-white mb-1">⚖️ 데이터 출처 표기 및 법적 면책 고지</div>
              <div className="text-[11px] leading-relaxed" style={{ color: `#${tokens.darkMute}` }}>
                <InlineEditableText
                  fieldKey="disclaimer"
                  value={String(ov.disclaimer || headerFooterConfig.footerDisclaimer)}
                  multiline
                  onCommit={handleFieldCommit}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-2">
              {['✓ 공부확인', '★ 전문가검증', '● 중개인입력', '◇ 시나리오추정'].map(b => (
                <span
                  key={b}
                  className="px-2 py-0.5 rounded text-[9px] font-bold text-white"
                  style={{ backgroundColor: `#${tokens.ink}` }}
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col items-center gap-3">
      {/* Top Canvas Helper Bar */}
      <div className="w-full max-w-4xl flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            data-active-pill="true"
            className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-[#1D4ED8] text-white"
          >
            SLIDE {String(slideNo).padStart(2, '0')} / {String(totalSlides).padStart(2, '0')}
          </span>
          <span className="text-xs font-bold text-[#334155]">
            💡 슬라이드 안의 글자나 숫자를 마우스로 직접 클릭해 바로 고칠 수 있습니다.
          </span>
        </div>
        {onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="px-3 py-1 rounded-lg text-xs font-bold bg-white border border-[#CBD5E1] text-[#0F172A] hover:bg-[#F8FAFC] shadow-2xs"
          >
            {isFullscreen ? '✕ 전체화면 닫기' : '🔍 크게 보기'}
          </button>
        )}
      </div>

      {/* 16:9 Slide Canvas */}
      <div
        data-testid="studio-slide-canvas"
        data-theme-lock="dark"
        className="w-full max-w-4xl aspect-[16/9] rounded-2xl shadow-xl overflow-hidden border border-[#CBD5E1] relative flex flex-col transition-colors duration-150"
        style={{
          backgroundColor: isDarkSlide ? `#${tokens.darkCard}` : `#${tokens.bg}`,
          ...(!isDarkSlide ? frameBorderStyle : {}),
        }}
      >
        {slide.hidden && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] z-20 flex flex-col items-center justify-center text-white p-6 text-center">
            <span className="px-4 py-1.5 rounded-full bg-[#B91C1C] text-white text-sm font-black mb-2">
              🚫 현재 다운로드 제외 (숨김 상태)
            </span>
            <p className="text-xs text-white/90">
              좌측 슬라이드 목록에서 [표시] 버튼을 누르면 PPTX 다운로드에 다시 포함됩니다.
            </p>
          </div>
        )}

        {dataKey === 'cover' ? (
          renderCoverSlide()
        ) : dataKey === 'closing' ? (
          renderClosingSlide()
        ) : (
          /* Standard Body Slide Frame (02 ~ 09) */
          <div className="w-full h-full flex flex-col justify-between p-5 sm:p-6">
            {/* Slide Header */}
            <div
              className="flex items-end justify-between pb-2.5 mb-3 border-b"
              style={{ borderColor: `#${tokens.line}` }}
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: `#${tokens.accent}` }}
                  />
                  <span
                    className="text-[10px] font-extrabold uppercase tracking-widest"
                    style={{ color: `#${tokens.accent}` }}
                  >
                    <InlineEditableText
                      fieldKey="__slide_kicker__"
                      value={slide.kicker || 'SECTION'}
                      onCommit={handleFieldCommit}
                    />
                  </span>
                </div>
                <h3
                  className="text-base sm:text-lg font-black tracking-tight mt-0.5"
                  style={{ color: `#${tokens.ink}` }}
                >
                  <InlineEditableText
                    fieldKey="__slide_title__"
                    value={slide.title || '슬라이드 제목'}
                    onCommit={handleFieldCommit}
                  />
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[#64748B]">
                  {headerFooterConfig.confidentialityBadge}
                </span>
                {pageNumText && (
                  <span
                    className="px-2 py-0.5 rounded font-mono text-xs font-extrabold text-white"
                    style={{ backgroundColor: `#${tokens.ink}` }}
                  >
                    {pageNumText}
                  </span>
                )}
              </div>
            </div>

            {/* Slide Body Content by dataKey */}
            {dataKey === 'highlights' || dataKey === 'summary'
              ? renderHighlightsSlide()
              : dataKey === 'overview' || dataKey === 'building'
              ? renderOverviewSlide()
              : dataKey === 'location'
              ? renderLocationSlide()
              : dataKey === 'land'
              ? renderLandSlide()
              : dataKey === 'rentroll' || dataKey === 'rentRoll'
              ? renderRentRollSlide()
              : dataKey === 'yield' || dataKey === 'yieldFormula'
              ? renderYieldSlide()
              : dataKey === 'comps' || dataKey === 'brokerComps'
              ? renderCompsSlide()
              : dataKey === 'gallery'
              ? renderGallerySlide()
              : renderOverviewSlide()}

            {/* Common Slide Footer */}
            <div
              className="pt-2 mt-2.5 border-t flex items-center justify-between text-[10px]"
              style={{ borderColor: `#${tokens.line2}`, color: `#${tokens.mute}` }}
            >
              <span className="font-bold truncate max-w-[65%]">
                {headerFooterConfig.footerDisclaimer}
              </span>
              <span className="font-extrabold shrink-0" style={{ color: `#${tokens.ink}` }}>
                {headerFooterConfig.companyName || tokens.companyName}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Slide Navigation Controls */}
      {(onPrevSlide || onNextSlide) && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPrevSlide}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white border border-[#CBD5E1] text-[#0F172A] hover:bg-[#F8FAFC] shadow-2xs"
          >
            ◀ 이전 슬라이드
          </button>
          <span className="text-xs font-extrabold text-[#334155]">
            {slideNo} / {totalSlides} 면
          </span>
          <button
            type="button"
            onClick={onNextSlide}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white border border-[#CBD5E1] text-[#0F172A] hover:bg-[#F8FAFC] shadow-2xs"
          >
            다음 슬라이드 ▶
          </button>
        </div>
      )}
    </div>
  );
}
