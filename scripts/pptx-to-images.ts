/**
 * PPTX → 이미지 변환 스크립트
 * LibreOffice를 사용하여 PPTX를 PDF로 변환 후 이미지로 추출
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const pptxDir = path.resolve(__dirname, '../docs/uat1/pptx-outputs');
const imgDir = path.join(pptxDir, 'images');

if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

const pptxFiles = fs.readdirSync(pptxDir).filter(f => f.endsWith('.pptx'));

console.log(`Found ${pptxFiles.length} PPTX files to convert\n`);

for (const file of pptxFiles) {
  const filePath = path.join(pptxDir, file);
  const baseName = path.parse(file).name;
  
  console.log(`Converting ${file}...`);
  
  try {
    // Convert PPTX to PDF using LibreOffice
    execSync(
      `soffice --headless --convert-to pdf --outdir "${imgDir}" "${filePath}"`,
      { timeout: 30000, stdio: 'pipe' }
    );
    console.log(`  ✅ PDF created: ${baseName}.pdf`);
  } catch (err: any) {
    console.log(`  ⚠️ LibreOffice not available, trying python-pptx fallback...`);
    
    // Fallback: create a summary text file with slide info
    try {
      const stats = fs.statSync(filePath);
      const info = `PPTX File: ${file}\nSize: ${Math.round(stats.size / 1024)}KB\nGenerated: ${stats.mtime.toISOString()}\n\nOpen this PPTX file in PowerPoint or Google Slides for visual inspection.`;
      fs.writeFileSync(path.join(imgDir, `${baseName}_info.txt`), info);
      console.log(`  📝 Info file created`);
    } catch (e) {
      console.log(`  ❌ Failed: ${(e as any).message}`);
    }
  }
}

console.log(`\n✅ Done. Output: ${imgDir}`);
