"use client";

import { useState } from "react";

interface ReportActionsProps {
  buildingId: string;
  areaSignal: string;
  aiPageUrl: string;
}

export default function ReportActions({ buildingId, areaSignal, aiPageUrl }: ReportActionsProps) {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`📋 ${label}가 클립보드에 복사되었습니다!`);
    } catch (err) {
      showToast("❌ 복사에 실패했습니다. 직접 복사해주세요.");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4 no-print">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-neutral-900/90 text-white text-sm font-semibold shadow-2xl backdrop-blur-md border border-white/10 flex items-center gap-2 animate-bounce">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => {
            const reportUrl = `${window.location.origin}/broker/buildings/${buildingId}/owner-report`;
            copyToClipboard(reportUrl, "리포트 공유 링크");
          }}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-semibold text-sm transition-all border border-neutral-700 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98]"
        >
          <span>🔗 리포트 링크 복사</span>
        </button>

        <button
          onClick={handlePrint}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary/95 text-white rounded-xl font-semibold text-sm transition-all cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98]"
        >
          <span>🖨️ PDF 리포트 인쇄</span>
        </button>
      </div>

      {/* AI Page share button */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-200">🌐 공실 AI 마케팅 페이지</h3>
          <button
            onClick={() => copyToClipboard(aiPageUrl, "AI 마케팅 페이지 링크")}
            className="text-xs text-primary hover:underline font-semibold cursor-pointer"
          >
            링크 복사
          </button>
        </div>
        <p className="text-xs text-neutral-400 leading-relaxed">
          실시간 건물 공실 마케팅 현황이 노출되는 모바일 전용 AI 임대 페이지입니다.
        </p>
        <div className="rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2 flex items-center justify-between">
          <p className="text-xs font-mono text-neutral-400 break-all select-all flex-1 pr-2">
            {aiPageUrl}
          </p>
        </div>
        <a
          href={`https://cre-aipage.vercel.app/m/spaces/${buildingId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-full rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 px-4 py-2.5 text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
        >
          🏠 AI 임대 페이지 바로가기
        </a>
      </div>
    </div>
  );
}
