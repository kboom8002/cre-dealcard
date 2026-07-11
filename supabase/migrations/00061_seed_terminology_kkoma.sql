-- ============================================================
-- 00061_seed_terminology_kkoma.sql
-- 꼬마빌딩(중소형 상업용 부동산) 전문 용어 정규화 규칙 40건
--
-- 목적: 꼬마빌딩 거래에서 흔히 사용되는 비공식/구어체 표현을
--       IM(투자설명서)에 적합한 공식 용어로 정규화합니다.
--
-- 카테고리별 분류:
--   꼬마빌딩  (12건) - 건물 유형 및 용도 명칭
--   입지      ( 8건) - 역세권/접근성/상권 관련
--   용도지역  ( 6건) - 도시계획 용도지역 약칭
--   수익      ( 4건) - 수익률/공실 관련 구어체
--   거래      ( 2건) - 거래 조건 관련
--   건축      ( 6건) - 건폐율/용적률/시설 관련
--   임대      ( 1건) - 관리비 구조
--   감정평가  ( 2건) - 감정평가 방법론 약칭
--
-- priority: 200~239 (기본 46개 규칙의 100~146과 충돌 방지)
-- flags: 모든 패턴은 'g' 플래그 적용 전제 (is_regex=TRUE)
-- 멱등성: WHERE NOT EXISTS로 중복 삽입 방지
-- ============================================================

-- ------------------------------------
-- 꼬마빌딩 카테고리 (1~12)
-- ------------------------------------

-- 1. 꼬마빌딩 → 중소형 상업용 부동산(Small CRE)
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '꼬마빌딩', TRUE, '중소형 상업용 부동산(Small CRE)', '꼬마빌딩', 200, TRUE,
       '꼬마빌딩 → 공식 명칭. 통상 10~100억 원 규모 상업용 건물'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '꼬마빌딩'
);

-- 2. 근생 (단독 사용, 근생활 제외) → 근린생활시설
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '근생(?!활)', TRUE, '근린생활시설', '꼬마빌딩', 201, TRUE,
       '근생 약칭 정규화. 근생활(근린생활)은 이미 정식 표현이므로 제외'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '근생(?!활)'
);

-- 3. 1종 근생 → 제1종 근린생활시설
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '1종\s*근생', TRUE, '제1종 근린생활시설', '꼬마빌딩', 202, TRUE,
       '건축법 시행령 별표1 기준 제1종 근린생활시설'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '1종\s*근생'
);

-- 4. 2종 근생 → 제2종 근린생활시설
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '2종\s*근생', TRUE, '제2종 근린생활시설', '꼬마빌딩', 203, TRUE,
       '건축법 시행령 별표1 기준 제2종 근린생활시설'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '2종\s*근생'
);

-- 5. 다가구 주택 → 다가구주택(단독주택)
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '다가구\s*주택', TRUE, '다가구주택(단독주택)', '꼬마빌딩', 204, TRUE,
       '건축법상 단독주택의 하위 유형. 다세대(공동주택)와 구별 필수'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '다가구\s*주택'
);

-- 6. 원룸 건물/빌딩 → 소형 임대 주거시설
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '원룸\s*(건물|빌딩)', TRUE, '소형 임대 주거시설', '꼬마빌딩', 205, TRUE,
       '원룸 건물: 1인 가구 대상 소형 임대 주거. 역세권/학세권 수요'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '원룸\s*(건물|빌딩)'
);

-- 7. 상가 주택 → 근린생활시설 겸용 주택
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '상가\s*주택', TRUE, '근린생활시설 겸용 주택', '꼬마빌딩', 206, TRUE,
       '1층 근생 + 상층부 주거 혼합 건물. 꼬마빌딩의 전형적 유형'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '상가\s*주택'
);

-- 8. 오피스텔 빌딩 → 준주거용 오피스텔 건물
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '오피스텔\s*빌딩', TRUE, '준주거용 오피스텔 건물', '꼬마빌딩', 207, TRUE,
       '업무시설(오피스텔). 실질적으로 주거용으로 사용되는 경우 다수'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '오피스텔\s*빌딩'
);

-- 9. 코너 건물 → 코너 필지(가시성 우수)
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '코너\s*건물', TRUE, '코너 필지(가시성 우수)', '입지', 208, TRUE,
       '두 도로가 만나는 모퉁이 필지. 가시성·접근성 프리미엄'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '코너\s*건물'
);

-- 10. 대로변 → 간선도로변(대로 접면)
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '대로변', TRUE, '간선도로변(대로 접면)', '입지', 209, TRUE,
       '폭 25m 이상 대로에 접한 필지. 가시성 우수, 소음 주의'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '대로변'
);

-- 11. 이면도로 → 이면도로(차량 접근 가능)
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '이면도로', TRUE, '이면도로(차량 접근 가능)', '입지', 210, TRUE,
       '간선도로 뒤편의 보조 도로. 폭 4m 이상이면 차량 접근 가능'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '이면도로'
);

-- 12. 상가 건물 → 근린생활시설 건물
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '상가\s*건물', TRUE, '근린생활시설 건물', '꼬마빌딩', 211, TRUE,
       '근린생활시설(1·2종) 용도의 상업용 건물'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '상가\s*건물'
);

-- ------------------------------------
-- 입지/역세권 카테고리 (13~18)
-- ------------------------------------

-- 13. 역세권 (더블/초 제외) → 지하철역 도보 5분 이내 입지
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '(?<!더블\s)(?<!초\s)역세권', TRUE, '지하철역 도보 5분 이내 입지', '입지', 212, TRUE,
       '역세권 일반 표현. 더블역세권·초역세권은 별도 규칙으로 처리'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '(?<!더블\s)(?<!초\s)역세권'
);

-- 14. 더블 역세권 → 2개 노선 이상 환승 가능 역세권
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '더블\s*역세권', TRUE, '2개 노선 이상 환승 가능 역세권', '입지', 213, TRUE,
       '2개 지하철 노선 환승 가능. 유동인구·임차 수요 프리미엄'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '더블\s*역세권'
);

-- 15. 초 역세권 → 지하철역 출구 도보 1분 이내 입지
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '초\s*역세권', TRUE, '지하철역 출구 도보 1분 이내 입지', '입지', 214, TRUE,
       '역 출구 바로 앞 입지. 최고 수준 접근성 프리미엄'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '초\s*역세권'
);

-- 16. 트리플 역세권 → 3개 노선 이상 이용 가능 역세권
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '트리플\s*역세권', TRUE, '3개 노선 이상 이용 가능 역세권', '입지', 215, TRUE,
       '3개 노선 이용 가능. 서울 주요 거점(종로3가, 고속터미널 등)'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '트리플\s*역세권'
);

-- 17. 뜨는 지역 → 신흥 개발 지역
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '뜨는\s*지역', TRUE, '신흥 개발 지역', '입지', 216, TRUE,
       '상권 형성 초기 또는 재개발 기대 지역. 성수동·을지로 사례'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '뜨는\s*지역'
);

-- 18. 학세권 → 대학교 인접 입지(임차 수요 풍부)
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '학세권', TRUE, '대학교 인접 입지(임차 수요 풍부)', '입지', 217, TRUE,
       '대학교 반경 500m 이내. 원룸·근생 안정적 임차 수요'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '학세권'
);

-- ------------------------------------
-- 용도지역 카테고리 (19~24)
-- ------------------------------------

-- 19. 일반상업 → 일반상업지역
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '일반상업', TRUE, '일반상업지역', '용도지역', 218, TRUE,
       '국토계획법상 일반상업지역. 건폐율 80%, 용적률 1300% 이하'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '일반상업'
);

-- 20. 2종 주거 → 제2종 일반주거지역
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '2종\s*주거', TRUE, '제2종 일반주거지역', '용도지역', 219, TRUE,
       '제2종 일반주거지역. 건폐율 60%, 용적률 250% 이하'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '2종\s*주거'
);

-- 21. 3종 주거 → 제3종 일반주거지역
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '3종\s*주거', TRUE, '제3종 일반주거지역', '용도지역', 220, TRUE,
       '제3종 일반주거지역. 건폐율 50%, 용적률 300% 이하'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '3종\s*주거'
);

-- 22. 준주거 → 준주거지역
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '준주거', TRUE, '준주거지역', '용도지역', 221, TRUE,
       '준주거지역. 건폐율 70%, 용적률 500% 이하. 근생 혼합 유리'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '준주거'
);

-- 23. 준공업 → 준공업지역
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '준공업', TRUE, '준공업지역', '용도지역', 222, TRUE,
       '준공업지역. 건폐율 70%, 용적률 400% 이하. 성수동·문래동 등'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '준공업'
);

-- 24. 자연녹지 → 자연녹지지역
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '자연녹지', TRUE, '자연녹지지역', '용도지역', 223, TRUE,
       '자연녹지지역. 건폐율 20%, 용적률 100% 이하. 개발 제한'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '자연녹지'
);

-- ------------------------------------
-- 수익/재무 카테고리 (25~30)
-- ------------------------------------

-- 25. 실수익률 → 순영업소득 기준 수익률(Net Yield)
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '실수익률', TRUE, '순영업소득 기준 수익률(Net Yield)', '수익', 224, TRUE,
       '실수익률: NOI/매입가 기준. 한국 꼬마빌딩 통상 3~5%'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '실수익률'
);

-- 26. 투자금 대비 → 투자원가 대비
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '투자금\s*대비', TRUE, '투자원가 대비', '수익', 225, TRUE,
       '투자금 → 투자원가(매입가+취득세+기타비용) 공식 표현'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '투자금\s*대비'
);

-- 27. 만실 시/되면/가정 → 완전 임대 $1
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '만실\s*(시|되면|가정)', TRUE, '완전 임대 $1', '수익', 226, TRUE,
       '만실: 모든 호실이 임대된 상태. Full Occupancy 가정'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '만실\s*(시|되면|가정)'
);

-- 28. 올공실 → 전체 공실(Full Vacancy)
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '올공실', TRUE, '전체 공실(Full Vacancy)', '수익', 227, TRUE,
       '올공실: 전체 호실 미임대 상태. 수익률 0% 시나리오'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '올공실'
);

-- 29. 반공실 → 부분 공실(약 50% 공실)
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '반공실', TRUE, '부분 공실(약 50% 공실)', '수익', 228, TRUE,
       '반공실: 약 절반의 호실이 미임대 상태'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '반공실'
);

-- 30. 보증금 끼고 → 임대 보증금 승계 조건
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '보증금\s*끼고', TRUE, '임대 보증금 승계 조건', '거래', 229, TRUE,
       '보증금 승계: 기존 임차인 보증금을 매수인이 인수하는 조건'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '보증금\s*끼고'
);

-- ------------------------------------
-- 건축/시설 카테고리 (31~36)
-- ------------------------------------

-- 31. 융자 끼고 → 기존 담보대출 승계 조건
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '융자\s*끼고', TRUE, '기존 담보대출 승계 조건', '거래', 230, TRUE,
       '융자 승계: 기존 근저당 설정 대출을 매수인이 인수하는 조건'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '융자\s*끼고'
);

-- 32. 건폐율 다 씀 → 법정 건폐율 한도 근접
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '건폐율\s*다\s*씀', TRUE, '법정 건폐율 한도 근접', '건축', 231, TRUE,
       '건폐율 한도 소진: 수평 증축(별도동 신축) 불가'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '건폐율\s*다\s*씀'
);

-- 33. 용적률 다 씀 → 법정 용적률 한도 근접(증축 불가)
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '용적률\s*다\s*씀', TRUE, '법정 용적률 한도 근접(증축 불가)', '건축', 232, TRUE,
       '용적률 한도 소진: 수직 증축(층수 추가) 불가'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '용적률\s*다\s*씀'
);

-- 34. 용적률 남은/남아/남음 → 법정 용적률 잔여분 존재(증축 가능)
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '용적률\s*남(은|아|음)', TRUE, '법정 용적률 잔여분 존재(증축 가능)', '건축', 233, TRUE,
       '용적률 잔여: 수직 증축 가능. 투자 업사이드 요인'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '용적률\s*남(은|아|음)'
);

-- 35. 셋백 → 건축선 후퇴(Setback)
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '셋백', TRUE, '건축선 후퇴(Setback)', '건축', 234, TRUE,
       '도로 확장 등을 위해 건축선을 대지경계에서 후퇴시키는 것'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '셋백'
);

-- 36. 주차 안 됨 → 자주식 주차 불가(기계식/면제)
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '주차\s*안\s*됨', TRUE, '자주식 주차 불가(기계식/면제)', '건축', 235, TRUE,
       '자주식 주차 불가. 기계식 주차 또는 부설주차장 면제 여부 확인 필요'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '주차\s*안\s*됨'
);

-- ------------------------------------
-- 기타 카테고리 (37~40)
-- ------------------------------------

-- 37. 엘베 없 → 승강기 미설치
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '엘베\s*없', TRUE, '승강기 미설치', '건축', 236, TRUE,
       '승강기 미설치: 6층 이상 또는 연면적 2,000㎡ 이상 시 설치 의무'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '엘베\s*없'
);

-- 38. 관리비 따로 → 관리비 별도 부과 구조
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '관리비\s*따로', TRUE, '관리비 별도 부과 구조', '임대', 237, TRUE,
       '관리비 별도: 임대료와 관리비를 분리 청구하는 구조(NNN 유사)'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '관리비\s*따로'
);

-- 39. 토지 잔여법 → 토지잔여법(Land Residual Method)
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '토지\s*잔여법', TRUE, '토지잔여법(Land Residual Method)', '감정평가', 238, TRUE,
       '수익환원법의 변형. 건물 기여분 차감 후 토지 가치 산출'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '토지\s*잔여법'
);

-- 40. 적산법 → 적산법(Cost Approach)
INSERT INTO im_terminology_rules (pattern, is_regex, replacement, category, priority, is_active, note)
SELECT '적산법', TRUE, '적산법(Cost Approach)', '감정평가', 239, TRUE,
       '원가법. 토지가격 + 건물 재조달원가 - 감가상각으로 산정'
WHERE NOT EXISTS (
  SELECT 1 FROM im_terminology_rules WHERE pattern = '적산법'
);

-- ============================================================
-- 검증 쿼리 (선택적 실행)
-- SELECT category, COUNT(*) AS cnt
--   FROM im_terminology_rules
--  WHERE priority BETWEEN 200 AND 239
--  GROUP BY category
--  ORDER BY category;
-- 예상 결과: 꼬마빌딩(8), 입지(8), 용도지역(6), 수익(5),
--           거래(2), 건축(6), 임대(1), 감정평가(2) = 40건
-- ============================================================
