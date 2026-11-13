/**
 * @file src/tests/workspace/ux-lexicon-guard.test.ts
 * @description UX 라이팅 가드 — 4대 작업공간 + 수신자 화면의 사용자 대면 문자열에
 *   개발/영어 용어(포스처, OG 이미지, 사분면, SHA-256, G2 승인, 핫리드, 보안 토큰, 바텀시트,
 *   콘텐츠 스튜디오 …)가 남지 않도록 막는다. SSOT: src/lib/ux/lexicon.ts BANNED_UI_TERMS
 *
 * 검사 방식: 주석 / data-testid / className / import 줄을 제거한 뒤 금지어 정규식을 검사.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { BANNED_UI_TERMS } from '@/lib/ux/lexicon';

const ROOT = process.cwd();

const FILES: string[] = [
  'src/app/(broker)/broker/w/dealcards/page.tsx',
  'src/components/broker/deal-card/PairedMemoTopCard.tsx',
  'src/components/broker/deal-card/Card4ConfirmCard.tsx',
  'src/components/broker/deal-card/KakaoBubblePreview.tsx',
  'src/components/broker/deal-card/PreSendConfirmationSheet.tsx',
  'src/lib/deal-card/blind-guard.ts',
  'src/app/(broker)/broker/w/im/page.tsx',
  'src/app/(broker)/broker/w/inbox/page.tsx',
  'src/app/(broker)/broker/magazine-editor/page.tsx',
  'src/app/(public)/dc/[id]/page.tsx',
  'src/components/teaser/CTALadder.tsx',
  'src/components/teaser/TrustLine.tsx',
  'src/components/teaser/ContactGateModal.tsx',
  'src/components/workspace/WorkspaceShell.tsx',
  'src/components/workspace/RentRollGrid.tsx',
  'src/components/broker/rent-roll-importer.tsx',
  'src/components/broker/studio/MagazineQuickDraftCard.tsx',
  'src/components/workspace/preview-sync/PreviewCausalityBar.tsx',
  'src/components/workspace/preview-sync/PreviewPregenerationCard.tsx',
  'src/components/workspace/preview-sync/PreviewEditableUnit.tsx',
];

function magazineEditorComponents(): string[] {
  const dir = path.join(ROOT, 'src/components/magazine-editor');
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === '__tests__') continue;
        walk(p);
      } else if (/\.tsx?$/.test(ent.name) && !/\.test\.tsx?$/.test(ent.name)) {
        out.push(path.relative(ROOT, p));
      }
    }
  };
  walk(dir);
  return out;
}

export function stripNonUiCode(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`])\/\/.*$/gm, '$1')
    .replace(/^\s*import .*$/gm, '')
    .replace(/data-testid=(?:"[^"]*"|\{[^}]*\})/g, '')
    .replace(/className=(?:"[^"]*"|\{`[^`]*`\})/g, '');
}

describe('UX lexicon guard (사용자 대면 금지어)', () => {
  const targets = [...FILES, ...magazineEditorComponents()].filter((f) =>
    fs.existsSync(path.join(ROOT, f)),
  );

  it('has target files to scan', () => {
    expect(targets.length).toBeGreaterThan(5);
  });

  it.each(targets)('%s 에 금지 용어가 없다', (rel) => {
    const code = stripNonUiCode(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    const hits: string[] = [];
    for (const { term, use } of BANNED_UI_TERMS) {
      const m = code.match(term);
      if (m) hits.push(`"${m[0]}" → ${use}`);
    }
    expect(hits, `${rel}:\n${hits.join('\n')}`).toEqual([]);
  });
});
