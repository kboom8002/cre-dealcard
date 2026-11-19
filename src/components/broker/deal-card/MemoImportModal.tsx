"use client";

import React, { useEffect, useId, useState } from "react";
import { ArrowRight, Clock, Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";

interface MemoItem {
  id: string;
  memo_text: string;
  routing_type?: string;
  routing_summary?: string;
  created_at: string;
  is_pinned?: boolean;
}

interface MemoImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMemo: (memoText: string) => void;
}

export function MemoImportModal({
  isOpen,
  onClose,
  onSelectMemo,
}: MemoImportModalProps) {
  const uid = useId();
  const pasteId = `${uid}-memo-import-paste`;
  const searchId = `${uid}-memo-import-search`;

  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pastedText, setPastedText] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setPastedText("");
    setSearchQuery("");

    fetch("/api/broker/memo/save?limit=30", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`메모 목록 조회 실패 (${res.status})`);
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (json?.ok && Array.isArray(json.data)) {
          setMemos(json.data);
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

  const filteredMemos = memos.filter((m) =>
    searchQuery.trim() === ""
      ? true
      : m.memo_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.routing_summary &&
          m.routing_summary.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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

  return (
    <Modal
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="카톡·메모 붙여넣기"
      description="카톡·문자 내용을 붙여넣거나 저장된 메모를 고르면 딜카드 항목에 반영됩니다."
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
            className="w-full min-h-[48px] p-3 rounded-xl bg-[#F3F2EE] border border-slate-300 text-[16px] text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white resize-y"
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

        {/* Search Bar for Saved Memos */}
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
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="저장된 메모 내용, 지역, 가격대 검색..."
              className="w-full pl-10 pr-3.5 min-h-[48px] rounded-xl bg-white border border-slate-300 text-[16px] text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        {/* Memos List */}
        <div className="max-h-72 overflow-y-auto space-y-2 pr-0.5">
          {loadError && (
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
          ) : filteredMemos.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-600 space-y-1.5">
              <p className="font-semibold text-slate-800">저장된 메모가 없습니다.</p>
              <p className="text-sm text-slate-600">
                위 입력칸에 카톡이나 문자 내용을 바로 붙여넣어 적용해 보세요.
              </p>
            </div>
          ) : (
            filteredMemos.map((memo) => (
              <button
                key={memo.id}
                type="button"
                data-testid={`memo-import-item-${memo.id}`}
                onClick={() => {
                  onSelectMemo(memo.memo_text);
                  onClose();
                }}
                className="w-full min-h-[44px] text-left p-3.5 rounded-xl border border-slate-300 bg-white hover:border-blue-500 hover:bg-blue-50/40 transition-all cursor-pointer group space-y-2 shadow-2xs"
              >
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 shrink-0 text-slate-500" aria-hidden="true" />
                    <span>{formatTime(memo.created_at)}</span>
                    {memo.routing_type === "new_deal" && (
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-bold text-sm">
                        매물
                      </span>
                    )}
                  </div>
                  <span className="text-blue-700 font-bold text-sm opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex items-center gap-0.5">
                    선택 <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </span>
                </div>
                <p className="text-sm text-slate-900 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                  {memo.memo_text}
                </p>
                {memo.routing_summary && (
                  <p className="text-sm text-slate-700 bg-[#F3F2EE] px-2.5 py-1.5 rounded-lg border border-slate-200">
                    💡 {memo.routing_summary}
                  </p>
                )}
              </button>
            ))
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
