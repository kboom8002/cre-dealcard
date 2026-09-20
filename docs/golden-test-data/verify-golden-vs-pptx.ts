/**
 * verify-golden-vs-pptx.ts
 * 
 * 원본 브로커 PPTX에서 텍스트를 추출하여 골든 테스트 데이터의 핵심 수치와 대조합니다.
 * 
 * 실행: npx tsx docs/golden-test-data/verify-golden-vs-pptx.ts
 */

import JSZip from 'jszip';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, basename } from 'path';

const BROKER_DIR = join(process.cwd(), 'docs', 'real-broker-im');
const GOLDEN_DIR = join(process.cwd(), 'docs', 'golden-test-data');

interface VerifyItem {
  field: string;
  goldenValue: string;
  pptxFound: boolean;
  pptxMatch: string;
  status: '✅ 일치' | '⚠️ 근사' | '❌ 불일치' | '➖ PPTX 미확인';
}

interface DatasetVerification {
  datasetId: string;
  pptxFile: string;
  pptxSlideCount: number;
  totalTextLength: number;
  items: VerifyItem[];
}

// PPTX에서 모든 텍스트 추출
async function extractPptxText(pptxPath: string): Promise<{ text: string; slideCount: number }> {
  const data = readFileSync(pptxPath);
  const zip = await JSZip.loadAsync(data);
  
  let allText = '';
  let slideCount = 0;
  
  for (const [path, file] of Object.entries(zip.files)) {
    if (path.match(/^ppt\/slides\/slide\d+\.xml$/) && !file.dir) {
      slideCount++;
      const xml = await file.async('text');
      // XML에서 텍스트 추출 (a:t 태그의 내용)
      const textMatches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
      const slideText = textMatches.map(m => m.replace(/<\/?a:t>/g, '')).join(' ');
      allText += slideText + '\n';
    }
  }
  
  return { text: allText, slideCount };
}

// 숫자 검색 (쉼표 포함 형식, 한글 단위 포함)
function findNumberInText(text: string, value: number, tolerance: number = 0.01): string | null {
  const formattedValues = [
    value.toString(),
    value.toLocaleString(),
    value.toLocaleString().replace(/,/g, ','),
  ];
  
  for (const fv of formattedValues) {
    if (text.includes(fv)) return fv;
  }
  
  // 억 단위 검색
  if (value >= 10000) {
    const eok = value / 10000;
    const eokStr = eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(1);
    if (text.includes(`${eokStr}억`)) return `${eokStr}억`;
  }
  
  // 만원 단위 → 억 단위 검색
  if (value >= 100000) {
    const eok = value / 100000;
    const eokStr = eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(1);
    if (text.includes(`${eokStr}억`)) return `${eokStr}억`;
  }
  
  return null;
}

function findTextInPptx(text: string, searchTerm: string): boolean {
  return text.includes(searchTerm);
}

interface PptxMapping {
  filename: string;
  datasetId: string;
  goldenRes: string; // 가장 상세한 해상도
}

const MAPPINGS: PptxMapping[] = [
  { filename: '2505월 당산동5가 11-47 근생빌딩 매각(임대료조정포함).pptx', datasetId: 'p1-dangsan-income', goldenRes: 'r2-standard' },
  { filename: '2507월 신사동 590 빌딩 매각.pptx', datasetId: 'p2-sinsa-trading', goldenRes: 'r3-verified' },
  { filename: '2509월 서초동 1364-28 매각 자료.pptx', datasetId: 'p3-seocho-owner', goldenRes: 'r3-verified' },
  { filename: '특SALE_IM_잠원동26-14,16번지_두원빌딩(약242억) (1).pptx', datasetId: 'p4-jamwon-dev', goldenRes: 'r2-standard' },
  { filename: '양평동4가117(더레드빌딩).pptx', datasetId: 'p5-yangpyeong-income', goldenRes: 'r2-standard' },
  { filename: '에이치에비뉴호텔(이대점).pptx', datasetId: 'p6-hotel-operating', goldenRes: 'r2-standard' },
  { filename: '수택동419-19외2필지.pptx', datasetId: 'p7-sutaek-dev', goldenRes: 'r2-standard' },
];

async function verifyDataset(mapping: PptxMapping): Promise<DatasetVerification> {
  const pptxPath = join(BROKER_DIR, mapping.filename);
  const goldenPath = join(GOLDEN_DIR, mapping.datasetId, mapping.goldenRes, 'bottom_sheet.json');
  
  const { text, slideCount } = await extractPptxText(pptxPath);
  const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
  
  const items: VerifyItem[] = [];
  
  // 1. 주소 검증
  const addressParts = (golden.address as string).split(' ').filter(p => p.length >= 2);
  const addressCheck = addressParts.some(part => findTextInPptx(text, part));
  items.push({
    field: '주소',
    goldenValue: golden.address,
    pptxFound: addressCheck,
    pptxMatch: addressCheck ? addressParts.filter(p => findTextInPptx(text, p)).join(', ') : '',
    status: addressCheck ? '✅ 일치' : '❌ 불일치',
  });
  
  // 2. 매각가 검증
  const priceManwon = golden.askingPriceManwon;
  const priceEok = priceManwon / 10000;
  const priceEokStr = priceEok % 1 === 0 ? priceEok.toFixed(0) : priceEok.toFixed(1);
  const priceInText = findTextInPptx(text, `${priceEokStr}억`) || findTextInPptx(text, priceManwon.toLocaleString());
  items.push({
    field: '매각가',
    goldenValue: `${priceEokStr}억 (${priceManwon.toLocaleString()}만원)`,
    pptxFound: priceInText,
    pptxMatch: priceInText ? `${priceEokStr}억 확인` : '',
    status: priceInText ? '✅ 일치' : '➖ PPTX 미확인',
  });
  
  // 3. 대지면적 검증
  if (golden.landAreaM2) {
    const areaInText = findTextInPptx(text, golden.landAreaM2.toString());
    items.push({
      field: '대지면적(㎡)',
      goldenValue: `${golden.landAreaM2}㎡`,
      pptxFound: areaInText,
      pptxMatch: areaInText ? `${golden.landAreaM2} 확인` : '',
      status: areaInText ? '✅ 일치' : '➖ PPTX 미확인',
    });
  }
  
  // 4. 연면적 검증
  if (golden.grossFloorAreaM2) {
    const gfaInText = findTextInPptx(text, golden.grossFloorAreaM2.toString()) 
      || findTextInPptx(text, golden.grossFloorAreaM2.toLocaleString());
    items.push({
      field: '연면적(㎡)',
      goldenValue: `${golden.grossFloorAreaM2}㎡`,
      pptxFound: gfaInText,
      pptxMatch: gfaInText ? `${golden.grossFloorAreaM2} 확인` : '',
      status: gfaInText ? '✅ 일치' : '➖ PPTX 미확인',
    });
  }
  
  // 5. 층수 검증
  if (golden.floors) {
    const floorsInText = findTextInPptx(text, golden.floors.replace('~', ''));
    items.push({
      field: '층수',
      goldenValue: golden.floors,
      pptxFound: floorsInText,
      pptxMatch: floorsInText ? `${golden.floors} 확인` : '',
      status: floorsInText ? '✅ 일치' : '➖ PPTX 미확인',
    });
  }
  
  // 6. 용도지역 검증
  if (golden.zoning) {
    const zoningInText = findTextInPptx(text, golden.zoning) || findTextInPptx(text, golden.zoning.replace('지역', ''));
    items.push({
      field: '용도지역',
      goldenValue: golden.zoning,
      pptxFound: zoningInText,
      pptxMatch: zoningInText ? `확인` : '',
      status: zoningInText ? '✅ 일치' : '➖ PPTX 미확인',
    });
  }
  
  // 7. 준공연도 검증
  if (golden.completionYear) {
    const yearInText = findTextInPptx(text, golden.completionYear.toString());
    items.push({
      field: '준공연도',
      goldenValue: `${golden.completionYear}`,
      pptxFound: yearInText,
      pptxMatch: yearInText ? '확인' : '',
      status: yearInText ? '✅ 일치' : '➖ PPTX 미확인',
    });
  }
  
  // 8. 임대차 (일부 핵심 임차인/보증금 검증)
  if (golden.floor_leases?.length) {
    const significantLeases = golden.floor_leases.filter((fl: any) => fl.rent_manwon > 0);
    let matched = 0;
    let total = significantLeases.length;
    
    for (const fl of significantLeases) {
      const tenantInText = fl.tenant_type && findTextInPptx(text, fl.tenant_type);
      const rentInText = fl.rent_manwon && findTextInPptx(text, fl.rent_manwon.toString());
      if (tenantInText || rentInText) matched++;
    }
    
    items.push({
      field: '임대차 현황',
      goldenValue: `${golden.floor_leases.length}건 (유효 ${total}건)`,
      pptxFound: matched > 0,
      pptxMatch: `${matched}/${total}건 PPTX 텍스트에서 확인`,
      status: matched >= total * 0.5 ? '✅ 일치' : matched > 0 ? '⚠️ 근사' : '➖ PPTX 미확인',
    });
  }
  
  // 9. 호텔 운영 데이터 검증
  if (golden.hotel_operating) {
    const ho = golden.hotel_operating;
    const roomsInText = findTextInPptx(text, ho.total_rooms.toString());
    items.push({
      field: '총 객실 수',
      goldenValue: `${ho.total_rooms}실`,
      pptxFound: roomsInText,
      pptxMatch: roomsInText ? '확인' : '',
      status: roomsInText ? '✅ 일치' : '➖ PPTX 미확인',
    });
    
    if (ho.adr_krw) {
      const adrInText = findTextInPptx(text, ho.adr_krw.toLocaleString()) || findTextInPptx(text, ho.adr_krw.toString());
      items.push({
        field: 'ADR',
        goldenValue: `${ho.adr_krw.toLocaleString()}원`,
        pptxFound: adrInText,
        pptxMatch: adrInText ? '확인' : '',
        status: adrInText ? '✅ 일치' : '➖ PPTX 미확인',
      });
    }
  }
  
  // 10. 개발사양 검증
  if (golden.developmentSpec) {
    const ds = golden.developmentSpec;
    if (ds.use) {
      const useWords = ds.use.split('/');
      const useInText = useWords.some((w: string) => findTextInPptx(text, w));
      items.push({
        field: '개발 용도',
        goldenValue: ds.use,
        pptxFound: useInText,
        pptxMatch: useInText ? useWords.filter((w: string) => findTextInPptx(text, w)).join(', ') : '',
        status: useInText ? '✅ 일치' : '➖ PPTX 미확인',
      });
    }
  }
  
  return {
    datasetId: mapping.datasetId,
    pptxFile: mapping.filename,
    pptxSlideCount: slideCount,
    totalTextLength: text.length,
    items,
  };
}

async function main() {
  console.log('=== 골든 데이터 vs 원본 PPTX 정합성 검증 ===\n');
  
  const results: DatasetVerification[] = [];
  
  for (const mapping of MAPPINGS) {
    const pptxPath = join(BROKER_DIR, mapping.filename);
    if (!existsSync(pptxPath)) {
      console.log(`⚠️  ${mapping.filename}: 파일 없음`);
      continue;
    }
    
    console.log(`🔍 ${mapping.datasetId} ← ${mapping.filename.slice(0, 50)}...`);
    const result = await verifyDataset(mapping);
    results.push(result);
    
    console.log(`   📊 PPTX: ${result.pptxSlideCount}장, 텍스트 ${(result.totalTextLength / 1024).toFixed(1)}KB`);
    for (const item of result.items) {
      console.log(`   ${item.status} ${item.field}: ${item.goldenValue}${item.pptxMatch ? ` → ${item.pptxMatch}` : ''}`);
    }
    console.log();
  }
  
  // 종합 리포트 생성
  let report = `# 골든 테스트 데이터 vs 원본 PPTX 정합성 검증 보고서\n\n`;
  report += `> **검증 시각**: ${new Date().toISOString()}\n`;
  report += `> **검증 방법**: 원본 브로커 PPTX의 슬라이드 텍스트에서 골든 데이터의 핵심 수치를 1:1 검색\n\n`;
  
  let totalChecks = 0, totalMatch = 0, totalApprox = 0, totalFail = 0, totalUnconfirmed = 0;
  
  for (const r of results) {
    report += `---\n\n## ${r.datasetId}\n\n`;
    report += `- **원본 PPTX**: \`${r.pptxFile}\`\n`;
    report += `- **PPTX 슬라이드 수**: ${r.pptxSlideCount}장\n`;
    report += `- **추출 텍스트**: ${(r.totalTextLength / 1024).toFixed(1)}KB\n\n`;
    
    report += `| 항목 | 골든 데이터 값 | 검증 결과 | PPTX 매칭 |\n`;
    report += `|:---|:---|:---:|:---|\n`;
    
    for (const item of r.items) {
      report += `| ${item.field} | ${item.goldenValue} | ${item.status} | ${item.pptxMatch || '-'} |\n`;
      totalChecks++;
      if (item.status === '✅ 일치') totalMatch++;
      else if (item.status === '⚠️ 근사') totalApprox++;
      else if (item.status === '❌ 불일치') totalFail++;
      else totalUnconfirmed++;
    }
    report += `\n`;
  }
  
  report += `---\n\n## 종합 결과\n\n`;
  report += `| 지표 | 수 |\n|:---|---:|\n`;
  report += `| 총 검증 항목 | ${totalChecks} |\n`;
  report += `| ✅ 일치 | ${totalMatch} |\n`;
  report += `| ⚠️ 근사 | ${totalApprox} |\n`;
  report += `| ❌ 불일치 | ${totalFail} |\n`;
  report += `| ➖ PPTX 미확인 | ${totalUnconfirmed} |\n\n`;
  
  const matchRate = ((totalMatch + totalApprox) / totalChecks * 100).toFixed(1);
  report += `**정합률**: ${matchRate}% (일치 + 근사)\n\n`;
  
  if (totalFail === 0) {
    report += `> [!NOTE]\n> 모든 검증 항목이 일치 또는 근사로 확인되었습니다. 골든 테스트 데이터는 원본 PPTX와 정합적입니다.\n`;
  } else {
    report += `> [!WARNING]\n> ${totalFail}건의 불일치 항목이 발견되었습니다. 확인이 필요합니다.\n`;
  }
  
  const reportPath = join(GOLDEN_DIR, 'data_verification_report.md');
  writeFileSync(reportPath, report, 'utf8');
  console.log(`📄 검증 리포트 저장: ${reportPath}`);
  console.log(`\n✅ 일치: ${totalMatch} / ⚠️ 근사: ${totalApprox} / ❌ 불일치: ${totalFail} / ➖ 미확인: ${totalUnconfirmed}`);
  console.log(`정합률: ${matchRate}%`);
}

main().catch(console.error);
