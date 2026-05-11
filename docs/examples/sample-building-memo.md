# Sample Building Memo

## Purpose

This sample is used to test:

- MemoParserAgent
- BuildingMiniTruthAgent
- DisclosureGuardAgent
- SignalComposerAgent
- Blind Teaser generation

---

## Raw Broker Memo

```text
성수동 쪽 80억대 근생 건물. 정확한 주소는 아직 비공개로 해주세요.
1층은 F&B로 쓰기 괜찮고 상층은 사무실 가능. 일부 임대 중이고 일부 공실 가능성 있음.
매도자는 너무 공개되는 걸 싫어해서 임차인명이나 월세 세부는 빼고 먼저 사옥 수요자나 장기보유형한테 반응 보고 싶어함.
주차는 확인 필요. 건물은 좀 노후됐고 리모델링 스토리 가능할 수도 있음.
```

---

## Expected Parsed Signals

```json
{
  "region": "성수동 쪽",
  "assetType": "근생 건물",
  "priceText": "80억대",
  "currentUse": "일부 임대 중",
  "vacancySignal": "일부 공실 가능성 있음",
  "sellerMotivationText": "너무 공개되는 걸 싫어함 / 먼저 반응 보고 싶어함",
  "brokerNotes": [
    "사옥 수요자 또는 장기보유형에게 반응 테스트",
    "주차 확인 필요",
    "노후 건물",
    "리모델링 스토리 가능성"
  ],
  "detectedSensitiveFields": [
    "exact_address",
    "tenant_name",
    "unit_rent",
    "seller_motivation"
  ]
}
```

---

## Expected Building SSoT Lite

```json
{
  "areaSignal": "성수권역",
  "assetType": "근생형 꼬마빌딩",
  "priceBand": "80억대",
  "sizeSignal": null,
  "currentUseSignal": "일부 임대 중",
  "vacancySignal": "일부 공실 가능성 확인 필요",
  "fitSummary": "사옥+부분임대형 또는 장기보유형 매수자 관점에서 검토 가설을 세울 수 있습니다.",
  "cautionSummary": "주차, 임대차 만기, 위반건축물 여부, 수선 이력, 리모델링 비용 확인이 필요합니다.",
  "hiddenFields": [
    "exact_address",
    "tenant_name",
    "unit_rent",
    "seller_motivation"
  ],
  "missingData": [
    "정확한 공부자료",
    "임대차 요약표",
    "건물 사진",
    "주차 조건",
    "수선 이력"
  ]
}
```

---

## Expected Blind Teaser Safety

The output must not contain:

```text
- exact address
- tenant name
- unit-level rent
- seller motivation
```
