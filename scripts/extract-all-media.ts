import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';

function extractMedia(pptxPath: string, outDir: string) {
  const zip = new AdmZip(pptxPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const entries = zip.getEntries();
  entries.forEach((e) => {
    if (e.entryName.startsWith('ppt/media/')) {
      const fileName = path.basename(e.entryName);
      const destPath = path.join(outDir, fileName);
      fs.writeFileSync(destPath, e.getData());
      console.log(`Extracted: ${destPath} (${(e.header.size / 1024).toFixed(1)} KB)`);
    }
  });
}

extractMedia('docs/real-broker-im/2507월 신사동 590 빌딩 매각.pptx', 'docs/test/real-broker-im/sinsa-media');
extractMedia('docs/real-broker-im/2509월 서초동 1364-28 매각 자료.pptx', 'docs/test/real-broker-im/seocho-media');
console.log('Done extracting media.');
