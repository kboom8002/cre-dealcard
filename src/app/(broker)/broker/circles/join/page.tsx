"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Users, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeParam = searchParams.get("code") || "";

  const [code, setCode] = useState(codeParam);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCircleId, setSuccessCircleId] = useState<string | null>(null);

  useEffect(() => {
    if (codeParam) {
      setCode(codeParam);
    }
  }, [codeParam]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/broker/circles/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });

      const json = await res.json();
      if (!res.ok) {
        if (res.status === 409 && json.circleId) {
          router.push(`/broker/circles/${json.circleId}`);
          return;
        }
        throw new Error(json.error || "가입에 실패했습니다.");
      }

      setSuccessCircleId(json.circleId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (successCircleId) {
    return (
      <div className="w-full max-w-md mx-auto text-center space-y-6 bg-[#131b2e] border border-amber-500/40 rounded-3xl p-8 shadow-2xl">
        <div className="w-16 h-16 bg-amber-500/20 text-amber-300 rounded-full flex items-center justify-center mx-auto border border-amber-500/30 text-3xl">
          🎉
        </div>
        <h1 className="text-[24px] font-extrabold text-slate-100">서클 가입 완료!</h1>
        <p className="text-[15px] text-slate-300 leading-relaxed">
          동료 중개사 서클에 성공적으로 가입했습니다.<br />
          내 자산을 공유하고 AI 팀 매칭을 바로 확인하세요.
        </p>
        <Button
          onClick={() => router.push(`/broker/circles/${successCircleId}`)}
          className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[15px] rounded-xl shadow-lg"
        >
          서클 대시보드로 이동 <ArrowRight className="w-5 h-5 ml-1" />
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleJoin} className="w-full max-w-md mx-auto space-y-6">
      <div className="text-center space-y-2 pt-4">
        <div className="w-16 h-16 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto text-3xl mb-4">
          🤝
        </div>
        <h1 className="text-[26px] font-extrabold text-slate-100 tracking-tight">
          서클 초대 코드 가입
        </h1>
        <p className="text-[15px] text-slate-400 leading-relaxed">
          전달받으신 6자리 초대 코드로<br />
          신뢰하는 동료 서클에 가입하세요.
        </p>
      </div>

      <div className="space-y-3 bg-[#131b2e] border border-slate-800 p-6 rounded-3xl shadow-xl">
        <label className="text-[13px] font-bold text-slate-300">초대 코드 6자리</label>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="예: A3F2K1"
          className="bg-[#0f172a] border-slate-700 text-slate-100 placeholder:text-slate-500 h-14 text-[22px] font-mono tracking-widest text-center uppercase font-bold"
          maxLength={6}
          required
        />
        {error && <p className="text-[13px] text-rose-400 text-center">{error}</p>}

        <Button
          type="submit"
          disabled={loading || code.trim().length < 4}
          className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[15px] rounded-xl shadow-lg"
        >
          {loading ? "가입 처리 중..." : "🤝 서클 가입하기"}
        </Button>
      </div>

      <p className="text-[13px] text-slate-500 text-center">
        이미 서클 멤버이신가요?{" "}
        <Link href="/broker/circles" className="text-amber-300 font-bold hover:underline">
          내 서클 목록 보기
        </Link>
      </p>
    </form>
  );
}

export default function BrokerCircleJoinPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
      <Suspense fallback={<p className="text-slate-400 text-sm">로딩 중...</p>}>
        <JoinContent />
      </Suspense>
    </main>
  );
}
