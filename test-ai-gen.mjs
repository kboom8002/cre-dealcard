import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI();
const memo = "김대표님 조건. 예산은 50억에서 80억 정도.\n성수나 강남 쪽 선호. 사옥으로 일부 쓰고 나머지는 임대수익 있었으면 좋겠다고 함.\n주차는 꼭 필요하고, 너무 노후된 건물은 부담스러워함.\n대출은 50% 정도까지는 생각하지만 확정 아님.\n기존 임차인 만기가 언제인지 중요하게 봄.";

const BUYER_INTENT_SYSTEM = `You are a Korean commercial real estate buyer intent normalizer.
Extract buyer intent from a broker memo about a buyer's conditions.

You must not act as an appraiser, lawyer, tax advisor, loan officer, or investment advisor.
You must not recommend purchase or sale.
You must not determine fair value.
You must not guarantee rent growth, loan availability, tax benefits, legal safety, zoning approval, or violation absence.

Use cautious CRE deal-review language:
- 검토할 수 있습니다
- 확인이 필요합니다
- 자료 확인 전에는 단정하기 어렵습니다
- 전문가 검토가 필요한 영역입니다

CRITICAL RULES:
- Do NOT expose buyer identity or contact details.
- Do NOT guarantee that any building is a good match.
- Focus on: budget, regions, asset types, purchase purpose, must-have, nice-to-have, risk tolerance, financing note, missing questions.
- Budget amounts should be in Korean won (원). Convert "50억" to 5000000000.
- privacyNotes must always include that buyer identity is not shared.

INFERRED FIELDS (additional - derive from memo context):
- inferredPurpose: classify as "사옥"|"투자"|"증여"|"혼합"|"unknown"
  (사옥=office/company HQ, 투자=investment/income, 증여=inheritance/gift)
- taxSensitivity: "very_high"|"high"|"medium"|"low"
  (증여/법인 = very_high, 투자 = high, 사옥 = medium)
- urgency: "high"|"medium"|"low"
  (signals: 급매/빠른/올해안/년내 = high)
- hiddenKeywords: array of implicit signals extracted from memo
- recommendedWeightProfile: "사옥"|"투자"|"증여"|"default"
  (map from inferredPurpose; use default when 혼합 or unknown)

Return valid JSON matching BuyerIntentLiteOutputSchema. All text in Korean.`;

const userPrompt = `다음 매수자 조건 메모를 구조화해주세요.

## 메모
${memo}

## 지시사항
1. buyerType: 매수자 유형 (법인, 개인, 펀드 등)
2. budgetRange: { min, max (원 단위 숫자), display (한글 표시) }
3. preferredRegions: 선호 지역 리스트
4. assetTypes: 선호 자산 유형
5. purchasePurpose: 매입 목적
6. mustHave: 필수 조건
7. niceToHave: 우대 조건
8. riskTolerance: low/medium/high/unknown
9. financingNote: 대출 관련 메모 (확정 아닌 예비 정보)
10. missingQuestions: 추가 확인 필요한 질문들
11. privacyNotes: 개인정보 보호 관련 안내
12. inferredPurpose: "사옥"|"투자"|"증여"|"혼합"|"unknown"
13. taxSensitivity: "very_high"|"high"|"medium"|"low"
14. urgency: "high"|"medium"|"low"
15. hiddenKeywords: 메모에서 추론된 암묵적 신호 배열
16. recommendedWeightProfile: "사옥"|"투자"|"증여"|"default"

JSON으로 응답해주세요.`;

async function test() {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: BUYER_INTENT_SYSTEM },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 4096,
  });
  console.log(response.choices[0]?.message?.content);
}

test();
