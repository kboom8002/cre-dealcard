/**
 * @file location-facts-builder.ts
 * @description R5: Basic IM 입지 및 교통 슬라이드(Slide 3) 우측 팩트 테이블 + 입지 요약 콜아웃 자동 합성기
 *
 * 중개인 수기 텍스트(`broker_extras.location_note`)에 의존하지 않고,
 * 카카오 로컬 POI / 랜드마크 후보 풀 / V-World 토지특성·건축물대장 원천 데이터로부터
 * 5행 구조화 테이블(소재지 · 대중교통 · 도로·접근성 · 배후·상권 · 주요시설)과
 * 하단 `입지 요약` 콜아웃을 결정론적으로 생성합니다.
 */

import {
  mergeSubwayLinesFromSpots,
  walkMinutesOf,
  type MergedSubwayStation,
} from './location-poi-selector';

export interface BuildBasicLocationRightParams {
  ssot?: any;
  building?: any;
  externalPoi?: any;
  landmarkPool?: any;
  landUsePlan?: any;
  buildingRegister?: any;
  locationFacts?: any;
  apartmentHouseholds?: {
    totalHouseholds?: number;
    complexCount?: number;
    topComplexes?: Array<{ name: string; households: number; distanceM?: number }>;
  } | null;
  brokerExtras?: any;
  twoLineAddress?: string;
  existingRight?: any;
}

export interface BasicLocationRightResult {
  sub: string;
  rows: Array<[string, string]>;
  callout?: {
    kind: 'info';
    title: string;
    body: string;
  };
  source: string;
  warnings: string[];
  mergedStations: MergedSubwayStation[];
}

function cleanRoadNameFromAddress(address?: string | null): string | null {
  const raw = String(address || '').trim();
  if (!raw) return null;
  const firstLine = raw.split('\n')[0] || raw;
  const match = firstLine.match(/([가-힣0-9]+(?:대로|로|길))(?=\s|$|\d|,|\))/);
  return match ? match[1] : null;
}

const MAJOR_ARTERIAL_ROADS = [
  '올림픽대로',
  '국회대로',
  '강변북로',
  '서부간선도로',
  '동부간선도로',
  '내부순환로',
  '남부순환로',
  '북부간선도로',
  '경부고속도로',
  '수도권제1순환고속도로',
  '노들로',
  '경인로',
  '공항대로',
  '강남대로',
  '테헤란로',
  '영동대로',
  '도산대로',
  '논현로',
  '언주로',
  '봉은사로',
  '송파대로',
  '천호대로',
  '동작대로',
  '반포대로',
  '서초대로',
  '한강대로',
  '마포대로',
  '양화로',
  '여의대로',
  '시흥대로',
  '양화대교',
  '성산대교',
  '서강대교',
  '마포대교',
  '한남대교',
  '성수대교',
  '영동대교',
  '잠실대교',
];

function extractArterialRoads(
  frontingRoadName: string | null,
  brokerNote?: string | null,
  spots: any[] = [],
): string[] {
  const textPool = [
    String(brokerNote || ''),
    ...spots
      .filter((s) => s && Number(s.distanceM) > 0 && Number(s.distanceM) <= 1500)
      .map((s) => String(s.name || '')),
  ].join(' ');

  const found: string[] = [];
  for (const road of MAJOR_ARTERIAL_ROADS) {
    if (frontingRoadName && road === frontingRoadName) continue;
    if (textPool.includes(road) && !found.includes(road)) {
      found.push(road);
      if (found.length >= 2) break;
    }
  }
  return found;
}

function formatRoadAccessRow(
  address?: string | null,
  roadSideRaw?: string | null,
  spots: any[] = [],
  brokerNote?: string | null,
): { rowText: string; roadSummaryShort: string; icSpotName?: string; arterialSummary?: string } {
  const roadName = cleanRoadNameFromAddress(address);
  const roadSide =
    roadSideRaw &&
    !['-', '지정되지않음', '미지정', '확인 필요', 'N/A'].includes(String(roadSideRaw).trim())
      ? String(roadSideRaw).trim()
      : null;

  let roadPart = '';
  let roadSummaryShort = '';

  if (roadName && roadSide) {
    if (/^(광대|중로)/.test(roadSide)) {
      roadPart = `${roadName}(대로변·${roadSide}) 접면`;
      roadSummaryShort = `${roadName}(대로변·${roadSide})`;
    } else if (/^(소로|세로)/.test(roadSide)) {
      roadPart = `${roadName}(이면·${roadSide}) 접면`;
      roadSummaryShort = `${roadName}(${roadSide})`;
    } else {
      roadPart = `${roadName}(${roadSide}) 접면`;
      roadSummaryShort = `${roadName}(${roadSide})`;
    }
  } else if (roadName) {
    const kind = roadName.endsWith('대로')
      ? '광역대로'
      : roadName.endsWith('로')
        ? '간선도로'
        : '생활도로';
    roadPart = `${roadName}(${kind}) 접면`;
    roadSummaryShort = roadName;
  } else if (roadSide) {
    const prefix = /^(광대|중로)/.test(roadSide) ? '대로변' : '도로';
    roadPart = `${prefix}(${roadSide}) 접면`;
    roadSummaryShort = `${prefix}(${roadSide})`;
  }

  // 최근접 IC / JC / 나들목 탐색 (보행 진출입로·고가차도진입로·주차장 제외)
  const icCandidates = spots
    .filter((s) => {
      if (!s || typeof s !== 'object') return false;
      const name = String(s.name || '').trim();
      const cn = String(s.categoryName || '');
      const cat = String(s.category || '');
      const dist = Number(s.distanceM);
      if (!Number.isFinite(dist) || dist <= 0 || dist > 3000) return false;
      if (
        /(진출입로|진입로|진출로|출입구|고가차도|지하차도|터널|교차로|사거리|삼거리|오거리|로터리|육교|계단|주차장|공원|휴게소|주유소|충전소)/.test(
          name,
        )
      ) {
        return false;
      }
      return (
        cat === 'road' ||
        /도로시설/.test(cn) ||
        /(IC|JC|나들목|톨게이트|분기점)$/.test(name)
      );
    })
    .sort((a, b) => Number(a.distanceM) - Number(b.distanceM));

  let icPart = '';
  let icSpotName: string | undefined;
  if (icCandidates.length > 0) {
    const ic = icCandidates[0];
    const dist = Math.round(Number(ic.distanceM));
    icSpotName = String(ic.name).trim();
    const distStr =
      dist >= 500 ? `약 ${(dist / 1000).toFixed(1)}km` : `약 ${dist}m`;
    icPart = `${icSpotName} ${distStr}`;
  }

  const arterials = extractArterialRoads(roadName, brokerNote, spots);
  const arterialSummary =
    arterials.length > 0 ? `${arterials.join('·')} 진입 용이` : undefined;

  const rowText = [roadPart, arterialSummary, icPart].filter(Boolean).join(' · ');
  return { rowText, roadSummaryShort, icSpotName, arterialSummary };
}

function extractApartmentComplexNames(spots: any[]): string[] {
  const APT_BRAND_RE =
    /(아파트|래미안|아이파크|IPARK|자이|푸르지오|아크로|힐스테이트|롯데캐슬|더샵|e편한세상|더힐|센트레빌|위브|스위첸|해모로|데시앙|벽산블루밍|한양수자인|호반써밋|꿈에그린|포레나)/i;
  const APT_NOISE_RE =
    /(상가|유치원|어린이집|노인정|경로당|관리사무소|관리실|주차장|정문|후문|북문|남문|동문|서문|입구|출입구|공인중개|부동산|세탁|택배|경비실|상점가|마트|약국|의원|치과|한의원|학원|교습소|빌라|오피스텔)/;

  const sorted = spots
    .filter((s) => {
      if (!s || typeof s !== 'object') return false;
      const dist = Number(s.distanceM);
      return Number.isFinite(dist) && dist > 0 && dist <= 1000;
    })
    .sort((a, b) => Number(a.distanceM) - Number(b.distanceM));

  const result: string[] = [];
  const seen = new Set<string>();

  for (const s of sorted) {
    const rawName = String(s.name || '').trim();
    if (!rawName || !APT_BRAND_RE.test(rawName)) continue;

    // "당산삼성래미안4차아파트 425동" → "당산삼성래미안4차"
    let cleaned = rawName
      .replace(/\s+\d+동.*$/, '')
      .replace(/\s+[A-Z]동.*$/i, '')
      .replace(/\s*(정문|후문|입구|상가동|상가|관리동)$/, '')
      .trim();

    if (!cleaned || APT_NOISE_RE.test(cleaned)) continue;

    // 너무 일반적인 이름("현대아파트", "삼성아파트" 등 4자 이하)보다는 고유 단지명 선호, 단 아파트 접미사는 간결화
    const display =
      cleaned.length > 6 && cleaned.endsWith('아파트')
        ? cleaned.replace(/아파트$/, '')
        : cleaned;

    const normKey = display.replace(/\s+/g, '');
    if (!normKey || seen.has(normKey)) continue;
    seen.add(normKey);
    result.push(display);
    if (result.length >= 2) break;
  }

  return result;
}

function selectMajorFacilityLabels(spots: any[]): string[] {
  const FACILITY_NOISE_RE =
    /(주차장|출입구|진출입로|입구|출구|모텔|오피스텔|빌라|아파트|래미안|아이파크|자이|푸르지오|힐스테이트|롯데캐슬|인터넷쇼핑몰|통신판매|중고차|밧데리|배터리|타이어|카센터|공업사|정비|세차|철물|건재|열쇠|축산|편의점|약국|의원|치과|한의원|내과|피부과|안과|소아과|성형외과|클리닉|동물병원|노인정|경로당|어린이집|유치원|공인중개|부동산|세탁|카페|커피|스타벅스|투썸|이디야|메가MGC|음식점|식당|베이커리|주유소|충전소|우체통|ATM|무인)/i;

  const candidates = spots.filter((s) => {
    if (!s || typeof s !== 'object') return false;
    const name = String(s.name || '').trim();
    const cn = String(s.categoryName || '');
    const cat = String(s.category || '').toLowerCase();
    const dist = Number(s.distanceM);
    if (!name || !Number.isFinite(dist) || dist <= 15 || dist > 1500) return false;
    if (cat === 'subway' || /지하철,전철/.test(cn)) return false;
    if (cat === 'road' || /도로시설/.test(cn) || /(IC|JC|나들목|톨게이트)$/.test(name)) return false;
    if (FACILITY_NOISE_RE.test(name) || /(음식점|카페|통신판매|인터넷쇼핑몰|중개|주거시설|자동차)/.test(cn)) {
      return false;
    }
    return true;
  });

  function facilityPriority(s: any): number {
    const name = String(s.name || '').trim();
    const cn = String(s.categoryName || '');
    const cat = String(s.category || '').toLowerCase();
    if (
      /(백화점|롯데마트|이마트(?!24|에브리데이)|홈플러스(?!익스프레스)|코스트코|타임스퀘어|스타필드|롯데아울렛|현대아울렛|신세계아울렛|프리미엄아울렛|패션아울렛|뉴코아아울렛|마리오아울렛|모다아울렛|W몰|대형마트)/.test(
        name,
      ) ||
      /(백화점|대형마트|복합쇼핑몰)/.test(cn)
    ) {
      return 100;
    }
    if (
      /(구청|시청|군청|도청|법원|검찰청|세무서|경찰서|우체국|국회의사당)/.test(name) &&
      !/(민원실|별관|부속|파출소|지구대)/.test(name)
    ) {
      return 90;
    }
    if (/(종합병원|대학병원|성모병원|세브란스|아산병원|삼성서울병원|의료원)/.test(name)) {
      return 85;
    }
    if (/(한강공원|선유도공원|생태공원|시민공원|숲공원|여의도공원)/.test(name)) {
      return 80;
    }
    if (cat === 'shopping' || cat === 'public' || cat === 'hospital') {
      return 60;
    }
    return 40;
  }

  candidates.sort((a, b) => {
    const pa = facilityPriority(a);
    const pb = facilityPriority(b);
    if (pa !== pb) return pb - pa;
    return Number(a.distanceM) - Number(b.distanceM);
  });

  const picked: string[] = [];
  const seenFamily = new Set<string>();

  for (const c of candidates) {
    const name = String(c.name || '').trim();
    const familyKey = name.split(/\s+/)[0].slice(0, 5);
    if (seenFamily.has(familyKey)) continue;
    seenFamily.add(familyKey);

    const dist = Math.round(Number(c.distanceM));
    const walkMin = walkMinutesOf(dist);
    const label =
      dist <= 1200
        ? `${name} 도보 ${walkMin}분 (약 ${dist}m)`
        : `${name} (약 ${(dist / 1000).toFixed(1)}km)`;
    picked.push(label);
    if (picked.length >= 2) break;
  }

  return picked;
}

/**
 * Basic IM Slide 3 (입지 및 교통) 우측 테이블 행과 하단 입지 요약 콜아웃을 생성합니다.
 */
export function buildBasicLocationRightData(
  params: BuildBasicLocationRightParams,
): BasicLocationRightResult {
  const {
    ssot = {},
    building = {},
    externalPoi = {},
    landmarkPool = null,
    landUsePlan = null,
    buildingRegister = null,
    locationFacts = null,
    apartmentHouseholds = null,
    brokerExtras = null,
    twoLineAddress,
  } = params;

  const warnings: string[] = [];
  const rawBrokerNote = String(brokerExtras?.location_note || '').trim();

  const keySpots: any[] = Array.isArray(externalPoi?.keySpots) ? externalPoi.keySpots : [];
  const candidateSpots: any[] = Array.isArray(externalPoi?.candidateSpots)
    ? externalPoi.candidateSpots
    : [];
  const poolCandidates: any[] = Array.isArray(landmarkPool?.candidates)
    ? landmarkPool.candidates
    : [];
  const allSpots = [...keySpots, ...candidateSpots, ...poolCandidates];

  // 1) 소재지
  const roadAddress = String(ssot?.address || building?.address || '').trim();
  const jibunAddress = String(
    landUsePlan?.jibunAddress ||
      buildingRegister?.platPlc ||
      ssot?.jibun_address ||
      building?.jibun_address ||
      '',
  ).trim();

  let locationVal = '';
  if (twoLineAddress && twoLineAddress.trim()) {
    locationVal = twoLineAddress.trim();
  } else if (roadAddress && jibunAddress && roadAddress !== jibunAddress) {
    const shortJibun = jibunAddress.replace(/^(서울특별시|서울|경기도|인천광역시|부산광역시)\s+\S+[구군시]\s+/, '');
    locationVal = `${roadAddress} (${shortJibun})`;
  } else {
    locationVal = roadAddress || jibunAddress;
  }

  // 2) 대중교통 (다중 호선 병합)
  const mergedStations = mergeSubwayLinesFromSpots(
    externalPoi?.nearestStation,
    keySpots,
    candidateSpots,
    poolCandidates,
  );

  let transitVal = '';
  if (mergedStations.length > 0) {
    const primary = mergedStations[0];
    const parts = [primary.formattedLabel];
    if (mergedStations.length >= 2) {
      const secondary = mergedStations[1];
      if (secondary.distanceM > 0 && secondary.distanceM <= 1200) {
        parts.push(secondary.formattedLabel);
      }
    }
    transitVal = parts.join(' · ');
  }

  // 3) 도로·접근성
  const roadSideRaw =
    landUsePlan?.roadAccess ||
    ssot?.road_condition ||
    building?.road_condition ||
    null;
  const {
    rowText: roadAccessVal,
    roadSummaryShort,
    icSpotName,
    arterialSummary,
  } = formatRoadAccessRow(
    roadAddress || twoLineAddress,
    roadSideRaw,
    allSpots,
    rawBrokerNote,
  );

  // 4) 배후·상권 (모호한 "${area} 주요 상업·업무 권역" 문구 절대 금지)
  const catchmentParts: string[] = [];
  const rawPoiApt = externalPoi?.apartmentHouseholds;
  const aptHouseholds = Number(
    locationFacts?.apartments?.households ??
      apartmentHouseholds?.totalHouseholds ??
      (typeof rawPoiApt === 'number' ? rawPoiApt : rawPoiApt?.totalHouseholds) ??
      0,
  );
  const aptComplexes = Number(
    locationFacts?.apartments?.complexes ??
      apartmentHouseholds?.complexCount ??
      externalPoi?.apartmentComplexCount ??
      (typeof rawPoiApt === 'object' ? rawPoiApt?.complexCount : 0) ??
      0,
  );
  const topComplexes: Array<{ name: string; households: number }> = Array.isArray(
    apartmentHouseholds?.topComplexes,
  )
    ? apartmentHouseholds.topComplexes
    : Array.isArray(externalPoi?.apartmentTopComplexes)
      ? externalPoi.apartmentTopComplexes
      : Array.isArray(locationFacts?.apartments?.topComplexes)
        ? locationFacts.apartments.topComplexes
        : [];
  const aptNames = extractApartmentComplexNames(allSpots);

  const leadComplex = topComplexes.find(
    (c) => c && c.name && !c.name.endsWith('공동주택') && Number(c.households) > 0,
  );
  const leadComplexLabel = leadComplex
    ? `${leadComplex.name.replace(/\s+/g, '')}(${Number(leadComplex.households).toLocaleString('ko-KR')}세대)`
    : '';

  if (aptHouseholds > 0) {
    const complexTag = aptComplexes > 0 ? ` (${aptComplexes}개 단지)` : '';
    const leadPrefix = leadComplexLabel ? `${leadComplexLabel} 등 ` : '';
    catchmentParts.push(
      `${leadPrefix}반경 1km 아파트 ${aptHouseholds.toLocaleString('ko-KR')}세대${complexTag}`,
    );
  } else if (aptNames.length > 0) {
    catchmentParts.push(`${aptNames.join('·')} 등 주거단지 인접`);
  }

  const poiCounts = externalPoi?.poiCounts || {};
  const foodCount = Number(poiCounts.restaurant ?? poiCounts.food ?? 0);
  const cafeCount = Number(poiCounts.cafe ?? 0);
  const convCount = Number(poiCounts.convenience ?? 0);

  if (foodCount > 0 || cafeCount > 0) {
    const countTokens: string[] = [];
    if (foodCount > 0) countTokens.push(`음식점 ${foodCount.toLocaleString('ko-KR')}`);
    if (cafeCount > 0) countTokens.push(`카페 ${cafeCount.toLocaleString('ko-KR')}곳`);
    else if (convCount > 0) countTokens.push(`편의점 ${convCount.toLocaleString('ko-KR')}곳`);
    const joinedCounts = countTokens.join('·').replace(/곳$/, '') + '곳';
    catchmentParts.push(`반경 500m ${joinedCounts}`);
  }

  const catchmentVal = catchmentParts.join(' · ');

  // 5) 주요시설
  const facilityLabels = selectMajorFacilityLabels(allSpots);
  const majorFacilityVal = facilityLabels.join(' · ');

  const rows: Array<[string, string]> = [];
  if (locationVal) rows.push(['소재지', locationVal]);
  if (transitVal) rows.push(['대중교통', transitVal]);
  if (roadAccessVal) rows.push(['도로·접근성', roadAccessVal]);
  if (catchmentVal) rows.push(['배후·상권', catchmentVal]);
  if (majorFacilityVal) rows.push(['주요시설', majorFacilityVal]);

  // 중개인 수기 location_note 교차 검증 (호선 누락/불일치 시 [LOC-MISMATCH] 경고)
  if (rawBrokerNote && mergedStations.length > 0) {
    const primary = mergedStations[0];
    if (rawBrokerNote.includes(primary.baseName) && primary.lines.length >= 2) {
      const mentionedLines = primary.lines.filter((l) =>
        rawBrokerNote.includes(l) || rawBrokerNote.includes(l.replace(/호선$/, '')),
      );
      if (mentionedLines.length > 0 && mentionedLines.length < primary.lines.length) {
        warnings.push(
          `[LOC-MISMATCH] location_note 내 ${primary.baseName} 호선 일부 누락 감지 (${mentionedLines.join(',')} vs 실측 ${primary.lines.join('·')})`,
        );
      }
    }
  }

  // 하단 입지 요약 콜아웃 자동 합성 (테이블 행과 동일 문장 반복 없이 핵심 수치 요약)
  const bulletLines: string[] = [];
  if (mergedStations.length > 0) {
    const p = mergedStations[0];
    const sec =
      mergedStations.length >= 2 && mergedStations[1].distanceM > 0 && mergedStations[1].distanceM <= 1200
        ? ` 및 ${mergedStations[1].formattedName} 도보권(${mergedStations[1].distanceM}m)`
        : '';
    const transferTag = p.lines.length >= 2 ? ' 환승 역세권' : ' 역세권';
    bulletLines.push(
      `• 철도 교통망: ${p.formattedName} 도보 ${p.walkMinutes}분(${p.distanceM}m)${sec}${transferTag}`,
    );
  }

  const roadAndFacilityTokens: string[] = [];
  if (roadSummaryShort) roadAndFacilityTokens.push(`${roadSummaryShort} 접면`);
  if (arterialSummary) roadAndFacilityTokens.push(arterialSummary);
  else if (icSpotName) roadAndFacilityTokens.push(`${icSpotName} 차량 진출입 용이`);
  if (facilityLabels.length > 0) {
    const topFacilityName = facilityLabels[0].replace(/\s+도보.*$/, '').replace(/\s+\(약.*$/, '');
    roadAndFacilityTokens.push(`${topFacilityName} 등 생활편의 인접`);
  }
  if (roadAndFacilityTokens.length > 0) {
    bulletLines.push(`• 가로·편의성: ${roadAndFacilityTokens.join(', ')}`);
  }

  if (aptHouseholds > 0 || aptNames.length > 0 || foodCount > 0) {
    const aptPart =
      aptHouseholds > 0
        ? `${leadComplexLabel ? `${leadComplexLabel} 등 ` : ''}반경 1km ${aptHouseholds.toLocaleString('ko-KR')}세대 주거배후`
        : aptNames.length > 0
          ? `${aptNames.join('·')} 배후 주거수요`
          : '';
    const bizPart =
      foodCount > 0 || cafeCount > 0
        ? `음식점·카페 ${foodCount + cafeCount}개소 상권 형성`
        : '';
    const combined = [aptPart, bizPart].filter(Boolean).join(' 및 ');
    if (combined) {
      bulletLines.push(`• 상권·배후지: ${combined}`);
    }
  }

  const callout =
    bulletLines.length > 0
      ? {
          kind: 'info' as const,
          title: '입지 요약',
          body: bulletLines.slice(0, 3).join('\n'),
        }
      : undefined;

  return {
    sub: '입지 및 접근성 분석',
    rows,
    callout,
    source: '© 카카오맵 · V-World 국토교통부 공간정보',
    warnings,
    mergedStations,
  };
}
