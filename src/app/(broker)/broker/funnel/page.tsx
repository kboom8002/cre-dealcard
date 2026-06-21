"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Filter, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

interface FunnelData {
  stage: string;
  count: number;
  label: string;
  color: string;
}

export default function BehaviorFunnelPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [funnelData, setFunnelData] = useState<FunnelData[]>([]);
  const [period, setPeriod] = useState("30"); // 30 days default

  useEffect(() => {
    fetchFunnelData();
  }, [period]);

  const fetchFunnelData = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const userId = session.user.id;

      // 기간 필터 계산
      let dateFilter: string | null = null;
      if (period !== "all") {
        const d = new Date();
        d.setDate(d.getDate() - parseInt(period));
        dateFilter = d.toISOString();
      }

      // 1. Total Buildings (Created Deal Cards)
      let buildingsQuery = supabase
        .from("building_ssot_lite")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId);
      if (dateFilter) buildingsQuery = buildingsQuery.gte("created_at", dateFilter);
      const { count: buildingsCount } = await buildingsQuery;

      // 2. Sent Deal Cards (Shared via kakao or copy link)
      let shareQuery = supabase
        .from("activity_events")
        .select("id", { count: "exact", head: true })
        .eq("actor_id", userId)
        .in("event_type", ["kakao_share", "copy_link", "im_shared"]);
      if (dateFilter) shareQuery = shareQuery.gte("created_at", dateFilter);
      const { count: shareEventsCount } = await shareQuery;

      // 3. Viewed Deal Cards
      let viewQuery = supabase
        .from("activity_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "im_lite_view")
        .eq("metadata->>broker_id", userId);
      if (dateFilter) viewQuery = viewQuery.gte("created_at", dateFilter);
      const { count: viewEventsCount } = await viewQuery;

      // 4. Gate Requests (Gate 통과)
      const { data: myBuildings } = await supabase
        .from("building_ssot_lite")
        .select("id")
        .eq("owner_id", userId);
      const myBuildingIds = (myBuildings ?? []).map((b: any) => b.id);
      
      let gateQ = supabase
        .from("gate_requests")
        .select("id", { count: "exact", head: true })
        .in("building_id", myBuildingIds.length > 0 ? myBuildingIds : ["00000000-0000-0000-0000-000000000000"]);
      if (dateFilter) gateQ = gateQ.gte("created_at", dateFilter);
      const { count: gateCount } = await gateQ;

      // 5. Booking (임장 예약)
      const { data: slots } = await supabase
        .from("availability_slots")
        .select("id")
        .eq("owner_id", userId);
      const slotIds = (slots ?? []).map(s => s.id);

      let bookingQuery = supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .in("slot_id", slotIds.length > 0 ? slotIds : ["00000000-0000-0000-0000-000000000000"]);
      if (dateFilter) bookingQuery = bookingQuery.gte("created_at", dateFilter);
      const { count: bookingCount } = await bookingQuery;

      // 6. Meetings / Contracts
      let meetingQuery = supabase
        .from("deal_pipeline_states")
        .select("id", { count: "exact", head: true })
        .in("current_stage", ["buyer_meeting", "loi", "contract", "closed"])
        .eq("broker_id", userId);
      if (dateFilter) meetingQuery = meetingQuery.gte("updated_at", dateFilter);
      const { count: meetingCount } = await meetingQuery;

      const data: FunnelData[] = [
        { stage: "created", label: "생성된 딜카드", count: buildingsCount ?? 0, color: "bg-blue-500" },
        { stage: "sent", label: "발송된 딜카드", count: shareEventsCount ?? 0, color: "bg-indigo-500" },
        { stage: "viewed", label: "고객 열람", count: viewEventsCount ?? 0, color: "bg-violet-500" },
        { stage: "gate", label: "Gate 통과 (관심)", count: gateCount ?? 0, color: "bg-purple-500" },
        { stage: "booking", label: "임장 예약", count: bookingCount ?? 0, color: "bg-amber-500" },
        { stage: "meeting", label: "미팅/계약 성사", count: meetingCount ?? 0, color: "bg-fuchsia-500" },
      ];

      // To make the funnel shape realistic if data is missing, we ensure descending order loosely
      // This is for demonstration visualization if numbers don't strictly decrease
      let maxVal = Math.max(...data.map(d => d.count), 1);
      
      setFunnelData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const maxCount = Math.max(...funnelData.map(d => d.count), 1);

  return (
    <main className="flex flex-col min-h-screen px-4 py-8 pb-24 bg-background">
      <div className="w-full max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => router.push("/broker")}
              className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-2xl font-bold">행동 퍼널 분석</h1>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Download className="w-3.5 h-3.5" />
            <span>리포트</span>
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {["7", "30", "90", "all"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
                period === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {p === "all" ? "전체" : `${p}일`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4 py-10">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" style={{ width: `${100 - i * 15}%`, margin: "0 auto" }} />
            ))}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-8">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-bold text-foreground">고객 전환 퍼널</h2>
              <p className="text-xs text-muted-foreground">딜카드 생성부터 최종 계약까지의 전환율</p>
            </div>

            <div className="space-y-1 relative flex flex-col items-center">
              {funnelData.map((stage, index) => {
                const widthPercent = Math.max(20, (stage.count / maxCount) * 100);
                const prevCount = index > 0 ? Math.max(funnelData[index - 1].count, 1) : 1;
                const conversionRate = index > 0 ? Math.round((stage.count / prevCount) * 100) : 100;

                return (
                  <div key={stage.stage} className="w-full flex flex-col items-center group">
                    {/* Arrow / Conversion Rate */}
                    {index > 0 && (
                      <div className="flex flex-col items-center justify-center h-8 relative z-10 -my-2 opacity-80 group-hover:opacity-100 transition-opacity">
                        <div className="bg-background border px-2 py-0.5 rounded-full text-[10px] font-bold text-muted-foreground shadow-sm">
                          {conversionRate}% 전환
                        </div>
                        <div className="w-px h-4 bg-border" />
                      </div>
                    )}
                    
                    {/* Funnel Bar */}
                    <div 
                      className={`relative flex items-center justify-center h-14 rounded-xl shadow-inner transition-all duration-700 ease-out ${stage.color}`}
                      style={{ width: `${widthPercent}%`, minWidth: '120px' }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-xl" />
                      <div className="relative z-10 flex flex-col items-center justify-center text-white text-shadow-sm">
                        <span className="text-[10px] font-medium opacity-90 tracking-wide">{stage.label}</span>
                        <span className="text-lg font-bold">{stage.count.toLocaleString()}<span className="text-xs font-normal opacity-80 ml-0.5">건</span></span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Actionable Insights */}
            <div className="mt-8 p-4 bg-primary/5 border border-primary/10 rounded-xl">
              <h3 className="text-sm font-bold text-primary mb-2 flex items-center gap-1.5">
                <span>💡</span> AI 인사이트
              </h3>
              <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                {funnelData[1].count > 0 && funnelData[2].count / Math.max(funnelData[1].count, 1) < 0.3 && (
                  <li>발송 대비 열람률이 낮습니다. 매력적인 제목이나 블라인드 티저를 보강해보세요.</li>
                )}
                {funnelData[2].count > 0 && funnelData[3].count / Math.max(funnelData[2].count, 1) < 0.1 && (
                  <li>열람은 많으나 Gate 통과(관심)가 적습니다. 가격 경쟁력이나 상세 정보를 재점검할 필요가 있습니다.</li>
                )}
                <li>퍼널 데이터를 기반으로 가장 반응이 좋은 고객군에게 유사 매물을 추천할 수 있습니다.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
