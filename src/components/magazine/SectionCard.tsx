"use client";

/**
 * SectionCard — 뷰어 아코디언 섬 (E-03/U-03, U-06 클라이언트 아일랜드)
 * `<h2><button aria-expanded aria-controls>` + 44px 헤더, 닫힌 패널은 `hidden`.
 * children 은 서버에서 렌더된 노드가 그대로 전달된다(직렬화 대상은 props 중 title/badge/icon 노드뿐).
 */
import React, { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

export function SectionCard({
  title, icon, badge, children, defaultOpen = false, onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** 펼침/접힘 시 호출 — 클라이언트 섬 내부에서만 전달 가능(함수는 서버→클라이언트 경계를 넘을 수 없다) */
  onToggle?: (open: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const uid = useId();
  const panelId = `${uid}-panel`;
  const headingId = `${uid}-title`;
  return (
    <div
      className={`overflow-hidden rounded-2xl border transition-colors duration-300 ${
        isOpen ? "border-white/15 bg-white/[0.03]" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <h2 className="m-0">
        <button
          type="button"
          id={headingId}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => {
            const next = !isOpen;
            setIsOpen(next);
            onToggle?.(next);
          }}
          className="flex min-h-11 w-full items-center gap-2 px-4 py-3 text-left"
        >
          {icon}
          <span className="flex-1 text-label font-bold text-white">{title}</span>
          {badge}
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 text-ink-subtle transition-transform duration-200 motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      </h2>
      <div id={panelId} role="region" aria-labelledby={headingId} hidden={!isOpen} className="space-y-3 px-4 pb-4">
        {children}
      </div>
    </div>
  );
}
