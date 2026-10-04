/**
 * H4 — 골든 픽스처 lint (docs/golden-test-data/<property>/<round>/)
 *
 * 규칙 (모두 error):
 *  F01 expected.json / bottom_sheet.json 파싱 가능, posture 일치 · 유효
 *  F02 bottom_sheet 필수 필드 (address, askingPriceManwon > 0)
 *  F03 photos_v2 / photo_urls 가 가리키는 파일이 실제 존재
 *  F04 photos_v2: 중복 URL 없음, 대표(cover/isHero) 최대 1장, 제외되지 않은 사진은 category 필수 · 유효 카테고리
 *  F05 images/ 내 이미지 내용 중복(해시) 없음
 *  F06 images/ 에 이미지/README 외 파일 없음 (.lnk 등)
 *  F07 개인정보 패턴 (휴대폰/주민번호/이메일) 없음 — memo.txt, bottom_sheet.json
 *  F08 스톡/외부 이미지 파일명 패턴 없음
 *
 * 레거시 결함은 KNOWN_ISSUES 에 사유와 함께 등록한다 (수정되면 등록 해제하도록 test 가 실패).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { createHash } from 'crypto';
import { join } from 'path';
import { PHOTO_CATEGORY_LABELS } from '@/domain/building/mobile-im/photo-url-transformer';

const ROOT = process.cwd();
const DATA = join(ROOT, 'docs', 'golden-test-data');
const POSTURES = ['income', 'trading', 'owner_occupied', 'development', 'operating'];
const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

/** 레거시 예외: "<property>/<round>:<ruleId>" → 사유 */
const KNOWN_ISSUES: Record<string, string> = {};

interface Round { key: string; dir: string }

function rounds(): Round[] {
  if (!existsSync(DATA)) return [];
  const out: Round[] = [];
  for (const prop of readdirSync(DATA)) {
    const pdir = join(DATA, prop);
    if (!statSync(pdir).isDirectory()) continue;
    for (const r of readdirSync(pdir)) {
      const rdir = join(pdir, r);
      if (statSync(rdir).isDirectory()) out.push({ key: `${prop}/${r}`, dir: rdir });
    }
  }
  return out;
}

function readJson(p: string): any | null {
  try { return JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; }
}

function lint(round: Round): { rule: string; msg: string }[] {
  const v: { rule: string; msg: string }[] = [];
  const add = (rule: string, msg: string) => v.push({ rule, msg });

  const expected = readJson(join(round.dir, 'expected.json'));
  const bs = readJson(join(round.dir, 'bottom_sheet.json'));
  if (!expected) add('F01', 'expected.json 없음/파싱 실패');
  if (!bs) add('F01', 'bottom_sheet.json 없음/파싱 실패');
  if (expected && !POSTURES.includes(expected.posture)) add('F01', `expected.posture 유효하지 않음: ${expected.posture}`);
  if (expected && bs && bs.posture && bs.posture !== expected.posture) add('F01', `posture 불일치 expected=${expected.posture} bottom_sheet=${bs.posture}`);

  if (bs) {
    if (typeof bs.address !== 'string' || !bs.address.trim()) add('F02', 'address 누락');
    if (!(Number(bs.askingPriceManwon) > 0)) add('F02', 'askingPriceManwon 누락/0 이하');

    const v2: any[] = Array.isArray(bs.photos_v2) ? bs.photos_v2 : [];
    const urls = new Set<string>();
    let covers = 0;
    for (const p of v2) {
      const url: string = typeof p === 'string' ? p : p?.url;
      if (!url) { add('F03', 'photos_v2 항목에 url 없음'); continue; }
      if (!/^https?:/i.test(url) && !existsSync(join(ROOT, url))) add('F03', `photos_v2 파일 없음: ${url}`);
      if (urls.has(url)) add('F04', `photos_v2 URL 중복: ${url}`);
      urls.add(url);
      if (typeof p === 'object' && !p.excluded) {
        if (p.role === 'cover' || p.isHero) covers++;
        if (!p.category) add('F04', `제외되지 않은 사진에 category 없음: ${url}`);
        else if (!(p.category in PHOTO_CATEGORY_LABELS)) add('F04', `유효하지 않은 category=${p.category}: ${url}`);
      }
    }
    if (covers > 1) add('F04', `대표(cover/isHero) 사진이 ${covers}장 (최대 1장)`);

    for (const u of Array.isArray(bs.photo_urls) ? bs.photo_urls : []) {
      if (typeof u === 'string' && !/^https?:/i.test(u) && !existsSync(join(ROOT, u))) add('F03', `photo_urls 파일 없음: ${u}`);
    }
  }

  const imgDir = join(round.dir, 'images');
  if (existsSync(imgDir)) {
    const seen = new Map<string, string>();
    for (const f of readdirSync(imgDir)) {
      if (/^README\.md$/i.test(f)) continue;
      if (!IMAGE_EXT.test(f)) { add('F06', `images/ 에 이미지가 아닌 파일: ${f}`); continue; }
      if (/stock|unsplash|shutterstock|pexels|istock|gettyimages/i.test(f)) add('F08', `스톡/외부 이미지 파일명: ${f}`);
      const h = createHash('sha1').update(readFileSync(join(imgDir, f))).digest('hex');
      const prev = seen.get(h);
      if (prev) add('F05', `이미지 내용 중복: ${prev} == ${f}`);
      else seen.set(h, f);
    }
  }

  const piiTargets = ['memo.txt', 'bottom_sheet.json'];
  const PII: [string, RegExp][] = [
    ['휴대폰', /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/],
    ['주민번호', /\b\d{6}-[1-4]\d{6}\b/],
    ['이메일', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ];
  for (const t of piiTargets) {
    const fp = join(round.dir, t);
    if (!existsSync(fp)) continue;
    const text = readFileSync(fp, 'utf8');
    for (const [name, re] of PII) {
      const m = re.exec(text);
      if (m) add('F07', `${t} 에 ${name} 패턴: ${m[0].slice(0, 6)}***`);
    }
  }
  return v;
}

const all = rounds();

describe('H4 골든 픽스처 lint', () => {
  it('픽스처 라운드가 존재', () => {
    expect(all.length).toBeGreaterThan(0);
  });

  for (const r of all) {
    it(`${r.key}: 규칙 위반 0건 (KNOWN_ISSUES 제외)`, () => {
      const violations = lint(r);
      const unexpected = violations.filter(x => !KNOWN_ISSUES[`${r.key}:${x.rule}`]);
      expect(unexpected.map(x => `${x.rule} ${x.msg}`)).toEqual([]);
    });
  }

  it('KNOWN_ISSUES 는 아직 유효한 결함만 (해결되면 등록 해제)', () => {
    const stale: string[] = [];
    for (const key of Object.keys(KNOWN_ISSUES)) {
      const [rk, rule] = key.split(':');
      const r = all.find(x => x.key === rk);
      if (!r || !lint(r).some(x => x.rule === rule)) stale.push(key);
    }
    expect(stale).toEqual([]);
  });
});

describe('H4 fixture lint 자기검증 (의도적 결함 주입 → 반드시 탐지)', () => {
  it('결함이 있는 라운드는 F01~F08 을 탐지', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fx-'));
    try {
      mkdirSync(join(dir, 'images'));
      writeFileSync(join(dir, 'expected.json'), JSON.stringify({ posture: 'income' }));
      writeFileSync(join(dir, 'memo.txt'), '문의 010-1234-5678');
      writeFileSync(join(dir, 'bottom_sheet.json'), JSON.stringify({
        posture: 'trading',
        photos_v2: [
          { url: 'docs/golden-test-data/없는파일.jpg', category: 'exterior', role: 'cover' },
          { url: 'docs/golden-test-data/없는파일.jpg', role: 'cover', isHero: true },
          { url: 'docs/golden-test-data/없는파일2.jpg', category: 'not_a_category' },
        ],
      }));
      writeFileSync(join(dir, 'images', 'a.png'), 'same');
      writeFileSync(join(dir, 'images', 'b.png'), 'same');
      writeFileSync(join(dir, 'images', 'unsplash_1.jpg'), 'x');
      writeFileSync(join(dir, 'images', 'link.lnk'), 'x');
      const rules = new Set(lint({ key: 'x/y', dir }).map(v => v.rule));
      for (const r of ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08']) expect(rules.has(r), r).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});