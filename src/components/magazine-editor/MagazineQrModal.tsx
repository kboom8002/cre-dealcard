'use client';

import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  QrCode, Download, Copy, Check, ExternalLink, X,
  Sparkles, Printer, Smartphone, Share2
} from 'lucide-react';
import { toast } from 'sonner';

interface MagazineQrModalProps {
  brokerSlug: string;
  brokerName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function MagazineQrModal({
  brokerSlug,
  brokerName = '중개사',
  isOpen,
  onClose,
}: MagazineQrModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const subscribeUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/magazine/${brokerSlug}/subscribe?source=qr_card`
    : `https://www.credeal.net/magazine/${brokerSlug}/subscribe?source=qr_card`;

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;

    QRCode.toCanvas(
      canvasRef.current,
      subscribeUrl,
      {
        width: 260,
        margin: 2,
        color: {
          dark: '#0f172a', // Slate-900
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H',
      },
      (err) => {
        if (err) {
          console.error('[MagazineQrModal] QR generation failed:', err);
          toast.error('QR 코드를 생성하지 못했습니다.');
        }
      }
    );
  }, [isOpen, subscribeUrl]);

  if (!isOpen) return null;

  function handleCopy() {
    navigator.clipboard.writeText(subscribeUrl);
    setCopied(true);
    toast.success('구독 랜딩 URL이 복사되었습니다.');
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadPng() {
    if (!canvasRef.current) return;

    setDownloading(true);
    try {
      // 300DPI 명함 인쇄용 고해상도 캔버스 생성
      const highResCanvas = document.createElement('canvas');
      QRCode.toCanvas(
        highResCanvas,
        subscribeUrl,
        {
          width: 800,
          margin: 3,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
          errorCorrectionLevel: 'H',
        },
        (err) => {
          if (err) throw err;

          const link = document.createElement('a');
          link.download = `CREDEAL_매거진구독_QR_${brokerSlug}.png`;
          link.href = highResCanvas.toDataURL('image/png');
          link.click();
          toast.success('인쇄용 고해상도 QR 이미지가 다운로드되었습니다.');
        }
      );
    } catch (err) {
      console.error('[MagazineQrModal] Download error:', err);
      toast.error('이미지 다운로드에 실패했습니다.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl space-y-4 p-5 text-slate-200">
        {/* 헤더 */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-indigo-500/20 text-indigo-400">
                <QrCode className="w-4 h-4" />
              </span>
              <h3 className="text-base font-bold text-white">오프라인 구독 QR 코드</h3>
            </div>
            <p className="text-xs text-slate-400">
              명함, 세미나 자료, 임장 팸플릿에 삽입하여 오프라인 구독자를 확보하세요.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* QR 코드 캔버스 카드 */}
        <div className="flex flex-col items-center justify-center p-5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3">
          <div className="p-3 bg-white rounded-xl shadow-xl">
            <canvas ref={canvasRef} className="block" />
          </div>
          <div className="text-center space-y-0.5">
            <p className="text-xs font-bold text-white flex items-center justify-center gap-1">
              <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
              카메라로 스캔 시 즉시 모바일 구독 랜딩
            </p>
            <p className="text-[10px] text-slate-500 font-mono truncate max-w-[300px]">
              {subscribeUrl}
            </p>
          </div>
        </div>

        {/* 액션 버튼군 */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleDownloadPng}
            disabled={downloading}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors shadow-lg shadow-indigo-900/30"
          >
            <Download className="w-3.5 h-3.5" />
            <span>고해상도 QR 다운로드</span>
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">복사 완료!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>구독 링크 복사</span>
              </>
            )}
          </button>
        </div>

        {/* 명함 인쇄 가이드 팁 */}
        <div className="p-3 bg-indigo-950/20 border border-indigo-500/20 rounded-xl space-y-1 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-indigo-300">
            <Printer className="w-3.5 h-3.5" />
            <span>명함 뒷면 인쇄 추천 문구</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed bg-black/30 p-2 rounded border border-white/5">
            &ldquo;스마트폰 카메라로 비추시면, 매주 화요일 {brokerName} 중개사의 단독 급매 리포트를 카카오톡으로 받아보실 수 있습니다.&rdquo;
          </p>
        </div>

        {/* 모달 닫기 & 바로가기 */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
          <a
            href={subscribeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-indigo-300 flex items-center gap-1 text-[11px] transition-colors"
          >
            <span>랜딩 페이지 직접 열어보기</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
