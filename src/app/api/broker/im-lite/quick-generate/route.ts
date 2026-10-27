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
    pnu,
    landAreaSqm,
    gfaSqm,
    posture = 'core_income',
  } = body;

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
        totalDepositManwon += Number(r.depositManwon || r.deposit || 0);
        totalMonthlyRentManwon += Number(r.monthlyRentManwon || r.monthlyRent || r.rent || 0);
      }
    }
  }

  // Generate deterministic/unique IDs
  const buildingId = crypto.randomUUID();
  const documentId = crypto.randomUUID();

  // Extract pure building facts
  const rawFacts = {
    title: title || `${derivedRegion} 근생빌딩`,
    address: address.trim(),
    posture,
    asking_price_manwon: priceNum,
    land_area_sqm: Number(landAreaSqm) || 330.5,
    total_gross_area_sqm: Number(gfaSqm) || 990.0,
    monthly_rent_total_manwon: totalMonthlyRentManwon || Math.round(priceNum * 0.0035 / 12),
    deposit_total_manwon: totalDepositManwon || Math.round(priceNum * 0.05),
  };

  const facts = extractPureBuildingFacts(rawFacts);
  const basicImDoc = buildBasicImDocument(facts);

  // Auto-generate 4-item Deal Card
  const priceBand = formatPriceRange(priceNum * 10000);
  const points: [string, string, string] = [
    `${derivedRegion} 핵심 상권 역세권`,
    totalMonthlyRentManwon > 0
      ? `월 임대수익 ${totalMonthlyRentManwon.toLocaleString()}만원 만실 운용`
      : '우량 임차인 만실 안정권',
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

  const responsePayload = {
    success: true,
    buildingId,
    documentId,
    docHash: basicImDoc.docHash,
    card4,
    basicImDocument: basicImDoc,
    status: 'succeeded',
    created_at: new Date().toISOString(),
  };

  if (effectiveIdempotencyKey) {
    IDEMPOTENCY_CACHE.set(effectiveIdempotencyKey, responsePayload);
  }

  return NextResponse.json(responsePayload, { status: 201 });
}
