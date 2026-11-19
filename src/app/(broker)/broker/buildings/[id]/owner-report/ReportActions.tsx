"use client";

import { useState } from "react";

interface ReportActionsProps {
  buildingId: string;
  areaSignal: string;
  aiPageUrl: string;
}

export default function ReportActions({ buildingId, aiPageUrl }: ReportActionsProps) {
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
    } catch {
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-slate-900 text-white text-sm font-semibold shadow-lg border border-slate-700 flex items-center gap-2">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => {
            const reportUrl = `${window.location.origin}/broker/buildings/${buildingId}/owner-report`;
            copyToClipboard(reportUrl, "리포트 공유 링크");
          }}
          className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-slate-50 text-slate-900 rounded-xl font-semibold text-sm transition-all border border-slate-200 cursor-pointer shadow-xs"
        >
          <span>🔗 리포트 링크 복사</span>
        </button>

        <button
          type="button"
          onClick={handlePrint}
          className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-sm transition-all cursor-pointer shadow-xs"
        >
          <span>🖨️ PDF 리포트 인쇄</span>
        </button>
      </div>

      {/* AI Page share button */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">🌐 공실 AI 마케팅 페이지</h3>
          <button
            type="button"
            onClick={() => copyToClipboard(aiPageUrl, "AI 마케팅 페이지 링크")}
            className="min-h-[44px] px-2 text-sm text-blue-700 hover:underline font-semibold cursor-pointer"
          >
            링크 복사
          </button>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          실시간 건물 공실 마케팅 현황이 노출되는 모바일 전용 AI 임대 페이지입니다.
        </p>
        <div className="rounded-lg bg-[#FAF9F5] border border-slate-200 px-3 py-2 flex items-center justify-between">
          <p className="text-sm font-mono text-slate-700 break-all select-all flex-1 pr-2">
            {aiPageUrl}
          </p>
        </div>
        <a
          href={`https://cre-aipage.vercel.app/m/spaces/${buildingId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[44px] flex items-center justify-center w-full rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 text-sm font-semibold transition-colors"
        >
          🏠 AI 임대 페이지 바로가기
        </a>
      </div>
    </div>
  );
}
