/**
 * extract-pptx-images.ts
 * 
 * 실제 브로커 원본 PPTX에서 이미지를 추출하여 골든 테스트 데이터셋 이미지 폴더에 저장합니다.
 * PPTX는 ZIP 형식이므로 JSZip으로 ppt/media/ 내 이미지를 추출합니다.
 * 
 * 실행: npx tsx docs/golden-test-data/extract-pptx-images.ts
 */

import JSZip from 'jszip';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, basename, extname } from 'path';

const BROKER_DIR = join(process.cwd(), 'docs', 'real-broker-im');
const GOLDEN_DIR = join(process.cwd(), 'docs', 'golden-test-data');

// PPTX → 골든 데이터셋 매핑
const PPTX_MAPPING: Record<string, { datasetId: string; resolutions: string[] }> = {
  '2505월 당산동5가 11-47 근생빌딩 매각(임대료조정포함).pptx': {
    datasetId: 'p1-dangsan-income',
    resolutions: ['r1-draft', 'r2-standard', 'r3-verified'],
  },
  '2507월 신사동 590 빌딩 매각.pptx': {
    datasetId: 'p2-sinsa-trading',
    resolutions: ['r1-draft', 'r3-verified'],
  },
  '2509월 서초동 1364-28 매각 자료.pptx': {
    datasetId: 'p3-seocho-owner',
    resolutions: ['r1-draft', 'r3-verified'],
  },
  '특SALE_IM_잠원동26-14,16번지_두원빌딩(약242억) (1).pptx': {
    datasetId: 'p4-jamwon-dev',
    resolutions: ['r1-draft', 'r2-standard', 'r3-verified'],
  },
  '양평동4가117(더레드빌딩).pptx': {
    datasetId: 'p5-yangpyeong-income',
    resolutions: ['r1-draft', 'r2-standard', 'r3-verified'],
  },
  '에이치에비뉴호텔(이대점).pptx': {
    datasetId: 'p6-hotel-operating',
    resolutions: ['r1-draft', 'r2-standard'],
  },
  '수택동419-19외2필지.pptx': {
    datasetId: 'p7-sutaek-dev',
    resolutions: ['r1-draft', 'r2-standard'],
  },
};

// 이미지 확장자 필터
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp', '.emf', '.wmf']);

// 최소 파일 크기 (아이콘/UI 요소 필터링) — 10KB 이상만 추출
const MIN_IMAGE_SIZE = 10 * 1024;

interface ExtractionResult {
  pptxFile: string;
  datasetId: string;
  totalMediaFiles: number;
  extractedImages: number;
  skippedSmall: number;
  skippedNonImage: number;
  imageList: string[];
}

async function extractImagesFromPptx(pptxPath: string, mapping: { datasetId: string; resolutions: string[] }): Promise<ExtractionResult> {
  const pptxName = basename(pptxPath);
  const result: ExtractionResult = {
    pptxFile: pptxName,
    datasetId: mapping.datasetId,
    totalMediaFiles: 0,
    extractedImages: 0,
    skippedSmall: 0,
    skippedNonImage: 0,
    imageList: [],
  };

  const data = readFileSync(pptxPath);
  const zip = await JSZip.loadAsync(data);

  // ppt/media/ 내 파일 추출
  const mediaFiles: { name: string; data: Buffer }[] = [];
  for (const [path, file] of Object.entries(zip.files)) {
    if (path.startsWith('ppt/media/') && !file.dir) {
      result.totalMediaFiles++;
      const ext = extname(path).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) {
        result.skippedNonImage++;
        continue;
      }
      const buf = await file.async('nodebuffer');
      if (buf.length < MIN_IMAGE_SIZE) {
        result.skippedSmall++;
        continue;
      }
      mediaFiles.push({ name: basename(path), data: buf });
    }
  }

  // 크기순 정렬 (큰 이미지 = 더 중요한 사진일 가능성 높음)
  mediaFiles.sort((a, b) => b.data.length - a.data.length);

  // 파일명 정규화: image_01.jpg, image_02.png, ...
  const renamedFiles = mediaFiles.map((f, idx) => {
    const ext = extname(f.name).toLowerCase();
    const newName = `image_${String(idx + 1).padStart(2, '0')}${ext}`;
    return { ...f, newName };
  });

  // 각 해상도 폴더에 이미지 저장
  for (const res of mapping.resolutions) {
    const imgDir = join(GOLDEN_DIR, mapping.datasetId, res, 'images');
    if (!existsSync(imgDir)) mkdirSync(imgDir, { recursive: true });

    for (const f of renamedFiles) {
      writeFileSync(join(imgDir, f.newName), f.data);
    }
  }

  result.extractedImages = renamedFiles.length;
  result.imageList = renamedFiles.map(f => `${f.newName} (${(f.data.length / 1024).toFixed(0)}KB, 원본: ${f.name})`);

  return result;
}

async function main() {
  console.log('=== PPTX 이미지 추출 → 골든 데이터셋 저장 ===\n');

  const results: ExtractionResult[] = [];

  for (const [filename, mapping] of Object.entries(PPTX_MAPPING)) {
    const pptxPath = join(BROKER_DIR, filename);
    if (!existsSync(pptxPath)) {
      console.log(`⚠️  ${filename}: 파일 없음, 건너뜀`);
      continue;
    }

    console.log(`📦 ${filename}`);
    console.log(`   → ${mapping.datasetId} (${mapping.resolutions.join(', ')})`);

    try {
      const result = await extractImagesFromPptx(pptxPath, mapping);
      results.push(result);
      console.log(`   ✅ ${result.extractedImages}장 추출 (총 ${result.totalMediaFiles}개 미디어, ${result.skippedSmall}개 소형 스킵, ${result.skippedNonImage}개 비이미지 스킵)`);
      if (result.imageList.length <= 10) {
        result.imageList.forEach(img => console.log(`      📸 ${img}`));
      } else {
        result.imageList.slice(0, 5).forEach(img => console.log(`      📸 ${img}`));
        console.log(`      ... 외 ${result.imageList.length - 5}장`);
      }
    } catch (err: any) {
      console.log(`   ❌ 에러: ${err.message}`);
    }
    console.log();
  }

  // 결과 리포트 생성
  let report = `# PPTX 이미지 추출 보고서\n\n`;
  report += `> **실행 시각**: ${new Date().toISOString()}\n\n`;
  report += `## 요약\n\n`;
  report += `| PPTX 원본 | 데이터셋 | 미디어 총수 | 추출 이미지 | 소형 스킵 | 비이미지 스킵 |\n`;
  report += `|:---|:---|---:|---:|---:|---:|\n`;
  let totalExtracted = 0;
  for (const r of results) {
    report += `| ${r.pptxFile.slice(0, 40)}... | ${r.datasetId} | ${r.totalMediaFiles} | ${r.extractedImages} | ${r.skippedSmall} | ${r.skippedNonImage} |\n`;
    totalExtracted += r.extractedImages;
  }
  report += `\n**총 추출**: ${totalExtracted}장\n\n`;

  report += `## 상세 이미지 목록\n\n`;
  for (const r of results) {
    report += `### ${r.datasetId}\n\n`;
    report += `원본: \`${r.pptxFile}\`\n\n`;
    if (r.imageList.length === 0) {
      report += `이미지 없음\n\n`;
    } else {
      report += `| # | 파일명 | 크기 | 원본 |\n|---:|:---|---:|:---|\n`;
      r.imageList.forEach((img, idx) => {
        const match = img.match(/^(.+?) \((.+?), 원본: (.+?)\)$/);
        if (match) {
          report += `| ${idx + 1} | ${match[1]} | ${match[2]} | ${match[3]} |\n`;
        }
      });
      report += `\n`;
    }
  }

  const reportPath = join(GOLDEN_DIR, 'image_extraction_report.md');
  writeFileSync(reportPath, report, 'utf8');
  console.log(`\n📄 리포트 저장: ${reportPath}`);
  console.log(`\n=== 완료: 총 ${totalExtracted}장 이미지 추출 ===`);
}

main().catch(console.error);
