/**
 * 뷰어 공용 프리미티브 (E-03/U-03, U-06): Section · DataBadge · RichBriefing — **Server Component 호환**(훅/모션 없음).
 * 클라이언트 아코디언 `SectionCard` 는 `./SectionCard` 의 클라이언트 아일랜드이며 여기서 재노출만 한다.
 *  - 클라이언트 섬(PollSection 등)은 이 파일이 아니라 `./SectionCard` 를 직접 import 한다
 *    (이 파일은 Server Component 전용 프리미티브이므로 클라이언트 번들에 넣지 않는다).
 * - Section: 이전 `motion.div initial={false}` 는 애니메이션이 전혀 없는 no-op 이라 정적 div 로 대체 (모션 번들 제거).
 */
import React from "react";
// 주의: isomorphic-dompurify(jsdom)는 Vercel 런타임에서 ERR_REQUIRE_ESM 으로 모듈 로딩이 실패해 뷰어 전체가 500 이 됐다 (2026-10-16). 서버 렌더 경로에 쓰지 말 것.
import { escapeHtml } from "@/lib/magazine/escape";
import { stripUneditedFormatPlaceholders } from "@/lib/magazine/simple-format";
import { parseMarketBriefingBullets } from "@/domain/magazine/issue-clustering";

export { SectionCard } from "./SectionCard";

export function Section({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

export function DataBadge({ type }: { type: "ai" | "public" | "realtime" }) {
  const config = {
    ai: { label: "🟣 AI 분석", cls: "text-violet-800 bg-violet-50 border-violet-200" },
    public: { label: "🔵 공공데이터", cls: "text-sky-800 bg-sky-50 border-sky-200" },
    realtime: { label: "🟢 실시간", cls: "text-emerald-800 bg-emerald-50 border-emerald-200" },
  };
  const c = config[type];
  return <span className={`rounded-md border px-1.5 py-0.5 text-caption font-bold ${c.cls}`}>{c.label}</span>;
}

/** 브리핑/테마 본문 → 안전한 HTML. 입력 전체를 먼저 escapeHtml 한 뒤 고정 리터럴 태그만 삽입하므로 사용자 문자열은 태그가 될 수 없다. */
export function briefingParaToSafeHtml(para: string): string {
  return escapeHtml(para)
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900 font-bold">$1</strong>')
    .replace(/「(.*?)」/g, '<strong class="text-slate-900 font-bold">「$1」</strong>')
    .replace(/(\d[\d,.]+%)/g, '<span class="text-indigo-800 font-bold font-mono">$1</span>')
    .replace(/(\d[\d,.]+억)/g, '<span class="text-emerald-800 font-bold">$1</span>');
}

/** 브리핑/테마 본문. 독자 본문 16px(text-reader). 뷸렛(`• `) 개조식은 `<ul><li>` 목록으로 렌더하며, 강조 span 은 이스케이프 후 고정 태그로만 만든다. */
export function RichBriefing({ text }: { text: string }) {
  const cleaned = stripUneditedFormatPlaceholders(text);
  const parsedBullets = parseMarketBriefingBullets(cleaned);
  const showAsBullets = parsedBullets.isBulleted || parsedBullets.items.length > 1;
  if (showAsBullets) {
    return (
      <ul
        data-testid="viewer-market-briefing-bullets"
        className="list-none m-0 p-0 space-y-2.5"
      >
        {parsedBullets.items.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-reader leading-relaxed text-slate-800"
          >
            <span aria-hidden="true" className="font-extrabold text-[#1D4ED8] shrink-0">
              •
            </span>
            <span
              className="break-keep"
              dangerouslySetInnerHTML={{ __html: briefingParaToSafeHtml(item) }}
            />
          </li>
        ))}
      </ul>
    );
  }
  const paras = cleaned.split(/\n{1,2}/).filter(Boolean);
  return (
    <div className="space-y-3">
      {paras.map((para, i) => {
        const isHeading =
          /^■\s+/.test(para.trim()) ||
          /^[\u{1F300}-\u{1FFFF}\u{2600}-\u{27FF}]/u.test(para) ||
          /^\*\*.*\*\*$/.test(para.trim());
        const html = briefingParaToSafeHtml(para);
        const cls = isHeading ? "pt-1 text-title font-extrabold leading-snug text-slate-900" : "text-reader leading-relaxed text-slate-800";
        // html 은 escapeHtml 로 전체 이스케이프된 뒤 고정 strong/span 태그만 삽입됨
        return <p key={i} className={cls} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}
