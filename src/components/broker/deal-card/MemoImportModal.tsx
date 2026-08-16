"use client";

import React, { useState, useEffect } from "react";
import { StickyNote, Clock, X, Search, Check, ArrowRight } from "lucide-react";
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
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch("/api/broker/memo/save?limit=30", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data) {
          setMemos(json.data);
        }
      })
      .catch((err) => console.error("Failed to load memos:", err))
      .finally(() => setLoading(false));
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
      return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch {
      return "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <StickyNote className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">메모함에서 불러오기</h2>
              <p className="text-xs text-muted-foreground">이전에 저장한 메모를 선택하면 딜카드 입력창에 자동 복사됩니다.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-border/50 bg-muted/20">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="메모 내용, 지역, 가격대 검색..."
              className="pl-9 h-9 text-xs bg-background"
              autoFocus
            />
          </div>
        </div>

        {/* Memos List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 divide-y divide-border/20">
          {loading ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
              메모 목록을 불러오는 중...
            </div>
          ) : filteredMemos.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground space-y-2">
              <p>저장된 메모가 없습니다.</p>
              <p className="text-[11px] text-muted-foreground/70">메모 작성 화면에서 매물 정보를 기록해 보세요.</p>
            </div>
          ) : (
            filteredMemos.map((memo) => (
              <div
                key={memo.id}
                onClick={() => {
                  onSelectMemo(memo.memo_text);
                  onClose();
                }}
                className="p-3 rounded-xl border border-border/60 hover:border-primary/50 hover:bg-primary/[0.03] transition-all cursor-pointer group space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    <span>{formatTime(memo.created_at)}</span>
                    {memo.routing_type === "new_deal" && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold text-[10px]">
                        매물
                      </span>
                    )}
                  </div>
                  <span className="text-primary font-medium text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                    선택 <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
                <p className="text-xs text-foreground line-clamp-3 leading-relaxed whitespace-pre-wrap">
                  {memo.memo_text}
                </p>
                {memo.routing_summary && (
                  <p className="text-[11px] text-muted-foreground bg-muted/40 px-2 py-1 rounded">
                    💡 {memo.routing_summary}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-border bg-muted/20 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs h-8">
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}
