'use client';

import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { DEFAULT_HEADER_FOOTER } from '@/domain/building/mobile-im/pptx/header-footer';

export function HeaderFooterEditor() {
  const { headerFooterConfig, setHeaderFooterConfig } = useTheme();

  return (
    <div className="space-y-5 text-[#0F172A]">
      <div>
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#0F172A]">
          🏢 슬라이드 공통 헤더 · 푸터 · 중개법인 브랜딩
        </h4>
        <p className="text-[11px] text-[#475569] mt-0.5">
          여기서 수정한 중개법인명·로고·면책문구·페이지 번호 형식은 전 슬라이드(01~10면)에 즉시 공통 적용됩니다.
        </p>
      </div>

      {/* 중개법인 / 소속 명칭 */}
      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-[#0F172A]">
          중개법인 · 사무소 명칭 (표지 및 전 슬라이드 하단)
        </label>
        <input
          type="text"
          value={headerFooterConfig.companyName}
          onChange={e => setHeaderFooterConfig({ companyName: e.target.value })}
          placeholder="예: (주)크리딜 부동산중개법인"
          className="w-full px-3 py-2 text-xs font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
        />
      </div>

      {/* 서브 태그라인 */}
      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-[#0F172A]">
          브랜드 태그라인 (표지 우측/하단 보조 문구)
        </label>
        <input
          type="text"
          value={headerFooterConfig.companyTagline}
          onChange={e => setHeaderFooterConfig({ companyTagline: e.target.value })}
          placeholder="예: 상업용 빌딩 매각·자문 전담 파트너"
          className="w-full px-3 py-2 text-xs font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
        />
      </div>

      {/* 로고 이미지 URL */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="block text-xs font-bold text-[#0F172A]">
            중개법인 로고 이미지 URL (선택)
          </label>
          <label className="cursor-pointer px-2 py-0.5 rounded bg-[#EFF6FF] border border-[#BFDBFE] text-[10px] font-extrabold text-[#1E3A8A] hover:bg-[#DBEAFE] transition-colors">
            📁 로고 파일 업로드
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === 'string') {
                    setHeaderFooterConfig({ logoUrl: reader.result });
                  }
                };
                reader.readAsDataURL(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <input
          type="url"
          value={headerFooterConfig.logoUrl || ''}
          onChange={e => setHeaderFooterConfig({ logoUrl: e.target.value || undefined })}
          placeholder="https://example.com/logo.png"
          className="w-full px-3 py-2 text-xs font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
        />
        {headerFooterConfig.logoUrl && (
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
            <div className="flex items-center gap-2 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={headerFooterConfig.logoUrl}
                alt="로고 미리보기"
                className="h-7 w-auto object-contain rounded bg-white border border-[#CBD5E1] px-1.5 py-0.5 shrink-0"
              />
              <span className="text-[11px] font-bold text-[#334155] truncate">
                {headerFooterConfig.logoUrl.startsWith('data:')
                  ? '로고 이미지 파일 연결됨'
                  : `로고 연결됨: ${headerFooterConfig.logoUrl}`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setHeaderFooterConfig({ logoUrl: undefined })}
              className="text-[11px] font-bold text-[#B91C1C] hover:underline ml-2 shrink-0"
            >
              제거
            </button>
          </div>
        )}
      </div>

      {/* 우상단 대외비 배지 문구 */}
      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-[#0F172A]">
          상단 기밀/용도 배지 문구
        </label>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {['CONFIDENTIAL', '매수자 검토용 (대외비)', 'INVESTMENT MEMORANDUM', '내부 브리핑용'].map(badge => (
            <button
              key={badge}
              type="button"
              onClick={() => setHeaderFooterConfig({ confidentialityBadge: badge })}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                headerFooterConfig.confidentialityBadge === badge
                  ? 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1E3A8A]'
                  : 'border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC]'
              }`}
            >
              {badge}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={headerFooterConfig.confidentialityBadge}
          onChange={e => setHeaderFooterConfig({ confidentialityBadge: e.target.value })}
          className="w-full px-3 py-2 text-xs font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
        />
      </div>

      {/* 하단 공통 면책 문구 */}
      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-[#0F172A]">
          슬라이드 하단 푸터 면책 문구
        </label>
        <textarea
          rows={2}
          value={headerFooterConfig.footerDisclaimer}
          onChange={e => setHeaderFooterConfig({ footerDisclaimer: e.target.value })}
          className="w-full px-3 py-2 text-xs font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] resize-y"
        />
      </div>

      {/* 페이지 번호 표시 및 형식 */}
      <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#0F172A]">슬라이드 페이지 번호 표시</span>
          <button
            type="button"
            onClick={() => setHeaderFooterConfig({ showPageNumbers: !headerFooterConfig.showPageNumbers })}
            className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-colors ${
              headerFooterConfig.showPageNumbers
                ? 'bg-[#059669] text-white'
                : 'bg-[#CBD5E1] text-[#1E293B]'
            }`}
          >
            {headerFooterConfig.showPageNumbers ? '표시 중 (ON)' : '숨김 (OFF)'}
          </button>
        </div>

        {headerFooterConfig.showPageNumbers && (
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { id: '01', label: '01, 02...' },
              { id: '1/N', label: '1 / 10' },
              { id: 'P.1', label: 'P.1, P.2...' },
            ] as const).map(fmt => (
              <button
                key={fmt.id}
                type="button"
                onClick={() => setHeaderFooterConfig({ pageNumberFormat: fmt.id })}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-all ${
                  headerFooterConfig.pageNumberFormat === fmt.id
                    ? 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1E3A8A]'
                    : 'border-[#CBD5E1] bg-white text-[#334155]'
                }`}
              >
                {fmt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 기본값 초기화 */}
      <button
        type="button"
        onClick={() => setHeaderFooterConfig(DEFAULT_HEADER_FOOTER)}
        className="w-full py-2 text-xs font-bold text-[#475569] hover:text-[#0F172A] border border-[#CBD5E1] rounded-lg bg-white hover:bg-[#F8FAFC] transition-colors"
      >
        ↺ 헤더·푸터 기본값으로 초기화
      </button>
    </div>
  );
}
