"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Users, ArrowRight, ShieldCheck, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CircleCard } from "@/components/circle/CircleCard";

export default function BrokerCirclesPage() {
  const [circles, setCircles] = useState<any[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetchCircles();
  }, []);

  async function fetchCircles() {
    try {
      const res = await fetch("/api/broker/circles");
      if (res.ok) {
        const json = await res.json();
        setCircles(json.circles || []);
        setPendingInvitations(json.pending_invitations || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinByCode(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;

    setJoining(true);
    setJoinError(null);

    try {
      const res = await fetch("/api/broker/circles/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode.trim() }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "가입에 실패했습니다.");

      setJoinCode("");
      fetchCircles();
    } catch (err: any) {
      setJoinError(err.message);
    } finally {
      setJoining(false);
    }
  }

  async function handleAcceptDecline(circleId: string, action: "accept" | "decline") {
    try {
      await fetch("/api/broker/circles/join", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ circleId, action }),
      });
      fetchCircles();
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-28">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[26px] font-extrabold text-slate-100 tracking-tight">
                내 서클
              </h1>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
                팀 AI 매칭
              </span>
            </div>
            <p className="text-[15px] font-medium text-slate-400 mt-1">
              신뢰하는 동료와 자산을 공유하고 AI 매칭을 실행합니다.
            </p>
          </div>

          <Link href="/broker/circles/new">
            <Button size="sm" className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold gap-1 shadow-md">
              <Plus className="w-4 h-4" /> 개설
            </Button>
          </Link>
        </div>

        {/* Pending Invitations */}
        {pendingInvitations.length > 0 && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
            <h3 className="text-[15px] font-bold text-amber-300 flex items-center gap-2">
              <Mail className="w-4 h-4" /> 초대 대기 중 ({pendingInvitations.length}건)
            </h3>
            <div className="space-y-2">
              {pendingInvitations.map((inv) => (
                <div
                  key={inv.membership_id}
                  className="bg-[#131b2e] border border-amber-500/30 p-3.5 rounded-xl flex items-center justify-between"
                >
                  <div>
                    <p className="text-[15px] font-bold text-slate-100">{inv.circle.name}</p>
                    <p className="text-[13px] text-slate-400">
                      초대자: {inv.inviter?.display_name || "동료"} ({inv.inviter?.company || "소속"})
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleAcceptDecline(inv.circle.id, "accept")}
                      className="bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 text-[13px] h-8"
                    >
                      수락
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAcceptDecline(inv.circle.id, "decline")}
                      className="border-slate-700 text-slate-400 hover:bg-slate-800 text-[13px] h-8"
                    >
                      거절
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Join by Code Form */}
        <form onSubmit={handleJoinByCode} className="rounded-2xl border border-slate-800 bg-[#131b2e] p-4 space-y-2">
          <label className="text-[13px] font-bold text-slate-300 flex items-center gap-1.5">
            🔑 초대 코드로 바로 가입
          </label>
          <div className="flex gap-2">
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="예: a3f2k1"
              className="bg-[#0f172a] border-slate-700 text-slate-100 placeholder:text-slate-500 h-10 text-[15px] uppercase font-mono"
            />
            <Button
              type="submit"
              disabled={joining || !joinCode.trim()}
              className="bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold h-10 px-4 shrink-0"
            >
              {joining ? "가입 중..." : "가입하기"}
            </Button>
          </div>
          {joinError && <p className="text-[13px] text-rose-400 mt-1">{joinError}</p>}
        </form>

        {/* Circles List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-slate-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" /> 참여 중인 서클 ({circles.length})
            </h2>
          </div>

          {loading ? (
            <p className="text-[13px] text-slate-500 text-center py-8">서클 목록을 불러오고 있습니다...</p>
          ) : circles.length === 0 ? (
            <div className="text-center py-12 rounded-2xl border border-dashed border-slate-800 bg-[#131b2e]/50 space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-3xl">
                🤝
              </div>
              <div>
                <p className="text-[17px] font-bold text-slate-200">아직 가입된 서클이 없습니다</p>
                <p className="text-[13px] text-slate-400 mt-1 max-w-xs mx-auto">
                  신뢰하는 중개사 동료들과 서클을 개설하고 매물·매수의향을 안전하게 교환하세요.
                </p>
              </div>
              <Link href="/broker/circles/new">
                <Button className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold gap-1 text-[15px]">
                  <Plus className="w-4 h-4" /> 첫 서클 만들기
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {circles.map((circle) => (
                <CircleCard key={circle.id} circle={circle} />
              ))}
            </div>
          )}
        </div>

        {/* Micro Notice */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-3.5 space-y-1 text-[12px] text-slate-400">
          <p className="font-bold text-slate-300 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> 보안 원칙
          </p>
          <p>
            서클에 공유된 자산은 양측 중개사가 모두 승인하기 전까지 매수자 및 소유자의 정확한 신원이 비공개 처리됩니다.
          </p>
        </div>
      </div>
    </main>
  );
}
