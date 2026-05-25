"use client";

import React, { useState } from "react";
import Link from "next/link";
import { MatchReasonBreakdown } from "./MatchReasonBreakdown";

interface MatchScoreCardProps {
  match: {
    id: string;
    grade: "S" | "A" | "B" | "C";
    score: number;
    reasoning: string;
    stage1_passed: boolean;
    stage2_similarity: number;
    stage3_score: number;
    purpose_weight_profile: string;
    created_at: string;
    buyer_intent_lite?: {
      id: string;
      buyer_type: string;
      budget_display: string;
      preferred_regions: string[] | string | null;
      purchase_purpose: string;
      owner_id: string;
    };
  };
  buildingId: string;
}

const GRADE_STYLE = {
  S: {
    emoji: "🏆",
    badgeLabel: "S등급 최우선",
    textClass: "text-grade-s",
    borderClass: "border-grade-s/30 shadow-elevation-1",
    bgClass: "bg-gradient-to-br from-grade-s/10 via-grade-s/5 to-transparent hover:from-grade-s/15 hover:via-grade-s/8",
    badgeBg: "bg-grade-s/10 text-grade-s border-grade-s/20",
    gaugeColor: "text-grade-s",
    badgeGlow: "shadow-elevation-1 animate-pulse",
  },
  A: {
    emoji: "🥇",
    badgeLabel: "A등급 우수",
    textClass: "text-grade-a",
    borderClass: "border-grade-a/30 shadow-elevation-1",
    bgClass: "bg-gradient-to-br from-grade-a/10 via-grade-a/5 to-transparent hover:from-grade-a/15 hover:via-grade-a/8",
    badgeBg: "bg-grade-a/10 text-grade-a border-grade-a/20",
    gaugeColor: "text-grade-a",
    badgeGlow: "",
  },
  B: {
    emoji: "🥈",
    badgeLabel: "B등급 보통",
    textClass: "text-grade-b",
    borderClass: "border-grade-b/30",
    bgClass: "bg-gradient-to-br from-grade-b/10 via-grade-b/5 to-transparent hover:from-grade-b/15 hover:via-grade-b/8",
    badgeBg: "bg-grade-b/10 text-grade-b border-grade-b/20",
    gaugeColor: "text-grade-b",
    badgeGlow: "",
  },
  C: {
    emoji: "🥉",
    badgeLabel: "C등급 미흡",
    textClass: "text-grade-c",
    borderClass: "border-grade-c/30",
    bgClass: "bg-gradient-to-br from-grade-c/10 via-grade-c/5 to-transparent hover:from-grade-c/15 hover:via-grade-c/8",
    badgeBg: "bg-grade-c/10 text-grade-c border-grade-c/20",
    gaugeColor: "text-grade-c",
    badgeGlow: "",
  },
};

function CircularProgress({ percentage, colorClass }: { percentage: number; colorClass: string }) {
  const radius = 16;
  const strokeWidth = 3;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative w-10 h-10 flex items-center justify-center select-none">
      <svg className="w-10 h-10 transform -rotate-90">
        <circle
          cx="20"
          cy="20"
          r={radius}
          stroke="currentColor"
          className="text-black/5 dark:text-white/5"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          stroke="currentColor"
          className={`${colorClass} transition-all duration-1000 ease-out`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>
      <span className="absolute text-[10px] font-bold tracking-tight">
        {percentage}<span className="text-[7px] font-medium">%</span>
      </span>
    </div>
  );
}

export function MatchScoreCard({ match, buildingId }: MatchScoreCardProps) {
  const [isExpanded, setIsExpanded] = useState(match.grade !== "C");
  const cfg = GRADE_STYLE[match.grade] || GRADE_STYLE.C;
  const intent = Array.isArray(match.buyer_intent_lite)
    ? match.buyer_intent_lite[0]
    : match.buyer_intent_lite;

  const scorePercent = Math.round(match.score * 100);

  // Extract fail reasons if stage 1 failed
  let failReasons: string[] = [];
  if (!match.stage1_passed && match.reasoning) {
    if (match.reasoning.includes("Stage 1 필터 탈락:")) {
      const rawReasons = match.reasoning.replace("Stage 1 필터 탈락:", "").trim();
      failReasons = rawReasons
        .split("/")
        .map((r) => r.trim())
        .filter(Boolean);
    } else {
      failReasons = [match.reasoning];
    }
  }

  // Formatting regions
  const regions = intent?.preferred_regions
    ? Array.isArray(intent.preferred_regions)
      ? intent.preferred_regions.join(", ")
      : String(intent.preferred_regions)
    : "미확인";

  // Build KakaoTalk sharing link with custom text
  const shareText = encodeURIComponent(
    `[CRE AI 딜 매칭 알림]\n\n🏆 등급: ${match.grade}등급 (${scorePercent}점)\n🎯 매수자 유형: ${intent?.buyer_type || "미상"}\n💰 예산: ${intent?.budget_display || "미상"}\n📍 선호지역: ${regions}\n💡 분석 사유: ${match.reasoning}\n\n딜 확인하기: ${typeof window !== "undefined" ? window.location.origin : ""}/broker/deal-card/${buildingId}`
  );
  const kakaoShareUrl = `https://open.kakao.com/`; // Default fallback or custom kakao deep-link if needed

  return (
    <div
      className={`group rounded-xl border p-4 space-y-3 transition-all duration-300 ${cfg.bgClass} ${cfg.borderClass}`}
    >
      {/* Top Section */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm select-none">{cfg.emoji}</span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-shadow duration-300 ${cfg.badgeBg} ${cfg.badgeGlow}`}
            >
              {cfg.badgeLabel}
            </span>
            <span className="text-[11px] text-muted-foreground">
              매칭률 {scorePercent}%
            </span>
          </div>
          <h3 className={`text-sm font-semibold text-foreground`}>
            {intent?.buyer_type || "개인 투자자"}
          </h3>
        </div>

        {/* Circular Progress Gauge */}
        <div className="flex items-center gap-2">
          {match.stage1_passed && (
            <CircularProgress percentage={scorePercent} colorClass={cfg.gaugeColor} />
          )}
        </div>
      </div>

      {/* Constraints Summary Grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] bg-muted/60 dark:bg-muted/40 rounded-lg p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">예산</span>
          <span className="font-semibold text-foreground">
            {intent?.budget_display || "미확인"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">매수목적</span>
          <span className="font-semibold text-foreground">
            {intent?.purchase_purpose || "미확인"}
          </span>
        </div>
        <div className="col-span-2 flex items-center justify-between border-t border-border/40 pt-1.5 mt-0.5">
          <span className="text-muted-foreground">선호지역</span>
          <span className="font-semibold text-foreground truncate max-w-[200px]" title={regions}>
            {regions}
          </span>
        </div>
      </div>

      {/* Expand/Collapse Header Button */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          type="button"
        >
          <span>{isExpanded ? "📂 매칭 분석 상세 접기" : "📁 매칭 분석 상세 보기"}</span>
          <svg
            className={`w-3.5 h-3.5 transform transition-transform duration-300 ${
              isExpanded ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {!match.stage1_passed && (
          <span className="text-[10px] font-bold text-destructive bg-destructive/10 border border-destructive/20 px-1.5 py-0.5 rounded animate-pulse">
            Stage 1 탈락
          </span>
        )}
      </div>

      {/* Expanded Analysis Details */}
      {isExpanded && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          <MatchReasonBreakdown
            stage1Passed={match.stage1_passed}
            failReasons={failReasons}
            stage2Similarity={match.stage2_similarity}
            stage3Score={match.stage3_score}
            purposeProfile={match.purpose_weight_profile}
          />

          {/* Reasoning Bubble */}
          {match.reasoning && match.stage1_passed && (
            <div className="mt-3 rounded-lg bg-muted/60 dark:bg-muted/40 p-2.5">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                💬 <b>분석 요약:</b> {match.reasoning}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2 border-t border-border/40">
        <Link
          href={`/broker/buyer-intents/${intent?.id}`}
          className="flex-1 inline-flex items-center justify-center rounded-lg bg-card border border-border px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-muted"
          id={`cta-buyer-detail-${match.id}`}
        >
          매수자 상세 보기
        </Link>
        <a
          href={`${kakaoShareUrl}?q=${shareText}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex-1 inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-all shadow-sm ${
            match.grade === "S" || match.grade === "A"
              ? "bg-grade-s hover:bg-grade-s/90 hover:shadow-elevation-1 active:bg-grade-s"
              : "bg-secondary-foreground hover:bg-secondary-foreground/90 hover:shadow-elevation-1 text-secondary"
          }`}
          id={`cta-notify-broker-${match.id}`}
        >
          <span>📲 담당자에게 공유</span>
        </a>
      </div>
    </div>
  );
}
