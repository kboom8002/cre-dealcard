import { writeFileSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { InspectionResult } from './e2e-ai-inspector';

export interface CaseReport {
  caseName: string;
  caseLabel: string;
  posture: string;
  steps: Array<{ step: string; pass: boolean; detail: string; durationMs: number }>;
  inspections: InspectionResult[];
  artifacts: { pptxPath?: string; viewerPath?: string; captureDir?: string; sectionDir?: string };
  overallPass: boolean;
}

export interface FullReport {
  suiteName: string;
  executedAt: string;
  cases: CaseReport[];
  totalPass: number;
  totalFail: number;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function generateReport(report: FullReport, outputDir: string): void {
  console.log(`[Report-Generator] 리포트 생성 시작: ${report.suiteName}`);
  const mdPath = join(outputDir, `${report.suiteName}_e2e_report.md`);
  const htmlPath = join(outputDir, `${report.suiteName}_e2e_report.html`);

  // 1. Generate Markdown
  let md = `# E2E Test Report: ${report.suiteName}\n\n`;
  md += `**실행 일시:** ${report.executedAt}\n`;
  md += `**전체 결과:** 총 ${report.cases.length}개 케이스 (PASS: ${report.totalPass}, FAIL: ${report.totalFail})\n\n`;

  md += `## 요약 (Summary)\n`;
  md += `| Case Name | Label | Posture | Result |\n`;
  md += `|---|---|---|---|\n`;
  for (const c of report.cases) {
    md += `| ${c.caseName} | ${c.caseLabel} | ${c.posture} | ${c.overallPass ? '✅ PASS' : '❌ FAIL'} |\n`;
  }
  md += `\n`;

  for (const c of report.cases) {
    md += `## Case: ${c.caseName} (${c.caseLabel})\n`;
    md += `- **Posture**: ${c.posture}\n`;
    md += `- **Result**: ${c.overallPass ? '✅ PASS' : '❌ FAIL'}\n`;
    md += `- **Artifacts**:\n`;
    if (c.artifacts.pptxPath) md += `  - PPTX: [${basename(c.artifacts.pptxPath)}](${c.artifacts.pptxPath})\n`;
    if (c.artifacts.viewerPath) md += `  - Viewer: [${basename(c.artifacts.viewerPath)}](${c.artifacts.viewerPath})\n`;
    
    md += `\n### 수행 단계 (Steps)\n`;
    md += `| Step | Pass | Detail | Duration |\n`;
    md += `|---|---|---|---|\n`;
    for (const step of c.steps) {
      md += `| ${step.step} | ${step.pass ? '✅' : '❌'} | ${step.detail} | ${formatDuration(step.durationMs)} |\n`;
    }
    
    md += `\n### 검사 결과 (Inspections)\n`;
    md += `| Criterion | Label | Pass | Detail |\n`;
    md += `|---|---|---|---|\n`;
    for (const insp of c.inspections) {
      md += `| ${insp.criterion} | ${insp.label} | ${insp.pass ? '✅' : '❌'} | ${insp.detail} |\n`;
    }
    md += `\n---\n\n`;
  }

  try {
    writeFileSync(mdPath, md, 'utf-8');
    console.log(`[Report-Generator] Markdown 리포트 저장 완료: ${mdPath}`);
  } catch (error) {
    console.error(`[Report-Generator] Markdown 저장 실패:`, error);
  }

  // 2. Generate HTML
  let html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>E2E Report - ${report.suiteName}</title>
  <style>
    body { background-color: #121212; color: #e0e0e0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; line-height: 1.6; }
    h1, h2, h3 { color: #ffffff; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; background-color: #1a1a1a; }
    th, td { border: 1px solid #333; padding: 10px 14px; text-align: left; }
    th { background-color: #2c2c2c; font-weight: 600; }
    .pass { color: #81c784; font-weight: bold; }
    .fail { color: #e57373; font-weight: bold; }
    .card { background-color: #1e1e1e; border: 1px solid #333; border-radius: 8px; padding: 20px; margin-bottom: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    .badge-pass { background-color: rgba(129, 199, 132, 0.15); color: #81c784; padding: 4px 8px; border-radius: 4px; font-size: 0.85em; font-weight: 600; border: 1px solid rgba(129, 199, 132, 0.3); }
    .badge-fail { background-color: rgba(229, 115, 115, 0.15); color: #e57373; padding: 4px 8px; border-radius: 4px; font-size: 0.85em; font-weight: 600; border: 1px solid rgba(229, 115, 115, 0.3); }
    a { color: #64b5f6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px; margin-top: 15px; }
    .image-grid img { width: 100%; border-radius: 6px; border: 1px solid #444; transition: transform 0.2s; }
    .image-grid img:hover { transform: scale(1.02); }
  </style>
</head>
<body>
  <h1>E2E Test Report: ${report.suiteName}</h1>
  <div class="card" style="padding: 15px;">
    <p style="margin: 5px 0;"><strong>실행 일시:</strong> ${report.executedAt}</p>
    <p style="margin: 5px 0;"><strong>전체 결과:</strong> 총 ${report.cases.length}개 케이스 (PASS: <span class="pass">${report.totalPass}</span>, FAIL: <span class="fail">${report.totalFail}</span>)</p>
  </div>

  <h2>요약 (Summary)</h2>
  <table>
    <tr><th>Case Name</th><th>Label</th><th>Posture</th><th>Result</th></tr>`;
  for (const c of report.cases) {
    html += `<tr>
      <td>${c.caseName}</td>
      <td>${c.caseLabel}</td>
      <td>${c.posture}</td>
      <td>${c.overallPass ? '<span class="badge-pass">PASS</span>' : '<span class="badge-fail">FAIL</span>'}</td>
    </tr>`;
  }
  html += `</table>`;

  for (const c of report.cases) {
    html += `<div class="card">
      <h2 style="margin-top: 0;">Case: ${c.caseName} <span style="font-size: 0.7em; color: #aaa; font-weight: normal;">(${c.caseLabel})</span></h2>
      <p style="margin: 5px 0;"><strong>Posture:</strong> ${c.posture}</p>
      <p style="margin: 5px 0;"><strong>Result:</strong> ${c.overallPass ? '<span class="badge-pass">PASS</span>' : '<span class="badge-fail">FAIL</span>'}</p>
      <p style="margin: 15px 0 5px 0;"><strong>Artifacts:</strong></p>
      <ul style="margin-top: 5px;">`;
    if (c.artifacts.pptxPath) html += `<li>PPTX: <a href="file://${c.artifacts.pptxPath}">${basename(c.artifacts.pptxPath)}</a></li>`;
    if (c.artifacts.viewerPath) html += `<li>Viewer: <a href="file://${c.artifacts.viewerPath}">${basename(c.artifacts.viewerPath)}</a></li>`;
    html += `</ul>`;

    html += `<h3>수행 단계 (Steps)</h3>
      <table>
        <tr><th>Step</th><th style="width: 80px;">Pass</th><th>Detail</th><th style="width: 100px;">Duration</th></tr>`;
    for (const step of c.steps) {
      html += `<tr>
        <td>${step.step}</td>
        <td>${step.pass ? '<span class="pass">✓ PASS</span>' : '<span class="fail">✗ FAIL</span>'}</td>
        <td>${step.detail}</td>
        <td>${formatDuration(step.durationMs)}</td>
      </tr>`;
    }
    html += `</table>`;

    html += `<h3>검사 결과 (Inspections)</h3>
      <table>
        <tr><th style="width: 150px;">Criterion</th><th style="width: 250px;">Label</th><th style="width: 80px;">Pass</th><th>Detail</th></tr>`;
    for (const insp of c.inspections) {
      html += `<tr>
        <td>${insp.criterion}</td>
        <td>${insp.label}</td>
        <td>${insp.pass ? '<span class="pass">✓ PASS</span>' : '<span class="fail">✗ FAIL</span>'}</td>
        <td>${insp.detail}</td>
      </tr>`;
    }
    html += `</table>`;

    if (c.artifacts.captureDir && existsSync(c.artifacts.captureDir)) {
      try {
        const files = readdirSync(c.artifacts.captureDir).filter(f => f.endsWith('.png'));
        if (files.length > 0) {
          html += `<h3>캡처 이미지 (Captures)</h3><div class="image-grid">`;
          for (const f of files) {
            const imgPath = join(c.artifacts.captureDir, f);
            html += `<a href="file://${imgPath}" target="_blank"><img src="file://${imgPath}" alt="${f}" title="${f}" /></a>`;
          }
          html += `</div>`;
        }
      } catch(e) {
        console.error('[Report-Generator] 이미지 로드 중 에러:', e);
      }
    }
    
    html += `</div>`;
  }

  html += `</body></html>`;
  
  try {
    writeFileSync(htmlPath, html, 'utf-8');
    console.log(`[Report-Generator] HTML 리포트 저장 완료: ${htmlPath}`);
  } catch (error) {
    console.error(`[Report-Generator] HTML 저장 실패:`, error);
  }

  console.log('[Report-Generator] 리포트 생성 종료');
}
