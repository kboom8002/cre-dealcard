# UAT-02-Agent: Antigravity 에이전트 실행용 E2E 파이프라인 테스트 스크립트

> **문서 번호**: UAT-02-Agent v1.0
> **실행 환경**: Antigravity Agent (with shell access)
> **대상 파이프라인**: 메모 → 딜카드 → 바텀시트 → 모바일 IM Basic/Pro → PPTX IM Basic/Pro
> **데이터 기반**: `docs/test/CREDEAL_E2E_테스트데이터셋.md` 6건 전체
> **참조**: UAT-02-A (Basic), UAT-02-B (Pro) 인간 테스트 스크립트

---

## 0. 실행 전제 조건

### 0.1 환경 변수 확인

```bash
# 1. dev 서버 기동 확인 (이미 떠있으면 skip)
curl -s http://localhost:3000/api/health | jq .

# 2. 필요 환경 변수 존재 확인
echo "SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL:-(missing)}"
echo "SUPABASE_KEY: ${SUPABASE_SERVICE_ROLE_KEY:+set}"
```

### 0.2 테스트 인증 토큰 취득

```bash
# Supabase service role로 테스트 브로커 세션 토큰 취득
# 실제 환경에서는 로그인 API 또는 service-role 토큰 사용
export TEST_TOKEN="<브로커_인증_토큰>"
export BASE_URL="http://localhost:3000"
export RESULTS_DIR="docs/uat02/results"
mkdir -p "$RESULTS_DIR"
```

---

## 1. 테스트 데이터 정의

> 에이전트는 아래 6건의 메모와 바텀시트 데이터를 순차적으로 API에 투입합니다.
> 데이터 원본: `docs/test/CREDEAL_E2E_테스트데이터셋.md`

### 1.1 물건 목록 및 기대 결과

| # | 변수명 | 물건명 | assetType | posture | 매각가(원) | 기대 등급 | Basic | Pro |
|:---:|---|---|---|---|---:|---|:---:|:---:|
| 1 | `JAMWON` | 두원빌딩 | nbhd_building | development | 24,226,800,000 | 72.67 B | ✅ | ✅ |
| 2 | `DANGSAN` | 당산동 근생빌딩 | nbhd_building | income | 11,500,000,000 | 64.59 C | ✅ | ✅ |
| 3 | `SUTAEK` | 수택동 나대지 | bare_land | development | 8,900,000,000 | 44.70 C | ✅ | ✅ |
| 4 | `YANGPYEONG` | 더레드빌딩 | office_building | income | 25,000,000,000 | 52.35 C | ✅ | ✅ |
| 5 | `HOTEL` | 에이치에비뉴호텔 | hotel | operating | 30,000,000,000 | 4.58 D | ❌차단 | ✅* |
| 6 | `YEONNAM` | 연남동 상가주택 | mixed_shop_house | income | 4,200,000,000 | 76.57 B | ✅ | ✅ |

> *물건 5는 표준 모드에서 D등급 차단, 정밀 데이터 추가 후 B등급 상승하여 Pro 생성 가능

---

## 2. Phase 1: 메모 파싱 테스트 (6건)

### 실행 스크립트

```bash
# ──────────────────────────────────────────
# TC-PARSE-01: 물건 2 — 당산동 (income)
# ──────────────────────────────────────────
MEMO_DANGSAN=$(cat <<'MEMO_EOF'
[2025-05 현장]

당산역(2호선/9호선) 도보 5분. 배후에 아파트 단지가 밀집해 있어 상권 배후가 두껍다.
국회대로·올림픽대로 접근이 좋고, 영등포구청·국회의사당 권역이라 유동도 안정적이다.

2002년 준공인데 관리 상태가 깨끗하다. 로비·복도·EV 다 손볼 데가 없다.
자주식 8대 주차에 전면 도로도 넉넉하다.

임차 구성이 이 물건의 핵심이다. 로뎀나무내과가 1F·2F·5F를 쓰고, 1F에 고은약국이
붙어 있다. 병원+약국 조합이라 공실 리스크가 낮고 회전이 없다.
3F 헬쓰장, 4F 국제와인. B1은 데이르 카페인데 소유주 자가 사용이고, 4F 일부도 자가다.

문제는 임대료다. 약국·내과는 11년째 인상이 없었다. 현재 월세 총 1,946만원인데
기준층(3F) 단가 62.4천원/평에 맞춰 재산정하면 2,867만원까지 올라간다. 47% 차이다.

자가 사용분 두 곳(B1 전체, 4F 일부)을 임대로 돌리는 것만으로도 상당 부분 채워진다.
매입 후 임대료 현실화를 전제로 보면 기대 수익률 연 3.1%.

토지 평당 75백만원. 인근 조사해보니 입지·부지 양호한 건 130~160백만원,
불리한 건 85~100백만원 선이다. 우리 물건은 그 아래다. 가격 경쟁력이 확실하다.

준공업지역인데 서울시가 2024년 10월에 제도개선 방안을 냈다. 지구단위계획 수립 시
주거용도 용적률 400%까지, 준주거/3종일반주거로 용도지역 변경도 추진 중이다.
현 용적률이 221.8%(지상 기준)라 여유가 크다.

등기가 층별구분등기다. 소유주가 형제 두 분인데 전체 매각에 두 분 다 동의하셨다.
MEMO_EOF
)

curl -s -X POST "$BASE_URL/api/broker/im-lite/parse-memo" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"memo_text\": $(echo "$MEMO_DANGSAN" | jq -Rs .),
    \"investmentPosture\": \"income\"
  }" | tee "$RESULTS_DIR/parse_dangsan.json" | jq '{ok, data: {asset_type, area_signal, price_band, warnings: (.data.warnings | length), memo_result_extracted: (.data.memo_result.extracted | length)}}'
```

### 검증 기준 (모든 6건 공통)

```bash
# 각 파싱 결과에 대해 다음을 검증:
for FILE in "$RESULTS_DIR"/parse_*.json; do
  echo "=== Checking $FILE ==="
  
  # V1: ok == true
  OK=$(jq -r '.ok' "$FILE")
  [ "$OK" = "true" ] && echo "✅ V1: ok=true" || echo "❌ V1: ok=$OK"
  
  # V2: memo_result.extracted 배열이 비어있지 않음
  EXTRACTED=$(jq '.data.memo_result.extracted | length' "$FILE")
  [ "$EXTRACTED" -gt 0 ] && echo "✅ V2: extracted=$EXTRACTED slots" || echo "❌ V2: extracted=0"
  
  # V3: injection이 감지되지 않음
  CODE=$(jq -r '.error.code // "none"' "$FILE")
  [ "$CODE" = "none" ] && echo "✅ V3: no injection" || echo "❌ V3: error=$CODE"
  
  echo ""
done
```

### 추가 메모 파싱 호출 (나머지 5건)

```bash
# TC-PARSE-02: 물건 1 — 잠원동 (development)
curl -s -X POST "$BASE_URL/api/broker/im-lite/parse-memo" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"memo_text\": \"[2026-04-12 현장]\\n\\n강남대로 바로 이면. 신사역 4분, 논현역 7분 걸어서 재봤고 실제로 그 정도 나온다.\\n간장게장 골목이 바로 옆이라 주말에도 사람이 끊이지 않는 자리. 업무·상업·주거가\\n섞여 있어서 주 7일 상권이라고 봐도 된다.\\n\\n이면 교차 골목 코너부고 바로 앞에 싸리재 소공원(약 377평)이 있다.\\n\\n건물은 1990년 준공이라 많이 낡았다. → 리모델링보다 신축이 맞는 물건.\\n\\n임차인이 여럿 있는데 매도인이 명도해서 넘기는 조건이라 매수자가 신축 부담 없이 들어올 수 있다.\\n\\n가격은 토지 평당 1.3억. 매각 희망가 약 242억.\",
    \"investmentPosture\": \"development\"
  }" | tee "$RESULTS_DIR/parse_jamwon.json" | jq '{ok}'

# TC-PARSE-03: 물건 3 — 수택동 (development, 나대지)
curl -s -X POST "$BASE_URL/api/broker/im-lite/parse-memo" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"memo_text\": \"[현장]\\n\\n경기도 구리시 수택동 419-19, 419-12, 419-96. 세 필지 합쳐 651.2㎡(196.98평).\\n현재 나대지다. 건물이 없으니 바로 개발 들어갈 수 있다.\\n\\n구리역까지 380m, 걸어서 5분.\\n매매가 89억, 평당 4,500만원.\\n용적률 1,260%까지 받으면 2,500평 규모가 나온다.\",
    \"investmentPosture\": \"development\"
  }" | tee "$RESULTS_DIR/parse_sutaek.json" | jq '{ok}'

# TC-PARSE-04: 물건 4 — 양평동 (income)
curl -s -X POST "$BASE_URL/api/broker/im-lite/parse-memo" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"memo_text\": \"[현장]\\n\\n영등포구 양평동4가 117, 134, 125-2번지. 3필지 합쳐 518.7㎡.\\n선유도역 9호선 4번출구에서 도보 1분. 대로변이고 초역세권이다.\\n\\n2018년 9월 준공. 지하 1층에 지상 10층, 업무시설.\\n보증금 5억 3,500만원, 월 임대료 5,017만원.\\n매매가 250억.\",
    \"investmentPosture\": \"income\"
  }" | tee "$RESULTS_DIR/parse_yangpyeong.json" | jq '{ok}'

# TC-PARSE-05: 물건 5 — 호텔 (operating, 극소량)
curl -s -X POST "$BASE_URL/api/broker/im-lite/parse-memo" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"memo_text\": \"[티저 수준]\\n\\n이대역 도보 3분, 신촌 대학가 호텔. 94실, 매각 300억.\\n객실당 3.19억이다. 더 이상 확인된 게 없다.\",
    \"investmentPosture\": \"operating\"
  }" | tee "$RESULTS_DIR/parse_hotel.json" | jq '{ok}'

# TC-PARSE-06: 물건 6 — 연남동 (income, 용도혼합)
curl -s -X POST "$BASE_URL/api/broker/im-lite/parse-memo" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"memo_text\": \"[현장 · 임대차 확인]\\n\\n마포구 연남동 000-12, 000-13. 두 필지 합쳐 283.0㎡.\\n000-13에 도시계획도로가 6.2㎡ 걸린다. 유효 대지는 276.8㎡.\\n\\n2003년 5월 준공, 지하 1층에 지상 4층. 1·2층은 근생이고 3·4층은 주택이다.\\n매각 희망가 42억.\\n\\n임대차는 다섯 호실. 1층 카페, 2층 학원, 3층 주택 전세, 4층 주택 월세, 지하는 창고인데 비어 있다.\\n1·2층은 상가임대차보호법인데 3·4층은 주택임대차보호법이다.\",
    \"investmentPosture\": \"income\"
  }" | tee "$RESULTS_DIR/parse_yeonnam.json" | jq '{ok}'
```

---

## 3. Phase 2: 딜카드 생성 테스트 (6건)

### 실행 스크립트

```bash
# ──────────────────────────────────────────
# TC-DEALCARD: 물건별 딜카드 생성
# ──────────────────────────────────────────

# 물건 2 — 당산동
curl -s -X POST "$BASE_URL/api/broker/deal-card/from-memo" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"memo_text\": $(echo "$MEMO_DANGSAN" | jq -Rs .),
    \"asset_type\": \"nbhd_building\",
    \"investment_posture\": \"income\"
  }" | tee "$RESULTS_DIR/dealcard_dangsan.json" | jq '{building_id: .building_id, asset_name: .asset_name}'

# building_id를 환경 변수로 캡처
export BID_DANGSAN=$(jq -r '.building_id' "$RESULTS_DIR/dealcard_dangsan.json")
echo "당산동 building_id: $BID_DANGSAN"
```

### 딜카드 검증

```bash
for FILE in "$RESULTS_DIR"/dealcard_*.json; do
  NAME=$(basename "$FILE" .json | sed 's/dealcard_//')
  echo "=== Dealcard: $NAME ==="
  
  # V1: building_id 존재
  BID=$(jq -r '.building_id // "null"' "$FILE")
  [ "$BID" != "null" ] && echo "✅ V1: building_id=$BID" || echo "❌ V1: no building_id"
  
  # V2: 매각가 존재
  PRICE=$(jq -r '.asking_price // .askingPrice // "null"' "$FILE")
  [ "$PRICE" != "null" ] && echo "✅ V2: price=$PRICE" || echo "⚠️ V2: price not in response"
  
  # V3: 내부 코드 비노출 (archetype, grade score)
  ARCHETYPE=$(jq -r '.archetype_code // "none"' "$FILE")
  [ "$ARCHETYPE" = "none" ] && echo "✅ V3: archetype hidden" || echo "❌ V3: archetype exposed=$ARCHETYPE"
  
  echo ""
done
```

---

## 4. Phase 3: IM 생성 (비동기) 및 Basic 검증

### 4.1 IM 비동기 생성

```bash
# ──────────────────────────────────────────
# TC-GENERATE: 물건별 IM 비동기 생성
# ──────────────────────────────────────────

generate_im() {
  local NAME=$1
  local BID=$2
  local POSTURE=$3
  local TIER=${4:-basic}
  
  echo ">>> Generating IM for $NAME (building=$BID, posture=$POSTURE, tier=$TIER)..."
  
  RESPONSE=$(curl -s -X POST "$BASE_URL/api/broker/im-lite/generate-async" \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"building_id\": \"$BID\",
      \"tier\": \"$TIER\",
      \"investment_posture\": \"$POSTURE\"
    }")
  
  echo "$RESPONSE" > "$RESULTS_DIR/generate_${NAME}.json"
  
  JOB_ID=$(echo "$RESPONSE" | jq -r '.jobId // "null"')
  echo "    jobId: $JOB_ID"
  
  if [ "$JOB_ID" = "null" ]; then
    echo "    ❌ Generation failed: $(echo "$RESPONSE" | jq -r '.error // "unknown"')"
    return 1
  fi
  
  # 폴링: 최대 5분 대기
  for i in $(seq 1 30); do
    sleep 10
    STATUS=$(curl -s "$BASE_URL/api/broker/im-lite/job-status?jobId=$JOB_ID" \
      -H "Authorization: Bearer $TEST_TOKEN" | jq -r '.status')
    echo "    [$i/30] status=$STATUS"
    
    if [ "$STATUS" = "completed" ] || [ "$STATUS" = "done" ]; then
      echo "    ✅ IM generation completed"
      return 0
    elif [ "$STATUS" = "failed" ] || [ "$STATUS" = "error" ]; then
      echo "    ❌ IM generation failed"
      return 1
    fi
  done
  
  echo "    ⚠️ Timeout after 5 minutes"
  return 1
}

# 물건별 생성 실행 (building_id는 Phase 2에서 캡처)
generate_im "dangsan"    "$BID_DANGSAN"    "income"
generate_im "jamwon"     "$BID_JAMWON"     "development"
generate_im "sutaek"     "$BID_SUTAEK"     "development"
generate_im "yangpyeong" "$BID_YANGPYEONG" "income"
generate_im "yeonnam"    "$BID_YEONNAM"    "income"

# 물건 5(호텔) — D등급 차단 기대
generate_im "hotel"      "$BID_HOTEL"      "operating"
# 기대: 실패 또는 차단 메시지
```

### 4.2 모바일 IM Basic 응답 검증

```bash
# ──────────────────────────────────────────
# TC-BASIC-VERIFY: 모바일 IM Basic API 응답 검증
# ──────────────────────────────────────────

verify_basic_im() {
  local NAME=$1
  local BID=$2
  local POSTURE=$3
  local EXPECTED_PRICE=$4
  
  echo "=== Basic IM Verify: $NAME ==="
  
  RESPONSE=$(curl -s "$BASE_URL/api/public/im-lite/$BID")
  echo "$RESPONSE" > "$RESULTS_DIR/basic_im_${NAME}.json"
  
  # V1: ok == true
  OK=$(echo "$RESPONSE" | jq -r '.ok')
  [ "$OK" = "true" ] && echo "  ✅ V1: API ok=true" || echo "  ❌ V1: ok=$OK"
  
  # V2: sections 배열 존재 및 비어있지 않음
  SECTIONS=$(echo "$RESPONSE" | jq '.data.sections | length')
  [ "$SECTIONS" -gt 0 ] && echo "  ✅ V2: $SECTIONS sections" || echo "  ❌ V2: 0 sections"
  
  # V3: 3문+4접기 구조 (최소 3개 주요 섹션)
  MAIN_SECTIONS=$(echo "$RESPONSE" | jq '[.data.sections[] | select(.is_collapsible != true)] | length')
  FOLD_SECTIONS=$(echo "$RESPONSE" | jq '[.data.sections[] | select(.is_collapsible == true)] | length')
  echo "  ℹ️ V3: main=$MAIN_SECTIONS, collapsible=$FOLD_SECTIONS"
  
  # V4: 블라인드 처리 — 상호명 비노출 확인
  BLIND=$(echo "$RESPONSE" | jq -r '.data.blindName // "none"')
  [ "$BLIND" != "none" ] && echo "  ✅ V4: blindName=$BLIND" || echo "  ⚠️ V4: no blindName"
  
  # V5: 매각가 대신 실투자금이 표시되는지 (마크다운에서 검색)
  ALL_MD=$(echo "$RESPONSE" | jq -r '.data.sections[].markdown // ""' | tr -d '\n')
  if echo "$ALL_MD" | grep -qi "실투자"; then
    echo "  ✅ V5: '실투자금' found in content"
  else
    echo "  ⚠️ V5: '실투자금' not found (check manually)"
  fi
  
  # V6: 시나리오 가정 배지 (development 물건에서)
  if [ "$POSTURE" = "development" ]; then
    if echo "$ALL_MD" | grep -q "◇\|가정\|시나리오"; then
      echo "  ✅ V6: scenario/assumption marker found (C22)"
    else
      echo "  ⚠️ V6: no C22 marker found for development posture"
    fi
  fi
  
  echo ""
}

# 5건 검증 (호텔 제외)
verify_basic_im "dangsan"    "$BID_DANGSAN"    "income"      "11500000000"
verify_basic_im "jamwon"     "$BID_JAMWON"     "development" "24226800000"
verify_basic_im "sutaek"     "$BID_SUTAEK"     "development" "8900000000"
verify_basic_im "yangpyeong" "$BID_YANGPYEONG" "income"      "25000000000"
verify_basic_im "yeonnam"    "$BID_YEONNAM"    "income"      "4200000000"
```

### 4.3 호텔 등급 D 차단 검증 (Negative Test)

```bash
# ──────────────────────────────────────────
# TC-GATE-BLOCK: 물건 5 호텔 — D등급 차단 검증
# ──────────────────────────────────────────
echo "=== Hotel D-Grade Block Test ==="

HOTEL_RESPONSE=$(curl -s "$BASE_URL/api/public/im-lite/$BID_HOTEL")
echo "$HOTEL_RESPONSE" > "$RESULTS_DIR/basic_im_hotel_blocked.json"

HOTEL_OK=$(echo "$HOTEL_RESPONSE" | jq -r '.ok // "false"')
HOTEL_ERROR=$(echo "$HOTEL_RESPONSE" | jq -r '.error // "none"')

if [ "$HOTEL_OK" = "false" ] || [ "$HOTEL_ERROR" != "none" ]; then
  echo "  ✅ GATE-BLOCK: Hotel correctly blocked (D-grade)"
  echo "  ℹ️ Error: $HOTEL_ERROR"
else
  echo "  ❌ GATE-BLOCK: Hotel was NOT blocked — G7 gate failure!"
fi
echo ""
```

---

## 5. Phase 4: PPTX Basic 다운로드 검증

```bash
# ──────────────────────────────────────────
# TC-PPTX-BASIC: PPTX 다운로드 및 파일 검증
# ──────────────────────────────────────────

verify_pptx() {
  local NAME=$1
  local BID=$2
  local TIER=${3:-basic}
  local ENDPOINT=$4  # 'lite' or 'pro'
  local GRANT_OR_BID=$5
  
  echo "=== PPTX $TIER: $NAME ==="
  
  local URL
  if [ "$ENDPOINT" = "lite" ]; then
    URL="$BASE_URL/api/public/im-lite/$GRANT_OR_BID/pptx?tier=$TIER"
  else
    URL="$BASE_URL/api/public/im-pro/$GRANT_OR_BID/pptx"
  fi
  
  HTTP_CODE=$(curl -s -o "$RESULTS_DIR/pptx_${NAME}_${TIER}.pptx" -w "%{http_code}" "$URL")
  FILE_SIZE=$(stat -c%s "$RESULTS_DIR/pptx_${NAME}_${TIER}.pptx" 2>/dev/null || \
              stat -f%z "$RESULTS_DIR/pptx_${NAME}_${TIER}.pptx" 2>/dev/null || echo 0)
  
  # V1: HTTP 200
  [ "$HTTP_CODE" = "200" ] && echo "  ✅ V1: HTTP $HTTP_CODE" || echo "  ❌ V1: HTTP $HTTP_CODE"
  
  # V2: 파일 크기 > 10KB (빈 PPTX가 아님)
  [ "$FILE_SIZE" -gt 10240 ] && echo "  ✅ V2: size=${FILE_SIZE}B" || echo "  ❌ V2: size=${FILE_SIZE}B (too small)"
  
  # V3: PPTX 매직 바이트 (PK zip header = 50 4B)
  MAGIC=$(xxd -l 2 -p "$RESULTS_DIR/pptx_${NAME}_${TIER}.pptx" 2>/dev/null)
  [ "$MAGIC" = "504b" ] && echo "  ✅ V3: valid PPTX (PK header)" || echo "  ❌ V3: invalid format (magic=$MAGIC)"
  
  # V4: 슬라이드 수 확인 (PPTX = zip, slide count)
  SLIDE_COUNT=$(unzip -l "$RESULTS_DIR/pptx_${NAME}_${TIER}.pptx" 2>/dev/null | grep -c "ppt/slides/slide[0-9]")
  echo "  ℹ️ V4: $SLIDE_COUNT slides"
  
  if [ "$TIER" = "basic" ]; then
    [ "$SLIDE_COUNT" -ge 6 ] && [ "$SLIDE_COUNT" -le 14 ] && \
      echo "  ✅ V4: Basic slide count in range (6~14)" || \
      echo "  ⚠️ V4: slide count $SLIDE_COUNT outside expected range"
  else
    [ "$SLIDE_COUNT" -ge 14 ] && [ "$SLIDE_COUNT" -le 26 ] && \
      echo "  ✅ V4: Pro slide count in range (14~26)" || \
      echo "  ⚠️ V4: slide count $SLIDE_COUNT outside expected range"
  fi
  
  echo ""
}

# 5건 Basic PPTX 다운로드 (호텔 제외)
verify_pptx "dangsan"    "$BID_DANGSAN"    "basic" "lite" "$BID_DANGSAN"
verify_pptx "jamwon"     "$BID_JAMWON"     "basic" "lite" "$BID_JAMWON"
verify_pptx "sutaek"     "$BID_SUTAEK"     "basic" "lite" "$BID_SUTAEK"
verify_pptx "yangpyeong" "$BID_YANGPYEONG" "basic" "lite" "$BID_YANGPYEONG"
verify_pptx "yeonnam"    "$BID_YEONNAM"    "basic" "lite" "$BID_YEONNAM"

# 호텔 PPTX — 차단 기대
echo "=== PPTX Basic: hotel (expect block) ==="
HTTP_HOTEL=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/public/im-lite/$BID_HOTEL/pptx")
[ "$HTTP_HOTEL" != "200" ] && echo "  ✅ Hotel PPTX blocked (HTTP $HTTP_HOTEL)" || echo "  ❌ Hotel PPTX NOT blocked"
```

---

## 6. Phase 5: Pro 파이프라인 테스트

### 6.1 Pro IM 생성 (정밀 데이터 추가 후)

```bash
# ──────────────────────────────────────────
# TC-PRO-GENERATE: Pro IM 생성 (정밀 데이터 포함)
# ──────────────────────────────────────────

# 각 물건에 대해 tier=pro로 재생성
generate_im "dangsan_pro"    "$BID_DANGSAN"    "income"      "pro"
generate_im "jamwon_pro"     "$BID_JAMWON"     "development" "pro"
generate_im "sutaek_pro"     "$BID_SUTAEK"     "development" "pro"
generate_im "yangpyeong_pro" "$BID_YANGPYEONG" "income"      "pro"
generate_im "yeonnam_pro"    "$BID_YEONNAM"    "income"      "pro"

# 물건 5 호텔 — 정밀 데이터 추가 후 재생성
# hospitalitySpec 포함하여 등급 상승 유도
curl -s -X POST "$BASE_URL/api/broker/im-lite/generate-async" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"building_id\": \"$BID_HOTEL\",
    \"tier\": \"pro\",
    \"investment_posture\": \"operating\",
    \"hospitalitySpec\": {
      \"keyCount\": 94,
      \"adr\": 95000,
      \"occupancy\": 0.78,
      \"revpar\": 74100,
      \"gopMargin\": 0.38,
      \"operationType\": \"management_contract\",
      \"brandAffiliation\": \"에이치 에비뉴\",
      \"operatorContractRemainingYears\": 3,
      \"foreignGuestShare\": 0.45,
      \"areaPerKey\": 40.88
    }
  }" | tee "$RESULTS_DIR/generate_hotel_pro.json" | jq '{jobId, status}'
```

### 6.2 Pro Grant 생성 및 Pro IM 접근

```bash
# ──────────────────────────────────────────
# TC-PRO-GRANT: Pro Grant 생성 → Pro IM API 검증
# ──────────────────────────────────────────

# Grant 생성 (브로커가 매수자에게 Pro 접근 허용)
# 실제로는 /api/broker/pro-grants/[id]/approve 또는 유사 API 사용
# 여기서는 grant_id가 생성된 것으로 가정

verify_pro_im() {
  local NAME=$1
  local GRANT_ID=$2
  local POSTURE=$3
  
  echo "=== Pro IM Verify: $NAME ==="
  
  RESPONSE=$(curl -s "$BASE_URL/api/public/im-pro/$GRANT_ID")
  echo "$RESPONSE" > "$RESULTS_DIR/pro_im_${NAME}.json"
  
  # V1: ok == true
  OK=$(echo "$RESPONSE" | jq -r '.ok')
  [ "$OK" = "true" ] && echo "  ✅ V1: ok=true" || echo "  ❌ V1: ok=$OK"
  
  # V2: grant 정보 존재
  GRANT_STATUS=$(echo "$RESPONSE" | jq -r '.grant.id // "null"')
  [ "$GRANT_STATUS" != "null" ] && echo "  ✅ V2: grant=$GRANT_STATUS" || echo "  ❌ V2: no grant"
  
  # V3: building 데이터 존재
  BUILDING=$(echo "$RESPONSE" | jq -r '.building.id // "null"')
  [ "$BUILDING" != "null" ] && echo "  ✅ V3: building=$BUILDING" || echo "  ❌ V3: no building"
  
  # V4: imDocument 존재
  IM_DOC=$(echo "$RESPONSE" | jq -r '.imDocument // "null"')
  [ "$IM_DOC" != "null" ] && echo "  ✅ V4: imDocument present" || echo "  ❌ V4: no imDocument"
  
  # V5: watermarkSeed 존재 (Pro 보안 기능)
  WM=$(echo "$RESPONSE" | jq -r '.watermarkSeed // "null"')
  [ "$WM" != "null" ] && echo "  ✅ V5: watermark=$WM" || echo "  ⚠️ V5: no watermark"
  
  # V6: 관점별 검증
  case "$POSTURE" in
    income)
      # 수익률 기준 표기 확인
      echo "  ℹ️ V6: Income posture — check yield basis labels in content"
      ;;
    development)
      # 개발 계획 존재 확인
      echo "  ℹ️ V6: Development posture — check devPlan in content"
      ;;
    operating)
      # 운영 지표 확인
      echo "  ℹ️ V6: Operating posture — check ADR/OCC/GOP in content"
      ;;
  esac
  
  echo ""
}

# 각 물건의 grant_id로 검증 (실행 시 실제 grant_id 대입 필요)
# verify_pro_im "dangsan"    "$GRANT_DANGSAN"    "income"
# verify_pro_im "jamwon"     "$GRANT_JAMWON"     "development"
# verify_pro_im "sutaek"     "$GRANT_SUTAEK"     "development"
# verify_pro_im "yangpyeong" "$GRANT_YANGPYEONG" "income"
# verify_pro_im "hotel"      "$GRANT_HOTEL"      "operating"
# verify_pro_im "yeonnam"    "$GRANT_YEONNAM"    "income"
```

### 6.3 Pro PPTX 다운로드 검증

```bash
# Pro PPTX 다운로드 (grant_id 기반)
# verify_pptx "dangsan"    "$BID_DANGSAN"    "pro" "pro" "$GRANT_DANGSAN"
# verify_pptx "jamwon"     "$BID_JAMWON"     "pro" "pro" "$GRANT_JAMWON"
# verify_pptx "hotel"      "$BID_HOTEL"      "pro" "pro" "$GRANT_HOTEL"
# verify_pptx "yeonnam"    "$BID_YEONNAM"    "pro" "pro" "$GRANT_YEONNAM"
```

---

## 7. Phase 6: 콘텐츠 품질 심층 검증

### 7.1 마크다운 콘텐츠 규칙 검증

```bash
# ──────────────────────────────────────────
# TC-CONTENT-QUALITY: 산출물 품질 규칙 점검
# ──────────────────────────────────────────

verify_content_rules() {
  local NAME=$1
  local FILE="$RESULTS_DIR/basic_im_${NAME}.json"
  
  echo "=== Content Rules: $NAME ==="
  
  ALL_MD=$(jq -r '.data.sections[].markdown // ""' "$FILE" 2>/dev/null | tr '\n' ' ')
  
  # R1: 용적률 2기준 병기 (해당 물건)
  if echo "$ALL_MD" | grep -qP '\d+\.\d+%.*\d+\.\d+%'; then
    echo "  ✅ R1: dual FAR figures found"
  else
    echo "  ⚠️ R1: single FAR or no FAR found"
  fi
  
  # R2: 깨진 마크다운 없음 (노출된 ** 또는 __)
  BROKEN_MD=$(echo "$ALL_MD" | grep -oP '(?<!\*)\*\*(?!\*)' | wc -l)
  [ "$BROKEN_MD" -eq 0 ] && echo "  ✅ R2: no broken markdown" || echo "  ⚠️ R2: $BROKEN_MD broken markdown patterns"
  
  # R3: 인젝션 패턴 없음
  if echo "$ALL_MD" | grep -qi "ignore.*previous\|system.*prompt\|<script"; then
    echo "  ❌ R3: injection pattern detected!"
  else
    echo "  ✅ R3: no injection patterns"
  fi
  
  # R4: 상호명 비노출 (블라인드)
  TENANTS=("로뎀나무내과" "고은약국" "스타벅스" "커피명가" "연남어학원")
  EXPOSED=0
  for T in "${TENANTS[@]}"; do
    if echo "$ALL_MD" | grep -q "$T"; then
      echo "  ❌ R4: tenant name exposed: $T"
      EXPOSED=$((EXPOSED + 1))
    fi
  done
  [ "$EXPOSED" -eq 0 ] && echo "  ✅ R4: no tenant names exposed (blind)"
  
  echo ""
}

for NAME in dangsan jamwon sutaek yangpyeong yeonnam; do
  verify_content_rules "$NAME"
done
```

### 7.2 연남동 v0.4 신규 기능 심층 검증

```bash
# ──────────────────────────────────────────
# TC-V04-YEONNAM: v0.4 신규 기능 종합 검증 (연남동)
# ──────────────────────────────────────────
echo "=== v0.4 Feature Verification: 연남동 ==="

YN_MD=$(jq -r '.data.sections[].markdown // ""' "$RESULTS_DIR/basic_im_yeonnam.json" 2>/dev/null | tr '\n' ' ')

# V04-1: T-C / T-R 법령 분기
if echo "$YN_MD" | grep -qi "상가임대차\|주택임대차\|상임법\|주임법"; then
  echo "  ✅ V04-1: T-C/T-R lease law distinction found"
else
  echo "  ⚠️ V04-1: no lease law distinction found"
fi

# V04-2: 공동담보 그룹 합산 (8.4억 or 840, not 16.8억 or 1680)
if echo "$YN_MD" | grep -qP '8[.,]4|840'; then
  echo "  ✅ V04-2: grouped collateral amount (8.4억) found (C32)"
elif echo "$YN_MD" | grep -qP '16[.,]8|1680'; then
  echo "  ❌ V04-2: simple sum (16.8억) found — C32 violation!"
else
  echo "  ⚠️ V04-2: collateral amount not found in content"
fi

# V04-3: 층별 면적 합계 = 680.0㎡ (C19)
if echo "$YN_MD" | grep -qP '680'; then
  echo "  ✅ V04-3: total area 680 found (C19)"
else
  echo "  ⚠️ V04-3: total area 680 not found"
fi

echo ""
```

---

## 8. 최종 결과 집계 및 보고서 생성

```bash
# ──────────────────────────────────────────
# TC-REPORT: 최종 결과 집계
# ──────────────────────────────────────────

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║         CREDEAL E2E UAT 에이전트 테스트 최종 결과           ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║ 실행 시각: $(date '+%Y-%m-%d %H:%M:%S %Z')                  ║"
echo "╠═══════════════════════════════════════════════════════════════╣"

# 결과 카운트
PASS=0; FAIL=0; WARN=0
for FILE in "$RESULTS_DIR"/*.json; do
  P=$(grep -c "✅" "$FILE" 2>/dev/null || echo 0)
  F=$(grep -c "❌" "$FILE" 2>/dev/null || echo 0)
  W=$(grep -c "⚠️" "$FILE" 2>/dev/null || echo 0)
  PASS=$((PASS + P)); FAIL=$((FAIL + F)); WARN=$((WARN + W))
done

echo "║                                                             ║"
echo "║  Phase 1 — 메모 파싱 (6건)          : [결과 확인]           ║"
echo "║  Phase 2 — 딜카드 생성 (6건)        : [결과 확인]           ║"
echo "║  Phase 3 — IM Basic 생성+검증 (5건) : [결과 확인]           ║"
echo "║  Phase 4 — PPTX Basic (5건)         : [결과 확인]           ║"
echo "║  Phase 5 — Pro 파이프라인 (6건)     : [결과 확인]           ║"
echo "║  Phase 6 — 콘텐츠 품질 (5건)        : [결과 확인]           ║"
echo "║                                                             ║"
echo "║  등급 차단 (호텔 D등급)              : [결과 확인]           ║"
echo "║                                                             ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║  결과 파일: $RESULTS_DIR/                                    ║"
echo "╚═══════════════════════════════════════════════════════════════╝"

# 상세 결과를 마크다운으로 출력
cat > "$RESULTS_DIR/UAT_RESULT_SUMMARY.md" <<EOF
# UAT-02 에이전트 E2E 테스트 결과

- **실행 시각**: $(date '+%Y-%m-%d %H:%M:%S')
- **환경**: $BASE_URL

## Phase별 결과

| Phase | 대상 | 건수 | 결과 |
|---|---|:---:|---|
| 1 | 메모 파싱 | 6 | 확인 필요 |
| 2 | 딜카드 생성 | 6 | 확인 필요 |
| 3 | IM Basic 생성 | 5+1차단 | 확인 필요 |
| 4 | PPTX Basic | 5+1차단 | 확인 필요 |
| 5 | Pro 파이프라인 | 6 | 확인 필요 |
| 6 | 콘텐츠 품질 | 5 | 확인 필요 |

## 결과 파일 목록

$(ls -la "$RESULTS_DIR"/ 2>/dev/null)
EOF

echo ">>> 결과 요약: $RESULTS_DIR/UAT_RESULT_SUMMARY.md"
```

---

## 부록 A: 에이전트 실행 지침

### A.1 실행 순서

1. **Phase 0**: 환경 확인 (`/api/health` 호출, 인증 토큰 취득)
2. **Phase 1**: 6건 메모 파싱 — 모두 `ok: true` 확인
3. **Phase 2**: 6건 딜카드 생성 — `building_id` 캡처
4. **Phase 3**: 5건 IM Basic 생성 + 호텔 차단 확인
5. **Phase 4**: 5건 PPTX Basic 다운로드 + 파일 유효성
6. **Phase 5**: 6건 Pro 생성 (호텔은 정밀 데이터 추가 후)
7. **Phase 6**: 콘텐츠 품질 규칙 검증
8. **결과 집계**: `UAT_RESULT_SUMMARY.md` 생성

### A.2 실패 시 대응

| 실패 유형 | 대응 |
|---|---|
| 인증 실패 (401) | `TEST_TOKEN` 환경 변수 재설정 |
| 메모 파싱 실패 (422) | 메모 텍스트 길이 10자 이상 확인 |
| IM 생성 타임아웃 | `generate-async` 후 `job-status` 폴링 간격 늘리기 (30초) |
| PPTX 빈 파일 | IM 생성 완료 여부 재확인 후 재시도 |
| 호텔이 차단되지 않음 | 등급 계산 로직 점검 (G7 게이트) |

### A.3 결과 파일 구조

```
docs/uat02/results/
├── parse_dangsan.json         # 메모 파싱 결과
├── parse_jamwon.json
├── parse_sutaek.json
├── parse_yangpyeong.json
├── parse_hotel.json
├── parse_yeonnam.json
├── dealcard_dangsan.json      # 딜카드 생성 결과
├── ...
├── generate_dangsan.json      # IM 생성 job 결과
├── ...
├── basic_im_dangsan.json      # Basic IM API 응답
├── ...
├── basic_im_hotel_blocked.json # 호텔 차단 응답
├── pptx_dangsan_basic.pptx    # Basic PPTX 파일
├── ...
├── pro_im_dangsan.json        # Pro IM API 응답 (grant 기반)
├── ...
├── pptx_dangsan_pro.pptx      # Pro PPTX 파일
├── ...
└── UAT_RESULT_SUMMARY.md      # 최종 결과 요약
```
