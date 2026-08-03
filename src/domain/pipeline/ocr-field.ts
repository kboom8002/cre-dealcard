export interface OcrField<T> {
  value: T;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export function needsReview<T>(field: OcrField<T>): boolean {
  return field.confidence < 0.85;
}
