/**
 * 뷰어 공용 프리미티브 (E-03/U-03, U-06): Section · DataBadge · RichBriefing — **Server Component 호환**(훅/모션 없음).
 * 클라이언트 아코디언 `SectionCard` 는 `./SectionCard` 의 클라이언트 아일랜드이며 여기서 재노출만 한다.
 *  - 클라이언트 섬(PollSection 등)은 이 파일이 아니라 `./SectionCard` 를 직접 import 한다
 *    (이 파일은 서버 전용 의존성인 DOMPurify 를 끌어오므로 클라이언트 번들에 들어가면 안 된다).
 * - Section: 이전 `motion.div initial={false}` 는 애니메이션이 전혀 없는 no-op 이라 정적 div 로 대체 (모션 번들 제거).
 */
import React from "react";
import DOMPurify from "isomorphic-dompurify";

export { SectionCard } from "./SectionCard";

export function Section({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

export function DataBadge({ type }: { type: "ai" | "public" | "realtime" }) {
  const config = {
    ai: { label: "🟣 AI 분석", cls: "text-violet-300 bg-violet-500/10 border-violet-500/30" },
    public: { label: "🔵 공공데이터", cls: "text-sky-300 bg-sky-500/10 border-sky-500/30" },
    realtime: { label: "🟢 실시간", cls: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" },
  };
  const c = config[type];
  return <span className={`rounded-md border px-1.5 py-0.5 text-caption font-bold ${c.cls}`}>{c.label}</span>;
}

/** 브리핑/테마 본문. 독자 본문 16px(text-reader). 강조 span 은 DOMPurify(서버)로 정제한 뒤 렌더한다. */
export function RichBriefing({ text }: { text: string }) {
  const paras = text.split(/\n{1,2}/).filter(Boolean);
  return (
    <div className="space-y-3">
      {paras.map((para, i) => {
        const isHeading = /^[\u{1F300}-\u{1FFFF}\u{2600}-\u{27FF}]/u.test(para) || /^\*\*.*\*\*$/.test(para.trim());
        const html = DOMPurify.sanitize(
          para
            .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
            .replace(/(\d[\d,.]+%)/g, '<span class="text-indigo-200 font-bold font-mono">$1</span>')
            .replace(/(\d[\d,.]+억)/g, '<span class="text-emerald-200 font-bold">$1</span>'),
          { ALLOWED_TAGS: ["strong", "span"], ALLOWED_ATTR: ["class"] },
        );
        const cls = isHeading ? "pt-1 text-title font-extrabold leading-snug text-white" : "text-reader text-ink-muted";
        // html 은 위에서 허용 태그(strong/span)·class 만 남기도록 정제됨
        return <p key={i} className={cls} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}
