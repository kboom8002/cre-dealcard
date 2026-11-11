"use client";

import React, { useState, useEffect } from "react";
import { StickyNote, Clock, X, Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export function MemoImportModal({ isOpen, onClose, onSelectMemo }: MemoImportModalProps) {
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pastedText, setPastedText] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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
          setLoadError("저장된 메모 목록을 불러오지 못했어요. 아래 입력칸에 직접 붙여넣어 사용하실 수 있습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredMemos = memos.filter((m) =>
    searchQuery.trim() === ""
      ? true
      : m.memo_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.routing_summary && m.routing_summary.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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
    <div
      data-modal-backdrop="true"
      data-testid="memo-import-modal"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.55)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="memo-import-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white border border-slate-300 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-slate-900">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-700 shrink-0">
              <StickyNote className="w-5 h-5" />
            </div>
            <div>
              <h2 id="memo-import-modal-title" className="text-lg font-extrabold text-slate-900">
                카톡·메모 붙여넣기
              </h2>
              <p className="text-sm text-slate-600">
                카톡·문자 내용을 붙여넣거나 저장된 메모를 고르면 딜카드 항목에 반영됩니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="memo-import-close-btn"
            aria-label="닫기"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Direct Paste Box */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/80 space-y-2.5">
          <label htmlFor="memo-import-paste-input" className="block text-sm font-bold text-slate-800">
            직접 붙여넣기
          </label>
          <textarea
            id="memo-import-paste-input"
            data-testid="memo-import-paste-textarea"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={3}
            placeholder="예: 강남구 역삼동 근생빌딩 매매 95억, 연면적 420평, 역세권 코너 만실 운영"
            className="w-full p-3 rounded-xl bg-white border border-slate-300 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
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
        <div className="p-3 border-b border-slate-200 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="저장된 메모 내용, 지역, 가격대 검색..."
              className="pl-9 min-h-[44px] text-sm bg-white text-slate-900"
            />
          </div>
        </div>

        {/* Memos List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
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
              <p className="font-semibold text-slate-700">저장된 메모가 없습니다.</p>
              <p className="text-sm text-slate-500">
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
                className="w-full text-left p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition-all cursor-pointer group space-y-2"
              >
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span>{formatTime(memo.created_at)}</span>
                    {memo.routing_type === "new_deal" && (
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-sm">
                        매물
                      </span>
                    )}
                  </div>
                  <span className="text-blue-700 font-bold text-sm opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex items-center gap-0.5">
                    선택 <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
                <p className="text-sm text-slate-900 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                  {memo.memo_text}
                </p>
                {memo.routing_summary && (
                  <p className="text-sm text-slate-700 bg-slate-100 px-2.5 py-1.5 rounded-lg">
                    💡 {memo.routing_summary}
                  </p>
                )}
              </button>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="text-sm min-h-[44px] px-4 font-bold"
          >
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}
