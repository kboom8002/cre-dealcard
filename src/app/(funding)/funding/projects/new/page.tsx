"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewFundingProjectPage() {
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!memo.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/funding/project/from-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo }),
      });

      if (!res.ok) throw new Error("AI 분석 중 오류가 발생했습니다.");
      const json = await res.json();
      if (json.ok) {
        setResult(json.data);
      } else {
        throw new Error(json.error || "분석 결과 구조화 실패");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 bg-background">
      <div className="w-full max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">🪙 신규 크라우드펀딩 / STO 등록</h1>
            <p className="text-sm text-muted-foreground">
              비구조화된 프로젝트 개요 메모를 바탕으로 AI가 투자설명서 및 마케팅 티저를 초정밀 파싱합니다.
            </p>
          </div>
          <Link href="/funding/marketplace" className="text-sm font-semibold text-primary hover:underline">
            마켓플레이스 이동
          </Link>
        </div>

        {/* Input Memo */}
        {!result && (
          <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="memo" className="text-sm font-semibold text-foreground">
                프로젝트 메모 / 개요 입력
              </label>
              <textarea
                id="memo"
                rows={8}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="예: 서울 강남권 근생건물 빌딩 토큰증권 상품입니다. 총 공모 금액은 20억원이며, 최소 투자금은 100만원입니다. 예상 연 수익률은 8.5% 수준이며 투자 기간은 24개월입니다. 강남 테헤란로 핵심 입지로 우량 임차인이 입주해 있어 공실 위험이 낮고 안정적인 임대 배당형 STO 구조입니다. 자본시장법 샌드박스 규제 승인이 완료되었습니다."
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:border-primary"
                required
              />
            </div>

            {error && <p className="text-sm text-destructive font-semibold">⚠️ {error}</p>}

            <button
              type="submit"
              disabled={loading || !memo.trim()}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg text-sm font-bold shadow-md hover:bg-primary/95 transition-all disabled:opacity-50"
            >
              {loading ? "AI 분석 엔진 가동 중..." : "🚀 AI 투자설명서 & 티저 생성"}
            </button>
          </form>
        )}

        {/* AI Structuring Results */}
        {result && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
            <div className="rounded-xl border border-border bg-card p-6 space-y-6">
              <div className="flex justify-between items-center border-b border-border pb-4">
                <h2 className="text-lg font-bold text-foreground">🎉 AI 파싱 & 티저 생성 완료</h2>
                <button
                  onClick={() => router.push(`/funding/projects/${result.project.id}`)}
                  className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/95 transition-all"
                >
                  프로젝트 대시보드 이동
                </button>
              </div>

              {/* Parsed Facts */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">📊 구조화 정보 (SSoT)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-secondary/40 p-3 rounded-lg text-center">
                    <p className="text-[10px] text-muted-foreground font-semibold">프로젝트명</p>
                    <p className="text-sm font-bold text-foreground truncate">{result.project.project_name}</p>
                  </div>
                  <div className="bg-secondary/40 p-3 rounded-lg text-center">
                    <p className="text-[10px] text-muted-foreground font-semibold">예상 수익률</p>
                    <p className="text-sm font-bold text-primary">{result.project.expected_return_pct}%</p>
                  </div>
                  <div className="bg-secondary/40 p-3 rounded-lg text-center">
                    <p className="text-[10px] text-muted-foreground font-semibold">공모 금액</p>
                    <p className="text-sm font-bold text-foreground">
                      {(result.project.target_amount / 10000).toLocaleString()}만원
                    </p>
                  </div>
                  <div className="bg-secondary/40 p-3 rounded-lg text-center">
                    <p className="text-[10px] text-muted-foreground font-semibold">자산 종류</p>
                    <p className="text-sm font-bold text-foreground uppercase">{result.project.asset_type}</p>
                  </div>
                </div>
              </div>

              {/* Marketing Teaser */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">🔍 공개 배포용 투자 블라인드 티저</h3>
                <div className="rounded-lg border border-border bg-background p-5 space-y-4">
                  <p className="text-base font-bold text-primary">{result.aiResult.blindTeaser.title}</p>
                  <p className="text-sm text-foreground leading-relaxed">{result.aiResult.blindTeaser.shortSummary}</p>

                  <div className="space-y-2">
                    <p className="text-xs font-bold text-muted-foreground">✨ 투자 강점</p>
                    <ul className="list-disc list-inside text-xs text-foreground space-y-1 pl-1">
                      {result.aiResult.blindTeaser.dealPoints.map((pt: string, idx: number) => (
                        <li key={idx}>{pt}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-bold text-muted-foreground">⚠️ 주의 사항</p>
                    <ul className="list-disc list-inside text-xs text-rose-500 space-y-1 pl-1">
                      {result.aiResult.blindTeaser.cautionPoints.map((pt: string, idx: number) => (
                        <li key={idx}>{pt}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="text-[11px] text-muted-foreground bg-secondary/30 p-3 rounded leading-relaxed">
                    ℹ️ {result.aiResult.blindTeaser.boundaryNote}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
