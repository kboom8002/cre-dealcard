import React, { useState } from 'react';
import { Wand2, Copy, Check, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

export function EditorAiAssistTab() {
  const [idea, setIdea] = useState("");
  const [result, setResult] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!idea.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/broker/studio/ai-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: idea }),
      });
      if (!res.ok) throw new Error("Failed to generate");
      const json = await res.json();
      setResult(json.result);
    } catch (e) {
      alert("생성 실패");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl space-y-3">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-bold text-slate-200">AI 코멘트 비서</h2>
        </div>
        <p className="text-xs text-slate-400">
          짧은 핵심 아이디어나 키워드를 입력하시면 전문가 수준의 매끄러운 화법으로 바꿔드립니다.
        </p>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="예: 금리 인하 기대감으로 매수 문의가 늘어남. 다만 매도 호가도 같이 올라 거래 성사는 쉽지 않은 상황."
          className="w-full h-24 bg-slate-900 border border-slate-700 text-sm text-slate-200 p-3 rounded-lg focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !idea.trim()}
          className="w-full py-2.5 bg-indigo-500/20 text-indigo-300 font-bold text-sm rounded-lg hover:bg-indigo-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {isGenerating ? "생성 중..." : "✨ AI 말투 생성하기"}
        </button>
      </div>

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-xl space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-indigo-400">AI 추천 화법</span>
          </div>
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{result}</p>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(result);
                alert("복사되었습니다");
              }}
              className="flex-1 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" /> 복사
            </button>
            {/* Note: In Phase 6 when we decouple entirely, we'll pass onApply callbacks instead of using global state or clipboard, but for now this is a standalone tab */}
          </div>
        </motion.div>
      )}
    </div>
  );
}
