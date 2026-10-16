'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { formatPhoneDisplay, sanitizeTelHref } from '@/lib/magazine/view-helpers';

export interface DealInquiryItem {
  id: string;
  assetType: string;
  address: string;
  price: string;
  areaSignal: string;
}

export interface DealInquirySheetProps {
  brokerName: string;
  brokerPhone: string | null;
  brokerSlug: string;
}

const UUID_PREFIX_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

/**
 * 60대 독자용 매물 상세 안내 & 1-탭 상담 바텀시트 모달 (U-F0-3 / R-02).
 *
 * - 서버 컴포넌트(`magazine-view.tsx`)의 정적 HTML 제약을 지키기 위해
 *   문서 레벨 이벤트 위임(`data-deal-inquiry`, `data-quick-scroll`, `data-carousel-dir`)으로 동작한다.
 * - `/building/${id}` 등 존재하지 않는 404 경로 이동을 차단하고,
 *   전화 문의 / 문자(SMS) 투자설명서 요청 / 중개사 프로필 이동을 큰 글씨(17~20px)와 48~52px 버튼으로 안내한다.
 */
export function DealInquirySheet({
  brokerName,
  brokerPhone,
  brokerSlug,
}: DealInquirySheetProps) {
  const [mounted, setMounted] = useState(false);
  const [activeDeal, setActiveDeal] = useState<DealInquiryItem | null>(null);

  const closeSheet = useCallback(() => {
    setActiveDeal(null);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const updateCarouselCounter = () => {
      const scroller = document.querySelector<HTMLElement>('[data-deals-carousel]');
      const counter = document.querySelector<HTMLElement>('[data-deals-counter]');
      if (!scroller || !counter) return;
      const total = Number(counter.getAttribute('data-deals-total') || '0');
      if (!total || total <= 0) return;
      const cardWidth = 295;
      const idx = Math.min(
        total,
        Math.round(scroller.scrollLeft / cardWidth) + 1,
      );
      counter.textContent = `${idx < 1 ? 1 : idx} / ${total}`;
    };

    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;

      // 1. 매물 카드 / 투자설명서 요청 / 상세 문의 클릭 → 404 방지 & 인라인 상담 시트 오픈
      const inquiryTrigger = target.closest<HTMLElement>('[data-deal-inquiry]');
      if (inquiryTrigger) {
        e.preventDefault();
        const id = inquiryTrigger.getAttribute('data-deal-id') || '';
        const assetType = inquiryTrigger.getAttribute('data-deal-asset') || '상업용 부동산';
        const address = inquiryTrigger.getAttribute('data-deal-address') || '위치 문의 시 안내';
        const price = inquiryTrigger.getAttribute('data-deal-price') || '가격 협의';
        const areaSignal = inquiryTrigger.getAttribute('data-deal-signal') || '';

        setActiveDeal({ id, assetType, address, price, areaSignal });

        try {
          window.history.pushState(
            { dealInquiry: id || 'deal' },
            '',
            `#deal-inquiry-${encodeURIComponent(id || 'item')}`,
          );
        } catch {
          // history pushState 실패 시 무시
        }
        return;
      }

      // 2. 커버 하단 1-탭 빠른 섹션 이동 바
      const quickBtn = target.closest<HTMLElement>('[data-quick-scroll]');
      if (quickBtn) {
        e.preventDefault();
        const sectionId = quickBtn.getAttribute('data-quick-scroll');
        if (!sectionId) return;
        const sectionEl = document.querySelector<HTMLElement>(
          `[data-section-id="${sectionId}"]`,
        );
        if (sectionEl && typeof sectionEl.scrollIntoView === 'function') {
          sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      // 3. 주목 매물 캐러셀 이전/다음 버튼
      const carouselBtn = target.closest<HTMLElement>('[data-carousel-dir]');
      if (carouselBtn) {
        e.preventDefault();
        const dir = carouselBtn.getAttribute('data-carousel-dir');
        const scroller = document.querySelector<HTMLElement>('[data-deals-carousel]');
        if (scroller && typeof scroller.scrollBy === 'function') {
          scroller.scrollBy({
            left: dir === 'prev' ? -300 : 300,
            behavior: 'smooth',
          });
          window.setTimeout(updateCarouselCounter, 260);
        }
      }
    };

    const handlePopState = () => {
      setActiveDeal(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveDeal(null);
      }
    };

    const scroller = document.querySelector<HTMLElement>('[data-deals-carousel]');
    document.addEventListener('click', handleDocClick);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);
    scroller?.addEventListener('scroll', updateCarouselCounter, { passive: true });

    return () => {
      document.removeEventListener('click', handleDocClick);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
      scroller?.removeEventListener('scroll', updateCarouselCounter);
    };
  }, []);

  if (!mounted || !activeDeal || typeof document === 'undefined') {
    return null;
  }

  const telDigits = sanitizeTelHref(brokerPhone);
  const formattedPhone = formatPhoneDisplay(brokerPhone);
  const profileHref = `/broker-profile/${encodeURIComponent(brokerSlug)}?ref=magazine-cta`;
  const smsBody = encodeURIComponent(
    `[${brokerName} 매거진 문의] ${activeDeal.address} (${activeDeal.assetType}, ${activeDeal.price}) 투자설명서(IM) 및 상세자료를 요청합니다.`,
  );
  const smsHref = telDigits ? `sms:${telDigits}?body=${smsBody}` : profileHref;
  const isUuidDeal = UUID_PREFIX_RE.test(activeDeal.id);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deal-inquiry-sheet-title"
      data-testid="deal-inquiry-sheet"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 p-3 sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSheet();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-indigo-400/35 bg-[#0f1428] p-5 text-slate-100 shadow-2xl"
        style={{ wordBreak: 'keep-all' }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3.5">
          <div>
            <span className="inline-block rounded-md bg-indigo-500/20 px-2.5 py-1 text-sm font-bold text-indigo-200">
              {activeDeal.assetType}
            </span>
            <h3
              id="deal-inquiry-sheet-title"
              className="mt-2 text-[20px] font-extrabold leading-snug text-white"
            >
              {activeDeal.address}
            </h3>
          </div>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="닫기"
            className="inline-flex h-12 min-h-12 w-12 min-w-12 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/5 text-sm font-bold text-slate-200 hover:bg-white/10"
          >
            닫기
          </button>
        </div>

        <div className="mt-4 space-y-2.5 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[15px] font-semibold text-slate-300">매매·기준가</span>
            <span className="font-mono text-[20px] font-extrabold text-amber-300 tabular-nums">
              {activeDeal.price}
            </span>
          </div>
          {activeDeal.areaSignal && (
            <div className="border-t border-white/10 pt-2.5">
              <p className="text-sm font-semibold text-slate-300">주요 특징 · 면적 시그널</p>
              <p className="mt-1 text-[17px] font-medium leading-relaxed text-slate-100">
                {activeDeal.areaSignal}
              </p>
            </div>
          )}
        </div>

        <p className="mt-3.5 text-sm leading-relaxed text-slate-300">
          상세 지번·임대차 내역·투자설명서(IM)는 매도인 정보 보호를 위해 담당 중개사({brokerName})가 직접 안내해 드립니다.
        </p>

        <div className="mt-4 space-y-2.5">
          {telDigits ? (
            <a
              href={`tel:${telDigits}`}
              data-track="cta_click"
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[17px] font-extrabold text-white shadow-lg transition-colors hover:bg-emerald-500"
            >
              <span aria-hidden="true">📞</span>
              <span>중개사에게 이 매물 전화 문의 ({formattedPhone})</span>
            </a>
          ) : null}

          <a
            href={smsHref}
            data-track="im_request"
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-[17px] font-extrabold text-white shadow-lg transition-colors hover:bg-indigo-500"
          >
            <span aria-hidden="true">💬</span>
            <span>문자로 투자설명서(IM)·상세자료 요청</span>
          </a>

          <a
            href={profileHref}
            data-track="cta_click"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-[16px] font-bold text-slate-100 transition-colors hover:bg-white/10"
          >
            <span aria-hidden="true">👤</span>
            <span>중개사 프로필 보기</span>
          </a>

          {isUuidDeal && (
            <a
              href={`/im-lite/${encodeURIComponent(activeDeal.id)}`}
              data-track="im_request"
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-indigo-400/35 bg-indigo-500/10 px-4 py-2.5 text-[15px] font-bold text-indigo-200 transition-colors hover:bg-indigo-500/20"
            >
              <span>모바일 IM 열람하기</span>
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
