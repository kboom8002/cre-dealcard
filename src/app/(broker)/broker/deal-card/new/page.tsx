"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { ShareToCircleSheet } from "@/components/circle/ShareToCircleSheet";
import { MemoImportModal } from "@/components/broker/deal-card/MemoImportModal";
import { SeniorTermTooltip } from "@/components/help/SeniorTermTooltip";
import { StickyNote, Loader2, CheckCircle2, Circle, AlertTriangle, RefreshCw, Plus, X, ChevronLeft } from "lucide-react";

interface DuplicateCandidateUI {
  existingBuildingId: string;
  matchType: string;
  confidence: number;
  summary: {
    areaSignal: string | null;
    assetType: string | null;
    priceBand: string | null;
    createdAt: string | null;
    status: string | null;
  };
}

const LOADING_STEPS = [
  "메모에서 매물 핵심 정보 추출 중",
  "지번/도로명 주소 검증 및 표준화 중",
  "권역 및 자산 개요 분석 중",
  "주소·임차인 등 민감정보 마스킹 처리 중",
  "보안형 블라인드 딜카드 생성 중",
  "카카오톡 공유 브리핑 문구 생성 중",
  "AI 최종 검수 및 마무리 중 (최대 1~2분 소요)",
];

export default function BrokerDealCardNewPage() {
  const router = useRouter();
  const [memo, setMemo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [handoffSuccess, setHandoffSuccess] = useState(false);
  const [createdBuildingId, setCreatedBuildingId] = useState<string | null>(null);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showMemoModal, setShowMemoModal] = useState(false);
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicateCandidateUI[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const transferred = sessionStorage.getItem("memo_transfer");
    if (transferred) {
      setMemo(transferred);
      setHandoffSuccess(true);
      sessionStorage.removeItem("memo_transfer");
      
      // 알림 배너 3초 후 자동 제거
      setTimeout(() => setHandoffSuccess(false), 3000);
    }
  }, []);

  const [abortController, setAbortController] = useState<AbortController | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!memo.trim()) return;
    if (memo.length > 3000) return;

    setIsLoading(true);
    setError(null);
    setLoadingStep(0);

    const controller = new AbortController();
    setAbortController(controller);

    // Timeout safety abort after 180 seconds (3 minutes for AI pipeline execution)
    const timeoutTimer = setTimeout(() => {
      controller.abort();
      setError("생성 시간이 초과되었습니다. AI 분석 작업이 오래 걸리고 있습니다. 네트워크 상태를 확인하거나 잠시 후 내 딜카드 목록에서 생성 결과를 확인해 주세요.");
      setIsLoading(false);
    }, 180000);

    // Progressive loading steps
    const interval = setInterval(() => {
      setLoadingStep((prev) =>
        prev < LOADING_STEPS.length - 1 ? prev + 1 : prev,
      );
    }, 12000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/broker/deal-card/from-memo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          memo: memo.trim(),
          visibilityPreference: "blind",
          isAsync: true,
        }),
        signal: controller.signal,
      });

      let json: any;
      try {
        json = await res.json();
      } catch {
        throw new Error("서버와 통신하는 중 일시적인 지연이 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }

      if (!res.ok || !json.ok) {
        // Quality Gate 실패 시 구체적인 부족 정보 전달 (DC-3)
        if (json.code === "MEMO_QUALITY_INSUFFICIENT" && json.details) {
          const missing = json.details.missingFields || [];
          const fieldLabels: Record<string, string> = {
            location: '📍 위치(지역명, 역명, 주소)',
            asset_type: '🏢 자산 유형(오피스, 빌딩, 상가 등)',
            numeric: '💰 가격 또는 면적 수치',
            deal_type: '📋 거래 유형(매각, 임대 등)',
          };
          const missingGuide = missing.map((f: string) => fieldLabels[f] || f).join("\n• ");
          const suggestion = json.details.suggestion ? `\n\n💡 AI 제안: ${json.details.suggestion}` : "";
          throw new Error(`메모에 핵심 정보가 부족합니다.\n\n아래 항목 중 부족한 정보를 보완해주세요:\n• ${missingGuide}${suggestion}`);
        }
        // 가이드레일 위반 시 상세 안내
        if (json.code === "GUARDRAIL_VIOLATION") {
          throw new Error(`안전 가이드라인 위반: ${json.message || "매수자 보호 규정에 위배되는 내용이 포함되어 있습니다."}`);
        }
        // 🚨 P0: 동일 물건 중복 감지 🚨
        if (json.code === "DUPLICATE_BUILDING_DETECTED" && json.duplicates) {
          setDuplicateCandidates(json.duplicates);
          setShowDuplicateDialog(true);
          setIsLoading(false);
          clearTimeout(timeoutTimer);
          clearInterval(interval);
          return; // 에러가 아닌 다이얼로그로 표시
        }
        const errMsg = typeof json.error === 'string' && !json.error.startsWith('{')
          ? json.error
          : typeof json.message === 'string' && !json.message.startsWith('{')
          ? json.message
          : "딜카드 생성에 실패했습니다. 메모 내용을 확인한 뒤 다시 시도해 주세요.";
        throw new Error(errMsg);
      }

      // 비동기 작업 폴링 처리 (최대 90회 × 2초 = 180초, abort 타이머와 일치)
      if (json.isAsync && json.jobId) {
        const jobId = json.jobId;
        let isCompleted = false;
        let pollCount = 0;
        let buildingId: string | undefined;

        while (!isCompleted && pollCount < 90) {
          await new Promise(r => setTimeout(r, 2000));
          pollCount++;
          setLoadingStep((prev) => Math.max(prev, Math.min(LOADING_STEPS.length - 1, Math.floor(pollCount / 4))));
          
          try {
            const jobRes = await fetch(`/api/broker/jobs/${jobId}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            const jobJson = await jobRes.json();
            
            if (jobJson.ok && jobJson.job) {
              if (jobJson.job.status === "completed") {
                buildingId = jobJson.job.output_ref?.buildingId;
                isCompleted = true;
                break;
              } else if (jobJson.job.status === "failed") {
                const rawJobErr = jobJson.job.error;
                throw new Error(
                  typeof rawJobErr === "string" && !rawJobErr.startsWith("{")
                    ? rawJobErr
                    : "AI 분석 중 일시적인 오류가 발생했습니다. 다시 시도해 주세요."
                );
              }
            }
          } catch (pollErr) {
            if (pollErr instanceof Error && pollErr.message.includes("AI 분석 중")) {
              throw pollErr;
            }
            console.error("Polling error:", pollErr);
          }
        }
        
        if (!isCompleted || !buildingId) {
           throw new Error("AI 분석 시간이 길어지고 있습니다. 잠시 후 [내 물건] 목록에서 완성된 딜카드를 확인해 주세요.");
        }
        
        setCreatedBuildingId(buildingId);
        sessionStorage.setItem("deal_card_just_created", "true");
        router.push(`/broker/deal-card/${buildingId}`);
      } else {
        // 기존 동기 성공 로직
        setCreatedBuildingId(json.data.buildingId);
        if (json.data.buildingId) {
          sessionStorage.setItem("deal_card_just_created", "true");
          router.push(`/broker/deal-card/${json.data.buildingId}`);
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        return; // Aborted, handled by timeout
      }
      setError(err.message || "오류가 발생했습니다.");
      setIsLoading(false);
    } finally {
      clearTimeout(timeoutTimer);
      clearInterval(interval);
    }
  }

  const handleCancelLoading = () => {
    if (abortController) {
      abortController.abort();
    }
    setIsLoading(false);
    setError("딜카드 생성을 취소했습니다. 메모 내용을 보완하여 다시 시도해보세요.");
  };

  /** 동일 물건 감지 다이얼로그에서 선택 후 재전송 */
  const handleDuplicateAction = async (action: "update" | "forceNew" | "cancel", existingId?: string) => {
    setShowDuplicateDialog(false);
    setDuplicateCandidates([]);

    if (action === "cancel") return;

    setIsLoading(true);
    setError(null);
    setLoadingStep(0);

    const controller = new AbortController();
    setAbortController(controller);
    const timeoutTimer = setTimeout(() => {
      controller.abort();
      setError("생성 시간이 초과되었습니다. AI 분석 작업이 지연되고 있습니다. 딜카드 목록을 확인해주세요.");
      setIsLoading(false);
    }, 180000);
    const interval = setInterval(() => {
      setLoadingStep((prev) => prev < LOADING_STEPS.length - 1 ? prev + 1 : prev);
    }, 12000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const body: Record<string, unknown> = {
        memo: memo.trim(),
        visibilityPreference: "blind",
      };

      if (action === "forceNew") {
        body.forceNew = true;
      } else if (action === "update" && existingId) {
        body.existingBuildingId = existingId;
      }

      const res = await fetch("/api/broker/deal-card/from-memo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      let json: Record<string, unknown>;
      try {
        json = await res.json() as Record<string, unknown>;
      } catch {
        throw new Error("서버와 통신하는 중 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }

      if (!res.ok || !json.ok) {
        const errMsg = typeof json.error === 'string' ? json.error
          : typeof json.message === 'string' ? json.message
          : "딜카드 생성에 실패했습니다. 메모 내용을 확인한 뒤 다시 시도해 주세요.";
        throw new Error(errMsg);
      }

      const data = json.data as Record<string, string>;
      setCreatedBuildingId(data.buildingId);
      if (data.buildingId) {
        sessionStorage.setItem("deal_card_just_created", "true");
        router.push(`/broker/deal-card/${data.buildingId}`);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      setIsLoading(false);
    } finally {
      clearTimeout(timeoutTimer);
      clearInterval(interval);
    }
  };

  // ─── P0: 동일 물건 감지 다이얼로그 ───
  if (showDuplicateDialog && duplicateCandidates.length > 0) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-4 py-12">
        <div className="w-full max-w-md mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">동일한 물건이 감지되었습니다</h1>
              <p className="text-sm text-muted-foreground">
                이미 등록된 물건과 동일한 주소가 포함되어 있습니다.
              </p>
            </div>
          </div>

          {/* Duplicate Candidates */}
          <div className="space-y-3">
            {duplicateCandidates.map((candidate) => {
              const matchLabel = candidate.matchType === "pnu" ? "필지번호(PNU) 일치"
                : candidate.matchType === "jibun_exact" ? "지번 일치"
                : "유사 물건";
              const createdDate = candidate.summary.createdAt
                ? new Date(candidate.summary.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
                : "";

              return (
                <div
                  key={candidate.existingBuildingId}
                  className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          {matchLabel} ({Math.round(candidate.confidence * 100)}%)
                        </span>
                      </div>
                      <p className="text-sm font-medium">
                        {candidate.summary.areaSignal || "권역 미상"} · {candidate.summary.assetType || "유형 미상"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {candidate.summary.priceBand || ""} {createdDate ? `· ${createdDate} 등록` : ""}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => handleDuplicateAction("update", candidate.existingBuildingId)}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    이 물건 업데이트
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="space-y-2 pt-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleDuplicateAction("forceNew")}
            >
              <Plus className="w-4 h-4 mr-2" />
              다른 물건이에요 — 새로 만들기
            </Button>
            <button
              className="w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 py-2"
              onClick={() => handleDuplicateAction("cancel")}
            >
              <X className="w-3 h-3 inline mr-1" />
              취소하고 메모 수정하기
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (createdBuildingId) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-4 py-12">
        <div className="w-full max-w-md mx-auto text-center space-y-6">
          <div className="text-5xl">🎉</div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">딜카드가 완성되었습니다!</h1>
            <p className="text-sm text-muted-foreground">
              민감한 상세 주소가 가려진 안심 딜카드로 카톡 공유나 9면 투자설명서(IM) 작성을 시작하세요.
            </p>
          </div>

          <div className="space-y-3 pt-4">
            <Button
              size="lg"
              className="w-full min-h-[52px] text-base font-bold"
              onClick={() =>
                router.push(`/broker/deal-card/${createdBuildingId}`)
              }
            >
              딜카드 확인 및 카톡 공유 · 9면 IM 만들기
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full min-h-[48px] text-base font-semibold"
              onClick={() =>
                router.push(`/broker/magazine-editor?mode=simple&deals=${createdBuildingId}`)
              }
            >
              📰 이번 주 고객 소식지에 이 매물 소개하기
            </Button>
            {/* DORMANT: ux60-focus — 서클 공유 및 임장 일정 버튼 숨김 (docs/rollback/2026-10-18-dormant-features.md 참조) */}
          </div>

          {showShareSheet && (
            <ShareToCircleSheet
              assetType="building"
              assetId={createdBuildingId}
              onClose={() => setShowShareSheet(false)}
            />
          )}
          <button
            onClick={() => router.push("/broker/buildings")}
            className="w-full text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors pt-2"
          >
            📋 내 물건 목록 보기
          </button>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-4 py-12">
        <div className="w-full max-w-md mx-auto text-center space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">딜카드를 만들고 있어요</h1>
            <p className="text-sm text-muted-foreground">
              메모를 분석하고 민감정보를 자동으로 숨기고 있습니다.
            </p>
          </div>

          <div className="space-y-3 text-left">
            {LOADING_STEPS.map((step, i) => (
              <div
                key={step}
                className={`flex items-center gap-3 transition-all duration-500 ${
                  i <= loadingStep ? "opacity-100" : "opacity-30"
                }`}
              >
                <span className="text-lg flex items-center justify-center w-6 h-6">
                  {i < loadingStep ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : i === loadingStep ? (
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground/30" />
                  )}
                </span>
                <span className={`text-sm ${i === loadingStep ? 'font-medium text-foreground' : i < loadingStep ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>{step}</span>
              </div>
            ))}
          </div>

          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${((loadingStep + 1) / LOADING_STEPS.length) * 100}%`,
              }}
            />
          </div>

          {/* DC-5: 생성 중 취소 버튼 */}
          <button
            type="button"
            onClick={handleCancelLoading}
            className="text-xs text-muted-foreground hover:text-foreground underline pt-2"
          >
            ✕ 생성 취소하고 메모 수정하기
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl mx-auto space-y-6 bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-sm"
      >
        {/* Top Breadcrumb & Back Navigation */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
              } else {
                router.push("/broker/buildings");
              }
            }}
            className="flex items-center gap-1.5 text-[15px] font-bold text-muted-foreground hover:text-foreground transition-colors py-1.5 px-3 -ml-2 rounded-xl hover:bg-secondary/60"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>뒤로 가기</span>
          </button>
          
          <span className="text-[14px] text-muted-foreground font-bold">
            새 물건(딜카드) 등록
          </span>

          <button
            type="button"
            onClick={() => router.push("/broker/buildings")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors p-2 rounded-xl hover:bg-secondary/60"
            title="닫고 목록으로"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Header */}
        <div className="space-y-2 pt-1">
          {handoffSuccess && (
            <div className="mb-4 bg-emerald-50 text-emerald-700 border border-emerald-300 px-4 py-2.5 rounded-xl text-[15px] font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
              <span>📋</span> 메모에서 텍스트가 자동 전달되었습니다.
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              카톡 매물 설명을 그대로 붙여넣으세요
            </h1>
            <SeniorTermTooltip
              termKey="다필지"
              buttonLabel="❓ 다필지(여러 번지) 입력 팁"
            />
          </div>
          <p className="text-[16px] text-muted-foreground leading-relaxed">
            양식에 맞춰 정리하지 않아도 됩니다. 평소 카카오톡이나 문자로 보내던 매물 메모를 넣으면 AI가 자동으로 정리합니다.
          </p>
        </div>

        {/* Memo Input */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-bold text-muted-foreground mr-1">👇 예시 눌러서 바로 채우기:</span>
            {[
              {
                label: "💰 임대수익 꼬마빌딩 (당산동 예시)",
                text: "서울 영등포구 당산동5가 11-47 (호산당빌딩), 매매가 115억, 대지 153.3평 / 연면적 307.9평(B1~5F), 보증금 4억 3,000만 / 월세 2,900만 원. 1층 약국 및 1~2층 내과 통합계약 성업 중.",
              },
              {
                label: "🗺️ 다필지 수익형 (양평동 3필지 예시)",
                text: "서울 영등포구 양평동4가 117, 134, 125-2번지 (더레드빌딩), 매매가 250억, 3필지 합산 대지 157평 / 연면적 753.5평(B1~10F), 1층 스타벅스 입점 코너 빌딩.",
              },
              {
                label: "🏢 사옥용 빌딩",
                text: "성수동 6층 사옥 겸 근생 빌딩, 매매가 120억, 1층 카페 입점, 2~6층 명도 가능해 IT·디자인 사옥 즉시 입주 가능.",
              },
              {
                label: "🏗️ 리모델링·신축부지",
                text: "신사동 이면 코너 노후 근생, 매매가 68억, 대지 85평 제2종일반주거지역, 리모델링 또는 신축 개발 추천.",
              },
            ].map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => setMemo(sample.text)}
                className="px-3.5 py-2 rounded-xl border border-border bg-secondary/70 hover:bg-secondary text-[14px] font-bold text-foreground transition-colors"
              >
                {sample.label}
              </button>
            ))}
          </div>
          <Textarea
            id="broker-memo-input"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={3000}
            placeholder={
              "예:\n역삼동 85억 근생 빌딩, 보증금 3억 / 월세 2,800만, 만실 운영 중.\n1층 카페 성업 중, 사옥 수요도 가능.\n(지번 주소를 함께 적으시면 토지·건축물대장을 자동으로 불러옵니다)"
            }
            className="min-h-[240px] text-[17px] leading-relaxed p-4 rounded-2xl"
          />
          <div className="flex flex-wrap justify-between items-center gap-2 pt-1">
            <p className="text-[14px] font-medium text-muted-foreground">
              {memo.length > 0 ? `현재 ${memo.length.toLocaleString()}자 입력됨 (최대 3,000자)` : "💡 최소 5자 이상 입력해 주세요"}
            </p>
            <button
              type="button"
              onClick={() => setShowMemoModal(true)}
              className="text-[14px] text-primary font-bold hover:underline flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 px-3.5 py-2 rounded-xl transition-colors"
              id="btn-import-memo"
            >
              <StickyNote className="w-4 h-4" />
              저장된 메모함에서 불러오기
            </button>
          </div>
        </div>

        {/* Disclosure Notice (한눈에 들어오는 안심 배너) */}
        <div className="rounded-2xl bg-secondary/60 border border-border px-4 py-3.5 flex items-start gap-3">
          <span className="text-xl shrink-0">🔒</span>
          <div className="space-y-0.5">
            <p className="text-[15px] font-bold text-foreground">고객 공유 시 민감 정보는 자동으로 가려집니다</p>
            <p className="text-[14px] text-muted-foreground leading-relaxed">
              정확한 번지 주소 · 임차인 상호 · 호실별 임대료 · 매도자 개인 사정은 외부 딜카드에 노출되지 않습니다.
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 px-4 py-3.5 text-[15px] font-semibold text-destructive whitespace-pre-wrap">
            {error}
          </div>
        )}

        {/* Submit */}
        <Button
          type="submit"
          size="lg"
          className="w-full min-h-[58px] text-[18px] font-extrabold rounded-2xl shadow-md"
          disabled={memo.trim().length < 5}
          id="cta-generate-deal-card"
        >
          ✨ 1분 딜카드 만들기
        </Button>
      </form>

      {/* Memo Import Modal */}
      <MemoImportModal
        isOpen={showMemoModal}
        onClose={() => setShowMemoModal(false)}
        onSelectMemo={(selectedMemo) => {
          setMemo(selectedMemo);
        }}
      />
    </main>
  );
}
