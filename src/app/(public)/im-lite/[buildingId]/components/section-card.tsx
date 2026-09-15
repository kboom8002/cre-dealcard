"use client";

import React from "react";
import type { MobileIMSection } from "@/lib/demo/mobile-im-demo-data";
import { DISPLAY_LABEL_MAP } from "@/domain/building/im-core";
import DOMPurify from "isomorphic-dompurify";
import { SafeMarkdownRenderer } from "@/components/ui/safe-markdown-renderer";

function sanitizeHtml(html: string): string {
  if (!html) return html;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["a", "strong", "em", "img", "br"],
    ALLOWED_ATTR: ["href", "src", "alt", "target"],
  });
}

function InlineMarkdown({ text }: { text: string }) {
  // Convert ![alt](url) to <img src="url" alt="alt" />
  let processed = text.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" />'
  );

  // [text](url) → clickable link
  processed = processed.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline font-medium">$1</a>'
  );

  processed = processed.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="text-white font-bold">$1</strong>'
  );
  processed = processed.replace(
    /\*([^*]+)\*/g,
    '<em class="italic text-neutral-200">$1</em>'
  );

  processed = sanitizeHtml(processed);

  if (processed !== text) {
    return <SafeMarkdownRenderer as="span" html={processed} />;
  }

  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="text-white font-bold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return (
            <em key={i} className="italic text-neutral-200">
              {part.slice(1, -1)}
            </em>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function TableFromLines({ lines }: { lines: string[] }) {
  const rows = lines.filter((l) => !l.match(/^\|[\s-|]+\|$/));
  if (rows.length === 0) return null;
  const [header, ...body] = rows;
  const parseRow = (row: string) =>
    row
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

  const headers = parseRow(header);

  return (
    <div className="overflow-x-auto my-4 rounded-xl border border-neutral-700/60 shadow-sm">
      <table className="w-full text-sm sm:text-base">
        <thead>
          <tr className="border-b border-neutral-700 bg-neutral-950/80">
            {headers.map((h, i) => (
              <th
                key={i}
                className="text-left text-neutral-300 font-bold px-3.5 py-3 text-xs sm:text-sm"
              >
                <InlineMarkdown text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-neutral-800 last:border-0 hover:bg-neutral-800/30 transition-colors"
            >
              {parseRow(row).map((cell, ci) => (
                <td
                  key={ci}
                  className="px-3.5 py-2.5 text-neutral-200 leading-relaxed font-normal"
                >
                  <InlineMarkdown text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MarkdownRenderer({ content }: { content: string }) {
  if (!content) return null;
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let tableBuffer: string[] = [];
  let inTable = false;
  let key = 0;

  const flush = () => {
    if (tableBuffer.length > 0) {
      elements.push(<TableFromLines key={key++} lines={tableBuffer} />);
      tableBuffer = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect table
    if (line.startsWith("|")) {
      inTable = true;
      tableBuffer.push(line);
      continue;
    }

    if (inTable && !line.startsWith("|")) {
      flush();
    }

    if (line.startsWith("### ")) {
      flush();
      elements.push(
        <h3
          key={key++}
          className="text-sm sm:text-base font-bold tracking-tight text-primary mt-5 mb-2.5"
        >
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      flush();
      elements.push(
        <h2
          key={key++}
          className="text-base sm:text-lg font-bold text-white mt-5 mb-3"
        >
          {line.slice(3)}
        </h2>
      );
    } else if (
      line.startsWith("**") &&
      line.endsWith("**") &&
      !line.includes(" ")
    ) {
      flush();
      elements.push(
        <p
          key={key++}
          className="font-bold text-white text-base leading-relaxed"
        >
          {line.slice(2, -2)}
        </p>
      );
    } else if (
      line.startsWith("- ") ||
      line.startsWith("* ") ||
      line.startsWith("• ")
    ) {
      flush();
      const bulletText = line.replace(/^[-*•]\s+/, "");
      elements.push(
        <li
          key={key++}
          className="text-neutral-200 text-base leading-relaxed ml-4 list-disc my-1"
        >
          <InlineMarkdown text={bulletText} />
        </li>
      );
    } else if (/^\d+\.\s/.test(line)) {
      flush();
      const text = line.replace(/^\d+\.\s/, "");
      elements.push(
        <li
          key={key++}
          className="text-neutral-200 text-base leading-relaxed ml-4 list-decimal my-1"
        >
          <InlineMarkdown text={text} />
        </li>
      );
    } else if (line.startsWith("> ")) {
      flush();
      elements.push(
        <blockquote
          key={key++}
          className="border-l-3 border-primary/60 bg-primary/10 rounded-r-xl py-2 px-4 my-3"
        >
          <p className="text-neutral-300 text-sm sm:text-base leading-relaxed font-medium">
            <InlineMarkdown text={line.slice(2)} />
          </p>
        </blockquote>
      );
    } else if (line.trim() === "") {
      flush();
      elements.push(<div key={key++} className="h-2" />);
    } else {
      flush();
      elements.push(
        <p
          key={key++}
          className="text-neutral-200 text-base leading-relaxed my-1"
        >
          <InlineMarkdown text={line} />
        </p>
      );
    }
  }

  flush();
  return <div className="space-y-1.5">{elements}</div>;
}

interface SectionCardProps {
  section: MobileIMSection;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}

export function SectionCard({
  section,
  index,
  isOpen,
  onToggle,
}: SectionCardProps) {
  const aiRoleBadgeMap: Record<string, { label: string; color: string }> = {
    auto: {
      label: "SSoT 자동",
      color: "text-sky-400 bg-sky-400/10 border-sky-400/20",
    },
    ai_generated: {
      label: "AI 생성",
      color: "text-violet-400 bg-violet-400/10 border-violet-400/20",
    },
    static: {
      label: "정적",
      color: "text-neutral-400 bg-neutral-400/10 border-neutral-400/20",
    },
  };
  const aiRoleBadge = aiRoleBadgeMap[section.aiRole] ?? aiRoleBadgeMap.static;

  return (
    <div
      className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
        section.locked
          ? "border-neutral-800 bg-neutral-950/50"
          : isOpen
          ? "border-primary/30 bg-neutral-900/80 shadow-lg shadow-primary/5"
          : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700"
      }`}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        disabled={section.locked}
        className="w-full flex items-center gap-4 p-4 text-left"
        aria-expanded={isOpen}
      >
        {/* Number badge */}
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${
            section.locked
              ? "bg-neutral-800 text-neutral-600"
              : "bg-primary/20 text-primary"
          }`}
        >
          {section.locked ? "🔒" : index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg">{section.icon}</span>
            <span
              className={`text-base font-bold truncate ${
                section.locked ? "text-neutral-600" : "text-white"
              }`}
            >
              {section.title}
            </span>
          </div>
          {/* Provenance badges — D37 8종 책임 표시 연동 */}
          {(section as any).provenance &&
            (section as any).provenance.length > 0 &&
            (() => {
              // 레거시 source → D37 ProvenanceKind 매핑
              const SOURCE_TO_PROVENANCE: Record<string, string> = {
                public_data: "public_api",
                broker_input: "broker",
                ai_inferred: "assumed",
                expert_verified: "ledger",
              };
              const TRUST_COLOR: Record<number, string> = {
                5: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                4: "bg-blue-500/10 text-blue-400 border-blue-500/20",
                3: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                2: "bg-orange-500/10 text-orange-400 border-orange-500/20",
                1: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
                0: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20",
              };
              const sources = Array.from(
                new Set((section as any).provenance.map((p: any) => p.source))
              );
              return (
                <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
                  {sources.map((source: any) => {
                    const prov = SOURCE_TO_PROVENANCE[source] ?? source;
                    const config = DISPLAY_LABEL_MAP[prov] ?? {
                      label: source,
                      icon: "?",
                      trustWeight: 0,
                    };
                    const colorClass =
                      TRUST_COLOR[config.trustWeight] ?? TRUST_COLOR[0];
                    return (
                      <span
                        key={source}
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}
                      >
                        {config.icon} {config.label}
                      </span>
                    );
                  })}
                </div>
              );
            })()}
          {section.locked && section.lockedReason && (
            <p className="text-xs text-neutral-600 mt-0.5 line-clamp-1">
              {section.lockedReason}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!section.locked && (
            <span
              className={`hidden sm:inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${aiRoleBadge.color}`}
            >
              {aiRoleBadge.label}
            </span>
          )}
          {/* D37 L-1: confidence 3상태 뱃지 */}
          {!section.locked &&
            section.confidence &&
            (() => {
              const md = (section as any).markdown || section.content || "";
              const hasUncertainText =
                /(?:확인\s*필요|미확정|확보되지\s*않|대지지분\s*확인|산출\s*불가|미정|0\s*㎡)/.test(
                  md
                );
              if (hasUncertainText && section.confidence === "confirmed")
                return null;
              const CONF_BADGE: Record<
                string,
                { label: string; color: string; icon: string }
              > = {
                confirmed: {
                  label: "확인됨",
                  color:
                    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                  icon: "✓",
                },
                needs_check: {
                  label: "확인 필요",
                  color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                  icon: "!",
                },
                inferred: {
                  label: "AI 추론",
                  color:
                    "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
                  icon: "◇",
                },
              };
              const cfg = CONF_BADGE[section.confidence];
              if (!cfg) return null;
              return (
                <span
                  className={`hidden sm:inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.color}`}
                >
                  {cfg.icon} {cfg.label}
                </span>
              );
            })()}
          {!section.locked && (
            <svg
              className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${
                isOpen ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          )}
        </div>
      </button>

      {/* Locked overlay */}
      {section.locked && (
        <div className="px-4 pb-4">
          <div className="rounded-xl bg-neutral-900/80 border border-neutral-800 p-4 text-center">
            <p className="text-xs text-neutral-500 leading-relaxed">
              {section.lockedReason}
            </p>
            <p className="text-xs text-neutral-600 mt-1">
              데이터 확보 후 자동 공개됩니다
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      {!section.locked && isOpen && (
        <div className="px-4 pb-5 border-t border-neutral-800/50">
          <div
            className="pt-4 prose prose-invert prose-sm max-w-none
            prose-headings:text-white prose-headings:font-bold
            prose-h3:text-sm prose-h3:uppercase prose-h3:tracking-wider prose-h3:text-primary prose-h3:mt-4 prose-h3:mb-2
            prose-p:text-neutral-300 prose-p:leading-relaxed prose-p:text-sm
            prose-strong:text-white prose-strong:font-semibold
            prose-table:text-xs prose-table:w-full
            prose-th:text-neutral-400 prose-th:font-medium prose-th:text-left prose-th:pb-2
            prose-td:text-neutral-300 prose-td:py-1.5
            prose-li:text-neutral-300 prose-li:text-sm
            prose-blockquote:text-neutral-400 prose-blockquote:border-l-primary/50 prose-blockquote:bg-primary/5 prose-blockquote:rounded-r-lg prose-blockquote:py-1 prose-blockquote:px-3
          "
          >
            <MarkdownRenderer
              content={section.content || (section as any).markdown || ""}
            />
          </div>

          {section.boundaryNote && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
              <span className="text-amber-400 text-sm shrink-0">⚠️</span>
              <p className="text-xs text-amber-300/80 leading-relaxed">
                {section.boundaryNote}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
