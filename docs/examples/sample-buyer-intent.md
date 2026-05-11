# Sample Buyer Intent

## Purpose

This sample is used to test:

- BuyerIntentNormalizerAgent
- BuyerMemoWriterAgent

---

## Raw Buyer Memo

```text
김대표님 조건. 예산은 50억에서 80억 정도.
성수나 강남 쪽 선호. 사옥으로 일부 쓰고 나머지는 임대수익 있으면 좋겠다고 함.
주차는 꼭 필요하고, 너무 노후된 건물은 부담스러워함.
대출은 50% 정도까지는 생각하지만 확정 아님.
기존 임차인 만기가 언제인지 중요하게 봄.
```

---

## Expected Buyer Intent Lite

```json
{
  "buyerType": "법인 또는 대표 개인 매수자",
  "budgetRange": {
    "min": 5000000000,
    "max": 8000000000,
    "display": "50억~80억"
  },
  "preferredRegions": ["성수", "강남"],
  "assetTypes": ["꼬마빌딩", "근생빌딩"],
  "purchasePurpose": "사옥 사용 + 일부 임대수익",
  "mustHave": ["주차", "사옥 사용 가능성", "임차인 만기 확인"],
  "niceToHave": ["일부 임대수익", "선호 권역"],
  "riskTolerance": "medium",
  "financingNote": "대출 50% 수준을 예비적으로 고려하나 실제 가능 여부는 확인 필요",
  "missingQuestions": [
    "실사용 가능 면적은 충분한가?",
    "기존 임차인 만기는 언제인가?",
    "주차 조건은 사옥 수요에 충분한가?",
    "리모델링 비용과 기간은 어느 정도인가?"
  ],
  "privacyNotes": [
    "매수자 실명과 연락처는 공유 문서에 포함하지 않음"
  ]
}
```
