"use client";

import React, { useState } from "react";
import { X, UserPlus, Share2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface InviteMemberSheetProps {
  circleId: string;
  circleName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function InviteMemberSheet({
  circleId,
  circleName,
  onClose,
  onSuccess,
}: InviteMemberSheetProps) {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleDirectInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/broker/circles/${circleId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "초대에 실패했습니다.");
      }

      setSuccess(true);
      setIdentifier("");
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateKakaoLink() {
    setLoading(true);
    try {
      const res = await fetch("/api/broker/circles/invite-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ circleId }),
      });

      const json = await res.json();
      if (res.ok && json.url) {
        setInviteUrl(json.url);
      }
    } catch (err) {
      console.error("Failed to generate link:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleCopyUrl() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end justify-center p-0 md:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#131b2e] border border-slate-800 rounded-t-3xl md:rounded-3xl p-6 space-y-5 shadow-2xl animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">👥</span>
            <div>
              <h2 className="text-[18px] font-extrabold text-slate-100">동료 중개사 초대</h2>
              <p className="text-[13px] text-slate-400">"{circleName}" 서클에 함께할 중개사를 모십니다.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Method 1: Phone or ID Direct Invite */}
        <form onSubmit={handleDirectInvite} className="space-y-3">
          <label className="text-[13px] font-bold text-slate-300 flex items-center gap-1.5">
            <UserPlus className="w-4 h-4 text-amber-400" /> 전화번호로 직접 초대
          </label>
          <div className="flex gap-2">
            <Input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="010-1234-5678"
              className="bg-[#0f172a] border-slate-700 text-slate-100 placeholder:text-slate-500 h-11 text-[15px]"
            />
            <Button
              type="submit"
              disabled={loading || !identifier.trim()}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 h-11 shrink-0"
            >
              초대 전송
            </Button>
          </div>
          {error && <p className="text-[13px] text-rose-400">{error}</p>}
          {success && <p className="text-[13px] text-emerald-400 font-bold">✅ 초대를 전송했습니다!</p>}
        </form>

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <div className="relative flex justify-center text-[11px] uppercase">
            <span className="bg-[#131b2e] px-2 text-slate-500 font-bold">또는</span>
          </div>
        </div>

        {/* Method 2: KakaoTalk Link Share */}
        <div className="space-y-3">
          <label className="text-[13px] font-bold text-slate-300 flex items-center gap-1.5">
            <Share2 className="w-4 h-4 text-yellow-400" /> 카카오톡 딥링크로 초대
          </label>

          {!inviteUrl ? (
            <Button
              type="button"
              onClick={handleGenerateKakaoLink}
              className="w-full h-11 bg-[#FEE500] hover:bg-[#FEE500]/90 text-[#3C1E1E] font-extrabold text-[15px] rounded-xl flex items-center justify-center gap-2"
            >
              💬 카카오톡 공유용 초대 링크 만들기
            </Button>
          ) : (
            <div className="p-3 bg-[#0f172a] border border-slate-800 rounded-xl space-y-2">
              <p className="text-[11px] text-slate-400 font-medium">생성된 초대 링크</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-[13px] px-3 py-2 rounded-lg flex-1 font-mono"
                />
                <Button
                  onClick={handleCopyUrl}
                  size="sm"
                  className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "복사됨" : "복사"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
