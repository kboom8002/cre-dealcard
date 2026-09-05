/**
 * POST /api/im/validate
 * 
 * IM 생성 전 사전 검증: 포스처별 필수 입력값 검증, 예상 Data Grade 산출
 * 프론트엔드에서 폼 제출 전에 호출하여 인라인 에러 표시에 사용
 */
import { NextRequest, NextResponse } from 'next/server';
import { hasMinimumBasicData, computeDataQualityBadge, tierToGrade } from '@/domain/building/mobile-im/data-quality-badge';
import type { InvestmentPosture } from '@/domain/ontology';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const posture = (body.investment_posture || 'income') as InvestmentPosture;
    const tier = body.tier || 'basic';

    // 1. 포스처별 필수값 검증
    const hasBasicData = hasMinimumBasicData({
      hasAskingPrice: !!body.asking_price_manwon && Number(body.asking_price_manwon) > 0,
      hasMonthlyRent: !!body.monthly_rent_total_krw && Number(body.monthly_rent_total_krw) > 0,
      hasAddress: !!body.resolved_address || !!body.resolved_pnu,
      hasPublicData: !!body.resolved_pnu,
      hasMonthlyRevenue: !!body.monthly_revenue_manwon && Number(body.monthly_revenue_manwon) > 0,
    }, posture);

    // 2. Data Grade 예상 산출
    const badge = computeDataQualityBadge({
      hasAddress: !!body.resolved_address || !!body.resolved_pnu,
      hasPublicData: !!body.resolved_pnu,
      hasMonthlyRent: !!body.monthly_rent_total_krw && Number(body.monthly_rent_total_krw) > 0,
      hasVacancy: body.vacancy_status !== undefined && body.vacancy_status !== null,
      hasPhotos: !!body.photo_urls?.length || !!body.photos_v2?.length,
      hasAskingPrice: !!body.asking_price_manwon && Number(body.asking_price_manwon) > 0,
      hasLoanAmount: !!body.loan_amount_manwon && Number(body.loan_amount_manwon) > 0,
      hasFloorLeases: !!body.floor_leases?.length,
      hasLandArea: !!body.land_area_sqm && Number(body.land_area_sqm) > 0,
      hasZoning: !!body.zoning,
      hasTotalGrossArea: !!body.total_gross_area_sqm && Number(body.total_gross_area_sqm) > 0,
      hasMonthlyRevenue: !!body.monthly_revenue_manwon && Number(body.monthly_revenue_manwon) > 0,
    }, posture);

    const grade = tierToGrade(badge.tier);
    const isProEligible = grade === 'A';

    // 3. 누락 항목 상세 메시지
    const errors: string[] = [];
    const warnings: string[] = [];

    // income 포스처에서는 매각 희망가가 필수
    const hasAskingPrice = !!body.asking_price_manwon && Number(body.asking_price_manwon) > 0;
    if (posture === 'income' && !hasAskingPrice) {
      errors.push('매각 희망가를 입력해 주세요.');
    }

    if (!hasBasicData) {
      switch (posture) {
        case 'income':
          if (!hasAskingPrice && !errors.includes('매각 희망가를 입력해 주세요.')) {
            errors.push('매각 희망가를 입력해 주세요.');
          }
          if (!body.monthly_rent_total_krw) errors.push('월 임대료를 입력해 주세요.');
          break;
        case 'development':
          if (!body.resolved_address && !body.resolved_pnu) errors.push('주소 또는 PNU를 입력해 주세요.');
          break;
        case 'owner_occupied':
          if (!body.asking_price_manwon) errors.push('매각 희망가를 입력해 주세요.');
          break;
        case 'operating':
          if (!body.asking_price_manwon && !body.monthly_rent_total_krw && !body.monthly_revenue_manwon) {
            errors.push('매각 희망가, 월 임대료, 또는 월 매출 중 하나를 입력해 주세요.');
          }
          break;
        case 'trading':
          if (!body.asking_price_manwon) errors.push('매각 희망가를 입력해 주세요.');
          break;
      }
    }

    if (tier === 'pro' && !isProEligible) {
      errors.push(`현재 ${grade}등급: Pro IM은 A등급 이상의 데이터가 필요합니다.`);
    }

    // 누락 항목 상세 안내
    for (const missing of badge.missingItems) {
      warnings.push(missing);
    }

    return NextResponse.json({
      canGenerate: hasBasicData && errors.length === 0 && (tier !== 'pro' || isProEligible),
      grade,
      gradeLabel: badge.label,
      score: badge.score,
      missingItems: badge.missingItems,
      errors,
      warnings,
      isProEligible,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Validation failed', canGenerate: false },
      { status: 400 },
    );
  }
}
