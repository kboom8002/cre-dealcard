'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import {
  PhoneActionButton,
  formatKrPhoneForDisplay,
  sanitizePhoneDigits,
} from '@/components/common/PhoneActionButton';

export interface DealInquiryItem {
  id: string;
  assetType: string;
  address: string;
  price: string;
  areaSignal: string;
  hasIm?: boolean;
  imUrl?: string;
}

export interface DealInquirySheetProps {
  brokerName: string;
  brokerPhone: string | null;
  brokerSlug: string;
}

const UUID_PREFIX_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

/**
 * 독자용 매물 상세 안내 & 1-탭 상담 모달 (U-F0-3 / R-02).
 *
 * - 서버 컴포넌트(`magazine-view.tsx`)의 정적 HTML 제약을 지키기 위해
 *   문서 레벨 이벤트 위임(`data-deal-inquiry`, `data-quick-scroll`, `data-carousel-dir`)으로 동작한다.
 * - 전화 문의 / 문자(SMS) 투자설명서 요청 / 중개사 프로필 이동을 큰 글씨(16~20px)와 48~52px 버튼으로 안내한다.
 */
export function DealInquirySheet({
  brokerName,
  brokerPhone,
  brokerSlug,
}: DealInquirySheetProps) {
  const [activeDeal, setActiveDeal] = useState<DealInquiryItem | null>(null);

  const closeSheet = useCallback(() => {
    setActiveDeal(null);
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

      // 1. 매물 카드 / 투자설명서 요청 / 상세 문의 클릭 → 인라인 상담 시트 오픈
      const inquiryTrigger = target.closest<HTMLElement>('[data-deal-inquiry]');
      if (inquiryTrigger) {
        e.preventDefault();
        const id = inquiryTrigger.getAttribute('data-deal-id') || '';
        const assetType = inquiryTrigger.getAttribute('data-deal-asset') || '상업용 부동산';
        const address = inquiryTrigger.getAttribute('data-deal-address') || '위치 문의 시 안내';
        const price = inquiryTrigger.getAttribute('data-deal-price') || '가격 협의';
        const areaSignal = inquiryTrigger.getAttribute('data-deal-signal') || '';
        const rawHasImAttr = inquiryTrigger.getAttribute('data-deal-has-im');
        const imUrlAttr = inquiryTrigger.getAttribute('data-deal-im-url') || '';
        const hasIm =
          rawHasImAttr === 'true'
            ? true
            : rawHasImAttr === 'false'
            ? false
            : Boolean(imUrlAttr);

        setActiveDeal({
          id,
          assetType,
          address,
          price,
          areaSignal,
          hasIm,
          imUrl: imUrlAttr || undefined,
        });

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
        return;
      }

      // 4. 추천 매물 수지분석 바로가기 클릭 → ROI 계산기로 스크롤 + 파라미터 전달
      const roiTrigger = target.closest<HTMLElement>('[data-prefill-roi]');
      if (roiTrigger) {
        e.preventDefault();
        const price = roiTrigger.getAttribute('data-roi-price');
        const deposit = roiTrigger.getAttribute('data-roi-deposit');
        const rent = roiTrigger.getAttribute('data-roi-rent');
        const floors = roiTrigger.getAttribute('data-roi-floors');
        const detail: Record<string, number> = {};
        if (price) {
          const p = Number(price);
          if (Number.isFinite(p) && p > 0) detail.purchasePrice = p;
        }
        if (deposit) {
          const d = Number(deposit);
          if (Number.isFinite(d) && d >= 0) detail.deposit = d;
        }
        if (rent) {
          const r = Number(rent);
          if (Number.isFinite(r) && r >= 0) detail.monthlyRent = r;
        }
        if (floors) {
          const f = Number(floors);
          if (Number.isFinite(f) && f > 0) detail.totalFloors = f;
        }
        try {
          window.dispatchEvent(new CustomEvent('cre-prefill-roi', { detail }));
        } catch {
          // ignore
        }
        const calcEl = document.querySelector<HTMLElement>('[data-section-id="roi_calculator"]');
        if (calcEl && typeof calcEl.scrollIntoView === 'function') {
          calcEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }
    };

    const handlePopState = () => {
      setActiveDeal(null);
    };

    const scroller = document.querySelector<HTMLElement>('[data-deals-carousel]');
    document.addEventListener('click', handleDocClick);
    window.addEventListener('popstate', handlePopState);
    scroller?.addEventListener('scroll', updateCarouselCounter, { passive: true });

    return () => {
      document.removeEventListener('click', handleDocClick);
      window.removeEventListener('popstate', handlePopState);
      scroller?.removeEventListener('scroll', updateCarouselCounter);
    };
  }, []);

  const telDigits = sanitizePhoneDigits(brokerPhone);
  const formattedPhone = formatKrPhoneForDisplay(brokerPhone);
  const profileHref = `/broker-profile/${encodeURIComponent(brokerSlug)}?ref=magazine-cta`;
  const expertRequestHref = `/expert-note/request?broker=${encodeURIComponent(brokerSlug)}${
    activeDeal?.id ? `&deal=${encodeURIComponent(activeDeal.id)}` : ''
  }&ref=magazine-im-request`;
  const smsBody = activeDeal
    ? encodeURIComponent(
        `[${brokerName} 매거진 문의] ${activeDeal.address} (${activeDeal.assetType}, ${activeDeal.price}) 투자설명서(IM) 및 상세자료를 요청합니다.`,
      )
    : '';
  const smsHref = telDigits.length >= 8 ? `sms:${telDigits}?body=${smsBody}` : null;
  const isUuidDeal = activeDeal ? UUID_PREFIX_RE.test(activeDeal.id) : false;
  const hasVerifiedTokenImUrl = Boolean(
    activeDeal?.imUrl && /(?:[?&](?:token|t)=[^&]+)/i.test(activeDeal.imUrl),
  );

  return (
    <Modal
      open={Boolean(activeDeal)}
      onOpenChange={(next) => {
        if (!next) closeSheet();
      }}
      title={activeDeal?.address ?? '매물 상담 안내'}
      description={activeDeal?.assetType}
      side="bottom"
      size="md"
      className="mx-auto sm:my-auto sm:max-w-md sm:rounded-2xl sm:border-b border-slate-200 bg-white text-slate-900"
    >
      {activeDeal ? (
        <div
          data-testid="deal-inquiry-sheet"
          style={{ wordBreak: 'keep-all' }}
        >
          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[16px] font-semibold text-slate-700">매매·기준가</span>
              <span className="font-mono text-[20px] font-extrabold text-indigo-800 tabular-nums">
                {activeDeal.price}
              </span>
            </div>
            {activeDeal.areaSignal && (
              <div className="border-t border-slate-200 pt-2.5">
                <p className="text-sm font-semibold text-slate-700">주요 특징 · 면적 안내</p>
                <p className="mt-1 text-[17px] font-medium leading-relaxed text-slate-900">
                  {activeDeal.areaSignal}
                </p>
              </div>
            )}
          </div>

          <p className="mt-3.5 text-sm leading-relaxed text-slate-700">
            상세 지번·임대차 내역·투자설명서(IM)는 매도인 정보 보호를 위해 담당 중개사({brokerName})가 직접 안내해 드립니다.
          </p>

          <div className="mt-4 space-y-2.5">
            {/* #1 Primary Action: 토큰 검증된 IM 링크만 직접 열람, 그 외 UUID 매물은 딜카드(/dc)로 안전 유도 */}
            {isUuidDeal && hasVerifiedTokenImUrl && activeDeal.imUrl ? (
              <a
                href={activeDeal.imUrl}
                data-track="im_request"
                data-testid="deal-inquiry-primary-im-link"
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 px-4 py-3 text-[17px] font-extrabold text-white shadow-sm transition-colors"
              >
                <span aria-hidden="true">📄</span>
                <span>상세 제안서(IM) 보기</span>
              </a>
            ) : isUuidDeal ? (
              <a
                href={`/dc/${encodeURIComponent(activeDeal.id)}`}
                data-track="listing_click"
                data-testid="deal-inquiry-primary-dealcard-link"
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 px-4 py-3 text-[17px] font-extrabold text-white shadow-sm transition-colors"
              >
                <span aria-hidden="true">📄</span>
                <span>{activeDeal.hasIm ? '딜카드에서 IM 열람 신청' : '딜카드 먼저 보기'}</span>
              </a>
            ) : (
              <a
                href={expertRequestHref}
                data-track="im_request"
                data-testid="deal-inquiry-primary-inquiry-link"
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 px-4 py-3 text-[17px] font-extrabold text-white shadow-sm transition-colors"
              >
                <span aria-hidden="true">📄</span>
                <span>상세 제안서(IM) 요청하기</span>
              </a>
            )}

            {/* #2 중개사 전화 문의 + 번호 복사 */}
            <div data-track="cta_click">
              <PhoneActionButton
                phone={brokerPhone}
                variant="inline"
                showFormattedNumber={false}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]"
                callClassName="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-[17px] font-extrabold text-white shadow-sm transition-colors hover:bg-emerald-800"
                copyClassName="flex min-h-[52px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-3 text-[15px] font-bold text-slate-900 transition-colors hover:bg-slate-50 cursor-pointer"
                copyLabel="번호 복사"
                copiedLabel="✓ 연락처 복사됨"
                copyTestId="deal-inquiry-copy-phone-btn"
                renderCallContent={
                  <>
                    <span aria-hidden="true">📞</span>
                    <span>전화 문의 ({formattedPhone})</span>
                  </>
                }
              />
            </div>

            {/* #3 문자 요청(전화번호 보유 시) 또는 온라인 상담 요청 */}
            {smsHref ? (
              <a
                href={smsHref}
                data-track="im_request"
                data-testid="deal-inquiry-sms-link"
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-4 py-2.5 text-[16px] font-bold text-indigo-900 transition-colors"
              >
                <span aria-hidden="true">💬</span>
                <span>문자로 상세 제안서(IM) 요청 ({formattedPhone})</span>
              </a>
            ) : (
              <a
                href={expertRequestHref}
                data-track="im_request"
                data-testid="deal-inquiry-consult-link"
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-4 py-2.5 text-[16px] font-bold text-indigo-900 transition-colors"
              >
                <span aria-hidden="true">💬</span>
                <span>담당 중개사에게 자료 요청하기</span>
              </a>
            )}

            {/* #4 중개사 프로필 보기 */}
            <a
              href={profileHref}
              data-track="cta_click"
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[16px] font-bold text-slate-900 transition-colors hover:bg-slate-50"
            >
              <span aria-hidden="true">👤</span>
              <span>중개사 프로필 보기</span>
            </a>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
