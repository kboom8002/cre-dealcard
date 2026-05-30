"use client";

import { useState } from "react";
import type { ReactNode } from "react";

type StepId = "classify" | "evaluate" | "generate" | "campaign" | "publish";

interface Step {
  id: StepId;
  icon: string;
  label: string;
  desc: string;
}

interface WizardProps {
  spaceId: string;
  spaceName: string;
  initialLeasingPageId?: string;
  initialSlug?: string;
}

const STEPS: Step[] = [
  { id: "classify", icon: "📷", label: "사진 분류",   desc: "Visual AI 분류" },
  { id: "evaluate", icon: "🎯", label: "적합성 분석", desc: "TenantFit + Vibe" },
  { id: "generate", icon: "📄", label: "페이지 생성", desc: "리싱 페이지 작성" },
  { id: "campaign", icon: "📢", label: "캠페인 카피", desc: "채널별 마케팅" },
  { id: "publish",  icon: "🌐", label: "공개 완료",   desc: "링크 복사" },
];

const TENANT_TYPES = ["clinic", "office", "fnb", "retail", "academy", "showroom"];
const CHANNEL_TYPES = ["kakao", "naver_listing", "sms", "instagram_caption"];

type StatusMap = Record<StepId, "idle" | "loading" | "done" | "error">;

function StepBadge({ status }: { status: StatusMap[StepId] }) {
  if (status === "loading") return <span className="text-xs animate-pulse text-amber-400">실행 중...</span>;
  if (status === "done")    return <span className="text-xs text-emerald-400">✓ 완료</span>;
  if (status === "error")   return <span className="text-xs text-red-400">✗ 실패</span>;
  return <span className="text-xs text-slate-600">대기</span>;
}

export default function SpaceWizard({ spaceId, initialSlug }: WizardProps) {
  const [activeStep, setActiveStep] = useState<StepId>("classify");
  const [stepStatus, setStepStatus] = useState<StatusMap>({
    classify: "idle", evaluate: "idle", generate: "idle", campaign: "idle", publish: "idle",
  });
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [slug, setSlug] = useState(initialSlug ?? "");
  const [selectedTenants, setSelectedTenants] = useState<string[]>(["clinic", "office"]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["kakao", "naver_listing"]);

  const setStatus = (step: StepId, s: StatusMap[StepId]) =>
    setStepStatus((p) => ({ ...p, [step]: s }));

  const callApi = async (path: string, body: unknown): Promise<unknown> => {
    const res = await fetch(`/api/spaces/${spaceId}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<unknown>;
  };

  const runClassify = async () => {
    setStatus("classify", "loading");
    try {
      await callApi("classify-photos", { target_tenant_types: selectedTenants, visual_assets: [] });
      setResults((p) => ({ ...p, classify: true }));
      setStatus("classify", "done");
      setActiveStep("evaluate");
    } catch { setStatus("classify", "error"); }
  };

  const runEvaluate = async () => {
    setStatus("evaluate", "loading");
    try {
      await callApi("evaluate-fit", { target_tenant_types: selectedTenants });
      setResults((p) => ({ ...p, evaluate: true }));
      setStatus("evaluate", "done");
      setActiveStep("generate");
    } catch { setStatus("evaluate", "error"); }
  };

  const runGenerate = async () => {
    setStatus("generate", "loading");
    try {
      const data = await callApi("generate-leasing-page", { target_tenant_types: selectedTenants });
      const d = data as { slug?: string };
      if (d.slug) setSlug(d.slug);
      setResults((p) => ({ ...p, generate: true }));
      setStatus("generate", "done");
      setActiveStep("campaign");
    } catch { setStatus("generate", "error"); }
  };

  const runCampaign = async () => {
    setStatus("campaign", "loading");
    try {
      await callApi("generate-campaign-copy", { copy_types: selectedChannels, target_tenant_types: selectedTenants });
      setResults((p) => ({ ...p, campaign: true }));
      setStatus("campaign", "done");
      setActiveStep("publish");
    } catch { setStatus("campaign", "error"); }
  };

  const publicUrl = slug ? `/leasing/${slug}` : null;

  function renderAction(stepId: StepId): ReactNode {
    const s = stepStatus[stepId];
    if (stepId === "classify") return (
      <div className="space-y-2 mt-3">
        <p className="text-[11px] text-slate-400">사진 없이 실행하면 빈 분류 결과가 반환됩니다.</p>
        <button onClick={runClassify} disabled={s === "loading"}
          className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:opacity-90 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition-all">
          {s === "loading" ? "분류 중..." : "사진 분류 실행"}
        </button>
      </div>
    );
    if (stepId === "evaluate") return (
      <button onClick={runEvaluate} disabled={s === "loading"}
        className="mt-3 w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:opacity-90 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition-all">
        {s === "loading" ? "분석 중..." : "적합성 + 분위기 분석"}
      </button>
    );
    if (stepId === "generate") return (
      <button onClick={runGenerate} disabled={s === "loading"}
        className="mt-3 w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:opacity-90 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition-all">
        {s === "loading" ? "생성 중..." : "AI 리싱 페이지 생성"}
      </button>
    );
    if (stepId === "campaign") return (
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          {CHANNEL_TYPES.map((ch) => (
            <button key={ch}
              onClick={() => setSelectedChannels((p) => p.includes(ch) ? p.filter((x) => x !== ch) : [...p, ch])}
              className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${selectedChannels.includes(ch) ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" : "bg-white/5 text-slate-500 border-white/10"}`}>
              {ch}
            </button>
          ))}
        </div>
        <button onClick={runCampaign} disabled={s === "loading"}
          className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:opacity-90 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition-all">
          {s === "loading" ? "생성 중..." : "채널별 카피 생성"}
        </button>
      </div>
    );
    if (stepId === "publish") return (
      <div className="mt-3 space-y-3">
        {publicUrl ? (
          <>
            <div className="flex items-center gap-2 bg-black/30 border border-emerald-500/20 rounded-xl px-3 py-2">
              <span className="text-[11px] text-emerald-300 font-mono truncate flex-1">{publicUrl}</span>
              <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}${publicUrl}`)}
                className="text-[10px] text-slate-400 hover:text-white shrink-0">복사</button>
            </div>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer"
              className="block w-full text-center bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold py-2.5 rounded-xl transition-all">
              공개 페이지 열기 ↗
            </a>
          </>
        ) : (
          <p className="text-xs text-slate-500">페이지 생성 단계를 먼저 완료해주세요.</p>
        )}
      </div>
    );
    return null;
  }

  return (
    <div className="space-y-4">
      {/* 임차인 유형 선택 */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <p className="text-xs font-bold text-slate-400 mb-3">분석할 임차인 유형</p>
        <div className="flex flex-wrap gap-2">
          {TENANT_TYPES.map((t) => (
            <button key={t}
              onClick={() => setSelectedTenants((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${selectedTenants.includes(t) ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-white/5 text-slate-400 border-white/10"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 단계 카드 */}
      {STEPS.map((step, idx) => {
        const status = stepStatus[step.id];
        const isActive = activeStep === step.id;
        const isDone = status === "done";

        return (
          <div key={step.id}
            className={`border rounded-2xl p-4 transition-all ${isActive ? "bg-white/8 border-emerald-500/30" : isDone ? "bg-white/3 border-white/5" : "bg-white/3 border-white/5 opacity-60"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{step.icon}</span>
                <div>
                  <p className="text-sm font-bold text-white">{idx + 1}. {step.label}</p>
                  <p className="text-[10px] text-slate-500">{step.desc}</p>
                </div>
              </div>
              <StepBadge status={status} />
            </div>

            {isActive && renderAction(step.id)}

            {isDone && step.id === "evaluate" && results.evaluate && (
              <p className="mt-2 text-[11px] text-slate-400">✅ TenantFit + VibeFit 분석 완료 · DB 저장됨</p>
            )}
            {isDone && step.id === "generate" && slug && (
              <p className="mt-2 text-[11px] text-slate-400">{`✅ /leasing/${slug} 생성됨`}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
