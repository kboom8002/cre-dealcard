#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
output_qa.py — CREDEAL IM 산출물 자동 점검기 (D17 §4)

산출물(PDF / HTML / MD)을 픽스처와 대조하여 26종 검사를 수행합니다.
7라운드 수기 점검에서 확인된 결함 유형만 담았습니다. 추측 검사는 넣지 않았습니다.

사용:
    python3 output_qa.py --fixture ../fixtures/dangsan.json  <산출물...>
    python3 output_qa.py --fixture ../fixtures/dangsan.json --json  <산출물...>

종료 코드:
    0  차단(BLOCK) 0건
    1  차단 1건 이상  ← CI에서 발행을 막습니다
    2  실행 오류
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

EOK = 100_000_000  # 1억
MAN = 10_000       # 1만

# ── SSoT 레지스트리에서 읽습니다 (credeal/ssot) ─────────────────────────
# 목록을 검사기 안에 두지 않습니다. 두 군데 있으면 반드시 어긋납니다.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'credeal' / 'ssot'))
import loader as SSOT                                            # noqa: E402

BANNED = SSOT.banned_words()
CONTEXT_EXCLUDE = SSOT.context_exclude()
NEGATION = SSOT.negations()

PLACEHOLDER = re.compile(r'\[[^\]\n]{2,40}(?:으로 대체됨|미정|TBD|PLACEHOLDER)[^\]\n]*\]'
                         r'|\{\{[^}\n]+\}\}|\$\{[^}\n]+\}|__[A-Z_]{3,}__')
MASK_TOKEN = re.compile(r'핵심\s*입지|우수\s*입지|프리미엄\s*입지')
# PDF·HTML 본문에 마크다운 원문이 남은 경우. 줄 중간에도 나타나므로 앵커를 쓰지 않는다.
MD_UNRENDERED = re.compile(r'(?:^|\s)#{2,6}\s'
                           r'|\|\s*:?-{3,}'
                           r'|\|\s*[^|\n]{1,24}\s*\|\s*[^|\n]{1,24}\s*\|')
INTERNAL_LEAK = re.compile(r'https?://[^\s]*?/api/|doc_id=|[0-9a-f]{8}-[0-9a-f]{4}-'
                           r'[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')

# 라벨과 값 사이를 훑을 때 넘지 말아야 할 경계 3가지.
#   \t  표의 셀 경계   ·  다. / .␣  문장 끝  ·  %  다른 값
# 이 경계를 안 두면 헤더 셀이 다음 행의 값과, 문장이 다음 문장의 숫자와 짝지어집니다.
BREAK = r'(?:(?!다\.|\.\s|\t)'
PCT = r'([-+]?\d{1,3}(?:\.\d{1,2})?)\s*%'
EOK_NUM = r'([\d,]+(?:\.\d+)?)\s*억'
def span(char_class: str, n: int) -> str:
    """라벨↔값 사이 최대 n자. 위 경계는 넘지 않습니다."""
    return f'{BREAK}{char_class}){{0,{n}}}?'


SPAN_PCT = lambda n: span('[^%]', n)      # noqa: E731
SPAN_EOK = lambda n: span('[^억]', n)     # noqa: E731


def emoji_chars(t: str) -> list[str]:
    out = []
    for ch in t:
        if ch in '✓✔※◇○◎△▲▽▼■□●·—–−↔→←≠≤≥±×÷':      # 기호는 허용
            continue
        o = ord(ch)
        if (0x1F300 <= o <= 0x1FAFF or 0x2190 <= o <= 0x27BF
                or 0x2B00 <= o <= 0x2BFF or o == 0xFE0F):
            out.append(ch)
    return out


# ── 텍스트 추출 ────────────────────────────────────────────────────────
def extract(path: Path) -> str:
    s = path.suffix.lower()
    if s == '.pdf':
        try:
            import pdfplumber
        except ImportError:
            sys.exit('pdfplumber 필요:  pip install pdfplumber --break-system-packages')
        import logging
        logging.getLogger('pdfminer').setLevel(logging.ERROR)
        with pdfplumber.open(path) as pdf:
            return '\n'.join((p.extract_text() or '') for p in pdf.pages)
    raw = path.read_text(encoding='utf-8', errors='replace')
    if s in ('.html', '.htm'):
        raw = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', raw, flags=re.S | re.I)
        raw = re.sub(r'<[^>]+>', ' ', raw)
        for a, b in (('&nbsp;', ' '), ('&amp;', '&'), ('&lt;', '<'), ('&gt;', '>')):
            raw = raw.replace(a, b)
    return raw


class Report:
    LEVELS = ('BLOCK', 'MAJOR', 'MINOR')

    def __init__(self):
        self.rows: list[dict] = []

    def add(self, cid, level, title, detail=''):
        assert level in self.LEVELS
        self.rows.append({'id': cid, 'level': level, 'title': title,
                          'detail': str(detail)[:400]})

    def count(self, level):
        return sum(1 for r in self.rows if r['level'] == level)


# ── 검사군 1 · 동일 지표 다중값 (원인 H · v4에서 신설) ──────────────────
#   PDF 표는 셀 안에서 줄바꿈되므로 공백을 접은 flat 텍스트에서 찾는다.
#   대신 라벨↔값 거리를 좁게 제한해 엉뚱한 짝짓기를 막는다.
DUP_METRICS = [
    ('QA-DUP-01', 'Cap Rate / 수익률',
     re.compile(r'(?:Cap\s*R(?:ate)?|캡\s*레이트|연\s*수익\s*률|순\s*수익\s*률'
                r'|Gross\s*Yield|총\s*수익\s*률)(' + SPAN_PCT(40) + r')' + PCT)),
    ('QA-DUP-02', '실투자금',
     re.compile(r'실투자금(?![^억\t]{0,25}(?:대비|순수익))('
                + SPAN_EOK(25) + r')' + EOK_NUM)),
    ('QA-DUP-03', '자기자본수익률',
     re.compile(r'(?:자기\s*자본\s*수익\s*률|내\s*돈\s*대비[^%]{0,14}?수익\s*률|ROE)('
                + SPAN_PCT(30) + r')' + PCT)),
    ('QA-DUP-04', '매매가',
     re.compile(r'(?:매매\s*(?:가|희망가)|매각\s*희망가)'
                r'(?![^억\t]{0,20}(?:대비|추가|차이|보다|외에))(' + SPAN_EOK(20) + r')' + EOK_NUM)),
]


def flatten(t: str) -> str:
    """PDF 셀 줄바꿈을 접는다. 지표 탐색 전용.

    부정문 줄("…라벨을 붙이지 않습니다")은 먼저 제거한다.
    제거하지 않으면 정본 골든이 스스로 위반으로 잡힌다 — D17 §9.2.
    """
    keep = []
    for ln in t.split('\n'):
        if any(g in ln for g in NEGATION):
            continue
        # 탭이 있으면 표의 행이다. 양 끝을 셀 경계로 막아
        # 헤더 셀이 다음 행의 값과 짝지어지는 것을 방지한다.
        keep.append(f'\t{ln}\t' if '\t' in ln else ln)
    return re.sub(r'[^\S\t]+', ' ', '\n'.join(keep))


def numkey(v: str) -> str:
    """250 과 250.00 을 같은 값으로 본다."""
    try:
        return f'{float(v):.4g}'
    except ValueError:
        return v


# 값 옆에 "무엇을 분모로 삼았는가"가 적혀 있으면 여러 값이 있어도 정상이다.
BASIS_MARK = re.compile(r'기준|매매가|보증금|총취득|취득원가|실투자금|무차입|LTV\s*\d'
                        r'|총임대료|투입비|소계|차감|NOI|GOP|연면적|토지|대지'
                        r'|자기자본|equity|price|basis')


def check_duplicates(t: str, rep: Report):
    """같은 지표에 값이 여럿인 것 자체는 정상이다 (기준이 다르면).
    문제는 **기준 표기 없이** 값이 여럿인 경우다."""
    f = flatten(t)
    for cid, name, pat in DUP_METRICS:
        bare, seen = set(), {}
        for m in pat.finditer(f):
            ctx, val = m.group(1), numkey(m.group(2).replace(',', ''))
            seen.setdefault(val, ctx)
            if not BASIS_MARK.search(ctx):
                bare.add(val)
        if len(bare) > 1:
            rep.add(cid, 'BLOCK',
                    f'{name}이(가) 기준 표기 없이 {len(bare)}개 값으로 나옵니다',
                    ' / '.join(sorted(bare)) + '  (전체 ' +
                    ' / '.join(sorted(seen)) + ')')
        elif len(seen) > 1:
            rep.add(cid, 'MINOR', f'{name} {len(seen)}개 — 기준 표기 확인',
                    ' / '.join(f'{v}({c.strip()[:16]})' for v, c in sorted(seen.items())))


# ── 검사군 2 · 픽스처 대조 ─────────────────────────────────────────────
def check_fixture(t: str, fx: dict, rep: Report):
    fin, exp = fx['financial'], fx['expect']
    if 'priceKrw' not in fin:            # development·operating — D17 §11 미착수
        return

    price_ok = f'{fin["priceKrw"] / EOK:.10g}'
    if price_ok not in t.replace(',', ''):
        rep.add('QA-FIX-01', 'BLOCK', '매매가가 원장과 다릅니다',
                f'원장 {price_ok}억')

    rent_man = round(fin['monthlyRentKrw'] / MAN)
    flat = t.replace(',', '')
    if str(rent_man) not in flat:
        rep.add('QA-FIX-02', 'BLOCK', '월 임대료가 원장과 다릅니다',
                f'원장 {rent_man:,}만원')

    # 연면적 — 확정값이 없으면 "확인 필요"가 있어야 한다
    if fx['asset'].get('totalFloorAreaSqm') is None:
        area_vals = {m.group(1) for m in
                     re.finditer(r'연면적[^\n㎡]{0,20}?([\d,]+(?:\.\d+)?)\s*㎡', t)}
        stated = {f'{exp["sumAreaSqm"]:.2f}', f'{fx["ledger"]["statedTotalAreaSqm"]:.2f}'}
        unknown = {v for v in area_vals if v.replace(',', '') not in
                   {s.rstrip('0').rstrip('.') for s in stated} | stated}
        if unknown:
            rep.add('QA-FIX-04', 'BLOCK',
                    '연면적이 원장의 어느 값과도 일치하지 않습니다',
                    f'표기 {sorted(unknown)} · 원장 {sorted(stated)}')
        elif re.search(r'연면적[^\n]{0,60}확정했습니다|층별개요 합|용적률 역산', t):
            pass          # 공부로 확정하고 근거를 밝힌 경우 (D19 §2.2)
        elif not re.search(r'연면적[^\n]{0,40}(확인\s*필요|미확정|확정되지)', t):
            rep.add('QA-FIX-04', 'MAJOR',
                    '연면적이 미확정인데 확인 필요 표기가 없습니다', sorted(stated))

    # 공실 — 자가사용을 공실로 세지 않는다
    if exp.get('vacantRows') == 0 and re.search(r'공실\s*(?:률)?\s*[:\s]*[1-9]', t):
        rep.add('QA-FIX-05', 'MAJOR', '공실 0인데 0이 아닌 공실 수치가 있습니다',
                f'원장 공실 0 · 자가사용 {exp.get("selfUseRows", 0)}')


# ── 검사군 3 · 재무 정합 ───────────────────────────────────────────────
def affirmative(t: str, pat: str) -> bool:
    """부정문("산출하지 않았습니다") 안의 매치는 위반이 아니다."""
    for ln in t.split('\n'):
        if re.search(pat, ln) and not any(g in ln for g in NEGATION):
            return True
    return False


def check_finance(t: str, fx: dict, rep: Report):
    fin, exp = fx['financial'], fx['expect']
    if 'priceKrw' not in fin:            # development·operating — D17 §11 미착수
        return
    f = flatten(t)
    gross = fin['monthlyRentKrw'] * 12 / fin['priceKrw'] * 100

    shown = {float(m.group(2)) for m in DUP_METRICS[0][2].finditer(f)}
    off = {v for v in shown if abs(v - gross) > 0.15 and abs(v - exp['yields']['gross_price_deposit']) > 0.15}
    if off:
        rep.add('QA-YLD-01', 'BLOCK', '수익률이 원장에서 재현되지 않습니다',
                f'표기 {sorted(off)} · 재현 {gross:.2f}% / '
                f'{exp["yields"]["gross_price_deposit"]:.2f}%')

    # 역레버리지: 표기된 ROE는 모두 음수여야 한다
    if exp.get('negativeLeverage'):
        NO_LOAN = re.compile(r'무차입|상한|0\s*%|ceiling|대출\s*없')
        pairs = [(m.group(1), float(m.group(2)))
                 for m in DUP_METRICS[2][2].finditer(f)]
        roes = [v for _, v in pairs]
        # 무차입·상한 문맥의 양수는 정상 (역레버리지여도 무차입 ROE는 양수)
        pos = [v for ctx, v in pairs if v > 0 and not NO_LOAN.search(ctx)]
        if pos:
            rep.add('QA-LEV-01', 'BLOCK',
                    '역레버리지 물건인데 자기자본수익률이 양수로 표기됩니다',
                    f'{pos} · 대출 사용 시 음수여야 합니다')
        cap = (exp.get('ltv') or [{}])[0].get('roe')
        over = [v for v in roes if cap is not None and v > cap + 0.01]
        if over:
            rep.add('QA-LEV-02', 'BLOCK',
                    f'자기자본수익률이 이론 상한 {cap:.2f}%를 초과합니다', over)

    # 순수익률 라벨 — 운영비 자료 없으면 사용 금지
    if fin.get('opexKrw') is None and affirmative(
            t, r'(?:순\s*수익률|NOI\s*수익률)[^%\n]{0,20}\d'):
        rep.add('QA-BASIS-01', 'BLOCK',
                '운영비 자료가 없는데 "순수익률" 라벨을 씁니다',
                '총임대료 기준값에 순수익률 라벨 금지 (불변조건 1)')

    # 단가 비교 — 기준(basis) 표기 의무
    # 실제로 **비교 결과를 제시한 경우**에만 기준 표기를 요구합니다.
    # "비교사례 3~5건을 확보한 뒤 산출합니다" 같은 계획 문장은 대상이 아닙니다.
    if affirmative(t, r'(?:권역\s*평균|시세\s*대비|프리미엄|비교\s*사례)'
                      r'[^\n]{0,40}(?:[+\-−]?\d[\d,\.]*\s*(?:%|배)|원/(?:㎡|평))'):
        if not re.search(r'(토지|대지)\s*(?:면적)?\s*기준|연면적\s*기준|basis', t):
            rep.add('QA-BASIS-02', 'BLOCK',
                    '단가 비교에 기준(토지/연면적) 표기가 없습니다',
                    '연면적 단가를 토지 실거래와 비교하면 항상 몇 배로 나옵니다')

    # 총취득원가 — 취득세·중개보수 포함액이 있어야 한다
    tac = (exp.get('equity') or {}).get('totalAcquisitionCost', 0) / EOK
    if not re.search(r'총\s*취득\s*원가|취득\s*총액', t):
        rep.add('QA-BASIS-03', 'MAJOR', '총취득원가가 없습니다',
                f'{tac:.2f}억 (매매가 + 취득세 4.6% + 중개보수 0.9%)')


# ── 검사군 4 · 범위 검증 (sanity) ──────────────────────────────────────
def check_sanity(t: str, fx: dict, rep: Report):
    m = re.search(r'주차\s*(?:대수)?\s*[:\s|]*([\d,]+)\s*대', t)
    area = fx['expect'].get('sumAreaSqm') or fx['asset'].get('totalFloorAreaSqm') or 0
    if m:
        n = int(m.group(1).replace(',', ''))
        lim = max(4, int(area / 30)) if area else 200
        if n > lim:
            rep.add('QA-SANITY-01', 'BLOCK',
                    f'주차 대수 {n:,}대가 연면적 대비 불가능합니다',
                    f'상한 약 {lim}대 (연면적 {area:g}㎡ ÷ 30㎡)')

    for label, pat in (('연면적', r'연면적[^\n㎡]{0,20}?([\d,]+(?:\.\d+)?)\s*㎡'),
                       ('대지면적', r'대지\s*면적[^\n㎡]{0,20}?([\d,]+(?:\.\d+)?)\s*㎡')):
        for mm in re.finditer(pat, t):
            if float(mm.group(1).replace(',', '')) <= 0:
                rep.add('QA-SANITY-02', 'BLOCK', f'{label}이 0으로 표기됩니다',
                        '값이 없으면 0이 아니라 "확인 필요"로 표기합니다')
                break

    use = re.search(r'주요\s*용도\s*[:\s|]*([^\n|]{2,20})', t)
    if use:
        u = use.group(1).strip()
        real = fx['asset']['buildingUse']
        if u not in real and real not in u:
            rep.add('QA-SANITY-03', 'BLOCK', '주요 용도가 원장과 다릅니다',
                    f'표기 "{u}" · 원장 "{real}"')

    y = re.search(r'준공\s*년?도?\s*[:\s|]*((?:19|20)\d{2})\s*년', t)
    if y and not 1960 <= int(y.group(1)) <= 2027:
        rep.add('QA-SANITY-04', 'MAJOR', '준공년도가 범위를 벗어납니다', y.group(1))


# ── 검사군 5 · 표현·렌더·유출 ──────────────────────────────────────────
def check_text(t: str, fx: dict, rep: Report):
    lines = t.split('\n')

    hits = {}
    for w in BANNED:
        n = 0
        for ln in lines:
            if w not in ln or any(g in ln for g in NEGATION):
                continue
            # 제외 낱말이 덮는 구간을 먼저 계산한다
            covered = []
            for full in CONTEXT_EXCLUDE.get(w, ()):
                covered += [(x.start(), x.end())
                            for x in re.finditer(re.escape(full), ln)]
            for mm in re.finditer(re.escape(w), ln):
                if any(a <= mm.start() and mm.end() <= b for a, b in covered):
                    continue
                n += 1
        if n:
            hits[w] = n
    if hits:
        rep.add('QA-BAN-01', 'MAJOR', f'금지어 {sum(hits.values())}건',
                ' · '.join(f'{k} {v}' for k, v in sorted(hits.items(), key=lambda x: -x[1])))

    em = emoji_chars(t)
    if em:
        rep.add('QA-EMOJI-01', 'MINOR', f'이모지 {len(em)}자',
                ''.join(sorted(set(em))))

    ph = PLACEHOLDER.findall(t)
    if ph:
        rep.add('QA-PH-01', 'BLOCK', f'미치환 플레이스홀더 {len(ph)}건',
                ' · '.join(sorted(set(ph))[:6]))

    mk = MASK_TOKEN.findall(t)
    if mk:
        rep.add('QA-PH-02', 'BLOCK', f'마스킹 토큰이 본문에 노출 {len(mk)}건',
                ' · '.join(sorted(set(mk))))

    if Path(getattr(check_text, '_suffix', '')).suffix != '.md':
        md = MD_UNRENDERED.findall(t)
        if md:
            rep.add('QA-MD-01', 'BLOCK', f'마크다운이 렌더되지 않았습니다 ({len(md)}건)',
                    ' · '.join(repr(x)[:24] for x in md[:5]))

    leak = INTERNAL_LEAK.findall(t)
    if leak:
        rep.add('QA-LEAK-01', 'BLOCK', f'내부 경로·식별자 노출 {len(leak)}건',
                ' · '.join(sorted(set(leak))[:4]))

    for row in (fx.get('ledger') or {}).get('rows', []):
        for key in ('tenantName', 'ownerName'):
            v = row.get(key)
            if v and len(v) >= 2 and v in t:
                rep.add('QA-MASK-01', 'BLOCK', '임차인·소유자 실명이 노출됩니다', v)
                break


# ── 검사군 6 · 결손 처리 ───────────────────────────────────────────────
CONFIRM_BADGE = re.compile(r'✅|✓\s*(?:자료\s*확보|확인됨|공부\s*확인)|확인\s*완료|검토\s*완료')


def check_deficiency(t: str, fx: dict, rep: Report):
    defs_ = fx['expect'].get('deficiencies') or []
    has_defect_note = bool(re.search(r'확인\s*필요|미확정|확보되지\s*않|제출되지\s*않', t))
    if not has_defect_note:
        rep.add('QA-DEF-01', 'BLOCK', '결손 표기가 0건입니다',
                f'픽스처 결손 {len(defs_) or "다수"}건')

    if CONFIRM_BADGE.search(t) and re.search(r'(확인\s*필요|미정|0\s*㎡|확보되지\s*않)', t):
        rep.add('QA-BADGE-01', 'BLOCK',
                '"확인됨" 신호와 결손 표기가 같은 문서에 공존합니다',
                '뱃지는 deficiencies에서 파생되어야 합니다 (독립 생성 금지)')

    if affirmative(t, r'권리\s*제한\s*없음|근저당\s*없음|분쟁\s*없음|연체\s*0건') \
            and not fx.get('attachedDocs'):
        rep.add('QA-DEF-02', 'BLOCK', '공부 미제출 상태에서 "없음"으로 판정했습니다',
                '판정하지 않고 "확인 필요"로 남깁니다')


# ── 매체 교차 대조 ─────────────────────────────────────────────────────
def cross_media(texts: dict[str, str], rep: Report):
    if len(texts) < 2:
        return
    for cid, name, pat in DUP_METRICS:
        per = {n: sorted({m.group(1).replace(',', '') for m in pat.finditer(t)})
               for n, t in texts.items()}
        per = {k: v for k, v in per.items() if v}
        if len({tuple(v) for v in per.values()}) > 1:
            rep.add(cid.replace('DUP', 'XMED'), 'BLOCK',
                    f'매체 간 {name} 불일치',
                    ' | '.join(f'{k}: {"/".join(v)}' for k, v in per.items()))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--fixture', required=True)
    ap.add_argument('--json', action='store_true')
    ap.add_argument('files', nargs='+')
    a = ap.parse_args()

    fx = json.loads(Path(a.fixture).read_text(encoding='utf-8'))
    rep, texts = Report(), {}

    for f in a.files:
        p = Path(f)
        if not p.exists():
            rep.add('QA-IO-01', 'BLOCK', '파일 없음', f)
            continue
        t = unicodedata.normalize('NFC', extract(p))
        texts[p.name] = t
        check_text._suffix = p.name
        check_duplicates(t, rep)
        check_fixture(t, fx, rep)
        check_finance(t, fx, rep)
        check_sanity(t, fx, rep)
        check_text(t, fx, rep)
        check_deficiency(t, fx, rep)

    cross_media(texts, rep)

    if a.json:
        print(json.dumps(rep.rows, ensure_ascii=False, indent=2))
    else:
        mark = {'BLOCK': '[차단]', 'MAJOR': '[중대]', 'MINOR': '[경미]'}
        print(f'\n대상 {len(texts)}건 · 픽스처 {fx["fixtureId"]}\n' + '─' * 66)
        for lv in Report.LEVELS:
            for r in [x for x in rep.rows if x['level'] == lv]:
                print(f'{mark[lv]} {r["id"]:<12} {r["title"]}')
                if r['detail']:
                    print(f'{"":>7} └ {r["detail"]}')
        print('─' * 66)
        print(f'차단 {rep.count("BLOCK")} · 중대 {rep.count("MAJOR")} · '
              f'경미 {rep.count("MINOR")}')
        print('발행 차단' if rep.count('BLOCK') else '차단 사유 없음')

    return 1 if rep.count('BLOCK') else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as e:                      # noqa: BLE001
        print(f'실행 오류: {e}', file=sys.stderr)
        sys.exit(2)
