"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  TESTGUIDE_DEALS,
  WAVE_C_MISSIONS,
  PPTX_10_AUDIT_ITEMS,
  NEWSLETTER_COPY_PRESETS,
  INBOX_COPY_PRESETS,
  NL_INBOX_GOLDEN_30_ITEMS,
  type TestGuideDeal,
} from "@/lib/testguide/testguide-data";

type ActiveTabId = "overview" | "deal1" | "deal2" | "deal3" | "wavec" | "nlinbox" | "scorecard";
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

const STORAGE_KEY = "credeal-testguide-state-v1";

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

  // Stopwatch state
  const [timerDealId, setTimerDealId] = useState<TimerTargetId>("deal1");
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  // Persisted test results
  const [testerName, setTesterName] = useState<string>("테스터 A & B");
  const [metrics, setMetrics] = useState<Record<TimerTargetId, DealMetrics>>(
    INITIAL_METRICS
  );
  const [checkMap, setCheckMap] = useState<Record<string, CheckStatus>>({});
  const [defects, setDefects] = useState<DefectEntry[]>([
    { id: 1, dealCode: "#1 동교동", location: "", description: "", severity: "S2" },
    { id: 2, dealCode: "#2 부천", location: "", description: "", severity: "S2" },
    { id: 3, dealCode: "#3 역삼동", location: "", description: "", severity: "S2" },
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
        // Fallback textarea copy
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
    const lines: string[] = [
      `# 📊 CRE DealCard 상용화 합동 골든테스트 채점 결과서`,
      `- **작성자(테스터)**: ${testerName}`,
      `- **제출일시**: ${new Date().toLocaleString("ko-KR")}`,
      ``,
      `## 1. 매물별 정량 UX 스톱워치 계측 기록`,
      `| 측정 항목 | 합격 기준 | 매물 #1 (동교동) | 매물 #2 (부천) | 매물 #3 (역삼동) |`,
      `|:---|:---:|:---:|:---:|:---:|`,
      `| **1. TTF-IM (초안 완성 시간)** | ≤ 8분 00초 | ${formatTime(metrics.deal1.seconds)} | ${formatTime(metrics.deal2.seconds)} | ${formatTime(metrics.deal3.seconds)} |`,
      `| **2. 망설임 횟수 (Hesitation)** | ≤ 2회 | ${metrics.deal1.hesitations}회 | ${metrics.deal2.hesitations}회 | ${metrics.deal3.hesitations}회 |`,
      `| **3. 오작동 횟수 (Misclick)** | ≤ 1회 | ${metrics.deal1.misclicks}회 | ${metrics.deal2.misclicks}회 | ${metrics.deal3.misclicks}회 |`,
      `| **4. 현업 발송 체감 만족도** | ≥ 4.2 / 5 | ${metrics.deal1.satisfaction}점 / 5 | ${metrics.deal2.satisfaction}점 / 5 | ${metrics.deal3.satisfaction}점 / 5 |`,
      ``,
      `## 2. 매물별 핵심 수치 & 변이(Wave A/B) 점검 결과`,
    ];

    for (const d of TESTGUIDE_DEALS) {
      const m = metrics[d.id];
      lines.push(`### [${d.code}] ${d.name} (${d.jibunAddress})`);
      lines.push(`- 대지/연면적 실측: \`${m.actualLandGfa}\``);
      lines.push(`- 보증금/월세 실측: \`${m.actualDepositRent}\``);
      lines.push(`- 점유율 실측: \`${m.actualOccupancy}\``);
      lines.push(`- Wave A → B 수익률 변화: \`${m.actualYieldChange}\``);
      lines.push(
        `- Wave A 점검: ` +
          d.waveAChecks.map((c) => `${c.id}=${checkMap[c.id] || "PENDING"}`).join(", ")
      );
      lines.push(
        `- Wave B 점검: ` +
          d.waveBChecks.map((c) => `${c.id}=${checkMap[c.id] || "PENDING"}`).join(", ")
      );
      lines.push(``);
    }

    lines.push(`## 3. Wave C (4대 워크스페이스 & 모바일 & 보안) 결과`);
    for (const m of WAVE_C_MISSIONS) {
      lines.push(`- **${m.id}** (${m.title}): **${checkMap[m.id] || "PENDING"}**`);
    }
    lines.push(``);

    lines.push(`## 3-B. 뉴스레터 스튜디오 & 소통 관리함 상용화 골든테스트 (30문항)`);
    lines.push(
      `- **뉴스레터 발행 소요시간 (목표 ≤3분)**: ${formatTime(metrics.newsletter?.seconds || 0)} (망설임 ${metrics.newsletter?.hesitations || 0}회 / 오작동 ${metrics.newsletter?.misclicks || 0}회)`
    );
    lines.push(
      `- **소통함 승인·발송 소요시간 (목표 ≤1분)**: ${formatTime(metrics.inbox?.seconds || 0)} (망설임 ${metrics.inbox?.hesitations || 0}회 / 오작동 ${metrics.inbox?.misclicks || 0}회)`
    );
    lines.push(`| 코드 | 영역 | 수행 주체 | 검증 시나리오 | 불변규칙 | 판정 |`);
    lines.push(`|:---:|:---|:---:|:---|:---:|:---:|`);
    for (const item of NL_INBOX_GOLDEN_30_ITEMS) {
      const st = checkMap[item.id] || "PENDING";
      lines.push(
        `| ${item.id} | ${item.wave} | ${item.actor} | ${item.title} | ${item.invariantCode} | **${st}** |`
      );
    }
    lines.push(``);

    lines.push(`## 4. PPTX 10대 정밀 검수표`);
    lines.push(`| 번호 | 검수 항목 | 매물 #1 (동교동) | 매물 #2 (부천) | 매물 #3 (역삼동) |`);
    lines.push(`|:---:|:---|:---:|:---:|:---:|`);
    for (const item of PPTX_10_AUDIT_ITEMS) {
      const s1 = checkMap[`PPTX-${item.no}-deal1`] || "PENDING";
      const s2 = checkMap[`PPTX-${item.no}-deal2`] || "PENDING";
      const s3 = checkMap[`PPTX-${item.no}-deal3`] || "PENDING";
      lines.push(`| ${item.no} | ${item.title} | ${s1} | ${s2} | ${s3} |`);
    }
    lines.push(``);

    const activeDefects = defects.filter((df) => df.description.trim().length > 0);
    lines.push(`## 5. 발견된 결함 / 개선 요청 (${activeDefects.length}건)`);
    if (activeDefects.length === 0) {
      lines.push(`- 발견된 결함 없음 (0건)`);
    } else {
      for (const df of activeDefects) {
        lines.push(`- **[${df.severity}] ${df.dealCode} (${df.location || "공통"})**: ${df.description}`);
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
    a.download = `골든테스트_채점결과_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("⬇️ 채점 결과 마크다운(.md) 파일이 다운로드되었습니다!");
  }, [generateScorecardMarkdown, showToast]);

  const generateNlInboxReportMarkdown = useCallback(() => {
    const passCount = NL_INBOX_GOLDEN_30_ITEMS.filter((it) => checkMap[it.id] === "PASS").length;
    const failCount = NL_INBOX_GOLDEN_30_ITEMS.filter((it) => checkMap[it.id] === "FAIL").length;
    const pendingCount = NL_INBOX_GOLDEN_30_ITEMS.length - passCount - failCount;

    const lines: string[] = [
      `# 📰·💬 뉴스레터 스튜디오 & 소통 관리함 상용화 골든테스트 채점 결과서 (30문항)`,
      `- **작성자(테스터)**: ${testerName}`,
      `- **제출일시**: ${new Date().toLocaleString("ko-KR")}`,
      `- **종합 판정**: 총 30문항 중 **PASS ${passCount}건** / FAIL ${failCount}건 / 미점검 ${pendingCount}건`,
      `- **뉴스레터 발행 소요시간 (목표 ≤ 3분 00초)**: ${formatTime(metrics.newsletter?.seconds || 0)} (망설임 ${metrics.newsletter?.hesitations || 0}회, 오작동 ${metrics.newsletter?.misclicks || 0}회, 만족도 ${metrics.newsletter?.satisfaction || 5}점/5)`,
      `- **소통함 열람승인·발송 소요시간 (목표 ≤ 1분 00초)**: ${formatTime(metrics.inbox?.seconds || 0)} (망설임 ${metrics.inbox?.hesitations || 0}회, 오작동 ${metrics.inbox?.misclicks || 0}회, 만족도 ${metrics.inbox?.satisfaction || 5}점/5)`,
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

    const activeDefects = defects.filter((df) => df.description.trim().length > 0);
    lines.push(``);
    lines.push(`## 2. 발견된 결함 / 개선 요청 (${activeDefects.length}건)`);
    if (activeDefects.length === 0) {
      lines.push(`- 발견된 결함 없음 (0건)`);
    } else {
      for (const df of activeDefects) {
        lines.push(`- **[${df.severity}] ${df.dealCode} (${df.location || "공통"})**: ${df.description}`);
      }
    }

    return lines.join("\n");
  }, [testerName, checkMap, metrics, defects]);

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
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-blue-600 text-white font-extrabold text-lg">
                🧪
              </span>
              <div>
                <h1 className="text-base sm:text-lg font-extrabold text-slate-900 leading-tight">
                  CRE DealCard 합동 골든테스트 인터랙티브 가이드
                </h1>
                <p className="text-xs text-slate-500">
                  클릭 한 번으로 주소·메모·렌트롤(CSV/TSV)을 복사하고 매물별 사진 4장(JPG·PNG·WebP)을 바로 내려받으세요
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
            </div>
          </div>

          {/* Built-in Stopwatch & Hesitation/Misclick Counter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-amber-400">⏱️ 스톱워치 계측기:</span>
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
                <option value="deal1">매물 #1 (동교동 77억 · 목표 ≤8분)</option>
                <option value="deal2">매물 #2 (부천 58억 · 목표 ≤8분)</option>
                <option value="deal3">매물 #3 (역삼동 2,000억 · 목표 ≤8분)</option>
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
                <span className="text-slate-300">망설임(≤2회):</span>
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
                <span className="text-slate-300">오작동(≤1회):</span>
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

          {/* Navigation Tabs */}
          <nav
            aria-label="골든테스트 단계 탭"
            className="flex items-center gap-1.5 overflow-x-auto pb-1"
          >
            {[
              { id: "overview", label: "📘 0. 전체 안내 & 구조도" },
              { id: "deal1", label: "🏢 1. 매물 #1 동교동 (77억)" },
              { id: "deal2", label: "🏥 2. 매물 #2 부천 (58억)" },
              { id: "deal3", label: "🏙️ 3. 매물 #3 역삼동 (2,000억)" },
              { id: "wavec", label: "🤝 4. Wave C 합동·보안 미션" },
              { id: "nlinbox", label: "📰·💬 뉴스레터·소통함 골든테스트 (30문항)" },
              { id: "scorecard", label: "📊 5. PPTX 검수 & 채점표 제출" },
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
        {/* ──────── TAB 0: OVERVIEW ──────── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-extrabold">
                💡 시작 전 1분 핵심 요약
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                어려운 타이핑 없이 [📋 클릭 복사]와 [📦 사진·CSV 내려받기]만으로 따라하세요!
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                본 페이지는 현업 상업용 부동산(CRE) 거래에서 실제 사용된{" "}
                <strong>3건의 실전 IM 자료(동교동 77억, 부천 심곡동 58억, 역삼동 여삼빌딩 2,000억)</strong>를
                그대로 시스템에 넣어 검증하는 인터랙티브 가이드입니다. 화면 상단의{" "}
                <strong>[🚀 ② IM 스튜디오 열기]</strong>를 눌러 새 창에 띄워두고, 아래 매물 탭(#1, #2, #3)을
                눌러 하나씩 복사해 붙여넣으시면 됩니다.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="text-sm font-extrabold text-blue-700">
                    👤 테스터 A (발신 중개사 #1)
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    PC 일반 창에서 <strong>중개사 계정 #1</strong>로 로그인하여 매물 3건 등록(Wave A) →
                    가격·공실 수정 및 F5 새로고침 확인(Wave B) → PPTX 다운로드 및 딜카드 공유·승인(Wave C)을
                    수행합니다.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="text-sm font-extrabold text-emerald-700">
                    🕵️ 테스터 B (수신 고객 & 타 중개사 #2)
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    ① <strong>시크릿 창(Ctrl+Shift+N)</strong>에서 비로그인 매수자로 딜카드 열람 요청 및
                    IM-Lite 수익률 시뮬레이션을 조작하고, ② <strong>중개사 계정 #2</strong>로 남의 매물이
                    차단(RLS)되는지 확인합니다.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="text-sm font-extrabold text-purple-700">
                    🤖 Antigravity AI (자동 감사기)
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    테스터 A·B가 다운로드한 PPTX 파일과 채점표 결과를 받아, 선행 검증된 Ground Truth 오라클과
                    3자 대조(Triad Cross-Check)를 수행합니다.
                  </p>
                </div>
              </div>
            </div>

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
                        • <strong>매매가</strong>: {d.askingPriceEok}억 원 (Wave B: {d.waveBPriceEok}억)
                      </div>
                      <div>
                        • <strong>면적</strong>: 대지 {d.specs.landAreaSqm}㎡ ({d.specs.landAreaPyeong}평) / 연면적{" "}
                        {d.specs.gfaSqm}㎡ ({d.specs.gfaPyeong}평)
                      </div>
                      <div>
                        • <strong>임대현황</strong>: 보 {d.rentSummary.totalDepositManwon} / 월{" "}
                        {d.rentSummary.totalMonthlyRentManwon}
                      </div>
                      <div>
                        • <strong>첨부 에셋</strong>: CSV 1종 + 사진 4장 (JPG 2 · PNG 1 · WebP 1)
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-xs font-extrabold text-slate-700">
                        🎯 숨겨진 실전 함정 (Traps):
                      </div>
                      {d.traps.map((t) => (
                        <div key={t.code} className="text-xs text-slate-600 leading-snug">
                          <span className="font-extrabold text-amber-700">[{t.code}]</span> {t.title}
                        </div>
                      ))}
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

        {/* ──────── TAB 1, 2, 3: DEAL WORKBENCH ──────── */}
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

              {/* Trap Alert Boxes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                {activeDeal.traps.map((t) => (
                  <div
                    key={t.code}
                    className="p-3.5 rounded-xl bg-slate-800/90 border border-slate-700 space-y-1"
                  >
                    <div className="text-xs font-extrabold text-amber-400">
                      🚨 [{t.code}] {t.title}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{t.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* STEP 1: Tab ① 기본정보 & 주소 자동 채움 */}
            <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <span className="text-xs font-extrabold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">
                    IM 스튜디오 — ① 건물 기본 정보 탭
                  </span>
                  <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1">
                    Step {activeDeal.number}-1. 기본 정보 입력값 원클릭 복사
                  </h3>
                </div>
                <span className="text-xs text-slate-500 font-semibold">
                  💡 왼쪽 목록에서 [+ 새 IM]을 누른 뒤 아래 값을 순서대로 복사해 붙여넣으세요
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
                  subNote="주소 입력 후 [주소로 건물 정보 자동 채우기] 클릭!"
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
                  label="건물 주소 (도로명 · 선택)"
                  value={activeDeal.roadAddress}
                  subNote="지번 대신 도로명 조회도 가능"
                  keyId={`${activeDeal.id}-road`}
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

              <CopyFieldRow
                label="⑧ 명도 및 인도 조건"
                value={activeDeal.brokerInfo.handoverNote}
                keyId={`${activeDeal.id}-handover`}
              />

              {/* Full Broker Memo Block */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-extrabold text-slate-700">
                      📝 현장 중개 메모 원문 (전체 복사용)
                    </span>
                    <p className="text-xs text-slate-500">
                      메모 입력란이 있거나 참고용으로 전체 스펙을 붙여넣을 때 사용하세요
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        activeDeal.brokerMemoText,
                        `${activeDeal.shortName} 현장 메모 전문`,
                        `${activeDeal.id}-memo`
                      )
                    }
                    className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition cursor-pointer ${
                      copiedKey === `${activeDeal.id}-memo`
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-900 hover:bg-slate-800 text-white"
                    }`}
                  >
                    {copiedKey === `${activeDeal.id}-memo`
                      ? "✅ 현장 메모 전체 복사됨!"
                      : "📋 현장 메모 전체 복사"}
                  </button>
                </div>
                <pre className="text-xs text-slate-700 font-mono whitespace-pre-wrap bg-white p-3.5 rounded-lg border border-slate-200 max-h-48 overflow-y-auto select-all">
                  {activeDeal.brokerMemoText}
                </pre>
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
                    Step {activeDeal.number}-2. 층별 렌트롤 한 번에 불러오기 (TSV 복붙 또는 CSV 파일 업로드)
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

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-950 space-y-1">
                <div className="font-extrabold">
                  💡 어떻게 입력하나요? (가장 편한 방법을 고르세요!)
                </div>
                <div>
                  • <strong>방법 A (1초 복붙 권장)</strong>: 위 파란 버튼{" "}
                  <strong>[📋 방법 A: 엑셀 붙여넣기용(TSV) 원클릭 복사]</strong>를 누른 뒤, IM 스튜디오{" "}
                  <strong>② 층별 임대 현황</strong> 탭 우측 상단의 <strong>[엑셀 붙여넣기]</strong> 버튼을 눌러{" "}
                  <code>Ctrl+V</code>로 붙여넣고 적용하세요!
                </div>
                <div>
                  • <strong>방법 B (CSV 파일 첨부)</strong>: 위 검은 버튼{" "}
                  <strong>[⬇️ 방법 B: {activeDeal.csvFilename} 다운로드]</strong>를 받아 IM 스튜디오 상단의{" "}
                  <strong>[엑셀/CSV 파일로 렌트롤 한 번에 올리기]</strong>에 파일을 끌어다 놓으세요!
                </div>
                <div className="pt-1 font-bold text-emerald-800">
                  📌 기대 합계: 총 보증금 {activeDeal.rentSummary.totalDepositManwon} / 월 임대료{" "}
                  {activeDeal.rentSummary.totalMonthlyRentManwon} / 점유율 {activeDeal.rentSummary.occupancyPct}
                </div>
              </div>

              {/* Rent Roll Table Preview */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      {activeDeal.csvContent
                        .split("\n")[0]
                        .split(",")
                        .map((col, idx) => (
                          <th key={idx} className="py-2.5 px-3 font-extrabold whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {activeDeal.csvContent
                      .split("\n")
                      .slice(1)
                      .map((rowStr, rIdx) => {
                        const cols = rowStr.split(",");
                        const isSpecial =
                          rowStr.includes("통합") ||
                          rowStr.includes("합산") ||
                          rowStr.includes("공실") ||
                          rowStr.includes("자가사용") ||
                          rowStr.includes("주차타워");
                        return (
                          <tr
                            key={rIdx}
                            className={isSpecial ? "bg-amber-50/70 font-semibold" : "bg-white"}
                          >
                            {cols.map((c, cIdx) => (
                              <td key={cIdx} className="py-2 px-3 whitespace-nowrap text-slate-800">
                                {c}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* STEP 3: Tab ③ 핵심 장점 3가지 & 담당 중개사 정보 */}
            <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <span className="text-xs font-extrabold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-md">
                    IM 스튜디오 — ③ 핵심 장점 · 문구 탭
                  </span>
                  <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1">
                    Step {activeDeal.number}-3. 핵심 장점 3가지 & 담당 공인중개사 정보 원클릭 복사
                  </h3>
                </div>
                <span className="text-xs font-bold text-purple-700 bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-200">
                  ✨ IM 스튜디오에서 [AI로 쓰기] 버튼을 누르면 아래 3가지 검증 문구가 1:1 동일하게 자동 완성됩니다! (직접 복사해 넣어도 동일)
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {activeDeal.waveAHighlights.map((hl, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                  >
                    <div className="text-xs font-extrabold text-slate-700">{hl.toneLabel}</div>
                    <CopyFieldRow
                      label={`장점 ${idx + 1} 한 줄 제목`}
                      value={hl.headline}
                      keyId={`${activeDeal.id}-hl-head-${idx}`}
                      highlight
                    />
                    <CopyFieldRow
                      label={`장점 ${idx + 1} 설명 문구`}
                      value={hl.brief}
                      keyId={`${activeDeal.id}-hl-brief-${idx}`}
                    />
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-200">
                <div className="text-sm font-extrabold text-slate-800 mb-2">
                  👤 담당 공인중개사 정보
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <CopyFieldRow
                    label="중개법인 / 사무소명"
                    value={activeDeal.brokerInfo.brokerageName}
                    keyId={`${activeDeal.id}-brokerage`}
                  />
                  <CopyFieldRow
                    label="담당 공인중개사 성명"
                    value={activeDeal.brokerInfo.brokerName}
                    keyId={`${activeDeal.id}-brokername`}
                  />
                  <CopyFieldRow
                    label="문의 연락처"
                    value={activeDeal.brokerInfo.brokerPhone}
                    keyId={`${activeDeal.id}-brokerphone`}
                  />
                </div>
              </div>
            </section>

            {/* STEP 4: Tab ④ 건물 사진 4장 첨부 (JPG 2 + PNG 1 + WebP 1) */}
            <section className="bg-white rounded-2xl border-2 border-blue-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <span className="text-xs font-extrabold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">
                    IM 스튜디오 — ④ 사진·위치·만들기 탭
                  </span>
                  <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1">
                    Step {activeDeal.number}-4. 건물 사진 4장 내려받기 및 첨부 (JPG 2장 + PNG 1장 + WebP 1장)
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                    아래 <strong>[📦 이 매물 사진 4장 한 번에 내려받기]</strong> 버튼을 누르면 내 PC{" "}
                    <code>다운로드(Downloads)</code> 폴더에 4개 이미지가 저장됩니다. IM 스튜디오{" "}
                    <strong>④ 사진·위치·만들기</strong> 탭에서 <strong>[+ 사진 파일 선택]</strong>을 눌러 4장을
                    모두 선택해 첨부하세요!
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
                      <div className="relative h-40 bg-slate-200 overflow-hidden">
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
                        <div className="text-xs font-mono font-bold text-slate-900 truncate" title={img.filename}>
                          {img.filename}
                        </div>
                        <p className="text-xs text-slate-600 leading-snug">{img.caption}</p>
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

            {/* STEP 5: Wave A Checklists & Wave B Mutation Instructions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Wave A Checklist */}
              <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                      Wave A — 초안 생성 검증
                    </span>
                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mt-1">
                      Step {activeDeal.number}-5A. 첫 번째 PPTX 내려받기 후 정답 대조
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => markAllChecksPass(activeDeal.waveAChecks.map((c) => c.id))}
                    className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-extrabold cursor-pointer"
                  >
                    전체 PASS 체크
                  </button>
                </div>

                <div className="space-y-3">
                  {activeDeal.waveAChecks.map((chk) => {
                    const st = checkMap[chk.id] || "PENDING";
                    return (
                      <div
                        key={chk.id}
                        className={`p-3.5 rounded-xl border transition ${
                          st === "PASS"
                            ? "bg-emerald-50/60 border-emerald-300"
                            : st === "FAIL"
                            ? "bg-rose-50/60 border-rose-300"
                            : "bg-slate-50 border-slate-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-slate-900 text-white">
                                {chk.id}
                              </span>
                              {chk.trapCode && (
                                <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-amber-200 text-amber-950">
                                  {chk.trapCode}
                                </span>
                              )}
                              <span className="text-sm font-extrabold text-slate-900">
                                {chk.title}
                              </span>
                            </div>
                            <div className="text-xs text-emerald-800 font-bold">
                              ⭕ 정답(O): {chk.expected}
                            </div>
                            <div className="text-xs text-rose-700">
                              ❌ 불합격(X): {chk.failCondition}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => toggleCheck(chk.id, "PASS")}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${
                                st === "PASS"
                                  ? "bg-emerald-600 text-white"
                                  : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              PASS
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleCheck(chk.id, "FAIL")}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${
                                st === "FAIL"
                                  ? "bg-rose-600 text-white"
                                  : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              FAIL
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Wave B Mutation & Checklist */}
              <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <span className="text-xs font-extrabold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-md">
                      Wave B — 값 변경(Mutation) & 영속성 검증
                    </span>
                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mt-1">
                      Step {activeDeal.number}-5B. 가격/공실 변경 후 두 번째 PPTX 대조
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => markAllChecksPass(activeDeal.waveBChecks.map((c) => c.id))}
                    className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-extrabold cursor-pointer"
                  >
                    전체 PASS 체크
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-950 space-y-2">
                  <div className="font-extrabold">🔄 Wave B 수정 지시사항:</div>
                  <p>{activeDeal.waveBMutationSummary}</p>
                </div>

                <div className="space-y-2.5">
                  <CopyFieldRow
                    label="Wave B 수정 매매가 ('억' 입력란)"
                    value={activeDeal.waveBPriceEok}
                    subNote={`= ${activeDeal.waveBPriceEok}억 원 (총액 ${activeDeal.waveBPriceManwon}만원)`}
                    keyId={`${activeDeal.id}-waveb-price`}
                    highlight
                  />
                  {activeDeal.manualOverrideSample && (
                    <CopyFieldRow
                      label="Wave B 수동편집 잠금 검증 문구 (핵심 장점 1번 제목에 복붙)"
                      value={activeDeal.manualOverrideSample}
                      keyId={`${activeDeal.id}-waveb-override`}
                      highlight
                    />
                  )}
                  <CopyFieldRow
                    label="Wave B 장점 1번 제목"
                    value={activeDeal.waveBHighlights[0].headline}
                    keyId={`${activeDeal.id}-waveb-hl0`}
                  />
                </div>

                <div className="space-y-3 pt-2">
                  {activeDeal.waveBChecks.map((chk) => {
                    const st = checkMap[chk.id] || "PENDING";
                    return (
                      <div
                        key={chk.id}
                        className={`p-3.5 rounded-xl border transition ${
                          st === "PASS"
                            ? "bg-emerald-50/60 border-emerald-300"
                            : st === "FAIL"
                            ? "bg-rose-50/60 border-rose-300"
                            : "bg-slate-50 border-slate-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-slate-900 text-white">
                                {chk.id}
                              </span>
                              <span className="text-sm font-extrabold text-slate-900">
                                {chk.title}
                              </span>
                            </div>
                            <div className="text-xs text-emerald-800 font-bold">
                              ⭕ 정답(O): {chk.expected}
                            </div>
                            <div className="text-xs text-rose-700">
                              ❌ 불합격(X): {chk.failCondition}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => toggleCheck(chk.id, "PASS")}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${
                                st === "PASS"
                                  ? "bg-emerald-600 text-white"
                                  : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              PASS
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleCheck(chk.id, "FAIL")}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${
                                st === "FAIL"
                                  ? "bg-rose-600 text-white"
                                  : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              FAIL
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ──────── TAB 4: WAVE C (CROSS-WORKSPACE & MOBILE & RLS) ──────── */}
        {activeTab === "wavec" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <span className="text-xs font-extrabold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">
                    PART 5 — Wave C 합동 미션
                  </span>
                  <h2 className="text-xl font-extrabold text-slate-900 mt-1">
                    4대 워크스페이스 크로스오버 & 테스터 A ↔ B 실시간 티키타카 미션
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => markAllChecksPass(WAVE_C_MISSIONS.map((m) => m.id))}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-extrabold cursor-pointer"
                >
                  Wave C 전체 PASS 체크
                </button>
              </div>

              {/* Quick Copy Helpers for Tester B */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="text-sm font-extrabold text-slate-900">
                  📋 미션 C-1 & C-5용 테스터 B 원클릭 복붙 도우미
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <CopyFieldRow
                    label="열람 요청자 이름"
                    value="테스터B_매수자"
                    keyId="wavec-name"
                  />
                  <CopyFieldRow
                    label="열람 요청자 연락처"
                    value="010-9999-8888"
                    keyId="wavec-phone"
                  />
                  <CopyFieldRow
                    label="열람 요청 소속/메모"
                    value="골든테스트 패밀리오피스 매수검토"
                    keyId="wavec-memo"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-slate-600 font-semibold">
                    🔒 미션 C-5 가짜 URL 한국어 방어 화면 테스트 링크:
                  </span>
                  <a
                    href="/im-lite/invalid-building-99999"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold"
                  >
                    🔗 /im-lite/invalid-building-99999 새 탭에서 열어보기
                  </a>
                </div>
              </div>

              <div className="space-y-4">
                {WAVE_C_MISSIONS.map((mission) => {
                  const st = checkMap[mission.id] || "PENDING";
                  return (
                    <div
                      key={mission.id}
                      className={`p-5 rounded-2xl border transition ${
                        st === "PASS"
                          ? "bg-emerald-50/50 border-emerald-300"
                          : st === "FAIL"
                          ? "bg-rose-50/50 border-rose-300"
                          : "bg-white border-slate-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded bg-slate-900 text-white text-xs font-extrabold">
                              {mission.id}
                            </span>
                            <span className="px-2.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-bold">
                              {mission.testerRole}
                            </span>
                          </div>
                          <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                            {mission.title}
                          </h3>
                          <ol className="list-decimal list-inside space-y-1 text-xs sm:text-sm text-slate-700">
                            {mission.steps.map((step, sIdx) => (
                              <li key={sIdx} className="leading-relaxed">
                                {step}
                              </li>
                            ))}
                          </ol>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleCheck(mission.id, "PASS")}
                            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold cursor-pointer ${
                              st === "PASS"
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                          >
                            PASS
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleCheck(mission.id, "FAIL")}
                            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold cursor-pointer ${
                              st === "FAIL"
                                ? "bg-rose-600 text-white"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                          >
                            FAIL
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ──────── TAB 4-B: NEWSLETTER & INBOX 30-ITEM GOLDEN TEST WORKBENCH ──────── */}
        {activeTab === "nlinbox" && (
          <div className="space-y-6" data-testid="testguide-nlinbox-panel">
            {/* Header & Live 30-Item Score Summary */}
            <section className="bg-white rounded-2xl border-2 border-indigo-600 p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <span className="text-xs font-extrabold text-white bg-indigo-600 px-2.5 py-1 rounded-md">
                    📰 뉴스레터 스튜디오 & 💬 소통 관리함 — 30문항 합동 골든테스트
                  </span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1.5">
                    1클릭 복붙 프리셋 & 30개 골든 시나리오 실시간 채점 워크벤치
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1">
                    테스터 A(발신 중개사 #1)와 테스터 B(시크릿 창 매수고객 & 타 중개사 #2)가 아래 [📋 클릭 복사] 버튼만으로 15~20분 내에 30개 항목(NL-G01~08, IB-G01~16, SEC-G01~06)을 완주합니다.
                  </p>
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

              {/* Score Progress Pills */}
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

            {/* 1-Click Copy Presets: Newsletter & Inbox Side-by-Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Newsletter Copy Presets */}
              <section
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3.5"
                data-testid="nlinbox-newsletter-presets"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <span className="text-xs font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      Wave 1 복붙 프리셋 (테스터 A)
                    </span>
                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mt-1">
                      📰 뉴스레터 스튜디오 1클릭 입력값 (7종)
                    </h3>
                  </div>
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

              {/* Right: Inbox Copy Presets */}
              <section
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3.5"
                data-testid="nlinbox-inbox-presets"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <span className="text-xs font-extrabold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                      Wave 2 복붙 프리셋 (테스터 B 신청 & 테스터 A 응대)
                    </span>
                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mt-1">
                      💬 소통 관리함 & 매수고객 신청 1클릭 입력값 (13종)
                    </h3>
                  </div>
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
                      highlight={
                        preset.id === "ib-buyer-name" ||
                        preset.id === "ib-call-note" ||
                        preset.id === "ib-correction-notice" ||
                        preset.id === "ib-vip-name"
                      }
                    />
                  ))}
                </div>
              </section>
            </div>

            {/* 30 Golden Scenarios Checklist Grouped by Wave */}
            {(
              [
                "Wave 1 · 뉴스레터 (8문항)",
                "Wave 2 · 소통 관리함 (16문항)",
                "Wave 3 · 보안 격리 & 모바일 (6문항)",
              ] as const
            ).map((waveTitle) => {
              const waveItems = NL_INBOX_GOLDEN_30_ITEMS.filter((it) => it.wave === waveTitle);
              return (
                <section
                  key={waveTitle}
                  className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div>
                      <h3 className="text-lg font-extrabold text-slate-900">{waveTitle}</h3>
                      <p className="text-xs text-slate-500">
                        각 항목을 수행한 뒤 기대 결과와 일치하면 [PASS], 어긋나면 [FAIL]을 눌러주세요.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => markAllChecksPass(waveItems.map((it) => it.id))}
                      className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-extrabold cursor-pointer"
                    >
                      {waveTitle} 일괄 PASS
                    </button>
                  </div>

                  <div className="space-y-3">
                    {waveItems.map((item) => {
                      const st = checkMap[item.id] || "PENDING";
                      return (
                        <div
                          key={item.id}
                          data-testid={`golden30-row-${item.id}`}
                          className={`p-4 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                            st === "PASS"
                              ? "bg-emerald-50/40 border-emerald-300"
                              : st === "FAIL"
                              ? "bg-rose-50/40 border-rose-300"
                              : "bg-slate-50/70 border-slate-200"
                          }`}
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-xs font-extrabold">
                                {item.id}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-bold">
                                {item.actor}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-xs font-bold">
                                불변규칙: {item.invariantCode}
                              </span>
                              <span className="text-sm sm:text-base font-extrabold text-slate-900">
                                {item.title}
                              </span>
                            </div>
                            <div className="text-xs sm:text-sm text-slate-700">
                              <strong>수행 동작:</strong> {item.action}
                            </div>
                            <div className="text-xs sm:text-sm text-emerald-900 font-semibold">
                              <strong>합격 기준(Oracle):</strong> {item.expected}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              data-testid={`golden30-pass-${item.id}`}
                              onClick={() => toggleCheck(item.id, "PASS")}
                              className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${
                                st === "PASS"
                                  ? "bg-emerald-600 text-white shadow-xs"
                                  : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              PASS
                            </button>
                            <button
                              type="button"
                              data-testid={`golden30-fail-${item.id}`}
                              onClick={() => toggleCheck(item.id, "FAIL")}
                              className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${
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
              );
            })}
          </div>
        )}

        {/* ──────── TAB 5: PPTX 10 AUDIT & SCORECARD EXPORT ──────── */}
        {activeTab === "scorecard" && (
          <div className="space-y-6">
            {/* PowerPoint Ctrl+F Helper */}
            <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <span className="text-xs font-extrabold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-md">
                    PART 6 — PPTX 산출물 10대 정밀 검수
                  </span>
                  <h2 className="text-xl font-extrabold text-slate-900 mt-1">
                    다운로드된 PPTX 3개 파일 육안 검수 & Ctrl+F 금칙어 검색 도우미
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const allIds: string[] = [];
                    PPTX_10_AUDIT_ITEMS.forEach((it) => {
                      allIds.push(`PPTX-${it.no}-deal1`, `PPTX-${it.no}-deal2`, `PPTX-${it.no}-deal3`);
                    });
                    markAllChecksPass(allIds);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-extrabold cursor-pointer"
                >
                  PPTX 10대 항목 일괄 PASS 체크
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-xs font-extrabold text-slate-700">
                  🔍 파워포인트 Ctrl+F 검색어 원클릭 복사:
                </span>
                {["NaN", "undefined", "추정 불가", "산출 불가", "확인 필요", "123-45"].map(
                  (token) => (
                    <button
                      key={token}
                      type="button"
                      onClick={() => handleCopy(token, `검색어 ${token}`, `token-${token}`)}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs font-mono font-bold text-slate-800 cursor-pointer"
                    >
                      📋 &quot;{token}&quot; 복사
                    </button>
                  )
                )}
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs sm:text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 border-b border-slate-200">
                      <th className="py-2.5 px-3 font-extrabold">번호</th>
                      <th className="py-2.5 px-3 font-extrabold">검수 항목</th>
                      <th className="py-2.5 px-3 font-extrabold">확인 방법 & 합격 기준</th>
                      <th className="py-2.5 px-3 font-extrabold text-center">매물 #1 (동교동)</th>
                      <th className="py-2.5 px-3 font-extrabold text-center">매물 #2 (부천)</th>
                      <th className="py-2.5 px-3 font-extrabold text-center">매물 #3 (역삼동)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {PPTX_10_AUDIT_ITEMS.map((item) => (
                      <tr key={item.no} className="bg-white hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 font-extrabold text-slate-900">{item.no}</td>
                        <td className="py-2.5 px-3 font-extrabold text-slate-900">{item.title}</td>
                        <td className="py-2.5 px-3 text-xs text-slate-600">
                          <div>• 방법: {item.method}</div>
                          <div className="font-bold text-emerald-800">• 기준: {item.criteria}</div>
                        </td>
                        {(["deal1", "deal2", "deal3"] as const).map((dKey) => {
                          const cid = `PPTX-${item.no}-${dKey}`;
                          const st = checkMap[cid] || "PENDING";
                          return (
                            <td key={dKey} className="py-2.5 px-3 text-center">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => toggleCheck(cid, "PASS")}
                                  className={`px-2 py-1 rounded text-xs font-extrabold cursor-pointer ${
                                    st === "PASS"
                                      ? "bg-emerald-600 text-white"
                                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                  }`}
                                >
                                  PASS
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleCheck(cid, "FAIL")}
                                  className={`px-2 py-1 rounded text-xs font-extrabold cursor-pointer ${
                                    st === "FAIL"
                                      ? "bg-rose-600 text-white"
                                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                  }`}
                                >
                                  FAIL
                                </button>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* PART 7: Final Scorecard & Export */}
            <section className="bg-white rounded-2xl border-2 border-slate-900 p-6 shadow-sm space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <span className="text-xs font-extrabold text-white bg-slate-900 px-2.5 py-1 rounded-md">
                    PART 7 — 최종 채점표 & 리포트 제출
                  </span>
                  <h2 className="text-xl font-extrabold text-slate-900 mt-1">
                    최종 Go / No-Go 채점표 (클릭 한 번으로 복사해 전달하세요)
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
                    테스터 성명 / 팀명
                  </label>
                  <input
                    type="text"
                    value={testerName}
                    onChange={(e) => setTesterName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold"
                  />
                </div>
              </div>

              {/* Editable Metrics Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs sm:text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 border-b border-slate-200">
                      <th className="py-2.5 px-3 font-extrabold">측정 항목</th>
                      <th className="py-2.5 px-3 font-extrabold">합격 기준</th>
                      <th className="py-2.5 px-3 font-extrabold">매물 #1 (동교동)</th>
                      <th className="py-2.5 px-3 font-extrabold">매물 #2 (부천)</th>
                      <th className="py-2.5 px-3 font-extrabold">매물 #3 (역삼동)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-2.5 px-3 font-bold">1. 초안 완성 소요시간 (TTF-IM)</td>
                      <td className="py-2.5 px-3 font-bold text-blue-700">≤ 8분 00초</td>
                      {(["deal1", "deal2", "deal3"] as const).map((dk) => (
                        <td key={dk} className="py-2.5 px-3 font-mono font-bold">
                          {formatTime(metrics[dk].seconds)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-bold">2. 5초 이상 망설임 횟수</td>
                      <td className="py-2.5 px-3 font-bold text-blue-700">≤ 2회</td>
                      {(["deal1", "deal2", "deal3"] as const).map((dk) => (
                        <td key={dk} className="py-2.5 px-3 font-mono font-bold">
                          {metrics[dk].hesitations}회
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-bold">3. 오작동/되돌리기 횟수</td>
                      <td className="py-2.5 px-3 font-bold text-blue-700">≤ 1회</td>
                      {(["deal1", "deal2", "deal3"] as const).map((dk) => (
                        <td key={dk} className="py-2.5 px-3 font-mono font-bold">
                          {metrics[dk].misclicks}회
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-bold">4. 현업 발송 만족도 (5점 만점)</td>
                      <td className="py-2.5 px-3 font-bold text-blue-700">≥ 4.2점</td>
                      {(["deal1", "deal2", "deal3"] as const).map((dk) => (
                        <td key={dk} className="py-2.5 px-3">
                          <select
                            aria-label={`${dk} 만족도 점수`}
                            value={metrics[dk].satisfaction}
                            onChange={(e) =>
                              setMetrics((prev) => ({
                                ...prev,
                                [dk]: { ...prev[dk], satisfaction: Number(e.target.value) },
                              }))
                            }
                            className="px-2 py-1 rounded border border-slate-300 font-bold"
                          >
                            {[5, 4.5, 4, 3.5, 3, 2, 1].map((score) => (
                              <option key={score} value={score}>
                                {score}점 / 5점
                              </option>
                            ))}
                          </select>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Defect Report Input Table */}
              <div className="space-y-2">
                <div className="text-sm font-extrabold text-slate-900">
                  🛠️ 발견된 결함 / 개선 요청 메모 (이슈 발생 시 기입)
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
                        placeholder="매물 (#1/#2/#3)"
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
                        placeholder="무엇이 어떻게 잘못 나왔나요? (기대 정답 vs 실제 화면)"
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

              {/* Generated Markdown Preview */}
              <div className="space-y-1.5">
                <div className="text-xs font-extrabold text-slate-600">
                  📄 자동 생성된 채점 리포트 미리보기:
                </div>
                <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono whitespace-pre-wrap max-h-64 overflow-y-auto select-all">
                  {generateScorecardMarkdown()}
                </pre>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
