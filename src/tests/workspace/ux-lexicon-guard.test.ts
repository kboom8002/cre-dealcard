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
  'src/components/workspace/QaFeedbackPinWidget.tsx',
  'src/app/(public)/im-lite/[buildingId]/page.tsx',
  'src/app/(public)/dc/[id]/not-found.tsx',
  'src/app/(public)/dc/[id]/GateRequestForm.tsx',
  'src/app/(public)/im-lite/[buildingId]/components/im-inquiry-bottom-sheet.tsx',
  'src/components/magazine/DealInquirySheet.tsx',
  'src/components/workspace/ConfirmDeleteModal.tsx',
  'src/components/broker/deal-card/MemoImportModal.tsx',
  'src/app/(broker)/broker/_components/BrokerHome4Doors.tsx',
  'src/components/workspace/ZeroBlankStarterCard.tsx',
  'src/app/qa-broker/showcase/page.tsx',
  'src/app/qa-broker/signoff/page.tsx',
  'src/app/qa-full-loop/page.tsx',
  'src/app/qa-full-loop/_components/QaFullLoopWorkbenchClient.tsx',
  'src/app/qa-full-loop-v2/page.tsx',
  'src/app/qa-broker/full-loop/page.tsx',
  'src/lib/testguide/full-loop-2cases-data.ts',
  'src/lib/testguide/full-loop-v2-holdout-data.ts',
  'src/lib/testguide/broker-full-loop-data.ts',
  'src/app/(broker)/broker/deal-card/[id]/im-data-bottom-sheet.tsx',
  'src/app/(broker)/broker/deal-card/[id]/im-management-panel.tsx',
];

function walkTsSources(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === '__tests__') continue;
      walkTsSources(p, out);
    } else if (/\.tsx?$/.test(ent.name) && !/\.test\.tsx?$/.test(ent.name)) {
      out.push(path.relative(ROOT, p).replace(/\\/g, '/'));
    }
  }
}

function magazineEditorComponents(): string[] {
  const out: string[] = [];
  walkTsSources(path.join(ROOT, 'src/components/magazine-editor'), out);
  return out;
}

const IM_SURFACE_ROOTS: readonly string[] = [
  'src/app/(broker)/broker/basic-im-studio',
  'src/app/(public)/im-lite',
  'src/app/(public)/im-pro',
  'src/app/(broker)/broker/im-approval',
  'src/components/im',
  'src/components/broker/im-studio',
];

function imSurfaceModules(): string[] {
  const out: string[] = [];
  for (const root of IM_SURFACE_ROOTS) {
    walkTsSources(path.join(ROOT, root), out);
  }
  return out;
}

const NEWSLETTER_SURFACE_ROOTS: readonly string[] = [
  'src/app/(magazine)/magazine',
  'src/app/(public)/m',
  'src/app/(broker)/broker/w/newsletter',
  'src/app/(broker)/broker/w/magazine',
  'src/components/magazine',
  'src/domain/magazine/templates',
];

const NEWSLETTER_EXPLICIT_FILES: readonly string[] = [
  'src/domain/magazine/email-template.tsx',
  'src/lib/magazine/og-image-render.tsx',
];

function newsletterSurfaceModules(): string[] {
  const out: string[] = [...NEWSLETTER_EXPLICIT_FILES];
  for (const root of NEWSLETTER_SURFACE_ROOTS) {
    walkTsSources(path.join(ROOT, root), out);
  }
  return out;
}

const WORKSPACE_MODULE_ROOTS: readonly string[] = [
  'src/app/(broker)/broker/w/im',
  'src/app/(broker)/broker/w/inbox',
  'src/app/(broker)/broker/w/dealcards',
  'src/app/(broker)/broker/magazine-editor',
];

function workspaceExtractedModules(): string[] {
  const out: string[] = [];
  for (const wsRoot of WORKSPACE_MODULE_ROOTS) {
    walkTsSources(path.join(ROOT, wsRoot, '_components'), out);
    walkTsSources(path.join(ROOT, wsRoot, '_hooks'), out);
  }
  return out;
}

export function stripNonUiCode(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`])\/\/.*$/gm, '$1')
    .replace(/^\s*import .*$/gm, '')
    .replace(/data-testid=(?:"[^"]*"|\{[^}]*\})/g, '')
    .replace(/className=(?:"[^"]*"|\{`[^`]*`\})/g, '')
    .replace(/encodeURIComponent\([a-zA-Z_$][\w$.]*\)/g, '');
}

describe('UX lexicon guard (사용자 대면 금지어)', () => {
  const targets = Array.from(
    new Set([
      ...FILES,
      ...magazineEditorComponents(),
      ...workspaceExtractedModules(),
      ...imSurfaceModules(),
      ...newsletterSurfaceModules(),
    ]),
  ).filter((f) => fs.existsSync(path.join(ROOT, f)));

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
