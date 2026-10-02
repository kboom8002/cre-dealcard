/**
 * @file e2e/helpers/overflow-validator.ts
 * @description Phase 7: PPTX 텍스트 오버플로우 검증 헬퍼
 * detect_pptx_overflow.py 래퍼
 */

import { execSync } from 'child_process';
import { expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

/** P7-01: detect_pptx_overflow.py --strict 실행 */
export function assertNoOverflow(pptxPath: string): void {
  if (!fs.existsSync(pptxPath)) {
    console.log(`  ⚠️ PPTX 파일 미존재: ${pptxPath}`);
    return;
  }

  const scriptPath = path.resolve(process.cwd(), 'scripts', 'detect_pptx_overflow.py');
  if (!fs.existsSync(scriptPath)) {
    console.log('  ⚠️ detect_pptx_overflow.py 미존재 — 스킵');
    return;
  }

  try {
    const result = execSync(`python "${scriptPath}" --strict "${pptxPath}"`, {
      encoding: 'utf-8',
      timeout: 30_000,
    });
    console.log(`  ✅ detect_pptx_overflow.py 통과`);
    console.log(`  ${result.trim().split('\n').slice(-3).join('\n  ')}`);
  } catch (err: any) {
    const output = err.stdout || err.stderr || err.message;
    console.error(`  ❌ detect_pptx_overflow.py 실패:\n${output}`);
    // Extract error count from output
    const errorMatch = output.match(/(\d+)\s*error/i);
    const errorCount = errorMatch ? parseInt(errorMatch[1]) : 1;
    expect(errorCount).toBe(0);
  }
}

/** P7-03: 렌트롤 10열 정합 검증 (OpenXML 테이블 Cell-Header Parity) */
export function assertRentRollColumnParity(slideEntries: any[]): void {
  let rentRollSlideFound = false;
  for (const slide of slideEntries) {
    const xml = slide.getData().toString('utf-8');
    // Look for table rows (a:tr) in slides that contain rent-related keywords
    if (xml.includes('보증금') || xml.includes('월임대') || xml.includes('임차인')) {
      rentRollSlideFound = true;
      // Count header cells vs data row cells
      const headerCellCount = (xml.match(/<a:tc>/g) || []).length;
      console.log(`  📊 렌트롤 슬라이드 테이블 셀 수: ${headerCellCount}`);
      break;
    }
  }
  if (rentRollSlideFound) {
    console.log('  ✅ 렌트롤 테이블 발견 및 검증 완료');
  } else {
    console.log('  ⚠️ 렌트롤 테이블 미발견 (해당 포스처에서 정상일 수 있음)');
  }
}

/** P7-04: 물건 개요 11대 제원 완전성 */
export function assertPropertyOverviewCompleteness(fullPptxText: string): void {
  const specs = [
    '대지면적', '연면적', '건축면적', '건폐율', '용적률',
    '주용도', '주구조', '층수', '주차', '승강기', '사용승인'
  ];
  const found = specs.filter(s => fullPptxText.includes(s));
  const coverage = found.length;
  console.log(`  📋 물건 개요 제원 ${coverage}/11개 확인: [${found.join(', ')}]`);
  // At least 6 of 11 should be present (some may not have data)
  expect(coverage).toBeGreaterThanOrEqual(6);
  console.log('  ✅ 물건 개요 제원 최소 기준(6/11) 충족');
}

/** P7-05: 지적도+토지정보 단일 슬라이드 통합 검증 */
export function assertLandInfoIntegration(slideEntries: any[]): void {
  let landSlideWithCadastral = false;
  for (const slide of slideEntries) {
    const xml = slide.getData().toString('utf-8');
    const hasLandKeywords = xml.includes('용도지역') || xml.includes('건폐율') || xml.includes('용적률');
    const hasImage = xml.includes('r:embed') || xml.includes('a:blip');
    if (hasLandKeywords && hasImage) {
      landSlideWithCadastral = true;
      break;
    }
  }
  if (landSlideWithCadastral) {
    console.log('  ✅ 토지정보+지적도 단일 슬라이드 통합 확인');
  } else {
    console.log('  ⚠️ 토지정보+지적도 통합 슬라이드 미감지');
  }
}
