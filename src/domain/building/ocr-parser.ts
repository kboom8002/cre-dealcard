/**
 * @module OCRParser
 * @description Extracts structured ontology slots from official document text/PDFs.
 * 
 * IMPORTANT DO NOT RULE #11: OCR extraction results MUST NEVER be saved directly to DB
 * without a human confirmation screen (`requiresConfirmation: true`).
 * @see SDD §6 S2-T1
 */

import { sanitizeMemo } from '@/ai/sanitizer/memo-sanitizer';

/**
 * Represents a single extracted slot from an OCR document.
 */
export interface ParsedOCRSlot {
  /** The ontology slot key (e.g., 'address', 'totalFloorAreaPyung') */
  slotKey: string;
  /** The extracted value, appropriately typed */
  value: unknown;
  /** OCR confidence score from 0 to 1 */
  confidence: number; // 0 to 1
  /** The raw text snippet the value was extracted from */
  rawTextSnippet: string;
}

/**
 * The complete result of parsing a document via OCR.
 */
export interface OCRParseResult {
  /** The type of document parsed */
  documentType: 'building_ledger' | 'registry' | 'lease_contract';
  /** Map of extracted slots by key */
  extractedSlots: Record<string, ParsedOCRSlot>;
  /** Mandatory DO NOT Rule #11 - true means human confirmation is required */
  requiresConfirmation: true; // Mandatory DO NOT Rule #11
  /** Current status of the OCR extraction */
  status: 'pending_confirmation' | 'confirmed' | 'rejected';
}

/**
 * Parses raw text extracted from Korean real estate registry or building ledger.
 * 
 * @param rawText - Raw OCR text
 * @param documentType - Type of document being parsed
 * @returns Parsed OCR result with extracted slots
 * @see SDD §6 S2-T1
 */
export function parseDocumentOCR(
  rawText: string,
  documentType: 'building_ledger' | 'registry' | 'lease_contract',
  confidenceMap?: Map<string, number>
): OCRParseResult {
  const extractedSlots: Record<string, ParsedOCRSlot> = {};

  const { sanitizedText, injectionDetected } = sanitizeMemo(rawText);
  if (injectionDetected) {
    return {
      documentType,
      extractedSlots,
      requiresConfirmation: true,
      status: 'pending_confirmation',
    };
  }

  // Extract PNU / Address pattern
  const addressMatch = sanitizedText.match(/(서울|경기|인천|부산|대구|광주|대전|울산|세종)\s+[가-힣A-Za-z0-9\s]+(동|가|로|길)\s+\d+(-\d+)?/);
  if (addressMatch) {
    extractedSlots.address = {
      slotKey: 'address',
      value: addressMatch[0].trim(),
      confidence: confidenceMap?.get('address') ?? 0.92,
      rawTextSnippet: addressMatch[0],
    };
  }

  // Extract Total Floor Area (연면적)
  const areaMatch = sanitizedText.match(/연면적\s*:?\s*([\d,.]+)\s*(㎡|m2|평)/i);
  if (areaMatch) {
    const num = parseFloat(areaMatch[1].replace(/,/g, ''));
    const isPyung = areaMatch[2] === '평';
    const pyungVal = isPyung ? num : Math.round(num / 3.30578 * 10) / 10;
    extractedSlots.totalFloorAreaPyung = {
      slotKey: 'totalFloorAreaPyung',
      value: pyungVal,
      confidence: confidenceMap?.get('totalFloorAreaPyung') ?? 0.88,
      rawTextSnippet: areaMatch[0],
    };
  }

  // Extract Asking Price / Rent
  const priceMatch = sanitizedText.match(/(매매가|매각가|희망가)\s*:?\s*([\d,.]+)\s*(억|만원|원)/);
  if (priceMatch) {
    const rawNum = parseFloat(priceMatch[2].replace(/,/g, ''));
    const unit = priceMatch[3];
    let krw = rawNum;
    if (unit === '억') krw = rawNum * 1e8;
    else if (unit === '만원') krw = rawNum * 1e4;

    extractedSlots.askingPriceKrw = {
      slotKey: 'askingPriceKrw',
      value: krw,
      confidence: confidenceMap?.get('askingPriceKrw') ?? 0.85,
      rawTextSnippet: priceMatch[0],
    };
  }

  return {
    documentType,
    extractedSlots,
    requiresConfirmation: true, // Rule #11
    status: 'pending_confirmation',
  };
}

/**
 * User confirmation handler — applies confirmed slots with provenance 'expert_verified' or 'broker_input'.
 * 
 * @param result - The original OCR parse result
 * @param confirmedSlotKeys - Array of slot keys that the user confirmed
 * @returns Confirmed attributes mapped by slot key
 * @throws Error if the result status is 'rejected'
 * @see SDD §6 S2-T1
 */
export function confirmOCRResult(
  result: OCRParseResult,
  confirmedSlotKeys: string[]
): Record<string, unknown> {
  if (result.status === 'rejected') {
    throw new Error('Cannot confirm rejected OCR result.');
  }

  const confirmedAttrs: Record<string, unknown> = {};
  for (const key of confirmedSlotKeys) {
    if (result.extractedSlots[key]) {
      confirmedAttrs[key] = result.extractedSlots[key].value;
    }
  }

  result.status = 'confirmed';
  return confirmedAttrs;
}
