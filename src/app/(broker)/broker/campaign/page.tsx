"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, Copy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CampaignCopyPage() {
  const router = useRouter();
  const [format, setFormat] = useState("instagram");
  const [audience, setAudience] = useState("");
  const [keyPoints, setKeyPoints] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!keyPoints.trim()) return;
    setLoading(true);
    setResult("");
    
    try {
      const res = await fetch("/api/broker/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          target_audience: audience,
          key_points: keyPoints,
        }),
      });
      const data = await res.json();
      if (data.success && data.result) {
        setResult(data.result);
      } else {
        alert(data.error || "생성에 실패했습니다.");
      }
    } catch (err) {
      console.error(err);
      alert("서버 통신 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="flex flex-col min-h-screen px-4 py-8 pb-24 bg-background">
      <div className="w-full max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-3 mb-6">
          <button
            onClick={() => router.push("/broker")}
            className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-bold">캠페인 카피 AI</h1>
        </div>

        <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">포맷 선택</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "instagram", label: "인스타그램" },
                { id: "blog", label: "블로그" },
                { id: "sms", label: "문자/카톡 발송" },
              ].map((fmt) => (
                <button
                  key={fmt.id}
                  onClick={() => setFormat(fmt.id)}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                    format === fmt.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">타겟 고객군 <span className="text-muted-foreground font-normal">(선택)</span></label>
            <input
              type="text"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="w-full bg-background border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="예: 강남권 사옥을 찾는 IT 기업 대표"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">매물 핵심 강조 포인트 <span className="text-rose-500">*</span></label>
            <textarea
              value={keyPoints}
              onChange={(e) => setKeyPoints(e.target.value)}
              className="w-full bg-background border rounded-lg px-3 py-2.5 text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="예: 성수동 초역세권, 최근 전면 리모델링 완료, 즉시 입주 가능, 전용 100평 대형 오피스"
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!keyPoints.trim() || loading}
            className="w-full h-12 rounded-xl text-base font-semibold gap-2"
          >
            {loading ? (
              <span className="animate-pulse">AI 카피 생성 중...</span>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>매력적인 카피 만들기</span>
              </>
            )}
          </Button>
        </div>

        {/* Result Area */}
        {result && (
          <div className="bg-card border border-primary/20 rounded-2xl p-5 shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-primary flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> AI가 작성한 카피
              </h2>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 bg-muted rounded-md"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "복사완료" : "복사하기"}
              </button>
            </div>
            <div className="bg-muted/50 p-4 rounded-xl text-sm whitespace-pre-wrap leading-relaxed text-foreground border border-border">
              {result}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
