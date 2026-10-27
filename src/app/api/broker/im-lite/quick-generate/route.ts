/**
 * @file src/app/api/broker/im-lite/quick-generate/route.ts
 * @description WP-P3-04: Quick-generate API endpoint creating building + v1 IM + Deal Card.
 *
 * Requirements:
 * 1. Minimal inputs: address, askingPriceManwon, rentRoll (optional title, pnu, posture).
 * 2. Idempotency support: respects Idempotency-Key header or idempotencyKey body field.
 * 3. Synthesizes canonical BasicImDocument via buildBasicImDocument().
 * 4. Auto-syncs 4-item Deal Card via Card4Schema.
 * 5. Returns { buildingId, documentId, docHash, card4, status: 'succeeded' }.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireBroker } from '@/lib/auth-guard';
import { extractPureBuildingFacts } from '@/domain/building/im-core/facts';
import { buildBasicImDocument } from '@/domain/building/im-core/basic-im-document';
import { Card4Schema, computeCard4Hash, type Card4Data } from '@/lib/deal-card/card4-schema';
import { formatPriceRange } from '@/lib/deal-card/price-band';
import { saveQuickImRecord } from '@/lib/im-lite/quick-generate-store';

// In-memory idempotency cache for quick-generate calls
const IDEMPOTENCY_CACHE = new Map<string, any>();

export async function POST(req: NextRequest) {
  // Verify broker authorization
  const auth = await requireBroker(req);
  if (auth.error) {
    return auth.error;
  }

  const idempotencyKey =
    req.headers.get('idempotency-key') ||
    req.headers.get('x-idempotency-key') ||
    null;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: '요청 본문이 올바른 JSON 형식이 아닙니다.' },
      { status: 400 }
    );
  }

  const effectiveIdempotencyKey = idempotencyKey || body.idempotencyKey;
  if (effectiveIdempotencyKey && IDEMPOTENCY_CACHE.has(effectiveIdempotencyKey)) {
    return NextResponse.json(IDEMPOTENCY_CACHE.get(effectiveIdempotencyKey), {
      status: 200,
      headers: { 'X-Cache-Lookup': 'HIT' },
    });
  }

  const {
    address,
    askingPriceManwon,
    rentRoll = [],
    title,
    buildingName,
    pnu,
    landAreaSqm,
    gfaSqm,
    zoning,
    completionDate,
    handoverNote,
  } = body;
  const posture = body.posture || body.investmentPosture || 'core_income';

  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    return NextResponse.json(
      { error: '주소를 입력해주세요.' },
      { status: 422 }
    );
  }

  const priceNum = Number(askingPriceManwon);
  if (isNaN(priceNum) || priceNum <= 0) {
    return NextResponse.json(
      { error: '유효한 매각 희망가를 입력해주세요 (0보다 커야 합니다).' },
      { status: 422 }
    );
  }

  // Derive region from address (e.g. "서울특별시 영등포구 양평동 11-47" -> "영등포구 양평동")
  const addrParts = address.trim().split(/\s+/);
  let derivedRegion = '수도권';
  if (addrParts.length >= 3) {
    derivedRegion = `${addrParts[1]} ${addrParts[2]}`;
  } else if (addrParts.length === 2) {
    derivedRegion = `${addrParts[0]} ${addrParts[1]}`;
  } else {
    derivedRegion = addrParts[0] || '서울 도심';
  }

  // Compute rent totals from rentRoll
  let totalDepositManwon = 0;
  let totalMonthlyRentManwon = 0;

  if (Array.isArray(rentRoll)) {
    for (const r of rentRoll) {
      if (r && r.status !== 'vacant') {
        totalDepositManwon += Number(r.depositManwon || r.deposit_manwon || r.deposit || 0);
        totalMonthlyRentManwon += Number(r.monthlyRentManwon || r.rent_manwon || r.monthlyRent || r.rent || 0);
      }
    }
  }

  // Generate deterministic/unique IDs
  const buildingId = crypto.randomUUID();
  const documentId = crypto.randomUUID();
  const resolvedTitle = title || buildingName || `${derivedRegion} 근생빌딩`;
  const effectiveMonthlyRentManwon = totalMonthlyRentManwon || Math.round(priceNum * 0.0035);
  const effectiveDepositManwon = totalDepositManwon || Math.round(priceNum * 0.05);
  const estimatedYieldPct = (
    ((effectiveMonthlyRentManwon * 12) / Math.max(1, priceNum - effectiveDepositManwon)) *
    100
  ).toFixed(2);

  const defaultPoints: [string, string, string] = [
    `${derivedRegion} 핵심 상권 역세권`,
    totalMonthlyRentManwon > 0
      ? `월 임대수익 ${totalMonthlyRentManwon.toLocaleString()}만원 만실 운용`
      : '우량 임차인 만실 안정권',
    `연 수익률 ${estimatedYieldPct}% 안정 배당`,
  ];

  // Extract pure building facts
  const rawFacts = {
    id: buildingId,
    title: resolvedTitle,
    building_name: resolvedTitle,
    address: address.trim(),
    pnu: pnu || undefined,
    posture,
    asking_price_manwon: priceNum,
    land_area_sqm: Number(landAreaSqm) || 280,
    gross_floor_area_sqm: Number(gfaSqm) || 850,
    total_gross_area_sqm: Number(gfaSqm) || 850,
    zoning: zoning || '제2종일반주거지역',
    completion_date: completionDate || undefined,
    monthly_rent_total_manwon: effectiveMonthlyRentManwon,
    deposit_total_manwon: effectiveDepositManwon,
    rent_roll: rentRoll,
    points: defaultPoints,
  };

  const facts = extractPureBuildingFacts(rawFacts);
  const basicImDoc = buildBasicImDocument(facts);

  // Auto-generate 4-item Deal Card
  const priceBand = formatPriceRange(priceNum * 10000);
  const points: [string, string, string] = [
    defaultPoints[0],
    defaultPoints[1],
    `연 수익률 ${basicImDoc.facts.valuation.grossYieldPct.toFixed(2)}% 안정 배당`,
  ];

  const card4Draft = {
    region: derivedRegion.slice(0, 14),
    use: '근린생활시설',
    priceBand,
    points,
    provenance: {
      points: ['public', 'broker', 'ai'] as const,
    },
    card4_version: 1,
  };

  const card4_hash = computeCard4Hash(card4Draft);
  const card4: Card4Data = Card4Schema.parse({
    ...card4Draft,
    card4_hash,
  });

  const nowIso = new Date().toISOString();
  saveQuickImRecord({
    buildingId,
    documentId,
    ownerId: auth.user?.id,
    address: address.trim(),
    buildingName: resolvedTitle,
    askingPriceManwon: priceNum,
    posture,
    card4,
    basicImDoc,
    rentRoll: Array.isArray(rentRoll) ? rentRoll : [],
    specs: {
      gfaSqm: Number(gfaSqm) || 850,
      landAreaSqm: Number(landAreaSqm) || 280,
      zoning: zoning || '제2종일반주거지역',
      completionDate: completionDate || undefined,
      handoverNote: handoverNote || undefined,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  // Best-effort persistence into Supabase
  try {
    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = createServiceClient();
    if (supabase && typeof supabase.from === 'function') {
      await supabase.from('building_ssot_lite').insert({
        id: buildingId,
        owner_id: auth.user?.id || '00000000-0000-0000-0000-000000000000',
        address: address.trim(),
        name: resolvedTitle,
        area_signal: card4.region,
        asset_type: card4.use,
        price_band: card4.priceBand,
        asking_price_manwon: priceNum,
        status: 'public_signal_ready',
      });
      await supabase.from('document_objects').insert({
        id: documentId,
        building_id: buildingId,
        owner_id: auth.user?.id || '00000000-0000-0000-0000-000000000000',
        broker_id: auth.user?.id || '00000000-0000-0000-0000-000000000000',
        document_type: 'im_lite',
        status: 'published',
        title: resolvedTitle,
        body: {
          schemaVersion: '3.0',
          basicImDocument: basicImDoc,
          card4,
          rent_roll: rentRoll,
        },
      });
    }
  } catch {
    // Ignore errors in offline or unmigrated environments
  }

  const responsePayload = {
    success: true,
    buildingId,
    documentId,
    docHash: basicImDoc.docHash,
    card4,
    basicImDocument: basicImDoc,
    status: 'succeeded',
    created_at: nowIso,
  };

  if (effectiveIdempotencyKey) {
    IDEMPOTENCY_CACHE.set(effectiveIdempotencyKey, responsePayload);
  }

  return NextResponse.json(responsePayload, { status: 201 });
}
