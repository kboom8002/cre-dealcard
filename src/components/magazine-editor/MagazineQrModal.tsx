'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Download, Copy, Check, ExternalLink, Printer, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { ErrorState } from '@/components/ui/error-state';
import { injectPngDpi } from '@/lib/magazine/png-dpi';
import { buildPrintCopy, buildSubscribeUrl, resolvePublicBaseUrl } from '@/lib/magazine/share-urls';

/** 인쇄용 QR: 8cm @ 300DPI = 945px 이상이 필요 → 2400px 로 여유 확보 (C-04, T1-18a) */
export const QR_PRINT_PX = 2400;
export const QR_PRINT_DPI = 300;
export const QR_PRINT_CM = 8;

/**
 * 발송 요일 기본 라벨. 설정값(`src/lib/magazine/schedule-labels.ts`)이 확정되면
 * 에디터(C)가 `sendDayLabel` prop 으로 내려준다. (DC-7: 기본 화요일)
 */
const DEFAULT_SEND_DAY_LABEL = '화요일';

interface MagazineQrModalProps {
  brokerSlug: string;
  brokerName?: string;
  isOpen: boolean;
  onClose: () => void;
  /**
   * 서버가 정한 절대 base URL (APP_BASE_URL). 없으면 NEXT_PUBLIC_APP_BASE_URL /
   * NEXT_PUBLIC_SITE_URL 를 쓰고, 그것도 없으면 QR 을 만들지 않고 오류를 표시한다
   * (`window.location.origin` 으로 폴백하지 않음 — T2-25a).
   */
  baseUrl?: string;
  /** 발송 요일 라벨 (예: '화요일'). schedule-labels 상수를 에디터가 주입. */
  sendDayLabel?: string;
  /** 인쇄 문구에 표기할 수신 채널 (예: '이메일·카카오톡'). 없으면 생략. */
  channelLabel?: string;
}

export function MagazineQrModal({
  brokerSlug,
  brokerName,
  isOpen,
  onClose,
  baseUrl,
  sendDayLabel = DEFAULT_SEND_DAY_LABEL,
  channelLabel,
}: MagazineQrModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const resolvedBase = resolvePublicBaseUrl(baseUrl);
  const subscribeUrl = resolvedBase
    ? buildSubscribeUrl({ baseUrl: resolvedBase, slug: brokerSlug, source: 'qr_card' })
    : null;
  const printCopy = buildPrintCopy({ weekdayLabel: sendDayLabel, brokerName, channelLabel });

  useEffect(() => {
    if (!isOpen || !subscribeUrl) return;
    let cancelled = false;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        raf = window.requestAnimationFrame(draw);
        return;
      }
      QRCode.toCanvas(canvas, subscribeUrl, {
        width: 260,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      }).catch((err: unknown) => {
        if (cancelled) return;
        console.error('[MagazineQrModal] QR generation failed:', err);
        toast.error('QR 코드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
      });
    };
    let raf = window.requestAnimationFrame(draw);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [isOpen, subscribeUrl]);

  const handleCopy = useCallback(async () => {
    if (!subscribeUrl) return;
    try {
      await navigator.clipboard.writeText(subscribeUrl);
      setCopied(true);
      toast.success('구독 링크를 복사했어요.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('링크를 복사하지 못했어요. 아래 주소를 직접 선택해 복사해 주세요.');
    }
  }, [subscribeUrl]);

  const handleDownloadPng = useCallback(async () => {
    if (!subscribeUrl) return;
    setDownloading(true);
    try {
      // 인쇄용 고해상도 캔버스 (2400×2400 = 8cm@300DPI) + PNG pHYs 300DPI 메타
      const hi = document.createElement('canvas');
      await QRCode.toCanvas(hi, subscribeUrl, {
        width: QR_PRINT_PX,
        margin: 4,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      });
      const blob: Blob | null = await new Promise((resolve) => hi.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('toBlob returned null');
      const bytes = injectPngDpi(new Uint8Array(await blob.arrayBuffer()), QR_PRINT_DPI);
      const out = new Blob([bytes as BlobPart], { type: 'image/png' });
      const objectUrl = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.download = `CREDEAL_매거진구독_QR_${brokerSlug}_${QR_PRINT_CM}cm_${QR_PRINT_DPI}dpi.png`;
      a.href = objectUrl;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
      toast.success(`인쇄용 QR(${QR_PRINT_CM}cm · ${QR_PRINT_DPI}DPI)을 내려받았어요.`);
    } catch (err) {
      console.error('[MagazineQrModal] Download error:', err);
      toast.error('이미지를 내려받지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDownloading(false);
    }
  }, [subscribeUrl, brokerSlug]);

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="오프라인 구독 QR 코드"
      description="명함, 세미나 자료, 임장 팸플릿에 넣어 오프라인 구독자를 모으세요."
      size="md"
    >
      {!subscribeUrl ? (
        <ErrorState
          title="QR 주소를 만들 수 없어요"
          description="서비스 주소(APP_BASE_URL) 설정이 필요해요. 관리자에게 문의해 주세요."
        />
      ) : (
        <div className="space-y-4">
          {/* QR 코드 캔버스 카드 */}
          <div className="flex flex-col items-center justify-center space-y-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
            <div className="rounded-xl bg-white p-3 shadow-xl">
              <canvas
                ref={canvasRef}
                className="block"
                role="img"
                aria-label={`구독 페이지로 연결되는 QR 코드: ${subscribeUrl}`}
              />
            </div>
            <div className="w-full space-y-1 text-center">
              <p className="flex items-center justify-center gap-1 text-label font-bold text-white">
                <Smartphone className="h-4 w-4 text-indigo-400" aria-hidden="true" />
                카메라로 스캔하면 바로 구독 페이지로 이동해요
              </p>
              {/* T2-UX-5: 실제 URL 을 큰 글씨로 표시 (QR 이 안 읽힐 때 직접 입력) */}
              <p className="break-all font-mono text-body font-bold text-indigo-200">{subscribeUrl}</p>
            </div>
          </div>

          {/* 액션 버튼군 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={downloading}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2.5 text-label font-bold text-white shadow-lg shadow-indigo-900/30 transition-colors hover:bg-indigo-500 disabled:opacity-60"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>
                {downloading
                  ? '만드는 중…'
                  : `인쇄용 QR (${QR_PRINT_CM}cm · ${QR_PRINT_DPI}DPI)`}
              </span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-label font-bold text-slate-200 transition-colors hover:bg-slate-700"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  <span className="text-emerald-400">복사 완료!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  <span>구독 링크 복사</span>
                </>
              )}
            </button>
          </div>

          {/* 명함 인쇄 가이드 */}
          <div className="space-y-1 rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3">
            <div className="flex items-center gap-1.5 text-label font-bold text-indigo-300">
              <Printer className="h-4 w-4" aria-hidden="true" />
              <span>명함 뒷면 인쇄 추천 문구</span>
            </div>
            <p className="rounded border border-white/5 bg-black/30 p-2 text-label leading-relaxed text-slate-200">
              &ldquo;{printCopy}&rdquo;
            </p>
          </div>

          <div className="flex items-center justify-between border-t border-slate-800 pt-3">
            <a
              href={subscribeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1 text-label text-ink-muted transition-colors hover:text-indigo-300"
            >
              <span>구독 페이지 열어보기</span>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">(새 탭)</span>
            </a>
            <span className="inline-flex items-center gap-1 text-caption text-ink-subtle">
              <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
              {QR_PRINT_PX}px · 8cm 인쇄용
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}
