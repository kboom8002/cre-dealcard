"use client";

import { useState } from "react";
import Link from "next/link";

// Checklist item definition
interface ChecklistItem {
  key: string;
  label: string;
  desc: string;
  weight: number;
  emoji: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    key: "buildingRegister",
    label: "건물 등기부등본",
    desc: "최근 발급된 등기부등본",
    weight: 15,
    emoji: "📋",
  },
  {
    key: "registry",
    label: "건축물대장",
    desc: "건축물 공부 자료",
    weight: 10,
    emoji: "🏛️",
  },
  {
    key: "landUsePlan",
    label: "토지이용계획확인원",
    desc: "용도 지역·지구 확인 서류",
    weight: 10,
    emoji: "🗺️",
  },
  {
    key: "rentRoll",
    label: "임대차 현황 요약표",
    desc: "임차인 구성, 계약 만기, 임대료 요약",
    weight: 20,
    emoji: "📊",
  },
  {
    key: "photos",
    label: "건물 사진",
    desc: "외관, 내부, 주요 공간 사진",
    weight: 10,
    emoji: "📸",
  },
  {
    key: "floorPlan",
    label: "평면도",
    desc: "층별 평면도 또는 스케치",
    weight: 10,
    emoji: "📐",
  },
  {
    key: "repairHistory",
    label: "수선 이력",
    desc: "최근 주요 수선·보수 내역",
    weight: 5,
    emoji: "🔧",
  },
  {
    key: "vacancyStatus",
    label: "공실 현황",
    desc: "현재 공실 여부 및 공실 기간",
    weight: 10,
    emoji: "🏢",
  },
  {
    key: "askingPrice",
    label: "희망 매각가",
    desc: "내부 검토용 희망 가격 (비공개 가능)",
    weight: 5,
    emoji: "💰",
  },
  {
    key: "disclosurePolicy",
    label: "공개 범위 결정",
    desc: "무엇을 공개하고 무엇을 숨길지 결정",
    weight: 5,
    emoji: "🔒",
  },
];

const READINESS_STATE_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  not_ready: {
    label: "준비 전",
    color: "text-gray-500",
    desc: "기본 서류 준비부터 시작해주세요.",
  },
  public_report_only: {
    label: "공개 리포트 가능",
    color: "text-blue-600",
    desc: "이 건물, 딜 될까? 리포트 생성이 가능합니다.",
  },
  teaser_ready: {
    label: "블라인드 티저 가능",
    color: "text-amber-600",
    desc: "블라인드 딜카드를 생성할 수 있습니다.",
  },
  snapshot_draft_ready: {
    label: "Snapshot 초안 가능",
    color: "text-orange-600",
    desc: "건물 Snapshot 초안 작성이 가능합니다.",
  },
  full_im_candidate: {
    label: "Full IM 가능",
    color: "text-green-600",
    desc: "전문가 검토 후 Full IM 초안 작성이 가능합니다.",
  },
};

type ChecklistState = Record<string, boolean>;

interface ReadinessResult {
  readinessCheckId: string;
  readinessScore: number;
  readinessState: string;
  availableOutputs: string[];
  missingData: string[];
  nextRecommendedAction: string;
}

const OUTPUT_LABELS: Record<string, string> = {
  deal_curiosity_report: "이 건물, 딜 될까? 리포트",
  blind_teaser: "블라인드 딜카드",
  building_snapshot_draft: "건물 Snapshot 초안",
  im_lite_candidate: "IM Lite 후보",
  full_im: "Full IM",
};

export default function OwnerReadinessPage() {
  const [checklist, setChecklist] = useState<ChecklistState>(() =>
    Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i.key, false])),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live score preview
  const liveScore = CHECKLIST_ITEMS.reduce(
    (sum, item) => sum + (checklist[item.key] ? item.weight : 0),
    0,
  );
  const checkedCount = Object.values(checklist).filter(Boolean).length;

  function toggleItem(key: string) {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/owner-readiness/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || "확인에 실패했습니다.");

      setResult(json.data);
      // Scroll to result
      setTimeout(() => {
        document.getElementById("readiness-result")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  const scoreColor =
    liveScore >= 70
      ? "text-green-600"
      : liveScore >= 40
        ? "text-amber-600"
        : "text-red-500";

  const stateInfo = result
    ? (READINESS_STATE_LABELS[result.readinessState] ??
      READINESS_STATE_LABELS.not_ready)
    : null;

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-32">
      <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2 pt-4 text-center">
          <h1 className="text-2xl font-bold">매각 준비도 체크</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            준비된 자료를 체크하면
            <br />
            지금 만들 수 있는 자료와 부족한 것을 알려드립니다.
          </p>
        </div>

        {/* Live Score Preview */}
        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">현재 준비도</p>
            <p className={`text-3xl font-bold ${scoreColor}`}>
              {liveScore}
              <span className="text-base text-muted-foreground font-normal">
                {" "}/ 100
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">체크 완료</p>
            <p className="text-lg font-semibold">
              {checkedCount}
              <span className="text-muted-foreground text-sm font-normal">
                {" "}/ {CHECKLIST_ITEMS.length}
              </span>
            </p>
          </div>
        </div>

        {/* Checklist */}
        <div className="space-y-2">
          <p className="text-sm font-medium">준비된 자료를 선택하세요</p>
          <div className="space-y-2">
            {CHECKLIST_ITEMS.map((item) => {
              const isChecked = checklist[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  id={`check-${item.key}`}
                  onClick={() => toggleItem(item.key)}
                  className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                    isChecked
                      ? "border-green-300 bg-green-50"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <span
                    className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      isChecked
                        ? "border-green-500 bg-green-500"
                        : "border-border"
                    }`}
                  >
                    {isChecked && (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        viewBox="0 0 12 12"
                      >
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="text-lg">{item.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${isChecked ? "text-green-800" : ""}`}>
                      {item.label}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.desc}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    +{item.weight}점
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center justify-center w-full rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
          id="cta-check-readiness"
        >
          {isLoading ? "확인 중..." : "준비도 확인하기"}
        </button>
      </form>

      {/* Result Section */}
      {result && stateInfo && (
        <div
          id="readiness-result"
          className="w-full max-w-md mx-auto mt-8 space-y-5"
        >
          {/* Score Card */}
          <div className="rounded-xl border-2 border-primary/20 bg-card p-5 text-center space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              준비도 결과
            </p>
            <p className={`text-5xl font-bold ${scoreColor}`}>
              {result.readinessScore}
            </p>
            <p className={`text-base font-semibold ${stateInfo.color}`}>
              {stateInfo.label}
            </p>
            <p className="text-sm text-muted-foreground">{stateInfo.desc}</p>
          </div>

          {/* Available Outputs */}
          {result.availableOutputs.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <span>✅</span> 지금 만들 수 있어요
              </h2>
              <div className="space-y-1.5">
                {result.availableOutputs.map((output) => (
                  <div
                    key={output}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="text-green-500">•</span>
                    <span>{OUTPUT_LABELS[output] || output}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing Data */}
          {result.missingData.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <span>📋</span> 부족한 자료
              </h2>
              <div className="space-y-1.5">
                {result.missingData.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-amber-500">-</span>
                    <span className="text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next Action */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm">
              <span className="font-semibold">다음 액션: </span>
              {result.nextRecommendedAction}
            </p>
          </div>

          {/* Expert Note CTA */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-base font-semibold">전문가 3줄 코멘트 받기</h2>
            <p className="text-sm text-muted-foreground">
              현재 준비 상태에서 어떤 전략이 가장 적합한지
              <br />
              전문가의 짧은 코멘트를 받아볼 수 있습니다.
            </p>
            <Link
              href={`/expert-note/request?readiness=${result.readinessCheckId}`}
              className="inline-flex items-center justify-center w-full rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              id="cta-expert-note-from-readiness"
            >
              전문가 코멘트 요청하기
            </Link>
          </div>

          {/* Boundary Note */}
          <div className="rounded-xl bg-secondary/50 border border-border px-4 py-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              이 체크리스트는 자료 준비 현황을 파악하기 위한 예비 점검입니다.
              가격, 수익률, 법률, 세무, 대출 가능성을 확정하지 않습니다.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
