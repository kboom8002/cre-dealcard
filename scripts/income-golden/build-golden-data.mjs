/**
 * income 골든 데이터 생성기
 *
 *   node scripts/income-golden/build-golden-data.mjs [--extract <dir>] [--only ig1,ig3] [--skip-images]
 *                                                    [--out <dir>] [--no-recalc]
 *
 * 입력 : scripts/income-golden/golden-specs.mjs, docs/income-im/*.pptx (읽기 전용),
 *        docs/CREDEAL_rentroll_template_v1.5.xlsx  (렌트롤 표준 양식 v1.5 — 정본. 없으면 public/ 사본)
 *        --extract <dir> : extract_im_assets.py 산출 폴더(하위 ig1..ig4/source_extract.md) — 선택
 *        --out <dir>     : 출력 루트 변경(기본 docs/income-golden-data) — 기존 산출물과 diff 할 때 사용
 *        --no-recalc     : LibreOffice 재계산 생략(수식 캐시 없는 파일 — 디버그용)
 * 출력 : docs/income-golden-data/
 *          README.md
 *          <id>/images/NN_<category>_<캡션>.<ext>       (바텀시트 사진 입력)
 *          <id>/reference/<이름>.<ext>                  (위치도·지적·시세표 등 비사진 자료)
 *          <id>/reference/source_extract.md             (원본 pptx 텍스트 추출)
 *          <id>/defects.md                              (원본 결함 ↔ 보완 대조)
 *          <id>/<variant>/memo.txt
 *          <id>/<variant>/bottom_sheet.json            (golden-test-factory 호환)
 *          <id>/<variant>/bottom_sheet_입력항목.md
 *          <id>/<variant>/CREDEAL_rentroll_<id>_<variant>.xlsx  (표준 양식 v1.5)
 *          <id>/<variant>/expected.json
 *
 * 렌트롤 xlsx (v1.5) 작성 규칙 — 스펙 docs/RENTROLL_v1.3_to_v1.5.md
 *  - A..P 입력 열 매핑은 v1.3 과 동일. 예시 행(13행)과 A..P·Z..AB 전 행을 비운다.
 *  - 수식 캐시(Q..AF, C6, C10/D10/AE10, 머리글 C12/D12 등 전 시트)를 모두 지우고 LibreOffice 로 재계산해 캐시를 채운다.
 *    (파서는 캐시를 읽지 않는다 — 캐시 없는 파일도 위치+G9 로 직접 ㎡ 환산한다. verify-rentroll-xlsx.ts 가 이 동치를 검증)
 *  - G9 면적 단위: 변형 기본 '㎡'. 평 변형(`areaUnit:'pyeong'`)은 C/D = ㎡/3.305785 (소수 2자리).
 *    `rawSqmNumbers` 변형(unit-confusion)은 G9='평' 인데 ㎡ 숫자를 그대로 적는다(V12 차단 재현).
 *    원본 IM 이 평 문자열('78평')뿐인 as-is(ig2)는 G9='평' + 숫자(78)로 옮긴다(원본 단위 그대로).
 *  - C5 렌트롤 기준일: 원본 IM 에는 월 단위 작성일(imDate)뿐이라 일 단위 기준일이 없다 → 모든 변형에 골든 캡처 기준일(AS_OF)을 고정.
 *    (비워 두면 평가 기준일이 TODAY() 가 되어 만기·갱신권 판정이 실행일마다 달라진다.) 작성일(C9)은 as-is=IM 작성월 1일.
 *  - J3 매각희망가(원) = 명세 askingPriceManwon × 10,000. J4 연면적(㎡) = 명세 register.totArea (건축물대장 검증값; 환산 없음).
 *  - Z/AA/AB(근거·렌트프리·입금)는 원본 IM 에 근거가 없으므로 비운다. J5~J8(시장 임대료·기타수입)도 비운다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { GOLDEN_SPECS, AS_OF } from './golden-specs.mjs';
import { recalcWithLibreOffice, clearFormulaCaches } from './lo-recalc.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const OUT_ROOT = argVal('--out') ? path.resolve(argVal('--out')) : path.join(ROOT, 'docs', 'income-golden-data');
const SRC_DIR = path.join(ROOT, 'docs', 'income-im');
const TEMPLATE_DOCS = path.join(ROOT, 'docs', 'CREDEAL_rentroll_template_v1.5.xlsx');
const TEMPLATE = fs.existsSync(TEMPLATE_DOCS) ? TEMPLATE_DOCS : path.join(ROOT, 'public', 'CREDEAL_rentroll_template_v1.5.xlsx');
const REL_OUT = 'docs/income-golden-data';

const EXTRACT_DIR = argVal('--extract');
const ONLY = argVal('--only')?.split(',').map((s) => s.trim());
const SKIP_IMAGES = args.includes('--skip-images');
const NO_RECALC = args.includes('--no-recalc');

const PYEONG = 0.3025;
/** 평 → ㎡ 환산 계수 (렌트롤 템플릿 AE/AF 수식과 동일) */
const P2S = 3.305785;
/** 변형 이름 → 데이터 기준 변형 (파생 변형 corrected-pyeong·unit-confusion 은 base:'corrected') */
const baseOf = (variantName, variant) => variant?.base ?? variantName;
const pad = (n) => String(n).padStart(2, '0');
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => (n == null ? '' : Number(n).toLocaleString('ko-KR'));

/** YYYY-MM-DD + m개월. 원래 날짜가 월말이면 이동 후에도 월말 유지. */
function shiftYmd(s, months) {
  if (!s || !months) return s;
  const [y, mo, d] = s.split('-').map(Number);
  const lastOf = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).getUTCDate(); // mm: 1-based
  const wasMonthEnd = d === lastOf(y, mo);
  const t = y * 12 + (mo - 1) + months;
  const ny = Math.floor(t / 12);
  const nm = (t % 12) + 1;
  const nd = wasMonthEnd ? lastOf(ny, nm) : Math.min(d, lastOf(ny, nm));
  return `${ny}-${pad(nm)}-${pad(nd)}`;
}
const toDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };

function setKey(id) { return id.split('-')[0]; } // 'ig1'

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

// ─────────────────────────────────────────────────────────────
// 변형별 임대 행 정규화
// ─────────────────────────────────────────────────────────────
function normalizeLeases(spec, variantName, variant) {
  const doShift = baseOf(variantName, variant) === 'corrected' && !variant.noDateShift;
  const m = doShift ? spec.shiftMonths : 0;
  return variant.leases.map((l) => ({
    ...l,
    first: l.first ? shiftYmd(l.first, m) : undefined,
    start: l.start ? shiftYmd(l.start, m) : undefined,
    end: l.end ? shiftYmd(l.end, m) : undefined,
  }));
}

/** 실수입 합계 — 임대중 행만 (공실·자가사용 제외) */
function incomeTotals(leases) {
  let deposit = 0, rent = 0, mgmt = 0;
  for (const l of leases) {
    if (l.state !== '임대중') continue;
    deposit += l.dep || 0; rent += l.rent || 0; mgmt += l.mgmt || 0;
  }
  return { deposit, rent, mgmt };
}
/** 렌트롤에 적힌 모든 금액의 단순 합 (as-is 괄호 금액 포함) */
function rawTotals(leases) {
  let deposit = 0, rent = 0;
  for (const l of leases) { deposit += l.dep || 0; rent += l.rent || 0; }
  return { deposit, rent };
}
const capRate = (rentManwon, priceManwon, depositManwon) =>
  r2((rentManwon * 12) / (priceManwon - depositManwon) * 100);

// ─────────────────────────────────────────────────────────────
// 이미지
// ─────────────────────────────────────────────────────────────
function findPptx(prefix) {
  const f = fs.readdirSync(SRC_DIR).find((n) => n.startsWith(prefix) && n.toLowerCase().endsWith('.pptx'));
  if (!f) throw new Error(`원본 pptx 없음: prefix=${prefix}`);
  return path.join(SRC_DIR, f);
}
const extOf = (media) => path.extname(media).toLowerCase().replace('.jpeg', '.jpeg');

async function copyMedia(spec, setDir) {
  const zip = await JSZip.loadAsync(fs.readFileSync(findPptx(spec.sourcePrefix)));
  const pull = async (media, dest) => {
    const entry = zip.file(`ppt/media/${media}`);
    if (!entry) throw new Error(`${spec.id}: ppt/media/${media} 없음`);
    writeFile(dest, await entry.async('nodebuffer'));
  };
  for (const img of spec.images) await pull(img.media, path.join(setDir, 'images', `${img.file}${extOf(img.media)}`));
  for (const ref of spec.references) await pull(ref.media, path.join(setDir, 'reference', `${ref.file}${extOf(ref.media)}`));
}

function photosV2(spec) {
  return spec.images.map((img, i) => ({
    url: `${REL_OUT}/${spec.id}/images/${img.file}${extOf(img.media)}`,
    category: img.category,
    caption: img.caption,
    isHero: !!img.isHero,
    role: img.role || (img.isHero ? 'exterior' : 'general'),
    order: i,
  }));
}

// ─────────────────────────────────────────────────────────────
// 렌트롤 xlsx (표준 양식 v1.5)
// ─────────────────────────────────────────────────────────────
const COL = { floor: 1, group: 2, area: 3, excl: 4, tenant: 5, law: 6, dep: 7, rent: 8, mgmt: 9, first: 10, start: 11, end: 12, renewal: 13, opposing: 14, state: 15, note: 16 };
/** v1.4+ 입력 열 Z(26)·AA(27)·AB(28) — 원본 IM 근거가 없으므로 비워 둔다 */
const V14_INPUT_COLS = [26, 27, 28];
const FIRST_ROW = 13, LAST_ROW = 112;

/** '78평' 처럼 평 접미사 숫자만 있는 원문 문자열 → 숫자 (아니면 null) */
const pyeongTextNumber = (t) => { const m = /^\s*([\d.,]+)\s*평\s*$/.exec(String(t ?? '')); return m ? Number(m[1].replace(/,/g, '')) : null; };

/**
 * 변형의 면적 입력 단위(G9) 결정.
 *  - variant.areaUnit 명시 → 그대로 ('pyeong' | 'sqm')
 *  - 숫자 면적이 없고 원문 문자열이 모두 'N평' 이면(ig2 as-is) 원본 단위 그대로 'pyeong'
 *  - 그 외 'sqm'
 */
function resolveAreaUnit(variant, leases) {
  if (variant.areaUnit) return variant.areaUnit;
  const withText = leases.filter((l) => l.area == null && l.areaText);
  if (withText.length && leases.every((l) => l.area == null) && withText.every((l) => pyeongTextNumber(l.areaText) != null)) return 'pyeong';
  return 'sqm';
}

/** xlsx C/D 칸에 적는 면적 값 (㎡ 정본 → 입력 단위). unit-confusion(rawSqmNumbers)은 ㎡ 숫자 그대로 */
function areaCellValue(l, unit, variant) {
  if (l.area == null) {
    const n = pyeongTextNumber(l.areaText);
    if (n != null && unit === 'pyeong') return n;
    return l.areaText; // 파싱 불가 원문(없으면 undefined)
  }
  if (unit === 'pyeong' && !variant.rawSqmNumbers) return r2(l.area / P2S);
  return l.area;
}
function exclusiveCellValue(l, unit, variant) {
  if (typeof l.exclusive !== 'number') return l.exclusive;
  if (unit === 'pyeong' && !variant.rawSqmNumbers) return r2(l.exclusive / P2S);
  return l.exclusive;
}

async function buildRentRollXlsx(spec, variantName, variant, leases, dest) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  const ws = wb.getWorksheet('렌트롤');
  if (!ws) throw new Error('템플릿에 렌트롤 시트 없음');
  if (leases.length > LAST_ROW - FIRST_ROW + 1) throw new Error(`${spec.id}: 행 수 초과`);

  // 입력 칸(A–P, Z–AB) 초기화 — 예시 행(13행) 포함. 자동 수식 열(Q–Y, AC–AF)은 수식 보존.
  for (let r = FIRST_ROW; r <= LAST_ROW; r++) {
    for (let c = COL.floor; c <= COL.note; c++) ws.getCell(r, c).value = null;
    for (const c of V14_INPUT_COLS) ws.getCell(r, c).value = null;
  }

  // 템플릿에 남은 수식 캐시값(예시 행의 전용률 75%·합계 C10/D10/AE10·평가기준일 C6 등)이 파서·뷰어에 가짜 값으로 읽히지 않도록
  // 전 시트의 수식 캐시를 지운다 (Q..AF = 17..32열, C10/D10/AE10 포함). 이후 LibreOffice 로 재계산해 올바른 캐시를 채운다.
  clearFormulaCaches(wb);
  wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };

  const base = baseOf(variantName, variant);
  const isCorrected = base === 'corrected';
  const unit = resolveAreaUnit(variant, leases);
  ws.getCell('C3').value = spec.title;
  ws.getCell('C4').value = spec.address;
  ws.getCell('C5').value = toDate(AS_OF); // 렌트롤 기준일: 골든 캡처 기준일 고정 (원본 IM 은 월 단위 작성일뿐)
  ws.getCell('C8').value = spec.broker;
  ws.getCell('C9').value = isCorrected ? toDate(AS_OF) : toDate(`${spec.imDate}-01`);
  ws.getCell('G9').value = unit === 'pyeong' ? '평' : '㎡';
  ws.getCell('J3').value = spec.askingPriceManwon * 10000; // 매각(희망)가(원)
  ws.getCell('J4').value = spec.register.totArea; // 연면적(㎡) — 건축물대장 검증값 (환산 없음)

  leases.forEach((l, i) => {
    const r = FIRST_ROW + i;
    const set = (c, v) => { if (v !== undefined && v !== null && v !== '') ws.getCell(r, c).value = v; };
    set(COL.floor, l.floor);
    set(COL.group, l.group);
    set(COL.area, areaCellValue(l, unit, variant));
    set(COL.excl, exclusiveCellValue(l, unit, variant));
    set(COL.tenant, l.tenant);
    set(COL.law, l.law);
    set(COL.dep, l.dep != null ? l.dep * 10000 : undefined);
    set(COL.rent, l.rent != null ? l.rent * 10000 : undefined);
    set(COL.mgmt, l.mgmt != null ? l.mgmt * 10000 : undefined);
    set(COL.first, l.first ? toDate(l.first) : undefined);
    set(COL.start, l.start ? toDate(l.start) : undefined);
    set(COL.end, l.end ? toDate(l.end) : undefined);
    set(COL.renewal, l.renewal);
    set(COL.opposing, l.opposing);
    set(COL.state, l.state);
    set(COL.note, l.note);
  });

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (NO_RECALC) { await wb.xlsx.writeFile(dest); return unit; }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-rr-src-'));
  const tmpFile = path.join(tmpDir, path.basename(dest));
  await wb.xlsx.writeFile(tmpFile);
  recalcWithLibreOffice(tmpFile, dest); // 수식 캐시를 채운다 (엑셀 없이 열어도 AE/AF 등이 보이게)
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return unit;
}

// ─────────────────────────────────────────────────────────────
// bottom_sheet.json / 입력항목.md / expected.json
// ─────────────────────────────────────────────────────────────
function floorLeasesMirror(leases) {
  return leases.map((l) => {
    const o = {
      floor: l.floor,
      tenant_type: l.tenant || undefined,
      area_sqm: l.area,
      area_pyeong: l.area != null ? r1(l.area * PYEONG) : undefined,
      area_text: l.areaText,
      deposit_manwon: l.dep,
      rent_manwon: l.rent,
      mgmt_fee_manwon: l.mgmt,
      first_contract_date: l.first,
      lease_start: l.start,
      lease_end: l.end,
      is_vacant: l.state === '공실' ? true : undefined,
      lease_state: l.state,
      contract_group: l.group,
      legal_basis: l.law,
      renewal_exercised: l.renewal,
      note: l.note,
      source: l.src,
    };
    for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === '') delete o[k];
    return o;
  });
}

function bottomSheetTotals(variant, leases) {
  if (variant.totalsOverride) return { ...variant.totalsOverride, basis: '원본 요약 합계(as-is)' };
  const t = incomeTotals(leases);
  return { deposit: t.deposit, rent: t.rent, basis: '임대중 행 합계(공실·자가사용 제외)' };
}

function buildBottomSheet(spec, variantName, variant, leases, xlsxName) {
  const totals = bottomSheetTotals(variant, leases);
  const photos = photosV2(spec);
  const unit = resolveAreaUnit(variant, leases);
  const bs = {
    goldenId: spec.id,
    variant: variantName,
    asOf: AS_OF,
    posture: 'income',
    address: spec.address,
    pnu: spec.pnu,
    askingPriceManwon: spec.askingPriceManwon,
    monthlyRentTotalManwon: totals.rent,
    totalDepositManwon: totals.deposit,
    parking: variant.parking ?? spec.parking,
    elevator: variant.elevator ?? spec.elevator,
    vacancy: variant.vacancy,
    broker_highlight: variant.brokerHighlight,
    rentRollXlsx: xlsxName,
    // 렌트롤 v1.5 헤더 블록 (xlsx 의 G9/C5/J3/J4 와 동일 — 파서 결과 meta 와 대조용)
    rentRollMeta: {
      version: '1.5',
      areaInputUnit: unit,
      rentrollAsOf: AS_OF,
      askingPriceKrw: spec.askingPriceManwon * 10000,
      gfaSqm: spec.register.totArea,
    },
    photos_v2: photos,
    photo_urls: photos.map((p) => p.url),
    floor_leases: floorLeasesMirror(leases),
    // 참고값(바텀시트 입력 칸 없음 — 공부 자동조회 대조용)
    register: spec.register,
  };
  // 단위 혼동(G9=평 + ㎡ 숫자) 변형: 임포터가 V12 로 차단 → 골든 팩토리가 해제 사유를 입력하고 생성을 진행한다
  if (variant.v12OverrideReason) bs.v12OverrideReason = variant.v12OverrideReason;
  if (spec.multiParcel) { bs.multiParcel = true; bs.parcels = spec.parcels; }
  if (variant.brokerExtras) {
    bs.broker_extras = variant.brokerExtras;
    bs.broker_extras_src = variant.brokerExtrasSrc;
  }
  return bs;
}

function srcTag(spec, variantName, field) {
  const c = baseOf(variantName, spec.variants[variantName]) === 'corrected';
  switch (field) {
    case 'address': return '원본 (PNU=공부 확인)';
    case 'price': return '원본';
    case 'totals':
      if (!c) return '원본';
      return spec.id.startsWith('ig3') || spec.id.startsWith('ig4') ? '원본(정정): 임대현황표 실수입 기준' : '원본';
    case 'parking':
      if (c && spec.id.startsWith('ig3')) return '공부 (원본 5대)';
      return '원본';
    case 'elevator': return '원본';
    case 'vacancy': return c ? '원본 판단 (공실 행 면적 비중)' : '원본 판단';
    case 'highlight': return c ? '원본 문구 요약(작성)' : '원본 문구';
    default: return '';
  }
}

function buildInputMd(spec, variantName, variant, bs, leases) {
  const L = [];
  const rentPct = (bs.monthlyRentTotalManwon * 12) / (spec.askingPriceManwon - bs.totalDepositManwon) * 100;
  L.push(`# ${spec.title} — 바텀시트 입력항목 (${variantName})`);
  L.push('');
  L.push(`- 골든 ID: \`${spec.id}\` / 변형: **${variantName}** / 기준일(as-of): ${AS_OF}`);
  L.push(`- 원본: \`docs/income-im/\` (${spec.broker}, ${spec.imDate} 작성)`);
  if (baseOf(variantName, variant) === 'corrected') {
    L.push(variant.noDateShift
      ? '- 날짜: 원본에 계약기간이 없어 기준일 이후로 직접 배치한 **가정값**'
      : `- 날짜: 원본 계약일을 IM 작성월(${spec.imDate}) → 기준일로 **+${spec.shiftMonths}개월 일괄 이동**`);
  } else {
    L.push('- 날짜·금액·오기: **원본 그대로** (앱의 경고/방어 동작 관찰용)');
  }
  const areaUnit = resolveAreaUnit(variant, leases);
  L.push(`- 렌트롤 양식 v1.5 헤더: G9 면적 단위 = **${areaUnit === 'pyeong' ? '평' : '㎡'}** / C5 기준일 = ${AS_OF} / J3 매각가 = ${fmt(spec.askingPriceManwon * 10000)}원 / J4 연면적 = ${spec.register.totArea}㎡(건축물대장)`);
  if (variant.rawSqmNumbers) L.push('- **단위 혼동 시험**: G9=평 인데 C·D 칸에는 ㎡ 숫자를 그대로 적음 → 임포터가 V12(AREA_UNIT_MISMATCH)로 차단, E2E 는 해제 사유를 입력해 생성을 진행한다.');
  else if (areaUnit === 'pyeong') L.push('- 면적 칸은 평 입력: C/D = ㎡ ÷ 3.305785 (소수 2자리). 파서가 ㎡ 로 되환산(ROUND 2).');
  L.push('- 출처 태그: `원본` | `원본(정정)` | `공부`(건축물대장) | `가정`');
  L.push('');
  L.push('## 1. 바텀시트 필드');
  L.push('');
  L.push('| 바텀시트 필드 | 입력값 | 출처 |');
  L.push('|---|---|---|');
  L.push(`| 포스처 | 수익형(income) | - |`);
  L.push(`| 주소 검색 | ${spec.address} (PNU ${spec.pnu}) | ${srcTag(spec, variantName, 'address')} |`);
  if (spec.multiParcel) L.push(`| 필지 추가(ParcelSection) | ${spec.parcels.map((p) => `${p.address} (${p.pnu})`).join(' / ')} | 원본 (PNU=공부 확인) |`);
  L.push(`| 매각 희망가 (만원) | ${fmt(spec.askingPriceManwon)} | ${srcTag(spec, variantName, 'price')} |`);
  L.push(`| 월 임대료 합계 (만원) | ${fmt(bs.monthlyRentTotalManwon)} | ${srcTag(spec, variantName, 'totals')} |`);
  L.push(`| 보증금 합계 (만원) | ${fmt(bs.totalDepositManwon)} | ${srcTag(spec, variantName, 'totals')} |`);
  L.push(`| 주차 대수 | ${bs.parking} | ${srcTag(spec, variantName, 'parking')} |`);
  L.push(`| 승강기 대수 | ${bs.elevator} | ${srcTag(spec, variantName, 'elevator')} |`);
  L.push(`| 공실률 버튼 | ${bs.vacancy} | ${srcTag(spec, variantName, 'vacancy')} |`);
  L.push(`| 중개사 한 줄 (broker_highlight) | ${bs.broker_highlight} | ${srcTag(spec, variantName, 'highlight')} |`);
  L.push(`| 렌트롤 업로드 | \`${bs.rentRollXlsx}\` (${leases.length}행) | 아래 3절 |`);
  L.push(`| 사진 | ${bs.photos_v2.length}장 (★ 대표 = ${spec.images.find((i) => i.isHero)?.caption ?? '-'}) | 원본 |`);
  L.push('');
  L.push(`> 참고: 바텀시트 합계 기준 단순 수익률 = ${fmt(bs.monthlyRentTotalManwon)}×12 ÷ (${fmt(spec.askingPriceManwon)} − ${fmt(bs.totalDepositManwon)}) = **${rentPct.toFixed(2)}%**`);
  L.push('');
  if (bs.broker_extras) {
    const x = bs.broker_extras;
    L.push('### 1-1. 중개인 추가 정보 (바텀시트 "중개인 추가 정보 (선택)")');
    L.push('');
    L.push(`- 출처: ${bs.broker_extras_src}`);
    L.push('');
    L.push('| 입력 칸 | 입력값 |');
    L.push('|---|---|');
    if (x.investment_points) L.push(`| 투자 포인트 | ${x.investment_points.join(' / ')} |`);
    if (x.closing_line) L.push(`| 마무리 한줄 | ${x.closing_line} |`);
    for (const r of x.regulatory_notes ?? []) L.push(`| 규제·계획 (${r.kind}) | ${[r.title, r.detail, r.basis && `근거: ${r.basis}`, r.restricted_acts && `제한행위: ${r.restricted_acts}`, r.period && `기한: ${r.period}`].filter(Boolean).join(' · ')} |`);
    for (const c of x.market_comps ?? []) L.push(`| 인근 시세 (${c.kind}) | ${c.location} · ${c.price_eok ?? '-'}억 · 토지평당 ${c.land_price_per_pyeong_manwon ?? '-'}만원 |`);
    if (x.location_note) L.push(`| 입지 설명 | ${x.location_note} |`);
    if (x.post_acquisition_plan) L.push(`| 매입 후 전략 | ${x.post_acquisition_plan.join(' / ')} |`);
    if (x.target_rent_per_pyeong_manwon) L.push(`| 목표 임대료 (평당 만원/월) | ${x.target_rent_per_pyeong_manwon} |`);
    L.push('');
    L.push('나머지 서술(층별 상세·부가수입 등)은 `memo.txt`로 전달한다.');
  } else {
    L.push('이 변형은 "중개인 추가 정보"를 입력하지 않는다(기본 9매 덱 확인용). 제안 포인트·입지·규제·인근 시세는 `memo.txt`로만 전달한다.');
  }
  L.push('');
  L.push('## 2. 사진 (images/)');
  L.push('');
  L.push('| # | 파일 | 카테고리 | 캡션 | 대표(★) |');
  L.push('|---|---|---|---|---|');
  spec.images.forEach((img, i) => L.push(`| ${i + 1} | \`${img.file}${extOf(img.media)}\` | ${img.category} | ${img.caption} | ${img.isHero ? '★' : ''} |`));
  L.push('');
  L.push('## 3. 렌트롤 행');
  L.push('');
  L.push(`| 층 | 계약그룹 | 임대면적(${areaUnit === 'pyeong' ? '평' : '㎡'}) | 업종/상호 | 보증금 | 월세 | 관리비 | 최초계약 | 시작 | 만료 | 상태 | 비고 | 출처 |`);
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const l of leases) {
    L.push(`| ${l.floor} | ${l.group ?? ''} | ${areaCellValue(l, areaUnit, variant) ?? ''} | ${l.tenant ?? ''} | ${fmt(l.dep)} | ${fmt(l.rent)} | ${fmt(l.mgmt)} | ${l.first ?? ''} | ${l.start ?? ''} | ${l.end ?? ''} | ${l.state ?? ''} | ${(l.note ?? '').replace(/\|/g, '/')} | ${l.src ?? (variantName === 'as-is' ? '원본' : '')} |`);
  }
  const it = incomeTotals(leases);
  const rt = rawTotals(leases);
  L.push('');
  L.push(`- 임대중 행 합계(실수입): 보증금 ${fmt(it.deposit)} / 월세 ${fmt(it.rent)} / 관리비 ${fmt(it.mgmt)} 만원`);
  if (rt.deposit !== it.deposit || rt.rent !== it.rent) {
    L.push(`- 렌트롤에 적힌 전체 금액 합(공실·자가 괄호 금액 포함): 보증금 ${fmt(rt.deposit)} / 월세 ${fmt(rt.rent)} 만원`);
  }
  L.push('- 금액 단위: 이 문서는 만원, xlsx는 표준 양식대로 **원**.');
  return L.join('\n') + '\n';
}

function buildExpected(spec, variantName, variant, bs, leases) {
  const e = spec.expected[variantName] || {};
  const it = incomeTotals(leases);
  const bsCap = capRate(bs.monthlyRentTotalManwon, spec.askingPriceManwon, bs.totalDepositManwon);
  return {
    goldenId: spec.id,
    variant: variantName,
    posture: 'income',
    asOf: AS_OF,
    askingPriceManwon: spec.askingPriceManwon,
    totals: e.totals,
    capRatePct: e.capRatePct ?? null,
    capRateFromBottomSheetPct: bsCap,
    capRateTolerancePct: 0.05,
    rentRoll: {
      rows: leases.length,
      incomeDepositManwon: it.deposit,
      incomeRentManwon: it.rent,
      incomeMgmtManwon: it.mgmt,
      contractGroupFollowers: e.contractGroupFollowers ?? leases.filter((l) => l.group && l.dep == null && l.rent == null).length,
      ownerUseRows: e.ownerUseRows ?? leases.filter((l) => l.state === '자가사용').length,
      vacantRows: e.vacantRows ?? leases.filter((l) => l.state === '공실').length,
    },
    areaMode: e.areaMode ?? (leases.some((l) => l.area != null || l.areaText) ? 'lease' : 'none'),
    // 렌트롤 v1.5 — xlsx G9 입력 단위 / 단위 혼동(V12) 차단 기대 여부 (unit-confusion 변형만 true)
    areaInputUnit: resolveAreaUnit(variant, leases),
    expectV12Block: !!variant.rawSqmNumbers,
    expectedFloors: e.floors ?? [],
    expectedKeywords: e.keywords ?? [],
    gapKeywords: e.gapKeywords ?? [],
    mustNotInclude: e.mustNotInclude ?? [],
    observations: e.observations ?? [],
    expectedMinSlides: 8,
    expectedMaxSlides: 13,
    register: spec.register,
  };
}

function buildDefectsMd(spec) {
  const L = [`# ${spec.title} — 원본 결함 ↔ 보완 대조`, '', `- 원본: \`docs/income-im/\` ${spec.broker} (${spec.imDate})`, `- 공부: 건축물대장 표제부·층별개요 (PNU ${spec.pnu})`, ''];
  L.push('| 항목 | 원본 | 보완 (corrected) | as-is |');
  L.push('|---|---|---|---|');
  for (const [a, b, c, d] of spec.defects) L.push(`| ${a} | ${String(b).replace(/\|/g, '/')} | ${String(c).replace(/\|/g, '/')} | ${String(d).replace(/\|/g, '/')} |`);
  L.push('');
  L.push('## 건축물대장 요약 (공부)');
  L.push('');
  L.push('| 항목 | 값 |');
  L.push('|---|---|');
  for (const [k, v] of Object.entries(spec.register)) L.push(`| ${k} | ${v} |`);
  return L.join('\n') + '\n';
}

function buildReadme(specs) {
  const L = [];
  L.push('# income 골든 데이터 (실매물 IM 기반)');
  L.push('');
  L.push('중개법인이 실제 작성한 수익형 매각 IM 4건(`docs/income-im/`)에서 추출한 E2E 골든 입력 세트.');
  L.push('메모 → 딜카드 → 기본 IM 바텀시트 → 모바일 IM 편집/뷰어 → PPTX Basic IM 파이프라인 검증용.');
  L.push('');
  L.push(`- 기준일(as-of): **${AS_OF}**`);
  L.push('- 생성: `node scripts/income-golden/build-golden-data.mjs [--extract <dir>] [--only ig1,ig3]`');
  L.push('- 명세(SSOT): `scripts/income-golden/golden-specs.mjs` — 값 수정은 명세에서 하고 재생성한다.');
  L.push('- 원본 슬라이드 이미지: `<id>/reference/original_slides/` (`render_original_slides.py`)');
  L.push('');
  L.push('## 세트');
  L.push('');
  L.push('| ID | 물건 | 매각가 | 실수입 보증금/월세(만원) | 수익률(corrected) | 사진 | 특징 |');
  L.push('|---|---|---|---|---|---|---|');
  const feat = {
    ig1: '계약그룹(1F·2F 통합계약), 자가사용 2행, 연면적 오기',
    ig2: '계약기간 전무, 평 단위, 공실·자가 괄호금액, 지구단위계획',
    ig3: '공실 희망임대료 합계 포함 오류, 면적 없음, 개발행위허가제한',
    ig4: '3필지, 임대현황 이미지 전사, 요약↔임대현황 불일치, 소재지 오기',
  };
  for (const s of specs) {
    const t = s.expected.corrected.totals;
    L.push(`| \`${s.id}\` | ${s.title} | ${fmt(s.askingPriceManwon / 10000)}억 | ${fmt(t.deposit)} / ${fmt(t.rent)} | ${s.expected.corrected.capRatePct}% | ${s.images.length} | ${feat[setKey(s.id)]} |`);
  }
  L.push('');
  L.push('## 폴더 구조');
  L.push('');
  L.push('```');
  L.push('<id>/');
  L.push('  images/NN_<category>_<캡션>.<ext>   바텀시트 사진 (파일명 = 카테고리 + 캡션)');
  L.push('  reference/                         위치도·지적·시세표·도면 등 비사진 자료, source_extract.md, original_slides/');
  L.push('  defects.md                         원본 결함 ↔ 보완 대조, 건축물대장 요약');
  L.push('  corrected/                         결함 보완 입력 (테스트 기본)');
  L.push('  as-is/                             원본 그대로 입력 (경고·방어 동작 관찰)');
  L.push('    memo.txt  bottom_sheet.json  bottom_sheet_입력항목.md  CREDEAL_rentroll_<id>_<variant>.xlsx  expected.json');
  L.push('```');
  L.push('');
  L.push('## 원칙');
  L.push('');
  L.push('- 날조 금지: 보완 값은 모두 출처 태그(`원본` / `원본(정정)` / `공부` / `가정`)를 달고 `defects.md`에 기록한다.');
  L.push('- 날짜 이동(corrected): IM 작성월 → 기준일 월로 일괄 이동(월말 계약은 월말 유지). 원본에 계약기간이 없는 세트(ig2·ig3)는 기준일 이후로 직접 배치한 가정값.');
  L.push('- 실수입 합계는 `임대중` 행만 (공실·자가사용 제외). 계약그룹 후속 행은 금액 공란.');
  L.push('- 임차 상호는 원본 유지, 소유자 실명은 제거.');
  L.push('- 렌트롤 xlsx는 앱 표준 양식 v1.5 (`docs/CREDEAL_rentroll_template_v1.5.xlsx`), 금액 단위 원. G9 면적 단위·C5 기준일(=as-of)·J3 매각가·J4 연면적(대장)을 채우고 수식 캐시는 LibreOffice 로 재계산한다.');
  L.push('- ig1 파생 변형: `corrected-pyeong`(G9=평, C/D=㎡÷3.305785) · `unit-confusion`(G9=평 + ㎡ 숫자 → V12 차단, E2E 가 해제 사유 입력). 데이터는 corrected 와 동일.');
  L.push('- 원본 pptx(`docs/income-im/`)는 수정하지 않는다. 용량이 커서(약 117MB) 저장소 커밋 시 LFS 또는 제외를 검토.');
  L.push('- 레거시 `docs/golden-test-data/p1-dangsan-income`, `p5-yangpyeong-income`은 유지 (p5 렌트롤은 원본 IM과 다름).');
  return L.join('\n') + '\n';
}

// ─────────────────────────────────────────────────────────────
async function main() {
  const specs = GOLDEN_SPECS.filter((s) => !ONLY || ONLY.includes(setKey(s.id)));
  const problems = [];

  for (const spec of specs) {
    const setDir = path.join(OUT_ROOT, spec.id);
    console.log(`\n■ ${spec.id}`);

    if (!SKIP_IMAGES) {
      await copyMedia(spec, setDir);
      console.log(`  images ${spec.images.length} / reference ${spec.references.length}`);
    }
    if (EXTRACT_DIR) {
      const se = path.join(EXTRACT_DIR, setKey(spec.id), 'source_extract.md');
      if (fs.existsSync(se)) { fs.copyFileSync(se, path.join(setDir, 'reference', 'source_extract.md')); console.log('  source_extract.md'); }
      else console.warn(`  ⚠ ${se} 없음`);
    }
    writeFile(path.join(setDir, 'defects.md'), buildDefectsMd(spec));

    for (const [variantName, variant] of Object.entries(spec.variants)) {
      const vDir = path.join(setDir, variantName);
      const leases = normalizeLeases(spec, variantName, variant);
      const xlsxName = `CREDEAL_rentroll_${spec.id}_${variantName}.xlsx`;
      const bs = buildBottomSheet(spec, variantName, variant, leases, xlsxName);
      const expected = buildExpected(spec, variantName, variant, bs, leases);

      // ── 정합성 자체 점검 ──
      const exp = spec.expected[variantName];
      if (exp?.totals && (exp.totals.deposit !== bs.totalDepositManwon || exp.totals.rent !== bs.monthlyRentTotalManwon)) {
        problems.push(`${spec.id}/${variantName}: 바텀시트 합계 ${bs.totalDepositManwon}/${bs.monthlyRentTotalManwon} ≠ expected ${exp.totals.deposit}/${exp.totals.rent}`);
      }
      if (baseOf(variantName, variant) === 'corrected') {
        const it = incomeTotals(leases);
        if (it.deposit !== exp.totals.deposit || it.rent !== exp.totals.rent) problems.push(`${spec.id}/corrected: 렌트롤 실수입 ${it.deposit}/${it.rent} ≠ expected`);
        if (Math.abs(expected.capRateFromBottomSheetPct - exp.capRatePct) > 0.01) problems.push(`${spec.id}/corrected: cap ${expected.capRateFromBottomSheetPct} ≠ ${exp.capRatePct}`);
        for (const l of leases) {
          if (l.state === '임대중' && l.end && l.end < AS_OF) problems.push(`${spec.id}/corrected: ${l.floor} 만료 ${l.end} < 기준일`);
        }
        const area = leases.reduce((s, l) => s + (l.area || 0), 0);
        if (area > spec.register.totArea + 0.01) problems.push(`${spec.id}/corrected: 임대면적 합 ${r2(area)} > 연면적 ${spec.register.totArea}`);
      }
      if (/신현재/.test(variant.memo)) problems.push(`${spec.id}/${variantName}: 소유자 실명 잔존`);

      writeFile(path.join(vDir, 'memo.txt'), variant.memo.trim() + '\n');
      writeFile(path.join(vDir, 'bottom_sheet.json'), JSON.stringify(bs, null, 2) + '\n');
      writeFile(path.join(vDir, 'bottom_sheet_입력항목.md'), buildInputMd(spec, variantName, variant, bs, leases));
      writeFile(path.join(vDir, 'expected.json'), JSON.stringify(expected, null, 2) + '\n');
      const unit = await buildRentRollXlsx(spec, variantName, variant, leases, path.join(vDir, xlsxName));
      console.log(`  ${variantName}: ${leases.length}행, G9=${unit === 'pyeong' ? '평' : '㎡'}, 바텀시트 ${fmt(bs.totalDepositManwon)}/${fmt(bs.monthlyRentTotalManwon)}, cap ${expected.capRateFromBottomSheetPct}%`);
    }
  }

  if (!ONLY) writeFile(path.join(OUT_ROOT, 'README.md'), buildReadme(GOLDEN_SPECS));

  if (problems.length) {
    console.error('\n✖ 정합성 문제:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.log('\n✔ 완료');
}

main().catch((e) => { console.error(e); process.exit(1); });
