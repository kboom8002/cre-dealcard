"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatKrPhoneInput } from "@/lib/magazine/phone-input";

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

function sanitizeBrokerSlug(raw: string | null): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned || cleaned.length > 120 || cleaned.includes("/") || cleaned.includes("\\")) {
    return "";
  }
  return cleaned;
}

function ExpertNoteRequestContent() {
  const searchParams = useSearchParams();
  const buildingId = searchParams.get("building");
  const readinessId = searchParams.get("readiness");
  const brokerParam = sanitizeBrokerSlug(searchParams.get("broker"));

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

    const combinedMemo = [
      brokerParam ? `[중개사 문의: ${brokerParam}]` : "",
      form.memo.trim(),
    ]
      .filter(Boolean)
      .join(" ");

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
          memo: combinedMemo || undefined,
        }),
      });

      const json = await res.json();
      if (!json.ok) {
        const errorMsg =
          json.error?.message ||
          (typeof json.error === "string" ? json.error : null) ||
          json.message ||
          "제출에 실패했습니다.";
        throw new Error(errorMsg);
      }

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
      <main className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-900 px-4 py-12">
        <div className="w-full max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-6 shadow-xs text-center space-y-6">
          <div className="text-5xl">✅</div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">요청이 접수됐습니다</h1>
            <p className="text-sm text-slate-700 leading-relaxed">
              입력하신 연락처로 전문가가
              <br />
              3줄 코멘트를 드릴 예정입니다.
            </p>
          </div>
          {requestId && (
            <p className="text-sm text-slate-600">
              요청 ID: {requestId.slice(0, 8)}...
            </p>
          )}
          <div className="space-y-2.5">
            {brokerParam && (
              <Link
                href={`/broker-profile/${encodeURIComponent(brokerParam)}`}
                className="inline-flex min-h-[48px] items-center justify-center w-full rounded-xl bg-blue-700 hover:bg-blue-800 px-6 py-3 text-sm font-semibold text-white transition-colors"
                id="cta-back-broker-profile"
              >
                중개사 프로필로 돌아가기
              </Link>
            )}
            <Link
              href="/hub"
              className={`inline-flex min-h-[48px] items-center justify-center w-full rounded-xl px-6 py-3 text-sm font-semibold transition-colors ${
                brokerParam
                  ? "bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-medium"
                  : "bg-blue-700 hover:bg-blue-800 text-white"
              }`}
              id="cta-back-hub"
            >
              매물 허브로 돌아가기
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center min-h-screen bg-slate-50 text-slate-900 px-4 py-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6"
      >
        {/* Header */}
        <div className="space-y-2 pt-1">
          <h1 className="text-2xl font-bold text-slate-900">전문가 3줄 코멘트 요청</h1>
          <p className="text-sm text-slate-700 leading-relaxed">
            부동산 전문가가
            <br />
            현재 상황에 맞는 짧고 실용적인 코멘트를 드립니다.
          </p>
        </div>

        {/* Context indicator */}
        {(buildingId || readinessId || brokerParam) && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-700">
              {buildingId
                ? "🏢 특정 건물에 대한 코멘트를 요청합니다."
                : brokerParam
                  ? `👤 담당 공인중개사(${brokerParam}) 앞으로 상담·코멘트를 요청합니다.`
                  : "📋 준비도 체크 결과에 대한 코멘트를 요청합니다."}
            </p>
          </div>
        )}

        {/* User Goal */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">
            이 건물을 왜 보고 있나요?
          </legend>
          <div className="grid grid-cols-1 gap-2">
            {USER_GOAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                id={`goal-${opt.value}`}
                onClick={() =>
                  setForm((p) => ({ ...p, userGoal: opt.value as UserGoal }))
                }
                className={`flex min-h-[48px] items-center gap-3 rounded-xl border px-4 py-3 text-sm text-left transition-all cursor-pointer ${
                  form.userGoal === opt.value
                    ? "border-blue-600 bg-blue-50 text-blue-900 font-semibold"
                    : "border-slate-200 bg-white text-slate-800 hover:border-blue-400"
                }`}
              >
                <span className="text-lg">{opt.emoji}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {/* Contact */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">
            연락처{" "}
            <span className="text-slate-600 font-normal">(전화 또는 이메일 중 1개 필수)</span>
          </legend>
          <div className="space-y-2">
            <input
              id="contact-name"
              type="text"
              aria-label="성함 (선택)"
              placeholder="성함 (선택)"
              value={form.name}
              onChange={(e) =>
                setForm((p) => ({ ...p, name: e.target.value }))
              }
              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none ring-0 focus:border-blue-600 transition-colors"
            />
            <input
              id="contact-phone"
              type="tel"
              aria-label="전화번호"
              placeholder="전화번호 (예: 010-1234-5678)"
              value={form.phone}
              onChange={(e) =>
                setForm((p) => ({ ...p, phone: formatKrPhoneInput(e.target.value) }))
              }
              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none ring-0 focus:border-blue-600 transition-colors"
            />
            <input
              id="contact-email"
              type="email"
              aria-label="이메일 (선택)"
              placeholder="이메일 (선택)"
              value={form.email}
              onChange={(e) =>
                setForm((p) => ({ ...p, email: e.target.value }))
              }
              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none ring-0 focus:border-blue-600 transition-colors"
            />
          </div>
        </fieldset>

        {/* Optional Memo */}
        <div className="space-y-2">
          <label htmlFor="expert-note-memo" className="text-sm font-semibold text-slate-900">
            추가 메모{" "}
            <span className="text-slate-600 font-normal">(선택)</span>
          </label>
          <Textarea
            id="expert-note-memo"
            value={form.memo}
            onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))}
            placeholder="궁금한 점이나 특별히 살펴봐야 할 부분을 적어주세요."
            className="min-h-[88px] border-slate-300 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400"
          />
        </div>

        {/* Privacy note */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <p className="text-sm text-slate-700 leading-relaxed">
            🔒 입력하신 연락처는 전문가 코멘트 전달 목적으로만 사용됩니다.
            외부에 공개되거나 영업 목적으로 사용되지 않습니다.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full min-h-[48px] bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold"
          disabled={!canSubmit || isLoading}
          id="cta-submit-expert-note"
        >
          {isLoading ? "제출 중..." : "코멘트 요청하기"}
        </Button>

        <p className="text-sm text-slate-600 text-center leading-relaxed">
          이 서비스는 투자·법률·세무 조언을 제공하지 않습니다.
          <br />
          상세 검토에는 전문가 직접 상담이 필요합니다.
        </p>
      </form>
    </main>
  );
}

export default function ExpertNoteRequestPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 text-slate-700 p-8 text-center text-sm">
          불러오는 중...
        </div>
      }
    >
      <ExpertNoteRequestContent />
    </Suspense>
  );
}
