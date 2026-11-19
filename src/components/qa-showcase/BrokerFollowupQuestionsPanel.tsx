/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BROKER_FOLLOWUP_QUESTIONS_14,
  QA_BROKER_FOLLOWUP_SESSION_ID,
  QA_BROKER_FOLLOWUP_WORKBENCH_ID,
  buildBrokerQuestionsSummaryText,
  isQuestionAnswered,
  normalizeQuestionRecordForSave,
  resolveQuestionVisualUrl,
  type BrokerFollowupQuestionSpec,
  type BrokerQuestionAnswerRecord,
} from "@/lib/qa/broker-followup-questions";
import type { ShowcaseManifest } from "@/lib/qa/output-showcase-scenarios";
import {
  appendQaParamsToHref,
  buildQaAuthHeaders,
  type QaPortalRole,
} from "@/lib/qa/qa-client-auth";
import { COPY_FAILED_MESSAGE, copyText } from "@/lib/ux/clipboard";

const LOCAL_STORAGE_KEY = "cre_broker_followup_questions_v1";

type QuestionFilterMode = "all" | "confirm" | "additional" | "unanswered";

interface PersistedQuestionsLocalState {
  records: Record<string, BrokerQuestionAnswerRecord>;
  responderName: string;
  overallComment: string;
}

export interface BrokerFollowupQuestionsPanelProps {
  manifest: ShowcaseManifest | null;
  portalRole: QaPortalRole;
  onJumpToScenario?: (scenarioId: string) => void;
}

function readInitialLocalState(): PersistedQuestionsLocalState {
  const fallback: PersistedQuestionsLocalState = {
    records: {},
    responderName: "감수 중개인",
    overallComment: "",
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedQuestionsLocalState>;
    return {
      records:
        parsed && parsed.records && typeof parsed.records === "object"
          ? parsed.records
          : {},
      responderName:
        typeof parsed?.responderName === "string" && parsed.responderName.trim()
          ? parsed.responderName
          : "감수 중개인",
      overallComment:
        typeof parsed?.overallComment === "string" ? parsed.overallComment : "",
    };
  } catch {
    return fallback;
  }
}

export function BrokerFollowupQuestionsPanel({
  manifest,
  portalRole,
  onJumpToScenario,
}: BrokerFollowupQuestionsPanelProps) {
  const [records, setRecords] = useState<
    Record<string, BrokerQuestionAnswerRecord>
  >(() => readInitialLocalState().records);
  const [responderName, setResponderName] = useState<string>(
    () => readInitialLocalState().responderName
  );
  const [overallComment, setOverallComment] = useState<string>(
    () => readInitialLocalState().overallComment
  );
  const [filterMode, setFilterMode] = useState<QuestionFilterMode>("all");
  const [syncBanner, setSyncBanner] = useState<string>(
    "보기를 누르시거나 의견을 적으시면 서버에 즉시 자동 저장됩니다."
  );
  const [syncError, setSyncError] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitDoneMessage, setSubmitDoneMessage] = useState<string>("");
  const [failedVisualIds, setFailedVisualIds] = useState<Record<string, boolean>>(
    {}
  );
  const [lightboxState, setLightboxState] = useState<{
    src: string;
    caption: string;
  } | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify({
          records,
          responderName,
          overallComment,
        })
      );
    } catch {
      // ignore storage quota errors
    }
  }, [records, responderName, overallComment]);

  useEffect(() => {
    let cancelled = false;
    async function loadServerAnswers() {
      try {
        const res = await fetch(
          `/api/public/qa-workbench?sessionId=${encodeURIComponent(
            QA_BROKER_FOLLOWUP_SESSION_ID
          )}`,
          {
            cache: "no-store",
            headers: buildQaAuthHeaders(portalRole),
          }
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          ok?: boolean;
          found?: boolean;
          session?: {
            testerName?: string;
            overallComment?: string;
            records?: Record<string, BrokerQuestionAnswerRecord>;
          } | null;
        };
        if (cancelled || !json?.ok || !json.found || !json.session) return;
        if (
          json.session.records &&
          typeof json.session.records === "object" &&
          Object.keys(json.session.records).length > 0
        ) {
          setRecords((prev) => ({
            ...prev,
            ...json.session!.records,
          }));
        }
        if (json.session.testerName?.trim()) {
          setResponderName(json.session.testerName.trim());
        }
        if (typeof json.session.overallComment === "string" && json.session.overallComment) {
          setOverallComment(json.session.overallComment);
        }
      } catch {
        // offline/local fallback remains active
      }
    }
    void loadServerAnswers();
    return () => {
      cancelled = true;
    };
  }, [portalRole]);

  useEffect(() => {
    if (!lightboxState) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxState(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxState]);

  const answeredCount = useMemo(
    () =>
      BROKER_FOLLOWUP_QUESTIONS_14.filter((q) =>
        isQuestionAnswered(q, records[q.id])
      ).length,
    [records]
  );

  const unansweredCount = BROKER_FOLLOWUP_QUESTIONS_14.length - answeredCount;

  const persistToServer = useCallback(
    async (
      nextRecords: Record<string, BrokerQuestionAnswerRecord>,
      mode: "sync" | "submit",
      nextName = responderName,
      nextOverall = overallComment
    ) => {
      const normalizedPayloadRecords: Record<string, BrokerQuestionAnswerRecord> =
        {};
      for (const q of BROKER_FOLLOWUP_QUESTIONS_14) {
        const draft = nextRecords[q.id];
        if (!draft) continue;
        const normalized = normalizeQuestionRecordForSave(q, draft);
        if (normalized.status === "PASS") {
          normalizedPayloadRecords[q.id] = normalized;
        }
      }

      if (mode === "submit") {
        setSubmitting(true);
        setSubmitDoneMessage("");
      }
      setSyncError(false);
      setSyncBanner(
        mode === "submit" ? "서버에 최종 제출하는 중입니다..." : "서버 자동 저장 중..."
      );

      try {
        const res = await fetch("/api/public/qa-workbench", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...buildQaAuthHeaders(portalRole),
          },
          body: JSON.stringify({
            mode,
            workbenchId: QA_BROKER_FOLLOWUP_WORKBENCH_ID,
            sessionId: QA_BROKER_FOLLOWUP_SESSION_ID,
            testerName: nextName.trim() || "감수 중개인",
            testerOrg: "중개인 질문지",
            overallComment: nextOverall.trim(),
            records: normalizedPayloadRecords,
          }),
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          summary?: { completedCount?: number; verdictLabel?: string };
        } | null;

        if (!res.ok || !json?.ok) {
          setSyncError(true);
          setSyncBanner(
            json?.error ||
              "브라우저에 임시 저장되었습니다. 상단 감수 키 연결을 확인해 주세요."
          );
          return;
        }

        const done =
          json.summary?.completedCount ??
          Object.keys(normalizedPayloadRecords).length;
        if (mode === "submit") {
          const msg = `✅ 서버 최종 제출 완료 (${done} / ${BROKER_FOLLOWUP_QUESTIONS_14.length} 문항 저장됨)`;
          setSyncBanner(msg);
          setSubmitDoneMessage(msg);
        } else {
          setSyncBanner(
            `✓ 서버 자동 저장됨 (${done} / ${BROKER_FOLLOWUP_QUESTIONS_14.length} 완료)`
          );
        }
      } catch {
        setSyncError(true);
        setSyncBanner("네트워크 오프라인 · 브라우저에 안전하게 임시 저장되었습니다.");
      } finally {
        if (mode === "submit") {
          setSubmitting(false);
        }
      }
    },
    [overallComment, portalRole, responderName]
  );

  const handleSelectOption = useCallback(
    (
      question: BrokerFollowupQuestionSpec,
      subQuestionId: string,
      optionId: string
    ) => {
      const prevRec = records[question.id] ?? { answers: {}, note: "" };
      const prevAnswers = prevRec.answers ?? {};
      const nextChoice = prevAnswers[subQuestionId] === optionId ? "" : optionId;
      const nextQuestionRec = normalizeQuestionRecordForSave(question, {
        ...prevRec,
        answers: {
          ...prevAnswers,
          [subQuestionId]: nextChoice,
        },
      });
      const nextAll = {
        ...records,
        [question.id]: nextQuestionRec,
      };
      setRecords(nextAll);
      void persistToServer(nextAll, "sync");
    },
    [persistToServer, records]
  );

  const handleNoteChange = useCallback(
    (questionId: string, value: string) => {
      setRecords((prev) => ({
        ...prev,
        [questionId]: {
          ...(prev[questionId] ?? { answers: {} }),
          note: value,
        },
      }));
    },
    []
  );

  const handleSaveQuestionNote = useCallback(
    (question: BrokerFollowupQuestionSpec) => {
      const current = records[question.id] ?? { answers: {}, note: "" };
      const normalized = normalizeQuestionRecordForSave(question, current);
      const nextAll = {
        ...records,
        [question.id]: normalized,
      };
      setRecords(nextAll);
      void persistToServer(nextAll, "sync");
    },
    [persistToServer, records]
  );

  const handleCopySummary = useCallback(async () => {
    const summaryText = buildBrokerQuestionsSummaryText(
      BROKER_FOLLOWUP_QUESTIONS_14,
      records,
      responderName,
      overallComment
    );
    const ok = await copyText(summaryText);
    if (ok) {
      setSyncError(false);
      setSyncBanner("📋 작성하신 답변 요약이 클립보드에 복사되었습니다.");
    } else {
      setSyncError(true);
      setSyncBanner(COPY_FAILED_MESSAGE);
    }
  }, [overallComment, records, responderName]);

  const standaloneHtmlHref = useMemo(() => {
    const base =
      portalRole === "broker"
        ? "/qa-showcase/questions?from=broker"
        : "/qa-showcase/questions";
    return appendQaParamsToHref(base, portalRole);
  }, [portalRole]);

  const visibleQuestions = useMemo(() => {
    return BROKER_FOLLOWUP_QUESTIONS_14.filter((q) => {
      if (filterMode === "confirm") return q.section === "confirm";
      if (filterMode === "additional") return q.section === "additional";
      if (filterMode === "unanswered") {
        return !isQuestionAnswered(q, records[q.id]);
      }
      return true;
    });
  }, [filterMode, records]);

  const confirmQuestions = visibleQuestions.filter(
    (q) => q.section === "confirm"
  );
  const additionalQuestions = visibleQuestions.filter(
    (q) => q.section === "additional"
  );

  const renderQuestionCard = (question: BrokerFollowupQuestionSpec) => {
    const rec = records[question.id];
    const done = isQuestionAnswered(question, rec);

    return (
      <article
        key={question.id}
        data-testid={`broker-question-card-${question.id}`}
        className={`rounded-2xl border bg-white p-4 sm:p-6 space-y-4 transition-shadow ${
          done
            ? "border-emerald-500 ring-2 ring-emerald-500/15"
            : "border-slate-300"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-lg px-3 py-1 text-[14px] font-extrabold text-white ${
                question.section === "confirm"
                  ? "bg-indigo-800"
                  : "bg-teal-700"
              }`}
            >
              {question.numberLabel}
            </span>
            <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-[14px] font-bold text-slate-800">
              {question.categoryTag}
            </span>
            <span
              data-testid={`broker-question-status-${question.id}`}
              className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[13px] font-extrabold ${
                done
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : "border-slate-300 bg-slate-50 text-slate-600"
              }`}
            >
              {done ? "✓ 응답 완료" : "미응답"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {question.relatedScenarioIds.map((sid) =>
              onJumpToScenario ? (
                <button
                  key={sid}
                  type="button"
                  data-testid={`broker-question-jump-${question.id}-${sid}`}
                  onClick={() => onJumpToScenario(sid)}
                  className="min-h-[38px] rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 text-[13px] font-extrabold text-indigo-900 cursor-pointer"
                >
                  {sid} 실화면 보기 →
                </button>
              ) : null
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-snug">
            {question.title}
          </h3>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[15px] text-amber-950">
            <span className="font-extrabold">💬 {question.brokerQuoteTitle}: </span>
            <span>{question.brokerQuoteText}</span>
          </div>
          <p className="text-[15px] sm:text-[16px] font-semibold text-slate-800 leading-relaxed">
            {question.summaryQuestion}
          </p>
        </div>

        {/* 대상 이미지 대조 영역 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {question.visuals.map((visual) => {
            const resolvedUrl = failedVisualIds[visual.id]
              ? visual.fallbackSvgDataUri
              : resolveQuestionVisualUrl(visual, manifest);

            return (
              <figure
                key={visual.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center rounded-md bg-slate-900 px-2.5 py-0.5 text-[13px] font-extrabold text-white">
                    {visual.badgeLabel}
                  </span>
                  <span className="text-[13px] font-bold text-slate-600">
                    🔍 클릭하면 크게 보기
                  </span>
                </div>
                <button
                  type="button"
                  data-testid={`broker-question-zoom-${visual.id}`}
                  onClick={() =>
                    setLightboxState({
                      src: resolvedUrl,
                      caption: visual.caption,
                    })
                  }
                  className="group block w-full overflow-hidden rounded-lg border border-slate-300 bg-white cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <img
                    data-testid={`broker-question-img-${visual.id}`}
                    src={resolvedUrl}
                    alt={visual.caption}
                    onError={() =>
                      setFailedVisualIds((prev) =>
                        prev[visual.id] ? prev : { ...prev, [visual.id]: true }
                      )
                    }
                    className="block w-full aspect-[16/9] object-contain bg-white transition-transform group-hover:scale-[1.01]"
                  />
                </button>
                <figcaption className="text-[14px] font-bold text-slate-700 leading-snug">
                  {visual.caption}
                </figcaption>
              </figure>
            );
          })}
        </div>

        {/* 선택지 버튼 그룹 */}
        <div className="space-y-3">
          {question.subQuestions.map((sq) => {
            const selectedOptionId = rec?.answers?.[sq.id] || "";
            return (
              <div
                key={sq.id}
                className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2.5"
              >
                <p className="text-[15px] sm:text-[16px] font-extrabold text-slate-900">
                  {sq.prompt}
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {sq.options.map((opt) => {
                    const isSelected = selectedOptionId === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        data-testid={`broker-question-opt-${sq.id}-${opt.id}`}
                        aria-pressed={isSelected}
                        onClick={() =>
                          handleSelectOption(question, sq.id, opt.id)
                        }
                        className={`min-h-[48px] w-full rounded-xl border-2 px-3.5 py-2.5 text-left flex items-center gap-2.5 transition-colors cursor-pointer ${
                          isSelected
                            ? "border-emerald-600 bg-emerald-50 text-emerald-950"
                            : "border-slate-300 bg-white text-slate-900 hover:border-indigo-400 hover:bg-slate-50"
                        }`}
                      >
                        <span
                          className={`shrink-0 rounded-lg px-2.5 py-1 text-[13px] font-extrabold ${
                            isSelected
                              ? "bg-emerald-600 text-white"
                              : opt.recommended
                              ? "bg-indigo-100 text-indigo-900"
                              : "bg-slate-200 text-slate-800"
                          }`}
                        >
                          {opt.badge}
                        </span>
                        <span className="text-[15px] font-bold leading-snug">
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* 자유 메모 */}
        <div className="space-y-1.5 pt-1">
          <label
            htmlFor={`question-note-${question.id}`}
            className="block text-[14px] font-extrabold text-slate-800"
          >
            ✏️ 추가 의견 / 직접 문구 지정 (선택)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <textarea
              id={`question-note-${question.id}`}
              data-testid={`broker-question-note-${question.id}`}
              value={rec?.note ?? ""}
              onChange={(e) => handleNoteChange(question.id, e.target.value)}
              onBlur={() => handleSaveQuestionNote(question)}
              rows={2}
              placeholder={question.notePlaceholder}
              className="flex-1 min-h-[64px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900"
            />
            <button
              type="button"
              data-testid={`broker-question-note-save-${question.id}`}
              onClick={() => handleSaveQuestionNote(question)}
              className="min-h-[44px] shrink-0 rounded-xl border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 px-4 text-[14px] font-extrabold text-indigo-900 cursor-pointer"
            >
              의견 저장
            </button>
          </div>
        </div>
      </article>
    );
  };

  return (
    <section
      data-testid="broker-followup-questions-panel"
      aria-label="중개인 확인 질문 및 추가 질문지"
      className="space-y-5"
    >
      {/* 상단 고정 요약 & 필터 바 */}
      <div className="sticky top-2 z-20 rounded-2xl border border-indigo-200 bg-white/95 backdrop-blur px-4 py-3.5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="broker-questions-progress-badge"
              className="inline-flex items-center min-h-[44px] rounded-xl border border-indigo-300 bg-indigo-50 px-3.5 text-[15px] font-extrabold text-indigo-950"
            >
              응답 현황: {answeredCount} / {BROKER_FOLLOWUP_QUESTIONS_14.length} 완료
            </span>
            <a
              href={standaloneHtmlHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="broker-questions-open-html-link"
              className="inline-flex items-center min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3.5 text-[14px] font-extrabold text-slate-900"
            >
              📄 단독 HTML 창으로 열기 ↗
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="broker-questions-copy-btn"
              onClick={() => void handleCopySummary()}
              className="min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3.5 text-[14px] font-extrabold text-slate-900 cursor-pointer"
            >
              📋 응답 요약 복사
            </button>
            <button
              type="button"
              data-testid="broker-questions-submit-btn"
              disabled={submitting}
              onClick={() => void persistToServer(records, "submit")}
              className="min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 px-4 text-[15px] font-extrabold text-white cursor-pointer"
            >
              {submitting ? "제출 중..." : "🚀 답변 서버 최종 제출"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="group"
            aria-label="질문 분류 필터"
            className="flex flex-wrap items-center gap-1.5"
          >
            {(
              [
                { id: "all", label: "전체 보기 (14)" },
                { id: "confirm", label: "확인 질문 (8)" },
                { id: "additional", label: "추가 질문 (6)" },
                { id: "unanswered", label: `미응답만 (${unansweredCount})` },
              ] as const
            ).map((f) => {
              const active = filterMode === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  data-testid={`broker-questions-filter-${f.id}`}
                  aria-pressed={active}
                  onClick={() => setFilterMode(f.id)}
                  className={`min-h-[38px] rounded-xl border px-3 text-[14px] font-extrabold cursor-pointer ${
                    active
                      ? "border-indigo-700 bg-indigo-700 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <span
            data-testid="broker-questions-sync-status"
            className={`text-[14px] font-extrabold ${
              syncError ? "text-rose-700" : "text-emerald-800"
            }`}
          >
            {syncBanner}
          </span>
        </div>
      </div>

      {/* 안내 배너 */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-1.5">
        <p className="text-[16px] font-extrabold text-emerald-950">
          ✅ 1차 감수 의견 중 명확한 항목(AI 문구·배지 제거, 구독자 신청창 숨김, IM 3p 하이라이트 박스 삭제, 7p 막대 간격 교정, 9p 출처·대형 면책 정리 등)은 즉시 수정 반영했습니다.
        </p>
        <p className="text-[15px] text-emerald-900">
          아래 <strong>확인 질문 8문항</strong>과 <strong>추가 질문 6문항</strong>은 각 대상 이미지를 확인하시며 원하시는 보기를 눌러 주시면 서버에 즉시 저장됩니다.
        </p>
      </div>

      {/* 5.1 확인 질문 8문항 */}
      {confirmQuestions.length > 0 ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-900 px-5 py-4 text-white">
            <h2 className="text-lg sm:text-xl font-extrabold">
              5.1 [확인 질문] 남겨주신 의견의 세부 기준 확정용 (8문항)
            </h2>
            <p className="text-[14px] sm:text-[15px] text-slate-300 mt-0.5">
              각 산출물 슬라이드·카드 이미지와 개편 시안을 비교하신 뒤 선호하시는 방향을 선택해 주세요.
            </p>
          </div>
          {confirmQuestions.map(renderQuestionCard)}
        </div>
      ) : null}

      {/* 5.2 추가 질문 6문항 */}
      {additionalQuestions.length > 0 ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-teal-900 px-5 py-4 text-white">
            <h2 className="text-lg sm:text-xl font-extrabold">
              5.2 [추가 질문] 미감수 영역 및 실무 엣지케이스 선제 확인용 (6문항)
            </h2>
            <p className="text-[14px] sm:text-[15px] text-teal-100 mt-0.5">
              월간 뉴스레터 그래프, 사옥·개발 매물, 전층 공실, 무사진 긴급 매물에 대한 실무 기준을 알려주세요.
            </p>
          </div>
          {additionalQuestions.map(renderQuestionCard)}
        </div>
      ) : null}

      {visibleQuestions.length === 0 ? (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-center space-y-2">
          <p className="text-lg font-extrabold text-emerald-950">
            🎉 모든 문항(14/14)에 응답을 완료하셨습니다!
          </p>
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className="min-h-[42px] rounded-xl bg-emerald-700 px-4 text-[15px] font-extrabold text-white cursor-pointer"
          >
            전체 응답 다시 보기
          </button>
        </div>
      ) : null}

      {/* 하단 종합 제출 카드 */}
      <div className="rounded-2xl border-2 border-indigo-600 bg-white p-5 space-y-4">
        <h3 className="text-lg font-extrabold text-slate-900">
          중개인 질문지 최종 제출
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="block text-[14px] font-extrabold text-slate-800">
              성함 / 직함 (선택)
            </span>
            <input
              type="text"
              data-testid="broker-questions-responder-input"
              value={responderName}
              onChange={(e) => setResponderName(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[15px] text-slate-900"
            />
          </label>
          <label className="block space-y-1">
            <span className="block text-[14px] font-extrabold text-slate-800">
              전체 추가 코멘트 (선택)
            </span>
            <input
              type="text"
              data-testid="broker-questions-overall-input"
              value={overallComment}
              onChange={(e) => setOverallComment(e.target.value)}
              placeholder="화·목 미팅에서 추가로 논의하고 싶은 내용을 적어 주세요."
              className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[15px] text-slate-900"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="broker-questions-submit-bottom-btn"
            disabled={submitting}
            onClick={() => void persistToServer(records, "submit")}
            className="min-h-[48px] rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 px-6 text-[16px] font-extrabold text-white cursor-pointer"
          >
            {submitting
              ? "서버 제출 중..."
              : "🚀 작성한 답변 서버 최종 제출하기"}
          </button>
          <button
            type="button"
            onClick={() => void handleCopySummary()}
            className="min-h-[48px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 text-[15px] font-extrabold text-slate-900 cursor-pointer"
          >
            📋 답변 요약 텍스트 복사
          </button>
          {submitDoneMessage ? (
            <span
              data-testid="broker-questions-submit-feedback"
              className="text-[15px] font-extrabold text-emerald-800"
            >
              {submitDoneMessage}
            </span>
          ) : null}
        </div>
      </div>

      {/* 이미지 확대 라이트박스 */}
      {lightboxState ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="대상 이미지 확대 보기"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxState(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-3 sm:p-6"
        >
          <div className="w-full max-w-5xl rounded-2xl bg-white p-4 space-y-3 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[16px] font-extrabold text-slate-900">
                {lightboxState.caption}
              </p>
              <button
                type="button"
                data-testid="broker-questions-lightbox-close"
                onClick={() => setLightboxState(null)}
                className="min-h-[40px] rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 px-3.5 text-[14px] font-extrabold text-slate-900 cursor-pointer"
              >
                ✕ 닫기
              </button>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <img
                src={lightboxState.src}
                alt={lightboxState.caption}
                className="block w-full max-h-[78vh] object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
