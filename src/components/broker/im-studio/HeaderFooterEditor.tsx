'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';
import { DEFAULT_HEADER_FOOTER } from '@/domain/building/mobile-im/pptx/header-footer';

const MAX_LOGO_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_LOGO_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const DISALLOWED_LOGO_FILE_EXT_RE = /\.(?:svg|svgz|html?|xml|js|mjs)$/i;

export function HeaderFooterEditor() {
  const { headerFooterConfig, setHeaderFooterConfig } = useTheme();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);

  const handleLogoFileUpload = async (file?: File | null) => {
    if (!file) return;
    setLogoUploadError(null);

    if (file.size <= 0 || file.size > MAX_LOGO_UPLOAD_BYTES) {
      const msg = '로고 이미지 파일 크기는 5MB 이하여야 합니다.';
      setLogoUploadError(msg);
      toast.error(msg);
      return;
    }

    const mime = String(file.type || '').trim().toLowerCase();
    if (
      !ALLOWED_LOGO_IMAGE_MIMES.has(mime) ||
      DISALLOWED_LOGO_FILE_EXT_RE.test(file.name || '')
    ) {
      const msg = 'JPG, PNG, WEBP, GIF 형식의 로고 이미지만 업로드할 수 있습니다.';
      setLogoUploadError(msg);
      toast.error(msg);
      return;
    }

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name);

      const res = await fetch('/api/broker/im/upload-photo', {
        method: 'POST',
        body: formData,
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !json?.ok || typeof json?.url !== 'string' || !json.url.trim()) {
        const msg =
          (typeof json?.message === 'string' && json.message.trim()) ||
          (typeof json?.error === 'string' && json.error.trim()) ||
          '로고 이미지 서버 검증 및 업로드에 실패했습니다.';
        setLogoUploadError(msg);
        toast.error(msg);
        return;
      }

      setHeaderFooterConfig({ logoUrl: json.url.trim() });
    } catch {
      const msg = '네트워크 오류로 로고 이미지를 업로드하지 못했습니다. 잠시 후 다시 시도해 주세요.';
      setLogoUploadError(msg);
      toast.error(msg);
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div className="space-y-5 text-[#0F172A]">
      <div>
        <h4 className="text-sm font-extrabold uppercase tracking-wider text-[#0F172A]">
          🏢 슬라이드 공통 헤더 · 푸터 · 중개법인 브랜딩
        </h4>
        <p className="text-sm text-[#475569] mt-0.5">
          여기서 수정한 중개법인명·로고·면책문구·페이지 번호 형식은 전 슬라이드(01~10면)에 즉시 공통 적용됩니다.
        </p>
      </div>

      {/* 중개법인 / 소속 명칭 */}
      <div className="space-y-1.5">
        <label htmlFor="hf-company-name" className="block text-sm font-bold text-[#0F172A]">
          중개법인 · 사무소 명칭 (표지 및 전 슬라이드 하단)
        </label>
        <input
          id="hf-company-name"
          type="text"
          value={headerFooterConfig.companyName}
          onChange={e => setHeaderFooterConfig({ companyName: e.target.value })}
          placeholder="예: (주)크리딜 부동산중개법인"
          className="w-full min-h-[44px] px-3 py-2 text-sm font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
        />
      </div>

      {/* 서브 태그라인 */}
      <div className="space-y-1.5">
        <label htmlFor="hf-company-tagline" className="block text-sm font-bold text-[#0F172A]">
          브랜드 태그라인 (표지 우측/하단 보조 문구)
        </label>
        <input
          id="hf-company-tagline"
          type="text"
          value={headerFooterConfig.companyTagline}
          onChange={e => setHeaderFooterConfig({ companyTagline: e.target.value })}
          placeholder="예: 상업용 빌딩 매각·자문 전담 파트너"
          className="w-full min-h-[44px] px-3 py-2 text-sm font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
        />
      </div>

      {/* 로고 이미지 URL */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="hf-logo-url" className="block text-sm font-bold text-[#0F172A]">
            중개법인 로고 이미지 URL (선택)
          </label>
          <label
            htmlFor="hf-logo-file"
            className="cursor-pointer min-h-[44px] inline-flex items-center px-3 py-1.5 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-sm font-extrabold text-[#1E3A8A] hover:bg-[#DBEAFE] transition-colors"
          >
            {uploadingLogo ? '⏳ 업로드 중…' : '📁 로고 파일 업로드'}
            <input
              id="hf-logo-file"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={uploadingLogo}
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                void handleLogoFileUpload(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {logoUploadError && (
          <div
            role="alert"
            className="px-3 py-2 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm font-bold text-[#B91C1C]"
          >
            {logoUploadError}
          </div>
        )}
        <input
          id="hf-logo-url"
          type="url"
          value={headerFooterConfig.logoUrl || ''}
          onChange={e => {
            const nextVal = e.target.value;
            if (/^data:/i.test(nextVal.trim())) {
              const msg = 'Base64 데이터 URL 대신 로고 파일 업로드 버튼 또는 https:// 주소를 사용해 주세요.';
              setLogoUploadError(msg);
              toast.error(msg);
              return;
            }
            setLogoUploadError(null);
            setHeaderFooterConfig({ logoUrl: nextVal || undefined });
          }}
          placeholder="https://example.com/logo.png"
          className="w-full min-h-[44px] px-3 py-2 text-sm font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
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
              <span className="text-sm font-bold text-[#334155] truncate">
                {`로고 연결됨: ${headerFooterConfig.logoUrl}`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setHeaderFooterConfig({ logoUrl: undefined })}
              className="min-h-[44px] px-2.5 text-sm font-bold text-[#B91C1C] hover:underline ml-2 shrink-0 cursor-pointer"
            >
              제거
            </button>
          </div>
        )}
      </div>

      {/* 우상단 대외비 배지 문구 */}
      <div className="space-y-1.5">
        <label htmlFor="hf-confidentiality-badge" className="block text-sm font-bold text-[#0F172A]">
          상단 기밀/용도 배지 문구
        </label>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {['CONFIDENTIAL', '매수자 검토용 (대외비)', 'INVESTMENT MEMORANDUM', '내부 브리핑용'].map(badge => (
            <button
              key={badge}
              type="button"
              onClick={() => setHeaderFooterConfig({ confidentialityBadge: badge })}
              className={`min-h-[44px] px-3 py-1.5 rounded-md text-sm font-bold border transition-colors cursor-pointer ${
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
          id="hf-confidentiality-badge"
          type="text"
          value={headerFooterConfig.confidentialityBadge}
          onChange={e => setHeaderFooterConfig({ confidentialityBadge: e.target.value })}
          className="w-full min-h-[44px] px-3 py-2 text-sm font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A]"
        />
      </div>

      {/* 하단 공통 면책 문구 */}
      <div className="space-y-1.5">
        <label htmlFor="hf-footer-disclaimer" className="block text-sm font-bold text-[#0F172A]">
          슬라이드 하단 푸터 면책 문구
        </label>
        <textarea
          id="hf-footer-disclaimer"
          rows={2}
          value={headerFooterConfig.footerDisclaimer}
          onChange={e => setHeaderFooterConfig({ footerDisclaimer: e.target.value })}
          className="w-full min-h-[44px] px-3 py-2 text-sm font-medium bg-white border border-[#CBD5E1] rounded-lg text-[#0F172A] resize-y"
        />
      </div>

      {/* 페이지 번호 표시 및 형식 */}
      <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-[#0F172A]">슬라이드 페이지 번호 표시</span>
          <button
            type="button"
            onClick={() => setHeaderFooterConfig({ showPageNumbers: !headerFooterConfig.showPageNumbers })}
            className={`min-h-[44px] px-3.5 py-1.5 rounded-lg text-sm font-extrabold transition-colors cursor-pointer ${
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
                className={`min-h-[44px] py-1.5 px-2 rounded-lg text-sm font-bold border transition-all cursor-pointer ${
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
        className="w-full min-h-[44px] py-2 text-sm font-bold text-[#475569] hover:text-[#0F172A] border border-[#CBD5E1] rounded-lg bg-white hover:bg-[#F8FAFC] transition-colors cursor-pointer"
      >
        ↺ 헤더·푸터 기본값으로 초기화
      </button>
    </div>
  );
}
