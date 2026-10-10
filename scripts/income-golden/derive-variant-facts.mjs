/**
 * ig1 파생 변형(corrected-pyeong · unit-confusion)의 정답 키(expected_facts.json) 생성기.
 *
 *   node scripts/income-golden/derive-variant-facts.mjs
 *
 * ig1/corrected/expected_facts.json 을 그대로 복사(기존 키 무변경·무약화)하고 렌트롤 v1.5 단위 키만 **추가**한다.
 * docs/income-golden-data 는 git 미추적이라 이 스크립트가 재현 수단이다 (corrected 키가 바뀌면 다시 실행).
 *
 * 추가 키 (스펙 docs/RENTROLL_v1.3_to_v1.5.md §9.1 — 렌트롤 표는 입력 단위 1개로 표기, 공부 면적 ㎡(평) 은 유지)
 *  - must_contain  `re:임대면적\s*\(평\)`                (표 머리글)
 *  - must_contain  첫 행 면적 값                        (xlsx C13 — B1 317.22㎡ → corrected-pyeong 95.96 / unit-confusion 317.22 (입력 숫자 그대로))
 *  - must_contain  평 합계 435.95                       (corrected-pyeong 만 — Σ평, xlsx C10 / ΣAE 1,441.16÷3.305785)
 *  - must_not_contain `re:\d평\(약`                      (normalizer 의 'N평(약 X㎡)' 혼합 표기 금지 — 렌트롤 표는 단일 단위)
 *  - 기존 개요 ㎡(평) 공부 면적 키(gfa·land-area·numeric)는 그대로 유지
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const BASE = path.join(ROOT, 'docs', 'income-golden-data', 'ig1-dangsan5ga-11-47');
const SRC = path.join(BASE, 'corrected', 'expected_facts.json');
const base = JSON.parse(fs.readFileSync(SRC, 'utf8').replace(/^\uFEFF/, ''));

const P2S = 3.305785;
const r2 = (n) => Math.round(n * 100) / 100;
// 렌트롤 첫 행(B1) / 합계 — 명세 ig1 corrected 와 동일 (golden-specs.mjs)
const FIRST_ROW_SQM = 317.22;
const ALL_SQM = [317.22, 78.39, 105.6, 252.09, 252.09, 169.06, 83.03, 183.67];
const firstPy = r2(FIRST_ROW_SQM / P2S); // 95.96
const totalPy = r2(ALL_SQM.reduce((s, v) => s + r2(v / P2S), 0)); // 435.95 (입력 칸 합 = xlsx C10)
if (firstPy !== 95.96 || totalPy !== 435.95) throw new Error(`평 환산 기대와 불일치: ${firstPy} / ${totalPy}`);

const rx = (n) => `re:(?<![\\d,.])${String(n).replace('.', '\\.')}(?!\\d)`;

function derive(variant, { golden, notes, mustContain }) {
  const out = JSON.parse(JSON.stringify(base));
  out.golden = golden;
  out.fixture = `docs/income-golden-data/ig1-dangsan5ga-11-47/${variant}`;
  out.notes = [...base.notes, ...notes];
  out.must_contain = [...base.must_contain, ...mustContain];
  out.must_not_contain = [
    ...base.must_not_contain,
    {
      label: "렌트롤 표 면적 'N평(약 X㎡)' 혼합 표기 (단일 단위 위반)",
      anyOf: ['re:\\d평\\(약'],
      where: 'both',
      source: 'derived',
      note: '§9.1 렌트롤 표는 입력 단위(G9) 1개로만 표기. normalizer(hardcoded_pyeongToSqm)가 렌트롤 표를 \'N평(약 X㎡)\'로 바꿔 쓰면 안 됨',
    },
  ];
  fs.writeFileSync(path.join(BASE, variant, 'expected_facts.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`✔ ${variant}: must_contain ${out.must_contain.length} (+${mustContain.length}) / must_not_contain ${out.must_not_contain.length} (+1)`);
}

const headerKey = {
  id: 'rentroll-area-header-pyeong',
  label: '렌트롤 표 임대면적 머리글 단위(평)',
  anyOf: ['re:임대면적\\s*\\(평\\)'],
  where: 'pptx',
  source: 'fixture',
  note: 'xlsx G9=평 → 렌트롤 표 머리글은 입력 단위 \'임대면적(평)\' (§9.1). 개요 공부 면적은 ㎡ (평) 유지',
};

derive('corrected-pyeong', {
  golden: 'income-ig1-corrected-pyeong',
  notes: [
    'corrected-pyeong: corrected 와 같은 데이터, 렌트롤 xlsx 만 G9=평 (C/D = ㎡÷3.305785 소수 2자리). 파서가 ㎡ 로 되환산(ROUND 2)하므로 합계·수익률·연면적은 corrected 와 동일해야 한다.',
    '렌트롤 표 면적은 평 단일 표기: B1 95.96평(xlsx C13), 합계 435.95평(xlsx C10). 공부 면적(연면적·대지)은 ㎡ (평) 유지.',
  ],
  mustContain: [
    headerKey,
    {
      id: 'rentroll-first-row-pyeong',
      label: '렌트롤 첫 행(B1) 임대면적 95.96평',
      anyOf: [rx(95.96)],
      where: 'pptx',
      source: 'fixture',
      note: 'xlsx C13=95.96 (= B1 317.22㎡ ÷ 3.305785, 소수 2자리) — 입력 단위 그대로 표기',
    },
    {
      id: 'rentroll-total-pyeong',
      label: '렌트롤 합계 행 임대면적 435.95평',
      anyOf: [rx(435.95)],
      where: 'pptx',
      source: 'derived',
      note: 'Σ평 = 입력 칸 합 435.95 (xlsx C10) = ΣAE 1,441.16㎡ ÷ 3.305785. 평 모드에서는 레지스터 스냅(연면적으로 덮어쓰기)을 쓰지 않는다',
    },
  ],
});

derive('unit-confusion', {
  golden: 'income-ig1-unit-confusion',
  notes: [
    'unit-confusion: G9=평 인데 면적 칸에는 ㎡ 숫자(317.22 등)를 그대로 입력 → ΣAE 4,764.14㎡ = 연면적의 330.6% → 임포터 V12(AREA_UNIT_MISMATCH) 차단. 팩토리가 해제 사유(\'골든 테스트: 의도된 중개인 면적 오기 재현\')를 입력해 생성을 진행한다.',
    '해제 후에도 금액·합계·수익률·연면적(대장 우선)은 corrected 와 같다. 렌트롤 표 면적은 입력 단위(평) 그대로 표기 — 자동 보정하지 않는다(§6.4-7): B1 317.22. 승인·발행 차단/해제는 별도 게이트 테스트에서 검증.',
  ],
  mustContain: [
    headerKey,
    {
      id: 'rentroll-first-row-as-typed',
      label: '렌트롤 첫 행(B1) 면적 — 입력 숫자 그대로 317.22 (평 라벨)',
      anyOf: [rx(317.22)],
      where: 'pptx',
      source: 'fixture',
      note: 'xlsx C13=317.22 (G9=평). 단위를 추측해 보정하지 않으므로 입력값이 평으로 그대로 표기된다',
    },
  ],
});
