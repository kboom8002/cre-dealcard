"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { BROKER_FEEDBACK_SYSTEM_GUIDE } from "@/lib/tutorial/broker-tutorial-data";

export interface QuickFeedbackReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  buildingId?: string;
  defaultAddress?: string;
}

/**
 * URL pathname을 60대 대표중개사가 이해하기 쉬운 한국어 화면 이름으로 변환합니다.
 * 단위 테스트가 가능하도록 단독 export합니다.
 */
export function resolveScreenNameFromPathname(pathname: string): string {
  if (!pathname) return "기타 화면";
  if (pathname === "/broker") return "🏠 홈 화면 (대시보드 · 퀵액션 · 알림)";
  if (pathname.startsWith("/broker/deal-card/new")) return "➕ 1분 딜카드 신규 등록 (카톡 메모 입력)";
  if (pathname.startsWith("/broker/deal-card/")) return "📱 1분 딜카드 상세 · 수신자 블라인드 화면 · 카톡 공유";
  if (pathname.includes("/im-lite")) return "📊 IM 완성 검수 · 웹 뷰어 (완성도 80점 점검)";
  if (pathname.startsWith("/broker/buildings")) return "🏢 내 물건 보관함 · IM 목록 (딜카드 vs 모바일 IM)";
  if (pathname.startsWith("/broker/basic-im-studio")) return "🎨 Basic IM 슬라이드 편집 스튜디오 (16:9 프리뷰 · 테마)";
  if (pathname.startsWith("/broker/im-approval")) return "✏️ IM 검토 · 공개 승인 · 사진 역할 큐레이션";
  if (pathname.startsWith("/broker/clients")) return "👥 고객 명단 · 구독 관리 (VIP/일반/잠재)";
  if (pathname.startsWith("/broker/inbox")) return "🔔 소통 관리함 (열람 알림 · G1~G3 게이트 요청)";
  if (pathname.startsWith("/broker/profile")) return "👤 중개사 프로필 · 디지털 명함 설정";
  if (pathname.startsWith("/broker/magazine-editor")) return "📰 주간 고객 소식지 간편 발행";
  if (pathname.startsWith("/broker/tutorial")) return "📖 60대 중개인 큰글씨 사용 설명서";
  return "기타 화면";
}

/**
 * 60대 대표공인중개사 맞춤형 10초 현장 불편 제보 및 개선 건의 모달 (Tier 4)
 * - 현재 URL 경로와 매물 번호/지번을 자동 감지하여 5대 항목 제보 양식을 미리 채웁니다.
 * - [📋 제보 양식 1초 복사] 원클릭 클립보드 복사
 * - 대표님들의 목소리로 개선된 실제 사례(reflectedExamples) 안내
 */
export function QuickFeedbackReportModal({
  isOpen,
  onClose,
  buildingId,
  defaultAddress = "",
}: QuickFeedbackReportModalProps) {
  const pathname = usePathname() || "";
  const detectedScreen = resolveScreenNameFromPathname(pathname);

  const [brokerName, setBrokerName] = useState("");
  const [dealAddress, setDealAddress] = useState(defaultAddress);
  const [selectedScreen, setSelectedScreen] = useState(detectedScreen);
  const [complaintText, setComplaintText] = useState("");
  const [desiredImprovement, setDesiredImprovement] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  // Sync state if pathname or defaultAddress changes when opening
  useEffect(() => {
    if (isOpen) {
      setSelectedScreen(resolveScreenNameFromPathname(pathname));
      if (defaultAddress && !dealAddress) {
        setDealAddress(defaultAddress);
      }
    }
  }, [isOpen, pathname, defaultAddress]);

  // Handle ESC key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyReport = async () => {
    const reportText = [
      "[크리딜(CRE DealCard) 중개인 현장 피드백 / 개선 요청]",
      `1. 작성자(중개사무소 / 성함): ${brokerName || "(미입력)"}`,
      `2. 작업 중이던 매물 주소(지번): ${dealAddress || (buildingId ? `매물 ID: ${buildingId}` : "(해당 매물 없음)")}`,
      `3. 관련 화면: [O] ${selectedScreen}`,
      "4. 현장 불편 사항 또는 개선 건의 내용:",
      `   - 무엇이 불편하셨나요?: ${complaintText || "(작성 대기)"}`,
      `   - 어떻게 바뀌면 좋겠나요?: ${desiredImprovement || "(작성 대기)"}`,
      `5. 접수 일시 및 경로: ${new Date().toLocaleString("ko-KR")} (${pathname})`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(reportText);
      setIsCopied(true);
      toast.success("✅ 제보 양식이 복사되었습니다! 카톡이나 메일로 붙여넣기(Ctrl+V) 하세요.");
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  };

  return typeof document !== "undefined"
    ? createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
          onClick={onClose}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="10초 현장 불편 제보 및 개선 건의"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border-2 border-amber-400 bg-[#FFFBEB] text-[#0F172A] shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-5 py-4 bg-white border-b border-amber-300 flex items-center justify-between gap-3 shrink-0">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300 text-[12px] font-black mb-1">
                  🛠️ 현장 소통 창구
                </span>
                <h3 className="text-[19px] sm:text-[21px] font-black text-slate-900 leading-snug">
                  10초 현장 불편 제보 · 개선 요청
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 text-[14px] font-extrabold shrink-0 cursor-pointer"
              >
                ✕ 닫기
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-[15px]">
              <div className="p-3.5 rounded-2xl bg-amber-100/70 border border-amber-300 space-y-1">
                <p className="font-black text-amber-950 text-[15px]">
                  💡 대표님의 한마디가 크리딜을 가장 빠르게 발전시킵니다.
                </p>
                <p className="text-[13px] text-slate-800 font-medium">
                  불편하셨던 점을 적어 아래 <strong>[📋 제보 양식 1초 복사]</strong> 버튼을 누르시면, 담당 엔지니어가 동일한 화면·지번으로 즉시 확인하여 수정합니다.
                </p>
              </div>

              {/* Form Inputs */}
              <div className="space-y-3 bg-white p-4 rounded-2xl border border-amber-200">
                <div>
                  <label className="block text-[13px] font-black text-slate-700 mb-1">
                    1. 작성자 (사무소 상호 / 대표님 성함)
                  </label>
                  <input
                    type="text"
                    value={brokerName}
                    onChange={(e) => setBrokerName(e.target.value)}
                    placeholder="예: 현대부동산중개법인 김대표"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-[15px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-black text-slate-700 mb-1">
                    2. 작업 중이던 매물 주소 또는 지번
                  </label>
                  <input
                    type="text"
                    value={dealAddress}
                    onChange={(e) => setDealAddress(e.target.value)}
                    placeholder="예: 서울 중구 쌍림동 114 (운남빌딩)"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-[15px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-black text-slate-700 mb-1">
                    3. 관련 화면 (현재 화면 자동 감지됨)
                  </label>
                  <input
                    type="text"
                    value={selectedScreen}
                    onChange={(e) => setSelectedScreen(e.target.value)}
                    className="w-full rounded-xl border border-amber-400 bg-amber-50/50 px-3.5 py-2 text-[14px] font-bold text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-black text-slate-700 mb-1">
                    4. 무엇이 불편하셨나요?
                  </label>
                  <textarea
                    rows={2}
                    value={complaintText}
                    onChange={(e) => setComplaintText(e.target.value)}
                    placeholder="예: 렌트롤 엑셀을 올렸는데 보증금 합계 숫자가 안 맞습니다 / 글씨가 작아 잘 안 보입니다"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-[15px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-black text-slate-700 mb-1">
                    5. 어떻게 바뀌면 좋겠나요? (선택)
                  </label>
                  <input
                    type="text"
                    value={desiredImprovement}
                    onChange={(e) => setDesiredImprovement(e.target.value)}
                    placeholder="예: 엑셀 올리기 전에 필수 열을 미리 짚어주면 좋겠습니다"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-[15px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Reflected Examples from BROKER_FEEDBACK_SYSTEM_GUIDE */}
              <div className="space-y-2 bg-white p-4 rounded-2xl border border-slate-300">
                <p className="font-black text-blue-950 text-[14px]">
                  ✨ 대표님들의 피드백으로 개선된 실제 사례
                </p>
                <div className="space-y-2 text-[13px]">
                  {BROKER_FEEDBACK_SYSTEM_GUIDE.reflectedExamples.map((item, idx) => (
                    <div key={idx} className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 space-y-1">
                      <p className="font-extrabold text-slate-800">{item.brokerVoice}</p>
                      <p className="font-bold text-emerald-800">{item.systemSolution}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Copy Button */}
            <div className="px-5 py-3.5 bg-white border-t border-amber-300 flex items-center justify-between gap-3 shrink-0">
              <span className="text-[13px] text-slate-600 font-semibold hidden sm:inline">
                양식을 복사한 뒤 카톡 또는 문자메시지로 전송해 주세요.
              </span>
              <button
                type="button"
                onClick={handleCopyReport}
                data-testid="copy-feedback-report-btn"
                className={`w-full sm:w-auto px-5 py-2.5 min-h-[42px] rounded-xl text-[15px] font-black transition-colors cursor-pointer shadow-xs ${
                  isCopied
                    ? "bg-emerald-700 text-white"
                    : "bg-amber-400 hover:bg-amber-500 text-slate-950 border border-amber-500/80"
                }`}
              >
                {isCopied ? "✅ 1초 복사 완료! (카톡에 붙여넣으세요)" : "📋 제보 양식 1초 복사"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;
}
