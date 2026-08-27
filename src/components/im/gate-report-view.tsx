"use client";

import React, { useState } from "react";
import type { GateReport, GateResult } from "@/domain/building/mobile-im/quality-gates-v02";

/**
 * D37 M-4: Gate 결과 상세 표시 UI
 *
 * 39종 품질 게이트의 통과/차단/경고 결과를 시각적으로 표시합니다.
 * im-management-panel에서 사용됩니다.
 */

function GateRow({ result }: { result: GateResult }) {
  const icon = result.passed ? "✅" : result.severity === "block" ? "🛑" : "⚠️";
  const color = result.passed
    ? "text-neutral-400"
    : result.severity === "block"
      ? "text-red-400"
      : "text-amber-400";
  const bg = result.passed
    ? ""
    : result.severity === "block"
      ? "bg-red-900/10"
      : "bg-amber-900/10";

  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded ${bg}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs shrink-0">{icon}</span>
        <span className="text-[11px] text-neutral-500 font-mono shrink-0 w-8">{result.id}</span>
        <span className={`text-xs truncate ${color}`}>{result.label}</span>
      </div>
      <span
        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
          result.passed
            ? "text-emerald-400"
            : result.severity === "block"
              ? "bg-red-500/20 text-red-400"
              : "bg-amber-500/20 text-amber-400"
        }`}
      >
        {result.passed ? "통과" : result.severity === "block" ? "차단" : "경고"}
      </span>
    </div>
  );
}

export interface GateReportViewProps {
  report: GateReport;
  /** 접힌 상태로 시작 */
  defaultCollapsed?: boolean;
}

export function GateReportView({ report, defaultCollapsed = true }: GateReportViewProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const totalCount = report.results.length;
  const passedCount = report.results.filter((r) => r.passed).length;
  const blockCount = report.failedBlocks.length;
  const warnCount = report.failedWarns.length;

  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-800/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">
            {report.blocked ? "🛑" : report.allPassed ? "✅" : "⚠️"} 품질 게이트
          </span>
          <span className="text-xs text-neutral-400">
            {passedCount}/{totalCount} 통과
          </span>
        </div>
        <div className="flex items-center gap-2">
          {blockCount > 0 && (
            <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold">
              {blockCount} 차단
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">
              {warnCount} 경고
            </span>
          )}
          <svg
            className={`w-4 h-4 text-neutral-400 transition-transform ${collapsed ? "" : "rotate-180"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="border-t border-neutral-800 px-1 py-2 space-y-0.5 max-h-80 overflow-y-auto">
          {/* Failed blocks first */}
          {report.failedBlocks.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                발행 차단 ({report.failedBlocks.length})
              </div>
              {report.failedBlocks.map((r) => (
                <GateRow key={r.id} result={r} />
              ))}
            </>
          )}

          {/* Warnings */}
          {report.failedWarns.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                품질 경고 ({report.failedWarns.length})
              </div>
              {report.failedWarns.map((r) => (
                <GateRow key={r.id} result={r} />
              ))}
            </>
          )}

          {/* Passed */}
          {passedCount > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                통과 ({passedCount})
              </div>
              {report.results
                .filter((r) => r.passed)
                .map((r) => (
                  <GateRow key={r.id} result={r} />
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
