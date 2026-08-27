"use client";

import React, { useState } from "react";

/**
 * D35 §4: PPTX 셀프 검증 감사 리포트 뷰
 *
 * PPTX 다운로드 후 렌더 결과를 파서로 역분석하여
 * 레이아웃/표준 위반을 시각적으로 표시합니다.
 */

export interface PptxAuditData {
  layoutViolations: string[];
  standardViolations: string[];
  totalViolations: number;
  slideCount?: number;
  imageCount?: number;
  textCount?: number;
}

function ViolationRow({ text, kind }: { text: string; kind: "layout" | "standard" }) {
  // G코드 추출 (예: "G31: 크로핑률 55.2% ≥ 45%")
  const gateMatch = text.match(/^(G\d+|QG\d+):\s*/);
  const gateCode = gateMatch?.[1] ?? "";
  const message = gateMatch ? text.slice(gateMatch[0].length) : text;

  const icon = kind === "layout" ? "📐" : "📝";
  const color = kind === "layout" ? "text-red-400" : "text-amber-400";
  const bg = kind === "layout" ? "bg-red-900/10" : "bg-amber-900/10";

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded ${bg}`}>
      <span className="text-xs shrink-0">{icon}</span>
      {gateCode && (
        <span className="text-[10px] text-neutral-500 font-mono shrink-0 w-8">
          {gateCode}
        </span>
      )}
      <span className={`text-xs truncate ${color}`}>{message}</span>
    </div>
  );
}

export interface PptxAuditReportViewProps {
  audit: PptxAuditData;
  /** 접힌 상태로 시작 */
  defaultCollapsed?: boolean;
}

export function PptxAuditReportView({
  audit,
  defaultCollapsed = false,
}: PptxAuditReportViewProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const hasViolations = audit.totalViolations > 0;

  const statusIcon = hasViolations ? "⚠️" : "✅";
  const statusText = hasViolations
    ? `${audit.totalViolations}건 위반`
    : "산출물 검증 통과";

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
            {statusIcon} PPTX 품질 검사
          </span>
          {audit.slideCount != null && (
            <span className="text-[10px] text-neutral-500">
              {audit.slideCount}면 · {audit.imageCount ?? 0}이미지 · {audit.textCount ?? 0}텍스트
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {audit.layoutViolations.length > 0 && (
            <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold">
              📐 {audit.layoutViolations.length} 레이아웃
            </span>
          )}
          {audit.standardViolations.length > 0 && (
            <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">
              📝 {audit.standardViolations.length} 표준
            </span>
          )}
          {!hasViolations && (
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">
              ✅ 통과
            </span>
          )}
          <svg
            className={`w-4 h-4 text-neutral-400 transition-transform ${collapsed ? "" : "rotate-180"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="border-t border-neutral-800 px-1 py-2 space-y-0.5 max-h-64 overflow-y-auto">
          {/* Layout violations */}
          {audit.layoutViolations.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                레이아웃 위반 ({audit.layoutViolations.length})
              </div>
              {audit.layoutViolations.map((v, i) => (
                <ViolationRow key={`l-${i}`} text={v} kind="layout" />
              ))}
            </>
          )}

          {/* Standard violations */}
          {audit.standardViolations.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                표준 위반 ({audit.standardViolations.length})
              </div>
              {audit.standardViolations.map((v, i) => (
                <ViolationRow key={`s-${i}`} text={v} kind="standard" />
              ))}
            </>
          )}

          {/* No violations */}
          {!hasViolations && (
            <div className="px-4 py-6 text-center">
              <div className="text-2xl mb-2">✅</div>
              <div className="text-sm text-emerald-400 font-medium">
                PPTX 산출물 검증 통과
              </div>
              <div className="text-[11px] text-neutral-500 mt-1">
                DPI · 크로핑 · 텍스트 넘침 · 겹침 · 서술어 모순 · 괄호 균형 — 전항 통과
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
