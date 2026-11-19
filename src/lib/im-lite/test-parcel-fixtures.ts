/**
 * Non-production test/golden fixture parcel lookup.
 * NEVER consulted in real production runtime (`isRealProductionRuntime()`).
 */
export interface KnownParcelInfo {
  pnu: string;
  lat: number;
  lng: number;
  jibunAddress: string;
  roadAddress: string;
  officialLandPriceWonSqm?: number;
  landAreaSqm?: number;
  gfaSqm?: number;
  zoning?: string;
  completionDate?: string;
  floorsAbove?: number;
  floorsBelow?: number;
  bcrPct?: number;
  farPct?: number;
  parkingSpaces?: number;
  elevators?: number;
  mainPurpose?: string;
}

export const TEST_PARCEL_FIXTURES: Array<{ match: RegExp; info: KnownParcelInfo }> = [
  {
    match: /(양화로\s*18안길\s*7\b|동교동\s*(?:147-8|168-4)\b)/,
    info: {
      pnu: '1144012100101680004',
      lat: 37.556828,
      lng: 126.925088,
      jibunAddress: '서울특별시 마포구 동교동 168-4',
      roadAddress: '서울특별시 마포구 양화로18안길 7',
      officialLandPriceWonSqm: 14200000,
      landAreaSqm: 137.2,
      gfaSqm: 426.11,
      zoning: '제2종일반주거지역',
      completionDate: '2019-06-21',
      floorsAbove: 4,
      floorsBelow: 1,
      bcrPct: 59.81,
      farPct: 189.69,
      parkingSpaces: 3,
      elevators: 0,
      mainPurpose: '제1·2종 근린생활시설',
    },
  },
  {
    match: /(동교동\s*189-6|와우산로37길\s*9)/,
    info: {
      pnu: '1144012100101890006',
      lat: 37.55597,
      lng: 126.93033,
      jibunAddress: '서울특별시 마포구 동교동 189-6',
      roadAddress: '서울특별시 마포구 와우산로37길 9',
      officialLandPriceWonSqm: 11670000,
      landAreaSqm: 137.2,
      gfaSqm: 426.11,
      zoning: '제2종일반주거지역',
      completionDate: '2019-05-30',
      floorsAbove: 4,
      floorsBelow: 2,
      bcrPct: 59.81,
      farPct: 189.69,
      parkingSpaces: 3,
      elevators: 0,
      mainPurpose: '제1·2종 근린생활시설',
    },
  },
  {
    match: /(심곡동\s*382-2|부천로29번길\s*22)/,
    info: {
      pnu: '4119210100103820002',
      lat: 37.4867,
      lng: 126.7824,
      jibunAddress: '경기도 부천시 원미구 심곡동 382-2',
      roadAddress: '경기도 부천시 원미구 부천로29번길 22',
      officialLandPriceWonSqm: 4680000,
      landAreaSqm: 535.6,
      gfaSqm: 2758.21,
      zoning: '일반상업지역',
      completionDate: '1998-11-17',
      floorsAbove: 7,
      floorsBelow: 2,
      bcrPct: 79.24,
      farPct: 445.24,
      parkingSpaces: 28,
      elevators: 2,
      mainPurpose: '제1·2종 근린생활시설',
    },
  },
  {
    match: /(심곡동\s*349-10|부천로39번길\s*8)/,
    info: {
      pnu: '4119210200103490010',
      lat: 37.48815,
      lng: 126.78317,
      jibunAddress: '경기도 부천시 원미구 심곡동 349-10',
      roadAddress: '경기도 부천시 원미구 부천로39번길 8',
      officialLandPriceWonSqm: 4680000,
      landAreaSqm: 535.6,
      gfaSqm: 2758.21,
      zoning: '일반상업지역',
      completionDate: '1998-11-17',
      floorsAbove: 7,
      floorsBelow: 1,
      bcrPct: 79.24,
      farPct: 445.24,
      parkingSpaces: 28,
      elevators: 2,
      mainPurpose: '제1·2종 근린생활시설',
    },
  },
  {
    match: /(역삼동\s*823-33|테헤란로14길\s*8)/,
    info: {
      pnu: '1168010100108230033',
      lat: 37.4996,
      lng: 127.0344,
      jibunAddress: '서울특별시 강남구 역삼동 823-33',
      roadAddress: '서울특별시 강남구 테헤란로14길 8',
      officialLandPriceWonSqm: 65340000,
      landAreaSqm: 1452.2,
      gfaSqm: 14256.64,
      zoning: '일반상업지역',
      completionDate: '1992-10-15',
      floorsAbove: 15,
      floorsBelow: 3,
      bcrPct: 47.78,
      farPct: 719.66,
      parkingSpaces: 55,
      elevators: 3,
      mainPurpose: '업무시설, 근린생활시설',
    },
  },
  {
    match: /(역삼동\s*648-23|테헤란로\s*123)/,
    info: {
      pnu: '1168010100106480023',
      lat: 37.49956,
      lng: 127.03151,
      jibunAddress: '서울특별시 강남구 역삼동 648-23 외 2필지',
      roadAddress: '서울특별시 강남구 테헤란로 123',
      officialLandPriceWonSqm: 65340000,
      landAreaSqm: 1452.2,
      gfaSqm: 14256.64,
      zoning: '일반상업지역',
      completionDate: '1985-06-13',
      floorsAbove: 15,
      floorsBelow: 3,
      bcrPct: 47.78,
      farPct: 719.66,
      parkingSpaces: 55,
      elevators: 3,
      mainPurpose: '업무시설, 근린생활시설',
    },
  },
  {
    match: /(당산동5가\s*11-47|양평동\s*11-47|영신로\s*259)/,
    info: {
      pnu: '1156011500100110047',
      lat: 37.5342,
      lng: 126.9022,
      jibunAddress: '서울특별시 영등포구 당산동5가 11-47',
      roadAddress: '서울특별시 영등포구 영신로 259',
      officialLandPriceWonSqm: 8950000,
    },
  },
  {
    match: /(서초동\s*1364-28|남부순환로347길\s*18)/,
    info: {
      pnu: '1165010800113640028',
      lat: 37.4836,
      lng: 127.0357,
      jibunAddress: '서울특별시 서초구 서초동 1364-28',
      roadAddress: '서울특별시 서초구 남부순환로347길 18',
      officialLandPriceWonSqm: 15800000,
    },
  },
  {
    match: /(신사동\s*590|논현로159길\s*10)/,
    info: {
      pnu: '1168010700105900000',
      lat: 37.5218,
      lng: 127.0286,
      jibunAddress: '서울특별시 강남구 신사동 590',
      roadAddress: '서울특별시 강남구 논현로159길 10',
      officialLandPriceWonSqm: 24500000,
    },
  },
  {
    match: /(보정동\s*1208-4|죽전로\s*15)/,
    info: {
      pnu: '4146311800112080004',
      lat: 37.3228,
      lng: 127.1107,
      jibunAddress: '경기도 용인시 기흥구 보정동 1208-4',
      roadAddress: '경기도 용인시 기흥구 죽전로 15',
      officialLandPriceWonSqm: 6420000,
    },
  },
  {
    match: /(보정동\s*1263|보정로\s*115)/,
    info: {
      pnu: '4146311100112630000',
      lat: 37.3198,
      lng: 127.1107,
      jibunAddress: '경기도 용인시 기흥구 보정동 1263',
      roadAddress: '경기도 용인시 기흥구 보정로 115',
      officialLandPriceWonSqm: 6420000,
    },
  },
  {
    match: /(보정동\s*1323-2|신촌로47번길\s*6)/,
    info: {
      pnu: '4146311800113230002',
      lat: 37.3079134604492,
      lng: 127.110304201949,
      jibunAddress: '경기도 용인시 기흥구 보정동 1323-2',
      roadAddress: '경기도 용인시 기흥구 신촌로47번길 6 (보정동)',
      officialLandPriceWonSqm: 2790000,
      landAreaSqm: 440,
      gfaSqm: 1230.46,
      zoning: '제3종일반주거지역',
      completionDate: '2004-12-23',
      floorsAbove: 5,
      floorsBelow: 1,
      bcrPct: 49.91,
      farPct: 209.24,
      parkingSpaces: 7,
      elevators: 1,
      mainPurpose: '제1·2종 근린생활시설',
    },
  },
];
