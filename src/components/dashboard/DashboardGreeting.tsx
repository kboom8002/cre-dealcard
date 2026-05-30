"use client";

import { Sun, Moon, Coffee, Sunset } from "lucide-react";

interface DashboardGreetingProps {
  brokerName?: string;
}

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 6) return { label: "새벽", icon: Moon, color: "text-indigo-400" };
  if (hour < 12) return { label: "좋은 아침", icon: Sun, color: "text-amber-400" };
  if (hour < 18) return { label: "좋은 오후", icon: Coffee, color: "text-orange-400" };
  if (hour < 21) return { label: "좋은 저녁", icon: Sunset, color: "text-rose-400" };
  return { label: "수고하셨어요", icon: Moon, color: "text-indigo-400" };
}

export function DashboardGreeting({ brokerName }: DashboardGreetingProps) {
  const time = getTimeOfDay();
  const Icon = time.icon;
  const today = new Date().toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div className="flex items-start gap-3 py-1">
      <div className={`w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center shrink-0`}>
        <Icon className={`w-4.5 h-4.5 ${time.color}`} strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{today}</p>
        <h1 className="text-base font-bold text-foreground leading-snug">
          {time.label}
          {brokerName ? `, ${brokerName}님` : ""}
          &nbsp;👋
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          오늘도 최고의 딜을 만들어 보세요
        </p>
      </div>
    </div>
  );
}
