/**
 * PPTX 내부 슬라이드 콘텐츠 추출 스크립트
 * ZIP 구조를 파싱하여 각 슬라이드의 텍스트와 요소를 요약
 */
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const pptxDir = path.resolve(__dirname, '../docs/uat1/pptx-outputs');

async function extractSlideContent(pptxPath: string): Promise<{ slideNum: number; texts: string[] }[]> {
  const data = fs.readFileSync(pptxPath);
  const zip = await JSZip.loadAsync(data);

  const slides: { slideNum: number; texts: string[] }[] = [];

  // Find all slide XML files
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
      return numA - numB;
    });

  for (const slideFile of slideFiles) {
    const xml = await zip.files[slideFile].async('string');
    const slideNum = parseInt(slideFile.match(/slide(\d+)/)?.[1] || '0');

    // Extract all text content from <a:t> tags
    const textMatches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
    const texts = textMatches
      .map(m => m.replace(/<[^>]+>/g, '').trim())
      .filter(t => t.length > 0);

    // Check for images
    const hasImages = xml.includes('<p:pic') || xml.includes('r:embed');
    const hasShapes = (xml.match(/<p:sp /g) || []).length;
    const hasTables = xml.includes('<a:tbl');

    const summary = texts.slice(0, 15); // First 15 text elements
    if (hasImages) summary.push('[IMAGE]');
    if (hasTables) summary.push('[TABLE]');
    summary.push(`[${hasShapes} shapes]`);

    slides.push({ slideNum, texts: summary });
  }

  return slides;
}

async function main() {
  const pptxFiles = fs.readdirSync(pptxDir).filter(f => f.endsWith('.pptx'));
  const report: string[] = [];

  report.push('# UAT E2E v3 — PPTX 슬라이드 콘텐츠 검증 보고서\n');
  report.push(`> 생성일시: ${new Date().toISOString()}\n`);
  report.push('---\n');

  for (const file of pptxFiles) {
    const filePath = path.join(pptxDir, file);
    const stats = fs.statSync(filePath);
    const baseName = path.parse(file).name;

    report.push(`## ${baseName}\n`);
    report.push(`- **파일 크기**: ${Math.round(stats.size / 1024)}KB`);

    try {
      const slides = await extractSlideContent(filePath);
      report.push(`- **슬라이드 수**: ${slides.length}장\n`);

      for (const slide of slides) {
        report.push(`### Slide ${slide.slideNum}`);
        report.push('```');
        for (const text of slide.texts) {
          report.push(`  ${text}`);
        }
        report.push('```\n');
      }
    } catch (err: any) {
      report.push(`- **오류**: ${err.message}\n`);
    }

    report.push('---\n');
  }

  const reportPath = path.join(pptxDir, 'slide-content-report.md');
  fs.writeFileSync(reportPath, report.join('\n'));
  console.log(`📊 Report saved: ${reportPath}`);
  console.log(report.join('\n'));
}

main().catch(console.error);
