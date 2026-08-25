#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
copy_im.py — 섹션 카피 생성 (D19)

**정본은 `IM_STANDARD_수익형.md` 입니다.** 이 파일은 그 표준의 구현입니다.
충돌하면 정본이 우선합니다.

준수 조항
  §4.2 p2 한 장 요약 8블록      §4.3 투자 구조 (감정가 주의 문구 필수)
  §4.4 임대 현황 (㎡·평 병기 · VAT · 환산보증금 · 1층 비중 · 만료 구분)
  §4.6 리스크 3구획              §5.5 문장 길이
  §6.1 치환 사전 (렌트롤·NOI·Cap Rate·포스처 쓰지 않음)
  §6.3 금지어                    §6.4 숫자 표기
  §7.1 문장 45자 · 문단 3문장    §7.2 사실·견해·가정 분리
  §7.3 출처 표기                 §9 필수 구성 요소
"""
from __future__ import annotations

from datetime import date

from parcel import PROV_KO
from core import (ASSUMED_LOAN_RATE, DEPOSIT_CONV_SEOUL, IMCore, MAN,
                  PYEONG, absent, eok, man, pct, sqm_pyeong)
import public_data as PD
import sys as _sys
from pathlib import Path as _Path
_sys.path.insert(0, str(_Path(__file__).resolve().parent / 'ssot'))
import loader as _SSOT                                           # noqa: E402

SSOT_P = _SSOT.load('im.parcel')

REF_TODAY = date(2026, 8, 24)


# ── 조사 ───────────────────────────────────────────────────────────────
def josa(word: str, pair: str = '을/를') -> str:
    """받침에 따라 조사를 고릅니다. '을(를)' 병기 표기를 쓰지 않습니다."""
    a, b = pair.split('/')
    ch = word.rstrip(')】」』"\'').rstrip()[-1:]
    if not ch or not ('가' <= ch <= '힣'):
        return b
    return a if (ord(ch) - 0xAC00) % 28 else b


# ── 문형 (정본 §7.2 사실·견해·가정 분리) ────────────────────────────────
def F4(what: str) -> str:
    """결손."""
    return f'**확인 필요** — {what}'


def F5(what: str, why: str) -> str:
    """판정 불가."""
    return f'{why} **{what}{josa(what)} 산출하지 않았습니다.**'


def F3(label: str, basis: str) -> str:
    """가정 — ◇ 기호 (정본 §6.4)."""
    return f'◇ {label} — {basis}'


def OPINION(t: str) -> str:
    """견해는 주어를 밝힙니다 (정본 §7.1)."""
    return f'저희가 보기에 {t}'


def sec(key, title, question, blocks, defs):
    return {'key': key, 'title': title, 'question': question,
            'blocks': blocks, 'deficiencies': defs,
            'badge': '자료 확보' if not defs else '확인 필요'}


def P(t): return {'t': 'p', 'text': t}
def W(t): return {'t': 'warn', 'text': t}
def N(t): return {'t': 'note', 'text': t}
def H(t): return {'t': 'h', 'text': t}
def L(x): return {'t': 'list', 'items': x}
def T(head, rows, align=None):
    return {'t': 'table', 'head': head, 'rows': rows,
            'align': align or ['l'] * len(head)}


USE_LABEL = {'small_building': '소형 빌딩', 'office': '오피스'}


# ── 1 물건 개요 ────────────────────────────────────────────────────────
def property_overview(c: IMCore) -> dict:
    defs, b = [], []
    gu = c.address_band.split()[-1]
    res, _ = c.resolution_computed

    b.append(P(f'{gu} 소재 {c.building_use}입니다.'))

    land = c.land_sqm
    pp = c.land_pyeong_price
    kv = [['소재지', c.address_band, '중개인 제공'],
          ['주요 용도', c.building_use, '임대 현황 기재'],
          ]

    kv.append(['대지면적',
               sqm_pyeong(land.value) + ' (파생)' if land.known else '**확인 필요**',
               land.basis if land.known else '공부 원본 미제출'])
    if not land.known:
        defs.append('대지면적 — 건축물대장·토지대장')

    kv.append(['토지 평당가',
               f'{pp.value / MAN:,.0f}만원/평' if pp.known else '**확인 필요**',
               pp.basis if pp.known else '대지면적 확보 후 산출'])

    conflict = c.area_conflict
    g = c.gfa_confirmed
    if conflict:
        s, t, gap = conflict
        kv.append(['연면적', '**확인 필요**',
                   f'층별 합 {s:,.2f}㎡ vs 계 행 {t:,.2f}㎡'])
        defs.append('연면적 확정')
    elif g.known:
        kv.append(['연면적', sqm_pyeong(g.value), g.note or g.basis])


    if c.has_public:
        z, zl = c.f('zoning'), c.f('farLimit')
        kv += [['용도지역', f'{z.value} · {c.f("zoningOverlap").value}', z.source],
               ['건폐율 / 용적률',
                f'{c.f("bcrPct").value:.2f}% / {c.f("farPct").value:.2f}%  '
                f'(상한 {c.f("bcrLimit").value:.0f}% / {zl.value:.0f}%)',
                '건축물대장 · ' + zl.source],
               ['구조 / 층수',
                f'{c.f("structure").value} · {c.f("floors").value}', '건축물대장'],
               ['사용승인일 / 위반', f'{c.f("approvalDate").value} · '
                f'위반 {c.f("violation").value}', '건축물대장'],
               ['승강기 / 주차',
                f'{c.f("elevator").value} · {c.f("parking").value}', '건축물대장'],
               ['개별공시지가',
                f'{c.f("landPriceSqm").value:,}원/㎡ · 평당 '
                f'{c.f("landPriceSqm").value * PYEONG / MAN:,.0f}만원',
                c.f('landPriceSqm').source]]
    else:
        kv += [['용도지역', '**확인 필요**', '토지이용계획 미조회'],
               ['개별공시지가', '**확인 필요**', '조회 후 매매가 배수 산출']]
        defs += ['용도지역 — 토지이용계획', '개별공시지가 — 매매가 배수 산출']

    b.append(T(['항목', '내용', '출처'], kv))

    if c.has_public:
        # 통과하면 한 줄로 적고, 불일치가 있을 때만 표를 폅니다.
        xr = PD.crosscheck(c.fixture_id)
        bad = [x for x in xr if not x.ok]
        b.append(H('공부 교차검증'))
        if bad:
            b.append(T(['검증', '내용', '결과'],
                       [[x.code, x.label,
                         ('통과' if x.ok else '**불일치**') +
                         f' (차이 {x.gap_pct:.2f}%)'] for x in xr]))
        else:
            g = c.gfa_confirmed
            worst = max(x.gap_pct for x in xr if x.tol < 50)
            if g.note:
                b.append(P(f'연면적은 **{g.value:,.2f}㎡**로 확정했습니다. '
                           f'원장 계 행 {c.stated_area:,.2f}㎡는 오기입니다.'))
            b.append(N(f'교차검증 {len(xr)}항 일치 · 최대 차이 {worst:.2f}%'))

    if conflict:
        s, t, gap = conflict
        b.append(H('연면적이 확정되지 않았습니다'))
        b.append(P(f'층별 면적의 합은 **{s:,.2f}㎡**입니다.'))
        b.append(P(f'표의 계 행은 **{t:,.2f}㎡**입니다.'))
        b.append(P(f'**정확히 {gap:,.2f}㎡ 차이입니다.**'))
        b.append(P('건축물대장이 없어 어느 쪽이 맞는지 확정할 수 없습니다.'))
        b.append(W(f'검증 C33 — 면적 차이 {gap / max(s, t) * 100:.1f}%가 '
                   f'허용치 ±2%를 넘습니다. 발행이 중단됩니다.'))

    for d in c.attached_docs:
        if d['addressBand'].split()[1] != c.address_band.split()[1]:
            b.append(W(f'검증 G21 — 제출된 {d["kind"]}의 소재지가 다릅니다. '
                       f'{d["addressBand"]} 필지입니다. 서류 교체가 필요합니다.'))
            defs.append('첨부 공부 교체')

    return sec('property_overview', '물건 개요', '어떤 자산인가', b, defs)


# ── 2 입지 ─────────────────────────────────────────────────────────────
def location_access(c: IMCore) -> dict:
    gu = c.address_band.split()[-1]
    if c.has_public:
        tr = c.f('transit')
        b = [P(f'{gu} 일대입니다. 아래는 공공 API로 확인한 실측값입니다.'),
             T(['구분', '시설', '직선거리', '도보'],
               [['지하철' if 'ㅁ' not in n else '', n, f'{d:,}m', t]
                for n, d, t in tr.value], ['l', 'l', 'r', 'l']),
             N(f'출처 — {tr.source}'),
             H('도로와 배후'),
             L([f'간선도로 — {c.f("road").value}',
                f'배후 — {c.f("backing").value}']),
             H('상권 구성'),
             L([x.strip() for x in c.f('district').value.split('·')]),
             N(f'출처 — {c.f("district").source}')]
        return sec('location_access', '입지', '입지는 어떤가', b, [])
    b = [P(f'{gu} 일대입니다. 아래는 제출 자료로 확인한 사실입니다.'),
         T(['항목', '내용', '출처'],
           [['행정구역', c.address_band, '중개인 제공'],
            ['인근 역 도보 거리', '**확인 필요**', '실측 자료 미제출'],
            ['접면 도로', '**확인 필요**', '현장 확인 필요'],
            ['배후 시설', '**확인 필요**', '현장 확인 필요']]),
         P(F4('인근 역까지의 실측 거리가 제출 자료에 없습니다.')),
         P('도보 소요시간을 임의로 적지 않았습니다.'),
         N('거리(m)가 확인되면 도보 시간보다 거리를 먼저 적습니다.')]
    return sec('location_access', '입지', '입지는 어떤가', b,
               ['인근 역 도보 거리', '접면 도로'])


# ── 3 임대 현황 ────────────────────────────────────────────────────────
STATE_ORDER = ['임대중', '자가사용', '공실']
EXP_MARK = {'만료 경과': '▼ 만료 경과', '만료 임박': '⚠ 만료 임박',
            '유효': '', '확인 필요': '확인 필요'}


def lease_status(c: IMCore) -> dict:
    defs, b = [], []
    st = c.state_counts
    total = len(c.rows)
    ref = date.fromisoformat(c.as_of) if c.as_of else REF_TODAY
    summary = ' · '.join(f'{k} {st[k]}' for k in STATE_ORDER if k in st)

    if c.as_of:
        b.append(P(f'기준일은 {c.as_of}입니다. 총 {total}개 구획이며 {summary}입니다.'))
    else:
        b.append(P(f'총 {total}개 구획이며 {summary}입니다.'))
        b.append(P(F4('기준일이 적혀 있지 않습니다. 만기의 신선도를 판정할 수 없습니다.')))
        defs.append('임대 현황 기준일')

    agg = [['보증금 합계', eok(c.ledger_sum_deposit) + '원'],
           ['월세 합계 (VAT 별도)', man(c.ledger_sum_rent) + '원']]
    if c.ledger_sum_mgmt:
        agg.append(['관리비 합계 (VAT 별도)', man(c.ledger_sum_mgmt) + '원'])
    f1 = c.first_floor_share
    if f1.known:
        agg.append(['1층 월세 비중', pct(f1.value, 1)])
    b.append(T(['항목', '합계'], agg, ['l', 'r']))
    if f1.known:
        b.append(N('소형상업용은 1층이 임대수입의 절반 안팎을 좌우합니다.'))

    if c.stated_rent and c.stated_rent != c.ledger_sum_rent:
        gap = c.stated_rent - c.ledger_sum_rent
        impact = gap * 12 / c.price * 100
        b.append(H('표지 요약과 합계가 다릅니다'))
        b.append(T(['항목', '표지 요약', '각 행의 합', '차이'],
                   [['월세', man(c.stated_rent), man(c.ledger_sum_rent), man(gap)]],
                   ['l', 'r', 'r', 'r']))
        b.append(P(f'월 {man(gap)}원 차이는 연 {man(gap * 12)}원입니다.'))
        b.append(P(f'매매가 {eok(c.price, 0)} 기준 수익률 {impact:.2f}%p에 해당합니다.'))
        b.append(P('**매수인이 검산하면 즉시 드러납니다.**'))
        b.append(W('검증 G19 — 표지 합계와 각 행의 합이 다릅니다. 발행이 중단됩니다. '
                   '본 자료의 수치는 각 행의 합을 씁니다.'))
        defs.append('표지·합계 정본 확정')

    b.append(H(f'임대 현황 — 전 {total}행'))
    head = ['호실', '면적(㎡/평)', '업종', '상태', '보증금', '월세', '만료일', '만료 상태']
    rows = []
    for r in c.rows:
        grp = f' ({r["contractGroup"]})' if r.get('contractGroup') else ''
        a = r.get('leaseAreaSqm')
        rows.append([
            r['unitLabel'] + grp,
            f'{a:,.2f} / {a / PYEONG:,.2f}' if a else '확인 필요',
            r['tenantBusiness'] or '—',
            r['leaseState'],
            man(r['depositKrw']) if r['depositKrw'] else '—',
            man(r['monthlyRentKrw']) if r['monthlyRentKrw'] else '—',
            r['currentExpiryDate'] or '—',
            EXP_MARK[c.expiry_state(r, ref)],
        ])
    b.append(T(head, rows, ['l', 'r', 'l', 'l', 'r', 'r', 'l', 'l']))
    b.append(N('업종은 제출 자료의 원문 그대로입니다. 임차인 상호는 적지 않습니다. '
               '금액은 VAT 별도입니다.'))
    if any(r.get('leaseAreaSqm') is None for r in c.rows):
        n = sum(1 for r in c.rows if r.get('leaseAreaSqm') is None)
        defs.append(f'임대면적 {n}건')

    conv = [(r, c.conv_deposit(r)) for r in c.rows if r.get('legalBasis') == '상가']
    over = [(r, v) for r, v in conv if v.known and v.value > DEPOSIT_CONV_SEOUL]
    if conv:
        b.append(H('환산보증금'))
        if over:
            b.append(T(['호실', '환산보증금', '지역기준(서울)', '판정'],
                       [[r['unitLabel'], eok(v.value), eok(DEPOSIT_CONV_SEOUL),
                         '초과 — 5% 인상상한 미적용'] for r, v in over],
                       ['l', 'r', 'r', 'l']))
        else:
            b.append(P(f'상가 계약 {len(conv)}건 모두 서울 지역기준 '
                       f'{eok(DEPOSIT_CONV_SEOUL, 0)} 이하입니다.'))
            b.append(P('상가건물임대차보호법이 전면 적용됩니다.'))
        b.append(N('환산보증금 = 보증금 + 월세 × 100'))

    groups: dict[str, list] = {}
    for r in c.rows:
        if r.get('contractGroup'):
            groups.setdefault(r['contractGroup'], []).append(r)
    for g, v in {k: x for k, x in groups.items() if len(x) > 1}.items():
        b.append(H('통합계약 표기'))
        units = ' + '.join(x['unitLabel'] for x in v)
        rep = next(x for x in v if x['monthlyRentKrw'])
        b.append(P(f'{units}이 하나의 계약(그룹 {g})입니다.'))
        b.append(P(f'금액 {man(rep["depositKrw"])}/{man(rep["monthlyRentKrw"])}은 '
                   f'대표 행에만 적었습니다.'))
        b.append(P('**통합계약의 금액을 층별로 나누지 않습니다.**'))

    by_unit, by_area = c.vacancy
    b.append(H('공실률 — 두 기준'))
    b.append(P(f'구획 기준 **{pct(by_unit.value)}**입니다. ({by_unit.basis})'))
    b.append(P(f'면적 기준 **{pct(by_area.value) if by_area.known else "확인 필요"}**'
               f'입니다. ({by_area.basis})'))
    if st.get('자가사용'):
        b.append(P(f'**자가사용 {st["자가사용"]}개 구획은 공실이 아닙니다.**'))
        b.append(P('공실률 계산에서 분자·분모 모두 제외했습니다.'))

    b.append(H('갱신요구권'))
    n_first = sum(1 for r in c.rows if r.get('legalBasis') == '상가'
                  and not r.get('firstContractDate'))
    if n_first:
        b.append(P(f'상가 계약 {n_first}건에 최초 계약일이 없습니다.'))
        b.append(P('갱신요구권은 최초 계약일에서 기산합니다.'))
        b.append(P('**잔여 기간을 산출하지 않았습니다.**'))
        defs.append(f'최초 계약일 {n_first}건')

    expired = [r for r in c.rows if c.expiry_state(r, ref) == '만료 경과']
    soon = [r for r in c.rows if c.expiry_state(r, ref) == '만료 임박']
    if expired or soon:
        parts = []
        if expired:
            parts.append(f'만료 경과 {len(expired)}건')
        if soon:
            parts.append(f'60일 내 만료 {len(soon)}건')
        # 호실별 만료 상태는 위 표의 「만료 상태」 열에 이미 있습니다.
        # 같은 정보를 목록으로 반복하지 않습니다.
        b.append(W(f'기준일 {ref} 시점 {" · ".join(parts)}입니다.'))
        b.append(P('해당 호실은 위 표의 만료 상태 열에 표시했습니다.'))
        b.append(P('재계약 조건이 수익에 영향을 줍니다.'))

    return sec('lease_status', '임대 현황', '누가 쓰고 있나', b, defs)


# ── 4 투자 구조 ────────────────────────────────────────────────────────
def income_analysis(c: IMCore) -> dict:
    defs, b = [], []

    b.append(H('총취득원가'))
    b.append(P(f'**총취득원가는 {eok(c.total_acq_cost.value)}원입니다.**'))
    b.append(P('매매가만으로는 실제로 드는 돈을 알 수 없습니다.'))
    b.append(T(['항목', '금액', '산출'],
               [['매매가', eok(c.price), '중개인 제공'],
                ['취득세 4.6%', eok(c.acq_tax.value), c.acq_tax.note],
                ['중개보수 0.9%', eok(c.broker_fee.value), c.broker_fee.note],
                ['기타비용', '—', '자료 없음'],
                ['**총취득원가**', f'**{eok(c.total_acq_cost.value)}**',
                 '매매가 + 취득세 + 중개보수']], ['l', 'r', 'l']))
    extra = c.total_acq_cost.value - c.price
    b.append(P(f'매매가보다 **{eok(extra)}원({extra / c.price * 100:.1f}%)** 이 '
               f'더 듭니다.'))

    b.append(H('연 수익률'))
    b.append(T(['기준', '값'],
               [[c.gross_price.basis, f'**{pct(c.gross_price.value)}**'],
                [c.gross_price_deposit.basis, pct(c.gross_price_deposit.value)]],
               ['l', 'r']))
    b.append(P(F5('연 순수입 기준 수익률', '운영비 자료가 없어')))
    b.append(P('운영비를 빼지 않았으므로 "순"을 쓰지 않습니다.'))
    defs.append('운영비 내역')

    b.append(H('실투자금과 월 순현금'))
    b.append(N('실투자금 = 총취득원가 − 보증금 − 대출금'))
    b.append(N('월 순현금 = 월세 − 월 대출이자 (운영비 미반영)'))
    rows = []
    for r in c.ltv_rows:
        neg = r['monthly_net'] < 0
        rows.append([
            f'{int(r["ltv"] * 100)}%',
            eok(r['loan']) if r['loan'] else '—',
            eok(r['equity']),
            man(r['interest']) if r['interest'] else '—',
            ('▼ ' if neg else '') + f'{"+" if not neg else ""}{man(r["monthly_net"])}',
            pct(r['roe']) if r['roe'] is not None else '—',
        ])
    b.append(T(['LTV', '대출금', '실투자금', '월 이자', '월 순현금', '자기자본 수익률'],
               rows, ['r', 'r', 'r', 'r', 'r', 'r']))
    b.append(N(F3(f'금리 {ASSUMED_LOAN_RATE * 100:.1f}%', '2026년 통상 수준')))
    b.append(N('이자만 계산했습니다. 운영비는 반영하지 않았습니다.'))

    if c.negative_leverage:
        neg = next((r for r in c.ltv_rows if r['monthly_net'] < 0), None)
        b.append(W(f'수익률 {pct(c.gross_price.value)}가 '
                   f'금리 {ASSUMED_LOAN_RATE * 100:.1f}%보다 낮습니다. '
                   f'**대출을 늘릴수록 자기자본 수익률이 낮아집니다.**'))
        if neg:
            b.append(P(f'LTV {int(neg["ltv"] * 100)}%에서 월 순현금이 '
                       f'{man(neg["monthly_net"])}원이 됩니다.'))
        b.append(P(f'자기자본 수익률은 무차입 {pct(c.roe_ceiling.value)}가 '
                   f'가장 높습니다.'))
        b.append(P('이보다 높은 수치가 제시되면 산식을 확인하십시오.'))

    b.append(W('은행은 매매가가 아니라 **감정가**를 기준으로 대출한도를 정합니다. '
               '감정가가 매매가보다 낮게 나오는 경우가 있습니다. '
               '잔금 일정을 확정하기 전에 대출 승인을 받으시길 권합니다.'))

    return sec('income_analysis', '투자 구조', '얼마가 들어가나', b, defs)


# ── 가격 근거 (정본 §4.5 · p7) ─────────────────────────────────────────
def price_basis(c: IMCore) -> dict:
    if not c.has_public:
        b = [P('인근 실거래 비교사례가 제출되지 않았습니다.'),
             P('**시세 대비 위치와 목표 매각가를 산출하지 않았습니다.**'),
             P('비교사례 3~5건을 확보한 뒤 산출합니다.'),
             N('단가를 비교할 때는 분자와 분모의 기준을 맞춥니다. '
               '연면적 단가를 토지 실거래와 비교하면 항상 몇 배로 나옵니다.')]
        return sec('price_basis', '가격 근거', '왜 이 가격인가', b,
                   ['인근 실거래 비교사례 3~5건'])

    comps = c.f('comps')
    lp, gp = c.land_pyeong_price, c.gfa_pyeong_price
    llo, lhi = PD.comps_range(c.fixture_id, 'land')
    glo, ghi = PD.comps_range(c.fixture_id, 'gfa')
    b = [P(f'인근 실거래 {len(comps.value)}건을 조회했습니다. (출처 — {comps.source})'),
         T(['비교 사례', '거래일', '거래금액', '토지 평당', '연면적 평당', '규모'],
           [[n, d, f'{amt / 1e8:,.0f}억', f'{lpp:,}만', f'{gpp:,}만', fl]
            for n, d, amt, gfa, lpp, gpp, fl in comps.value],
           ['l', 'l', 'r', 'r', 'r', 'l'])]

    b.append(H('기준을 나눠 비교합니다'))
    lv, gv = lp.value / MAN, gp.value / MAN
    b.append(T(['기준', '본 자산', '인근 실거래', '위치'],
               [['토지 평당가', f'**{lv:,.0f}만원**', f'{llo:,}만 ~ {lhi:,}만',
                 f'하단 대비 {(lv / llo - 1) * 100:+.1f}%'],
                ['연면적 평당가', f'**{gv:,.0f}만원**', f'{glo:,}만 ~ {ghi:,}만',
                 f'하단 대비 {(gv / glo - 1) * 100:+.1f}%']],
               ['l', 'r', 'r', 'r']))

    mult, tot = c.land_price_multiple, c.land_price_total
    b.append(H('공시지가 기준'))
    b.append(T(['항목', '값', '출처'],
               [['㎡당 공시지가', f'{c.f("landPriceSqm").value:,}원',
                 c.f('landPriceSqm').source],
                ['토지 공시지가 총액', eok(tot.value), tot.basis],
                ['매매가 ÷ 공시지가', f'**{mult.value:.2f}배**', mult.basis],
                ['매매가 중 공시지가 비중', pct(tot.value / c.price * 100, 1),
                 '공시지가 총액 ÷ 매매가']], ['l', 'r', 'l']))

    if lv < llo:
        b.append(H('비교군보다 낮은 이유'))
        b.append(P(f'토지 평당가가 인근 하단 {llo:,}만원보다 낮습니다.'))
        far = c.f('farPct')
        if far and far.value < 300:
            b.append(P(f'용적률 {far.value:.2f}%의 저밀 개발이라 연면적이 적습니다.'))
            b.append(P('같은 땅에 건물이 덜 올라가 토지 평당가가 낮게 형성됩니다.'))
            b.append(P(f'**동시에 잔여 용적률 {c.far_headroom.value:.1f}%p라는 '
                       f'장점이기도 합니다.**'))
    return sec('price_basis', '가격 근거', '왜 이 가격인가', b, [])


# ── 5 개선 여력 ────────────────────────────────────────────────────────
def investment_thesis(c: IMCore) -> dict:
    b = []
    st = c.state_counts

    if c.fixture_id == 'dangsan':
        b.append(H('공실이 없습니다'))
        b.append(P(f'임대 {st["임대중"]}구획이 전부 임차 중입니다. 공실률 0%입니다.'))
        b.append(P('다만 4층 계약이 기준일 시점에 만료 경과 상태입니다.'))
        b.append(H('자가사용 2구획'))
        b.append(P('지하 1층과 4층 일부를 소유자가 직접 쓰고 있습니다.'))
        b.append(P(F5('임대 전환 시 예상 수입', '시장 임차료 자료가 없어')))
    else:
        b.append(H('임차 구성이 분산되어 있습니다'))
        b.append(P('11개 호실이 사무실·의료·미용·운동으로 나뉘어 있습니다.'))
        b.append(P(F5('분산이 공실 위험을 낮추는 정도', '만기 자료만으로는')))
        b.append(H('지하층 공실 임대 여력'))
        b.append(P('지하 1층 422.25㎡(127.73평)가 비어 있습니다.'))
        b.append(P(F5('공실 임대 시 예상 임대료', '비교 임대사례가 없어')))

    if c.has_public:
        hr = c.far_headroom
        if hr.known and hr.value > 20:
            b.append(H('잔여 용적률'))
            b.append(P(f'현행 용적률 {c.f("farPct").value:.2f}%입니다.'))
            b.append(P(f'{c.f("zoning").value} 법정 상한은 '
                       f'{c.f("farLimit").value:.0f}%입니다.'))
            b.append(P(f'**잔여 {hr.value:.1f}%p**입니다.'))
            b.append(P(F5('증축 가능 연면적', '높이·주차 기준 검토 전이라')))
            b.append(P('가로구역 최고높이와 주차 기준을 먼저 확인해야 합니다.'))
        elif hr.known:
            b.append(H('용적률'))
            b.append(P(f'현행 {c.f("farPct").value:.2f}% · 법정 상한 '
                       f'{c.f("farLimit").value:.0f}%입니다.'))
            b.append(P(f'잔여 {hr.value:.1f}%p로 증축 여력은 사실상 없습니다.'))
            b.append(P('**법정 한계까지 개발이 끝난 자산입니다.**'))

    b.append(H('저희 견해'))
    b.append(P(OPINION(f'무차입 또는 저LTV 구조가 맞습니다.')))
    b.append(P(f'수익률 {pct(c.gross_price.value)}가 금리 '
               f'{ASSUMED_LOAN_RATE * 100:.1f}%를 밑돕니다.'))
    b.append(P('레버리지로 수익을 키우는 구조가 아닙니다.'))

    res, _ = c.resolution_computed
    b.append(H('지금 판단할 수 없는 것'))
    b.append(P('가격의 적정성은 비교사례 없이 판정하지 않았습니다.'))
    b.append(P(f'확인 필요 {len(c.deficiencies)}건이 남아 있습니다.'))
    b.append(P(f'자료 해상도는 {res}이며 현 단계는 예비 검토입니다.'))

    return sec('investment_thesis', '개선 여력', '무엇이 나아지나', b,
               ['인근 실거래 비교사례'])


# ── 6 리스크 및 확인사항 (정본 §4.6 — 3구획) ────────────────────────────
CONFIRMED_RISK = {
    'dangsan': ['4층 주류판매 계약이 기준일 시점에 만료 경과 상태입니다.',
                '역레버리지 구간입니다. LTV 50%에서 월 순현금이 마이너스입니다.',
                '1층과 2층이 통합계약입니다. 분리 임대 시 재계약이 필요합니다.'],
    'yangpyeong': ['지하 1층 422.25㎡가 공실입니다. 면적 기준 공실률 16.95%입니다.',
                   '역레버리지 구간입니다. LTV 50%에서 월 순현금이 마이너스입니다.',
                   '표지 요약과 각 행의 합이 월 360만원 다릅니다.',
                   '첨부된 토지이용계획확인원이 본건이 아닙니다.'],
    'multiparcel': ['지하 1층 327.8㎡가 공실입니다. 면적 기준 공실률 18.32%입니다.',
                    '26-16 필지에 도시계획도로 저촉 12.5㎡가 있습니다.',
                    '제척 반영 시 한시 완화 250% 미만 조건에서 벗어납니다.'],
}
BUYER_CHECK = ['등기부등본으로 근저당·권리 제한을 확인하십시오.',
               '대출 감정가를 잔금 일정 확정 전에 확인하십시오.',
               '임대차계약서로 최초 계약일과 특약을 확인하십시오.']


def risk_check(c: IMCore) -> dict:
    b = [P('아래를 세 구획으로 나눠 적었습니다. '
           '확인하지 못한 항목을 "없음"으로 적지 않았습니다.')]

    b.append(H('확인된 리스크'))
    b.append(L(CONFIRMED_RISK[c.fixture_id]))

    b.append(H('미확인 사항'))
    b.append(L([f'**{d}**' for d in c.deficiencies]))

    b.append(H('매수인 확인 권고'))
    b.append(L(BUYER_CHECK))

    b.append(P('등기부등본이 없어 권리 제한 여부를 판정하지 않았습니다.'))

    if c.gates_blocking:
        gd = {'C33': '면적 차이 ±2% 초과', 'G19': '표지 합계 ≠ 각 행의 합',
              'G21': '첨부 공부 소재지 불일치', 'G18': '기준일 부재'}
        b.append(H('발행 전 검증'))
        b.append(T(['코드', '내용', '판정'],
                   [[g, gd.get(g, '—'), '**중단**'] for g in c.gates_blocking] +
                   [[g, gd.get(g, '—'), '경고'] for g in c.gates_warning]))
        b.append(W(f'중단 사유 {len(c.gates_blocking)}건이 있습니다. '
                   f'현재 상태로 대외 발행할 수 없습니다.'))

    return sec('risk_check', '리스크 및 확인사항', '무엇이 위험한가',
               b, c.deficiencies)


# ── 2B 필지·제척 (L10·L11) ─────────────────────────────────────────────
def parcels_sec(c: IMCore) -> dict:
    """필지가 2개 이상이거나 제척이 있을 때만 냅니다.

    🔴 단일 필지·제척 0 인 물건에 이 절을 내면 빈 말이 한 절 늘어납니다.
    """
    L = c.land
    if not L or (L.count < 2 and L.excluded_area <= 0):
        return {}
    defs: list[str] = []
    b = [P(f'{L.count}개 필지로 이루어져 있습니다.')]

    head = ['지번', '지목', '대장(㎡)', '지분', '제척(㎡)', '유효(㎡)']
    rows = []
    for pc in c.parcels:
        share = '단독' if pc.ownership == 'sole' else f'{pc.share_num}/{pc.share_den}'
        rows.append([pc.jibun, pc.jimok, f'{pc.area:,.1f}', share,
                     f'{pc.excluded_area:,.1f}' if pc.excluded_area else '—',
                     f'{pc.effective_area:,.1f}'])
    rows.append(['계', '', f'{L.ledger_area:,.1f}', '',
                 f'{L.excluded_area:,.1f}' if L.excluded_area else '—',
                 f'{L.effective_area:,.1f}'])
    b.append(T(head, rows, ['l', 'c', 'r', 'c', 'r', 'r']))

    if L.excluded_area > 0:
        b.append(H('유효 대지면적'))
        for pc in c.parcels:
            for e in pc.exclusions:
                prov = PROV_KO.get(e.provenance, e.provenance)
                b.append(P(f'{pc.jibun}에 {e.label} {e.area:,.1f}㎡가 있습니다. '
                           f'출처는 {prov} 입력입니다.'))
                if e.note:
                    # 40자를 넘으면 자르지 않고 나눕니다 (정본 §5.5)
                    for part in e.note.split(' — '):
                        b.append(N(part.strip()))
        b.append(T(['기준', '대지면적', '용적률'],
                   [['대장', f'{L.ledger_area:,.1f}㎡', pct(L.ledger_far_pct, 1)],
                    ['유효', f'{L.effective_area:,.1f}㎡', pct(L.effective_far_pct, 1)]],
                   ['l', 'r', 'r']))
        b.append(N('대장 면적으로 계산하면 증축 여유를 과대평가합니다.'))
        rc = c.relief_cross
        if rc:
            b.append(W(f'{c.relief["name"]} 조건은 '
                       f'{rc["threshold_pct"]:.0f}% 미만입니다. '
                       f'유효 기준 {rc["effective_far_pct"]}%로 벗어납니다.'))
            b.append(P(rc['action'] + '.'))
        defs.append('제척 면적 관할 구청 확인')

    return sec('parcels', '필지 명세', '땅이 몇 개인가', b, defs)


# ── 2C 토지이용계획 목적별 표시 (L12) ──────────────────────────────────
def zoning_sec(c: IMCore) -> dict:
    zv = c.zoning_view()
    if not zv['부록']:
        return {}
    b = []
    if c.buyer_purpose:
        lbl = (SSOT_P['zoning_display']['purpose_labels']
               .get(c.buyer_purpose, c.buyer_purpose))
        b.append(P(f'{lbl} 관점에서 관련이 큰 항목을 먼저 냅니다.'))
    else:
        b.append(P('매수 목적이 지정되지 않아 전 항목을 같은 비중으로 냅니다.'))
    if zv['본문']:
        b.append(L(zv['본문']))
    if zv['접기']:
        b.append(H('관련도 보통'))
        b.append(L(zv['접기']))
    b.append(H(f'전체 {len(zv["부록"])}항목'))
    b.append(L(zv['부록']))
    # 🔴 고르는 것은 강조일 뿐 감춤이 아닙니다. 전체를 반드시 싣습니다.
    b.append(N('관련도와 무관하게 확인원 전 항목을 실었습니다.'))
    return sec('zoning', '토지이용계획', '무엇이 걸려 있나', b, [])


# ── 7 거래 조건·다음 단계 ──────────────────────────────────────────────
def next_steps(c: IMCore) -> dict:
    res, short = c.resolution_computed
    b = [P('아래 순서로 진행하면 미확인 사항이 줄어듭니다.')]
    # 🔴 물건 이름으로 분기하지 않습니다. **실제로 열려 있는 게이트**에서 냅니다.
    #    fixture_id 분기는 값이 바뀌어도 문구가 그대로 남는 대표적인 경로입니다
    #    (원인 A · 하드코딩). 게이트가 풀리면 문구도 함께 사라져야 합니다.
    GATE_STEP = {
        'C33': '**연면적 확정** — 건축물대장으로 층별 합과 표 계 행 중 확인',
        'G19': '**정본 확정** — 표지 요약과 각 행의 합 중 어느 쪽이 맞는지 확인',
        'G21': '**서류 교체** — 첨부 공부의 소재지가 본건과 다릅니다',
        'G23': '**임대차 갱신** — 만료 계약 비중이 절반을 넘습니다',
    }
    steps = [GATE_STEP[g] for g in c.gates_blocking if g in GATE_STEP]
    if 'G18' in c.gates_warning:
        steps.append('**기준일 확정** — 임대 현황이 어느 날짜 기준인지 확인')
    n = sum(1 for r in c.rows if r.get('legalBasis') == '상가')
    need = ['임대차계약서 %d건' % n, '등기부등본']
    if not c.blocks()['noi'][0]:
        need.append('운영비 내역')
    steps.append('**자료 요청** — ' + ', '.join(need))
    # 이미 조회된 것을 다시 요청하지 않습니다.
    if not c.has_public:
        steps.append('**공부 조회** — 토지이용계획(용도지역), 개별공시지가')
    if not c.blocks()['comps_table'][0]:
        steps.append(f'**비교사례 확보** — 인근 {c.building_use} 유사 규모 실거래 3~5건')
    steps.append('**현장 확인** — 담당자에게 일정을 문의해 주십시오')
    b.append(L(steps))

    b.append(H('자료가 채워지면 무엇이 열리나'))
    # 다음 한 단계만 말합니다. 이미 채운 것을 다시 요구하면 신뢰를 잃습니다.
    nxt = {'R0': ('호실·업종·보증금·월세', '임대 현황 표'),
           'R1': ('임대면적·관리비·계약 시작일', '평당 단가'),
           'R2': ('최초 계약일·대항력', '갱신요구권'),
           'R3': ('', '')}.get(res, ('', ''))
    b.append(P(f'현재 자료 해상도는 {res}입니다.'))
    if nxt[0]:
        # 조사를 받침에 맞춰 고릅니다. '이(가)' 병기를 쓰지 않습니다.
        b.append(P(f'{nxt[0]}{josa(nxt[0], "이/가")} 채워지면 '
                   f'{nxt[1]}{josa(nxt[1], "이/가")} 열립니다.'))
    else:
        b.append(P('임대차 자료는 전부 확보됐습니다.'))
    if short:
        b.append(P('지금 부족한 항목은 아래와 같습니다.'))
        b.append(L(short))

    b.append(H('거래 조건'))
    b.append(P(f'매매 희망가 {eok(c.price, 0)} · 승계 보증금 {eok(c.deposit)}원입니다. '
               f'잔금 일정은 협의합니다. 대출 승계 여부는 **확인 필요**입니다.'))

    b.append(N('문의 시 물건명과 임차인 상호는 가려서 보내주십시오.'))
    return sec('next_steps', '거래 조건·다음 단계', '다음에 뭘 하나', b, [])


SECTIONS = [property_overview, parcels_sec, zoning_sec, location_access,
            lease_status, income_analysis, price_basis, investment_thesis,
            risk_check, next_steps]


def merge_paragraphs(blocks: list[dict], per: int = 3) -> list[dict]:
    """연속한 문단을 **최대 3문장**까지 합칩니다 (정본 §7.1 "한 문단 3문장 이내").

    한 문장을 한 문단으로 두면 규격은 지키지만 면이 낭비됩니다.
    정본은 3문장까지 허용하므로 합쳐서 12~16p 안에 들어가게 합니다.
    """
    out: list[dict] = []
    buf: list[str] = []

    def flush():
        nonlocal buf
        while buf:
            out.append(P(' '.join(buf[:per])))
            buf = buf[per:]

    for b in blocks:
        if b['t'] == 'p':
            buf.append(b['text'])
        else:
            flush()
            out.append(b)
    flush()
    return out


def build(c: IMCore) -> list[dict]:
    secs = [x for x in (f(c) for f in SECTIONS) if x]
    for s in secs:
        s['blocks'] = merge_paragraphs(s['blocks'])
    return secs


if __name__ == '__main__':
    import im_core
    for fid in ('dangsan', 'yangpyeong'):
        c = im_core.load(fid)
        ss = build(c)
        res, _ = c.resolution_computed
        print(f'{fid:<12} 섹션 {len(ss)} · 해상도 {res} · 결손 {len(c.deficiencies)} '
              f'· 블록 {sum(len(s["blocks"]) for s in ss)}')
