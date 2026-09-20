/**
 * add-memo-to-md.ts
 * memo.txt 내용을 각 bottom_sheet_입력항목.md에 "브로커 메모 (원본)" 섹션으로 추가
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const BASE = join(process.cwd(), 'docs', 'golden-test-data');

const DATASETS = [
  { id: 'p1-dangsan-income', resolutions: ['r1-draft', 'r2-standard', 'r3-verified'] },
  { id: 'p2-sinsa-trading', resolutions: ['r1-draft', 'r3-verified'] },
  { id: 'p3-seocho-owner', resolutions: ['r1-draft', 'r3-verified'] },
  { id: 'p4-jamwon-dev', resolutions: ['r1-draft', 'r2-standard', 'r3-verified'] },
  { id: 'p5-yangpyeong-income', resolutions: ['r1-draft', 'r2-standard', 'r3-verified'] },
  { id: 'p6-hotel-operating', resolutions: ['r1-draft', 'r2-standard'] },
  { id: 'p7-sutaek-dev', resolutions: ['r1-draft', 'r2-standard'] },
];

let count = 0;
for (const ds of DATASETS) {
  for (const res of ds.resolutions) {
    const dir = join(BASE, ds.id, res);
    const memoPath = join(dir, 'memo.txt');
    const mdPath = join(dir, 'bottom_sheet_입력항목.md');

    if (!existsSync(memoPath) || !existsSync(mdPath)) continue;

    const memo = readFileSync(memoPath, 'utf8').trim();
    let md = readFileSync(mdPath, 'utf8');

    // 이미 브로커 메모가 있으면 건너뜀
    if (md.includes('브로커 메모')) continue;

    // "검증 기준" 섹션 바로 앞에 브로커 메모 삽입
    const insertPoint = md.indexOf('## 검증 기준');
    if (insertPoint === -1) {
      // 끝에 추가
      md += `\n## 브로커 메모 (원본)\n\n\`\`\`\n${memo}\n\`\`\`\n\n`;
    } else {
      md = md.slice(0, insertPoint) +
        `## 브로커 메모 (원본)\n\n\`\`\`\n${memo}\n\`\`\`\n\n` +
        md.slice(insertPoint);
    }

    writeFileSync(mdPath, md, 'utf8');
    console.log(`  ✅ ${ds.id}/${res}: 메모 추가`);
    count++;
  }
}
console.log(`\n완료: ${count}개 MD 파일에 브로커 메모 추가`);
