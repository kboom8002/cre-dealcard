"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ShowcaseDeliverableViewer,
  type ShowcaseActiveContext,
  type ShowcaseScenarioBadge,
} from "@/components/qa-showcase/ShowcaseDeliverableViewer";
import { OUTPUT_SHOWCASE_SCENARIOS, type ShowcaseScenarioUnion } from "@/lib/qa/output-showcase-scenarios";
import {
  appendQaParamsToHref,
  buildQaAuthHeaders,
  getStoredQaAccessKey,
  setStoredQaAccessKey,
} from "@/lib/qa/qa-client-auth";
import {
  QA_ROUND2_WORKBENCH_ID,
  QA_TESTER_SHOWCASE_SESSION_ID,
  getRound1ItemsForScenario,
} from "@/lib/qa/round2-verification-data";

type TesterCaseStatus = "PASS" | "ISSUE";
type R1FixStatus = "pass" | "fail";

interface TesterShowcaseCaseRecord {
  status: TesterCaseStatus;
  checks: Record<string, boolean>;
  r1Fixes?: Record<string, R1FixStatus>;
  updatedAt: string;
}

const LOCAL_STORAGE_KEY = "cre_qa_tester_showcase_r2_v1";
const R1_STORAGE_KEY = "cre_qa_tester_r1_fixes_v1";

const TECH_CHECKS = [
  { id: "mobile_390", label: "① 390px 모바일 가로 넘침·박스 이탈 없음" },
  {
    id: "font_21px",
    label: "② 큰 글씨(21px) 전환 시 본문만 확대 및 줄바꿈 정상",
  },
  {
    id: "kakao_og",
    label: "③ 카톡 공유 OG 카드·설명문 정상(SaaS 광고 문구 없음)",
  },
  {
    id: "lightbox_pptx",
    label: "④ 슬라이드 확대(Lightbox) & PPTX 다운로드 배너 정상",
  },
] as const;

const DEVICE_OPTIONS = [
  "PC Chrome",
  "아이폰 카톡 인앱",
  "갤럭시 카톡 인앱",
  "모바일 브라우저",
] as const;

function readInitialCaseRecords(): Record<string, TesterShowcaseCaseRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TesterShowcaseCaseRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readInitialR1Fixes(): Record<string, R1FixStatus> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(R1_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, R1FixStatus>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function testerBadgeMeta(status?: TesterCaseStatus): ShowcaseScenarioBadge {
  if (status === "PASS") {
    return {
      label: "✓ 이상 없음",
      chipClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
    };
  }
  if (status === "ISSUE") {
    return {
      label: "✕ 결함·재발",
      chipClass: "bg-rose-100 text-rose-900 border-rose-300",
    };
  }
  return {
    label: "미확인",
    chipClass: "bg-slate-100 text-slate-700 border-slate-300",
  };
}

export default function QaTesterShowcasePage() {
  const [caseRecords, setCaseRecords] = useState<
    Record<string, TesterShowcaseCaseRecord>
  >(() => readInitialCaseRecords());
  const [r1Fixes, setR1Fixes] = useState<Record<string, R1FixStatus>>(() =>
    readInitialR1Fixes()
  );
  const [syncMessage, setSyncMessage] = useState<string>("");
  const [submittingAll, setSubmittingAll] = useState<boolean>(false);

  const [showKeyDrawer, setShowKeyDrawer] = useState<boolean>(false);
  const [keyInput, setKeyInput] = useState<string>(() =>
    getStoredQaAccessKey("tester")
  );
  const [keySavedMsg, setKeySavedMsg] = useState<string>("");

  const [defectTargetLabel, setDefectTargetLabel] =
    useState<string>("현재 화면 전체");
  const [deviceEnv, setDeviceEnv] = useState<string>("PC Chrome");
  const [severity, setSeverity] = useState<"critical" | "major">("major");
  const [defectNote, setDefectNote] = useState<string>("");
  const [defectSubmitting, setDefectSubmitting] = useState<boolean>(false);
  const [defectFeedback, setDefectFeedback] = useState<string>("");

  const defectInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadServerState() {
      try {
        const res = await fetch(
          `/api/public/qa-workbench?sessionId=${encodeURIComponent(
            QA_TESTER_SHOWCASE_SESSION_ID
          )}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          found?: boolean;
          session?: { records?: Record<string, TesterShowcaseCaseRecord> };
        };
        const recs = json?.session?.records;
        if (!cancelled && json?.found && recs && typeof recs === "object") {
          setCaseRecords((prev) => ({ ...recs, ...prev }));
        }
      } catch {
        // non-blocking
      }
    }
    void loadServerState();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistShowcaseRecords = useCallback(
    async (
      nextRecords: Record<string, TesterShowcaseCaseRecord>,
      mode: "sync" | "submit"
    ) => {
      try {
        window.localStorage.setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify(nextRecords)
        );
      } catch {
        // ignore storage errors
      }
      const res = await fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildQaAuthHeaders("tester"),
        },
        body: JSON.stringify({
          mode,
          workbenchId: QA_ROUND2_WORKBENCH_ID,
          sessionId: QA_TESTER_SHOWCASE_SESSION_ID,
          testerName: "일반 테스터 2차 검수",
          testerOrg: "qa-tester-portal-v5",
          records: nextRecords,
        }),
      });
      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(errJson?.error || `HTTP ${res.status}`);
      }
      return (await res.json()) as { ok?: boolean };
    },
    []
  );

  const handleToggleTechCheck = useCallback(
    async (caseId: string, checkId: string) => {
      const current = caseRecords[caseId] ?? {
        status: "PASS" as TesterCaseStatus,
        checks: {},
        updatedAt: new Date().toISOString(),
      };
      const nextChecks = {
        ...current.checks,
        [checkId]: !current.checks?.[checkId],
      };
      const next: Record<string, TesterShowcaseCaseRecord> = {
        ...caseRecords,
        [caseId]: {
          ...current,
          checks: nextChecks,
          updatedAt: new Date().toISOString(),
        },
      };
      setCaseRecords(next);
      try {
        await persistShowcaseRecords(next, "sync");
      } catch {
        // local cache remains
      }
    },
    [caseRecords, persistShowcaseRecords]
  );

  const handleSetCaseStatus = useCallback(
    async (caseId: string, status: TesterCaseStatus) => {
      const current = caseRecords[caseId] ?? {
        status,
        checks: {},
        updatedAt: new Date().toISOString(),
      };
      const next: Record<string, TesterShowcaseCaseRecord> = {
        ...caseRecords,
        [caseId]: {
          ...current,
          status,
          updatedAt: new Date().toISOString(),
        },
      };
      setCaseRecords(next);
      setSyncMessage(
        status === "PASS"
          ? `${caseId} 기술 검증 '이상 없음' 저장 중...`
          : `${caseId} '결함·재발 발견' 저장 중...`
      );
      try {
        await persistShowcaseRecords(next, "sync");
        setSyncMessage(
          `${caseId} 기술 검증 결과(${
            status === "PASS" ? "이상 없음" : "결함 발견"
          }) 서버 동기화 완료`
        );
      } catch {
        setSyncMessage(
          `${caseId} 결과가 브라우저에 임시 저장되었습니다. (상단 테스터 키 연결 확인)`
        );
      }
    },
    [caseRecords, persistShowcaseRecords]
  );

  const handleToggleR1Fix = useCallback(
    (itemId: string, nextStatus: R1FixStatus) => {
      const updated = { ...r1Fixes, [itemId]: nextStatus };
      setR1Fixes(updated);
      try {
        window.localStorage.setItem(R1_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
    },
    [r1Fixes]
  );

  const handleSubmitAllTester = useCallback(async () => {
    setSubmittingAll(true);
    setSyncMessage("");
    try {
      await persistShowcaseRecords(caseRecords, "submit");
      setSyncMessage(
        "☁️ 22종 기술 검증 결과를 테스터 전용 서버 세션에 저장했습니다."
      );
    } catch (err) {
      setSyncMessage(
        err instanceof Error
          ? `서버 저장 실패: ${err.message}`
          : "서버 저장 중 오류가 발생했습니다."
      );
    } finally {
      setSubmittingAll(false);
    }
  }, [caseRecords, persistShowcaseRecords]);

  const handleSaveTesterKey = (e: React.FormEvent) => {
    e.preventDefault();
    setStoredQaAccessKey(keyInput, "tester");
    setKeySavedMsg(
      keyInput.trim()
        ? "테스터 전용 키가 저장되었습니다."
        : "테스터 키가 비워졌습니다."
    );
  };

  const passCount = useMemo(
    () =>
      OUTPUT_SHOWCASE_SCENARIOS.filter(
        (s) => caseRecords[s.id]?.status === "PASS"
      ).length,
    [caseRecords]
  );
  const issueCount = useMemo(
    () =>
      OUTPUT_SHOWCASE_SCENARIOS.filter(
        (s) => caseRecords[s.id]?.status === "ISSUE"
      ).length,
    [caseRecords]
  );

  const getScenarioBadge = useCallback(
    (scenario: ShowcaseScenarioUnion) =>
      testerBadgeMeta(caseRecords[scenario.id]?.status),
    [caseRecords]
  );

  const handleScenarioChange = useCallback((scenario: ShowcaseScenarioUnion) => {
    setDefectTargetLabel(`${scenario.id} · 전체 화면`);
    setDefectFeedback("");
  }, []);

  const handleSlideAction = useCallback(
    (slideIdxZeroBased: number, scenario: ShowcaseScenarioUnion) => {
      setDefectTargetLabel(
        `${scenario.id} · 슬라이드 ${String(slideIdxZeroBased + 1).padStart(
          2,
          "0"
        )}`
      );
      setDefectFeedback("");
      defectInputRef.current?.focus();
    },
    []
  );

  const handleSubmitDefectPin = async (
    e: React.FormEvent,
    ctx: ShowcaseActiveContext
  ) => {
    e.preventDefault();
    const note = defectNote.trim();
    if (!note) {
      setDefectFeedback("증상 또는 깨짐 현상을 한 줄 이상 입력해 주세요.");
      return;
    }

    setDefectSubmitting(true);
    setDefectFeedback("");
    try {
      const workspace =
        ctx.activeCategory === "dealcard" ? "dealcards" : ctx.activeCategory;
      const res = await fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildQaAuthHeaders("tester"),
        },
        body: JSON.stringify({
          mode: "pin",
          sessionId: QA_TESTER_SHOWCASE_SESSION_ID,
          authorRole: "tester",
          pinMode: "issue",
          workspace,
          routePath: "/qa-tester/showcase",
          targetSelector: `[data-testid="showcase-case-${ctx.activeScenario.id}"]`,
          targetLabel:
            defectTargetLabel === "현재 화면 전체"
              ? `${ctx.activeScenario.id} · 전체 화면`
              : defectTargetLabel,
          note: `[${deviceEnv}] ${note}`,
          severity,
          fontScale: ctx.fontScale,
          buildSha: ctx.buildStamp.shortSha,
          builtAt: ctx.buildStamp.builtAt,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        setDefectFeedback(
          json?.error || "결함 보고 저장에 실패했습니다. 키 연결을 확인해 주세요."
        );
        return;
      }
      setDefectNote("");
      setDefectFeedback(
        "✅ 테스터 결함 메모가 테스터 전용 세션에 저장되었습니다."
      );
    } catch {
      setDefectFeedback("네트워크 오류로 결함 보고를 저장하지 못했습니다.");
    } finally {
      setDefectSubmitting(false);
    }
  };

  return (
    <ShowcaseDeliverableViewer
      portalRole="tester"
      eyebrowLabel="CRE DealCard · 일반 테스터 전용 검수 쇼룸 (v5.0)"
      headingTitle="22종 실물 산출물 기술 검증 · 1차 28건 재확인 쇼룸"
      backHref="/qa-tester/signoff"
      backLabel="← 테스터 리허설 허브(/qa-tester/signoff)"
      summaryBadgeText={`기술 확인 ${passCount} / 22 완료 · 결함 ${issueCount}건`}
      oracleHeadingLabel="테스터 확인 포인트 (깨짐·숫자·블라인드)"
      slideActionLabel="🐛 이 슬라이드 결함 보고"
      headerRightSlot={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="tester-showcase-key-btn"
            onClick={() => setShowKeyDrawer((v) => !v)}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3.5 text-[15px] font-bold text-slate-900 cursor-pointer whitespace-nowrap"
          >
            {keyInput ? "🔑 테스터 키 연결됨" : "🔒 테스터 키 입력"}
          </button>
        </div>
      }
      renderTopBanner={() =>
        showKeyDrawer ? (
          <form
            onSubmit={handleSaveTesterKey}
            data-testid="tester-key-drawer"
            className="rounded-2xl border border-indigo-300 bg-indigo-50 p-4 flex flex-wrap items-center gap-3"
          >
            <span className="text-[15px] font-extrabold text-indigo-950">
              테스터 전용 인증키 (`QA_TESTER_ACCESS_KEY`)
            </span>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="전달받은 테스터 키를 입력하세요"
              className="min-h-[44px] flex-1 min-w-[220px] rounded-xl border border-indigo-300 bg-white px-3 text-[15px] text-slate-900"
            />
            <button
              type="submit"
              className="min-h-[44px] rounded-xl bg-indigo-700 hover:bg-indigo-800 px-4 text-[15px] font-extrabold text-white cursor-pointer"
            >
              저장
            </button>
            {keySavedMsg ? (
              <span className="text-[14px] font-bold text-emerald-900">
                {keySavedMsg}
              </span>
            ) : null}
          </form>
        ) : null
      }
      getScenarioBadge={getScenarioBadge}
      renderScenarioContextSlot={(ctx) => {
        const relatedR1 = getRound1ItemsForScenario(ctx.activeScenario.id);
        return (
          <div
            data-testid="tester-r1-context-banner"
            className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[15px] font-extrabold text-amber-950">
                🔁 1차 테스터 지적 → #2ce0ae24 수정 재검증 ({ctx.activeScenario.id})
              </span>
              <span className="text-[14px] font-bold text-amber-900">
                연관 조치 {relatedR1.length}건
              </span>
            </div>

            {relatedR1.length === 0 ? (
              <p className="text-[14px] text-amber-950">
                이 사례는 1차 쇼룸 결함 지적이 없었던 기준 사례입니다. 아래 4대 기술 체크리스트만 확인해 주세요.
              </p>
            ) : (
              <div className="space-y-2">
                {relatedR1.map((item) => {
                  const state = r1Fixes[item.id];
                  return (
                    <div
                      key={item.id}
                      data-testid={`tester-r1-inline-${item.id}`}
                      className="rounded-xl border border-amber-200 bg-white p-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <p className="text-[14px] font-extrabold text-slate-950">
                          [{item.id} · {item.slideRef}] {item.issueSummary}
                        </p>
                        <p className="text-[14px] font-semibold text-emerald-900">
                          → 조치: {item.fixApplied}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleR1Fix(item.id, "pass")}
                          aria-pressed={state === "pass"}
                          className={`min-h-[40px] rounded-lg border px-3 text-[14px] font-extrabold cursor-pointer ${
                            state === "pass"
                              ? "border-emerald-700 bg-emerald-700 text-white"
                              : "border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100"
                          }`}
                        >
                          ✓ 해결 확인
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleR1Fix(item.id, "fail")}
                          aria-pressed={state === "fail"}
                          className={`min-h-[40px] rounded-lg border px-3 text-[14px] font-extrabold cursor-pointer ${
                            state === "fail"
                              ? "border-rose-700 bg-rose-700 text-white"
                              : "border-rose-300 bg-rose-50 text-rose-950 hover:bg-rose-100"
                          }`}
                        >
                          ✕ 미해결·재발
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      }}
      onScenarioChange={handleScenarioChange}
      onSlideAction={handleSlideAction}
      renderBottomPanel={(ctx) => {
        const currentRec = caseRecords[ctx.activeScenario.id];
        return (
          <section
            data-testid="tester-tech-checklist-panel"
            className="rounded-2xl border border-slate-200 bg-white p-4 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h2 className="text-lg font-extrabold text-slate-900">
                  테스터 4대 기술 체크리스트 ({ctx.activeScenario.id})
                </h2>
                <p className="text-[14px] text-slate-600">
                  중개인 용어·문체 품평은 중개인 전용 포털에서 분리 진행되며, 여기서는 기술 무결성만 확인합니다.
                </p>
              </div>
              <button
                type="button"
                data-testid="tester-showcase-submit-btn"
                disabled={submittingAll}
                onClick={() => void handleSubmitAllTester()}
                className="min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-4 text-[15px] font-extrabold text-white cursor-pointer"
              >
                {submittingAll
                  ? "저장 중..."
                  : "☁️ 테스터 22종 기술검증 서버 저장"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {TECH_CHECKS.map((chk) => {
                const checked = Boolean(currentRec?.checks?.[chk.id]);
                return (
                  <button
                    key={chk.id}
                    type="button"
                    data-testid={`tester-check-${chk.id}`}
                    onClick={() =>
                      void handleToggleTechCheck(ctx.activeScenario.id, chk.id)
                    }
                    aria-pressed={checked}
                    className={`min-h-[44px] rounded-xl border px-3.5 py-2.5 text-left text-[15px] font-bold flex items-center justify-between gap-2 cursor-pointer ${
                      checked
                        ? "border-emerald-600 bg-emerald-50 text-emerald-950"
                        : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
                    }`}
                  >
                    <span>{chk.label}</span>
                    <span className="shrink-0 font-extrabold">
                      {checked ? "✅ 확인" : "미체크"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                data-testid="tester-case-pass-btn"
                onClick={() =>
                  void handleSetCaseStatus(ctx.activeScenario.id, "PASS")
                }
                aria-pressed={currentRec?.status === "PASS"}
                className={`min-h-[44px] rounded-xl border px-4 py-2.5 text-[15px] font-extrabold cursor-pointer ${
                  currentRec?.status === "PASS"
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100"
                }`}
              >
                ✓ 이상 없음 통과 ({ctx.activeScenario.id})
              </button>
              <button
                type="button"
                data-testid="tester-case-issue-btn"
                onClick={() =>
                  void handleSetCaseStatus(ctx.activeScenario.id, "ISSUE")
                }
                aria-pressed={currentRec?.status === "ISSUE"}
                className={`min-h-[44px] rounded-xl border px-4 py-2.5 text-[15px] font-extrabold cursor-pointer ${
                  currentRec?.status === "ISSUE"
                    ? "border-rose-700 bg-rose-700 text-white"
                    : "border-rose-300 bg-rose-50 text-rose-950 hover:bg-rose-100"
                }`}
              >
                ✕ 결함·재발 발견 ({ctx.activeScenario.id})
              </button>
            </div>

            {syncMessage ? (
              <p className="text-[15px] font-bold text-indigo-800">
                {syncMessage}
              </p>
            ) : null}

            <form
              data-testid="tester-defect-form"
              onSubmit={(e) => void handleSubmitDefectPin(e, ctx)}
              className="border-t border-slate-200 pt-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[16px] font-extrabold text-slate-900">
                  🐛 테스터 결함 즉시 보고 (테스터 전용 저장)
                </h3>
                <span
                  data-testid="tester-defect-target-label"
                  className="inline-flex items-center min-h-[40px] rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-[14px] font-extrabold text-indigo-900"
                >
                  대상: {defectTargetLabel}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="block text-[14px] font-bold text-slate-800">
                    테스트 기기 환경
                  </span>
                  <select
                    value={deviceEnv}
                    onChange={(e) => setDeviceEnv(e.target.value)}
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] text-slate-900"
                  >
                    {DEVICE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="space-y-1">
                  <span className="block text-[14px] font-bold text-slate-800">
                    결함 심각도
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSeverity("critical")}
                      className={`min-h-[44px] rounded-xl border text-[14px] font-extrabold cursor-pointer ${
                        severity === "critical"
                          ? "border-rose-700 bg-rose-700 text-white"
                          : "border-slate-300 bg-white text-slate-800"
                      }`}
                    >
                      긴급 (진행 막힘)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSeverity("major")}
                      className={`min-h-[44px] rounded-xl border text-[14px] font-extrabold cursor-pointer ${
                        severity === "major"
                          ? "border-amber-700 bg-amber-600 text-white"
                          : "border-slate-300 bg-white text-slate-800"
                      }`}
                    >
                      일반 (UI·표시 오류)
                    </button>
                  </div>
                </div>
              </div>

              <label className="block space-y-1">
                <span className="block text-[14px] font-bold text-slate-800">
                  증상 메모 (화면 깨짐 · 넘침 · 숫자 오파싱 · 다운로드 오류 등)
                </span>
                <textarea
                  ref={defectInputRef}
                  data-testid="tester-defect-note-input"
                  value={defectNote}
                  onChange={(e) => setDefectNote(e.target.value)}
                  rows={3}
                  placeholder="예: 아이폰 카톡 인앱에서 DC-06 OG 이미지 아래쪽 문구가 잘립니다."
                  className="w-full min-h-[84px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900"
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  data-testid="tester-defect-submit-btn"
                  disabled={defectSubmitting}
                  className="min-h-[44px] rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 px-5 text-[15px] font-extrabold text-white cursor-pointer"
                >
                  {defectSubmitting
                    ? "저장 중..."
                    : "테스터 결함 목록에 저장"}
                </button>
                <a
                  href={appendQaParamsToHref(
                    ctx.activeLiveEntry.liveUrl,
                    "tester"
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] inline-flex items-center rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 px-4 text-[14px] font-bold text-slate-800"
                >
                  실화면에서 직접 확인하기 ↗
                </a>
              </div>

              {defectFeedback ? (
                <p
                  data-testid="tester-defect-feedback"
                  className="text-[15px] font-bold text-emerald-800"
                >
                  {defectFeedback}
                </p>
              ) : null}
            </form>
          </section>
        );
      }}
    />
  );
}
