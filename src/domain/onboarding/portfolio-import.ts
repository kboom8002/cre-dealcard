import { SupabaseClient } from "@supabase/supabase-js";
import { validateMemoQuality } from "@/domain/building/memo-quality-gate";
import { sanitizeMemo, desanitizeOutput } from "@/ai/sanitizer/memo-sanitizer";
import { runBrokerDealCard } from "@/ai/agents/broker-deal-card";

export interface ImportSummary {
  successCount: number;
  failCount: number;
  totalCount: number;
  results: ImportResult[];
}

export interface ImportResult {
  index: number;
  memoSnippet: string;
  success: boolean;
  buildingId?: string;
  errorReason?: string;
}

/**
 * 포트폴리오 AI 일괄 정리 임포터 (F13-1)
 * 사용자가 입력한 여러 개의 비정형 매물 메모를 분할하여,
 * 각각 Memo Parser Quality Gate 검증 후 AI 파이프라인을 거쳐 SSoT로 일괄 등록합니다.
 */
export async function importPortfolioMemos(
  supabase: SupabaseClient,
  userId: string,
  rawMemosText: string
): Promise<ImportSummary> {
  // 1. 메모 분할 (빈 라인 또는 '---' 또는 대시 기호 등으로 여러 매물 분할)
  const delimiters = [/\n\s*---\s*\n/, /\n\s*\n/];
  let memos = [rawMemosText];

  for (const delimiter of delimiters) {
    memos = memos.flatMap(m => m.split(delimiter)).map(m => m.trim()).filter(m => m.length > 5);
  }

  const results: ImportResult[] = [];
  let successCount = 0;
  let failCount = 0;

  // 최대 5건으로 안전 제한 (무료 체험 한도 및 비용 방어)
  const targetMemos = memos.slice(0, 5);

  for (let i = 0; i < targetMemos.length; i++) {
    const memo = targetMemos[i];
    const snippet = memo.substring(0, 30) + (memo.length > 30 ? "..." : "");

    try {
      // 1) 최소 품질 Gate (F1)
      const quality = validateMemoQuality(memo);
      if (!quality.pass) {
        results.push({
          index: i + 1,
          memoSnippet: snippet,
          success: false,
          errorReason: `최소 품질 미달: ${quality.suggestion}`,
        });
        failCount++;
        continue;
      }

      // 2) AI DealCard 파이프라인 가동 (PII 토크나이징 F3 자동 내장됨)
      // runBrokerDealCard 내부에서 supabase에 insert하는지 확인이 필요하지만, 
      // API 라우트 로직과 동일하게 빌딩 SSoT 레코드를 삽입해 줍니다.
      const dealResult = await runBrokerDealCard({ memo });
      
      if (!dealResult || !dealResult.buildingTruth) {
        throw new Error("AI 파싱 결과 추출에 실패했습니다.");
      }

      const truth = dealResult.buildingTruth;

      // 3) Supabase DB에 저장
      const { data: newBuilding, error: dbError } = await supabase
        .from("building_ssot_lite")
        .insert({
          owner_id: userId,
          area_signal: truth.areaSignal,
          asset_type: truth.assetType,
          price_band: truth.priceBand,
          size_signal: truth.sizeSignal,
          fit_summary: truth.fitSummary,
          deal_points: [truth.fitSummary],
          caution_points: [truth.cautionSummary],
          raw_input: memo, // 비식별화 이전 원본은 소유주 계정 내 로컬 보관
          status: "active",
        })
        .select("id")
        .single();

      if (dbError) throw dbError;

      // 4) 성공 이벤트 기록
      await supabase.from("activity_events").insert({
        actor_id: userId,
        event_type: "deal_card_created",
        entity_type: "building_ssot_lite",
        entity_id: newBuilding.id,
        metadata: { source: "portfolio_importer" },
      });

      results.push({
        index: i + 1,
        memoSnippet: snippet,
        success: true,
        buildingId: newBuilding.id,
      });
      successCount++;
    } catch (err: any) {
      results.push({
        index: i + 1,
        memoSnippet: snippet,
        success: false,
        errorReason: err.message || "알 수 없는 시스템 오류가 발생했습니다.",
      });
      failCount++;
    }
  }

  return {
    successCount,
    failCount,
    totalCount: targetMemos.length,
    results,
  };
}
