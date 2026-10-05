/**
 * 매각가 조정: AI 추출값 vs 메모 결정론적 슬롯(정규식) 값 교차 검증.
 *
 * 배경(골든 E2E ig4 as-is): 메모 "매매가 250억(15,923만원/평)" 에서 AI 가 askingPriceManwon 을
 * 25,000,000(=2,500억)으로 10배 오추출 → PPTX 매각가 2,500억·Cap Rate 0.2% 로 노출.
 * 슬롯 추출기는 2.5e10 원(250억)을 올바르게 추출했다.
 *
 * 규칙: 둘 다 있고 비율이 1.5배 이상 벌어지면 결정론적 슬롯 값을 채택하고 경고를 남긴다.
 */
export interface ReconciledAskingPrice {
  manwon: number | null;
  krw: number | null;
  /** 'ai' | 'slot' | 'slot_override' | 'none' */
  source: 'ai' | 'slot' | 'slot_override' | 'none';
  warning?: string;
}

const DIVERGENCE_RATIO = 1.5;

export function reconcileAskingPrice(
  aiManwon: number | null | undefined,
  slotKrw: number | null | undefined,
): ReconciledAskingPrice {
  const ai = Number(aiManwon) > 0 ? Number(aiManwon) : 0;
  const slot = Number(slotKrw) > 0 ? Number(slotKrw) : 0;

  if (ai && slot) {
    const ratio = (ai * 10000) / slot;
    if (ratio >= DIVERGENCE_RATIO || ratio <= 1 / DIVERGENCE_RATIO) {
      return {
        manwon: slot / 10000,
        krw: slot,
        source: 'slot_override',
        warning: `AI 매각가(${ai.toLocaleString()}만원)와 메모 추출값(${(slot / 10000).toLocaleString()}만원)이 ${ratio.toFixed(2)}배 괴리 — 메모 추출값 채택`,
      };
    }
    return { manwon: ai, krw: ai * 10000, source: 'ai' };
  }
  if (ai) return { manwon: ai, krw: ai * 10000, source: 'ai' };
  if (slot) return { manwon: slot / 10000, krw: slot, source: 'slot' };
  return { manwon: null, krw: null, source: 'none' };
}
