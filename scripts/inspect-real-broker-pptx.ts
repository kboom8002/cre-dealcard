import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';

function inspectPptx(filePath: string) {
  console.log(`\n======================================================================`);
  console.log(`📄 Analyzing: ${path.basename(filePath)}`);
  console.log(`======================================================================`);

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }

  const zip = new AdmZip(filePath);
  const zipEntries = zip.getEntries();

  // Find slides
  const slideEntries = zipEntries
    .filter((e) => e.entryName.startsWith('ppt/slides/slide') && e.entryName.endsWith('.xml'))
    .sort((a, b) => {
      const numA = parseInt(a.entryName.replace(/[^0-9]/g, ''), 10);
      const numB = parseInt(b.entryName.replace(/[^0-9]/g, ''), 10);
      return numA - numB;
    });

  const mediaEntries = zipEntries.filter((e) => e.entryName.startsWith('ppt/media/'));

  console.log(`- Total Slides: ${slideEntries.length}`);
  console.log(`- Total Embedded Media Files: ${mediaEntries.length}`);

  slideEntries.forEach((entry, idx) => {
    const xml = entry.getData().toString('utf8');
    // Extract all <a:t> text nodes
    const texts: string[] = [];
    const textRegex = /<a:t[^>]*>(.*?)<\/a:t>/g;
    let match;
    while ((match = textRegex.exec(xml)) !== null) {
      if (match[1]?.trim()) {
        texts.push(match[1].trim());
      }
    }

    // Extract table rows if present
    const isTablePresent = xml.includes('<a:tbl');

    console.log(`\n--- [Slide ${idx + 1}] (Texts: ${texts.length}, HasTable: ${isTablePresent}) ---`);
    const preview = texts.join(' | ');
    console.log(preview.length > 300 ? preview.substring(0, 300) + '...' : preview);
  });
}

const dir = path.join(process.cwd(), 'docs', 'real-broker-im');
const files = [
  path.join(dir, '2507월 신사동 590 빌딩 매각.pptx'),
  path.join(dir, '2509월 서초동 1364-28 매각 자료.pptx'),
];

files.forEach(inspectPptx);
