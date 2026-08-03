export interface OcrField<T> {
  value: T | null;
  confidence: number;          // 0~1
  bbox: [number, number, number, number];
  needsReview: boolean;        // confidence < 0.85
}

export function createOcrField<T>(value: T | null, confidence: number, bbox: [number, number, number, number]): OcrField<T> {
  return { value, confidence, bbox, needsReview: confidence < 0.85 };
}
