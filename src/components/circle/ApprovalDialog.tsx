"use client";

import React from "react";
import { ShieldCheck, Lock, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ApprovalDialogProps {
  matchId: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (matchId: string) => Promise<void>;
  isLoading?: boolean;
}

export function ApprovalDialog({
  matchId,
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}: ApprovalDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#131b2e] border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-amber-400" />
            <h2 className="text-[18px] font-extrabold text-slate-100">신원 공개 승인</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl space-y-2 text-[13px]">
          <p className="font-bold text-amber-300 flex items-center gap-1.5">
            <Lock className="w-4 h-4" /> 승인 시 상대방에게 공개되는 정보
          </p>
          <ul className="text-slate-300 text-[12px] space-y-1 pl-4 list-disc">
            <li>매물 정확한 주소 및 등기상 소유자 정보</li>
            <li>매수자 성명, 회사명, 연락처</li>
            <li>공동중개 파이프라인 딜 자동 생성</li>
          </ul>
        </div>

        <p className="text-[13px] text-slate-300 leading-relaxed text-center">
          상대 중개사도 승인을 완료하면 서로의 디테일 정보가 상호 공개되며 공동중개 절차가 시작됩니다.
        </p>

        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 h-11 text-[15px]"
          >
            취소
          </Button>
          <Button
            onClick={() => onConfirm(matchId)}
            disabled={isLoading}
            className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold h-11 text-[15px] shadow-md"
          >
            <CheckCircle2 className="w-5 h-5 mr-1" />
            {isLoading ? "승인 중..." : "확인, 공개합니다"}
          </Button>
        </div>
      </div>
    </div>
  );
}
