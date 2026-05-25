/**
 * DealPredictionSection — 딜카드 결과 화면의 AI 예측 인사이트 섹션.
 * price-prediction.ts, deal-conversion-predictor.ts 백엔드 연산 결과를
 * building_price_predictions, deal_conversion_predictions 테이블에서 읽어 시각화.
 *
 * P1-1: UI/UX 완전화 — 예측 엔진 결과의 시각화
 */
import { createServiceClient } from "@/lib/supabase/service";

interface DealPredictionSectionProps {
  buildingId: string;
}

export async function DealPredictionSection({
  buildingId,
}: DealPredictionSectionProps) {
  const supabase = createServiceClient();

  // 가격 예측 조회
  const { data: pricePred } = await supabase
    .from("building_price_predictions")
    .select("predicted_low, predicted_high, confidence_level, reasoning, created_at")
    .eq("building_ssot_lite_id", buildingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 딜 전환 확률 조회
  const { data: convPred } = await supabase
    .from("deal_conversion_predictions")
    .select("conversion_probability, confidence_level, key_factors, risk_factors, created_at")
    .eq("building_ssot_lite_id", buildingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 데이터가 하나도 없으면 렌더하지 않음
  if (!pricePred && !convPred) return null;

  const probPercent = convPred
    ? Math.round(convPred.conversion_probability * 100)
    : null;

  const probColor =
    probPercent !== null
      ? probPercent >= 70
        ? "text-success"
        : probPercent >= 40
        ? "text-warning"
        : "text-destructive"
      : "";

  const keyFactors = Array.isArray(convPred?.key_factors)
    ? (convPred.key_factors as string[])
    : [];
  const riskFactors = Array.isArray(convPred?.risk_factors)
    ? (convPred.risk_factors as string[])
    : [];

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h2 className="text-base font-semibold flex items-center gap-2">
        <span>🤖</span> AI 딜 예측 인사이트
      </h2>

      <div className="grid grid-cols-2 gap-3">
        {/* 거래가 예측 */}
        {pricePred && (
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 space-y-1">
            <p className="text-xs text-primary font-medium">예측 거래가</p>
            <p className="text-sm font-bold text-foreground">
              {formatPrice(pricePred.predicted_low)}
              <span className="font-normal text-primary/70 mx-1">~</span>
              {formatPrice(pricePred.predicted_high)}
            </p>
            {pricePred.confidence_level && (
              <p className="text-xs text-primary/80">
                신뢰도 {Math.round(pricePred.confidence_level * 100)}%
              </p>
            )}
          </div>
        )}

        {/* 성사 확률 */}
        {convPred && probPercent !== null && (
          <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 space-y-1">
            <p className="text-xs text-warning font-medium">딜 성사 확률</p>
            <p className={`text-2xl font-bold ${probColor}`}>
              {probPercent}
              <span className="text-sm font-normal text-muted-foreground">%</span>
            </p>
            {/* 확률 게이지 */}
            <div className="w-full h-1.5 bg-warning/20 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  probPercent >= 70
                    ? "bg-success"
                    : probPercent >= 40
                    ? "bg-warning"
                    : "bg-destructive"
                }`}
                style={{ width: `${probPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 핵심 긍정 요소 */}
      {keyFactors.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-success">✅ 성사 기여 요인</p>
          <ul className="space-y-1">
            {keyFactors.slice(0, 3).map((factor, i) => (
              <li key={i} className="text-xs flex gap-1.5 text-muted-foreground">
                <span className="text-success shrink-0">•</span>
                <span>{factor}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 리스크 요인 */}
      {riskFactors.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-destructive">⚠️ 리스크 요인</p>
          <ul className="space-y-1">
            {riskFactors.slice(0, 2).map((factor, i) => (
              <li key={i} className="text-xs flex gap-1.5 text-muted-foreground">
                <span className="text-warning shrink-0">•</span>
                <span>{factor}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        * 인근 실거래가 데이터와 매수자 매칭 결과를 기반으로 한 AI 추정치입니다.
        투자 판단의 근거로 단독 사용하지 마세요.
      </p>
    </div>
  );
}

function formatPrice(value: number | null | undefined): string {
  if (!value) return "미확인";
  const eok = Math.round(value / 100000000);
  return `${eok}억`;
}
