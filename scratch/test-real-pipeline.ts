import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Make sure NODE_ENV is set to something other than test
process.env.NODE_ENV = "development";

async function testReal() {
  const { brokerDealCardFromMemo } = await import("../src/domain/building/broker-deal-card");

  const memo = `성수동 꼬마빌딩, 대지 150평, 연면적 280평, 지상 4층
1층 카페 임차 중 (보증 5천/월세 400), 2~3층 사무실 공실
엘리베이터 없음, 2018년 전면 리모델링, 주차 3대
매도인 양도세 이슈로 급하게 팔고 싶어 함
호가 78억, 협의 가능. 주소는 블라인드 처리 원함`;

  const userId = "702b8438-5dbc-4006-a0d0-909cfb00c36f"; // demo-broker UUID
  
  try {
    console.log("Starting real pipeline execution...");
    const result = await brokerDealCardFromMemo(
      {
        memo,
        visibilityPreference: "blind",
      },
      userId
    );
    console.log("REAL PIPELINE SUCCESS:", result);
  } catch (err: any) {
    console.error("REAL PIPELINE FAILURE:");
    console.error(err);
  }
}

testReal();
