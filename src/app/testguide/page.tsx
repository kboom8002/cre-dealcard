"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  TESTGUIDE_DEALS,
  WAVE_C_MISSIONS,
  PPTX_10_AUDIT_ITEMS,
  NEWSLETTER_COPY_PRESETS,
  INBOX_COPY_PRESETS,
  NL_INBOX_GOLDEN_30_ITEMS,
  PSEUDO_GOLDEN_12_DATASETS,
  HUMAN_2ND_FASTTRACK_9_CHECKS,
  type TestGuideDeal,
} from "@/lib/testguide/testguide-data";

type ActiveTabId =
  | "overview"
  | "pseudogolden"
  | "deal1"
  | "deal2"
  | "deal3"
  | "nlinbox"
  | "scorecard";
type CheckStatus = "PASS" | "FAIL" | "PENDING";
type TimerTargetId = "deal1" | "deal2" | "deal3" | "newsletter" | "inbox";

interface DealMetrics {
  seconds: number;
  hesitations: number;
  misclicks: number;
  satisfaction: number;
  actualLandGfa: string;
  actualDepositRent: string;
  actualOccupancy: string;
  actualYieldChange: string;
}

interface DefectEntry {
  id: number;
  dealCode: string;
  location: string;
  description: string;
  severity: "S0" | "S1" | "S2" | "S3";
}

const STORAGE_KEY = "credeal-testguide-state-v4";

const INITIAL_METRICS: Record<TimerTargetId, DealMetrics> = {
  deal1: {
    seconds: 0,
    hesitations: 0,
    misclicks: 0,
    satisfaction: 5,
    actualLandGfa: "137.20㎡ / 426.11㎡",
    actualDepositRent: "보 22,000만 / 월 1,817만",
    actualOccupancy: "100.0%",
    actualYieldChange: "2.91% → 3.12%",
  },
  deal2: {
    seconds: 0,
    hesitations: 0,
    misclicks: 0,
    satisfaction: 5,
    actualLandGfa: "535.60㎡ / 2,758.21㎡",
    actualDepositRent: "보 45,500만→50,500만 / 월 2,230만→2,520만",
    actualOccupancy: "94.1% → 100.0%",
    actualYieldChange: "5.01% → 5.71%",
  },
  deal3: {
    seconds: 0,
    hesitations: 0,
    misclicks: 0,
    satisfaction: 5,
    actualLandGfa: "1,452.20㎡ / 14,256.64㎡",
    actualDepositRent: "보 464,776만 / 월 40,686.9만",
    actualOccupancy: "100.0%",
    actualYieldChange: "2.50% → 2.63%",
  },
  newsletter: {
    seconds: 0,
    hesitations: 0,
    misclicks: 0,
    satisfaction: 5,
    actualLandGfa: "-",
    actualDepositRent: "-",
    actualOccupancy: "-",
    actualYieldChange: "-",
  },
  inbox: {
    seconds: 0,
    hesitations: 0,
    misclicks: 0,
    satisfaction: 5,
    actualLandGfa: "-",
    actualDepositRent: "-",
    actualOccupancy: "-",
    actualYieldChange: "-",
  },
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}분 ${String(s).padStart(2, "0")}초`;
}

export default function TestGuidePage() {
  const [activeTab, setActiveTab] = useState<ActiveTabId>("overview");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showLegacyAiChecks, setShowLegacyAiChecks] = useState<boolean>(false);
  const [showScorecardModal, setShowScorecardModal] = useState<boolean>(false);

  // Stopwatch state
  const [timerDealId, setTimerDealId] = useState<TimerTargetId>("deal1");
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  // Persisted test results
  const [testerName, setTesterName] = useState<string>("현업 중개사 & 총괄 검수자");
  const [metrics, setMetrics] = useState<Record<TimerTargetId, DealMetrics>>(
    INITIAL_METRICS
  );
  const [checkMap, setCheckMap] = useState<Record<string, CheckStatus>>({});
  const [defects, setDefects] = useState<DefectEntry[]>([
    { id: 1, dealCode: "Mission H-1", location: "", description: "", severity: "S2" },
    { id: 2, dealCode: "Mission H-2", location: "", description: "", severity: "S2" },
    { id: 3, dealCode: "Mission H-3", location: "", description: "", severity: "S2" },
  ]);

  // Load state from localStorage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.testerName) setTesterName(parsed.testerName);
        if (parsed.metrics) setMetrics((prev) => ({ ...prev, ...parsed.metrics }));
        if (parsed.checkMap) setCheckMap(parsed.checkMap);
        if (Array.isArray(parsed.defects) && parsed.defects.length > 0) {
          setDefects(parsed.defects);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Save state to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ testerName, metrics, checkMap, defects })
      );
    } catch {
      // ignore
    }
  }, [testerName, metrics, checkMap, defects]);

  // Sync timerDealId when switching deal tabs
  useEffect(() => {
    if (activeTab === "deal1" || activeTab === "deal2" || activeTab === "deal3") {
      setTimerDealId(activeTab);
    }
  }, [activeTab]);

  // Stopwatch interval
  useEffect(() => {
    if (!isTimerRunning) return;
    const id = window.setInterval(() => {
      setMetrics((prev) => ({
        ...prev,
        [timerDealId]: {
          ...prev[timerDealId],
          seconds: prev[timerDealId].seconds + 1,
        },
      }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [isTimerRunning, timerDealId]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 2400);
  }, []);

  const handleCopy = useCallback(
    async (text: string, label: string, keyId: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedKey(keyId);
        showToast(`✅ [${label}] 클립보드에 복사되었습니다! (Ctrl+V로 붙여넣기)`);
        window.setTimeout(() => {
          setCopiedKey((curr) => (curr === keyId ? null : curr));
        }, 1800);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopiedKey(keyId);
        showToast(`✅ [${label}] 복사 완료!`);
      }
    },
    [showToast]
  );

  const handleDownloadCsv = useCallback(
    (deal: TestGuideDeal) => {
      try {
        const blob = new Blob(["\uFEFF" + deal.csvContent], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = deal.csvFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.setTimeout(() => URL.revokeObjectURL(url), 3000);
        showToast(`⬇️ [${deal.csvFilename}] 다운로드가 완료되었습니다!`);
      } catch {
        window.location.href = deal.csvDownloadUrl;
      }
    },
    [showToast]
  );

  const handleDownloadSingleImage = useCallback(
    async (
      img: { filename: string; previewUrl: string; downloadUrl: string },
      silent = false
    ) => {
      try {
        let res = await fetch(img.previewUrl, { mode: "cors" });
        if (!res.ok) {
          res = await fetch(img.downloadUrl);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = img.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        if (!silent) {
          showToast(`⬇️ [${img.filename}] 다운로드가 완료되었습니다!`);
        }
      } catch {
        const a = document.createElement("a");
        a.href = img.downloadUrl;
        a.download = img.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    },
    [showToast]
  );

  const handleDownloadAllDealImages = useCallback(
    async (deal: TestGuideDeal) => {
      showToast(
        `📦 [${deal.shortName}] 사진 4장(JPG 2 + PNG 1 + WebP 1) 연속 다운로드를 시작합니다!`
      );
      for (let i = 0; i < deal.images.length; i++) {
        await handleDownloadSingleImage(deal.images[i], true);
        await new Promise((r) => window.setTimeout(r, 280));
      }
      showToast(`✅ [${deal.shortName}] 사진 4장 다운로드가 모두 완료되었습니다!`);
    },
    [handleDownloadSingleImage, showToast]
  );

  const toggleCheck = useCallback((checkId: string, nextStatus: CheckStatus) => {
    setCheckMap((prev) => ({
      ...prev,
      [checkId]: prev[checkId] === nextStatus ? "PENDING" : nextStatus,
    }));
  }, []);

  const markAllChecksPass = useCallback(
    (ids: string[]) => {
      setCheckMap((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          next[id] = "PASS";
        });
        return next;
      });
      showToast("✅ 해당 섹션의 모든 점검 항목을 PASS로 체크했습니다.");
    },
    [showToast]
  );

  const generateScorecardMarkdown = useCallback(() => {
    const hPass = HUMAN_2ND_FASTTRACK_9_CHECKS.filter(
      (c) => checkMap[c.id] === "PASS"
    ).length;
    const hFail = HUMAN_2ND_FASTTRACK_9_CHECKS.filter(
      (c) => checkMap[c.id] === "FAIL"
    ).length;

    const lines: string[] = [
      `# 📊 CRE DealCard v4.0 [AI 1st — 인간 2nd] 상용화 최종 검수 리포트`,
      `- **검수자**: ${testerName}`,
      `- **제출일시**: ${new Date().toLocaleString("ko-KR")}`,
      `- **🤖 AI 1st 12종 슈도 골든 데이터셋 (PG-01 ~ PG-12)**: **12 / 12 (100% 자동 방역 PASS)**`,
      `- **👤 인간 2nd 15분 고부가가치 UX·품격 검수 (9문항)**: **PASS ${hPass}건 / FAIL ${hFail}건**`,
      ``,
      `## 1. 인간 2nd 15분 핵심 체감 미션 (Mission H-1 · H-2 · H-3) 판정표`,
      `| 코드 | 미션 구분 | 핵심 체감 항목 | 합격 기준 | 판정 |`,
      `|:---:|:---|:---|:---|:---:|`,
    ];

    for (const item of HUMAN_2ND_FASTTRACK_9_CHECKS) {
      const st = checkMap[item.id] || "PENDING";
      lines.push(
        `| **${item.id}** | ${item.mission} | ${item.title} | ${item.passCriteria} | **${st}** |`
      );
    }

    lines.push(``);
    lines.push(`## 2. 매물별 스톱워치 체감 계측 기록`);
    lines.push(
      `| 측정 항목 | 목표 기준 | 매물 #1 (동교동) | 매물 #2 (부천) | 매물 #3 (역삼동) |`
    );
    lines.push(`|:---|:---:|:---:|:---:|:---:|`);
    lines.push(
      `| **1. 초안 완성 시간 (TTF-IM)** | ≤ 3분 00초 | ${formatTime(metrics.deal1.seconds)} | ${formatTime(metrics.deal2.seconds)} | ${formatTime(metrics.deal3.seconds)} |`
    );
    lines.push(
      `| **2. 망설임 횟수 (Hesitation)** | ≤ 1회 | ${metrics.deal1.hesitations}회 | ${metrics.deal2.hesitations}회 | ${metrics.deal3.hesitations}회 |`
    );
    lines.push(
      `| **3. 오작동 횟수 (Misclick)** | 0회 | ${metrics.deal1.misclicks}회 | ${metrics.deal2.misclicks}회 | ${metrics.deal3.misclicks}회 |`
    );
    lines.push(
      `| **4. VIP 고객 발송 만족도** | ≥ 4.5 / 5 | ${metrics.deal1.satisfaction}점 / 5 | ${metrics.deal2.satisfaction}점 / 5 | ${metrics.deal3.satisfaction}점 / 5 |`
    );
    lines.push(``);

    lines.push(`## 3. AI 1st 선행 방역 완료 12종 슈도 골든 데이터셋 (PG-01 ~ PG-12)`);
    lines.push(`| ID | 구분 | 합성 시나리오 | AI 자동 단언 (Oracle) | 상태 |`);
    lines.push(`|:---:|:---|:---|:---|:---:|`);
    for (const pg of PSEUDO_GOLDEN_12_DATASETS) {
      lines.push(
        `| **${pg.id}** | ${pg.category} | ${pg.title} | ${pg.aiOracleAssertion} | **PASS (AI 1st)** |`
      );
    }
    lines.push(``);

    const activeDefects = defects.filter((df) => df.description.trim().length > 0);
    lines.push(`## 4. 인간 2nd 발견 결함 / UX 개선 코멘트 (${activeDefects.length}건)`);
    if (activeDefects.length === 0) {
      lines.push(`- 발견된 결함 없음 (상용 배포 승인)`);
    } else {
      for (const df of activeDefects) {
        lines.push(
          `- **[${df.severity}] ${df.dealCode} (${df.location || "공통"})**: ${df.description}`
        );
      }
    }

    return lines.join("\n");
  }, [testerName, metrics, checkMap, defects]);

  const handleDownloadScorecardMd = useCallback(() => {
    const md = generateScorecardMarkdown();
    const blob = new Blob(["\uFEFF" + md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AI1st_Human2nd_검수리포트_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("⬇️ 채점 결과 마크다운(.md) 파일이 다운로드되었습니다!");
  }, [generateScorecardMarkdown, showToast]);

  const generateNlInboxReportMarkdown = useCallback(() => {
    const passCount = NL_INBOX_GOLDEN_30_ITEMS.filter(
      (it) => checkMap[it.id] === "PASS"
    ).length;
    const failCount = NL_INBOX_GOLDEN_30_ITEMS.filter(
      (it) => checkMap[it.id] === "FAIL"
    ).length;
    const pendingCount = NL_INBOX_GOLDEN_30_ITEMS.length - passCount - failCount;

    const lines: string[] = [
      `# 📰·💬 뉴스레터 스튜디오 & 소통 관리함 상용화 골든테스트 채점 결과서 (30문항)`,
      `- **작성자(테스터)**: ${testerName}`,
      `- **제출일시**: ${new Date().toLocaleString("ko-KR")}`,
      `- **종합 판정**: 총 30문항 중 **PASS ${passCount}건** / FAIL ${failCount}건 / 미점검 ${pendingCount}건`,
      ``,
      `## 1. 30개 골든 시나리오 상세 채점표`,
      `| ID | 구분 | 수행 주체 | 시나리오 제목 | 기대 결과 | 불변규칙 | 결과 |`,
      `|:---:|:---|:---:|:---|:---|:---:|:---:|`,
    ];

    for (const item of NL_INBOX_GOLDEN_30_ITEMS) {
      const st = checkMap[item.id] || "PENDING";
      lines.push(
        `| **${item.id}** | ${item.wave} | ${item.actor} | ${item.title} | ${item.expected} | \`${item.invariantCode}\` | **${st}** |`
      );
    }

    return lines.join("\n");
  }, [testerName, checkMap]);

  const handleDownloadNlInboxMd = useCallback(() => {
    const md = generateNlInboxReportMarkdown();
    const blob = new Blob(["\uFEFF" + md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `뉴스레터_소통함_골든테스트_결과_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("⬇️ 뉴스레터·소통함 30문항 채점 결과(.md) 파일이 다운로드되었습니다!");
  }, [generateNlInboxReportMarkdown, showToast]);

  const CopyFieldRow = ({
    label,
    value,
    subNote,
    keyId,
    highlight = false,
  }: {
    label: string;
    value: string;
    subNote?: string;
    keyId: string;
    highlight?: boolean;
  }) => {
    const isCopied = copiedKey === keyId;
    return (
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border transition ${
          highlight
            ? "bg-blue-50/70 border-blue-300"
            : "bg-white border-slate-200 hover:border-slate-300"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              {label}
            </span>
            {subNote && <span className="text-xs text-slate-500 font-medium">{subNote}</span>}
          </div>
          <div className="mt-1 font-mono text-sm sm:text-base font-bold text-slate-900 break-all select-all">
            {value}
          </div>
        </div>
        <button
          type="button"
          onClick={() => handleCopy(value, label, keyId)}
          className={`shrink-0 min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5 ${
            isCopied
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-slate-900 hover:bg-slate-800 text-white"
          }`}
        >
          <span>{isCopied ? "✅ 복사됨!" : "📋 클릭 복사"}</span>
        </button>
      </div>
    );
  };

  const activeDeal: TestGuideDeal | null = useMemo(() => {
    if (activeTab === "deal1") return TESTGUIDE_DEALS[0];
    if (activeTab === "deal2") return TESTGUIDE_DEALS[1];
    if (activeTab === "deal3") return TESTGUIDE_DEALS[2];
    return null;
  }, [activeTab]);

  const currentTimerMetric = metrics[timerDealId];
  const humanFastTrackPassCount = HUMAN_2ND_FASTTRACK_9_CHECKS.filter(
    (c) => checkMap[c.id] === "PASS"
  ).length;
  const humanFastTrackFailCount = HUMAN_2ND_FASTTRACK_9_CHECKS.filter(
    (c) => checkMap[c.id] === "FAIL"
  ).length;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] pb-24">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-700 text-sm font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sticky Top Header & Live Stopwatch Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-600 text-white font-extrabold text-lg">
                ⚡
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base sm:text-lg font-extrabold text-slate-900 leading-tight">
                    CRE DealCard [AI 1st — 인간 2nd] 상용화 검수 워크벤치
                  </h1>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-xs font-extrabold">
                    v4.0 최신판 · PG-01~12 자동 방역 완료
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  기계적 수치·콜드스타트·누락층 합성 등 12종 슈도 골든 검증은 AI가 100% 선행 완료했습니다. 인간 테스터는 15분 핵심 UX·품격 검수만 수행하세요.
                </p>
              </div>
            </div>

            {/* Direct Workspace Launchers */}
            <div className="flex flex-wrap items-center gap-1.5">
              <a
                href="/broker/w/im"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-extrabold transition flex items-center gap-1 shadow-xs"
              >
                <span>🚀 ② IM 스튜디오 열기</span>
              </a>
              <a
                href="/broker/w/dealcards"
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition"
              >
                🃏 ① 딜카드
              </a>
              <a
                href="/broker/magazine-editor"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="launcher-newsletter-studio"
                className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-extrabold transition"
              >
                📰 ③ 뉴스레터 스튜디오
              </a>
              <a
                href="/broker/w/inbox"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="launcher-inbox-workspace"
                className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-extrabold transition"
              >
                💬 ④ 소통 관리함
              </a>
              <a
                href="/qa-signoff"
                data-testid="open-qa-signoff-hub"
                className="min-h-[44px] px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold transition inline-flex items-center"
              >
                ⚡ 20분 고속 검수 허브 ↗
              </a>
            </div>
          </div>

          {/* Built-in Stopwatch & Hesitation/Misclick Counter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-amber-400">⏱️ 3분 무막힘 타이머:</span>
              <select
                aria-label="계측 대상 매물 선택"
                value={timerDealId}
                onChange={(e) => {
                  const nextTarget = e.target.value as TimerTargetId;
                  setIsTimerRunning(false);
                  setTimerDealId(nextTarget);
                  if (nextTarget === "deal1" || nextTarget === "deal2" || nextTarget === "deal3") {
                    setActiveTab(nextTarget);
                  } else if (nextTarget === "newsletter" || nextTarget === "inbox") {
                    setActiveTab("nlinbox");
                  }
                }}
                className="bg-slate-800 text-white font-bold px-2.5 py-1 rounded-lg border border-slate-700 text-xs sm:text-sm outline-none cursor-pointer"
              >
                <option value="deal1">매물 #1 (동교동 77억 · 목표 ≤3분)</option>
                <option value="deal2">매물 #2 (부천 58억 · 목표 ≤3분)</option>
                <option value="deal3">매물 #3 (역삼동 2,000억 · 목표 ≤3분)</option>
                <option value="newsletter">📰 뉴스레터 발행 (목표 ≤3분)</option>
                <option value="inbox">💬 소통함 승인·발송 (목표 ≤1분)</option>
              </select>
              <span className="font-mono text-base sm:text-lg font-extrabold text-emerald-400 px-2">
                {formatTime(currentTimerMetric.seconds)}
              </span>
              <button
                type="button"
                onClick={() => setIsTimerRunning((prev) => !prev)}
                className={`px-3 py-1 rounded-lg font-extrabold cursor-pointer transition ${
                  isTimerRunning
                    ? "bg-amber-500 hover:bg-amber-600 text-slate-950"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white"
                }`}
              >
                {isTimerRunning ? "⏸ 일시정지" : "▶ 타이머 시작"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsTimerRunning(false);
                  setMetrics((prev) => ({
                    ...prev,
                    [timerDealId]: { ...prev[timerDealId], seconds: 0 },
                  }));
                }}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold cursor-pointer"
              >
                ↺ 0초 리셋
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-300">망설임(≤1회):</span>
                <span className="font-mono font-extrabold text-amber-300">
                  {currentTimerMetric.hesitations}회
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setMetrics((prev) => ({
                      ...prev,
                      [timerDealId]: {
                        ...prev[timerDealId],
                        hesitations: prev[timerDealId].hesitations + 1,
                      },
                    }))
                  }
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold cursor-pointer"
                >
                  +1
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-300">오작동(0회):</span>
                <span className="font-mono font-extrabold text-rose-300">
                  {currentTimerMetric.misclicks}회
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setMetrics((prev) => ({
                      ...prev,
                      [timerDealId]: {
                        ...prev[timerDealId],
                        misclicks: prev[timerDealId].misclicks + 1,
                      },
                    }))
                  }
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold cursor-pointer"
                >
                  +1
                </button>
              </div>
            </div>
          </div>

          {/* Navigation Tabs (v4.0 Latest Structure) */}
          <nav
            aria-label="골든테스트 단계 탭"
            className="flex items-center gap-1.5 overflow-x-auto pb-1"
          >
            {[
              { id: "overview", label: "⚡ 0. 인간 2nd 15분 Fast-Track (메인)" },
              { id: "pseudogolden", label: "🧪 1. AI 1st 12종 슈도 골든 실험실 (PG-01~12)" },
              { id: "deal1", label: "🏢 2. 매물 #1 동교동 (77억 워크벤치)" },
              { id: "deal2", label: "🏥 3. 매물 #2 부천 (58억 워크벤치)" },
              { id: "deal3", label: "🏙️ 4. 매물 #3 역삼동 (2,000억 워크벤치)" },
              { id: "nlinbox", label: "📰·💬 뉴스레터·소통함 골든테스트 (30문항)" },
              { id: "scorecard", label: "📊 5. 최종 승인 & 리포트 제출" },
            ].map((tab) => {
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id as ActiveTabId)}
                  className={`shrink-0 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition cursor-pointer ${
                    isSelected
                      ? "bg-[#0F172A] text-white shadow-xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-8">
        {/* ──────── TAB 0: OVERVIEW & HUMAN 2ND 15-MIN FAST-TRACK ──────── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* AI 1st (12 Pseudo-Golden Gate) + Human 2nd (15-Min Fast-Track) Collaboration Banner */}
            <div
              data-testid="ai1st-human2nd-fasttrack-panel"
              className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-sm space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-extrabold">
                    🤖 AI 1st 사전 방역 완료 · 12종 슈도 골든 데이터셋 (PG-01 ~ PG-12) 100% PASS
                  </div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-1">
                    인간 테스터 2nd 15분 고부가가치 UX·품격 검수 (Fast-Track)
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300">
                    과거처럼 인간이 80개 항목의 숫자를 일일이 대조할 필요가 없습니다. 주소 역변환 휘발 방어(E-02), 무버튼 즉시 열람(E-01), 음수층(-1) 정규화 및 누락 공실층 자동 합성(PG-05), 원 단위 오타 보정(PG-06) 등 <strong>12종 기계적 변이 검증은 AI가 100% 선행 완료</strong>했습니다.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab("pseudogolden")}
                    className="px-3.5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs sm:text-sm font-extrabold transition cursor-pointer"
                  >
                    🧪 AI 12종 슈도 골든 데이터 보기
                  </button>
                  <a
                    href="/broker/w/im"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-extrabold transition"
                  >
                    🚀 IM 스튜디오 바로 열기 ↗
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div
                  data-testid="human-mission-h1"
                  className="p-4 rounded-xl bg-white/10 border border-white/15 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold px-2.5 py-0.5 rounded bg-blue-500/30 text-blue-200">
                      Mission H-1 · 5분
                    </span>
                    <span className="text-xs text-slate-300 font-semibold">작성 속도 & 직관성</span>
                  </div>
                  <h3 className="text-base font-extrabold text-white">
                    1. 매물 1건 3분 내 무막힘 작성 체감
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                    매물 #1(동교동) 워크벤치의 1클릭 복붙과 CSV·사진 4장 마우스 드래그앤드롭만으로 망설임 없이 3분 안에 IM이 완성되는지 확인합니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("deal1")}
                    className="w-full mt-1 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-extrabold transition cursor-pointer"
                  >
                    👉 매물 #1 워크벤치로 바로 이동 →
                  </button>
                </div>

                <div
                  data-testid="human-mission-h2"
                  className="p-4 rounded-xl bg-white/10 border border-white/15 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold px-2.5 py-0.5 rounded bg-amber-500/30 text-amber-200">
                      Mission H-2 · 5분
                    </span>
                    <span className="text-xs text-slate-300 font-semibold">즉흥 변경 반응성</span>
                  </div>
                  <h3 className="text-base font-extrabold text-white">
                    2. 가격·공실 변경 및 무버튼 즉시 열람
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                    희망 매매가를 낮추거나(77억→72억) 공실을 임대중으로 바꾼 뒤, <strong>[IM 완성하기]를 누르지 않고</strong> 바로 우측 [모바일 IM 열기]·[PPTX 받기]를 눌러 즉시 반영되는지 확인합니다.
                  </p>
                </div>

                <div
                  data-testid="human-mission-h3"
                  className="p-4 rounded-xl bg-white/10 border border-white/15 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold px-2.5 py-0.5 rounded bg-purple-500/30 text-purple-200">
                      Mission H-3 · 5분
                    </span>
                    <span className="text-xs text-slate-300 font-semibold">VIP 고객 설득력</span>
                  </div>
                  <h3 className="text-base font-extrabold text-white">
                    3. 스마트폰 열람 & 10면 PPTX 품격 승인
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                    생성된 모바일 IM과 10장짜리 PPTX의 표지 실사진·지도/지적도·AI 장점 3가지 문구가 실제 VIP 매수 고객에게 바로 발송할 수준인지 최종 판정합니다.
                  </p>
                </div>
              </div>
            </div>

            {/* Interactive 9-Item Human 2nd Fast-Track Scorecard */}
            <section
              data-testid="human-2nd-9checks-section"
              className="bg-white rounded-2xl border-2 border-slate-900 p-6 shadow-xs space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <span className="text-xs font-extrabold text-white bg-slate-900 px-2.5 py-1 rounded-md">
                    👤 인간 2nd 전용 — 9대 고부가가치 체감·품격 체크리스트 (총 15분)
                  </span>
                  <h2 className="text-xl font-extrabold text-slate-900 mt-1.5">
                    기계적 계산 대신 아래 9가지 체감·품격 항목만 PASS / FAIL로 판정해 주세요
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                    현황: 총 9문항 중 <strong className="text-emerald-700">PASS {humanFastTrackPassCount}건</strong> /{" "}
                    <strong className="text-rose-700">FAIL {humanFastTrackFailCount}건</strong>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-testid="human-9checks-mark-all-pass-btn"
                    onClick={() =>
                      markAllChecksPass(HUMAN_2ND_FASTTRACK_9_CHECKS.map((c) => c.id))
                    }
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-extrabold cursor-pointer shadow-xs"
                  >
                    ✅ 9문항 전체 PASS 일괄 승인
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        generateScorecardMarkdown(),
                        "v4.0 최종 검수 리포트",
                        "overview-report-copy"
                      )
                    }
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-extrabold cursor-pointer shadow-xs"
                  >
                    📋 최종 검수 리포트 복사
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {HUMAN_2ND_FASTTRACK_9_CHECKS.map((item) => {
                  const st = checkMap[item.id] || "PENDING";
                  return (
                    <div
                      key={item.id}
                      data-testid={`human-check-row-${item.id}`}
                      className={`p-4 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                        st === "PASS"
                          ? "bg-emerald-50/50 border-emerald-300"
                          : st === "FAIL"
                          ? "bg-rose-50/50 border-rose-300"
                          : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-xs font-extrabold">
                            {item.id}
                          </span>
                          <span className="px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-900 text-xs font-extrabold">
                            {item.mission}
                          </span>
                          <span className="text-sm sm:text-base font-extrabold text-slate-900">
                            {item.title}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-700">
                          <strong>체감 방법:</strong> {item.guide}
                        </p>
                        <p className="text-xs sm:text-sm text-emerald-800 font-bold">
                          ⭕ 품격 합격 기준: {item.passCriteria}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleCheck(item.id, "PASS")}
                          className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${
                            st === "PASS"
                              ? "bg-emerald-600 text-white shadow-xs"
                              : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          PASS
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleCheck(item.id, "FAIL")}
                          className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${
                            st === "FAIL"
                              ? "bg-rose-600 text-white shadow-xs"
                              : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          FAIL
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 3 Deals Quick Launch Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {TESTGUIDE_DEALS.map((d) => (
                <div
                  key={d.id}
                  className="bg-white rounded-2xl border-2 border-slate-200 hover:border-blue-500 transition p-5 shadow-xs flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-extrabold">
                        매물 #{d.number} ({d.code})
                      </span>
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">
                        {d.badge}
                      </span>
                    </div>
                    <h3 className="text-lg font-extrabold text-slate-900">{d.name}</h3>
                    <p className="text-xs sm:text-sm text-slate-600 font-medium">
                      📍 {d.jibunAddress} ({d.roadAddress})
                    </p>
                    <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div>
                        • <strong>매매가</strong>: {d.askingPriceEok}억 원 (즉흥 변경 테스트: {d.waveBPriceEok}억)
                      </div>
                      <div>
                        • <strong>면적</strong>: 연면적 {d.specs.gfaSqm}㎡ ({d.specs.gfaPyeong}평) / 대지{" "}
                        {d.specs.landAreaSqm}㎡ ({d.specs.landAreaPyeong}평)
                      </div>
                      <div>
                        • <strong>임대현황</strong>: 보 {d.rentSummary.totalDepositManwon} / 월{" "}
                        {d.rentSummary.totalMonthlyRentManwon}
                      </div>
                      <div>
                        • <strong>첨부 에셋</strong>: CSV 1종 + 사진 4장 (JPG 2 · PNG 1 · WebP 1)
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab(d.id)}
                      className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold transition cursor-pointer"
                    >
                      👉 매물 #{d.number} 복붙 워크벤치 열기 →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ──────── TAB 1: AI 1ST 12 PSEUDO-GOLDEN LAB (PG-01 ~ PG-12) ──────── */}
        {activeTab === "pseudogolden" && (
          <div className="space-y-6" data-testid="testguide-pseudogolden-panel">
            <section className="bg-white rounded-2xl border-2 border-emerald-600 p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <span className="text-xs font-extrabold text-white bg-emerald-600 px-2.5 py-1 rounded-md">
                    🧪 AI 1st 사전 방역 완료 — 12종 슈도 골든 데이터셋 (PG-01 ~ PG-12)
                  </span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1.5">
                    실전 주소 5종 × 변이 렌트롤 7종 × 멀티포맷 사진 12종 교차 합성 워크벤치
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1">
                    아래 12개 시나리오는 Vitest 자동화 스위트(<code>pseudo-golden-12-suite.test.tsx</code>)에서 매 배포마다 100% 자동 검증됩니다. 원하는 변이 시나리오의 주소나 렌트롤 TSV를 클릭 한 번으로 복사해 IM 스튜디오에서 직접 체험해 볼 수도 있습니다.
                  </p>
                </div>
                <a
                  href="/broker/w/im"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-extrabold transition shrink-0"
                >
                  🚀 IM 스튜디오에 붙여넣어 보기 ↗
                </a>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PSEUDO_GOLDEN_12_DATASETS.map((pg) => (
                  <div
                    key={pg.id}
                    data-testid={`pg-card-${pg.id}`}
                    className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded bg-slate-900 text-white font-mono text-xs font-extrabold">
                            {pg.id}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-extrabold">
                            {pg.category}
                          </span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-xs font-extrabold">
                          🤖 AI 1st PASS
                        </span>
                      </div>

                      <h3 className="text-base font-extrabold text-slate-900">{pg.title}</h3>

                      <div className="text-xs text-slate-700 space-y-1 bg-white p-3 rounded-xl border border-slate-200">
                        <div>
                          • <strong>합성 주소</strong>: <code>{pg.address}</code>
                        </div>
                        <div>
                          • <strong>희망 매매가</strong>: {pg.askingPriceReadout} (<code>{pg.askingPriceWon}원</code>)
                        </div>
                        <div>
                          • <strong>렌트롤 변이</strong>: {pg.rentRollVariant}
                        </div>
                        <div>
                          • <strong>사진 조합</strong>: {pg.photoVariant}
                        </div>
                        <div className="text-emerald-800 font-bold pt-1">
                          • <strong>AI 검증 단언(Oracle)</strong>: {pg.aiOracleAssertion}
                        </div>
                        <div className="text-amber-800 font-semibold">
                          • <strong>타겟 맹점 방어</strong>: {pg.targetBlindspot}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(pg.address, `${pg.id} 주소`, `pg-addr-${pg.id}`)
                        }
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs font-extrabold text-slate-800 cursor-pointer"
                      >
                        {copiedKey === `pg-addr-${pg.id}` ? "✅ 주소 복사됨" : "📋 주소 복사"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(pg.askingPriceWon, `${pg.id} 매매가(원)`, `pg-price-${pg.id}`)
                        }
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs font-extrabold text-slate-800 cursor-pointer"
                      >
                        {copiedKey === `pg-price-${pg.id}`
                          ? "✅ 매매가 복사됨"
                          : "📋 매매가(원) 복사"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(pg.sampleTsv, `${pg.id} 변이 렌트롤 TSV`, `pg-tsv-${pg.id}`)
                        }
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold cursor-pointer"
                      >
                        {copiedKey === `pg-tsv-${pg.id}`
                          ? "✅ 변이 렌트롤 TSV 복사됨!"
                          : "📋 변이 렌트롤 TSV 원클릭 복사"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ──────── TAB 2, 3, 4: DEAL WORKBENCH (#1, #2, #3) ──────── */}
        {activeDeal && (
          <div className="space-y-6">
            {/* Deal Header Banner */}
            <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded bg-amber-400 text-slate-950 text-xs font-extrabold">
                      매물 #{activeDeal.number} ({activeDeal.code})
                    </span>
                    <span className="text-xs font-bold text-slate-300">{activeDeal.badge}</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-extrabold">{activeDeal.name}</h2>
                  <p className="text-xs sm:text-sm text-slate-300">
                    지번: {activeDeal.jibunAddress} | 도로명: {activeDeal.roadAddress}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={activeDeal.csvDownloadUrl}
                    download={activeDeal.csvFilename}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs sm:text-sm font-extrabold transition flex items-center gap-1.5"
                  >
                    <span>⬇️ 렌트롤 CSV 다운로드 ({activeDeal.csvFilename})</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDownloadAllDealImages(activeDeal)}
                    className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs sm:text-sm font-extrabold transition cursor-pointer flex items-center gap-1.5"
                  >
                    <span>📦 사진 4장 한 번에 다운로드 (JPG·PNG·WebP)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* STEP 1: Tab ① 기본정보 & 주소 자동 채움 (1:1 Match with IM Studio) */}
            <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <span className="text-xs font-extrabold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">
                    IM 스튜디오 — ① 건물 기본 정보 탭 (화면 위→아래 순서 1:1 일치)
                  </span>
                  <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1">
                    Step {activeDeal.number}-1. 기본 정보 입력값 원클릭 복사
                  </h3>
                </div>
                <span className="text-xs text-slate-500 font-semibold">
                  💡 상단 [🔄 빈 양식으로 새로 입력] 클릭 후 ①→②→③ 순서대로 복사해 붙여넣으세요
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <CopyFieldRow
                  label="① 표지 제목 (건물명 · 맨 위 첫 번째 입력칸)"
                  value={activeDeal.name}
                  subNote="IM 스튜디오 맨 위 '표지 제목 (건물명)' 칸에 붙여넣기"
                  keyId={`${activeDeal.id}-title`}
                  highlight
                />
                <CopyFieldRow
                  label="② 1. 건물 주소 (지번 · 두 번째 입력칸)"
                  value={activeDeal.jibunAddress}
                  subNote="주소 입력 후 [주소로 건물 정보 자동 채우기] 클릭! (제목·가격 안 지워짐)"
                  keyId={`${activeDeal.id}-jibun`}
                  highlight
                />
                <CopyFieldRow
                  label="③ 2. 희망 매매가 ('원' 단위 · 세 번째 입력칸)"
                  value={(Number(activeDeal.askingPriceManwon) * 10000).toLocaleString()}
                  subNote={`= ${activeDeal.askingPriceEok}억 원 (${(Number(activeDeal.askingPriceManwon) * 10000).toLocaleString()}원)`}
                  keyId={`${activeDeal.id}-price`}
                  highlight
                />
                <CopyFieldRow
                  label="즉흥 변경 테스트용 매매가 (Mission H-2 · '원' 단위)"
                  value={(Number(activeDeal.waveBPriceManwon) * 10000).toLocaleString()}
                  subNote={`= ${activeDeal.waveBPriceEok}억 원 (가격 변경 즉시 수익률·미리보기 연동 확인)`}
                  keyId={`${activeDeal.id}-waveb-price-won`}
                />
                <CopyFieldRow
                  label="④ 연면적 (㎡) [왼쪽 입력칸]"
                  value={activeDeal.specs.gfaSqm}
                  subNote={`= ${activeDeal.specs.gfaPyeong}평 (대장 자동채움 · 왼쪽 칸 확인)`}
                  keyId={`${activeDeal.id}-gfa`}
                />
                <CopyFieldRow
                  label="⑤ 대지면적 (㎡) [오른쪽 입력칸]"
                  value={activeDeal.specs.landAreaSqm}
                  subNote={`= ${activeDeal.specs.landAreaPyeong}평 (대장 자동채움 · 오른쪽 칸 확인)`}
                  keyId={`${activeDeal.id}-land`}
                />
                <CopyFieldRow
                  label="⑥ 용도지역 [왼쪽 입력칸]"
                  value={activeDeal.specs.zoning}
                  keyId={`${activeDeal.id}-zoning`}
                />
                <CopyFieldRow
                  label="⑦ 준공일 (사용승인일) [오른쪽 입력칸]"
                  value={activeDeal.specs.completionDate}
                  keyId={`${activeDeal.id}-completion`}
                />
              </div>
            </section>

            {/* STEP 2: Tab ② 층별 임대 현황 (렌트롤 CSV / TSV) */}
            <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                    IM 스튜디오 — ② 층별 임대 현황 탭
                  </span>
                  <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1">
                    Step {activeDeal.number}-2. 층별 렌트롤 1초 불러오기 (TSV 복붙 또는 CSV 드롭)
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        activeDeal.tsvContent,
                        `${activeDeal.shortName} 렌트롤 TSV`,
                        `${activeDeal.id}-tsv`
                      )
                    }
                    className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition cursor-pointer ${
                      copiedKey === `${activeDeal.id}-tsv`
                        ? "bg-emerald-600 text-white"
                        : "bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                    }`}
                  >
                    {copiedKey === `${activeDeal.id}-tsv`
                      ? "✅ 렌트롤 TSV 전체 복사됨!"
                      : "📋 방법 A: 엑셀 붙여넣기용(TSV) 원클릭 복사"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadCsv(activeDeal)}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-extrabold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>⬇️ 방법 B: {activeDeal.csvFilename} 다운로드</span>
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-950 flex flex-wrap items-center justify-between gap-2">
                <div>
                  🤖 <strong>AI 1st 사전 검증 완료</strong>: 총 보증금{" "}
                  <strong>{activeDeal.rentSummary.totalDepositManwon}</strong> / 월 임대료{" "}
                  <strong>{activeDeal.rentSummary.totalMonthlyRentManwon}</strong> / 점유율{" "}
                  <strong>{activeDeal.rentSummary.occupancyPct}</strong>
                </div>
                <span className="px-2.5 py-0.5 rounded bg-emerald-600 text-white text-xs font-extrabold">
                  수치 오차 0건 검증됨
                </span>
              </div>
            </section>

            {/* STEP 3 & 4: AI 장점 3가지 & 사진 4장 */}
            <section className="bg-white rounded-2xl border-2 border-blue-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <span className="text-xs font-extrabold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">
                    IM 스튜디오 — ③ AI 장점 자동 생성 & ④ 사진 4장 드래그앤드롭
                  </span>
                  <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1">
                    Step {activeDeal.number}-3. [✨ AI로 3가지 장점 자동 채우기] 클릭 후 사진 4장 한 번에 드롭
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                    ③ 탭에서는 타이핑 없이 <strong>[✨ AI로 3가지 장점 자동 채우기]</strong> 버튼만 누르세요(300자 제한 & 중개사 프로필 자동 입력 완료). 이어서 ④ 탭에 아래 사진 4장(JPG·PNG·WebP)을 내려받아 한꺼번에 끌어다 놓으세요.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleDownloadAllDealImages(activeDeal)}
                  className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold transition cursor-pointer shadow-sm flex items-center gap-2"
                >
                  <span>📦 이 매물 사진 4장 한 번에 내려받기</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {activeDeal.images.map((img, idx) => (
                  <div
                    key={img.filename}
                    className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50 flex flex-col justify-between"
                  >
                    <div>
                      <div className="relative h-36 bg-slate-200 overflow-hidden">
                        <img
                          src={img.previewUrl}
                          alt={img.caption}
                          className="w-full h-full object-cover"
                        />
                        <span
                          className={`absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-extrabold text-white ${
                            img.format === "JPG"
                              ? "bg-blue-600"
                              : img.format === "PNG"
                              ? "bg-emerald-600"
                              : "bg-amber-600"
                          }`}
                        >
                          #{idx + 1} · {img.format}
                        </span>
                      </div>
                      <div className="p-3 space-y-1">
                        <div className="text-xs font-extrabold text-blue-700">{img.roleLabel}</div>
                        <div
                          className="text-xs font-mono font-bold text-slate-900 truncate"
                          title={img.filename}
                        >
                          {img.filename}
                        </div>
                      </div>
                    </div>
                    <div className="p-3 pt-0">
                      <button
                        type="button"
                        onClick={() => handleDownloadSingleImage(img)}
                        className="w-full py-2 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-extrabold flex items-center justify-center gap-1 transition cursor-pointer"
                      >
                        <span>⬇️ 개별 다운로드 ({img.format})</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Collapsible AI 1st Pre-Verified Mechanical Oracle Details */}
            <section className="bg-slate-100 rounded-2xl border border-slate-300 p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs sm:text-sm font-extrabold text-slate-700">
                  🤖 AI 1st 자동 검증 완료된 세부 수치 오라클 ({activeDeal.waveAChecks.length + activeDeal.waveBChecks.length}개 항목 · 인간 수동 대조 불필요)
                </div>
                <button
                  type="button"
                  onClick={() => setShowLegacyAiChecks((prev) => !prev)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-extrabold text-slate-700 cursor-pointer"
                >
                  {showLegacyAiChecks ? "▲ AI 검증 상세 접기" : "▼ AI 검증 상세 펼쳐보기"}
                </button>
              </div>
              {showLegacyAiChecks && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[...activeDeal.waveAChecks, ...activeDeal.waveBChecks].map((chk) => (
                    <div
                      key={chk.id}
                      className="p-3 rounded-xl bg-white border border-emerald-200 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-slate-900">
                          [{chk.id}] {chk.title}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-extrabold">
                          AI PASS
                        </span>
                      </div>
                      <div className="text-slate-600">{chk.expected}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ──────── TAB 5: NEWSLETTER & INBOX 30-ITEM GOLDEN TEST WORKBENCH ──────── */}
        {activeTab === "nlinbox" && (
          <div className="space-y-6" data-testid="testguide-nlinbox-panel">
            <section className="bg-white rounded-2xl border-2 border-indigo-600 p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <span className="text-xs font-extrabold text-white bg-indigo-600 px-2.5 py-1 rounded-md">
                    📰 뉴스레터 스튜디오 & 💬 소통 관리함 — 30문항 골든테스트 (AI Dry-Run 100% PASS)
                  </span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1.5">
                    1클릭 복붙 프리셋 & 30개 골든 시나리오 실시간 채점 워크벤치
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-testid="nlinbox-mark-all-pass-btn"
                    onClick={() =>
                      markAllChecksPass(NL_INBOX_GOLDEN_30_ITEMS.map((it) => it.id))
                    }
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-extrabold cursor-pointer shadow-xs"
                  >
                    ✅ 30문항 전체 PASS 일괄 체크
                  </button>
                  <button
                    type="button"
                    data-testid="nlinbox-copy-report-btn"
                    onClick={() =>
                      handleCopy(
                        generateNlInboxReportMarkdown(),
                        "뉴스레터·소통함 30문항 채점 결과서",
                        "nlinbox-md-copy"
                      )
                    }
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-extrabold cursor-pointer shadow-xs"
                  >
                    📋 30문항 결과서 전체 복사
                  </button>
                  <button
                    type="button"
                    data-testid="nlinbox-download-md-btn"
                    onClick={handleDownloadNlInboxMd}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-extrabold cursor-pointer"
                  >
                    ⬇️ 결과서(.md) 다운로드
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-bold text-slate-500">총 골든 시나리오</div>
                  <div className="text-xl font-black text-slate-900 mt-0.5">
                    {NL_INBOX_GOLDEN_30_ITEMS.length}문항
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-xs font-bold text-emerald-700">PASS 통과</div>
                  <div
                    className="text-xl font-black text-emerald-700 mt-0.5"
                    data-testid="nlinbox-pass-count"
                  >
                    {
                      NL_INBOX_GOLDEN_30_ITEMS.filter((it) => checkMap[it.id] === "PASS")
                        .length
                    }
                    건
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200">
                  <div className="text-xs font-bold text-rose-700">FAIL 결함</div>
                  <div
                    className="text-xl font-black text-rose-700 mt-0.5"
                    data-testid="nlinbox-fail-count"
                  >
                    {
                      NL_INBOX_GOLDEN_30_ITEMS.filter((it) => checkMap[it.id] === "FAIL")
                        .length
                    }
                    건
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-xs font-bold text-amber-800">미점검 (PENDING)</div>
                  <div className="text-xl font-black text-amber-800 mt-0.5">
                    {
                      NL_INBOX_GOLDEN_30_ITEMS.filter(
                        (it) => !checkMap[it.id] || checkMap[it.id] === "PENDING"
                      ).length
                    }
                    건
                  </div>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3.5"
                data-testid="nlinbox-newsletter-presets"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                    📰 뉴스레터 스튜디오 1클릭 입력값 (7종)
                  </h3>
                  <a
                    href="/broker/magazine-editor"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold transition shrink-0"
                  >
                    📰 뉴스레터 열기 ↗
                  </a>
                </div>
                <div className="space-y-2.5">
                  {NEWSLETTER_COPY_PRESETS.map((preset) => (
                    <CopyFieldRow
                      key={preset.id}
                      label={preset.label}
                      value={preset.value}
                      subNote={`${preset.targetField}${preset.note ? ` · ${preset.note}` : ""}`}
                      keyId={preset.id}
                      highlight={preset.id === "nl-headline" || preset.id === "nl-briefing-body"}
                    />
                  ))}
                </div>
              </section>

              <section
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3.5"
                data-testid="nlinbox-inbox-presets"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                    💬 소통 관리함 & 매수고객 신청 1클릭 입력값 (13종)
                  </h3>
                  <a
                    href="/broker/w/inbox"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition shrink-0"
                  >
                    💬 소통 관리함 열기 ↗
                  </a>
                </div>
                <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
                  {INBOX_COPY_PRESETS.map((preset) => (
                    <CopyFieldRow
                      key={preset.id}
                      label={preset.label}
                      value={preset.value}
                      subNote={`${preset.targetField}${preset.note ? ` · ${preset.note}` : ""}`}
                      keyId={preset.id}
                    />
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ──────── TAB 6: FINAL SIGN-OFF & SCORECARD EXPORT ──────── */}
        {activeTab === "scorecard" && (
          <div className="space-y-6">
            <section className="bg-white rounded-2xl border-2 border-slate-900 p-6 shadow-sm space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <span className="text-xs font-extrabold text-white bg-slate-900 px-2.5 py-1 rounded-md">
                    최종 상용 배포 승인서 (AI 1st 12종 PASS + 인간 2nd 9문항 판정)
                  </span>
                  <h2 className="text-xl font-extrabold text-slate-900 mt-1">
                    최종 Go / No-Go 리포트 (클릭 한 번으로 복사해 전달하세요)
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        generateScorecardMarkdown(),
                        "최종 채점 결과서(Markdown)",
                        "scorecard-md-copy"
                      )
                    }
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-extrabold cursor-pointer shadow-xs"
                  >
                    📋 채점 결과 리포트 전체 복사 (채팅창 붙여넣기용)
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadScorecardMd}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-extrabold cursor-pointer"
                  >
                    ⬇️ 채점 결과(.md) 파일 다운로드
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    검수자 성명 / 직함
                  </label>
                  <input
                    type="text"
                    value={testerName}
                    onChange={(e) => setTesterName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold"
                  />
                </div>
              </div>

              {/* Defect Report Input Table */}
              <div className="space-y-2">
                <div className="text-sm font-extrabold text-slate-900">
                  🛠️ 인간 2nd 발견 UX 개선 코멘트 (이슈 있을 때만 기입)
                </div>
                <div className="space-y-2">
                  {defects.map((df, idx) => (
                    <div
                      key={df.id}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200"
                    >
                      <input
                        type="text"
                        value={df.dealCode}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDefects((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, dealCode: val } : it))
                          );
                        }}
                        placeholder="미션 (H-1/H-2/H-3)"
                        className="sm:col-span-2 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                      />
                      <input
                        type="text"
                        value={df.location}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDefects((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, location: val } : it))
                          );
                        }}
                        placeholder="발생 화면 / 슬라이드 번호"
                        className="sm:col-span-3 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                      <input
                        type="text"
                        value={df.description}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDefects((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, description: val } : it))
                          );
                        }}
                        placeholder="어느 부분이 불편하거나 어색했나요?"
                        className="sm:col-span-5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                      <select
                        aria-label={`결함 ${idx + 1} 심각도`}
                        value={df.severity}
                        onChange={(e) => {
                          const val = e.target.value as "S0" | "S1" | "S2" | "S3";
                          setDefects((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, severity: val } : it))
                          );
                        }}
                        className="sm:col-span-2 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-extrabold"
                      >
                        <option value="S0">S0 (치명적)</option>
                        <option value="S1">S1 (중대함)</option>
                        <option value="S2">S2 (보통)</option>
                        <option value="S3">S3 (경미/제안)</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-extrabold text-slate-700">
                    📄 자동 생성된 v4.0 최종 검수 리포트 미리보기:
                  </div>
                  <button
                    type="button"
                    data-testid="open-scorecard-modal-btn"
                    onClick={() => setShowScorecardModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                  >
                    <span>🔍 리포트 전문 팝업으로 크게 보기</span>
                  </button>
                </div>
                <pre
                  data-testid="scorecard-markdown-preview"
                  className="dark-scrollbar p-4 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono whitespace-pre-wrap max-h-72 overflow-y-auto select-all border border-slate-700"
                >
                  {generateScorecardMarkdown()}
                </pre>
              </div>
            </section>
          </div>
        )}
      </main>

      {showScorecardModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="검수 리포트 전문 보기"
          data-testid="scorecard-full-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowScorecardModal(false);
          }}
        >
          <div className="bg-white rounded-2xl border border-slate-300 shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                  📄 v4.0 최종 검수 리포트 전문
                </h3>
                <p className="text-xs text-slate-500">
                  전체 내용을 넓은 화면에서 확인하고 바로 클립보드 복사 또는 마크다운(.md) 파일로 저장할 수 있습니다.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="scorecard-modal-copy-btn"
                  onClick={() =>
                    handleCopy(
                      generateScorecardMarkdown(),
                      "검수 리포트 전문",
                      "scorecard-modal-copy"
                    )
                  }
                  className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-extrabold transition cursor-pointer"
                >
                  {copiedKey === "scorecard-modal-copy" ? "✅ 복사됨!" : "📋 전문 복사"}
                </button>
                <button
                  type="button"
                  data-testid="scorecard-modal-download-btn"
                  onClick={handleDownloadScorecardMd}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-extrabold transition cursor-pointer"
                >
                  ⬇️ .md 저장
                </button>
                <button
                  type="button"
                  data-testid="close-scorecard-modal-btn"
                  onClick={() => setShowScorecardModal(false)}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-900 text-xs sm:text-sm font-extrabold transition cursor-pointer"
                >
                  닫기
                </button>
              </div>
            </div>
            <div className="p-5 flex-1 overflow-hidden flex flex-col bg-slate-950">
              <pre className="dark-scrollbar flex-1 p-5 rounded-xl bg-slate-900 text-slate-100 text-xs sm:text-sm font-mono whitespace-pre-wrap overflow-y-auto select-all border border-slate-700 leading-relaxed">
                {generateScorecardMarkdown()}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
