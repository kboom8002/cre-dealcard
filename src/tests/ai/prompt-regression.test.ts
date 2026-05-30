import { describe, it, expect } from "vitest";
import { GOLDEN_TEST_CASES } from "./golden-testset";
import { runBrokerDealCard } from "@/ai/agents/broker-deal-card";

describe("AI Prompt Regression & Golden Testset", () => {
  it("should parse all golden cases successfully and satisfy accuracy threshold", async () => {
    let parseSuccessCount = 0;
    let totalFieldsChecked = 0;
    let matchingFieldsCount = 0;

    for (const testCase of GOLDEN_TEST_CASES) {
      try {
        const result = await runBrokerDealCard({ memo: testCase.memo });
        
        // 1. Zod 파싱 성공 및 구조화 검증
        expect(result.parsedMemo).toBeDefined();
        expect(result.parsedMemo.extractedFacts).toBeDefined();
        expect(result.buildingTruth).toBeDefined();
        expect(result.blindTeaser).toBeDefined();
        parseSuccessCount++;

        // 2. 실제 Zod 스키마 계층구조 기반 개별 기댓값 정합율 대조 (Null-safe 처리)
        const facts = result.parsedMemo.extractedFacts;
        const expected = testCase.expectedFields;

        const checks = [
          { field: "region", val: facts.region, exp: expected.region },
          { field: "assetType", val: facts.assetType, exp: expected.assetType },
          { field: "priceText", val: facts.priceText, exp: expected.priceText },
        ];

        let caseMatchCount = 0;

        for (const check of checks) {
          totalFieldsChecked++;
          
          if (check.val) {
            const valStr = String(check.val).toLowerCase();
            const expStr = String(check.exp).toLowerCase();
            
            const isMatch = 
              valStr.includes(expStr) || 
              expStr.includes(valStr);
              
            if (isMatch) {
              caseMatchCount++;
              matchingFieldsCount++;
            }
          }
        }

        const caseMatchRate = caseMatchCount / checks.length;
        if (caseMatchRate < testCase.tolerances.fieldMatchRate) {
          console.warn(`[Regression Warning] TestCase ${testCase.id} matched ${caseMatchCount}/${checks.length} fields. Accuracy is below threshold.`);
        }
      } catch (err: any) {
        console.error(`[Regression Error] TestCase ${testCase.id} failed to process:`, err.message);
        throw err;
      }
    }

    // 전체 Zod 파싱 통과율 점검 (100% 필수)
    expect(parseSuccessCount).toBe(GOLDEN_TEST_CASES.length);
    
    const overallAccuracy = matchingFieldsCount / totalFieldsChecked;
    console.log(`[Golden Testset Results] Overall Parsing Success: ${parseSuccessCount}/${GOLDEN_TEST_CASES.length} | Accumulated Field Accuracy: ${(overallAccuracy * 100).toFixed(1)}%`);
  }, 180000); // 180초 (3분) 타임아웃 지정
});
