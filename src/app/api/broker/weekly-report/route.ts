/**
 * GET /api/broker/weekly-report
 * 중개인 개인 주간 리포트 — 이번 주 활동 요약 + 매칭 시그널 + 수요 집중 권역 + 미연락 고객
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireBroker } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const userId = auth.user!.id;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // ── 병렬 조회 ──────────────────────────────────────────────
  const [
    { count: weekDeals },
    { count: weekLeases },
    { count: weekBuyers },
    { count: weekTenants },
    { count: totalBuildings },
    { count: totalLeases },
    { count: totalBuyerIntents },
    { count: totalTenantIntents },
    { count: totalClients },
    { data: matchResults },
    { data: allBuyerIntents },
    { data: staleClients },
  ] = await Promise.all([
    // This week counts
    supabase.from('building_ssot_lite').select('id', { count: 'exact', head: true })
      .eq('owner_id', userId).gte('created_at', weekAgo),
    supabase.from('lease_spaces').select('id', { count: 'exact', head: true })
      .eq('broker_id', userId).gte('created_at', weekAgo),
    supabase.from('buyer_intent_lite').select('id', { count: 'exact', head: true })
      .eq('broker_id', userId).gte('created_at', weekAgo),
    supabase.from('tenant_intent').select('id', { count: 'exact', head: true })
      .eq('broker_id', userId).gte('created_at', weekAgo),
    // All-time totals
    supabase.from('building_ssot_lite').select('id', { count: 'exact', head: true })
      .eq('owner_id', userId),
    supabase.from('lease_spaces').select('id', { count: 'exact', head: true })
      .eq('broker_id', userId),
    supabase.from('buyer_intent_lite').select('id', { count: 'exact', head: true })
      .eq('broker_id', userId),
    supabase.from('tenant_intent').select('id', { count: 'exact', head: true })
      .eq('broker_id', userId),
    supabase.from('broker_clients').select('id', { count: 'exact', head: true })
      .eq('broker_id', userId),
    // Match results (all, for grade analysis)
    supabase.from('match_results')
      .select('id, grade, score, building_id, buyer_intent_id')
      .eq('broker_id', userId)
      .order('score', { ascending: false })
      .limit(50),
    // All buyer intents in the system (for demand signal)
    supabase.from('buyer_intent_lite')
      .select('preferred_regions')
      .limit(200),
    // Clients needing follow-up (updated > 14 days ago)
    supabase.from('broker_clients')
      .select('id, display_name, tier, updated_at')
      .eq('broker_id', userId)
      .lt('updated_at', twoWeeksAgo)
      .order('updated_at', { ascending: true })
      .limit(5),
  ]);

  // ── 매칭 집계 ──────────────────────────────────────────────
  const grades = { S: 0, A: 0, B: 0, C: 0 };
  const topMatches: Array<{
    id: string; grade: string; score: number;
    building_id: string; buyer_intent_id: string;
  }> = [];

  for (const m of matchResults ?? []) {
    const g = m.grade as keyof typeof grades;
    if (g in grades) grades[g]++;
    if ((g === 'S' || g === 'A') && topMatches.length < 5) {
      topMatches.push(m);
    }
  }

  // ── 권역별 수요 신호 ──────────────────────────────────────
  const regionCounts: Record<string, number> = {};
  for (const bi of allBuyerIntents ?? []) {
    const regions = Array.isArray(bi.preferred_regions) ? bi.preferred_regions : [];
    for (const r of regions) {
      regionCounts[r as string] = (regionCounts[r as string] || 0) + 1;
    }
  }
  const demandSignals = Object.entries(regionCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([region, count]) => ({ region, count }));

  // ── 미연락 고객 ────────────────────────────────────────────
  const followUpClients = (staleClients ?? []).map((c) => ({
    id: c.id,
    display_name: c.display_name,
    tier: c.tier,
    days_since_contact: Math.floor(
      (now.getTime() - new Date(c.updated_at).getTime()) / (1000 * 60 * 60 * 24),
    ),
  }));

  // ── 응답 ──────────────────────────────────────────────────
  const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return NextResponse.json({
    data: {
      period: {
        start: periodStart.toISOString().slice(0, 10),
        end: now.toISOString().slice(0, 10),
      },
      thisWeek: {
        dealCards: weekDeals ?? 0,
        leaseCards: weekLeases ?? 0,
        buyerIntents: weekBuyers ?? 0,
        tenantIntents: weekTenants ?? 0,
      },
      totals: {
        buildings: totalBuildings ?? 0,
        leaseSpaces: totalLeases ?? 0,
        buyerIntents: totalBuyerIntents ?? 0,
        tenantIntents: totalTenantIntents ?? 0,
        clients: totalClients ?? 0,
      },
      matching: {
        sGrade: grades.S,
        aGrade: grades.A,
        bGrade: grades.B,
        total: (matchResults ?? []).length,
        topMatches,
      },
      demandSignals,
      followUpClients,
    },
  });
}
