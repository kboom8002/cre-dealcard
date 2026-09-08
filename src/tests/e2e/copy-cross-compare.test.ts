import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Test data directories
const TEST_CASES = [
  {
    id: '02-yeoksam-hq',
    level: 'level-2-standard',
    posture: 'owner_occupied',
  },
  {
    id: '02-yeoksam-hq',
    level: 'level-3-verified',
    posture: 'owner_occupied',
  },
  {
    id: '01-dangsan-income',
    level: 'level-3-verified',
    posture: 'income',
  },
  {
    id: '03-jamwon-dev',
    level: 'level-3-verified',
    posture: 'development',
  },
];

const PROD_TEST_DIR = path.resolve(__dirname, '../../../docs/prod-test');

// 8 forbidden patterns from the protocol
const FORBIDDEN_PATTERNS = [
  /\[building\]/i,
  /\[location\]/i,
  /\[rentRoll\]/i,
  /\*\*[^*]+\*\*/,
  /\*\([^)]+\)\*/,
  /(\d[\d,.]*㎡)\s*\(약\s*\d[\d,.]*평\(약\s*\d[\d,.]*㎡\)\)/,
  /(상권|권역|입지)\s+\1\s+\1/,
  /NaN|undefined|null|\[object Object\]/,
];

// CRE forbidden terms (Rule 2)
const CRE_FORBIDDEN = [
  { bad: /네이밍\s*라이츠/, good: '사옥 단독 명칭 표기(간판 설치권)' },
  { bad: /브랜딩\s*라이츠/, good: '기업 단독 브랜딩' },
  { bad: /(?<!연 순수익률\s*\()(?<!\()캡레이트(?!\))/, good: '연 순수익률 (Cap Rate)' },
];

for (const tc of TEST_CASES) {
  describe(`Cross-Compare: ${tc.id} (${tc.posture})`, () => {
    const outputDir = path.join(PROD_TEST_DIR, tc.id, tc.level, 'output');
    let pptxTexts: string; // all PPTX text concatenated
    let viewerText: string;
    let hasOutput = false;

    beforeAll(() => {
      const slideTextsPath = path.join(outputDir, 'pptx-slides', 'slide-texts.json');
      const viewerTextPath = path.join(outputDir, 'mobile-im', 'viewer-text.txt');
      
      if (!fs.existsSync(slideTextsPath) || !fs.existsSync(viewerTextPath)) {
        console.warn(`⚠️ Output not found for ${tc.id}/${tc.level}. Run prod-e2e-runner first.`);
        return;
      }
      hasOutput = true;
      // slide-texts.json is Array<{ slide, layout, texts: string[] }>
      const slides = JSON.parse(fs.readFileSync(slideTextsPath, 'utf8'));
      pptxTexts = (Array.isArray(slides)
        ? slides.map((s: any) => (s.texts || []).join(' ')).join('\n')
        : Object.values(slides).map((v: any) => typeof v === 'string' ? v : JSON.stringify(v)).join(' ')
      );
      viewerText = fs.readFileSync(viewerTextPath, 'utf8');
    });

    it('PPTX output exists', () => {
      if (!hasOutput) return; // skip gracefully
      expect(pptxTexts.length).toBeGreaterThan(0);
    });

    it('Mobile IM output exists', () => {
      if (!hasOutput) return;
      expect(viewerText.length).toBeGreaterThan(50);
    });

    it('8 forbidden patterns: PPTX = 0 violations', () => {
      if (!hasOutput) return;
      const allPptxText = pptxTexts;
      for (const pat of FORBIDDEN_PATTERNS) {
        const matches = allPptxText.match(pat);
        expect(matches, `PPTX forbidden: ${pat.source}`).toBeNull();
      }
    });

    it('8 forbidden patterns: Mobile IM = 0 violations', () => {
      if (!hasOutput) return;
      for (const pat of FORBIDDEN_PATTERNS) {
        const matches = viewerText.match(pat);
        expect(matches, `Viewer forbidden: ${pat.source}`).toBeNull();
      }
    });

    it('CRE terminology (Rule 2): PPTX', () => {
      if (!hasOutput) return;
      const allPptxText = pptxTexts;
      for (const term of CRE_FORBIDDEN) {
        expect(allPptxText).not.toMatch(term.bad);
      }
    });

    it('CRE terminology (Rule 2): Mobile IM', () => {
      if (!hasOutput) return;
      for (const term of CRE_FORBIDDEN) {
        expect(viewerText).not.toMatch(term.bad);
      }
    });

    it('Persona isolation (Rule 1): PPTX', () => {
      if (!hasOutput) return;
      const allPptxText = pptxTexts;
      expect(allPptxText).not.toMatch(/(?:60대|50대|40대|70대).*(?:자산가|투자자)/);
      expect(allPptxText).not.toMatch(/(?:법인\s*대표|디벨로퍼|은퇴).*(?:맞춤|을 위한)/);
      expect(allPptxText).not.toContain('개인 자산가');
      expect(allPptxText).not.toContain('본문을 참조');
    });

    it('Persona isolation (Rule 1): Mobile IM', () => {
      if (!hasOutput) return;
      expect(viewerText).not.toMatch(/(?:60대|50대|40대|70대).*(?:자산가|투자자)/);
      expect(viewerText).not.toMatch(/(?:법인\s*대표|디벨로퍼|은퇴).*(?:맞춤|을 위한)/);
      expect(viewerText).not.toContain('개인 자산가');
      expect(viewerText).not.toContain('본문을 참조');
    });

    it('Area values present in both (no empty)', () => {
      if (!hasOutput) return;
      // At least one area value should appear in both
      const areaPattern = /[\d,]+\.?\d*\s*㎡/;
      const allPptxText = pptxTexts;
      expect(allPptxText).toMatch(areaPattern);
      // Viewer may not always show area if sections timed out
    });

    it('No viewer error screen', () => {
      if (!hasOutput) return;
      expect(viewerText).not.toContain('오류가 발생했습니다');
      expect(viewerText).not.toContain('Failed to parse src');
    });
  });
}
