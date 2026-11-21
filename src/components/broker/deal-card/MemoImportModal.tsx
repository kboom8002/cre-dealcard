"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import { ArrowUpDown, Clock, Pin, Search, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { UnconvertedMemoItem } from "@/lib/deal-card/memo-pairing";

interface MemoItem {
  id: string;
  memo_text: string;
  routing_type?: string;
  routing_summary?: string;
  created_at: string;
  updated_at?: string;
  is_pinned?: boolean;
  fromServer?: boolean;
}

export type MemoSortOrder = "newest" | "oldest" | "pinned" | "alphabetical";
export type MemoTypeFilter = "all" | "new_deal";

interface MemoImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMemo: (memoText: string) => void;
  extraMemos?: UnconvertedMemoItem[];
  onDeleteMemo?: (memoId: string) => void | Promise<void>;
}

const UUID_LIKE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function MemoImportModal({
  isOpen,
  onClose,
  onSelectMemo,
  extraMemos = [],
  onDeleteMemo,
}: MemoImportModalProps) {
  const uid = useId();
  const pasteId = `${uid}-memo-import-paste`;
  const searchId = `${uid}-memo-import-search`;

  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [sortOrder, setSortOrder] = useState<MemoSortOrder>("newest");
  const [typeFilter, setTypeFilter] = useState<MemoTypeFilter>("all");
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setPastedText("");
    setSearchQuery("");
    setConfirmDeleteId(null);
    setDeletedIds(new Set());

    fetch("/api/broker/memo/save?limit=50", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`메모 목록 조회 실패 (${res.status})`);
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (json?.ok && Array.isArray(json.data)) {
          setMemos(
            json.data.map((m: MemoItem) => ({
              ...m,
              fromServer: true,
            }))
          );
        } else {
          setMemos([]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMemos([]);
          setLoadError(
            "저장된 메모 목록을 불러오지 못했어요. 아래 입력칸에 직접 붙여넣어 사용하실 수 있습니다."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const mergedMemos = useMemo(() => {
    const byId = new Map<string, MemoItem>();
    for (const m of memos) {
      if (deletedIds.has(m.id)) continue;
      byId.set(m.id, m);
    }
    for (const em of extraMemos) {
      if (!em || deletedIds.has(em.id)) continue;
      const normalizedText = em.memoText.trim();
      const duplicateByText = Array.from(byId.values()).find(
        (existing) => existing.memo_text.trim() === normalizedText
      );
      if (duplicateByText) continue;
      byId.set(em.id, {
        id: em.id,
        memo_text: em.memoText,
        routing_type: em.routingType,
        routing_summary: em.routingSummary || undefined,
        created_at: em.createdAt,
        updated_at: em.updatedAt || em.createdAt,
        is_pinned: em.isPinned,
        fromServer: false,
      });
    }
    return Array.from(byId.values());
  }, [memos, extraMemos, deletedIds]);

  const visibleMemos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = mergedMemos.filter((m) => {
      if (typeFilter === "new_deal" && m.routing_type && m.routing_type !== "new_deal") {
        return false;
      }
      if (!q) return true;
      return (
        m.memo_text.toLowerCase().includes(q) ||
        Boolean(m.routing_summary && m.routing_summary.toLowerCase().includes(q))
      );
    });

    const getTime = (m: MemoItem) =>
      Date.parse(m.updated_at || m.created_at || "") || 0;

    return filtered.slice().sort((a, b) => {
      if (sortOrder === "pinned") {
        const pinDiff = (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0);
        if (pinDiff !== 0) return pinDiff;
        return getTime(b) - getTime(a);
      }
      if (sortOrder === "oldest") {
        return getTime(a) - getTime(b);
      }
      if (sortOrder === "alphabetical") {
        return a.memo_text.trim().localeCompare(b.memo_text.trim(), "ko");
      }
      return getTime(b) - getTime(a);
    });
  }, [mergedMemos, searchQuery, sortOrder, typeFilter]);

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(
        d.getHours()
      ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch {
      return "";
    }
  };

  const handleApplyPasted = () => {
    const trimmed = pastedText.trim();
    if (!trimmed) return;
    onSelectMemo(trimmed);
    onClose();
  };

  const handleTogglePin = async (memo: MemoItem) => {
    const nextPinned = !memo.is_pinned;
    setMemos((prev) =>
      prev.map((m) => (m.id === memo.id ? { ...m, is_pinned: nextPinned } : m))
    );
    if (memo.fromServer && UUID_LIKE_RE.test(memo.id)) {
      await fetch(`/api/broker/memo/${encodeURIComponent(memo.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_pinned: nextPinned }),
      }).catch(() => {});
    }
  };

  const handleConfirmDelete = async (memo: MemoItem) => {
    setDeletingId(memo.id);
    try {
      if (memo.fromServer && UUID_LIKE_RE.test(memo.id)) {
        await fetch(`/api/broker/memo/${encodeURIComponent(memo.id)}`, {
          method: "DELETE",
        }).catch(() => {});
      }
      await onDeleteMemo?.(memo.id);
      setDeletedIds((prev) => {
        const next = new Set(prev);
        next.add(memo.id);
        return next;
      });
      setMemos((prev) => prev.filter((m) => m.id !== memo.id));
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="카톡·메모 불러오기 및 관리"
      description="저장된 메모를 불러오거나 정리(정렬·삭제)할 수 있습니다. 바로 붙여넣어 적용도 가능합니다."
      size="lg"
    >
      <div
        data-testid="memo-import-modal"
        className="space-y-4 rounded-2xl bg-[#F3F2EE] p-4 sm:p-5 text-slate-900 border border-slate-200"
      >
        {/* Direct Paste Box */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 space-y-2.5 shadow-2xs">
          <label
            htmlFor={pasteId}
            className="block text-sm font-bold text-slate-900"
          >
            직접 붙여넣기
          </label>
          <textarea
            id={pasteId}
            data-testid="memo-import-paste-textarea"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={3}
            placeholder="카톡이나 문자에 적힌 지역·용도·면적·가격 내용을 붙여넣어 주세요"
            className="w-full min-h-[48px] p-3 rounded-xl bg-[#F8FAFC] border border-slate-300 text-[16px] text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white resize-y"
          />
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="memo-import-apply-btn"
              disabled={!pastedText.trim()}
              onClick={handleApplyPasted}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-extrabold transition cursor-pointer"
            >
              이 메모 적용하기
            </button>
          </div>
        </div>

        {/* Search & Sort Controls */}
        <div className="space-y-2.5">
          <div>
            <label htmlFor={searchId} className="sr-only">
              저장된 메모 검색
            </label>
            <div className="relative">
              <Search
                className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                aria-hidden="true"
              />
              <input
                id={searchId}
                data-testid="memo-import-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="저장된 메모 내용, 지역, 가격대 검색..."
                className="w-full pl-10 pr-3.5 min-h-[48px] rounded-xl bg-white border border-slate-300 text-[16px] text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              role="group"
              aria-label="메모 정렬"
              data-testid="memo-import-sort-group"
              className="flex flex-wrap items-center gap-1.5"
            >
              <span className="inline-flex items-center gap-1 text-sm font-bold text-slate-700 mr-0.5">
                <ArrowUpDown className="w-4 h-4 text-slate-500" aria-hidden="true" />
                정렬
              </span>
              {(
                [
                  { id: "newest", label: "최신순" },
                  { id: "oldest", label: "오래된순" },
                  { id: "pinned", label: "중요 핀" },
                  { id: "alphabetical", label: "가나다순" },
                ] as const
              ).map((opt) => {
                const active = sortOrder === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`memo-import-sort-${opt.id}`}
                    aria-pressed={active}
                    onClick={() => setSortOrder(opt.id)}
                    className={`min-h-[44px] px-3 py-1 rounded-xl border text-sm font-bold transition cursor-pointer ${
                      active
                        ? "bg-blue-50 border-blue-500 text-blue-900"
                        : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="memo-import-filter-toggle"
                aria-pressed={typeFilter === "new_deal"}
                onClick={() =>
                  setTypeFilter((prev) => (prev === "all" ? "new_deal" : "all"))
                }
                className={`min-h-[44px] px-3 py-1 rounded-xl border text-sm font-bold transition cursor-pointer ${
                  typeFilter === "new_deal"
                    ? "bg-blue-50 border-blue-500 text-blue-900"
                    : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {typeFilter === "new_deal" ? "✓ 매물 메모만" : "매물 메모만"}
              </button>
            </div>
          </div>
        </div>

        {/* Memos List */}
        <div className="max-h-72 overflow-y-auto space-y-2.5 pr-0.5">
          {loadError && !extraMemos.length && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm font-medium"
            >
              {loadError}
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-sm text-slate-600">
              <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2" />
              저장된 메모 목록을 불러오는 중...
            </div>
          ) : visibleMemos.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-600 space-y-1.5">
              <p className="font-semibold text-slate-800">저장된 메모가 없습니다.</p>
              <p className="text-sm text-slate-600">
                위 입력칸에 카톡이나 문자 내용을 바로 붙여넣어 적용해 보세요.
              </p>
            </div>
          ) : (
            visibleMemos.map((memo) => {
              const isConfirming = confirmDeleteId === memo.id;
              return (
                <div
                  key={memo.id}
                  data-testid={`memo-import-card-${memo.id}`}
                  className="w-full p-3.5 rounded-xl border border-slate-300 bg-white space-y-2.5 shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Clock className="w-4 h-4 shrink-0 text-slate-500" aria-hidden="true" />
                      <span>{formatTime(memo.updated_at || memo.created_at)}</span>
                      {memo.routing_type === "new_deal" && (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-bold text-sm">
                          매물
                        </span>
                      )}
                      {memo.is_pinned && (
                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-300 font-bold text-sm">
                          중요 핀
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        data-testid={`memo-import-pin-${memo.id}`}
                        aria-label={memo.is_pinned ? "핀 고정 해제" : "상단 핀 고정"}
                        aria-pressed={Boolean(memo.is_pinned)}
                        onClick={() => void handleTogglePin(memo)}
                        className={`min-h-[44px] px-2.5 rounded-lg border text-sm font-bold inline-flex items-center gap-1 cursor-pointer transition ${
                          memo.is_pinned
                            ? "bg-amber-50 border-amber-300 text-amber-900"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <Pin className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        data-testid={`memo-import-delete-${memo.id}`}
                        onClick={() =>
                          setConfirmDeleteId(isConfirming ? null : memo.id)
                        }
                        className="min-h-[44px] px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-red-50 text-slate-700 hover:text-red-700 text-sm font-bold inline-flex items-center gap-1 cursor-pointer transition"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                        <span>삭제</span>
                      </button>
                      <button
                        type="button"
                        data-testid={`memo-import-item-${memo.id}`}
                        onClick={() => {
                          onSelectMemo(memo.memo_text);
                          onClose();
                        }}
                        className="min-h-[44px] px-3.5 py-1 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-extrabold cursor-pointer transition"
                      >
                        불러오기
                      </button>
                    </div>
                  </div>

                  <p className="text-sm text-slate-900 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                    {memo.memo_text}
                  </p>

                  {memo.routing_summary && (
                    <p className="text-sm text-slate-700 bg-[#F8FAFC] px-2.5 py-1.5 rounded-lg border border-slate-200">
                      💡 {memo.routing_summary}
                    </p>
                  )}

                  {isConfirming && (
                    <div
                      data-testid={`memo-import-delete-confirm-bar-${memo.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200"
                    >
                      <span className="text-sm font-bold text-rose-950">
                        이 메모를 메모함에서 삭제할까요?
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[44px] px-3 rounded-lg bg-white border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          data-testid={`memo-import-delete-confirm-${memo.id}`}
                          disabled={deletingId === memo.id}
                          onClick={() => void handleConfirmDelete(memo)}
                          className="min-h-[44px] px-3 rounded-lg bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-sm font-extrabold cursor-pointer"
                        >
                          {deletingId === memo.id ? "삭제 중..." : "삭제 확인"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-2 border-t border-slate-300 flex justify-end">
          <button
            type="button"
            data-testid="memo-import-close-btn"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-sm font-bold transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
