import { z } from "zod";

const BuyerMemoGenerateRequest = z.object({
  buildingId: z.string().uuid(),
  buyerIntentId: z.string().uuid(),
  tone: z.enum(["kakao", "professional", "brief"]).default("kakao"),
});

try {
  BuyerMemoGenerateRequest.parse({
    buildingId: "1af74f61-8545-4388-8e9e-f7ae2c3c581f",
    buyerIntentId: "3698558e-cbbb-4b4b-bba4-7c4e613039e0",
    tone: "kakao"
  });
  console.log("Success");
} catch (e) {
  console.error(e);
}
