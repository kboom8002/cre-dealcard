import { randomUUID, createHash } from 'crypto';
import type { MemoObservation, MemoObservationSet } from './types';
import { detectSensitiveSegments } from './sensitive-detector';

export function parseMemoToObservations(rawMemoText: string): MemoObservationSet {
  const observations: MemoObservation[] = [];
  const memoRawHash = 'sha256:' + createHash('sha256').update(rawMemoText, 'utf-8').digest('hex');

  // 1. Asking price pattern (e.g., "120억", "85억 5천", "12,000,000,000원")
  const priceMatch = rawMemoText.match(/(\d+(?:[.,]\d+)?)\s*억(?:\s*(\d+)\s*천)?/);
  if (priceMatch) {
    const eok = parseFloat(priceMatch[1]) * 100000000;
    const cheon = priceMatch[2] ? parseFloat(priceMatch[2]) * 10000000 : 0;
    const value = eok + cheon;
    observations.push({
      id: randomUUID(),
      sourceText: priceMatch[0],
      position: { start: priceMatch.index!, end: priceMatch.index! + priceMatch[0].length },
      candidateType: 'asking_price',
      candidateValue: value,
      confidence: 'confirmed',
    });
  }

  // 2. Land area pattern (e.g., "대지 100평", "대지 330.5㎡", "토지 420m2")
  const landMatch = rawMemoText.match(/(?:대지|토지)\s*(\d+(?:[.,]\d+)?)\s*(평|㎡|m2)/i);
  if (landMatch) {
    const num = parseFloat(landMatch[1]);
    const unit = landMatch[2].toLowerCase();
    const sqm = unit === '평' ? Math.round(num * 3.30578 * 10) / 10 : num;
    observations.push({
      id: randomUUID(),
      sourceText: landMatch[0],
      position: { start: landMatch.index!, end: landMatch.index! + landMatch[0].length },
      candidateType: 'land_area',
      candidateValue: sqm,
      confidence: 'confirmed',
    });
  }

  // 3. Location/Address candidate
  const locMatch = rawMemoText.match(/([가-힣]+(?:구|시|동|역))\s*(?:인근|부근|대로변|도보\s*\d+분)?/);
  if (locMatch) {
    observations.push({
      id: randomUUID(),
      sourceText: locMatch[0],
      position: { start: locMatch.index!, end: locMatch.index! + locMatch[0].length },
      candidateType: 'address',
      candidateValue: locMatch[0].trim(),
      confidence: 'inferred',
    });
  }

  // 4. Monthly rent / yield
  const yieldMatch = rawMemoText.match(/수익률\s*(\d+(?:[.,]\d+)?)\s*%/);
  if (yieldMatch) {
    observations.push({
      id: randomUUID(),
      sourceText: yieldMatch[0],
      position: { start: yieldMatch.index!, end: yieldMatch.index! + yieldMatch[0].length },
      candidateType: 'yield',
      candidateValue: parseFloat(yieldMatch[1]),
      confidence: 'inferred',
    });
  }

  const sensitiveSegments = detectSensitiveSegments(rawMemoText);

  return {
    id: randomUUID(),
    memoRawHash,
    rawMemoText,
    observations,
    sensitiveSegments,
    capturedAt: new Date().toISOString(),
  };
}
