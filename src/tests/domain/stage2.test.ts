import { describe, it, expect } from 'vitest';
import { parseDocumentOCR, confirmOCRResult } from '@/domain/building/ocr-parser';
import { recordTacitLabel } from '@/domain/tacit/tacit-label-service';
import { computeEditDiff } from '@/domain/building/edit-diff-collector';

describe('OCR Contract & Registry Parser (S2-T1)', () => {
  it('parses address, area, and asking price from OCR text', () => {
    const rawText = '소재지: 서울 성동구 성수동2가 000-00\n연면적: 1,157.0 ㎡\n매매가: 80억';
    const result = parseDocumentOCR(rawText, 'building_ledger');

    expect(result.requiresConfirmation).toBe(true);
    expect(result.extractedSlots.address.value).toContain('서울 성동구 성수동2가');
    expect(result.extractedSlots.askingPriceKrw.value).toBe(8_000_000_000);
  });

  it('requires human confirmation step before committing slots', () => {
    const rawText = '매매가: 50억';
    const result = parseDocumentOCR(rawText, 'building_ledger');
    expect(result.status).toBe('pending_confirmation');

    const confirmed = confirmOCRResult(result, ['askingPriceKrw']);
    expect(confirmed.askingPriceKrw).toBe(5_000_000_000);
    expect(result.status).toBe('confirmed');
  });
});

describe('Tacit Label Service (S2-T3)', () => {
  it('records 1-tap deal loss reasons correctly', () => {
    const record = recordTacitLabel({
      brokerId: 'b-1',
      dealId: 'd-1',
      category: 'deal_fallout',
      reasonCode: 'loan_rejected',
    });

    expect(record.reason_code).toBe('loan_rejected');
    expect(record.memo).toBe('대출 심사 부결');
  });
});

describe('Edit Diff Collector (S2-T4)', () => {
  it('computes character difference count between original and edited content', () => {
    const payload = {
      dealId: 'd-100',
      sectionKey: 'hero',
      originalAiContent: '성수동 꼬마빌딩 매매 제안서입니다.',
      editedBrokerContent: '성수동 초역세권 꼬마빌딩 급매물 제안서입니다.',
    };

    const diff = computeEditDiff(payload);
    expect(diff.char_diff_count).toBeGreaterThan(0);
    expect(diff.section_key).toBe('hero');
  });
});
