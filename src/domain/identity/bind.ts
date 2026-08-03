/**
 * bind.ts — 소급 바인딩 (Viewer → Party)
 * Spec: DISTRIBUTION_AND_IDENTITY.md §6
 * 
 * 슬라이더는 익명 Viewer 단계에서 발생합니다.
 * 게이트 통과 시 같은 viewer_id에 한해 소급 연결합니다.
 */

import { createServiceClient } from '@/lib/supabase/service';

interface SliderEvent {
  param: string;
  value: number;
  occurredAt: string;
}

/**
 * Viewer의 슬라이더 이벤트를 Party에 소급 바인딩합니다.
 * 
 * 규칙:
 * - 1회 조작은 우발적일 수 있으므로 무시 (임계값 2회)
 * - confidence: 'medium' (gate_form보다 낮게)
 * - 30일 이내 이벤트만 대상
 */
export async function bindViewerHistory(
  viewerId: string,
  partyId: string,
): Promise<{ bound: boolean; conditionsCreated: number }> {
  const supabase = createServiceClient();

  // 30일 이내 슬라이더 이벤트 조회
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  
  const { data: sliderEvents } = await supabase
    .from('track_event')
    .select('payload, occurred_at')
    .eq('viewer_id', viewerId)
    .eq('kind', 'view.slider')
    .gte('occurred_at', thirtyDaysAgo)
    .order('occurred_at', { ascending: true });

  if (!sliderEvents || sliderEvents.length < 2) {
    // 1회 조작은 우발적 — 바인딩하지 않음
    return { bound: false, conditionsCreated: 0 };
  }

  // 예산 슬라이더 값 추출
  const budgetValues = sliderEvents
    .filter((e: any) => e.payload?.param === 'budget')
    .map((e: any) => e.payload?.value as number);

  if (budgetValues.length === 0) {
    return { bound: false, conditionsCreated: 0 };
  }

  // 중앙값 계산
  const sorted = [...budgetValues].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const budgetBand = toBudgetBand(median);

  // buyer_condition에 INSERT (append-only)
  const { error } = await supabase
    .from('buyer_condition')
    .insert({
      party_id: partyId,
      source: 'slider',
      confidence: 'medium',
      budget_band: budgetBand,
      observed_at: sliderEvents[sliderEvents.length - 1].occurred_at,
    });

  if (error) {
    console.error('[bind] Failed to insert slider condition:', error.message);
    return { bound: false, conditionsCreated: 0 };
  }

  return { bound: true, conditionsCreated: 1 };
}

/**
 * 수치를 예산대 문자열로 변환
 */
function toBudgetBand(valueInBillion: number): string {
  if (valueInBillion < 50) return 'under_50';
  if (valueInBillion < 100) return '50_100';
  if (valueInBillion < 200) return '100_200';
  if (valueInBillion < 300) return '200_300';
  return 'over_300';
}
