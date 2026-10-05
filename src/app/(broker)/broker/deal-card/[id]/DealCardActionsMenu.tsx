"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ShareToCircleSheet } from "@/components/circle/ShareToCircleSheet";
import { SpecialEditionModal } from "@/components/magazine-editor";

import { toast } from "sonner";

interface DealCardActionsMenuProps {
  buildingId: string;
}

export function DealCardActionsMenu({ buildingId }: DealCardActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showSpecialModal, setShowSpecialModal] = useState(false);
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  /** 메뉴를 닫는다. restoreFocus 면 ⋮ 버튼으로 포커스를 돌려준다(키보드 사용자). */
  const closeMenu = useCallback((restoreFocus = true) => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // 열릴 때 첫 메뉴 항목으로 포커스 이동
  useEffect(() => {
    if (!isOpen) return;
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, [isOpen]);

  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length].focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1].focus();
    } else if (e.key === "Tab") {
      // 메뉴 밖으로 Tab 이동 시 메뉴를 닫는다(포커스는 브라우저 기본 이동 유지)
      closeMenu(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/broker/deal-card/${buildingId}/delete`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "삭제 실패");
      toast.success("딜카드가 삭제되었습니다.");
      router.push("/broker/buildings");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "알 수 없는 오류";
      toast.error(`삭제 중 오류가 발생했습니다: ${msg}`);
      setIsDeleting(false);
      setShowConfirm(false);
    }
  }

  return (
    <>
      {/* ⋮ 버튼 */}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="w-11 h-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="더 보기"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={isOpen ? `deal-card-menu-${buildingId}` : undefined}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
              aria-hidden="true"
              onClick={() => closeMenu(true)}
            />
            {/* Dropdown */}
            <div
              ref={menuRef}
              id={`deal-card-menu-${buildingId}`}
              role="menu"
              aria-label="딜카드 메뉴"
              tabIndex={-1}
              onKeyDown={handleMenuKeyDown}
              className="absolute right-0 top-12 z-50 w-48 rounded-xl border border-border bg-card shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu(true);
                  setShowSpecialModal(true);
                }}
                className="w-full flex items-center gap-2 px-4 py-3 min-h-11 text-sm text-rose-400 font-bold hover:bg-rose-500/10 focus:bg-rose-500/10 focus:outline-none transition-colors text-left border-b border-border/50"
              >
                ⚡ 속보 매거진 발행
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu(true);
                  setShowShareSheet(true);
                }}
                className="w-full flex items-center gap-2.5 px-4 py-3 min-h-11 text-sm text-amber-400 font-bold hover:bg-amber-500/10 focus:bg-amber-500/10 focus:outline-none transition-colors text-left border-b border-border/50"
              >
                🤝 서클에 공유
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu(true);
                  setShowConfirm(true);
                }}
                className="w-full flex items-center gap-2.5 px-4 py-3 min-h-11 text-sm text-rose-500 hover:bg-rose-500/10 focus:bg-rose-500/10 focus:outline-none transition-colors text-left"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

      {showShareSheet && (
        <ShareToCircleSheet
          assetType="building"
          assetId={buildingId}
          onClose={() => setShowShareSheet(false)}
        />
      )}

      {showSpecialModal && (
        <SpecialEditionModal
          buildingId={buildingId}
          isOpen={showSpecialModal}
          onClose={() => setShowSpecialModal(false)}
        />
      )}

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
