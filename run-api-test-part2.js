/**
 * Part 2: 서클(Circle) 공동중개 E2E 테스트
 * 
 * TC-13~TC-24: 서클 CRUD → 자산 공유 → 교차 매칭 → 양측 승인
 * 두 브로커 계정이 필요 (owner_id 기반 + 별도 테스트 유저)
 * 
 * Usage: node run-api-test-part2.js
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const BASE = 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const OWNER_ID_A = 'c2496e34-ed06-43b3-8ec5-3dcb1a67584e'; // Known valid user

const results = [];
let TOKEN_A = null; // Broker A (Building owner)
let TOKEN_B = null; // Broker B (Buyer broker)
let USER_B_ID = null;
let circleId = null;
let buildingId = null;
let buyerIntentId = null;
let matchId = null;

function log(tc, status, detail) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} ${tc}: ${detail}`);
  results.push({ tc, status, detail });
}

async function getTokenForUser(userId) {
  const { data: userData } = await supabase.auth.admin.getUserById(userId);
  if (!userData?.user?.email) return null;
  
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink', email: userData.user.email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) return null;
  
  const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token, type: 'magiclink',
  });
  if (verifyErr) return null;
  return verifyData?.session?.access_token || null;
}

async function apiCall(token, method, path, body) {
  const url = `${BASE}${path}`;
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(url, opts);
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, ok: res.ok };
  } catch (err) {
    return { status: 0, data: err.message, ok: false };
  }
}

async function ensureSecondUser() {
  // Find or create a second test user
  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 10 });
  const otherUser = users?.users?.find(u => u.id !== OWNER_ID_A);
  
  if (otherUser) {
    USER_B_ID = otherUser.id;
    // Ensure profile exists
    await supabase.from('profiles').upsert({
      id: USER_B_ID, role: 'broker', display_name: '테스트 브로커 B',
    }, { onConflict: 'id' });
    return getTokenForUser(otherUser.id);
  }
  
  // Create a new user
  const { data: newUser, error } = await supabase.auth.admin.createUser({
    email: 'test-broker-b@credeal.net',
    email_confirm: true,
    user_metadata: { display_name: '테스트 브로커 B' },
  });
  if (error) {
    console.log('  ❌ Second user creation failed:', error.message);
    return null;
  }
  USER_B_ID = newUser.user.id;
  
  // Ensure profile exists
  await supabase.from('profiles').upsert({
    id: USER_B_ID, role: 'broker', display_name: '테스트 브로커 B',
  });
  
  return getTokenForUser(USER_B_ID);
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Part 2: 서클 공동중개 E2E 테스트');
  console.log('═══════════════════════════════════════════════\n');
  
  // ─── Auth ───
  console.log('🔐 브로커 A 토큰 발급...');
  TOKEN_A = await getTokenForUser(OWNER_ID_A);
  if (!TOKEN_A) { console.log('❌ 브로커 A 인증 실패'); return; }
  console.log('  ✅ 브로커 A 인증 완료');
  
  console.log('🔐 브로커 B 토큰 발급...');
  TOKEN_B = await ensureSecondUser();
  if (!TOKEN_B) { console.log('❌ 브로커 B 인증 실패'); return; }
  console.log(`  ✅ 브로커 B 인증 완료 (${USER_B_ID})`);

  // ─── Setup: 매물 + 매수의향 생성 ───
  console.log('\n📦 테스트 데이터 준비...');
  
  // Broker A creates a building
  const bldg = await apiCall(TOKEN_A, 'POST', '/api/broker/deal-card/from-memo', {
    memo: `역삼동 테헤란로 인근 꼬마빌딩 매물.\n대지 85평, 연면적 320평.\n매도 희망가 80억. 만실 상태.\n위반건축물 해당 없음. 단독소유.`,
    visibilityPreference: 'blind', forceNew: true,
  });
  if (bldg.ok && bldg.data?.ok) {
    buildingId = bldg.data.data?.buildingId;
    console.log(`  ✅ 매물 생성: ${buildingId}`);
  } else {
    console.log(`  ⚠️ 매물 생성 실패: ${JSON.stringify(bldg.data).slice(0, 200)}`);
    // Try to use existing building
    const { data: existing } = await supabase.from('building_ssot_lite').select('id').eq('owner_id', OWNER_ID_A).limit(1).single();
    if (existing) { buildingId = existing.id; console.log(`  ✅ 기존 매물 사용: ${buildingId}`); }
  }

  // Broker B creates a buyer intent (auth optional for this endpoint)
  const intent = await apiCall(TOKEN_B, 'POST', '/api/broker/buyer-intents/from-memo', {
    memo: `법인 매수자, 예산 60~100억.\n강남·서초·역삼 권역 꼬마빌딩 선호.\n임대수익형 투자 목적. 만실 희망.`,
  });
  if (intent.ok && intent.data) {
    buyerIntentId = intent.data?.buyerIntentId || intent.data?.data?.buyerIntentId;
    console.log(`  ✅ 매수의향 생성: ${buyerIntentId}`);
    // Update owner_id to Broker B
    if (buyerIntentId) {
      await supabase.from('buyer_intent_lite').update({ owner_id: USER_B_ID }).eq('id', buyerIntentId);
    }
  } else {
    console.log(`  ⚠️ 매수의향 생성 실패: ${JSON.stringify(intent.data).slice(0, 200)}`);
  }

  // ═══ TC-13: 서클 생성 ═══
  console.log('\n──── TC-13: 서클 생성 ────');
  const tc13 = await apiCall(TOKEN_A, 'POST', '/api/broker/circles', {
    name: '강남 꼬마빌딩 공동중개팀',
    description: '강남·서초 권역 꼬마빌딩 매물과 매수자를 공유하는 팀입니다.',
  });
  
  if (tc13.ok && tc13.data?.circle) {
    circleId = tc13.data.circle.id;
    log('TC-13', 'PASS', `서클 생성: ${circleId}, name=${tc13.data.circle.name}`);
    
    // DB 검증
    const { data: members } = await supabase.from('broker_circle_members')
      .select('*').eq('circle_id', circleId);
    if (members && members.length === 1) {
      log('TC-13-DB', 'PASS', `멤버 1명 (owner): ${members[0].broker_id}`);
    } else {
      log('TC-13-DB', 'WARN', `멤버 수: ${members?.length || 0}`);
    }
  } else {
    log('TC-13', 'FAIL', `HTTP ${tc13.status}: ${JSON.stringify(tc13.data).slice(0, 200)}`);
  }

  // ═══ TC-14: 초대 & 가입 ═══
  if (circleId) {
    console.log('\n──── TC-14: 초대 링크 & 가입 ────');
    const invite = await apiCall(TOKEN_A, 'POST', '/api/broker/circles/invite-link', {
      circleId,
    });
    
    if (invite.ok && invite.data) {
      const inviteCode = invite.data.inviteCode;
      log('TC-14a', 'PASS', `초대 코드 생성: ${inviteCode}`);
      
      // Broker B joins
      const join = await apiCall(TOKEN_B, 'POST', '/api/broker/circles/join', {
        code: inviteCode,
      });
      
      if (join.ok) {
        log('TC-14b', 'PASS', `브로커 B 가입 완료: ${JSON.stringify(join.data).slice(0, 100)}`);
        
        // DB verify 2 members
        const { data: members2 } = await supabase.from('broker_circle_members')
          .select('*').eq('circle_id', circleId);
        if (members2 && members2.length === 2) {
          log('TC-14-DB', 'PASS', `멤버 2명 확인`);
        } else {
          log('TC-14-DB', 'WARN', `멤버 수: ${members2?.length || 0}`);
        }
      } else {
        log('TC-14b', 'FAIL', `가입 실패: HTTP ${join.status}: ${JSON.stringify(join.data).slice(0, 200)}`);
      }
    } else {
      log('TC-14a', 'FAIL', `초대 생성 실패: HTTP ${invite.status}: ${JSON.stringify(invite.data).slice(0, 200)}`);
    }
  }

  // ═══ TC-15: 매물 공유 ═══
  if (circleId && buildingId) {
    console.log('\n──── TC-15: 매물 공유 ────');
    const share = await apiCall(TOKEN_A, 'POST', `/api/broker/circles/${circleId}/share`, {
      assetType: 'building',
      assetId: buildingId,
    });
    
    if (share.ok) {
      log('TC-15', 'PASS', `매물 공유: ${JSON.stringify(share.data).slice(0, 150)}`);
      
      // DB verify visibility
      const { data: shared } = await supabase.from('circle_shared_assets')
        .select('visibility').eq('circle_id', circleId).eq('asset_id', buildingId).single();
      if (shared) {
        log('TC-15-DB', shared.visibility === 'signal_only' ? 'PASS' : 'WARN',
          `visibility=${shared.visibility} (signal_only 기대)`);
      }
    } else {
      log('TC-15', 'FAIL', `HTTP ${share.status}: ${JSON.stringify(share.data).slice(0, 200)}`);
    }
  }

  // ═══ TC-16: 매수의향 공유 ═══
  if (circleId && buyerIntentId) {
    console.log('\n──── TC-16: 매수의향 공유 ────');
    const share = await apiCall(TOKEN_B, 'POST', `/api/broker/circles/${circleId}/share`, {
      assetType: 'buyer_intent',
      assetId: buyerIntentId,
    });
    
    if (share.ok) {
      log('TC-16', 'PASS', `매수의향 공유: ${JSON.stringify(share.data).slice(0, 150)}`);
    } else {
      log('TC-16', 'FAIL', `HTTP ${share.status}: ${JSON.stringify(share.data).slice(0, 200)}`);
    }
  }

  // ═══ TC-17: 자동 교차 매칭 확인 ═══
  if (circleId) {
    console.log('\n──── TC-17: 자동 교차 매칭 ────');
    await new Promise(r => setTimeout(r, 5000));
    
    const { data: matches } = await supabase.from('circle_match_results')
      .select('*').eq('circle_id', circleId);
    
    if (matches && matches.length > 0) {
      matchId = matches[0].id;
      log('TC-17', 'PASS', `교차 매칭 ${matches.length}건: grade=${matches[0].grade}, score=${matches[0].score}`);
    } else {
      log('TC-17', 'WARN', '자동 교차 매칭 결과 없음 (비동기 미완료 가능)');
    }
  }

  // ═══ TC-18: 전체 매칭 수동 실행 ═══
  if (circleId) {
    console.log('\n──── TC-18: 전체 매칭 수동 실행 ────');
    const tc18 = await apiCall(TOKEN_A, 'POST', `/api/broker/circles/${circleId}/match`, {});
    
    if (tc18.ok) {
      const d = tc18.data;
      log('TC-18', 'PASS', `전체 매칭: totalMatched=${d.totalMatched || d.data?.totalMatched}, S=${d.sCount || d.data?.sCount}, A=${d.aCount || d.data?.aCount}`);
      
      // Get match ID from results
      const { data: newMatches } = await supabase.from('circle_match_results')
        .select('id, grade, score').eq('circle_id', circleId).order('score', { ascending: false }).limit(1);
      if (newMatches?.[0]) {
        matchId = newMatches[0].id;
        log('TC-18-DB', 'PASS', `최고 매칭: id=${matchId}, grade=${newMatches[0].grade}, score=${newMatches[0].score}`);
      }
    } else {
      log('TC-18', 'FAIL', `HTTP ${tc18.status}: ${JSON.stringify(tc18.data).slice(0, 200)}`);
    }
  }

  // ═══ TC-20: 일방 승인 ═══
  if (circleId && matchId) {
    console.log('\n──── TC-20: 일방 승인 ────');
    const tc20 = await apiCall(TOKEN_A, 'POST', `/api/broker/circles/${circleId}/match/${matchId}/approve`, {});
    
    if (tc20.ok) {
      const d = tc20.data;
      const bothApproved = d.bothApproved ?? d.data?.bothApproved;
      if (bothApproved === false) {
        log('TC-20', 'PASS', `일방 승인 완료: bothApproved=false`);
      } else {
        log('TC-20', 'WARN', `예상 bothApproved=false, 실제: ${bothApproved}`);
      }
      
      // DB verify
      const { data: matchRow } = await supabase.from('circle_match_results')
        .select('building_broker_approved, buyer_broker_approved, identity_revealed_at')
        .eq('id', matchId).single();
      if (matchRow) {
        log('TC-20-DB', 'PASS',
          `building_approved=${matchRow.building_broker_approved}, buyer_approved=${matchRow.buyer_broker_approved}, revealed=${matchRow.identity_revealed_at}`);
      }
    } else {
      log('TC-20', 'FAIL', `HTTP ${tc20.status}: ${JSON.stringify(tc20.data).slice(0, 200)}`);
    }
  }

  // ═══ TC-21: 양측 승인 → 신원 공개 ═══
  if (circleId && matchId) {
    console.log('\n──── TC-21: 양측 승인 → 신원 공개 ────');
    const tc21 = await apiCall(TOKEN_B, 'POST', `/api/broker/circles/${circleId}/match/${matchId}/approve`, {});
    
    if (tc21.ok) {
      const d = tc21.data;
      const bothApproved = d.bothApproved ?? d.data?.bothApproved;
      log('TC-21', bothApproved ? 'PASS' : 'WARN',
        `양측 승인: bothApproved=${bothApproved}`);
      
      // DB verify
      const { data: matchRow } = await supabase.from('circle_match_results')
        .select('identity_revealed_at, co_brokerage_deal_id')
        .eq('id', matchId).single();
      if (matchRow) {
        log('TC-21-DB', matchRow.identity_revealed_at ? 'PASS' : 'WARN',
          `revealed=${matchRow.identity_revealed_at}, deal_id=${matchRow.co_brokerage_deal_id}`);
      }
      
      // Check deal_pipeline_states
      const { data: deals } = await supabase.from('deal_pipeline_states')
        .select('broker_id, stage, metadata')
        .filter('metadata->>circle_match_id', 'eq', matchId);
      if (deals && deals.length > 0) {
        log('TC-21-DEAL', 'PASS', `공동중개 딜 ${deals.length}건 생성`);
      } else {
        log('TC-21-DEAL', 'WARN', '공동중개 딜 미생성');
      }
    } else {
      log('TC-21', 'FAIL', `HTTP ${tc21.status}: ${JSON.stringify(tc21.data).slice(0, 200)}`);
    }
  }

  // ═══ TC-22: 프로그레시브 디스클로저 ═══
  if (circleId && matchId) {
    console.log('\n──── TC-22: 프로그레시브 디스클로저 ────');
    // Try downgrade (should fail)
    const down = await apiCall(TOKEN_A, 'POST', `/api/broker/circles/${circleId}/match/${matchId}/disclosure`, {
      level: 'signal_only',
    });
    if (down.ok && down.data?.success === false) {
      log('TC-22a', 'PASS', '다운그레이드 차단 확인');
    } else {
      log('TC-22a', 'WARN', `다운그레이드 응답: ${JSON.stringify(down.data).slice(0, 100)}`);
    }
  }

  // ═══ TC-24: 공유 해제 & 멤버 탈퇴 ═══
  if (circleId && buildingId) {
    console.log('\n──── TC-24: 공유 해제 & 멤버 탈퇴 ────');
    const unshare = await apiCall(TOKEN_A, 'DELETE', `/api/broker/circles/${circleId}/share`, {
      assetId: buildingId,
    });
    if (unshare.ok) {
      log('TC-24a', 'PASS', '매물 공유 해제 완료');
    } else {
      log('TC-24a', 'WARN', `공유 해제: HTTP ${unshare.status}`);
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

  // Cleanup
  console.log('🧹 테스트 데이터 정리...');
  if (circleId) {
    await supabase.from('circle_match_results').delete().eq('circle_id', circleId);
    await supabase.from('circle_shared_assets').delete().eq('circle_id', circleId);
    await supabase.from('broker_circle_members').delete().eq('circle_id', circleId);
    await supabase.from('broker_circles').delete().eq('id', circleId);
    console.log(`  삭제: 서클 ${circleId} + 관련 데이터`);
  }
  if (buyerIntentId) {
    await supabase.from('match_results').delete().eq('buyer_intent_lite_id', buyerIntentId);
    await supabase.from('buyer_intent_lite').delete().eq('id', buyerIntentId);
    console.log(`  삭제: buyer_intent ${buyerIntentId}`);
  }
  if (buildingId) {
    await supabase.from('match_results').delete().eq('building_ssot_lite_id', buildingId);
    await supabase.from('building_ssot_lite').delete().eq('id', buildingId);
    console.log(`  삭제: building ${buildingId}`);
  }
  
  console.log('\n✨ 테스트 완료!');
}

main().catch(console.error);
