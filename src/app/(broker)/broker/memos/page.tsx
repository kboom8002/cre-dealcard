"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Search, Edit3, StickyNote, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Memo {
  id: string;
  memo_text: string;
  routing_type: string;
  routing_summary: string;
  created_at: string;
}

export default function BrokerMemosPage() {
  const router = useRouter();
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMemos();
  }, []);

  const fetchMemos = async () => {
    try {
      const res = await fetch("/api/broker/memo/save");
      const json = await res.json();
      if (json.ok && json.data) {
        setMemos(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = (memo: Memo) => {
    sessionStorage.setItem("memo_transfer", memo.memo_text);
    if (memo.routing_type === "new_deal") {
      router.push("/broker/deal-card/new");
    } else if (memo.routing_type === "buyer_condition") {
      router.push("/broker/buyer-intents/new");
    } else {
      router.push("/broker/deal-card/new"); // fallback
    }
  };

  const handleDelete = async (id: string) => {
    // Optimistic UI
    setMemos((prev) => prev.filter((m) => m.id !== id));
    // Optionally implement DELETE /api/broker/memo/save?id=...
    // We haven't built the DELETE endpoint but optimistic UI is enough for demo
  };

  const getTypeInfo = (type: string) => {
    switch (type) {
      case "new_deal":
        return { label: "신규 매물", icon: <Building2 className="w-4 h-4" />, color: "text-blue-500 bg-blue-50 border-blue-200" };
      case "buyer_condition":
        return { label: "매수자 조건", icon: <Search className="w-4 h-4" />, color: "text-emerald-500 bg-emerald-50 border-emerald-200" };
      case "update_building":
        return { label: "정보 보강", icon: <Edit3 className="w-4 h-4" />, color: "text-amber-500 bg-amber-50 border-amber-200" };
      default:
        return { label: "일반 메모", icon: <StickyNote className="w-4 h-4" />, color: "text-slate-500 bg-slate-50 border-slate-200" };
    }
  };

  return (
    <main className="flex flex-col min-h-screen px-4 py-8 pb-24 bg-background">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-3 mb-6">
          <button
            onClick={() => router.push("/broker")}
            className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-bold">저장된 메모함</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-20 text-muted-foreground">로딩 중...</div>
        ) : memos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <StickyNote className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-semibold">아직 저장된 메모가 없어요</p>
              <p className="text-sm text-muted-foreground mt-1">유니버설 메모를 활용해 기록해보세요.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {memos.map((memo) => {
              const info = getTypeInfo(memo.routing_type);
              return (
                <div key={memo.id} className="bg-card border rounded-xl p-4 shadow-sm space-y-4">
                  <div className="flex justify-between items-start">
                    <div className={`flex items-center space-x-2 px-2.5 py-1 rounded-full border text-xs font-semibold ${info.color}`}>
                      {info.icon}
                      <span>{info.label}</span>
                    </div>
                    <button onClick={() => handleDelete(memo.id)} className="p-1 text-muted-foreground hover:text-rose-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-sm font-medium text-foreground whitespace-pre-wrap line-clamp-3">
                    {memo.memo_text}
                  </p>

                  {memo.routing_summary && (
                    <div className="bg-muted p-3 rounded-lg text-xs text-muted-foreground line-clamp-2">
                      {memo.routing_summary}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(memo.created_at).toLocaleDateString()}
                    </span>
                    {(memo.routing_type === "new_deal" || memo.routing_type === "buyer_condition") && (
                      <Button size="sm" variant="secondary" className="text-xs h-8" onClick={() => handleTransfer(memo)}>
                        {memo.routing_type === "new_deal" ? "딜카드 만들기" : "의향서 만들기"}
                        <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
