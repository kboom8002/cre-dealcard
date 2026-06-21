"use client";

import { Building2, Search, Edit3, ArrowRight, CheckCircle2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemoRouterOutput } from "@/ai/agents/memo-router-agent";
import { useRouter } from "next/navigation";

interface MemoResultSheetProps {
  result: MemoRouterOutput;
  originalText: string;
  onClose: () => void;
}

export function MemoResultSheet({ result, originalText, onClose }: MemoResultSheetProps) {
  const router = useRouter();

  const handleAction = () => {
    // Store original text in session storage to prepopulate
    sessionStorage.setItem("memo_transfer", originalText);

    switch (result.type) {
      case "new_deal":
        router.push("/broker/deal-card/new");
        break;
      case "buyer_condition":
        router.push("/broker/buyer-intents/new");
        break;
      case "update_building":
        // In a real app, we might search for the building or route to an update page.
        // For now, route to dashboard or building list.
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
    // API에서 이미 저장했으므로 닫기만 하면 됨
    onClose();
  };

  const config = {
    new_deal: {
      title: "신규 매물 감지",
      desc: "딜카드를 생성할 수 있는 매물 정보가 파악되었습니다.",
      icon: <Building2 className="w-8 h-8 text-blue-500" />,
      color: "bg-blue-50 text-blue-700 border-blue-200",
      buttonText: "딜카드 자동 생성하기",
    },
    buyer_condition: {
      title: "매수자 조건 감지",
      desc: "새로운 매수 의향서를 등록할 수 있습니다.",
      icon: <Search className="w-8 h-8 text-emerald-500" />,
      color: "bg-emerald-50 text-emerald-700 border-emerald-200",
      buttonText: "매수 의향서 자동 등록",
    },
    update_building: {
      title: "기존 매물 정보 보강",
      desc: "메모 내용이 활동 기록에 저장되었습니다.",
      icon: <Edit3 className="w-8 h-8 text-amber-500" />,
      color: "bg-amber-50 text-amber-700 border-amber-200",
      buttonText: "확인",
    },
    general_note: {
      title: "일반 메모 저장 완료",
      desc: "메모 내용이 활동 기록에 저장되었습니다.",
      icon: <CheckCircle2 className="w-8 h-8 text-slate-500" />,
      color: "bg-slate-50 text-slate-700 border-slate-200",
      buttonText: "닫기",
    },
    schedule_event: {
      title: "일정이 감지되었습니다",
      desc: "임장 또는 미팅 일정을 확인하고 예약으로 확정하세요.",
      icon: <Calendar className="w-8 h-8 text-amber-500" />,
      color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30",
      buttonText: "예약 생성하기",
    },
  }[result.type];

  return (
    <div className="flex flex-col space-y-6">
      <div className={`p-4 rounded-xl border ${config.color} flex items-start space-x-4`}>
        <div className="shrink-0 p-2 bg-white rounded-lg shadow-sm">
          {config.icon}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg">{config.title}</h3>
          <p className="text-sm opacity-90 mt-1">{config.desc}</p>
        </div>
      </div>

      <div className="bg-muted/50 p-4 rounded-lg border text-sm text-muted-foreground whitespace-pre-wrap">
        <span className="font-medium text-foreground block mb-2">분석된 내용 요약:</span>
        {result.summary}
      </div>

      <div className="flex space-x-2 pt-4">
        <Button variant="outline" className="flex-1 text-xs" onClick={onClose}>
          취소
        </Button>
        <Button variant="secondary" className="flex-1 text-xs" onClick={handleSaveOnly}>
          저장만 하기
        </Button>
        <Button className="flex-1 text-xs" onClick={handleAction}>
          {config.buttonText}
          {(result.type === "new_deal" || result.type === "buyer_condition" || result.type === "schedule_event") && (
            <ArrowRight className="w-3 h-3 ml-1" />
          )}
        </Button>
      </div>
    </div>
  );
}
