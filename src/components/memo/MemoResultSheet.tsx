"use client";

import { useState, useMemo } from "react";
import { 
  Building2, 
  Search, 
  Edit3, 
  ArrowRight, 
  CheckCircle2, 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  Sparkles,
  MapPin,
  CircleDollarSign,
  Layers,
  CalendarDays,
  Percent,
  Compass,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemoRouterOutput } from "@/ai/agents/memo-router-agent";
import { extractSlotsFromMemo, MappedSlot } from "@/domain/building/memo-slot-mapper";
import { useRouter } from "next/navigation";

interface MemoResultSheetProps {
  result: MemoRouterOutput;
  originalText: string;
  memoId?: string | null;
  onClose: () => void;
}

// 슬롯 키별 친절한 한글 라벨 및 아이콘 정의
const SLOT_META: Record<string, { label: string; icon: React.ReactNode; format: (val: any) => string }> = {
  address: {
    label: "소재지 / 주소",
    icon: <MapPin className="w-3.5 h-3.5 text-blue-500" />,
    format: (v) => String(v),
  },
  askingPriceKrw: {
    label: "매매 희망가",
    icon: <CircleDollarSign className="w-3.5 h-3.5 text-emerald-500" />,
    format: (v) => {
      const num = Number(v);
      if (num >= 100_000_000) {
        const bil = (num / 100_000_000).toFixed(1).replace(/\.0$/, "");
        return `${bil}억 원`;
      }
      return `${(num / 10_000).toLocaleString()}만 원`;
    },
  },
  monthlyRentKrw: {
    label: "월 임대료 합계",
    icon: <CircleDollarSign className="w-3.5 h-3.5 text-amber-500" />,
    format: (v) => `${(Number(v) / 10_000).toLocaleString()}만 원`,
  },
  totalDepositKrw: {
    label: "보증금 합계",
    icon: <CircleDollarSign className="w-3.5 h-3.5 text-amber-500" />,
    format: (v) => {
      const num = Number(v);
      if (num >= 100_000_000) {
        const bil = (num / 100_000_000).toFixed(1).replace(/\.0$/, "");
        return `${bil}억 원`;
      }
      return `${(num / 10_000).toLocaleString()}만 원`;
    },
  },
  buildYear: {
    label: "준공년도",
    icon: <CalendarDays className="w-3.5 h-3.5 text-indigo-500" />,
    format: (v) => `${v}년`,
  },
  floorsAboveGround: {
    label: "지상 층수",
    icon: <Layers className="w-3.5 h-3.5 text-slate-500" />,
    format: (v) => `지상 ${v}층`,
  },
  floorsUnderGround: {
    label: "지하 층수",
    icon: <Layers className="w-3.5 h-3.5 text-slate-500" />,
    format: (v) => `지하 ${v}층`,
  },
  totalFloorAreaPyung: {
    label: "연면적",
    icon: <Layers className="w-3.5 h-3.5 text-purple-500" />,
    format: (v) => `${Number(v).toLocaleString()}평`,
  },
  landAreaPyung: {
    label: "대지면적",
    icon: <Layers className="w-3.5 h-3.5 text-purple-500" />,
    format: (v) => `${Number(v).toLocaleString()}평`,
  },
  assetType: {
    label: "자산 유형",
    icon: <Building2 className="w-3.5 h-3.5 text-blue-500" />,
    format: (v) => String(v),
  },
  vacancyRatePct: {
    label: "공실률",
    icon: <Percent className="w-3.5 h-3.5 text-rose-500" />,
    format: (v) => `${v}%`,
  },
  capRatePct: {
    label: "수익률 (Cap Rate)",
    icon: <Percent className="w-3.5 h-3.5 text-emerald-500" />,
    format: (v) => `${v}%`,
  },
  loanAmountKrw: {
    label: "기존 융자/대출",
    icon: <CircleDollarSign className="w-3.5 h-3.5 text-neutral-500" />,
    format: (v) => `${(Number(v) / 100_000_000).toFixed(1)}억 원`,
  },
};

export function MemoResultSheet({ result, originalText, memoId, onClose }: MemoResultSheetProps) {
  const router = useRouter();
  const [showSlots, setShowSlots] = useState(true);

  // 메모 텍스트에서 구조화된 슬롯 추출
  const extractedSlots = useMemo(() => {
    if (!originalText) return [];
    try {
      const slotResult = extractSlotsFromMemo(originalText);
      return slotResult.slots || [];
    } catch {
      return [];
    }
  }, [originalText]);

  const markConverted = async () => {
    if (!memoId) return;
    try {
      await fetch(`/api/broker/memo/${memoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "converted" }),
      });
    } catch {
      // 전환 표시 실패해도 네비게이션은 진행
    }
  };

  const handleAction = async () => {
    // Store original text in session storage to prepopulate
    sessionStorage.setItem("memo_transfer", originalText);

    // Mark memo as converted for actionable types
    if (result.type === "new_deal" || result.type === "buyer_condition") {
      await markConverted();
    }

    switch (result.type) {
      case "new_deal":
        router.push("/broker/deal-card/new");
        break;
      case "buyer_condition":
        router.push("/broker/buyer-intents/new");
        break;
      case "update_building":
        router.push("/broker");
        break;
      case "schedule_event":
        router.push("/broker/schedule");
        break;
      case "general_note":
      default:
        onClose();
        break;
    }
  };

  const handleSaveOnly = () => {
    onClose();
  };

  const config = {
    new_deal: {
      title: "신규 매물 감지",
      desc: "딜카드를 생성할 수 있는 매물 정보가 파악되었습니다.",
      icon: <Building2 className="w-7 h-7 text-blue-600 dark:text-blue-400" />,
      boxStyle: "bg-blue-50/90 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800/60",
      titleStyle: "text-blue-950 dark:text-blue-100",
      descStyle: "text-blue-800/90 dark:text-blue-300",
      iconBoxStyle: "bg-white dark:bg-blue-900/50 border border-blue-100 dark:border-blue-700/50",
      buttonText: "딜카드 자동 생성하기",
    },
    buyer_condition: {
      title: "매수자 조건 감지",
      desc: "새로운 매수 의향서를 등록할 수 있습니다.",
      icon: <Search className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />,
      boxStyle: "bg-emerald-50/90 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800/60",
      titleStyle: "text-emerald-950 dark:text-emerald-100",
      descStyle: "text-emerald-800/90 dark:text-emerald-300",
      iconBoxStyle: "bg-white dark:bg-emerald-900/50 border border-emerald-100 dark:border-emerald-700/50",
      buttonText: "매수 의향서 자동 등록",
    },
    update_building: {
      title: "기존 매물 정보 보강",
      desc: "메모 내용이 활동 기록에 저장되었습니다.",
      icon: <Edit3 className="w-7 h-7 text-amber-600 dark:text-amber-400" />,
      boxStyle: "bg-amber-50/90 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800/60",
      titleStyle: "text-amber-950 dark:text-amber-100",
      descStyle: "text-amber-800/90 dark:text-amber-300",
      iconBoxStyle: "bg-white dark:bg-amber-900/50 border border-amber-100 dark:border-amber-700/50",
      buttonText: "확인",
    },
    general_note: {
      title: "일반 메모 저장 완료",
      desc: "메모 내용이 활동 기록에 저장되었습니다.",
      icon: <CheckCircle2 className="w-7 h-7 text-slate-600 dark:text-slate-400" />,
      boxStyle: "bg-slate-50/90 border-slate-200 dark:bg-slate-900/60 dark:border-slate-800/60",
      titleStyle: "text-slate-950 dark:text-slate-100",
      descStyle: "text-slate-800/90 dark:text-slate-300",
      iconBoxStyle: "bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50",
      buttonText: "닫기",
    },
    schedule_event: {
      title: "일정이 감지되었습니다",
      desc: "임장 또는 미팅 일정을 확인하고 예약으로 확정하세요.",
      icon: <Calendar className="w-7 h-7 text-amber-600 dark:text-amber-400" />,
      boxStyle: "bg-amber-50/90 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800/60",
      titleStyle: "text-amber-950 dark:text-amber-100",
      descStyle: "text-amber-800/90 dark:text-amber-300",
      iconBoxStyle: "bg-white dark:bg-amber-900/50 border border-amber-100 dark:border-amber-700/50",
      buttonText: "예약 생성하기",
    },
  }[result.type];

  // 매수 의향서 추출 데이터
  const buyerExtracted = result.extracted_data;

  return (
    <div className="flex flex-col space-y-4 pb-2">
      {/* 1. 상단 감지 카드 (다크모드 고대비 시인성 개선) */}
      <div className={`p-4 rounded-xl border ${config.boxStyle} flex items-start space-x-3.5 shadow-sm transition-all`}>
        <div className={`shrink-0 p-2.5 rounded-xl shadow-xs ${config.iconBoxStyle}`}>
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <h3 className={`font-bold text-base sm:text-lg tracking-tight ${config.titleStyle}`}>
              {config.title}
            </h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-200/60 dark:border-blue-700/60">
              신뢰도 {Math.round(result.confidence * 100)}%
            </span>
          </div>
          <p className={`text-xs sm:text-sm font-medium mt-1 leading-relaxed ${config.descStyle}`}>
            {config.desc}
          </p>
        </div>
      </div>

      {/* 2. AI 슬롯 추출 결과 (Building SSoT 데이터 미리보기) */}
      {(extractedSlots.length > 0 || buyerExtracted?.target_region || buyerExtracted?.target_budget) && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/60 overflow-hidden">
          <div 
            onClick={() => setShowSlots(!showSlots)}
            className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer hover:bg-neutral-100/70 dark:hover:bg-neutral-800/50 transition-colors"
          >
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="font-bold text-xs sm:text-sm text-foreground">
                파싱된 핵심 정보 (Building SSoT)
              </span>
              <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {extractedSlots.length > 0 ? `${extractedSlots.length}개 항목 추출` : "매수 조건 추출"}
              </span>
            </div>
            <button 
              type="button" 
              className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1 font-medium"
            >
              {showSlots ? "접기" : "상세보기"}
              {showSlots ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showSlots && (
            <div className="p-3 border-t border-neutral-200/80 dark:border-neutral-800/80 bg-white/60 dark:bg-neutral-950/40">
              {/* 매물 슬롯 그리드 */}
              {extractedSlots.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {extractedSlots.map((slot: MappedSlot) => {
                    const meta = SLOT_META[slot.key] || {
                      label: slot.key,
                      icon: <Check className="w-3.5 h-3.5 text-blue-500" />,
                      format: (v: any) => String(v),
                    };
                    return (
                      <div 
                        key={slot.key}
                        className="p-2 rounded-lg bg-neutral-50 dark:bg-neutral-900/90 border border-neutral-200/60 dark:border-neutral-800 flex flex-col justify-between"
                      >
                        <div className="flex items-center space-x-1.5 text-muted-foreground text-[11px] mb-1 font-medium">
                          {meta.icon}
                          <span className="truncate">{meta.label}</span>
                        </div>
                        <div className="text-xs sm:text-sm font-bold text-foreground truncate">
                          {meta.format(slot.value)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 매수자 조건 추출 항목 */}
              {buyerExtracted && (buyerExtracted.target_region || buyerExtracted.target_budget || buyerExtracted.inferred_posture) && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                  {buyerExtracted.target_region && (
                    <div className="p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/50">
                      <div className="flex items-center space-x-1 text-emerald-700 dark:text-emerald-400 text-[11px] font-medium mb-1">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>희망 지역</span>
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-emerald-950 dark:text-emerald-100 truncate">
                        {buyerExtracted.target_region}
                      </div>
                    </div>
                  )}
                  {buyerExtracted.target_budget && (
                    <div className="p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/50">
                      <div className="flex items-center space-x-1 text-emerald-700 dark:text-emerald-400 text-[11px] font-medium mb-1">
                        <CircleDollarSign className="w-3.5 h-3.5" />
                        <span>희망 예산</span>
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-emerald-950 dark:text-emerald-100 truncate">
                        {buyerExtracted.target_budget}
                      </div>
                    </div>
                  )}
                  {buyerExtracted.inferred_posture && (
                    <div className="p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/50">
                      <div className="flex items-center space-x-1 text-emerald-700 dark:text-emerald-400 text-[11px] font-medium mb-1">
                        <Compass className="w-3.5 h-3.5" />
                        <span>추천 포스처</span>
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-emerald-950 dark:text-emerald-100 truncate uppercase">
                        {buyerExtracted.inferred_posture}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. 분석 요약 텍스트 박스 */}
      <div className="bg-neutral-50 dark:bg-neutral-900/60 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap leading-relaxed">
        <span className="font-bold text-neutral-900 dark:text-neutral-100 block mb-1.5">
          분석 내용 요약:
        </span>
        {result.summary}
      </div>

      {/* 4. 액션 버튼 */}
      <div className="flex space-x-2 pt-2">
        <Button variant="outline" className="flex-1 text-xs h-10 font-medium" onClick={onClose}>
          취소
        </Button>
        <Button variant="secondary" className="flex-1 text-xs h-10 font-medium" onClick={handleSaveOnly}>
          저장만 하기
        </Button>
        <Button className="flex-1 text-xs h-10 font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm" onClick={handleAction}>
          {config.buttonText}
          {(result.type === "new_deal" || result.type === "buyer_condition" || result.type === "schedule_event") && (
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          )}
        </Button>
      </div>
    </div>
  );
}
