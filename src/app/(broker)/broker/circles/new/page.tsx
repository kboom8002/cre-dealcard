"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const EMOJI_OPTIONS = ["🤝", "🏢", "💎", "🏗️", "📊", "🎯", "⚡", "🔗"];

export default function BrokerCircleNewPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarEmoji, setAvatarEmoji] = useState("🤝");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/broker/circles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          avatarEmoji,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "서클 개설에 실패했습니다.");

      router.push(`/broker/circles/${json.circle.id}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8">
      <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 pt-2">
          <Link href="/broker/circles" className="p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-slate-200">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-[22px] font-extrabold text-slate-100">새 서클 개설</h1>
            <p className="text-[13px] text-slate-400">신뢰하는 동료들과 전용 팀 공간을 만듭니다.</p>
          </div>
        </div>

        {/* Emoji Selector */}
        <div className="space-y-2">
          <label className="text-[13px] font-bold text-slate-300">서클 이모지 아이콘</label>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {EMOJI_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setAvatarEmoji(emoji)}
                className={`w-12 h-12 rounded-2xl text-2xl flex items-center justify-center shrink-0 border transition-all ${
                  avatarEmoji === emoji
                    ? "bg-amber-500/20 border-amber-500 text-amber-300 scale-105"
                    : "bg-[#131b2e] border-slate-800 text-slate-300 hover:border-slate-700"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Form Inputs */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[13px] font-bold text-slate-300">
              서클 이름 <span className="text-amber-400">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 강남 빌딩 투자 서클, 마포 사옥 팀"
              className="bg-[#131b2e] border-slate-800 text-slate-100 placeholder:text-slate-500 h-12 text-[15px]"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-bold text-slate-300">서클 설명 (선택)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="예: 강남권 50~100억대 근생/오피스 물건 및 사옥 수요 공동 매칭 팀"
              className="bg-[#131b2e] border-slate-800 text-slate-100 placeholder:text-slate-500 min-h-[90px] text-[15px]"
            />
          </div>
        </div>

        {/* Notice */}
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-1.5 text-[13px]">
          <p className="font-bold text-amber-300 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" /> 서클 개설 안내
          </p>
          <ul className="text-slate-300 text-[12px] space-y-1 pl-4 list-disc">
            <li>서클을 개설하면 자동으로 개설자(Owner) 권한이 부여됩니다.</li>
            <li>개설 후 카카오톡 초대 링크 또는 6자리 코드로 멤버를 모실 수 있습니다.</li>
            <li>공유된 물건 및 매수의향 간 자동 AI 매칭이 24시간 실행됩니다.</li>
          </ul>
        </div>

        {error && <p className="text-[13px] text-rose-400">{error}</p>}

        <Button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[15px] rounded-xl shadow-lg"
        >
          {loading ? "서클 개설 중..." : "🤝 서클 만들기 완료"}
        </Button>
      </form>
    </main>
  );
}
