import { runBuyerIntentNormalizer } from "./src/ai/agents/buyer-intent-normalizer";
import { ZodError } from "zod/v4";

async function test() {
  const memo = "김대표님 조건. 예산은 50억에서 80억 정도.\n성수나 강남 쪽 선호. 사옥으로 일부 쓰고 나머지는 임대수익 있었으면 좋겠다고 함.\n주차는 꼭 필요하고, 너무 노후된 건물은 부담스러워함.\n대출은 50% 정도까지는 생각하지만 확정 아님.\n기존 임차인 만기가 언제인지 중요하게 봄.";
  try {
    const result = await runBuyerIntentNormalizer(memo);
    console.log("Success:", JSON.stringify(result.intent, null, 2));
  } catch (err: any) {
    if (err instanceof ZodError) {
      console.log("ZodError Issues:");
      console.log(err.issues);
    } else {
      console.log("Error:", err.message);
    }
  }
}

test();
