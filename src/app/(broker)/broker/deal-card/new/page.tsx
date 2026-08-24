"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { ShareToCircleSheet } from "@/components/circle/ShareToCircleSheet";
import { MemoImportModal } from "@/components/broker/deal-card/MemoImportModal";
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
  "권역 및 자산 개요 분석 중",
  "주소·임차인 등 민감정보 마스킹 처리 중",
  "보안형 블라인드 딜카드 생성 중",
  "카카오톡 공유 브리핑 문구 작성 중",
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

    // Timeout safety abort after 120 seconds (2 minutes for AI pipeline execution)
    const timeoutTimer = setTimeout(() => {
      controller.abort();
      setError("생성 시간이 초과되었습니다. AI 분석 작업이 오래 걸리고 있습니다. 네트워크 상태를 확인하거나 잠시 후 내 딜카드 목록에서 생성 결과를 확인해 주세요.");
      setIsLoading(false);
    }, 120000);

    // Progressive loading steps
    const interval = setInterval(() => {
      setLoadingStep((prev) =>
        prev < LOADING_STEPS.length - 1 ? prev + 1 : prev,
      );
    }, 4000);

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
        }),
        signal: controller.signal,
      });

      // 서버 응답이 실패인 경우 안전하게 에러 추출
      let json: any;
      try {
        json = await res.json();
      } catch {
        throw new Error(`서버 오류가 발생했습니다 (HTTP ${res.status}). 잠시 후 다시 시도해주세요.`);
      }

      if (!res.ok || !json.ok) {
        // Quality Gate 실패 시 구체적인 부족 정보 전달 (DC-3)
        if (json.code === "MEMO_QUALITY_INSUFFICIENT" && json.details) {
          const missing = json.details.missingFields || [];
          const fieldLabels: Record<string, string> = {
            location: '📍 위치(지역명, 역명, 주소) — 예: "성수동", "서초대로"',
            asset_type: '🏢 자산 유형(오피스, 빌딩, 상가 등) — 예: "근생 건물"',
            numeric: '💰 가격 또는 면적 수치 — 예: "80억대", "2,500평"',
            deal_type: '📋 거래 유형(매각, 임대 등) — 예: "매매"',
          };
          const missingGuide = missing
            .map((f: string) => fieldLabels[f] || f)
            .join("\n• ");

          const suggestion = json.details.suggestion
            ? `\n\n💡 AI 제안: ${json.details.suggestion}`
            : "";

          throw new Error(
            `메모에 핵심 정보가 부족합니다.\n\n아래 항목 중 부족한 정보를 보완해주세요:\n• ${missingGuide}${suggestion}`,
          );
        }

        // 가드레일 위반 시 상세 안내
        if (json.code === "GUARDRAIL_VIOLATION") {
          throw new Error(
            `안전 가이드라인 위반: ${json.message || "매수자 보호 규정에 위배되는 내용이 포함되어 있습니다."}`,
          );
        }

        // ─── P0: 동일 물건 중복 감지 ───
        if (json.code === "DUPLICATE_BUILDING_DETECTED" && json.duplicates) {
          setDuplicateCandidates(json.duplicates);
          setShowDuplicateDialog(true);
          setIsLoading(false);
          clearTimeout(timeoutTimer);
          clearInterval(interval);
          return; // 에러가 아닌 다이얼로그 표시
        }

        const errMsg = typeof json.error === 'string' ? json.error
          : typeof json.message === 'string' ? json.message
          : json.error ? JSON.stringify(json.error)
          : "딜카드 생성에 실패했습니다.";
        throw new Error(errMsg);
      }

      // Success
      setCreatedBuildingId(json.data.buildingId);

      // Auto-navigation with seamless transition
      const buildingId = json.data.buildingId;
      if (buildingId) {
        sessionStorage.setItem("deal_card_just_created", "true");
        router.push(`/broker/deal-card/${buildingId}`);
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
      setError("생성 시간이 초과되었습니다.");
      setIsLoading(false);
    }, 120000);
    const interval = setInterval(() => {
      setLoadingStep((prev) => prev < LOADING_STEPS.length - 1 ? prev + 1 : prev);
    }, 4000);

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
        throw new Error(`서버 오류가 발생했습니다 (HTTP ${res.status}).`);
      }

      if (!res.ok || !json.ok) {
        const errMsg = typeof json.error === 'string' ? json.error
          : typeof json.message === 'string' ? json.message
          : json.error ? JSON.stringify(json.error)
          : "딜카드 생성에 실패했습니다.";
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
              const matchLabel = candidate.matchType === "pnu" ? "PNU 일치"
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
              블라인드 처리된 딜카드로 안전하게 영업을 시작하세요.
            </p>
          </div>

          <div className="space-y-3 pt-4">
            <Button
              size="lg"
              className="w-full text-base font-semibold"
              onClick={() =>
                router.push(`/broker/deal-card/${createdBuildingId}`)
              }
            >
              딜카드 확인 및 카톡 공유
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full text-base"
              onClick={() => setShowShareSheet(true)}
            >
              🤝 서클에 딜 공유하기
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="w-full text-base text-muted-foreground"
              onClick={() =>
                router.push(`/broker/schedule?building_id=${createdBuildingId}`)
              }
            >
              📅 임장 일정 잡기
            </Button>
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
            className="w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors pt-2"
          >
            📋 내 딜카드 목록 보기
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
    <main className="flex flex-col items-center min-h-screen px-4 py-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md mx-auto space-y-5"
      >
        {/* Top Breadcrumb & Back Navigation */}
        <div className="flex items-center justify-between pb-3 border-b border-border/40">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
              } else {
                router.push("/broker/buildings");
              }
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-secondary/60"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>뒤로 가기</span>
          </button>
          
          <span className="text-xs text-muted-foreground/70 font-medium">
            딜카드 관리 &gt; 새 딜카드 등록
          </span>

          <button
            type="button"
            onClick={() => router.push("/broker/buildings")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-secondary/60"
            title="닫고 목록으로"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Header */}
        <div className="space-y-2 pt-1">
          {handoffSuccess && (
            <div className="mb-4 bg-emerald-50 text-emerald-600 border border-emerald-200 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
              <span>📋</span> 유니버설 메모에서 텍스트가 자동 전달되었습니다.
            </div>
          )}
          <h1 className="text-2xl font-bold">
            카톡 매물 설명을 붙여넣으세요
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            길게 정리하지 않아도 됩니다.
            <br />
            평소 카톡으로 보내던 문장 그대로 넣어주세요.
          </p>
        </div>

        {/* Memo Input */}
        <div className="space-y-2">
          <Textarea
            id="broker-memo-input"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={3000}
            placeholder={
              "예:\n성수동 80억대 근생, 일부 임대 중,\n1층 F&B 가능, 사옥 수요도 볼 수 있음.\n주소는 아직 비공개."
            }
            className="min-h-[220px] text-base"
          />
          <p className="text-xs text-muted-foreground pt-1">
            💡 투자 성격(수익형, 개발형, 운영형 등)은 AI가 메모 내용에서 자동 판별합니다.
          </p>
          <div className="flex justify-between items-center mt-2">
            <p className="text-xs text-muted-foreground">
              {memo.length > 0 ? `${memo.length.toLocaleString()} / 3,000자` : "최소 5자 이상"}
            </p>
            <button
              type="button"
              onClick={() => setShowMemoModal(true)}
              className="text-xs text-primary font-semibold hover:underline flex items-center gap-1 bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-md transition-colors"
              id="btn-import-memo"
            >
              <StickyNote className="w-3.5 h-3.5" />
              메모함에서 불러오기
            </button>
          </div>
        </div>

        {/* Disclosure Notice */}
        <div className="rounded-xl bg-secondary/50 border border-border px-4 py-3 space-y-2">
          <p className="text-xs font-medium">자동으로 숨기는 정보</p>
          <div className="grid grid-cols-1 gap-1">
            {[
              "✅ 정확한 주소",
              "✅ 임차인명",
              "✅ 호실별 임대료",
              "✅ 매도자 사정",
              "✅ 협상 관련 내부 메모",
            ].map((item) => (
              <p key={item} className="text-xs text-muted-foreground">
                {item}
              </p>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive whitespace-pre-wrap">
            {error}
          </div>
        )}

        {/* Submit */}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={memo.trim().length < 5}
          id="cta-generate-deal-card"
        >
          1분 딜카드 만들기
        </Button>

        {/* Microcopy */}
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          정확한 주소, 임차인명, 호실별 임대료, 매도자 사정은
          <br />
          자동으로 숨겨집니다.
        </p>
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
