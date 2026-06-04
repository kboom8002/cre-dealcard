##########################################################
# seed_e2e_scenarios_v2.ps1
# 추가 10개 시나리오 시딩 (Pulse, Oiticle, Pipeline 심화,
# Broker Profile, Market Indicators, Studio, Cockpit 등)
# 실행: pwsh -File .\supabase\seed_e2e_scenarios_v2.ps1
##########################################################

$SB_URL = "https://vwbmaulavgjwezffbxgi.supabase.co"
$SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3Ym1hdWxhdmdqd2V6ZmZieGdpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM3NDgzNSwiZXhwIjoyMDkzOTUwODM1fQ.icKlLmN0DsEEQbxAR7F-MN8OVlnBp4L-ONntWcGKks8"
$H = @{
  "apikey"        = $SB_KEY
  "Authorization" = "Bearer $SB_KEY"
  "Content-Type"  = "application/json"
  "Prefer"        = "return=representation"
}

# 데모 브로커 UUID
$BROKER1 = "702b8438-5dbc-4006-a0d0-909cfb00c36f"
$BROKER2 = "4b4b5b94-cab9-4014-9486-7ec230b04eae"
$ADMIN   = "771f8962-0dc4-44fb-b73d-462f817becb6"

function Post($table, $body) {
  $json = $body | ConvertTo-Json -Depth 10 -Compress
  try {
    $r = Invoke-RestMethod -Uri "$SB_URL/rest/v1/$table" -Headers $H -Method Post -Body $json
    Write-Host "  ✅ $table 삽입 완료"
    return $r
  } catch {
    Write-Host "  ❌ $table 실패: $($_.Exception.Message)"
    return $null
  }
}

function Delete($table, $filter) {
  $dH = $H.Clone()
  $dH["Prefer"] = "return=minimal"
  try {
    Invoke-RestMethod -Uri "$SB_URL/rest/v1/$table`?$filter" -Headers $dH -Method Delete | Out-Null
    Write-Host "  🗑  $table 클린업 완료 ($filter)"
  } catch {
    Write-Host "  ⚠  $table 클린업 건너뜀: $($_.Exception.Message)"
  }
}

##########################################################
# STEP 0: 기존 V2 시딩 데이터 클린업
##########################################################
Write-Host "`n🧹 STEP 0: V2 시딩 데이터 클린업..."

# cre_pulses [E2E-V2] 태그 삭제
Delete "cre_pulses" "seo_slug=like.[E2E-V2]*"
Delete "cre_oiticles" "slug=like.e2e-v2-*"
Delete "market_leading_indicators" "region=like.*E2E-V2*"

# deal_pipeline_states: E2E 브로커 파이프라인 업데이트용 (기존 유지, 단계만 갱신)

##########################################################
# STEP 1: 시장 선행 지표 (4개 권역 — 안티프래질 모드)
##########################################################
Write-Host "`n📊 STEP 1: 시장 선행 지표 시딩 (4개 권역)..."

$marketIndicators = @(
  @{
    region                = "성수 [E2E-V2]"
    asset_type            = "꼬마빌딩"
    period_start          = "2026-06-01"
    period_end            = "2026-06-30"
    demand_score          = 78
    supply_score          = 42
    avg_hold_days         = 23.5
    conversion_rate       = 0.38
    absorption_rate       = 0.42
    trend_direction       = "up"
    price_resistance_band = @{ min = 0.06; max = 0.12 }
  },
  @{
    region                = "강남 GBD [E2E-V2]"
    asset_type            = "오피스빌딩"
    period_start          = "2026-06-01"
    period_end            = "2026-06-30"
    demand_score          = 62
    supply_score          = 71
    avg_hold_days         = 41.2
    conversion_rate       = 0.22
    absorption_rate       = 0.28
    trend_direction       = "flat"
    price_resistance_band = @{ min = 0.08; max = 0.15 }
  },
  @{
    region                = "마포 [E2E-V2]"
    asset_type            = "근린상가"
    period_start          = "2026-06-01"
    period_end            = "2026-06-30"
    demand_score          = 55
    supply_score          = 61
    avg_hold_days         = 35.0
    conversion_rate       = 0.29
    absorption_rate       = 0.33
    trend_direction       = "down"
    price_resistance_band = @{ min = 0.05; max = 0.10 }
  },
  @{
    region                = "여의도 YBD [E2E-V2]"
    asset_type            = "오피스빌딩"
    period_start          = "2026-06-01"
    period_end            = "2026-06-30"
    demand_score          = 85
    supply_score          = 38
    avg_hold_days         = 18.7
    conversion_rate       = 0.51
    absorption_rate       = 0.58
    trend_direction       = "up"
    price_resistance_band = @{ min = 0.09; max = 0.18 }
  }
)

foreach ($m in $marketIndicators) {
  Post "market_leading_indicators" $m | Out-Null
}

##########################################################
# STEP 2: CRE Pulse 시그널 (8개 권역)
##########################################################
Write-Host "`n📡 STEP 2: CRE Pulse 시그널 시딩 (8개 권역)..."

$pulses = @(
  @{
    region       = "seongsu"
    period_type  = "weekly"
    period_label = "2026-W23"
    pulse_score  = 74
    trend        = "up"
    summary_ko   = "성수 권역 꼬마빌딩 수요 급증, 80억대 급매 소진 속도 전주 대비 +40%"
    key_findings = @(
      "70~80억 꼬마빌딩 평균 체류일 23.5일 (전주 31일 → 대폭 단축)",
      "1층 카페/F&B 임차 매물 프리미엄 형성 중 — 동일 조건 대비 +8% 가산",
      "사옥 목적 법인 수요 활성화 (비중 38% → 52%)"
    )
    seo_slug     = "[E2E-V2]-pulse-seongsu-2026-W23"
    status       = "published"
    signals      = @{ demand_index = 74; supply_index = 42; transaction_count = 12 }
  },
  @{
    region       = "gbd"
    period_type  = "weekly"
    period_label = "2026-W23"
    pulse_score  = 58
    trend        = "flat"
    summary_ko   = "GBD 중형 오피스 수요 보합, 임대차 만기 집중으로 공실 주의 필요"
    key_findings = @(
      "강남역 반경 500m 이내 150~300평 오피스 공실률 4.2% (전월 3.8%)",
      "테헤란로 대로변 임대 문의 전주 대비 -15%, 이면도로는 +7% 역전",
      "AI·핀테크 스타트업 사무실 수요 지속 — 용도 허용 매물 부족"
    )
    seo_slug     = "[E2E-V2]-pulse-gbd-2026-W23"
    status       = "published"
    signals      = @{ demand_index = 58; supply_index = 71; transaction_count = 8 }
  },
  @{
    region       = "ybd"
    period_type  = "weekly"
    period_label = "2026-W23"
    pulse_score  = 82
    trend        = "up"
    summary_ko   = "여의도 초프리미엄 오피스 공실 제로 수준, 대형 매각 딜 3건 계약 임박"
    key_findings = @(
      "여의도 A급 오피스 공실률 0.8% 역대 최저 수준",
      "IFC 인근 200억 이상 매각 딜 3건 LOI 체결 단계",
      "외국계 금융사 재계약 조건 상향 요구 — Cap Rate 4.5% 이하 거래 가시화"
    )
    seo_slug     = "[E2E-V2]-pulse-ybd-2026-W23"
    status       = "published"
    signals      = @{ demand_index = 82; supply_index = 38; transaction_count = 15 }
  },
  @{
    region       = "mapo"
    period_type  = "weekly"
    period_label = "2026-W23"
    pulse_score  = 51
    trend        = "down"
    summary_ko   = "합정·홍대 상권 공실 증가, F&B 임차인 퇴점 가속화"
    key_findings = @(
      "합정역 상권 1층 공실률 9.1% — 팬데믹 이후 최고치",
      "월세 협상 여지 확대, 렌트프리 3개월 이상 제안 관행화",
      "기획부동산 활동 주의 — 인근 매물 허위 시세 유포 감지"
    )
    seo_slug     = "[E2E-V2]-pulse-mapo-2026-W23"
    status       = "published"
    signals      = @{ demand_index = 51; supply_index = 61; transaction_count = 5 }
  },
  @{
    region       = "cbd"
    period_type  = "weekly"
    period_label = "2026-W23"
    pulse_score  = 63
    trend        = "flat"
    summary_ko   = "종로·을지로 도시재생 기대감 지속, 소형 근생 문의 완만한 증가"
    key_findings = @(
      "을지로 소형 근생(100평 미만) 매수 문의 전주 대비 +12%",
      "도시재생 구역 지정 기대감 — 3~5년 보유 후 밸류업 기대 수요",
      "임차인 퇴점 후 리모델링 진행 건 증가"
    )
    seo_slug     = "[E2E-V2]-pulse-cbd-2026-W23"
    status       = "published"
    signals      = @{ demand_index = 63; supply_index = 58; transaction_count = 7 }
  },
  @{
    region       = "pangyo"
    period_type  = "weekly"
    period_label = "2026-W23"
    pulse_score  = 69
    trend        = "up"
    summary_ko   = "판교 지식산업센터 분양가 상승, IT 기업 사옥 매매 수요 견조"
    key_findings = @(
      "판교 신축 지산 분양가 평당 2,400만원 돌파 — 전년 대비 +18%",
      "IT 유니콘 사옥 매입 수요 3건 동시 진행 중",
      "기존 사옥 매각 후 R&E 센터 이전 패턴 증가"
    )
    seo_slug     = "[E2E-V2]-pulse-pangyo-2026-W23"
    status       = "published"
    signals      = @{ demand_index = 69; supply_index = 45; transaction_count = 9 }
  },
  @{
    region       = "jongno"
    period_type  = "weekly"
    period_label = "2026-W23"
    pulse_score  = 44
    trend        = "down"
    summary_ko   = "종로 전통 상업 지구 공실 확대, 관광 수요 회복 지연"
    key_findings = @(
      "인사동·북촌 관광상권 외국인 방문객 기대 하회 — 공실 8.3%",
      "노후 건물 리모델링 비용 급등으로 투자 수익성 악화",
      "역사문화 용도 제한으로 용도 전환 난항"
    )
    seo_slug     = "[E2E-V2]-pulse-jongno-2026-W23"
    status       = "published"
    signals      = @{ demand_index = 44; supply_index = 69; transaction_count = 3 }
  },
  @{
    region       = "hongdae"
    period_type  = "weekly"
    period_label = "2026-W23"
    pulse_score  = 67
    trend        = "flat"
    summary_ko   = "홍대 MZ 상권 회복 조짐, 팝업스토어 임차 수요로 단기 공실 해소 중"
    key_findings = @(
      "팝업스토어 단기 임차(3~6개월) 수요 급증 — 장기 공실 해소 기여",
      "F4 비자 외국인 창업 임차 문의 월 20건 이상",
      "홍대 메인 스트리트 2층 이상 공실 지속 — 1층 집중 현상"
    )
    seo_slug     = "[E2E-V2]-pulse-hongdae-2026-W23"
    status       = "published"
    signals      = @{ demand_index = 67; supply_index = 53; transaction_count = 6 }
  }
)

foreach ($p in $pulses) {
  Post "cre_pulses" $p | Out-Null
}

##########################################################
# STEP 3: CRE Oiticle 인사이트 (3종 — AI·브로커·전문가)
##########################################################
Write-Host "`n📝 STEP 3: CRE Oiticle 인사이트 시딩 (3종)..."

$oiticles = @(
  @{
    oiticle_type    = "MA"
    title           = "2026 성수동 꼬마빌딩 마켓 알파: 체류일 단축의 비밀 [E2E-V2]"
    slug            = "e2e-v2-seongsu-hold-days-alpha"
    excerpt         = "2026년 상반기 성수동 70~80억 꼬마빌딩의 평균 매물 체류일이 31일에서 23일로 단축된 배경을 분석합니다. 사옥 법인 수요와 1층 카페 임차 매물의 프리미엄 구조를 데이터로 해부합니다."
    body_md         = "# 2026 성수동 꼬마빌딩 마켓 알파\n\n## 핵심 인사이트\n\n2026년 5월 기준 성수동 70~80억 꼬마빌딩 평균 체류일은 23.5일로, 전년 동기(31.2일) 대비 -25% 단축됐다.\n\n### 원인 1: 사옥 법인 수요 급증\n..."
    author_type     = "ai"
    author_name     = "DealCard AI 분석팀"
    regions         = @("seongsu")
    asset_types     = @("꼬마빌딩")
    tags            = @("성수동", "꼬마빌딩", "사옥", "마켓분석", "체류일")
    status          = "published"
    published_at    = "2026-06-03T00:00:00Z"
    views           = 247
    likes           = 38
  },
  @{
    oiticle_type    = "CS"
    title           = "상담 케이스: 양도세 이슈 있는 급매 매물, 어떻게 접근했나 [E2E-V2]"
    slug            = "e2e-v2-case-study-capital-gains-tax"
    excerpt         = "매도인 양도세 이슈로 급매로 나온 성수 꼬마빌딩. 법인 매수자에게 어떻게 딜카드를 구성하고, 세무사 협업으로 리스크를 구조화했는지 실전 케이스를 공유합니다."
    body_md         = "# 케이스 스터디: 양도세 이슈 급매 딜 구조화\n\n## 상황\n\n매도인 A씨는 2015년 취득한 성수동 건물을 급매 처분 희망..."
    author_type     = "broker"
    author_id       = $BROKER1
    author_name     = "데모 브로커 (꼬마빌딩 전문)"
    regions         = @("seongsu")
    asset_types     = @("꼬마빌딩")
    tags            = @("케이스스터디", "양도세", "급매", "딜구조화", "성수")
    status          = "published"
    published_at    = "2026-06-02T09:00:00Z"
    views           = 183
    likes           = 29
  },
  @{
    oiticle_type    = "TX"
    title           = "법인 전환 후 꼬마빌딩 매입: 절세 전략 가이드 2026 [E2E-V2]"
    slug            = "e2e-v2-tax-guide-corporate-purchase"
    excerpt         = "개인 명의 대신 법인으로 꼬마빌딩을 매입할 때 절세 효과와 주의사항. 취득세, 법인세, 배당세까지 실제 시뮬레이션을 포함한 세무 전략을 정리합니다."
    body_md         = "# 법인 매입 절세 가이드\n\n## 법인 매입의 장점\n\n1. 취득세: 개인 1~3% vs 법인 2.4%\n2. 보유세: 법인세율 적용으로 최고세율 회피..."
    author_type     = "vendor"
    author_name     = "바른세무 CRE 전문팀"
    regions         = @("seongsu", "gbd")
    asset_types     = @("꼬마빌딩", "오피스빌딩")
    tags            = @("법인전환", "절세", "취득세", "법인세", "세무가이드")
    status          = "published"
    published_at    = "2026-06-01T12:00:00Z"
    views           = 312
    likes           = 51
  }
)

foreach ($o in $oiticles) {
  Post "cre_oiticles" $o | Out-Null
}

##########################################################
# STEP 4: 파이프라인 심화 시딩 (LOI, IM 작성 단계)
##########################################################
Write-Host "`n🔄 STEP 4: 파이프라인 심화 단계 시딩..."

# E2E 건물 1 (성수) → gate_requested → im_created → buyer_meeting → loi
# E2E 건물 2 (합정) → deal_card_created 유지
# E2E 건물 6 (건대) → contract 단계 (완료 임박)

$pipelineStages = @(
  @{
    building_ssot_lite_id = "e2e00000-0001-0001-0001-000000000001"
    broker_id             = $BROKER1
    stage                 = "loi"
    entered_at            = (Get-Date).AddDays(-3).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    metadata              = @{
      loi_date        = (Get-Date).AddDays(-3).ToString("yyyy-MM-dd")
      buyer_name      = "홍OO 대표"
      offered_price   = "72억"
      target_close    = (Get-Date).AddDays(25).ToString("yyyy-MM-dd")
      note            = "[E2E-V2] 가격 최종 협의 중. 매도인 72.5억 고수"
    }
  },
  @{
    building_ssot_lite_id = "e2e00000-0001-0001-0001-000000000005"
    broker_id             = $BROKER1
    stage                 = "im_created"
    entered_at            = (Get-Date).AddDays(-8).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    metadata              = @{
      im_sections_done = 14
      im_sections_total = 18
      next_action       = "평면도 추가 후 Full IM 완성 예정"
      note              = "[E2E-V2] 길음 근생, IM 14/18 섹션 완료"
    }
  },
  @{
    building_ssot_lite_id = "e2e00000-0001-0001-0001-000000000006"
    broker_id             = $BROKER2
    stage                 = "contract"
    entered_at            = (Get-Date).AddDays(-2).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    metadata              = @{
      contract_date    = (Get-Date).AddDays(-2).ToString("yyyy-MM-dd")
      sale_price       = "58억"
      close_date       = (Get-Date).AddDays(28).ToString("yyyy-MM-dd")
      note             = "[E2E-V2] 건대 복합상업 계약 완료, 잔금 D+28"
    }
  }
)

foreach ($ps in $pipelineStages) {
  Post "deal_pipeline_states" $ps | Out-Null
}

##########################################################
# STEP 5: 브로커 프로필 업데이트 (E2E 브로커 1)
##########################################################
Write-Host "`n👤 STEP 5: 브로커 프로필 업데이트..."

# broker_profiles: E2E 브로커1 프로필 upsert
$profileData = @{
  user_id           = $BROKER1
  specialty_regions = @("성동구", "마포구", "용산구")
  specialty_assets  = @("꼬마빌딩", "근린상가", "복합용도")
  bio               = "성동구·마포구 꼬마빌딩 전문 12년 경력 중개인. 70~120억 구간 법인 매수 상담 특화. 딜카드 시스템으로 300건+ 매물 구조화 경험. [E2E-V2]"
  is_verified       = $true
}

# UPSERT via Prefer: resolution=merge-duplicates
$upsertH = $H.Clone()
$upsertH["Prefer"] = "resolution=merge-duplicates,return=representation"
try {
  $json = $profileData | ConvertTo-Json -Depth 5 -Compress
  $r = Invoke-RestMethod -Uri "$SB_URL/rest/v1/broker_profiles?user_id=eq.$BROKER1" -Headers $upsertH -Method Put -Body $json
  Write-Host "  ✅ broker_profiles 업데이트 완료"
} catch {
  # INSERT if not exists
  Post "broker_profiles" $profileData | Out-Null
}

##########################################################
# STEP 6: 검증
##########################################################
Write-Host "`n🔍 STEP 6: 삽입 결과 검증..."

function qcount($t, $f="") {
  try {
    $uri = "$SB_URL/rest/v1/$t`?select=id"
    if ($f) { $uri += "&$f" }
    $r = Invoke-RestMethod -Uri $uri -Headers $H -Method Get
    return $r.Count
  } catch { return "ERR" }
}

Write-Host ""
Write-Host "┌─────────────────────────────────────────────────────┐"
Write-Host "│  V2 시딩 결과 요약                                    │"
Write-Host "├─────────────────────────────────────────────────────┤"
Write-Host "│  market_leading_indicators (E2E-V2): $(qcount 'market_leading_indicators' 'region=like.*E2E-V2*')건         │"
Write-Host "│  cre_pulses (E2E-V2):                $(qcount 'cre_pulses' 'seo_slug=like.*E2E-V2*')건         │"
Write-Host "│  cre_oiticles (E2E-V2):              $(qcount 'cre_oiticles' 'slug=like.e2e-v2-*')건         │"
Write-Host "│  deal_pipeline_states (E2E):         $(qcount 'deal_pipeline_states' 'metadata->>note=like.*E2E-V2*')건         │"
Write-Host "└─────────────────────────────────────────────────────┘"
Write-Host ""
Write-Host "✅ V2 시딩 완료! docs/60-e2e-demo-script-v2.md 문서를 참고하세요."
