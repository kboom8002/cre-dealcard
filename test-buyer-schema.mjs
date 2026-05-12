// Test the buyer intent schema with real AI-like output
import { z } from "zod";

const BuyerIntentLiteOutputSchema = z.object({
  buyerType: z.string().catch("알 수 없음"),
  budgetRange: z.object({
    min: z.coerce.number().nullable().catch(null),
    max: z.coerce.number().nullable().catch(null),
    display: z.string().catch("예산 미정"),
  }),
  preferredRegions: z.array(z.string()).catch([]),
  assetTypes: z.array(z.string()).catch([]),
  purchasePurpose: z.string().catch(""),
  mustHave: z.array(z.string()).catch([]),
  niceToHave: z.array(z.string()).catch([]),
  riskTolerance: z.string().toLowerCase().pipe(z.enum(["low", "medium", "high", "unknown"])).catch("unknown"),
  financingNote: z.string().nullable().catch(null),
  missingQuestions: z.array(z.string()).catch([]),
  privacyNotes: z.array(z.string()).catch([]),
  inferredPurpose: z.string().pipe(z.enum(["사옥", "투자", "증여", "혼합", "unknown"])).catch("unknown").optional(),
  taxSensitivity: z.string().toLowerCase().pipe(z.enum(["very_high", "high", "medium", "low"])).catch("medium").optional(),
  urgency: z.string().toLowerCase().pipe(z.enum(["high", "medium", "low"])).catch("medium").optional(),
  hiddenKeywords: z.array(z.string()).catch([]).optional(),
  recommendedWeightProfile: z.string().pipe(z.enum(["사옥", "투자", "증여", "default"])).catch("default").optional(),
});

// Simulate what GPT might return (various edge cases)
const testCases = [
  {
    name: "Normal",
    data: {
      buyerType: "개인",
      budgetRange: { min: 5000000000, max: 8000000000, display: "50억-80억" },
      preferredRegions: ["성수동", "강남구"],
      assetTypes: ["꼬마빌딩"],
      purchasePurpose: "사옥+임대",
      mustHave: ["주차장"],
      niceToHave: ["리모델링 가능"],
      riskTolerance: "medium",
      financingNote: "50% 가능",
      missingQuestions: ["임차인 만기?"],
      privacyNotes: ["신원 비공개"],
      inferredPurpose: "혼합",
      taxSensitivity: "medium",
      urgency: "medium",
      hiddenKeywords: ["사옥수요"],
      recommendedWeightProfile: "default",
    }
  },
  {
    name: "AI returns strings for numbers",
    data: {
      buyerType: "개인",
      budgetRange: { min: "5000000000", max: "8000000000", display: "50억-80억" },
      preferredRegions: ["성수동"],
      assetTypes: ["꼬마빌딩"],
      purchasePurpose: "사옥",
      mustHave: ["주차장"],
      niceToHave: [],
      riskTolerance: "Medium",  // uppercase!
      financingNote: null,
      missingQuestions: [],
      privacyNotes: ["신원 비공개"],
    }
  },
  {
    name: "Missing optional fields",
    data: {
      buyerType: "법인",
      budgetRange: { min: null, max: null, display: "미정" },
      preferredRegions: [],
      assetTypes: [],
      purchasePurpose: "",
      mustHave: [],
      niceToHave: [],
      riskTolerance: "unknown",
      financingNote: null,
      missingQuestions: [],
      privacyNotes: [],
    }
  }
];

for (const tc of testCases) {
  const result = BuyerIntentLiteOutputSchema.safeParse(tc.data);
  if (result.success) {
    console.log(`✅ ${tc.name}: PASSED`);
  } else {
    console.log(`❌ ${tc.name}: FAILED`);
    console.log(JSON.stringify(result.error.issues, null, 2));
  }
}
