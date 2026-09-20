/**
 * generate-golden-test-materials.ts
 * 
 * 골든 테스트 데이터셋에 대한 인간 테스터용 E2E 테스트 자료를 자동 생성합니다.
 * 
 * 생성물:
 * 1. 바텀시트 입력 항목 MD 파일 (각 데이터셋 폴더에)
 * 2. 렌트롤 XLSX 파일 (CREDEAL 표준 템플릿 v1.2 형식)
 * 3. 이미지 폴더 생성 및 placeholder README
 * 
 * 실행: npx tsx docs/golden-test-data/generate-golden-test-materials.ts
 */

import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const BASE_DIR = join(process.cwd(), 'docs', 'golden-test-data');

// ═══════════════════════════════════════════════════════════
// 1. 모든 데이터셋 정의
// ═══════════════════════════════════════════════════════════

interface DatasetMeta {
  id: string;
  name: string;
  posture: string;
  postureKr: string;
  address: string;
  askingPriceManwon: number;
  resolutions: string[];
  /** R2/R3에서 렌트롤이 있는 경우 */
  hasRentRoll: boolean;
  /** 이미지 참고 설명 */
  imageNotes: string;
}

const DATASETS: DatasetMeta[] = [
  {
    id: 'p1-dangsan-income',
    name: '당산동 근생빌딩',
    posture: 'income',
    postureKr: '수익형',
    address: '서울특별시 영등포구 당산동5가 11-47',
    askingPriceManwon: 1150000,
    resolutions: ['r1-draft', 'r2-standard', 'r3-verified'],
    hasRentRoll: true,
    imageNotes: '외관 사진 1장 (dangsan-exterior.jpg)',
  },
  {
    id: 'p2-sinsa-trading',
    name: '신사동 매각빌딩',
    posture: 'trading',
    postureKr: '매매형',
    address: '서울특별시 강남구 신사동 590',
    askingPriceManwon: 7600000,
    resolutions: ['r1-draft', 'r3-verified'],
    hasRentRoll: false,
    imageNotes: '이미지 없음 (매매형 — 유사거래 데이터 중심)',
  },
  {
    id: 'p3-seocho-owner',
    name: '서초동 사옥빌딩',
    posture: 'owner_occupied',
    postureKr: '자가사용형',
    address: '서울특별시 서초구 서초동 1364-28',
    askingPriceManwon: 2300000,
    resolutions: ['r1-draft', 'r3-verified'],
    hasRentRoll: true,
    imageNotes: '이미지 없음 (데이터셋에 photo 미포함)',
  },
  {
    id: 'p4-jamwon-dev',
    name: '잠원동 개발부지',
    posture: 'development',
    postureKr: '개발형',
    address: '서울특별시 서초구 잠원동 26-14, 16번지',
    askingPriceManwon: 2422680,
    resolutions: ['r1-draft', 'r2-standard', 'r3-verified'],
    hasRentRoll: true,
    imageNotes: '이미지 없음 (개발형 — 사업성 분석 중심)',
  },
  {
    id: 'p5-yangpyeong-income',
    name: '양평동 오피스빌딩',
    posture: 'income',
    postureKr: '수익형',
    address: '서울특별시 영등포구 양평동4가 117, 134, 125-2번지',
    askingPriceManwon: 2500000,
    resolutions: ['r1-draft', 'r2-standard', 'r3-verified'],
    hasRentRoll: true,
    imageNotes: '외관 사진 2장 (R3-Verified에 URL 포함)',
  },
  {
    id: 'p6-hotel-operating',
    name: '대현동 관광호텔',
    posture: 'operating',
    postureKr: '운영형(호텔)',
    address: '서울특별시 서대문구 대현동 56-1',
    askingPriceManwon: 3000000,
    resolutions: ['r1-draft', 'r2-standard'],
    hasRentRoll: false,
    imageNotes: '이미지 없음 (운영형 — GOP/RevPAR 중심)',
  },
  {
    id: 'p7-sutaek-dev',
    name: '수택동 개발부지',
    posture: 'development',
    postureKr: '개발형',
    address: '경기도 구리시 수택동 419-19 외 2필지',
    askingPriceManwon: 890000,
    resolutions: ['r1-draft', 'r2-standard'],
    hasRentRoll: false,
    imageNotes: '이미지 없음 (나대지 개발형)',
  },
];

// ═══════════════════════════════════════════════════════════
// 2. 바텀시트 MD 생성
// ═══════════════════════════════════════════════════════════

function generateBottomSheetMd(datasetId: string, resolution: string, data: any, meta: DatasetMeta): string {
  const priceEok = (data.askingPriceManwon / 10000).toFixed(0);
  
  let md = `# ${meta.name} — 바텀시트 입력 항목\n\n`;
  md += `> **데이터셋**: \`${datasetId}/${resolution}\`\n`;
  md += `> **포스처**: ${meta.postureKr} (${meta.posture})\n`;
  md += `> **해상도**: ${resolution}\n`;
  md += `> **기대 등급**: ${data.expectedGrade || 'N/A'}\n\n`;
  md += `---\n\n`;

  // 기본 정보
  md += `## 1. 기본 정보\n\n`;
  md += `| 항목 | 값 | 비고 |\n|:---|:---|:---|\n`;
  md += `| 주소 | ${data.address} | |\n`;
  md += `| 매각희망가 | ${priceEok}억 원 (${data.askingPriceManwon.toLocaleString()}만원) | |\n`;
  md += `| 투자 포스처 | ${meta.postureKr} (${data.posture}) | |\n`;
  
  if (data.landAreaM2) md += `| 대지면적 | ${data.landAreaM2}㎡ | |\n`;
  if (data.grossFloorAreaM2) md += `| 연면적 | ${data.grossFloorAreaM2}㎡ | |\n`;
  if (data.completionYear) md += `| 준공연도 | ${data.completionYear}년 | |\n`;
  if (data.floors) md += `| 층수 | ${data.floors} | |\n`;
  if (data.parking !== undefined) md += `| 주차 | ${data.parking}대 | |\n`;
  if (data.elevator !== undefined) md += `| 승강기 | ${data.elevator}대 | |\n`;
  if (data.zoning) md += `| 용도지역 | ${data.zoning} | |\n`;
  if (data.buildingCoverageRatio) md += `| 건폐율 | ${data.buildingCoverageRatio}% | |\n`;
  if (data.floorAreaRatio) md += `| 용적률 | ${data.floorAreaRatio}% | |\n`;
  if (data.multiParcel) md += `| 다필지 | 예 | |\n`;
  md += `\n`;

  // 필지 정보
  if (data.parcels?.length) {
    md += `## 2. 필지 정보\n\n`;
    md += `| 주소 | 지목 | 면적(㎡) | 용도지역 | 공시지가(원/㎡) |\n|:---|:---|---:|:---|---:|\n`;
    data.parcels.forEach((p: any) => {
      md += `| ${p.address} | ${p.jibun || '-'} | ${p.areaM2 || '-'} | ${p.zoning || '-'} | ${p.officialPricePerM2?.toLocaleString() || '-'} |\n`;
    });
    md += `\n`;
  }

  // 층별 임대차
  if (data.floor_leases?.length) {
    md += `## 3. 층별 임대차 현황 (렌트롤)\n\n`;
    md += `| 층 | 용도/업종 | 면적(평) | 보증금(만원) | 월세(만원) | 관리비(만원) | 계약시작 | 계약종료 | 비고 |\n`;
    md += `|:---|:---|---:|---:|---:|---:|:---|:---|:---|\n`;
    data.floor_leases.forEach((fl: any) => {
      md += `| ${fl.floor} | ${fl.tenant_type || '-'} | ${fl.area_pyeong || '-'} | ${fl.deposit_manwon ?? '-'} | ${fl.rent_manwon ?? '-'} | ${fl.mgmt_fee_manwon ?? '-'} | ${fl.lease_start || '-'} | ${fl.lease_end || '-'} | ${fl.note || (fl.is_vacant ? '공실' : '')} |\n`;
    });
    md += `\n`;

    // 합계 계산
    const totalDeposit = data.floor_leases.reduce((s: number, f: any) => s + (f.deposit_manwon || 0), 0);
    const totalRent = data.floor_leases.reduce((s: number, f: any) => s + (f.rent_manwon || 0), 0);
    const totalMgmt = data.floor_leases.reduce((s: number, f: any) => s + (f.mgmt_fee_manwon || 0), 0);
    md += `**합계**: 보증금 ${totalDeposit.toLocaleString()}만원 / 월세 ${totalRent.toLocaleString()}만원 / 관리비 ${totalMgmt.toLocaleString()}만원\n\n`;
  }

  // 호텔 운영 데이터
  if (data.hotel_operating) {
    const ho = data.hotel_operating;
    md += `## 3. 호텔 운영 데이터\n\n`;
    md += `| 항목 | 값 |\n|:---|:---|\n`;
    md += `| 총 객실 수 | ${ho.total_rooms}실 |\n`;
    if (ho.adr_krw) md += `| ADR (평균 객실 단가) | ${ho.adr_krw.toLocaleString()}원 |\n`;
    if (ho.revpar_krw) md += `| RevPAR | ${ho.revpar_krw.toLocaleString()}원 |\n`;
    if (ho.occupancy_rate_pct) md += `| 가동률 | ${ho.occupancy_rate_pct}% |\n`;
    if (ho.annual_revenue_krw) md += `| 연간 총매출 | ${(ho.annual_revenue_krw / 100000000).toFixed(1)}억 원 |\n`;
    if (ho.annual_gop_krw) md += `| 연간 GOP | ${(ho.annual_gop_krw / 100000000).toFixed(1)}억 원 |\n`;
    if (ho.gop_margin_pct) md += `| GOP 마진율 | ${ho.gop_margin_pct}% |\n`;
    if (ho.operator_name) md += `| 운영사 | ${ho.operator_name} |\n`;
    if (ho.operating_model) md += `| 운영 형태 | ${ho.operating_model} |\n`;
    if (ho.tourism_grade) md += `| 관광숙박업 등급 | ${ho.tourism_grade} |\n`;
    if (ho.foreign_guest_pct) md += `| 외국인 비중 | ${ho.foreign_guest_pct}% |\n`;
    md += `\n`;

    if (ho.room_types?.length) {
      md += `### 객실 구성\n\n`;
      md += `| 타입 | 객실 수 | 면적(㎡) | 비중 | 비고 |\n|:---|---:|---:|---:|:---|\n`;
      ho.room_types.forEach((rt: any) => {
        md += `| ${rt.type_name} | ${rt.room_count} | ${rt.area_sqm} | ${(rt.share_pct * 100).toFixed(1)}% | ${rt.note || ''} |\n`;
      });
      md += `\n`;
    }
  }

  // 개발 사양
  if (data.developmentSpec) {
    const ds = data.developmentSpec;
    md += `## 4. 개발 사업 사양\n\n`;
    md += `| 항목 | 값 |\n|:---|:---|\n`;
    if (ds.use) md += `| 용도 | ${ds.use} |\n`;
    if (ds.targetScalePyeong) md += `| 목표 규모 | ${ds.targetScalePyeong}평 |\n`;
    if (ds.totalCostManwon) md += `| 총 사업비 | ${ds.totalCostManwon.toLocaleString()}만원 |\n`;
    if (ds.constructionCostPerPyeong) md += `| 평당 공사비 | ${ds.constructionCostPerPyeong.toLocaleString()}만원/평 |\n`;
    if (ds.newBuildFloors) md += `| 신축 층수 | ${ds.newBuildFloors} |\n`;
    if (ds.newBuildStructure) md += `| 구조 | ${ds.newBuildStructure} |\n`;
    if (ds.maxFAR) md += `| 최대 용적률 | ${ds.maxFAR}% |\n`;
    if (ds.pricePerPyeong) md += `| 분양 예상가(만원/평) | ${ds.pricePerPyeong.toLocaleString()} |\n`;
    md += `\n`;

    if (ds.stackingPlan?.length) {
      md += `### 신축 스태킹 플랜\n\n`;
      md += `| 층 | 면적(평) | 용도 | 평당 임대료 | 월 임대료 | 보증금 |\n|:---|---:|:---|---:|---:|---:|\n`;
      ds.stackingPlan.forEach((sp: any) => {
        md += `| ${sp.floor} | ${sp.area_pyeong} | ${sp.use} | ${sp.rentPerPyeong?.toLocaleString() || '-'} | ${sp.monthlyRent?.toLocaleString() || '-'} | ${sp.deposit?.toLocaleString() || '-'} |\n`;
      });
      md += `\n`;
    }
  }

  // 유사거래
  if (data.manual_comps?.length) {
    md += `## 5. 유사 거래 사례\n\n`;
    md += `| 주소 | 대지면적(평) | 거래가(만원) | 평당가(만원) |\n|:---|---:|---:|---:|\n`;
    data.manual_comps.forEach((c: any) => {
      md += `| ${c.address} | ${c.landAreaPyeong} | ${c.priceManwon.toLocaleString()} | ${c.pricePerPyeongManwon.toLocaleString()} |\n`;
    });
    md += `\n`;
  }

  // 기대 결과
  md += `## 검증 기준\n\n`;
  md += `| 항목 | 값 |\n|:---|:---|\n`;
  md += `| 기대 등급 | ${data.expectedGrade} |\n`;
  if (data.expectedGates?.blocking?.length) {
    md += `| 차단 게이트 | ${data.expectedGates.blocking.join(', ')} |\n`;
  } else {
    md += `| 차단 게이트 | 없음 |\n`;
  }
  if (data.expectedGates?.warning?.length) {
    md += `| 경고 게이트 | ${data.expectedGates.warning.join(', ')} |\n`;
  } else {
    md += `| 경고 게이트 | 없음 |\n`;
  }
  md += `\n`;

  return md;
}

// ═══════════════════════════════════════════════════════════
// 3. 렌트롤 XLSX 생성
// ═══════════════════════════════════════════════════════════

function generateRentRollXlsx(data: any, meta: DatasetMeta, resolution: string): Buffer | null {
  if (!data.floor_leases?.length) return null;

  const SQM_PER_PYEONG = 3.305785;
  const wb = XLSX.utils.book_new();

  // 시트 1: 기입요령
  const guideData = [
    [`CREDEAL 렌트롤 표준양식 v1.2 — ${meta.name} (${resolution})`],
    [''],
    ['① 두 번째 시트 \'렌트롤\'에 임대차 현황을 입력하세요.'],
    ['② 금액 단위: 만원 (예: 보증금 5,000만원 → 5000)'],
    ['③ 면적 단위: ㎡ (전용면적 기준)'],
    ['④ 날짜 형식: YYYY-MM-DD (예: 2024-01-01)'],
    ['⑤ 공실인 호실은 용도/업종에 \'공실\' 또는 비고에 \'공실\'로 표기'],
    ['⑥ 자가사용 호실은 비고에 \'자가사용\' 또는 \'오너\' 표기'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guideData);
  wsGuide['!cols'] = [{ wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, '기입요령');

  // 시트 2: 렌트롤 (메인)
  const headers = [
    '층', '호실', '용도/업종', '임차인(상호)', '전용면적(㎡)',
    '보증금(만원)', '월세(만원)', '관리비(만원)',
    '계약시작일', '계약종료일', '비고',
  ];

  const rows = data.floor_leases.map((fl: any, idx: number) => {
    const areaSqm = fl.area_pyeong ? +(fl.area_pyeong * SQM_PER_PYEONG).toFixed(1) : '';
    const tenantName = fl.tenant_type || '';
    const note = fl.note || (fl.is_vacant ? '공실' : '');
    const unitNo = fl.floor.includes('F') ? `${fl.floor.replace('F', '')}01호` : `${fl.floor}01`;

    return [
      fl.floor,
      unitNo,
      fl.is_vacant ? '공실' : (fl.tenant_type || ''),
      fl.is_vacant ? '' : (fl.tenant_type || ''),
      areaSqm,
      fl.deposit_manwon ?? '',
      fl.rent_manwon ?? '',
      fl.mgmt_fee_manwon ?? '',
      fl.lease_start || '',
      fl.lease_end || '',
      note,
    ];
  });

  const sheetData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [
    { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
    { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, '렌트롤');

  // 시트 3: 자동검증
  const validationData = [
    ['자동검증 결과'],
    [''],
    ['항목', '수식', '결과'],
    ['총 호실 수', `=COUNTA(렌트롤!A2:A${rows.length + 1})`, ''],
    ['총 보증금(만원)', `=SUM(렌트롤!F2:F${rows.length + 1})`, ''],
    ['총 월세(만원)', `=SUM(렌트롤!G2:G${rows.length + 1})`, ''],
    ['총 관리비(만원)', `=SUM(렌트롤!H2:H${rows.length + 1})`, ''],
    ['연 임대수입(만원)', `=SUM(렌트롤!G2:G${rows.length + 1})*12`, ''],
  ];
  const wsVal = XLSX.utils.aoa_to_sheet(validationData);
  wsVal['!cols'] = [{ wch: 20 }, { wch: 40 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsVal, '자동검증');

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// ═══════════════════════════════════════════════════════════
// 4. 메인 실행
// ═══════════════════════════════════════════════════════════

function main() {
  console.log('=== 골든 테스트 E2E 자료 생성기 ===\n');
  let mdCount = 0;
  let xlsxCount = 0;
  let imgDirCount = 0;

  for (const meta of DATASETS) {
    console.log(`\n📁 ${meta.id} (${meta.name})`);

    for (const res of meta.resolutions) {
      const dir = join(BASE_DIR, meta.id, res);
      if (!existsSync(dir)) {
        console.log(`  ⚠️  ${res}: 디렉토리 없음, 건너뜀`);
        continue;
      }

      const bsPath = join(dir, 'bottom_sheet.json');
      if (!existsSync(bsPath)) {
        console.log(`  ⚠️  ${res}: bottom_sheet.json 없음, 건너뜀`);
        continue;
      }

      const data = JSON.parse(readFileSync(bsPath, 'utf8'));

      // (A) 바텀시트 MD 생성
      const mdContent = generateBottomSheetMd(meta.id, res, data, meta);
      const mdPath = join(dir, 'bottom_sheet_입력항목.md');
      writeFileSync(mdPath, mdContent, 'utf8');
      console.log(`  ✅ ${res}/bottom_sheet_입력항목.md 생성`);
      mdCount++;

      // (B) 렌트롤 XLSX 생성
      if (data.floor_leases?.length) {
        const xlsxBuf = generateRentRollXlsx(data, meta, res);
        if (xlsxBuf) {
          const xlsxPath = join(dir, `CREDEAL_rentroll_${meta.id}_${res}.xlsx`);
          writeFileSync(xlsxPath, xlsxBuf);
          console.log(`  ✅ ${res}/CREDEAL_rentroll_${meta.id}_${res}.xlsx 생성 (${data.floor_leases.length}행)`);
          xlsxCount++;
        }
      } else {
        console.log(`  ℹ️  ${res}: 렌트롤 없음 (${meta.posture === 'operating' ? '운영형' : meta.posture === 'development' && !data.floor_leases ? '나대지' : '데이터 미포함'})`);
      }

      // (C) 이미지 폴더 생성
      const imgDir = join(dir, 'images');
      if (!existsSync(imgDir)) {
        mkdirSync(imgDir, { recursive: true });
        imgDirCount++;
      }

      // 이미지 README
      const imgReadme = `# ${meta.name} — ${res} 이미지 폴더\n\n` +
        `이 폴더에 해당 매물의 원본 사진을 저장합니다.\n\n` +
        `## 사진 카테고리\n\n` +
        `| 카테고리 | 파일명 규칙 | 설명 |\n|:---|:---|:---|\n` +
        `| 외관 | exterior_01.jpg | 건물 외관 정면 |\n` +
        `| 외관 | exterior_02.jpg | 건물 외관 측면 |\n` +
        `| 1층 | floor_1f_01.jpg | 1층 매장 전경 |\n` +
        `| 로비 | lobby_01.jpg | 로비/입구 |\n` +
        `| 옥상 | rooftop_01.jpg | 옥상 전경 |\n` +
        `| 주변 | surroundings_01.jpg | 주변 거리뷰 |\n\n` +
        `> **현재 상태**: ${meta.imageNotes}\n\n` +
        `> **참고**: 인간 테스터는 실제 현장 촬영 사진 또는 로드뷰 캡처 이미지를 이 폴더에 추가해주세요.\n`;
      writeFileSync(join(imgDir, 'README.md'), imgReadme, 'utf8');
    }
  }

  console.log(`\n=== 생성 완료 ===`);
  console.log(`  MD 파일: ${mdCount}개`);
  console.log(`  XLSX 파일: ${xlsxCount}개`);
  console.log(`  이미지 폴더: ${imgDirCount}개`);
}

main();
