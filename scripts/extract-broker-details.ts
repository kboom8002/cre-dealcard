import AdmZip from 'adm-zip';
import * as path from 'path';

function extractDetailedTables(filePath: string) {
  console.log(`\n======================================================================`);
  console.log(`🔍 EXTRACTING: ${path.basename(filePath)}`);
  console.log(`======================================================================`);

  const zip = new AdmZip(filePath);
  const slideEntries = zip.getEntries()
    .filter((e) => e.entryName.startsWith('ppt/slides/slide') && e.entryName.endsWith('.xml'))
    .sort((a, b) => {
      const numA = parseInt(a.entryName.replace(/[^0-9]/g, ''), 10);
      const numB = parseInt(b.entryName.replace(/[^0-9]/g, ''), 10);
      return numA - numB;
    });

  slideEntries.forEach((entry, idx) => {
    const xml = entry.getData().toString('utf8');
    console.log(`\n==================== [Slide ${idx + 1}] ====================`);

    // Extract table rows if present
    if (xml.includes('<a:tbl')) {
      const rowMatches = xml.match(/<a:tr[\s\S]*?<\/a:tr>/g) || [];
      console.log(`--- Table Rows (${rowMatches.length} rows) ---`);
      rowMatches.forEach((rowXml, rIdx) => {
        const cellMatches = rowXml.match(/<a:tc[\s\S]*?<\/a:tc>/g) || [];
        const cellTexts = cellMatches.map((cellXml) => {
          const tMatches = cellXml.match(/<a:t[^>]*>(.*?)<\/a:t>/g) || [];
          return tMatches.map((t) => t.replace(/<[^>]+>/g, '').trim()).filter(Boolean).join(' ');
        });
        console.log(`Row ${rIdx + 1}: [ ${cellTexts.join(' | ')} ]`);
      });
    }

    // Also dump all non-table text blocks or paragraphs
    const paragraphs = xml.match(/<a:p[\s\S]*?<\/a:p>/g) || [];
    const pTexts: string[] = [];
    paragraphs.forEach((pXml) => {
      if (!pXml.includes('<a:tc')) {
        const tMatches = pXml.match(/<a:t[^>]*>(.*?)<\/a:t>/g) || [];
        const line = tMatches.map((t) => t.replace(/<[^>]+>/g, '').trim()).filter(Boolean).join(' ');
        if (line) pTexts.push(line);
      }
    });

    if (pTexts.length > 0) {
      console.log(`--- Paragraphs (${pTexts.length}) ---`);
      pTexts.forEach((pt) => console.log(`  - ${pt}`));
    }
  });
}

const dir = path.join(process.cwd(), 'docs', 'real-broker-im');
const files = [
  path.join(dir, '2507월 신사동 590 빌딩 매각.pptx'),
  path.join(dir, '2509월 서초동 1364-28 매각 자료.pptx'),
];

files.forEach(extractDetailedTables);
