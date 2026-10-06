"use client";

/**
 * PollSection — 이번 주 투표 (E-03 D2-28 · U2-18 · T1-19 · T3-41 · T3-SEC-2)
 *  - 서버가 저장(2xx ok)한 **뒤에만** '접수됨/결과'를 보여 준다 (낙관적 표시 금지)
 *  - 실패 시 마지막 선택으로 다시 시도 버튼
 *  - 결과 막대는 응답 5건 이상일 때만, 중립색 + 퍼센트 텍스트(가치판단 색 없음)
 *  - 선택지가 없으면 섹션 자체를 렌더하지 않는다(기본 설문 하드코딩 없음)
 *  - 'seller' 판정은 option.intent 메타만 사용 (인덱스 하드코딩 금지)
 */
import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { BarChart3, MessageSquare } from "lucide-react";
import { SectionCard } from "@/components/magazine/SectionCard";
import { useViewerTrack } from "@/components/magazine/viewer-track";
import { messageFromResponse, toUserMessage } from "@/lib/magazine/user-message";
import {
  MIN_POLL_RESULTS,
  normalizePoll,
  parseStoredPollChoice,
  pollPercent,
  pollStorageKey,
  shouldShowPollResults,
  type PollResults,
} from "@/lib/magazine/poll-helpers";
import { getOrCreateVisitorId } from "@/lib/magazine/visitor-id";

interface PollSectionProps {
  brokerId: string;
  date: string;
  /** 에디션 `poll` 원본 (정규화는 이 컴포넌트가 한다) */
  poll: unknown;
  preview?: boolean;
  /** 전화 상담 링크(`tel:`) — 없으면 상담 버튼을 숨긴다 */
  telHref?: string | null;
}

const POLL_BAR_COLOR = "#94a3b8"; // 중립색 하나만 (가치판단 색 금지, T3-41)

/** localStorage 는 구독할 변경 이벤트가 없다(저장은 이 컴포넌트만 한다) → 구독 없는 스냅샷 읽기 */
const subscribeNoop = () => () => {};

export function PollSection({ brokerId, date, poll, preview = false, telHref }: PollSectionProps) {
  const onTrack = useViewerTrack(); // 분석 trackClick/trackInteraction (preview 에서는 no-op)
  const view = normalizePoll(poll);
  const optionCount = view?.options.length ?? 0;

  // -1 = 이미 응답(선택지 알 수 없음). 저장된 선택은 localStorage 스냅샷(restoredIdx)에서, 방금 한 선택은 로컬 state 에서 온다.
  const [localVoted, setLocalVoted] = useState<number | null>(null);
  const [localAlready, setLocalAlready] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<number | null>(null); // 실패한 마지막 선택 (재시도용)
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PollResults | null>(null);

  // 이전에 서버가 접수한 투표만 localStorage 에 기록되므로 복원해도 안전.
  // 서버 스냅샷은 null → hydration 불일치 없이 클라이언트에서 복원값으로 재렌더된다.
  const storedRaw = useSyncExternalStore(
    subscribeNoop,
    () => {
      if (preview || optionCount === 0) return null;
      try { return localStorage.getItem(pollStorageKey(brokerId, date)); } catch { return null; /* 저장소 접근 불가 */ }
    },
    () => null,
  );
  const restoredIdx = optionCount > 0 ? parseStoredPollChoice(storedRaw, optionCount) : null;
  const voted = localVoted ?? restoredIdx;
  const already = localAlready ?? restoredIdx === -1;

  // 복원된 투표가 있으면 결과만 조회한다 (외부 시스템 fetch — setState 는 비동기 콜백에서만)
  useEffect(() => {
    if (preview || restoredIdx === null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/public/magazine/poll?brokerId=${encodeURIComponent(brokerId)}&editionDate=${encodeURIComponent(date)}`,
        );
        if (!res.ok) return; // 결과 조회 실패는 표시 생략 (가짜 값 없음)
        const json = await res.json();
        if (!cancelled && json?.ok && shouldShowPollResults(json.results)) setResults(json.results);
      } catch { /* 결과 조회 실패는 표시 생략 */ }
    })();
    return () => { cancelled = true; };
  }, [brokerId, date, preview, restoredIdx]);

  const vote = useCallback(async (choiceIdx: number) => {
    if (preview || submitting) return;
    setSubmitting(true);
    setError(null);
    setPending(choiceIdx);
    try {
      const res = await fetch("/api/public/magazine/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brokerId, editionDate: date, choice: choiceIdx, visitorId: getOrCreateVisitorId() }),
      });
      if (!res.ok) {
        // 서버 확인 실패: 잠그지 않고 재시도 가능 상태 유지
        setError(await messageFromResponse(res));
        return;
      }
      let json: { ok?: boolean; alreadyVoted?: boolean; results?: PollResults | null } | null = null;
      try { json = await res.json(); } catch { /* 본문 없음 */ }
      if (!json?.ok) {
        setError("응답을 접수하지 못했습니다. 다시 시도해 주세요.");
        return;
      }
      const stored = json.alreadyVoted ? -1 : choiceIdx;
      setLocalVoted(stored);
      setLocalAlready(!!json.alreadyVoted);
      setPending(null);
      if (shouldShowPollResults(json.results)) setResults(json.results);
      try { localStorage.setItem(pollStorageKey(brokerId, date), String(stored)); } catch { /* 저장소 접근 불가 */ }
      onTrack?.("poll_vote", { choice: choiceIdx });
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [brokerId, date, preview, submitting, onTrack]);

  if (!view) return null;

  const hasVoted = voted !== null;
  const selectedIntent = voted !== null && voted >= 0 ? view.options[voted]?.intent : null;
  const showResults = shouldShowPollResults(results);

  return (
    <SectionCard
      title="📊 이번 주 투표"
      icon={<BarChart3 className="h-4 w-4 text-violet-300" aria-hidden="true" />}
      defaultOpen
    >
      <div className="space-y-3">
        <p className="text-reader font-bold leading-snug text-white" id={`poll-q-${brokerId}`}>{view.question}</p>
        <div role="group" aria-labelledby={`poll-q-${brokerId}`} className="space-y-2">
          {view.options.map((opt, idx) => {
            const isSelected = voted === idx;
            const pct = pollPercent(results, idx);
            return (
              <button
                type="button"
                key={idx}
                onClick={() => vote(idx)}
                disabled={hasVoted || submitting || preview}
                aria-pressed={isSelected}
                className={`relative min-h-11 w-full overflow-hidden rounded-xl border p-3 text-left transition-colors ${
                  hasVoted
                    ? isSelected
                      ? "border-white/40 bg-white/[0.08]"
                      : "border-white/10 bg-white/[0.02]"
                    : "cursor-pointer border-white/15 bg-white/[0.04] hover:border-white/30 hover:bg-white/[0.08] active:scale-[0.98]"
                }`}
              >
                {hasVoted && pct !== null && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 rounded-xl opacity-20 transition-all duration-700 motion-reduce:transition-none"
                    style={{ width: `${pct}%`, background: POLL_BAR_COLOR }}
                  />
                )}
                <div className="relative flex items-center justify-between gap-2">
                  <span className="text-body font-medium text-slate-100">
                    {opt.label}
                    {isSelected && <span className="ml-2 text-caption font-bold text-emerald-200">✓ 내 선택</span>}
                  </span>
                  {hasVoted && pct !== null && <span className="text-body font-bold text-slate-100">{pct}%</span>}
                </div>
              </button>
            );
          })}
        </div>

        {error && (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-400/40 bg-rose-950/30 p-3">
            <p className="flex-1 text-caption text-rose-200">{error}</p>
            {pending !== null && (
              <button
                type="button"
                onClick={() => vote(pending)}
                disabled={submitting}
                className="min-h-11 rounded-lg bg-rose-600 px-4 text-label font-bold text-white hover:bg-rose-500 disabled:opacity-60"
              >
                {submitting ? "다시 보내는 중…" : "다시 시도"}
              </button>
            )}
          </div>
        )}

        {hasVoted && (
          <div className="space-y-2 border-t border-white/10 pt-3 text-center">
            <p role="status" className="text-caption text-ink-muted">
              {already ? "이미 응답하셨습니다." : "응답이 접수되었습니다."}
              {showResults
                ? ` 총 ${results.total}명이 참여했습니다.`
                : ` 결과는 응답이 ${MIN_POLL_RESULTS}건 이상 모이면 공개됩니다.`}
            </p>
            {telHref && (
              <a
                href={telHref}
                onClick={() => onTrack?.("poll_consult", { intent: selectedIntent ?? undefined })}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/25 px-4 text-label font-bold text-white hover:bg-white/10"
              >
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                {selectedIntent === "seller" ? "매도 상담 문의하기" : "이 주제로 상담하기"}
              </a>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
