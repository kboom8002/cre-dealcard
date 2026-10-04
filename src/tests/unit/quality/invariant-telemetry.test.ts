import { describe, it, expect } from 'vitest';
import { resolveInvariantMode, summarizeViolations } from '@/domain/building/mobile-im/quality/invariant-telemetry';
import { auditPptxBufferInvariants } from '@/domain/building/mobile-im/quality/pptx-invariant-audit';
import type { InvariantViolation } from '@/domain/building/mobile-im/quality/output-invariants';
import JSZip from 'jszip';

describe('D3 invariant telemetry', () => {
  it('모드: 기본 warn, block 만 차단, 잘못된 값은 warn', () => {
    expect(resolveInvariantMode({} as any)).toBe('warn');
    expect(resolveInvariantMode({ IM_INVARIANT_MODE: 'BLOCK' } as any)).toBe('block');
    expect(resolveInvariantMode({ IM_INVARIANT_MODE: 'strict' } as any)).toBe('warn');
  });

  it('summarizeViolations: 규칙별/슬라이드별 집계', () => {
    const v: InvariantViolation[] = [
      { id: 'PLACEHOLDER', severity: 'error', unit: 2, sample: 'x' },
      { id: 'PLACEHOLDER', severity: 'error', unit: 2, sample: 'y' },
      { id: 'DUPLICATE_SENTENCE', severity: 'warn', unit: 0, sample: 'z' },
    ];
    expect(summarizeViolations(v)).toEqual({
      errorCount: 2, warnCount: 1,
      byRule: { PLACEHOLDER: 2, DUPLICATE_SENTENCE: 1 },
      slides: [1, 3],
    });
  });

  it('PPTX 버퍼 감사: 오염된 슬라이드는 error 로 검출 (block 모드의 입력)', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml', '<p:sld><a:p><a:r><a:t>매매가 NaN억원</a:t></a:r></a:p></p:sld>');
    zip.file('ppt/slides/slide2.xml', '<p:sld><a:p><a:r><a:t>정상 문장입니다</a:t></a:r></a:p></p:sld>');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const audit = await auditPptxBufferInvariants(buf);
    const errors = audit.violations.filter(v => v.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(summarizeViolations(audit.violations).slides).toEqual([1]);
  });
});
