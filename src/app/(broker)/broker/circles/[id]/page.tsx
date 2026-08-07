"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { ArrowLeft, Users, Package, Target, Plus, Share2, ShieldCheck, CheckCircle2, Lock, Building2, User, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CircleMatchCard } from "@/components/circle/CircleMatchCard";
import { ShareToCircleSheet } from "@/components/circle/ShareToCircleSheet";
import { InviteMemberSheet } from "@/components/circle/InviteMemberSheet";
import { ApprovalDialog } from "@/components/circle/ApprovalDialog";
import { FeeSplitSheet } from "@/components/circle/FeeSplitSheet";
import { createClient } from "@/lib/supabase/client";

export default function BrokerCircleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState<"members" | "assets" | "matches">("matches");
  const [circleDetail, setCircleDetail] = useState<any>(null);
  const [sharedAssets, setSharedAssets] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Modals
  const [showInviteSheet, setShowInviteSheet] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [approveMatchId, setApproveMatchId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [showFeeSplitMatchId, setShowFeeSplitMatchId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUserId(session.user.id);
      }
      await loadAllData();
    }
    init();
  }, [id]);

  async function loadAllData() {
    setLoading(true);
    try {
      const [resDetail, resAssets, resMatches] = await Promise.all([
        fetch(`/api/broker/circles/${id}`),
        fetch(`/api/broker/circles/${id}/share`),
        fetch(`/api/broker/circles/${id}/match`),
      ]);

      if (resDetail.ok) {
        const json = await resDetail.json();
        setCircleDetail(json);
      }
      if (resAssets.ok) {
        const json = await resAssets.json();
        setSharedAssets(json.shared_assets || []);
      }
      if (resMatches.ok) {
        const json = await resMatches.json();
        setMatches(json.matches || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleApproveConfirm(matchId: string) {
    setApproving(true);
    try {
      const res = await fetch(`/api/broker/circles/${id}/match/${matchId}/approve`, {
        method: "POST",
      });
      if (res.ok) {
        setApproveMatchId(null);
        await loadAllData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setApproving(false);
    }
  }

  function handleCopyInviteCode() {
    if (!circleDetail?.circle?.invite_code) return;
    navigator.clipboard.writeText(circleDetail.circle.invite_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  if (loading) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
        <p className="text-[13px] text-slate-400">서클 데이터를 불러오는 중입니다...</p>
      </main>
    );
  }

  const circle = circleDetail?.circle;
  const members = circleDetail?.members || [];

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-6 pb-28">
      <div className="w-full max-w-md mx-auto space-y-5">
        {/* Top Header */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            <Link href="/broker/circles" className="p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-slate-200">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{circle?.avatar_emoji || "🤝"}</span>
              <div>
                <h1 className="text-[20px] font-extrabold text-slate-100 leading-tight">
                  {circle?.name || "서클"}
                </h1>
                <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                  초대코드: <strong className="text-amber-300 font-bold">{circle?.invite_code}</strong>
                  <button onClick={handleCopyInviteCode} className="ml-1 text-slate-500 hover:text-slate-300">
                    {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </p>
              </div>
            </div>
          </div>

          <Button
            size="sm"
            onClick={() => setShowInviteSheet(true)}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[13px] gap-1 shadow"
          >
            <Plus className="w-3.5 h-3.5" /> 초대
          </Button>
        </div>

        {/* 3 Tab Navigation */}
        <div className="flex border-b border-slate-800 text-[15px] font-bold">
          <button
            onClick={() => setActiveTab("matches")}
            className={`flex-1 py-3 text-center border-b-2 transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "matches"
                ? "border-amber-400 text-amber-300 font-extrabold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Target className="w-4 h-4" /> 팀 매칭 ({matches.length})
          </button>
          <button
            onClick={() => setActiveTab("assets")}
            className={`flex-1 py-3 text-center border-b-2 transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "assets"
                ? "border-amber-400 text-amber-300 font-extrabold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Package className="w-4 h-4" /> 공유자산 ({sharedAssets.length})
          </button>
          <button
            onClick={() => setActiveTab("members")}
            className={`flex-1 py-3 text-center border-b-2 transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "members"
                ? "border-amber-400 text-amber-300 font-extrabold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="w-4 h-4" /> 멤버 ({members.length})
          </button>
        </div>

        {/* TAB 1: MATCHES */}
        {activeTab === "matches" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-slate-400 font-medium">
                서클 내 공유된 물건 × 매수의향 크로스 매칭
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadAllData()}
                className="border-slate-700 text-amber-300 text-[12px] h-8"
              >
                🔄 새로고침
              </Button>
            </div>

            {matches.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border border-dashed border-slate-800 bg-[#131b2e]/40 space-y-3">
                <p className="text-[15px] font-bold text-slate-300">아직 매칭된 결과가 없습니다</p>
                <p className="text-[13px] text-slate-400 max-w-xs mx-auto">
                  물건과 매수의향을 서클에 공유하면 AI가 24시간 자율적으로 매칭을 탐색합니다.
                </p>
                <Button
                  onClick={() => setShowShareSheet(true)}
                  className="bg-amber-500 text-slate-950 font-bold text-[13px] mt-2"
                >
                  + 내 자산 공유하기
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {matches.map((m) => (
                  <CircleMatchCard
                    key={m.id}
                    match={m}
                    currentBrokerId={currentUserId}
                    onApprove={(matchId) => setApproveMatchId(matchId)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SHARED ASSETS */}
        {activeTab === "assets" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-slate-400 font-medium">
                서클에 공유된 매물 및 매수의향 ({sharedAssets.length}건)
              </p>
              <Button
                size="sm"
                onClick={() => setShowShareSheet(true)}
                className="bg-amber-500 text-slate-950 font-bold text-[13px] h-8"
              >
                + 내 자산 공유
              </Button>
            </div>

            {sharedAssets.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border border-dashed border-slate-800 bg-[#131b2e]/40 space-y-3">
                <p className="text-[15px] font-bold text-slate-300">공유된 자산이 없습니다</p>
                <Button onClick={() => setShowShareSheet(true)} className="bg-amber-500 text-slate-950 font-bold text-[13px]">
                  + 내 자산 공유하기
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {sharedAssets.map((item) => {
                  const isMine = item.broker_id === currentUserId;
                  const isBuilding = item.asset_type === "building";
                  return (
                    <div
                      key={item.id}
                      className="bg-[#131b2e] border border-slate-800 rounded-2xl p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="flex items-center gap-1.5 font-bold text-slate-200">
                          {isBuilding ? <Building2 className="w-4 h-4 text-amber-400" /> : <User className="w-4 h-4 text-blue-400" />}
                          {isBuilding ? "매매물건" : "매수의향"}
                        </span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                          isMine ? "bg-amber-500/20 text-amber-300" : "bg-slate-800 text-slate-400"
                        }`}>
                          {isMine ? "내 공유" : `담당: ${item.broker_profile?.display_name || "동료"}`}
                        </span>
                      </div>

                      <div className="bg-[#0f172a] p-3 rounded-xl border border-slate-800/80 text-[13px]">
                        {isBuilding ? (
                          <p className="font-extrabold text-slate-100 text-[15px]">
                            {item.asset_detail?.area_signal || "지역"} · {item.asset_detail?.asset_type || "자산"} ({item.asset_detail?.price_band || "가격대"})
                          </p>
                        ) : (
                          <p className="font-extrabold text-slate-100 text-[15px]">
                            매수의향: {item.asset_detail?.budget_display || "예산"} ({item.asset_detail?.preferred_regions?.join(", ") || "지역선택"})
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <span>공유수준: {item.visibility === "signal_only" ? "🔒 시그널만 (기본)" : item.visibility === "basic_info" ? "🟢 기본정보 공개" : "🎉 신원 전체공개"}</span>
                        <span>{new Date(item.shared_at).toLocaleDateString("ko-KR")}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: MEMBERS */}
        {activeTab === "members" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-slate-400 font-medium">
                서클 멤버 ({members.length}명 / 최대 {circle?.max_members || 10}명)
              </p>
              <Button
                size="sm"
                onClick={() => setShowInviteSheet(true)}
                className="bg-amber-500 text-slate-950 font-bold text-[13px] h-8"
              >
                + 멤버 초대
              </Button>
            </div>

            <div className="space-y-2.5">
              {members.map((m: any) => (
                <div
                  key={m.id}
                  className="bg-[#131b2e] border border-slate-800 p-4 rounded-2xl flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200">
                      {m.profile?.display_name?.[0] || "중"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-[15px] font-bold text-slate-100">
                          {m.profile?.display_name || "중개사"}
                        </p>
                        {m.role === "owner" && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            개설자
                          </span>
                        )}
                        {m.status === "pending" && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            초대 대기중
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] text-slate-400 mt-0.5">
                        {m.profile?.company || "독립 중개사"} · {m.profile?.phone || "연락처 비공개"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MODALS & SHEETS */}
      {showShareSheet && (
        <ShareToCircleSheet
          assetType="building"
          assetId=""
          onClose={() => setShowShareSheet(false)}
          onSuccess={() => loadAllData()}
        />
      )}

      {showInviteSheet && (
        <InviteMemberSheet
          circleId={id}
          circleName={circle?.name || "서클"}
          onClose={() => setShowInviteSheet(false)}
          onSuccess={() => loadAllData()}
        />
      )}

      {approveMatchId && (
        <ApprovalDialog
          matchId={approveMatchId}
          isOpen={Boolean(approveMatchId)}
          onClose={() => setApproveMatchId(null)}
          onConfirm={handleApproveConfirm}
          isLoading={approving}
        />
      )}
    </main>
  );
}
