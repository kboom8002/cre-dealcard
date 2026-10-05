/**
 * GlossaryText — 문자열 안의 용어(Cap Rate·NOI·GBD·NPL …)를 첫 등장에 한해 GlossaryTerm(클라이언트 섬)으로 감싼다.
 * Server Component 호환: `seen` Set 은 서버 렌더 중에만 변경되므로 직렬화 경계를 넘지 않는다.
 */
import React from 'react';
import { GlossaryTerm } from '@/components/magazine/GlossaryTerm';
import { splitGlossary } from '@/lib/magazine/view-helpers';

export function GlossaryText({ text, seen }: { text: string; seen?: Set<string> }) {
  const segments = splitGlossary(text, seen ?? new Set());
  return (
    <>
      {segments.map((s, i) =>
        s.term ? (
          <GlossaryTerm key={i} term={s.term}>
            {s.text}
          </GlossaryTerm>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ),
      )}
    </>
  );
}
