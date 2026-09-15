import { THRESHOLDS } from '@/constants/thresholds';
import { describe, it, expect } from 'vitest';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

describe('SSoT Threshold Parity (Rule 8)', () => {
  it('PAGE_HARD_LIMIT should match credeal/ssot/im.pages.yaml', () => {
    const yamlPath = path.resolve(process.cwd(), 'credeal/ssot/im.pages.yaml');
    const content = yaml.load(fs.readFileSync(yamlPath, 'utf8')) as any;
    const expectedLimit = content?.rules?.max_pages_absolute ?? 16;
    
    expect(THRESHOLDS.PAGE_HARD_LIMIT).toBe(expectedLimit);
  });
});
