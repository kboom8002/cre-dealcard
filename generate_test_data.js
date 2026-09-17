const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, 'docs', 'golden-test-data');

const filesToCreate = {
  // P1 R1
  'p1-dangsan-income/r1-draft/memo.txt': `당산동5가 11-47 근생빌딩 매각\n매각가 115억\n대지면적 506.8㎡ (153.31평)\n준공업지역, 2002년 준공\nB1~5F, 자주식 8대`,
  'p1-dangsan-income/r1-draft/bottom_sheet.json': `{
  "askingPriceManwon": 1150000,
  "address": "서울특별시 영등포구 당산동5가 11-47",
  "posture": "income",
  "expectedGrade": "C",
  "expectedGates": {
    "blocking": [],
    "warning": ["QG02"]
  }
}`,
  'p1-dangsan-income/r1-draft/expected.json': `{
  "resolution": "R1",
  "posture": "income",
  "expectedGrade": "C",
  "expectedMinSlides": 7,
  "expectedMaxSlides": 9,
  "expectedSlideArchetypes": ["A01", "A02", "A04", "A06", "A04", "A10"],
  "a24_should_suppress": true,
  "a23_should_suppress": true,
  "note": "R1 with no rent roll: A24 and A23 should be suppressed due to missing floor_leases"
}`,
  'p1-dangsan-income/r1-draft/test_guide.md': `# P1 Dangsan Income R1 (Draft)

Minimal data provided. No rent roll. Should suppress rent roll and yield formula slides.`,

  // P1 R2
  'p1-dangsan-income/r2-standard/memo.txt': `당산동5가 11-47 근생빌딩 매각
매각가 115억
대지면적 506.8㎡ (153.31평)
연면적 1,141.15㎡ (307.9평)
준공업지역, 2002년 준공, B1~5F
토지평당가 약 75백만원/평
자주식 주차 8대, EV 1대
당산역 도보 5분 (2호선/9호선)

임대현황:
B1 96.0평 자가(카페)
1F 23.7평 고은약국 보증금6천 월세183만 ~26.08
1F 31.9평 로뎀나무내과 보증금1.4억 월세883만 ~26.08
2F 76.3평 로뎀나무내과(통합계약)
3F 76.3평 헬쓰장 보증금5천 월세455만 ~26.04
4F 51.1평 국제와인 보증금3천 월세260만 ~25.04
4F 25.1평 자가
5F 55.6평 로뎀나무내과 보증금1천 월세165만 ~26.08`,
  'p1-dangsan-income/r2-standard/bottom_sheet.json': `{
  "askingPriceManwon": 1150000,
  "address": "서울특별시 영등포구 당산동5가 11-47",
  "posture": "income",
  "landAreaM2": 506.8,
  "grossFloorAreaM2": 1141.15,
  "completionYear": 2002,
  "floors": "B1~5F",
  "parking": 8,
  "elevator": 1,
  "zoning": "준공업지역",
  "floor_leases": [
    { "floor": "B1", "tenant_type": "카페(자가)", "area_pyeong": 96.0, "deposit_manwon": 0, "rent_manwon": 0, "is_vacant": false, "note": "자가사용" },
    { "floor": "1F", "tenant_type": "약국", "area_pyeong": 23.7, "deposit_manwon": 6000, "rent_manwon": 183, "lease_end": "2026-08-31", "note": "임대 11년 경과" },
    { "floor": "1F", "tenant_type": "내과", "area_pyeong": 31.9, "deposit_manwon": 14000, "rent_manwon": 883, "lease_end": "2026-08-31", "note": "로뎀나무내과 통합계약" },
    { "floor": "2F", "tenant_type": "내과", "area_pyeong": 76.3, "deposit_manwon": 0, "rent_manwon": 0, "lease_end": "2026-08-31", "note": "로뎀나무내과 통합계약" },
    { "floor": "3F", "tenant_type": "헬쓰장", "area_pyeong": 76.3, "deposit_manwon": 5000, "rent_manwon": 455, "lease_end": "2026-04-17" },
    { "floor": "4F", "tenant_type": "와인매장", "area_pyeong": 51.1, "deposit_manwon": 3000, "rent_manwon": 260, "lease_end": "2025-04-30" },
    { "floor": "4F", "tenant_type": "자가", "area_pyeong": 25.1, "deposit_manwon": 0, "rent_manwon": 0, "is_vacant": false, "note": "자가사용" },
    { "floor": "5F", "tenant_type": "내과", "area_pyeong": 55.6, "deposit_manwon": 1000, "rent_manwon": 165, "lease_end": "2026-08-31", "note": "로뎀나무내과 통합계약" }
  ],
  "expectedGrade": "B",
  "expectedGates": {
    "blocking": [],
    "warning": []
  }
}`,
  'p1-dangsan-income/r2-standard/expected.json': `{
  "resolution": "R2",
  "posture": "income",
  "expectedGrade": "B",
  "expectedMinSlides": 8,
  "expectedMaxSlides": 10,
  "expectedSlideArchetypes": ["A01", "A02", "A04", "A06", "A04", "A24", "A23", "A10"],
  "a24_should_suppress": false,
  "a23_should_suppress": false,
  "expectedFloors": ["B1", "1F", "2F", "3F", "4F", "5F"],
  "expectedKeywords": ["당산", "고은약국", "로뎀나무내과", "115억"],
  "note": "R2 with full rent roll: A24 rent roll + A23 yield formula"
}`,
  'p1-dangsan-income/r2-standard/test_guide.md': `# P1 Dangsan Income R2 (Standard)

Standard rent roll included. Should have rent roll slides.`,

  // P1 R3
  'p1-dangsan-income/r3-verified/memo.txt': `당산동5가 11-47 근생빌딩 매각
매각가 115억
대지면적 506.8㎡ (153.31평)
연면적 1,141.15㎡ (307.9평)
준공업지역, 2002년 준공, B1~5F
토지평당가 약 75백만원/평
자주식 주차 8대, EV 1대
당산역 도보 5분 (2호선/9호선)

임대현황 (Verified):
B1 96.0평 자가(카페)
1F 23.7평 고은약국 보증금6천 월세183만 ~26.08
1F 31.9평 로뎀나무내과 보증금1.4억 월세883만 ~26.08
2F 76.3평 로뎀나무내과(통합계약)
3F 76.3평 헬쓰장 보증금5천 월세455만 ~26.04
4F 51.1평 국제와인 보증금3천 월세260만 ~25.04
4F 25.1평 자가
5F 55.6평 로뎀나무내과 보증금1천 월세165만 ~26.08`,
  'p1-dangsan-income/r3-verified/bottom_sheet.json': `{
  "askingPriceManwon": 1150000,
  "address": "서울특별시 영등포구 당산동5가 11-47",
  "posture": "income",
  "landAreaM2": 506.8,
  "grossFloorAreaM2": 1141.15,
  "completionYear": 2002,
  "floors": "B1~5F",
  "parking": 8,
  "elevator": 1,
  "zoning": "준공업지역",
  "photos_v2": [{ "url": "/test/dangsan-exterior.jpg", "caption": "건물 정면" }],
  "floor_leases": [
    { "floor": "B1", "tenant_type": "카페(자가)", "area_pyeong": 96.0, "deposit_manwon": 0, "rent_manwon": 0, "mgmt_fee_manwon": 30, "rent_type": "fixed", "lease_start": "2014-09-01", "is_vacant": false, "note": "자가사용" },
    { "floor": "1F", "tenant_type": "약국", "area_pyeong": 23.7, "deposit_manwon": 6000, "rent_manwon": 183, "mgmt_fee_manwon": 30, "rent_type": "fixed", "lease_start": "2014-09-01", "lease_end": "2026-08-31", "note": "임대 11년 경과" },
    { "floor": "1F", "tenant_type": "내과", "area_pyeong": 31.9, "deposit_manwon": 14000, "rent_manwon": 883, "mgmt_fee_manwon": 30, "rent_type": "fixed", "lease_start": "2014-09-01", "lease_end": "2026-08-31", "note": "로뎀나무내과 통합계약" },
    { "floor": "2F", "tenant_type": "내과", "area_pyeong": 76.3, "deposit_manwon": 0, "rent_manwon": 0, "mgmt_fee_manwon": 30, "rent_type": "fixed", "lease_start": "2014-09-01", "lease_end": "2026-08-31", "note": "로뎀나무내과 통합계약" },
    { "floor": "3F", "tenant_type": "헬쓰장", "area_pyeong": 76.3, "deposit_manwon": 5000, "rent_manwon": 455, "mgmt_fee_manwon": 20, "rent_type": "fixed", "lease_start": "2014-09-01", "lease_end": "2026-04-17" },
    { "floor": "4F", "tenant_type": "와인매장", "area_pyeong": 51.1, "deposit_manwon": 3000, "rent_manwon": 260, "mgmt_fee_manwon": 20, "rent_type": "fixed", "lease_start": "2014-09-01", "lease_end": "2025-04-30" },
    { "floor": "4F", "tenant_type": "자가", "area_pyeong": 25.1, "deposit_manwon": 0, "rent_manwon": 0, "mgmt_fee_manwon": 20, "rent_type": "fixed", "lease_start": "2014-09-01", "is_vacant": false, "note": "자가사용" },
    { "floor": "5F", "tenant_type": "내과", "area_pyeong": 55.6, "deposit_manwon": 1000, "rent_manwon": 165, "mgmt_fee_manwon": 20, "rent_type": "fixed", "lease_start": "2014-09-01", "lease_end": "2026-08-31", "note": "로뎀나무내과 통합계약" }
  ],
  "expectedGrade": "A",
  "expectedGates": {
    "blocking": [],
    "warning": []
  }
}`,
  'p1-dangsan-income/r3-verified/expected.json': `{
  "resolution": "R3",
  "posture": "income",
  "expectedGrade": "A",
  "expectedMinSlides": 9,
  "expectedMaxSlides": 11,
  "expectedSlideArchetypes": ["A01", "A02", "A04", "A06", "A04", "A24", "A23", "A14", "A10"],
  "a24_should_suppress": false,
  "a23_should_suppress": false,
  "expectedFloors": ["B1", "1F", "2F", "3F", "4F", "5F"],
  "expectedKeywords": ["당산", "고은약국", "로뎀나무내과", "115억", "현실화"],
  "note": "R3 with full data + photos: all 9 sections including gallery"
}`,
  'p1-dangsan-income/r3-verified/test_guide.md': `# P1 Dangsan Income R3 (Verified)

Full rent roll + photos.`,

  // P2 R1
  'p2-sinsa-trading/r1-draft/memo.txt': `신사동 590 ICL빌딩 매각\n매각가 760억\n대지면적 1,061.9㎡ (321.2평)\n3종일반주거, 1998년 준공\nB2~6F`,
  'p2-sinsa-trading/r1-draft/bottom_sheet.json': `{
  "askingPriceManwon": 7600000,
  "address": "서울특별시 강남구 신사동 590",
  "posture": "trading",
  "expectedGrade": "C",
  "expectedGates": {
    "blocking": [],
    "warning": ["QG02"]
  }
}`,
  'p2-sinsa-trading/r1-draft/expected.json': `{
  "resolution": "R1",
  "posture": "trading",
  "expectedGrade": "C",
  "expectedMinSlides": 7,
  "expectedMaxSlides": 9,
  "note": "R1 trading: minimal data, no comps"
}`,
  'p2-sinsa-trading/r1-draft/test_guide.md': `# P2 Sinsa Trading R1`,

  // P2 R3
  'p2-sinsa-trading/r3-verified/memo.txt': `신사동 590 ICL빌딩 매각\n매각가 760억... verified`,
  'p2-sinsa-trading/r3-verified/bottom_sheet.json': `{
  "askingPriceManwon": 7600000,
  "address": "서울특별시 강남구 신사동 590",
  "posture": "trading",
  "landAreaM2": 1061.9,
  "grossFloorAreaM2": 3341.8,
  "floorAreaRatioPct": 237.2,
  "buildingCoverageRatioPct": 51.3,
  "parking": 26,
  "manual_comps": [
    { "address": "신사동 586-6", "landAreaPyeong": 76.7, "priceManwon": 1730000, "pricePerPyeongManwon": 23000 },
    { "address": "신사동 559-6", "landAreaPyeong": 70.6, "priceManwon": 2000000, "pricePerPyeongManwon": 28000 },
    { "address": "신사동 558-6", "landAreaPyeong": 73.8, "priceManwon": 2200000, "pricePerPyeongManwon": 30000 },
    { "address": "신사동 588-1", "landAreaPyeong": 55.1, "priceManwon": 1750000, "pricePerPyeongManwon": 32000 }
  ],
  "expectedGrade": "A",
  "expectedGates": {
    "blocking": [],
    "warning": []
  }
}`,
  'p2-sinsa-trading/r3-verified/expected.json': `{
  "resolution": "R3",
  "posture": "trading",
  "expectedGrade": "A",
  "expectedMinSlides": 8,
  "expectedMaxSlides": 12,
  "note": "R3 trading with manual comps"
}`,
  'p2-sinsa-trading/r3-verified/test_guide.md': `# P2 Sinsa Trading R3`,

  // P3 R1
  'p3-seocho-owner/r1-draft/memo.txt': `서초동 1364-28 FM빌딩 매각\n매각가 230억\n3종일반주거, B1~6F\n양재역 도보 5분`,
  'p3-seocho-owner/r1-draft/bottom_sheet.json': `{
  "askingPriceManwon": 2300000,
  "address": "서울특별시 서초구 서초동 1364-28",
  "posture": "owner_occupied",
  "expectedGrade": "C",
  "expectedGates": {
    "blocking": [],
    "warning": ["QG02"]
  }
}`,
  'p3-seocho-owner/r1-draft/expected.json': `{
  "resolution": "R1",
  "posture": "owner_occupied",
  "expectedGrade": "C",
  "expectedMinSlides": 6,
  "expectedMaxSlides": 9,
  "note": "R1 owner occupied: minimal data"
}`,
  'p3-seocho-owner/r1-draft/test_guide.md': `# P3 Seocho Owner Occupied R1`,

  // P3 R3
  'p3-seocho-owner/r3-verified/memo.txt': `서초동 1364-28 FM빌딩 매각\n매각가 230억... verified`,
  'p3-seocho-owner/r3-verified/bottom_sheet.json': `{
  "askingPriceManwon": 2300000,
  "address": "서울특별시 서초구 서초동 1364-28",
  "posture": "owner_occupied",
  "landAreaM2": 596.0,
  "grossFloorAreaM2": 2104.88,
  "floor_leases": [
    { "floor": "B1", "tenant_type": "파티룸", "is_vacant": false },
    { "floor": "1F", "tenant_type": "상가", "is_vacant": false },
    { "floor": "2F", "tenant_type": "공실", "is_vacant": true },
    { "floor": "3F", "tenant_type": "사무실", "is_vacant": false },
    { "floor": "4F", "tenant_type": "공실", "is_vacant": true },
    { "floor": "5F", "tenant_type": "공실", "is_vacant": true },
    { "floor": "6F", "tenant_type": "사무실", "is_vacant": false },
    { "floor": "7F", "tenant_type": "사무실", "is_vacant": false }
  ],
  "expectedGrade": "A",
  "expectedGates": {
    "blocking": [],
    "warning": []
  }
}`,
  'p3-seocho-owner/r3-verified/expected.json': `{
  "resolution": "R3",
  "posture": "owner_occupied",
  "expectedGrade": "A",
  "expectedMinSlides": 7,
  "expectedMaxSlides": 10,
  "note": "R3 owner occupied with 3 vacant floors"
}`,
  'p3-seocho-owner/r3-verified/test_guide.md': `# P3 Seocho Owner Occupied R3`,

  // P6 R1
  'p6-hotel-operating/r1-draft/memo.txt': `에이치에비뉴호텔 이대점 매각\n매각가 300억\n이대역 도보 3분, 신촌 대학가\n객실수 94실`,
  'p6-hotel-operating/r1-draft/bottom_sheet.json': `{
  "askingPriceManwon": 3000000,
  "address": "서울특별시 서대문구 대현동",
  "posture": "operating",
  "hotel_operating": {
    "total_rooms": 94
  },
  "expectedGrade": "D",
  "expectedGates": {
    "blocking": ["QG10"],
    "warning": []
  }
}`,
  'p6-hotel-operating/r1-draft/expected.json': `{
  "resolution": "R1",
  "posture": "operating",
  "expectedGrade": "D",
  "expectedMinSlides": 6,
  "expectedMaxSlides": 8,
  "note": "R1 operating"
}`,
  'p6-hotel-operating/r1-draft/test_guide.md': `# P6 Hotel Operating R1`,

  // P6 R2
  'p6-hotel-operating/r2-standard/memo.txt': `에이치에비뉴호텔 이대점 매각 R2...`,
  'p6-hotel-operating/r2-standard/bottom_sheet.json': `{
  "askingPriceManwon": 3000000,
  "address": "서울특별시 서대문구 대현동",
  "posture": "operating",
  "landAreaM2": 486.2,
  "grossFloorAreaM2": 3842.6,
  "completionYear": 2016,
  "floors": "B2~12F",
  "parking": 18,
  "elevator": 2,
  "zoning": "일반상업지역",
  "hotel_operating": {
    "total_rooms": 94,
    "room_types": [
      { "type_name": "스탠다드 더블", "room_count": 46, "area_sqm": 16.5, "share_pct": 0.489, "note": "주력" },
      { "type_name": "스탠다드 트윈", "room_count": 28, "area_sqm": 18.0, "share_pct": 0.298 },
      { "type_name": "디럭스 더블", "room_count": 14, "area_sqm": 22.0, "share_pct": 0.149 },
      { "type_name": "스위트", "room_count": 6, "area_sqm": 33.0, "share_pct": 0.064, "note": "최상층" }
    ],
    "adr_krw": 95000,
    "revpar_krw": 74100,
    "occupancy_rate_pct": 78,
    "annual_gop_krw": 1072372088,
    "gop_margin_pct": 38,
    "annual_revenue_krw": 2822031810,
    "room_revenue_krw": 2542371000,
    "ancillary_revenue_pct": 11,
    "operator_name": "에이치 에비뉴",
    "operating_model": "management_contract",
    "operator_contract_expiry": "2029년",
    "tourism_grade": "관광호텔업 3급",
    "seasonality_note": "3~5월·9~11월 성수 / 1~2월 비수 (대학가 특성)",
    "foreign_guest_pct": 45
  },
  "expectedGrade": "B",
  "expectedGates": {
    "blocking": [],
    "warning": []
  }
}`,
  'p6-hotel-operating/r2-standard/expected.json': `{
  "resolution": "R2",
  "posture": "operating",
  "expectedGrade": "B",
  "expectedMinSlides": 7,
  "expectedMaxSlides": 10,
  "note": "R2 hotel operating"
}`,
  'p6-hotel-operating/r2-standard/test_guide.md': `# P6 Hotel Operating R2`,

  // P7 R1
  'p7-sutaek-dev/r1-draft/memo.txt': `수택동 419-19 외 2필지 매각\n매각가 89억\n나대지, 상업지역\n구리역 도보 5분`,
  'p7-sutaek-dev/r1-draft/bottom_sheet.json': `{
  "askingPriceManwon": 890000,
  "address": "경기도 구리시 수택동 419-19 외 2필지",
  "posture": "development",
  "multiParcel": true,
  "expectedGrade": "C",
  "expectedGates": {
    "blocking": [],
    "warning": ["QG27"]
  }
}`,
  'p7-sutaek-dev/r1-draft/expected.json': `{
  "resolution": "R1",
  "posture": "development",
  "expectedGrade": "C",
  "expectedMinSlides": 6,
  "expectedMaxSlides": 9,
  "note": "R1 dev"
}`,
  'p7-sutaek-dev/r1-draft/test_guide.md': `# P7 Sutaek Development R1`,

  // P7 R2
  'p7-sutaek-dev/r2-standard/memo.txt': `수택동 419-19 외 2필지 매각 R2...`,
  'p7-sutaek-dev/r2-standard/bottom_sheet.json': `{
  "askingPriceManwon": 890000,
  "address": "경기도 구리시 수택동 419-19 외 2필지",
  "posture": "development",
  "multiParcel": true,
  "parcels": [
    { "address": "구리시 수택동 419-19", "jibun": "대", "areaM2": 0, "zoning": "상업지역" },
    { "address": "구리시 수택동 419-12", "jibun": "대", "areaM2": 0, "zoning": "상업지역" },
    { "address": "구리시 수택동 419-96", "jibun": "대", "areaM2": 0, "zoning": "상업지역" }
  ],
  "landAreaM2": 651.2,
  "zoning": "도시지역·상업지역",
  "developmentSpec": {
    "maxFAR": 1260,
    "targetScalePyeong": 2500,
    "use": "오피스텔/복합개발",
    "pricePerPyeong": 4500
  },
  "hasRentRoll": false,
  "expectedGrade": "B",
  "expectedGates": {
    "blocking": [],
    "warning": []
  }
}`,
  'p7-sutaek-dev/r2-standard/expected.json': `{
  "resolution": "R2",
  "posture": "development",
  "expectedGrade": "B",
  "expectedMinSlides": 7,
  "expectedMaxSlides": 10,
  "note": "R2 dev"
}`,
  'p7-sutaek-dev/r2-standard/test_guide.md': `# P7 Sutaek Development R2`
};

Object.entries(filesToCreate).forEach(([relPath, content]) => {
  const fullPath = path.join(baseDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
});
console.log('Done!');
