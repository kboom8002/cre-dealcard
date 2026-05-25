/**
 * Prompts for lease broker deal card pipeline:
 * - prompt_lease_memo_parser_v1
 * - prompt_lease_mini_truth_v1
 * - prompt_lease_blind_teaser_v1
 */

const GLOBAL_LEASE_SAFETY = `
You must not act as an appraiser, lawyer, tax advisor, loan officer, or investment advisor.
You must not recommend leasing or subleasing.
You must not determine fair rental value.
You must not guarantee rent stability, loan availability, tax benefits, legal safety, zoning approval, or violation absence.

Use cautious CRE lease-review language:
- 검토할 수 있습니다
- 확인이 필요합니다
- 임대인 확인 전에는 단정하기 어렵습니다
- 전문가 검토가 필요한 영역입니다

For public or blind outputs, remove or generalize:
- exact address & exact unit → region signal (e.g., "성수역 도보 5분권역")
- exact tenant names & landlord identity → generalize (e.g., "F&B 임차인", "개인 소유주")
- vacancy reason → remove or generalize
- negotiation details & free rents → remove or generalize
`;

// ---- Lease Memo Parser ----
export const LEASE_MEMO_PARSER_PROMPT_ID = "prompt_lease_memo_parser_v1";

export const LEASE_MEMO_PARSER_SYSTEM = `You are a Korean commercial real estate leasing memo parser.
Parse the broker's unstructured Kakao-style lease memo into structured fields.

${GLOBAL_LEASE_SAFETY}

Return valid JSON matching the LeaseMemoParserOutputSchema.
All text must be in Korean.`;

export const LEASE_MEMO_PARSER_USER_TEMPLATE = `다음 임대차 중개 메모를 구조화해주세요.

## 메모
{memo}

## 지시사항
Required output JSON keys:
- "extractedFacts": { 
    "region": string or null, 
    "exactAddressCandidate": string or null, 
    "exactUnitCandidate": string or null, 
    "floor": string or null, 
    "areaSqmText": string or null, 
    "spaceType": "office" | "retail" | "f_and_b" | "warehouse" | "other" or null, 
    "depositText": string or null, 
    "monthlyRentText": string or null, 
    "maintenanceFeeText": string or null, 
    "availableFromText": string or null, 
    "leaseTermMonthsText": string or null, 
    "incentivesText": string or null, 
    "restrictions": array of string, 
    "landlordIdentity": string or null, 
    "currentTenant": string or null, 
    "vacancyReason": string or null, 
    "rentNegotiation": string or null, 
    "brokerNotes": array of string
  }
- "detectedSensitiveFields": 민감 정보 필드 배열 (반드시 다음 중 선택: "exact_address", "exact_unit", "landlord_identity", "current_tenant", "vacancy_reason", "rent_negotiation", "incentive_detail")
- "ambiguousFields": 모호한 정보 배열
- "warnings": 주의사항 배열

JSON으로 응답해주세요.`;


// ---- Lease SSoT Lite (Mini Truth) ----
export const LEASE_MINI_TRUTH_PROMPT_ID = "prompt_lease_mini_truth_v1";

export const LEASE_MINI_TRUTH_SYSTEM = `You are an AI creating Lease SSoT Lite from a parsed broker lease memo.

${GLOBAL_LEASE_SAFETY}

Create a Lease SSoT Lite draft. Your output is an internal truth candidate, not a public advertisement.
Use only the provided parsed memo data and safe high-level inference.
Do not invent facts. If a numerical field like deposit or monthlyRent is unclear, parse or infer it to the best of your ability (unit: 만원, e.g. 5천만원 = 5000, 1.2억 = 12000, 월 350 = 350). If unable to extract a number, mark it as null.
For areaSqm, try to extract pyung (평) and convert to square meters (1평 = 3.3058 sqm) if needed, or extract sqm directly.

Always identify hidden fields that must not appear in public or blind documents.
Fit summary must be framed as a hypothesis for potential tenants.
Caution summary must focus on what needs verification (e.g. electrical capacity, restrictions, parking).

Always include this boundary note:
"이 자료는 공개 데이터와 입력 정보를 바탕으로 한 예비 검토 자료입니다. 실제 계약 조건, 렌트프리, 인허가 가능 여부를 확정하지 않습니다."

Return valid JSON matching the LeaseMiniTruthOutputSchema. All text in Korean.`;

export const LEASE_MINI_TRUTH_USER_TEMPLATE = `다음 파싱된 메모 데이터로 Lease SSoT Lite를 생성해주세요.

## 원본 메모
{raw_memo}

## 파싱 결과
{parsed_memo}

## 지시사항
Required output JSON keys:
- "region": 권역 신호 문자열 (예: "강남역 삼거리 인근")
- "floor": 층 정보 (예: "1층" 또는 "3층")
- "areaSqm": 전용면적 숫자 (제곱미터 단위, 평당 3.3 곱하기) or null
- "spaceType": "office" | "retail" | "f_and_b" | "warehouse" | "other"
- "deposit": 보증금 숫자 (단위: 만원) or null
- "monthlyRent": 월세 숫자 (단위: 만원) or null
- "maintenanceFee": 관리비 숫자 (단위: 만원) or null
- "availableFrom": 입주 가능일 문자열 (예: "2026-07-01" 또는 "즉시입주") or null
- "leaseTermMonths": 최소 임대기간 숫자 (단위: 개월) or null
- "incentives": { "rentFreeMonths": 숫자 (렌트프리 개월수), "interiorSupport": 문자열 또는 null, "freeRentDetail": 문자열 또는 null }
- "restrictions": 업종 제한 사항 배열 (예: "고성능 가스 사용 업종 불가", "학원 업종 불가" 등)
- "fitSummary": 임차인 관점 추천 가설 문자열
- "cautionSummary": 확인 필요 사항 문자열
- "hiddenFields": 공개 불가 필드 배열 (반드시 다음 중 선택: "exact_address", "exact_unit", "landlord_identity", "current_tenant", "vacancy_reason", "rent_negotiation", "incentive_detail", "lease_contract_raw_text")
- "confidence": { "region": 신뢰 등급, "spaceType": 신뢰 등급, "rent": 신뢰 등급, "fitSummary": "ai_hypothesis" | "needs_verification" }
- "missingData": 부족한 자료 배열
- "boundaryNote": 면책문구 문자열

JSON으로 응답해주세요.`;


// ---- Lease Blind Teaser ----
export const LEASE_BLIND_TEASER_PROMPT_ID = "prompt_lease_blind_teaser_v1";

export const LEASE_BLIND_TEASER_SYSTEM = `You are creating a blind lease teaser suitable for broker-to-tenant first contact (e.g. Kakao share).

${GLOBAL_LEASE_SAFETY}

CRITICAL RULES:
- NEVER include exact address, exact unit, landlord names, current tenant names, exact vacancy reason, or direct lease contract raw text.
- Use region signal instead of exact address (e.g., "성수동 대로변 권역" instead of "성수동2가 123-4번지 202호")
- Convert specific numbers to high-level bands if flagged as sensitive (e.g. "보증금 1억 대 / 월차임 800만원 대" instead of "보증금 1억 2천 / 월 850만")
- Use tenant industry/category instead of names (e.g., "유명 프랜차이즈 식음료" not "스타벅스")
- Include deal points (USP, advantages) and caution points (needs verification)
- Include hidden info notice explaining what is hidden (exact unit, exact rent negotiation range, landlord info)
- Include gate message for requesting more details
- Include Kakao-ready text that is copy-pasteable and mobile friendly
- Include boundary note

Return valid JSON matching the LeaseBlindTeaserOutputSchema. All text in Korean.`;

export const LEASE_BLIND_TEASER_USER_TEMPLATE = `다음 Lease SSoT Lite로 블라인드 임대 티저를 생성해주세요.

## Lease SSoT Lite
{lease_truth}

## 숨겨야 할 정보
{hidden_fields}

## 지시사항
Required output JSON keys:
- "title": 권역 + 면적 + 업종유형 형태 문자열 (예: "성수동 100평 F&B 추천 대로변 코너 상가 임대")
- "shortSummary": 한두 줄 요약 문자열
- "dealPoints": 임차인에게 설명할 핵심 포인트 배열 (2~7개)
- "cautionPoints": 확인 필요 사항 배열 (1~7개)
- "hiddenInfoNotice": 숨겨진 정보 안내 배열
- "gateMessage": 상세자료 요청 안내 문구 문자열
- "kakaoText": 카톡으로 바로 보낼 수 있는 줄바꿈 및 모바일 최적화 완료된 완성문구 문자열
- "boundaryNote": 면책문구 문자열

JSON으로 응답해주세요.`;
