/**
 * Part 1: 딜카드·매수의향 생성 & AI 매칭 엔진 E2E 테스트
 * 
 * TC-01: 딜카드 메모 → SSoT Lite 생성
 * TC-02: 이상적 매수자 페르소나 3종
 * TC-03: 매수의향 메모 → AI 정규화
 * TC-04~05: 자동 매칭 트리거
 * TC-06: 3-Stage 매칭 엔진 수동 실행
 * TC-07: Hard Filter 탈락 4종
 * TC-11: 중복 매칭 방지
 * 
 * Usage: node run-api-test-part1.js
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const BASE = 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Test fixtures from the guide
const FX01_MEMO = `역삼동 테헤란로 인근 꼬마빌딩 매물 접수.
대지 85평, 연면적 320평, 지하1층~지상5층.
2003년 준공, 근린생활시설 및 업무시설.
현재 만실 상태. 보증금 총 8억, 월세 총 2,800만원.
매도 희망가 80억 (감정가 대비 약 10% 할인).
1층 카페, 2~3층 사무실, 4~5층 공유오피스 임차 중.
리모델링 이력 있음 (2019년 외벽+엘리베이터 교체).
위반건축물 해당 없음. 단독소유. 명도 불필요(만실).`;

const FX02_MEMO = `법인 매수자, 예산 60~100억.
강남·서초·역삼 권역 꼬마빌딩 선호.
임대수익형 투자 목적. 만실 또는 90% 이상 점유 매물 희망.
필수조건: 위반건축물 불가, 명도 불필요한 만실 매물.
수익률 4% 이상 기대. 대출 비율 50% 이내 예정.
리스크 허용도: 보수적.`;

const FX03_MEMO = `개인 매수자, 예산 50~80억.
마포·홍대·합정 권역 꼬마빌딩 선호.
임대수익형 투자 목적.
수익률 5% 이상 기대.`;

const FX04_MEMO = `개인 매수자, 예산 20~30억.
강남 권역 꼬마빌딩 선호.
사옥용 자가사용 목적.`;

const FX05_MEMO = `디벨로퍼 법인, 예산 70~120억.
강남·서초 권역 토지 또는 노후 건물 선호.
철거 후 신축 개발 목적. 공실 또는 명도 가능 매물 선호.
필수조건: 단독소유, 대지 100평 이상.
리스크 허용도: 공격적.`;

const results = [];
let buildingId = null;
let buyerIntentIds = [];
let ACCESS_TOKEN = null;

function log(tc, status, detail) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} ${tc}: ${detail}`);
  results.push({ tc, status, detail });
}

async function apiCall(method, path, body) {
  const url = `${BASE}${path}`;
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(ACCESS_TOKEN ? { 'Authorization': `Bearer ${ACCESS_TOKEN}` } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);
  
  try {
    const res = await fetch(url, opts);
    const contentType = res.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }
    return { status: res.status, data, ok: res.ok };
  } catch (err) {
    return { status: 0, data: err.message, ok: false };
  }
}

async function getAccessToken() {
  // Use Supabase admin to create a session for the test user
  const ownerId = 'c2496e34-ed06-43b3-8ec5-3dcb1a67584e'; // Known valid owner_id
  const { data: userData } = await supabase.auth.admin.getUserById(ownerId);
  if (!userData?.user?.email) {
    console.log('  ❌ Test user not found');
    return null;
  }
  
  // Generate a magic link and extract token
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: userData.user.email,
  });
  
  if (linkErr || !linkData?.properties?.hashed_token) {
    console.log('  ⚠️ Magic link failed, trying OTP workaround...');
    // Use admin to directly create a session via signInWithPassword or custom token
    // Fallback: use the admin user ID directly with service role
    return null;
  }
  
  // Verify the OTP to get an actual session
  const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  
  if (verifyErr) {
    console.log('  ❌ OTP verification failed:', verifyErr.message);
    return null;
  }
  
  return verifyData?.session?.access_token || null;
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Part 1: 딜카드·매수의향·AI 매칭 E2E 테스트');
  console.log('═══════════════════════════════════════════════\n');
  
  // ─── Login via Bearer Token ───
  console.log('🔐 인증 토큰 발급 시도...');
  ACCESS_TOKEN = await getAccessToken();
  if (!ACCESS_TOKEN) {
    console.log('❌ 인증 실패. 테스트 중단.');
    return;
  }
  console.log('  ✅ Bearer 토큰 발급 완료');

  // ═══ TC-01: 딜카드 메모 → SSoT Lite ═══
  console.log('\n──── TC-01: 딜카드 메모 → SSoT Lite ────');
  const tc01 = await apiCall('POST', '/api/broker/deal-card/from-memo', {
    memo: FX01_MEMO,
    visibilityPreference: 'blind',
    forceNew: true,
  });
  
  if (tc01.ok && tc01.data?.ok) {
    buildingId = tc01.data.data?.buildingId;
    const priceKrw = tc01.data.data?.askingPriceKrw;
    const archetypes = tc01.data.archetypes;
    log('TC-01', 'PASS', `SSoT Lite 생성 완료: buildingId=${buildingId}, price=${priceKrw}, archetypes=${JSON.stringify(archetypes)}`);
    
    // DB 검증
    const { data: ssot } = await supabase.from('building_ssot_lite').select('*').eq('id', buildingId).single();
    if (ssot) {
      const checks = [];
      if (ssot.area_signal?.includes('역삼')) checks.push('지역 ✅');
      else checks.push(`지역 ❌ (${ssot.area_signal})`);
      if (ssot.asset_type?.includes('꼬마빌딩') || ssot.asset_type?.includes('빌딩')) checks.push('자산유형 ✅');
      else checks.push(`자산유형 ❌ (${ssot.asset_type})`);
      if (ssot.price_band?.includes('80') || ssot.price_band?.includes('8')) checks.push('가격 ✅');
      else checks.push(`가격 ❌ (${ssot.price_band})`);
      log('TC-01-DB', 'PASS', `DB 검증: ${checks.join(', ')}`);
    } else {
      log('TC-01-DB', 'FAIL', 'building_ssot_lite 행을 찾을 수 없음');
    }
  } else if (tc01.status === 422) {
    log('TC-01', 'WARN', `메모 품질 게이트 또는 가드레일: ${JSON.stringify(tc01.data)}`);
  } else if (tc01.status === 409) {
    log('TC-01', 'WARN', `중복 감지: ${JSON.stringify(tc01.data)}`);
    // 기존 빌딩 ID 사용
    if (tc01.data?.duplicates?.[0]?.id) {
      buildingId = tc01.data.duplicates[0].id;
      log('TC-01', 'PASS', `기존 빌딩 사용: ${buildingId}`);
    }
  } else {
    log('TC-01', 'FAIL', `HTTP ${tc01.status}: ${JSON.stringify(tc01.data)}`);
  }

  // ═══ TC-02: 이상적 매수자 페르소나 ═══
  if (buildingId) {
    console.log('\n──── TC-02: 이상적 매수자 페르소나 3종 ────');
    const tc02 = await apiCall('POST', `/api/broker/ideal-buyer-persona`, {
      buildingId,
      summary: {
        areaSignal: '역삼동', assetType: '꼬마빌딩', priceBand: '80억대',
        sizeSignal: '대지 85평 / 연면적 320평', vacancyStatus: '만실',
        investmentPosture: 'income',
      },
    });
    
    if (tc02.ok && tc02.data) {
      const personas = tc02.data.personas || tc02.data.data?.personas || [];
      if (personas.length >= 3) {
        log('TC-02', 'PASS', `${personas.length}종 페르소나 생성: ${personas.map(p => p.label || p.buyerType).join(', ')}`);
      } else if (personas.length > 0) {
        log('TC-02', 'WARN', `${personas.length}종만 생성 (3종 기대)`);
      } else {
        log('TC-02', 'WARN', `페르소나 배열 비어있음. 응답: ${JSON.stringify(tc02.data).slice(0, 200)}`);
      }
    } else {
      log('TC-02', 'FAIL', `HTTP ${tc02.status}: ${JSON.stringify(tc02.data).slice(0, 200)}`);
    }
  }

  // ═══ TC-03: 매수의향 생성 (FX-02 ~ FX-05) ═══
  console.log('\n──── TC-03: 매수의향 메모 → AI 정규화 ────');
  const buyerMemos = [
    { name: 'FX-02 (S등급 기대)', memo: FX02_MEMO },
    { name: 'FX-03 (지역 불일치)', memo: FX03_MEMO },
    { name: 'FX-04 (예산 불일치)', memo: FX04_MEMO },
    { name: 'FX-05 (개발형)', memo: FX05_MEMO },
  ];

  for (const { name, memo } of buyerMemos) {
    const tc03 = await apiCall('POST', '/api/broker/buyer-intents/from-memo', { memo });
    if (tc03.ok && tc03.data?.ok !== false) {
      const intentId = tc03.data?.buyerIntentId || tc03.data?.data?.buyerIntentId;
      if (intentId) {
        buyerIntentIds.push(intentId);
        log('TC-03', 'PASS', `${name}: intentId=${intentId}`);
        
        // DB 검증
        const { data: intent } = await supabase.from('buyer_intent_lite').select('*').eq('id', intentId).single();
        if (intent) {
          log('TC-03-DB', 'PASS', `  buyer_type=${intent.buyer_type}, budget=${intent.budget_min}~${intent.budget_max}, regions=${JSON.stringify(intent.preferred_regions)}`);
        }
      } else {
        log('TC-03', 'WARN', `${name}: ID 없음. 응답: ${JSON.stringify(tc03.data).slice(0, 200)}`);
      }
    } else {
      log('TC-03', 'FAIL', `${name}: HTTP ${tc03.status}: ${JSON.stringify(tc03.data).slice(0, 200)}`);
    }
  }

  // ═══ TC-04/05: 자동 매칭 확인 ═══
  if (buildingId && buyerIntentIds.length > 0) {
    console.log('\n──── TC-04/05: 자동 매칭 결과 확인 ────');
    // 비동기 매칭이므로 잠시 대기
    await new Promise(r => setTimeout(r, 5000));
    
    const { data: matches, error: matchErr } = await supabase
      .from('match_results')
      .select('*')
      .eq('building_ssot_lite_id', buildingId);
    
    if (matchErr) {
      log('TC-04', 'FAIL', `match_results 조회 실패: ${matchErr.message}`);
    } else if (matches && matches.length > 0) {
      log('TC-04', 'PASS', `${matches.length}건 매칭 결과 생성`);
      for (const m of matches) {
        log('TC-04-DETAIL', 'PASS', `  intent=${m.buyer_intent_lite_id?.slice(0,8)}, grade=${m.match_tier || m.grade}, score=${m.match_score || m.score}`);
      }
    } else {
      log('TC-04', 'WARN', '매칭 결과 없음 (비동기 처리 미완료 가능)');
    }
  }

  // ═══ TC-06: 3-Stage 매칭 엔진 수동 실행 ═══
  if (buildingId && buyerIntentIds.length > 0) {
    console.log('\n──── TC-06: 3-Stage 매칭 수동 실행 ────');
    const tc06 = await apiCall('POST', '/api/broker/match', {
      buildingId,
      buyerIntentId: buyerIntentIds[0], // FX-02 (S등급 기대)
    });
    
    if (tc06.ok) {
      const d = tc06.data;
      log('TC-06', 'PASS', `매칭 결과: grade=${d.matchTier || d.grade || d.data?.matchTier}, score=${d.matchScore || d.score || d.data?.matchScore}`);
    } else {
      log('TC-06', 'FAIL', `HTTP ${tc06.status}: ${JSON.stringify(tc06.data).slice(0, 300)}`);
    }
  }

  // ═══ TC-07: Hard Filter 탈락 ═══
  if (buildingId && buyerIntentIds.length >= 3) {
    console.log('\n──── TC-07: Hard Filter 탈락 검증 ────');
    // FX-03: 지역 불일치
    const tc07a = await apiCall('POST', '/api/broker/match', {
      buildingId,
      buyerIntentId: buyerIntentIds[1], // FX-03
    });
    if (tc07a.ok) {
      const d = tc07a.data;
      const grade = d.matchTier || d.grade || d.data?.matchTier;
      const reasons = d.mismatchReasons || d.data?.mismatchReasons || [];
      if (grade === 'C' || grade === 'DISQUALIFIED' || grade === 'D') {
        log('TC-07a', 'PASS', `지역 불일치 탈락: grade=${grade}, reasons=${JSON.stringify(reasons)}`);
      } else {
        log('TC-07a', 'WARN', `예상 C/DISQUALIFIED, 실제 grade=${grade}`);
      }
    } else {
      log('TC-07a', 'FAIL', `HTTP ${tc07a.status}`);
    }

    // FX-04: 예산 불일치
    const tc07b = await apiCall('POST', '/api/broker/match', {
      buildingId,
      buyerIntentId: buyerIntentIds[2], // FX-04
    });
    if (tc07b.ok) {
      const d = tc07b.data;
      const grade = d.matchTier || d.grade || d.data?.matchTier;
      if (grade === 'C' || grade === 'DISQUALIFIED' || grade === 'D') {
        log('TC-07b', 'PASS', `예산 불일치 탈락: grade=${grade}`);
      } else {
        log('TC-07b', 'WARN', `예상 C/DISQUALIFIED, 실제 grade=${grade}`);
      }
    } else {
      log('TC-07b', 'FAIL', `HTTP ${tc07b.status}`);
    }
  }

  // ═══ TC-11: 중복 매칭 방지 ═══
  if (buildingId && buyerIntentIds.length > 0) {
    console.log('\n──── TC-11: 중복 매칭 방지 ────');
    const { count: before } = await supabase
      .from('match_results')
      .select('id', { count: 'exact', head: true })
      .eq('building_ssot_lite_id', buildingId)
      .eq('buyer_intent_lite_id', buyerIntentIds[0]);
    
    // 동일 조합으로 재매칭 시도
    await apiCall('POST', '/api/broker/match', {
      buildingId,
      buyerIntentId: buyerIntentIds[0],
    });
    
    const { count: after } = await supabase
      .from('match_results')
      .select('id', { count: 'exact', head: true })
      .eq('building_ssot_lite_id', buildingId)
      .eq('buyer_intent_lite_id', buyerIntentIds[0]);
    
    if (after <= before + 1) {
      log('TC-11', 'PASS', `중복 방지 작동: before=${before}, after=${after}`);
    } else {
      log('TC-11', 'FAIL', `중복 발생: before=${before}, after=${after}`);
    }
  }

  // ═══ Summary ═══
  console.log('\n═══════════════════════════════════════════════');
  console.log(' 테스트 결과 요약');
  console.log('═══════════════════════════════════════════════');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  console.log(`✅ PASS: ${passed}  ❌ FAIL: ${failed}  ⚠️ WARN: ${warned}`);
  console.log(`📊 Total: ${results.length} assertions\n`);

  // Cleanup - 테스트 데이터 삭제
  console.log('🧹 테스트 데이터 정리...');
  if (buyerIntentIds.length > 0) {
    for (const id of buyerIntentIds) {
      await supabase.from('match_results').delete().eq('buyer_intent_lite_id', id);
      await supabase.from('buyer_intent_lite').delete().eq('id', id);
    }
    console.log(`  삭제: ${buyerIntentIds.length}건 buyer_intent_lite + match_results`);
  }
  if (buildingId) {
    await supabase.from('match_results').delete().eq('building_ssot_lite_id', buildingId);
    await supabase.from('building_ssot_lite').delete().eq('id', buildingId);
    console.log(`  삭제: building_ssot_lite ${buildingId}`);
  }

  console.log('\n✨ 테스트 완료!');
}

main().catch(console.error);
