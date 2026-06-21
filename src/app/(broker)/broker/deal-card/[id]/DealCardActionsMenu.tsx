"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DealCardActionsMenuProps {
  buildingId: string;
}

export function DealCardActionsMenu({ buildingId }: DealCardActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/broker/deal-card/${buildingId}/delete`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "삭제 실패");
      router.push("/broker/buildings");
      router.refresh();
    } catch (err: any) {
      alert(`삭제 중 오류가 발생했습니다: ${err.message}`);
      setIsDeleting(false);
      setShowConfirm(false);
    }
  }

  return (
    <>
      {/* ⋮ 버튼 */}
      <div className="relative">
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="더 보기"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>

        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            {/* Dropdown */}
            <div className="absolute right-0 top-9 z-50 w-40 rounded-xl border border-border bg-card shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setShowConfirm(true);
                }}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-rose-500 hover:bg-rose-500/10 transition-colors text-left"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4h6v2" />
                </svg>
                딜카드 삭제
              </button>
            </div>
          </>
        )}
      </div>

      {/* 삭제 확인 모달 */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl border border-border">
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-foreground">딜카드를 삭제하시겠습니까?</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                이 딜카드와 관련된 <strong>투자설명서, 딜 신호 카드</strong>도 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl border border-border bg-muted/50 hover:bg-muted transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 text-sm font-bold rounded-xl bg-rose-500 text-white hover:bg-rose-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    삭제 중...
                  </>
                ) : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
