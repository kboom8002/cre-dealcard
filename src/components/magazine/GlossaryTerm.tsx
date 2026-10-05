'use client';

/**
 * GlossaryTerm — 탭/클릭으로 여는 용어 설명 (U2-17). hover 전용 툴팁이 아니라 모바일에서도 동작한다.
 * `aria-expanded` 버튼 + 바로 아래 설명 문단. Esc 로 닫힘.
 */
import React, { useEffect, useId, useState } from 'react';
import { GLOSSARY } from '@/lib/magazine/view-helpers';

export function GlossaryTerm({ term, children }: { term: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const description = GLOSSARY[term];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!description) return <>{children ?? term}</>;

  return (
    <span className="inline">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${term} 설명 ${open ? '닫기' : '보기'}`}
        onClick={() => setOpen((v) => !v)}
        className="inline cursor-help rounded-sm underline decoration-dotted decoration-ink-subtle underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
      >
        {children ?? term}
      </button>
      <span
        id={id}
        role="note"
        hidden={!open}
        className="mt-1 block rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-caption font-normal leading-relaxed text-ink-muted"
      >
        <strong className="text-white">{term}</strong> — {description}
      </span>
    </span>
  );
}
