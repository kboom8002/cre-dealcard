"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const USER_GOAL_OPTIONS = [
  { value: "my_building", label: "내 건물 매각 검토", emoji: "🏢" },
  { value: "buy_consideration", label: "건물 매입 검토", emoji: "🔍" },
  { value: "client_listing", label: "중개 매물 등록", emoji: "📋" },
  { value: "client_recommendation", label: "매수자 추천", emoji: "🎯" },
  { value: "learning", label: "부동산 공부", emoji: "📚" },
] as const;

type UserGoal =
  | "my_building"
  | "buy_consideration"
  | "client_listing"
  | "client_recommendation"
  | "learning";

interface FormState {
  userGoal: UserGoal | "";
  name: string;
  phone: string;
  email: string;
  memo: string;
}

export default function ExpertNoteRequestPage() {
  const searchParams = useSearchParams();
  const buildingId = searchParams.get("building");
  const readinessId = searchParams.get("readiness");

  const [form, setForm] = useState<FormState>({
    userGoal: "",
    name: "",
    phone: "",
    email: "",
    memo: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    form.userGoal !== "" && (form.phone !== "" || form.email !== "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/expert-note/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId: buildingId || undefined,
          userGoal: form.userGoal,
          contact: {
            name: form.name || undefined,
            phone: form.phone || undefined,
            email: form.email || undefined,
          },
          memo: form.memo || undefined,
        }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || "제출에 실패했습니다.");

      setRequestId(json.data.requestId);
      setIsSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isSubmitted) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-4 py-12">
        <div className="w-full max-w-md mx-auto text-center space-y-6">
          <div className="text-5xl">✅</div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">요청이 접수됐습니다</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              입력하신 연락처로 전문가가
              <br />
              3줄 코멘트를 드릴 예정입니다.
            </p>
          </div>
          {requestId && (
            <p className="text-xs text-muted-foreground">
              요청 ID: {requestId.slice(0, 8)}...
            </p>
          )}
          <div className="space-y-2">
            <a
              href="/building-radar"
              className="inline-flex items-center justify-center w-full rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
              id="cta-back-radar"
            >
              딜 리포트로 돌아가기
            </a>
            <a
              href="/broker"
              className="inline-flex items-center justify-center w-full rounded-xl bg-secondary px-6 py-3 text-sm font-medium text-secondary-foreground"
              id="cta-back-broker"
            >
              중개사 홈으로
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md mx-auto space-y-6"
      >
        {/* Header */}
        <div className="space-y-2 pt-4">
          <h1 className="text-2xl font-bold">전문가 3줄 코멘트 요청</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            부동산 전문가가
            <br />
            현재 상황에 맞는 짧고 실용적인 코멘트를 드립니다.
          </p>
        </div>

        {/* Context indicator */}
        {(buildingId || readinessId) && (
          <div className="rounded-xl bg-secondary/50 border border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {buildingId
                ? `🏢 특정 건물에 대한 코멘트를 요청합니다.`
                : `📋 준비도 체크 결과에 대한 코멘트를 요청합니다.`}
            </p>
          </div>
        )}

        {/* User Goal */}
        <div className="space-y-3">
          <label className="text-sm font-medium">이 건물을 왜 보고 있나요?</label>
          <div className="grid grid-cols-1 gap-2">
            {USER_GOAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                id={`goal-${opt.value}`}
                onClick={() =>
                  setForm((p) => ({ ...p, userGoal: opt.value as UserGoal }))
                }
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm text-left transition-all ${
                  form.userGoal === opt.value
                    ? "border-primary bg-primary/5 font-medium"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <span className="text-lg">{opt.emoji}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div className="space-y-3">
          <label className="text-sm font-medium">
            연락처{" "}
            <span className="text-muted-foreground font-normal">(전화 또는 이메일 중 1개 필수)</span>
          </label>
          <div className="space-y-2">
            <input
              id="contact-name"
              type="text"
              placeholder="성함 (선택)"
              value={form.name}
              onChange={(e) =>
                setForm((p) => ({ ...p, name: e.target.value }))
              }
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none ring-0 focus:border-primary transition-colors"
            />
            <input
              id="contact-phone"
              type="tel"
              placeholder="전화번호 (예: 010-1234-5678)"
              value={form.phone}
              onChange={(e) =>
                setForm((p) => ({ ...p, phone: e.target.value }))
              }
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none ring-0 focus:border-primary transition-colors"
            />
            <input
              id="contact-email"
              type="email"
              placeholder="이메일 (선택)"
              value={form.email}
              onChange={(e) =>
                setForm((p) => ({ ...p, email: e.target.value }))
              }
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none ring-0 focus:border-primary transition-colors"
            />
          </div>
        </div>

        {/* Optional Memo */}
        <div className="space-y-2">
          <label htmlFor="expert-note-memo" className="text-sm font-medium">
            추가 메모{" "}
            <span className="text-muted-foreground font-normal">(선택)</span>
          </label>
          <Textarea
            id="expert-note-memo"
            value={form.memo}
            onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))}
            placeholder="궁금한 점이나 특별히 살펴봐야 할 부분을 적어주세요."
            className="min-h-[80px]"
          />
        </div>

        {/* Privacy note */}
        <div className="rounded-xl bg-secondary/50 border border-border px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            🔒 입력하신 연락처는 전문가 코멘트 전달 목적으로만 사용됩니다.
            외부에 공개되거나 영업 목적으로 사용되지 않습니다.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!canSubmit || isLoading}
          id="cta-submit-expert-note"
        >
          {isLoading ? "제출 중..." : "코멘트 요청하기"}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          이 서비스는 투자·법률·세무 조언을 제공하지 않습니다.
          <br />
          상세 검토에는 전문가 직접 상담이 필요합니다.
        </p>
      </form>
    </main>
  );
}
