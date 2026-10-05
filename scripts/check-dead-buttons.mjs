#!/usr/bin/env node
/**
 * scripts/check-dead-buttons.mjs — 에디터의 "눌러도 아무 일도 없는 버튼" 정적 검사 (E-02)
 *
 * <button> / <motion.button> 중 onClick 도 없고 type="submit" 도 아니고 {...props} 스프레드도 없는 것을 찾는다.
 * 대상: src/components/magazine-editor, src/app/(broker)/broker/magazine-editor
 * 사용: node scripts/check-dead-buttons.mjs [경로...]   (발견 시 exit 1)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TARGETS = ['src/components/magazine-editor', 'src/app/(broker)/broker/magazine-editor'];

/** JSX 여는 태그의 끝(`>`)을 찾는다. 중괄호/따옴표 안의 `>` 는 무시. */
function findTagEnd(src, from) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote && src[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || (ch === '`' && depth > 0)) {
      quote = ch;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) return i;
  }
  return -1;
}

/** 소스 문자열에서 죽은 버튼 목록을 반환한다. */
export function findDeadButtons(src) {
  const hits = [];
  const re = /<(?:motion\.)?button\b/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const end = findTagEnd(src, m.index + m[0].length);
    if (end === -1) continue;
    const tag = src.slice(m.index, end + 1);
    const alive = /\bonClick\s*=/.test(tag) || /\btype\s*=\s*["']submit["']/.test(tag) || /\{\s*\.\.\./.test(tag);
    if (!alive) {
      const line = src.slice(0, m.index).split('\n').length;
      hits.push({ line, tag: tag.replace(/\s+/g, ' ').slice(0, 120) });
    }
  }
  return hits;
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|jsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
}

export function scanTargets(targets, cwd = process.cwd()) {
  const files = [];
  for (const t of targets) walk(resolve(cwd, t), files);
  const results = [];
  for (const f of files) {
    const hits = findDeadButtons(readFileSync(f, 'utf8'));
    for (const h of hits) results.push({ file: relative(cwd, f).replace(/\\/g, '/'), ...h });
  }
  return { files: files.length, results };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const targets = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_TARGETS;
  const { files, results } = scanTargets(targets);
  if (results.length === 0) {
    console.log(`dead-buttons: 0 hits (${files} files scanned)`);
    process.exit(0);
  }
  console.log(`dead-buttons: ${results.length} hit(s) in ${files} files`);
  for (const r of results) console.log(`  ${r.file}:${r.line}  ${r.tag}`);
  process.exit(1);
}
