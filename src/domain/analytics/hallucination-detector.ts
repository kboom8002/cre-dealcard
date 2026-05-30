import type { SupabaseClient } from "@supabase/supabase-js";

export interface AnomalyFlag {
  type: 'price_outlier' | 'size_outlier' | 'region_hallucination' | 'prompt_degradation';
  severity: 'warning' | 'critical';
  detail: string;
}

// 한국 주요 행정지역 및 CRE 핵심 구역명 패턴
const KOREAN_REGION_PATTERN = /(?:서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주|GBD|CBD|YBD|BBD|판교|분당|성수|역삼|강남|서초|마포|여의도|종로)/;

/**
 * 평/㎡ 등 한글 숫자가 포함된 CRE 텍스트에서 숫자만 추출
 */
function extractNumberFromText(text: string): number | null {
  if (!text) return null;
  const match = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return parseFloat(match[1]);
}

/**
 * 조/억 등 한국식 복합 통화 문자열을 억 단위 숫자로 환산
 * 예: "6조 5천억" -> 65000, "250억" -> 250
 */
export function extractPriceInEok(priceStr: string): number | null {
  if (!priceStr) return null;
  const cleaned = priceStr.replace(/,/g, '').replace(/\s/g, '');

  let totalEok = 0;
  let matched = false;

  // 1. '조' 추출 (예: "6조")
  const joMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*조/);
  if (joMatch) {
    totalEok += parseFloat(joMatch[1]) * 10000;
    matched = true;
  }

  // 2. '억' 추출 (예: "5000억", "250억")
  const eokMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*억/);
  if (eokMatch) {
    totalEok += parseFloat(eokMatch[1]);
    matched = true;
  }

  // 3. 만원 단위 또는 순수 숫자 처리
  if (!matched) {
    const manMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*만/);
    if (manMatch) {
      return parseFloat(manMatch[1]) / 10000; // 만원 -> 억 단위 환산
    }

    const numMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
    if (numMatch) {
      const num = parseFloat(numMatch[1]);
      if (num >= 1000000) return num / 100_000_000; // 원화 -> 억 단위 환산
      return num;
    }
  }

  return matched ? totalEok : null;
}

/**
 * AI 산출물 결과 분석 후 이상 플래그들을 추출하고 DB에 저장
 */
export async function detectAnomalies(
  supabase: SupabaseClient,
  aiRunId: string,
  output: Record<string, unknown>
): Promise<AnomalyFlag[]> {
  const flags: AnomalyFlag[] = [];

  // 1. 가격 이상치 (price_outlier)
  if (output.priceBand) {
    const priceStr = String(output.priceBand);
    const valInEok = extractPriceInEok(priceStr);
    
    if (valInEok !== null) {
      // 1억 미만 또는 5조(50000억) 초과인 비현실적 범위 감지
      if (valInEok < 1 || valInEok > 50000) {
        flags.push({
          type: "price_outlier",
          severity: valInEok > 50000 ? "critical" : "warning",
          detail: `비정상적인 총 가격대 감지: ${priceStr} (환산: ${valInEok}억, 정상 범위: 1억 ~ 5조)`,
        });
      }
    }
  }

  // 2. 면적 이상치 (size_outlier)
  if (output.sizeSignal) {
    const sizeStr = String(output.sizeSignal);
    const sizeNum = extractNumberFromText(sizeStr);
    
    if (sizeNum !== null) {
      const isPyung = sizeStr.includes("평");
      const sizeInPyung = isPyung ? sizeNum : sizeNum / 3.30578;
      
      if (sizeInPyung < 1 || sizeInPyung > 1000000) { // 1평 미만 또는 100만평 이상
        flags.push({
          type: "size_outlier",
          severity: "critical",
          detail: `비정상적인 연면적 수치 감지: ${sizeStr} (정상 범위: 1평 ~ 100만평)`,
        });
      }
    }
  }

  // 3. 지역 환각 (region_hallucination)
  if (output.areaSignal) {
    const areaStr = String(output.areaSignal);
    if (!KOREAN_REGION_PATTERN.test(areaStr)) {
      flags.push({
        type: "region_hallucination",
        severity: "critical",
        detail: `국내 주요 행정구역 또는 CRE 권역 키워드 누락 (감지된 텍스트: "${areaStr}")`,
      });
    }
  }

  // 4. 최근 7일 내 Zod 붕괴율 (prompt_degradation)
  try {
    if (supabase && typeof supabase.from === "function") {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      
      // 최근 7일 동안의 전체 AI 실행 횟수 계산
      const { count: recentTotal } = await supabase
        .from("ai_runs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo);

      // 최근 7일 동안 실패한(Zod parse error 등) AI 실행 횟수 계산
      const { count: recentFails } = await supabase
        .from("ai_runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", sevenDaysAgo);

      if (recentTotal && recentFails && recentFails / recentTotal > 0.1) {
        flags.push({
          type: "prompt_degradation",
          severity: "critical",
          detail: `최근 7일간 AI 호출 실패율 임계치 초과: ${((recentFails / recentTotal) * 100).toFixed(1)}% (허용치: 10%)`,
        });
      }
    }
  } catch (err: any) {
    console.warn("[detectAnomalies] Failed to compute prompt degradation metric:", err.message);
  }

  // 5. 감지된 이상 플래그 리스트가 있다면 DB `ai_runs` 레코드에 업데이트 적재
  if (flags.length > 0 && aiRunId && supabase && typeof supabase.from === "function") {
    const { error: updateError } = await supabase
      .from("ai_runs")
      .update({ anomaly_flags: flags })
      .eq("id", aiRunId);
      
    if (updateError) {
      console.error("[detectAnomalies] Failed to write anomaly flags to ai_runs:", updateError.message);
    }
  }

  return flags;
}
