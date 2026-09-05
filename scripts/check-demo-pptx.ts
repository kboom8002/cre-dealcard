import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

async function main() {
  const dir = path.resolve('docs/demo-output');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.pptx') && !f.startsWith('~$'));
  for (const f of files) {
    console.log(`\n========================================`);
    console.log(`📄 파일명: ${f}`);
    const filePath = path.join(dir, f);
    const stat = fs.statSync(filePath);
    console.log(`   크기: ${(stat.size / 1024).toFixed(1)} KB`);

    const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
    const slideFiles = Object.keys(zip.files)
      .filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)?.[0] || '0');
        const nb = parseInt(b.match(/\d+/)?.[0] || '0');
        return na - nb;
      });

    console.log(`   총 슬라이드 수: ${slideFiles.length}면`);
    for (const sf of slideFiles) {
      const xml = await zip.files[sf].async('string');
      const texts = (xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || [])
        .map(t => t.replace(/<[^>]+>/g, '').trim())
        .filter(Boolean);
      const title = texts[0] || '(제목 없음)';
      const preview = texts.slice(1, 6).join(' | ');
      console.log(`   * [슬라이드 ${sf.match(/\d+/)?.[0]}] ${title} -> ${preview.slice(0, 100)}`);
    }
  }
}

main().catch(console.error);
