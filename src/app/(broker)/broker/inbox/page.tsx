"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, Check, X, Phone, UserPlus, ExternalLink, RefreshCw } from "lucide-react";
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";

type InboxFilter = "all" | "requests" | "views";

interface InboxItem {
  id: string;
  type: "gate_request" | "view";
  // gate_request fields
  status?: string;
  building_id?: string;
  building_label?: string;
  requester_name?: string;
  requester_phone?: string | null;
  requester_email?: string | null;
  requested_level?: string;
  reason?: string;
  is_unread?: boolean;
  // view fields
  event_type?: string;
  icon?: string;
  label?: string;
  sub_label?: string;
  viewer_info?: string;
  // common
  created_at: string;
}

function timeAgo(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "방금";
  if (diffMins < 60) return `${diffMins}분 전`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function InboxPage() {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/broker/inbox?filter=${filter}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  async function handleGateAction(requestId: string, action: "approved" | "rejected") {
    setActionLoading(requestId);
    try {
      const res = await fetch(`/api/gate-requests/${requestId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: action }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === requestId
              ? { ...item, status: action, is_unread: false }
              : item
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  }

  const requestCount = items.filter((i) => i.type === "gate_request" && i.status === "submitted").length;

  const tabs: { key: InboxFilter; label: string; badge?: number }[] = [
    { key: "all", label: "전체" },
    { key: "requests", label: "상세정보 요청", badge: requestCount },
    { key: "views", label: "열람/반응" },
  ];

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-6 pb-28">
      <div className="w-full max-w-md mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/broker"
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted/30 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Link>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold text-foreground">소통 관리함</h1>
              {unreadCount > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {unreadCount}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={fetchInbox}
            className="p-2 rounded-full hover:bg-muted/30 transition-colors text-muted-foreground"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/20 rounded-xl p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 ${
                filter === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.badge && tab.badge > 0 ? (
                <span className="bg-rose-500 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 min-w-[16px] text-center">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">불러오는 중...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Bell className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">새로운 알림이 없습니다</p>
            <p className="text-xs text-muted-foreground/60">딜카드, IM, 매거진을 공유하면 열람 기록이 여기에 표시됩니다.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border bg-card p-4 transition-all ${
                  item.is_unread
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:border-border/60"
                }`}
              >
                {item.type === "gate_request" ? (
                  // ── Gate Request Card ──
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {item.is_unread && (
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 animate-pulse" />
                        )}
                        <div>
                          <p className="text-sm font-bold text-foreground">
                            📋 상세 자료 요청
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            &quot;{item.building_label}&quot; — {item.requested_level} 단계
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {timeAgo(item.created_at)}
                      </span>
                    </div>

                    {/* Requester Info */}
                    <div className="bg-muted/20 rounded-lg p-2.5 space-y-1">
                      <p className="text-xs font-medium text-foreground">
                        요청자: {item.requester_name}
                      </p>
                      {item.requester_phone && (
                        <p className="text-[11px] text-muted-foreground">
                          📞 {item.requester_phone}
                        </p>
                      )}
                      {item.requester_email && (
                        <p className="text-[11px] text-muted-foreground">
                          ✉️ {item.requester_email}
                        </p>
                      )}
                      {item.reason && (
                        <p className="text-[11px] text-muted-foreground italic">
                          &quot;{item.reason}&quot;
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    {item.status === "submitted" ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleGateAction(item.id, "approved")}
                          disabled={actionLoading === item.id}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 text-white rounded-lg py-2 text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          승인
                        </button>
                        <button
                          onClick={() => handleGateAction(item.id, "rejected")}
                          disabled={actionLoading === item.id}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-secondary text-secondary-foreground rounded-lg py-2 text-xs font-semibold hover:bg-secondary/80 transition-colors disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          거절
                        </button>
                        {item.requester_phone && (
                          <a
                            href={`tel:${item.requester_phone}`}
                            className="flex items-center justify-center w-9 h-9 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                          >
                            <Phone className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                            item.status === "approved"
                              ? "bg-emerald-500/10 text-emerald-500"
                              : item.status === "rejected"
                              ? "bg-rose-500/10 text-rose-500"
                              : "bg-amber-500/10 text-amber-500"
                          }`}
                        >
                          {item.status === "approved"
                            ? "✅ 승인 완료"
                            : item.status === "rejected"
                            ? "❌ 거절됨"
                            : `⏳ ${item.status}`}
                        </span>
                        {item.building_id && (
                          <Link
                            href={`/broker/deal-card/${item.building_id}`}
                            className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                          >
                            딜카드 보기 <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  // ── View Event Card ──
                  <Link
                    href={item.building_id ? `/broker/deal-card/${item.building_id}` : "/broker"}
                    className="block space-y-1.5"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base shrink-0">{item.icon}</span>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {item.label}
                          </p>
                          {item.sub_label && (
                            <p className="text-xs text-muted-foreground">
                              {item.sub_label}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {timeAgo(item.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        👤 {item.viewer_info}
                      </span>
                    </div>
                    {item.building_id && (
                      <div className="flex gap-2 mt-1">
                        <span className="text-[10px] text-primary flex items-center gap-0.5">
                          딜카드 보기 <ExternalLink className="w-3 h-3" />
                        </span>
                        <button
                          className="text-[10px] text-emerald-500 flex items-center gap-0.5"
                          onClick={(e) => {
                            e.preventDefault();
                            // TODO: Navigate to buyer registration with pre-filled viewer info
                          }}
                        >
                          <UserPlus className="w-3 h-3" /> 리드 등록
                        </button>
                      </div>
                    )}
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <BrokerBottomNav />
    </main>
  );
}
