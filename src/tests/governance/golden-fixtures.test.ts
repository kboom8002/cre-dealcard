import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('12 Golden Test Cases Fixture Suite (CIM-0003 / PR-M0-03)', () => {
  const fixturesDir = path.resolve(process.cwd(), 'tests/fixtures/golden-cases');

  const expectedCases = [
    'case-01-dangsan-l15.json',
    'case-02-sangdo-multiparcel.json',
    'case-03-yangpyeong-land.json',
    'case-04-no-rentroll.json',
    'case-05-rentroll-mismatch.json',
    'case-06-photo-pii.json',
    'case-07-pptx-overflow.json',
    'case-08-negative-leverage.json',
    'case-09-permit-zone.json',
    'case-10-memo-minimal.json',
    'case-11-cre-lexicon-violation.json',
    'case-12-tamper-post-approval.json',
  ];

  it('should have all 12 golden case files in place', () => {
    expect(fs.existsSync(fixturesDir)).toBe(true);
    for (const filename of expectedCases) {
      const filePath = path.join(fixturesDir, filename);
      expect(fs.existsSync(filePath), `File missing: ${filename}`).toBe(true);
    }
  });

  it('should parse each fixture as valid JSON with caseId, title, and expectedOutcome', () => {
    for (const filename of expectedCases) {
      const filePath = path.join(fixturesDir, filename);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);

      expect(data.caseId).toMatch(/^case-[0-9]{2}$/);
      expect(typeof data.title).toBe('string');
      expect(data.title.length).toBeGreaterThan(3);
      expect(typeof data.expectedOutcome).toBe('object');
    }
  });
});
