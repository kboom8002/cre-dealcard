"use client";

import { useId, useState } from "react";
import { GateLevelBadge } from "@/components/gate/gate-level-badge";
import { GateStatusBadge } from "@/components/gate/gate-status-badge";

interface GateRequestFormProps {
  buildingId: string;
  buildingLabel?: string;
}

const GATE_LEVELS = [
  {
    value: "G1" as const,
    label: "등록 관심",
    desc: "이 건물에 관심을 등록합니다. 기본 정보 확인 가능.",
    fields: ["broker_contact_request"],
  },
  {
    value: "G2" as const,
    label: "임대상세 요약 요청",
    desc: "자격 확인 후 임대차 요약 등 제한적 추가 정보 요청.",
    fields: ["lease_summary_request", "exact_address_request"],
  },
  {
    value: "G3" as const,
    label: "투자 자료 요청",
    desc: "상세 투자 자료 및 예비검토 자료 요청.",
    fields: ["snapshot_request", "im_lite_request", "site_tour_request"],
  },
];

const FIELD_LABELS: Record<string, string> = {
  broker_contact_request: "공인중개사 연결 요청",
  lease_summary_request: "임대차 요약 요청",
  exact_address_request: "정확한 주소 요청",
  snapshot_request: "스냅샷 자료 요청",
  im_lite_request: "투자 요약서 요청",
  site_tour_request: "현장 방문 요청",
};

export function GateRequestForm({
  buildingId,
  buildingLabel,
}: GateRequestFormProps) {
  const uid = useId();
  const reasonId = `${uid}-gate-reason`;
  const consentId = `${uid}-gate-consent`;

  const [selectedLevel, setSelectedLevel] = useState<"G1" | "G2" | "G3">("G1");
  const [reason, setReason] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState<{
    gateRequestId: string;
    status: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedConfig = GATE_LEVELS.find((l) => l.value === selectedLevel)!;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!privacyConsent) {
      setError("개인정보 수집 및 이용에 동의해 주세요.");
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/gate-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId,
          requestedLevel: selectedLevel,
          requestedFields: selectedConfig.fields,
          reason: reason.trim() || undefined,
          privacyConsent: true,
        }),
      });

      const json = await res.json();
      if (!json.ok) {
        const errorMsg =
          json.error?.message ||
          (typeof json.error === "string" ? json.error : null) ||
          json.message ||
          "요청에 실패했습니다.";
        throw new Error(errorMsg);
      }

      setSubmitted({
        gateRequestId: json.data.gateRequestId,
        status: json.data.status,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 space-y-3 text-slate-900">
        <div className="flex items-center gap-2">
          <span className="text-lg">✅</span>
          <h3 className="text-base font-semibold text-emerald-900">
            열람 요청이 접수됐습니다
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <GateStatusBadge status={submitted.status} />
          <GateLevelBadge level={selectedLevel} />
        </div>
        <p className="text-sm text-emerald-800 leading-relaxed">
          담당 공인중개사 및 관리자 검토 후 연락드릴 예정입니다.
          <br />
          승인 전에는 상세 정보가 공개되지 않습니다.
        </p>
        <p className="text-sm text-slate-600">
          요청 ID: {submitted.gateRequestId.slice(0, 12)}...
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 text-slate-900"
    >
      <div className="space-y-2">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <span>🔐</span> 상세 자료 요청
        </h3>
        {buildingLabel && (
          <p className="text-sm text-slate-700 font-medium">{buildingLabel}</p>
        )}
        <p className="text-sm text-slate-600 leading-relaxed">
          자격 확인 후 추가 정보를 제공받을 수 있습니다.
          <br />
          승인 전에는 주소, 임차 상세, 수익 구조 등은 공개되지 않습니다.
        </p>
      </div>

      {/* Level selector */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-800">요청 단계</p>
        <div className="space-y-2">
          {GATE_LEVELS.map((level) => (
            <button
              key={level.value}
              type="button"
              id={`gate-level-${level.value}`}
              onClick={() => setSelectedLevel(level.value)}
              className={`w-full flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                selectedLevel === level.value
                  ? "border-slate-900 bg-slate-50"
                  : "border-slate-200 bg-white hover:border-slate-400"
              }`}
            >
              <GateLevelBadge level={level.value} showLabel={false} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">{level.label}</p>
                <p className="text-sm text-slate-600 mt-0.5">
                  {level.desc}
                </p>
                {selectedLevel === level.value && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {level.fields.map((f) => (
                      <span
                        key={f}
                        className="text-sm bg-slate-100 text-slate-800 rounded-md px-2.5 py-0.5 border border-slate-200"
                      >
                        {FIELD_LABELS[f] || f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Optional reason */}
      <div className="space-y-1.5">
        <label
          htmlFor={reasonId}
          className="block text-sm font-semibold text-slate-800"
        >
          간단한 이유 (선택)
        </label>
        <textarea
          id={reasonId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 사옥 이전 후보 건물로 검토 중입니다."
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[16px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-900 transition-colors min-h-[64px] resize-none"
        />
      </div>

      {/* PIPA consent */}
      <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <input
          id={consentId}
          type="checkbox"
          checked={privacyConsent}
          onChange={(e) => setPrivacyConsent(e.target.checked)}
          className="min-h-[48px] w-5 shrink-0 cursor-pointer text-[16px] accent-slate-900"
        />
        <label
          htmlFor={consentId}
          className="flex min-h-[48px] cursor-pointer items-center text-sm text-slate-700 leading-snug"
        >
          <span>
            열람 요청 검토 및 연락을 위한{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-slate-900 underline"
            >
              개인정보 수집·이용(새 창)
            </a>
            에 동의합니다. (필수)
          </span>
        </label>
      </div>

      {/* Disclosure warning */}
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
        <p className="text-sm text-amber-900 leading-relaxed">
          🔒 이 요청은 담당 공인중개사·관리자 검토 후 처리됩니다.
          승인 전까지 주소, 임차 상세, 매도자 정보는 공개되지 않습니다.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-medium text-rose-700"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="inline-flex min-h-[48px] items-center justify-center w-full rounded-xl bg-slate-900 px-6 py-3 text-[16px] font-bold text-white transition-all hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
        id="cta-submit-gate-request"
      >
        {isLoading ? "요청 중..." : "자료 요청하기"}
      </button>
    </form>
  );
}
