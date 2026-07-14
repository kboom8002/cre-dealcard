"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Building2, Search, Edit3, StickyNote, Trash2,
  ArrowRight, Pin, PinOff, MoreVertical, X, Filter, CheckCircle2,
  Calendar, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/* ───── Types ───── */
interface Memo {
  id: string;
  memo_text: string;
  routing_type: string;
  routing_summary: string;
  status: string;
  created_at: string;
  updated_at: string | null;
  is_pinned: boolean;
  tags: string[];
  converted_to: string | null;
}

type FilterTab = "all" | "pinned" | "new_deal" | "buyer_condition" | "general_note";

/* ───── Helpers ───── */
function formatMemoTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;

  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hr = d.getHours().toString().padStart(2, "0");
  const min = d.getMinutes().toString().padStart(2, "0");
  return `${month}/${day} ${hr}:${min}`;
}

function getDateGroup(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekStart = new Date(today.getTime() - today.getDay() * 86400000);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000);

  if (d >= today) return "오늘";
  if (d >= yesterday) return "어제";
  if (d >= weekStart) return "이번 주";
  if (d >= lastWeekStart) return "지난 주";
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

function getTypeInfo(type: string) {
  switch (type) {
    case "new_deal":
      return { label: "신규 매물", icon: <Building2 className="w-3.5 h-3.5" />, color: "text-blue-400 bg-blue-500/10 border-blue-500/30" };
    case "buyer_condition":
      return { label: "매수 조건", icon: <Search className="w-3.5 h-3.5" />, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
    case "update_building":
      return { label: "정보 보강", icon: <Edit3 className="w-3.5 h-3.5" />, color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
    case "schedule_event":
      return { label: "일정", icon: <Calendar className="w-3.5 h-3.5" />, color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
    default:
      return { label: "일반 메모", icon: <StickyNote className="w-3.5 h-3.5" />, color: "text-slate-400 bg-slate-500/10 border-slate-500/30" };
  }
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "pinned", label: "📌 고정" },
  { key: "new_deal", label: "🏢 매물" },
  { key: "buyer_condition", label: "🔍 매수" },
  { key: "general_note", label: "📝 일반" },
];

/* ───── Component ───── */
export default function BrokerMemosPage() {
  const router = useRouter();
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Fetch ── */
  const fetchMemos = useCallback(async (q = "", type = "", pinned = "") => {
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (type) params.set("type", type);
      if (pinned) params.set("pinned", pinned);
      const res = await fetch(`/api/broker/memo/save?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (json.ok && json.data) setMemos(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemos();
  }, [fetchMemos]);

  /* ── Search with debounce ── */
  const handleSearch = (val: string) => {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const type = activeTab === "all" || activeTab === "pinned" ? "" : activeTab;
      const pinned = activeTab === "pinned" ? "true" : "";
      fetchMemos(val, type, pinned);
    }, 300);
  };

  /* ── Tab change ── */
  const handleTabChange = (tab: FilterTab) => {
    setActiveTab(tab);
    const type = tab === "all" || tab === "pinned" ? "" : tab;
    const pinned = tab === "pinned" ? "true" : "";
    setLoading(true);
    fetchMemos(searchQuery, type, pinned);
  };

  /* ── Delete ── */
  const handleDelete = async (id: string) => {
    if (!confirm("정말 이 메모를 삭제하시겠습니까?")) return;
    setMemos((prev) => prev.filter((m) => m.id !== id));
    setOpenMenuId(null);
    try {
      const res = await fetch(`/api/broker/memo/${id}`, { method: "DELETE" });
      if (!res.ok) fetchMemos();
    } catch {
      fetchMemos();
    }
  };

  /* ── Pin toggle ── */
  const handleTogglePin = async (memo: Memo) => {
    const newPinned = !memo.is_pinned;
    setMemos((prev) =>
      prev.map((m) => (m.id === memo.id ? { ...m, is_pinned: newPinned } : m))
    );
    setOpenMenuId(null);
    try {
      await fetch(`/api/broker/memo/${memo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_pinned: newPinned }),
      });
    } catch {
      fetchMemos();
    }
  };

  /* ── Edit ── */
  const startEdit = (memo: Memo) => {
    setEditingId(memo.id);
    setEditText(memo.memo_text);
    setOpenMenuId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const saveEdit = async (id: string) => {
    if (!editText.trim()) return;
    const now = new Date().toISOString();
    setMemos((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, memo_text: editText, updated_at: now } : m
      )
    );
    setEditingId(null);
    try {
      await fetch(`/api/broker/memo/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo_text: editText }),
      });
    } catch {
      fetchMemos();
    }
  };

  /* ── Transfer ── */
  const handleTransfer = (memo: Memo) => {
    sessionStorage.setItem("memo_transfer", memo.memo_text);
    if (memo.routing_type === "new_deal") {
      router.push("/broker/deal-card/new");
    } else if (memo.routing_type === "buyer_condition") {
      router.push("/broker/buyer-intents/new");
    } else {
      router.push("/broker/deal-card/new");
    }
  };

  /* ── Close menu on outside click ── */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    if (openMenuId) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuId]);

  /* ── Count helpers ── */
  const tabCounts = {
    all: memos.length,
    pinned: memos.filter((m) => m.is_pinned).length,
    new_deal: memos.filter((m) => m.routing_type === "new_deal").length,
    buyer_condition: memos.filter((m) => m.routing_type === "buyer_condition").length,
    general_note: memos.filter((m) => m.routing_type === "general_note" || !m.routing_type).length,
  };

  /* ── Group by date ── */
  const groupedMemos: { group: string; items: Memo[] }[] = [];
  const pinnedMemos = memos.filter((m) => m.is_pinned);
  const unpinnedMemos = memos.filter((m) => !m.is_pinned);

  // Build date groups for unpinned memos
  const groups = new Map<string, Memo[]>();
  for (const memo of unpinnedMemos) {
    const g = getDateGroup(memo.created_at);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(memo);
  }
  for (const [group, items] of groups) {
    groupedMemos.push({ group, items });
  }

  return (
    <main className="flex flex-col min-h-screen bg-background pb-24">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="w-full max-w-lg mx-auto px-4 pt-6 pb-3">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/broker")}
                className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-bold">메모함</h1>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full font-medium">
              {memos.length}건
            </span>
          </div>

          {/* ── Search ── */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="메모 검색..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 bg-muted/50 border border-border/50 rounded-xl text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(""); handleSearch(""); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* ── Filter Tabs ── */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeTab === tab.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {tab.label}
                {activeTab === "all" && (
                  <span className="ml-1 opacity-70">
                    {tabCounts[tab.key] || 0}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="w-full max-w-lg mx-auto px-4 pt-4 space-y-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">로딩 중...</p>
          </div>
        ) : memos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
              {searchQuery ? (
                <Search className="w-8 h-8 text-muted-foreground/50" />
              ) : activeTab !== "all" ? (
                <Filter className="w-8 h-8 text-muted-foreground/50" />
              ) : (
                <StickyNote className="w-8 h-8 text-muted-foreground/50" />
              )}
            </div>
            <div>
              <p className="text-base font-semibold text-foreground/80">
                {searchQuery
                  ? "검색 결과가 없습니다"
                  : activeTab !== "all"
                  ? "해당 분류의 메모가 없습니다"
                  : "아직 저장된 메모가 없어요"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {searchQuery
                  ? "다른 키워드로 검색해보세요."
                  : activeTab !== "all"
                  ? "다른 분류를 확인해보세요."
                  : "유니버설 메모를 활용해 기록해보세요."}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Pinned Section ── */}
            {pinnedMemos.length > 0 && activeTab !== "pinned" && (
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium px-1">
                  <Pin className="w-3 h-3" />
                  <span>고정된 메모</span>
                </div>
                {pinnedMemos.map((memo) => (
                  <MemoCard
                    key={memo.id}
                    memo={memo}
                    isEditing={editingId === memo.id}
                    editText={editText}
                    setEditText={setEditText}
                    onStartEdit={() => startEdit(memo)}
                    onCancelEdit={cancelEdit}
                    onSaveEdit={() => saveEdit(memo.id)}
                    onDelete={() => handleDelete(memo.id)}
                    onTogglePin={() => handleTogglePin(memo)}
                    onTransfer={() => handleTransfer(memo)}
                    openMenuId={openMenuId}
                    setOpenMenuId={setOpenMenuId}
                    menuRef={menuRef}
                  />
                ))}
              </div>
            )}

            {/* ── Date-grouped memos ── */}
            {(activeTab === "pinned" ? [{ group: "고정된 메모", items: pinnedMemos }] : groupedMemos).map(({ group, items }) =>
              items.length > 0 ? (
                <div key={group} className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium px-1 pt-2">
                    <Clock className="w-3 h-3" />
                    <span>{group}</span>
                  </div>
                  {items.map((memo) => (
                    <MemoCard
                      key={memo.id}
                      memo={memo}
                      isEditing={editingId === memo.id}
                      editText={editText}
                      setEditText={setEditText}
                      onStartEdit={() => startEdit(memo)}
                      onCancelEdit={cancelEdit}
                      onSaveEdit={() => saveEdit(memo.id)}
                      onDelete={() => handleDelete(memo.id)}
                      onTogglePin={() => handleTogglePin(memo)}
                      onTransfer={() => handleTransfer(memo)}
                      openMenuId={openMenuId}
                      setOpenMenuId={setOpenMenuId}
                      menuRef={menuRef}
                    />
                  ))}
                </div>
              ) : null
            )}
          </>
        )}
      </div>
    </main>
  );
}

/* ───── MemoCard Sub-component ───── */
interface MemoCardProps {
  memo: Memo;
  isEditing: boolean;
  editText: string;
  setEditText: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onTransfer: () => void;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
}

function MemoCard({
  memo, isEditing, editText, setEditText,
  onStartEdit, onCancelEdit, onSaveEdit,
  onDelete, onTogglePin, onTransfer,
  openMenuId, setOpenMenuId, menuRef,
}: MemoCardProps) {
  const info = getTypeInfo(memo.routing_type);
  const isMenuOpen = openMenuId === memo.id;
  const isConverted = memo.status === "converted";
  const wasEdited = memo.updated_at && memo.updated_at !== memo.created_at
    && new Date(memo.updated_at).getTime() - new Date(memo.created_at).getTime() > 5000;

  return (
    <div className={`bg-card border rounded-xl p-4 shadow-sm transition-all hover:shadow-md ${
      memo.is_pinned ? "border-primary/30 bg-primary/[0.02]" : "border-border/50"
    } ${isConverted ? "opacity-70" : ""}`}>
      {/* Top row: type badge + menu */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${info.color}`}>
            {info.icon}
            <span>{info.label}</span>
          </div>
          {memo.is_pinned && (
            <Pin className="w-3 h-3 text-primary/60" />
          )}
          {isConverted && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-medium">
              <CheckCircle2 className="w-3 h-3" /> 전환됨
            </span>
          )}
        </div>

        {/* Context menu */}
        <div className="relative" ref={isMenuOpen ? menuRef : undefined}>
          <button
            onClick={() => setOpenMenuId(isMenuOpen ? null : memo.id)}
            className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 top-7 z-30 bg-popover border border-border rounded-lg shadow-xl py-1 min-w-[140px] animate-in fade-in slide-in-from-top-1 duration-150">
              <button
                onClick={onStartEdit}
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" /> 수정하기
              </button>
              <button
                onClick={onTogglePin}
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 transition-colors"
              >
                {memo.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                {memo.is_pinned ? "고정 해제" : "고정하기"}
              </button>
              <div className="border-t border-border my-1" />
              <button
                onClick={onDelete}
                className="w-full px-3 py-2 text-left text-sm hover:bg-destructive/10 text-destructive flex items-center gap-2 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> 삭제하기
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Body: memo text or edit mode */}
      {isEditing ? (
        <div className="space-y-3">
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="min-h-[120px] text-sm resize-none border-primary/30 focus-visible:ring-primary/30"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onCancelEdit}>
              취소
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={onSaveEdit} disabled={!editText.trim()}>
              저장
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed mb-2">
            {memo.memo_text}
          </p>

          {/* AI summary */}
          {memo.routing_summary && (
            <div className="bg-muted/50 p-2.5 rounded-lg text-xs text-muted-foreground leading-relaxed mb-3 border border-border/30">
              {memo.routing_summary}
            </div>
          )}

          {/* Tags */}
          {memo.tags && memo.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {memo.tags.map((tag, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {/* Footer: timestamp + action */}
      {!isEditing && (
        <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-border/30">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{formatMemoTime(memo.created_at)}</span>
            {wasEdited && (
              <>
                <span>·</span>
                <span className="text-primary/60">수정됨 {formatMemoTime(memo.updated_at!)}</span>
              </>
            )}
          </div>
          {!isConverted && (memo.routing_type === "new_deal" || memo.routing_type === "buyer_condition") && (
            <Button
              size="sm"
              variant="secondary"
              className="text-[11px] h-7 px-2.5 hover:bg-primary/10 hover:text-primary transition-all"
              onClick={onTransfer}
            >
              {memo.routing_type === "new_deal" ? "딜카드 만들기" : "의향서 만들기"}
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
