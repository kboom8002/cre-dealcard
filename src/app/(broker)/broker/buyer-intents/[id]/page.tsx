import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { BuyerMemoSection } from "./buyer-memo-section";

export const metadata: Metadata = {
  title: "매수자 조건 요약 | JS 1분 딜카드",
  description: "AI가 정리한 매수자 조건을 확인하세요.",
};

interface BuyerIntentResultPageProps {
  params: Promise<{ id: string }>;
}

export default async function BuyerIntentResultPage({
  params,
}: BuyerIntentResultPageProps) {
  const { id } = await params;
  const supabase = createServiceClient();

  // Fetch buyer intent
  const { data: intent } = await supabase
    .from("buyer_intent_lite")
    .select(
      "id, buyer_type, budget_display, preferred_regions, asset_types, purchase_purpose, must_have, nice_to_have, risk_tolerance, financing_note, normalized, created_at",
    )
    .eq("id", id)
    .single();

  if (!intent) return notFound();

  const normalized = (intent.normalized || {}) as Record<string, unknown>;
  const missingQuestions = Array.isArray(normalized.missingQuestions)
    ? normalized.missingQuestions
    : [];
  const privacyNotes = Array.isArray(normalized.privacyNotes)
    ? normalized.privacyNotes
    : [];

  const riskLabels: Record<string, string> = {
    low: "낮음 (보수적)",
    medium: "중간",
    high: "높음 (적극적)",
    unknown: "미확인",
  };

  // Fetch available buildings for buyer memo generation
  const { data: buildings } = await supabase
    .from("building_ssot_lite")
    .select("id, area_signal, asset_type, price_band")
    .order("created_at", { ascending: false })
    .limit(10);

  // Fetch existing buyer memo for this intent
  const { data: existingMemo } = await supabase
    .from("document_objects")
    .select("id, title, body, status, created_at")
    .eq("source_id", id)
    .eq("document_type", "buyer_fit_memo")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-32">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2 pt-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            매수자 조건 요약
          </p>
          <h1 className="text-xl font-bold">
            매수자 조건이 정리됐습니다
          </h1>
        </div>

        {/* Summary Card */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <span>🎯</span> 조건 요약
          </h2>
          <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">매수자 유형</p>
              <p className="font-medium">{intent.buyer_type || "미확인"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">예산</p>
              <p className="font-medium">{intent.budget_display || "미확인"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">선호 지역</p>
              <p className="font-medium">
                {(intent.preferred_regions as string[])?.join(", ") || "미확인"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">매입 목적</p>
              <p className="font-medium">
                {intent.purchase_purpose || "미확인"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">리스크 성향</p>
              <p className="font-medium">
                {riskLabels[intent.risk_tolerance || "unknown"]}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">선호 자산</p>
              <p className="font-medium">
                {(intent.asset_types as string[])?.join(", ") || "미확인"}
              </p>
            </div>
          </div>
        </div>

        {/* Must Have / Nice to Have */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          {(intent.must_have as string[])?.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-red-600 flex items-center gap-1">
                <span>🔴</span> 필수 조건
              </p>
              <ul className="space-y-1">
                {(intent.must_have as string[]).map((item, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span>{String(item)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(intent.nice_to_have as string[])?.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-blue-600 flex items-center gap-1">
                <span>🔵</span> 우대 조건
              </p>
              <ul className="space-y-1">
                {(intent.nice_to_have as string[]).map((item, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span>{String(item)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Financing Note */}
        {intent.financing_note && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <p className="text-sm font-semibold flex items-center gap-2">
              <span>💰</span> 대출 메모
            </p>
            <p className="text-sm text-muted-foreground">
              {intent.financing_note}
            </p>
          </div>
        )}

        {/* Missing Questions */}
        {missingQuestions.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <span>❓</span> 추가 확인 필요
            </h2>
            <ol className="space-y-1">
              {missingQuestions.map((q, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-muted-foreground font-medium shrink-0">
                    {i + 1}.
                  </span>
                  <span>{String(q)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Privacy Note */}
        {privacyNotes.length > 0 && (
          <div className="rounded-xl bg-secondary/50 border border-border px-4 py-3">
            {privacyNotes.map((note, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                🔒 {String(note)}
              </p>
            ))}
          </div>
        )}

        {/* Buyer Memo Section — client component for generating memo */}
        <BuyerMemoSection
          buyerIntentId={id}
          buildings={buildings || []}
          existingMemo={existingMemo}
        />

        {/* Date */}
        <div className="flex items-center justify-center">
          <span className="text-xs text-muted-foreground">
            {new Date(intent.created_at).toLocaleDateString("ko-KR")}
          </span>
        </div>
      </div>
    </main>
  );
}
