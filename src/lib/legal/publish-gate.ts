import {
  sanitizeStatutoryField,
  validateBrokerStatutoryFields,
  type BrokerStatutoryInput,
} from './broker-statutory-disclosure';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = { from: (table: string) => any };

export type PublishAssetKind = 'dealcard' | 'im' | 'magazine';

export interface PublishGateFailure {
  ok: false;
  status: 422;
  code: 'STATUTORY_DISCLOSURE_INCOMPLETE';
  missingFields: string[];
  missingLabels: string[];
  message: string;
}

export interface PublishGateSuccess {
  ok: true;
  statutory: {
    company: string;
    officeAddress: string;
    phone: string;
    officeRegNumber: string;
    representativeName: string;
  };
}

export type PublishGateResult = PublishGateSuccess | PublishGateFailure;

function firstNonEmpty(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function hasPositiveNumber(...values: unknown[]): boolean {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return true;
    if (typeof v === 'string') {
      const cleaned = Number(v.replace(/[,억원\s]/g, ''));
      if (Number.isFinite(cleaned) && cleaned > 0) return true;
    }
  }
  return false;
}

function collectImCoreMissing(payload: Record<string, unknown>): {
  missingFields: string[];
  missingLabels: string[];
} {
  const ssot =
    payload.ssot_summary && typeof payload.ssot_summary === 'object'
      ? (payload.ssot_summary as Record<string, unknown>)
      : {};

  const missingFields: string[] = [];
  const missingLabels: string[] = [];

  // 1. 소재지 / 권역
  if (!firstNonEmpty(payload.address, payload.region, ssot.address)) {
    missingFields.push('im.address');
    missingLabels.push('매물 소재지(권역)');
  }
  // 2. 면적 (연면적 또는 토지면적)
  if (
    !hasPositiveNumber(
      payload.gfaSqm,
      payload.gfaPyung,
      payload.landAreaSqm,
      payload.landAreaPyung,
      payload.area,
      ssot.total_gross_area_sqm,
      ssot.land_area_sqm,
    )
  ) {
    missingFields.push('im.area');
    missingLabels.push('건물·대지 면적');
  }
  // 3. 거래예정가격 / 매각가
  if (
    !hasPositiveNumber(
      payload.askingPriceManwon,
      payload.priceBand,
      ssot.asking_price_manwon,
    ) &&
    !firstNonEmpty(payload.priceBand)
  ) {
    missingFields.push('im.askingPriceManwon');
    missingLabels.push('매각 예정가격(가격대)');
  }
  // 4. 용도지역 또는 주용도
  if (
    !firstNonEmpty(
      payload.zoning,
      payload.mainPurpose,
      payload.use,
      ssot.zoning,
      ssot.main_usage,
    )
  ) {
    missingFields.push('im.usage');
    missingLabels.push('건축물 용도(용도지역)');
  }
  // 5. 준공연도 또는 층수 규모
  if (
    !firstNonEmpty(payload.completionDate, ssot.completion_date) &&
    !hasPositiveNumber(payload.floorsAbove, ssot.floors_above, payload.floorsBelow, ssot.floors_below)
  ) {
    missingFields.push('im.buildingScale');
    missingLabels.push('층수 또는 사용승인일');
  }

  return { missingFields, missingLabels };
}

async function fetchBrokerStatutoryRow(
  supabase: DbClient | null | undefined,
  userId: string,
): Promise<BrokerStatutoryInput> {
  if (!supabase || typeof supabase.from !== 'function' || !userId || !userId.trim()) {
    return {};
  }

  let profileRow: Record<string, unknown> = {};
  let brokerRow: Record<string, unknown> = {};

  try {
    const pfQ = supabase
      .from('profiles')
      .select('display_name, company, phone')
      .eq('id', userId);
    const pfRes = typeof pfQ?.maybeSingle === 'function' ? await pfQ.maybeSingle() : await pfQ;
    if (pfRes?.data && typeof pfRes.data === 'object') {
      profileRow = pfRes.data as Record<string, unknown>;
    }
  } catch {
    // non-blocking lookup
  }

  try {
    const bpQ = supabase
      .from('broker_profiles')
      .select('office_address, office_reg_number, representative_name, card_name')
      .eq('user_id', userId);
    let bpRes = typeof bpQ?.maybeSingle === 'function' ? await bpQ.maybeSingle() : await bpQ;
    if (bpRes?.error && (bpRes.error.code === '42703' || bpRes.error.code === 'PGRST204')) {
      const fbQ = supabase
        .from('broker_profiles')
        .select('office_reg_number, card_name')
        .eq('user_id', userId);
      bpRes = typeof fbQ?.maybeSingle === 'function' ? await fbQ.maybeSingle() : await fbQ;
      if (bpRes?.error && (bpRes.error.code === '42703' || bpRes.error.code === 'PGRST204')) {
        const fbMinQ = supabase
          .from('broker_profiles')
          .select('office_reg_number')
          .eq('user_id', userId);
        bpRes = typeof fbMinQ?.maybeSingle === 'function' ? await fbMinQ.maybeSingle() : await fbMinQ;
      }
    }
    if (bpRes?.data && typeof bpRes.data === 'object') {
      brokerRow = bpRes.data as Record<string, unknown>;
    }
  } catch {
    // non-blocking lookup
  }

  return {
    company: firstNonEmpty(profileRow.company, brokerRow.company, brokerRow.office_name),
    office_name: firstNonEmpty(brokerRow.office_name),
    office_address: firstNonEmpty(brokerRow.office_address, profileRow.office_address),
    phone: firstNonEmpty(profileRow.phone, brokerRow.phone),
    office_reg_number: firstNonEmpty(brokerRow.office_reg_number, brokerRow.registration_no),
    registration_no: firstNonEmpty(brokerRow.registration_no),
    representative_name: firstNonEmpty(
      brokerRow.representative_name,
      profileRow.display_name,
      brokerRow.card_name,
      brokerRow.display_name,
    ),
    display_name: firstNonEmpty(profileRow.display_name, brokerRow.card_name, brokerRow.display_name),
  };
}

/**
 * 공인중개사법 표시·광고 의무 발행 게이트 (WP 2-C).
 * - 모든 공개 발행/발송 시 중개사무소 명칭·소재지·연락처·등록번호·대표자 성명 5대 법정 항목을 강제 검증한다.
 * - IM 발행 시 매물 핵심 5항목(소재지·면적·가격·용도·층수/사용승인일)도 함께 검증한다.
 */
export async function assertPublishable(input: {
  supabase: DbClient | null | undefined;
  userId: string;
  kind: PublishAssetKind;
  itemPayload?: Record<string, unknown> | null;
  brokerMetaOverride?: BrokerStatutoryInput | null;
}): Promise<PublishGateResult> {
  const hasRealDbClient = Boolean(input.supabase && typeof input.supabase.from === 'function');
  const dbRow = await fetchBrokerStatutoryRow(input.supabase, input.userId);
  // Real DB requests never accept request-body statutory overrides; unit tests without a DB client may pass brokerMetaOverride.
  const override = hasRealDbClient ? {} : (input.brokerMetaOverride ?? {});
  const merged: BrokerStatutoryInput = {
    company: firstNonEmpty(dbRow.company, override.company, override.officeName, override.office_name),
    office_address: firstNonEmpty(dbRow.office_address, override.office_address, override.officeAddress),
    phone: firstNonEmpty(dbRow.phone, override.phone),
    office_reg_number: firstNonEmpty(
      dbRow.office_reg_number,
      dbRow.registration_no,
      override.office_reg_number,
      override.officeRegNumber,
      override.registration_no,
      override.registrationNo,
    ),
    representative_name: firstNonEmpty(
      dbRow.representative_name,
      dbRow.display_name,
      override.representative_name,
      override.representativeName,
      override.display_name,
      override.displayName,
    ),
    display_name: firstNonEmpty(dbRow.display_name, override.display_name, override.displayName),
  };

  const validation = validateBrokerStatutoryFields(merged);
  const missingFields: string[] = [...validation.completeness.missingFields];
  const missingLabels: string[] = [...validation.completeness.missingLabels];

  if (!validation.ok && validation.field && !missingFields.includes(validation.field)) {
    missingFields.push(validation.field);
    missingLabels.push('유효한 중개사무소 개설등록번호');
  }

  if (input.kind === 'im' && input.itemPayload && typeof input.itemPayload === 'object') {
    const imMissing = collectImCoreMissing(input.itemPayload);
    missingFields.push(...imMissing.missingFields);
    missingLabels.push(...imMissing.missingLabels);
  }

  if (!validation.ok || missingFields.length > 0) {
    const labelSummary = missingLabels.join(', ');
    return {
      ok: false,
      status: 422,
      code: 'STATUTORY_DISCLOSURE_INCOMPLETE',
      missingFields,
      missingLabels,
      message: !validation.ok && validation.completeness.isComplete
        ? validation.message
        : `공인중개사법 표시·광고 의무 항목(${labelSummary})이 누락되어 발행할 수 없습니다. 프로필 설정에서 중개사무소 개설등록번호 등 필수 법정 정보를 입력해 주세요.`,
    };
  }

  return {
    ok: true,
    statutory: {
      company: sanitizeStatutoryField(merged.company, 'officeName') || '',
      officeAddress: sanitizeStatutoryField(merged.office_address, 'address') || '',
      phone: sanitizeStatutoryField(merged.phone, 'phone') || '',
      officeRegNumber: sanitizeStatutoryField(merged.office_reg_number, 'regNo') || '',
      representativeName: sanitizeStatutoryField(merged.representative_name, 'name') || '',
    },
  };
}
