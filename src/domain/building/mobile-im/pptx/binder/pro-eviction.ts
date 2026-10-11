/**
 * @file pro-eviction.ts
 * @description Pro IM(개발형) — 명도(퇴거) 분석 슬라이드 데이터 빌더
 *
 * 단일 진실원(SSOT): 숫자·등급·기간은 전부 `lease-adapter.analyzeEviction()` 출력 그대로 쓴다.
 *   (모바일 뷰어 `formatEvictionMarkdown` 과 같은 함수·같은 입력(body.floor_leases + rent_roll_meta.rentroll_as_of))
 *   → 여기서 비용·기간·난이도를 다시 계산하지 않는다. 표시용 포맷(억 원 소수 자릿수)만 뷰어 표와 동일하게 맞춘다.
 *
 * 노출 정책 (왜 Pro·개발형 한정인가)
 *  - Basic IM(fact_om)은 사실형 9면(Rule 47): '고급 분석'을 싣지 않는다. 이 분석은 이사비 300만원·월세 6개월분 같은
 *    **가정 기반 추정**이고 소요 개월·난이도도 휴리스틱이므로 사실이 아니다 → Basic 제외.
 *  - 명도는 철거·신축을 전제하는 개발형(development) 개념이다. 수익형 매수자는 임차인을 유지하므로 의미가 없고,
 *    뷰어도 `posture === 'development'` 일 때만 표를 붙인다(im-section-generator). PPTX 도 같은 조건을 따른다.
 *  - 명도 대상(임대 중 호실)이 하나도 없으면 데이터를 만들지 않는다(null → 슬라이드 생략).
 */
import { analyzeEviction, normalizeFloorLeases, type EvictionAnalysis } from '../../lease-adapter';
import { parseYmd, resolveEvaluationDate } from '../../lease-math';

/** Pro 덱에서 이 데이터를 가리키는 dataKey */
export const PRO_EVICTION_DATA_KEY = 'evictionEstimate';

export interface ProEvictionStat {
  label: string;
  value: string;
  sub: string;
}

const FRICTION_LABELS: Record<EvictionAnalysis['frictionScore'], string> = {
  low: '용이 (공실/단순)',
  medium: '보통 (협의 필요)',
  high: '난이도 높음 (다수 임차인)',
};

/** 평가 기준일(YYYY-MM-DD) — analyzeEviction 이 쓰는 것과 같은 해석(렌트롤 C5 → 없으면 오늘 KST) */
export function resolveEvictionBasis(
  asOf: unknown,
  now: Date = new Date(),
): { ymd: string; fromRentRoll: boolean } {
  const fromRentRoll = parseYmd(asOf) != null;
  return { ymd: resolveEvaluationDate(asOf as any, now).toISOString().slice(0, 10), fromRentRoll };
}

/**
 * Pro 명도 슬라이드(A26 mode 'eviction') 데이터. 명도 대상 임차인이 없으면 null.
 * @param body IM 문서 body (floor_leases, rent_roll_meta.rentroll_as_of)
 */
export function buildProEvictionData(
  body: Record<string, any> | null | undefined,
  opts: { now?: Date } = {},
): Record<string, any> | null {
  const raw = body?.floor_leases;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const leases = normalizeFloorLeases(raw.filter(Boolean));
  if (!leases.some((l) => !l.isVacant)) return null; // 명도 대상 없음 (전 호실 공실)

  const asOfRaw = body?.rent_roll_meta?.rentroll_as_of ?? null;
  const analysis = analyzeEviction(leases, asOfRaw);
  if (analysis.totalTenants <= 0) return null;

  const basis = resolveEvictionBasis(asOfRaw, opts.now);
  const depositBil = (analysis.depositRefundKrw / 1e8).toFixed(1);
  const evictionCostBil = (analysis.estimatedEvictionCostKrw / 1e8).toFixed(2);

  const statCards: ProEvictionStat[] = [
    { label: '명도 대상 계약', value: `${analysis.totalTenants}건`, sub: '기존 점유 임차인(계약 단위)' },
    { label: '반환 필요 보증금', value: `약 ${depositBil}억 원`, sub: '착공 전 유출' },
    { label: '예상 명도 보상비 (추정)', value: `약 ${evictionCostBil}억 원`, sub: '이사비 + 영업합의금 가정' },
    { label: '명도 완료 예상 기간 (추정)', value: `약 ${analysis.estimatedMonths}개월`, sub: `최장 만기일 ${analysis.latestLeaseEnd || '-'}` },
    { label: '명도 난이도 (추정)', value: FRICTION_LABELS[analysis.frictionScore], sub: '임차인 수 기준 종합 평가' },
  ];

  const basisNote = `평가 기준일 ${basis.ymd}(${basis.fromRentRoll ? '렌트롤 기준일' : '작성일'}) 기준 추정치입니다.`;
  const assumptions: string[] = [
    basisNote,
    '명도 보상비는 가정 기반 추정입니다 (이사비 계약당 300만원 + 월세 6개월분 영업합의금 가정).',
    '소요 기간·난이도는 임차인 수와 최장 만기일을 기준으로 한 추정이며, 실제 협의 결과와 다를 수 있습니다.',
  ];

  return {
    title: '명도 대상 임차인 및 예상 비용 (추정)',
    kicker: 'EVICTION ESTIMATE',
    content: '',
    tables: [],
    metrics: {},
    mode: 'eviction',
    statCards,
    assumptions,
    basisDate: basis.ymd,
    basisLabel: `추정 · 평가 기준일 ${basis.ymd}`,
    /** 원본 분석 출력 (SSOT 검증·디버깅용) */
    analysis,
    left: { sub: '명도 분석 (추정)', rows: statCards.map((s) => [s.label, s.value]) },
    _derived: true,
  };
}
