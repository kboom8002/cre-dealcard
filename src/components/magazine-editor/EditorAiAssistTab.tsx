import React, { useState } from 'react';
import { Wand2, Copy, FileInput, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { editorToast } from "./editor-toaster";
import {
  aiCommentResponseSchema,
  AI_COMMENT_MAX_LENGTH,
  AI_COMMENT_WARNING_LABELS,
} from '@/lib/magazine/ai-comment-schema';
import { extractApiErrorMessage, readJsonSafe } from '@/lib/magazine/editor-helpers';

interface EditorAiAssistTabProps {
  /** 생성된(편집된) 문구를 필드노트 '독자에게 한마디'에 적용 */
  onApply?: (text: string) => void;
}

export function EditorAiAssistTab({ onApply }: EditorAiAssistTabProps = {}) {
  const [idea, setIdea] = useState("");
  const [result, setResult] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!idea.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/broker/studio/ai-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: idea }),
      });
      const json = await readJsonSafe(res);
      if (!res.ok) {
        editorToast.error(extractApiErrorMessage(json, "AI 문구 생성에 실패했습니다. 잠시 후 다시 시도해 주세요."));
        return;
      }
      const parsed = aiCommentResponseSchema.safeParse(json);
      if (!parsed.success) {
        editorToast.error("AI 응답 형식이 올바르지 않습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setResult(parsed.data.result.comment);
      setWarnings(parsed.data.warnings ?? []);
    } catch {
      editorToast.error("네트워크 오류로 생성하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    const text = result.trim();
    if (!text || !onApply) return;
    onApply(text);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl space-y-3">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          <h2 className="text-body font-bold text-slate-200">AI 코멘트 비서</h2>
        </div>
        <p className="text-label text-ink-muted">
          짧은 핵심 아이디어나 키워드를 입력하시면 전문가 수준의 매끄러운 화법으로 바꿔드립니다.
        </p>
        <label htmlFor="ai-assist-idea" className="sr-only">AI 코멘트 입력</label>
        <textarea
          id="ai-assist-idea"
          value={idea}
          maxLength={AI_COMMENT_MAX_LENGTH}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="예: 금리 인하 기대감으로 매수 문의가 늘어남. 다만 매도 호가도 같이 올라 거래 성사는 쉽지 않은 상황."
          className="w-full h-24 bg-slate-900 border border-slate-700 text-body text-slate-200 p-3 rounded-lg focus:outline-none focus:border-indigo-500 placeholder:text-ink-subtle"
        />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || !idea.trim()}
          className="w-full min-h-11 py-2.5 bg-indigo-500/20 text-indigo-300 font-bold text-body rounded-lg hover:bg-indigo-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
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
            <span className="text-label font-bold text-indigo-300">AI 추천 화법 (수정 가능)</span>
          </div>
          {warnings.length > 0 && (
            <div role="alert" data-testid="ai-comment-warning" className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
              {warnings.map((w) => (
                <p key={w} className="flex items-start gap-1.5 text-label text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>{AI_COMMENT_WARNING_LABELS[w] ?? w}</span>
                </p>
              ))}
            </div>
          )}
          <label htmlFor="ai-assist-result" className="sr-only">AI 추천 화법</label>
          <textarea
            id="ai-assist-result"
            value={result}
            onChange={(e) => setResult(e.target.value)}
            rows={6}
            className="w-full bg-slate-900/60 border border-slate-700 text-sm text-slate-200 p-3 rounded-lg focus:outline-none focus:border-indigo-500"
          />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(result).then(
                  () => editorToast.success("복사되었습니다"),
                  () => editorToast.error("복사하지 못했습니다. 직접 선택해 복사해 주세요.")
                );
              }}
              className="flex-1 min-h-11 py-2 bg-slate-800 text-slate-300 text-label font-bold rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" aria-hidden="true" /> 복사
            </button>
            {onApply && (
              <button
                type="button"
                onClick={handleApply}
                disabled={!result.trim()}
                className="flex-[2] min-h-11 py-2 bg-indigo-500 text-white text-label font-bold rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <FileInput className="w-3.5 h-3.5" aria-hidden="true" /> 필드노트에 넣기
              </button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
