"use client";

import { useState } from "react";
import { Plus, Mic, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceRecorder } from "./VoiceRecorder";
import { MemoResultSheet } from "./MemoResultSheet";
import { MemoRouterOutput } from "@/ai/agents/memo-router-agent";

export function UniversalMemoFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"select" | "text" | "voice" | "result">("select");
  const [textMemo, setTextMemo] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<MemoRouterOutput | null>(null);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setTimeout(() => {
        setMode("select");
        setTextMemo("");
        setResult(null);
      }, 300);
    }
  };

  const submitMemo = async (memo: string) => {
    if (!memo.trim()) return;
    
    setIsProcessing(true);
    try {
      const res = await fetch("/api/broker/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo }),
      });
      const json = await res.json();
      
      if (!json.ok) throw new Error(json.error);
      
      setResult(json.data.routing);
      setTextMemo(memo);
      setMode("result");
    } catch (err) {
      alert("오류 발생: 메모 처리 중 문제가 발생했습니다.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          size="icon"
          className="h-14 w-14 rounded-full shadow-xl bg-primary hover:bg-primary/90 hover:scale-105 transition-all duration-300 group"
          onClick={() => handleOpenChange(true)}
        >
          <Plus className="h-6 w-6 text-primary-foreground group-hover:rotate-90 transition-transform duration-300" />
        </Button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60" 
            onClick={() => handleOpenChange(false)}
          />
          
          {/* Content */}
          <div className="relative bg-background rounded-t-2xl px-4 py-6 shadow-2xl h-[85vh] overflow-y-auto">
            <div className="mx-auto w-12 h-1.5 rounded-full bg-muted mb-6" />
            <div className="text-center mb-6">
              <h2 className="text-lg font-semibold">
                {mode === "select" && "어떤 정보를 기록할까요?"}
                {mode === "text" && "메모 작성"}
                {mode === "voice" && "음성 메모"}
                {mode === "result" && "분석 결과"}
              </h2>
            </div>

            <div className="space-y-6">
              {mode === "select" && (
                <div className="grid grid-cols-2 gap-4 mt-6">
                  <Button
                    variant="outline"
                    className="h-32 flex-col gap-4 hover:border-primary/50 hover:bg-primary/5 transition-all"
                    onClick={() => setMode("voice")}
                  >
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Mic className="h-6 w-6 text-primary" />
                    </div>
                    <span className="font-medium text-base">음성으로 말하기</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-32 flex-col gap-4 hover:border-primary/50 hover:bg-primary/5 transition-all"
                    onClick={() => setMode("text")}
                  >
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Keyboard className="h-6 w-6 text-primary" />
                    </div>
                    <span className="font-medium text-base">텍스트로 치기</span>
                  </Button>
                </div>
              )}

              {mode === "voice" && (
                <div className="py-8">
                  <VoiceRecorder 
                    onTranscriptionComplete={submitMemo} 
                    onError={(err) => alert(err)} 
                  />
                </div>
              )}

              {mode === "text" && (
                <div className="space-y-4">
                  <Textarea
                    value={textMemo}
                    onChange={(e) => setTextMemo(e.target.value)}
                    placeholder="건물 정보, 임차인 동향, 고객 요구사항 등 무엇이든 적어주세요."
                    className="min-h-[200px] text-base resize-none border-primary/20 focus-visible:ring-primary/30"
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 h-12 text-base"
                      onClick={() => setMode("select")}
                    >
                      이전
                    </Button>
                    <Button
                      className="flex-1 h-12 text-base"
                      onClick={() => submitMemo(textMemo)}
                      disabled={!textMemo.trim() || isProcessing}
                    >
                      {isProcessing ? "분석 중..." : "기록 완료"}
                    </Button>
                  </div>
                </div>
              )}

              {mode === "result" && result && (
                <MemoResultSheet
                  result={result}
                  originalText={textMemo}
                  onClose={() => handleOpenChange(false)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
