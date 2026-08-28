import fs from 'fs';
import path from 'path';

interface GoldenResult {
  version: string;
  specimen: string;
  slideCount: number;
  warnings: string[];
  auditReport: {
    layoutViolations: string[];
    standardViolations: string[];
    totalViolations: number;
  };
}

function main() {
  const jsonPath = path.resolve('docs/test/golden/yangpyeong_golden_v6.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('골든 JSON 없음. generate-golden-im.ts를 먼저 실행하세요.');
    process.exit(1);
  }
  
  const golden: GoldenResult = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const checks: { name: string; pass: boolean; detail: string }[] = [];
  
  // G-1: 위반 0건
  checks.push({
    name: 'G-1: 레이아웃 위반 0건',
    pass: golden.auditReport.layoutViolations.length === 0,
    detail: `${golden.auditReport.layoutViolations.length}건`,
  });
  
  // G-2: 표준 위반 0건
  checks.push({
    name: 'G-2: 표준 위반 0건',
    pass: golden.auditReport.standardViolations.length === 0,
    detail: `${golden.auditReport.standardViolations.length}건`,
  });
  
  // G-3: 면수 범위 (8~16)
  checks.push({
    name: 'G-3: 면수 8~16',
    pass: golden.slideCount >= 8 && golden.slideCount <= 16,
    detail: `${golden.slideCount}면`,
  });
  
  // G-4: 치명적 경고 0건 (AUDIT 접두 제외)
  const criticalWarnings = golden.warnings.filter(w => !w.startsWith('[AUDIT]'));
  checks.push({
    name: 'G-4: 치명적 경고 0건',
    pass: criticalWarnings.length === 0,
    detail: `${criticalWarnings.length}건`,
  });
  
  // 결과 출력
  console.log('=== 골든 IM QA 검증 ===');
  let allPass = true;
  for (const c of checks) {
    const icon = c.pass ? '✅' : '❌';
    console.log(`${icon} ${c.name}: ${c.detail}`);
    if (!c.pass) allPass = false;
  }
  
  console.log(`\n총 ${checks.length}건 중 ${checks.filter(c=>c.pass).length}건 통과`);
  
  if (!allPass) {
    process.exit(1);
  }
}

main();
