#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
im_copy.py — 섹션 카피 생성

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

from im_core import (ASSUMED_LOAN_RATE, DEPOSIT_CONV_SEOUL, IMCore, MAN,
                     PYEONG, absent, eok, man, pct, sqm_pyeong)

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
    if c.gfa_sqm:
        b.append(P(f'연면적 {sqm_pyeong(c.gfa_sqm)}입니다. '
                   f'건폐율 {c.bcr_pct}% · 용적률 {c.far_pct}%입니다. (건축물대장)'))

    land = c.land_sqm
    pp = c.land_pyeong_price
    kv = [['소재지', c.address_band, '중개인 제공'],
          ['주요 용도', c.building_use, '임대 현황 기재'],
          ['자산 유형', USE_LABEL.get(c.asset_type, c.asset_type), '내부 판정'],
          ['매매 희망가', eok(c.price, 0), '중개인 제공']]

    kv.append(['대지면적',
               sqm_pyeong(land.value) + ' (파생)' if land.known else '**확인 필요**',
               land.basis if land.known else '공부 원본 미제출'])
    if not land.known:
        defs.append('대지면적 — 건축물대장·토지대장')

    kv.append(['토지 평당가',
               f'{pp.value / MAN:,.0f}만원/평' if pp.known else '**확인 필요**',
               pp.basis if pp.known else '대지면적 확보 후 산출'])

    conflict = c.area_conflict
    if conflict:
        s, t, gap = conflict
        kv.append(['연면적', '**확인 필요**',
                   f'층별 합 {s:,.2f}㎡ vs 계 행 {t:,.2f}㎡'])
        defs.append('연면적 확정')
    elif c.gfa_sqm:
        kv.append(['연면적', sqm_pyeong(c.gfa_sqm), '건축물대장'])

    kv.append(['용도지역', '**확인 필요**', '토지이용계획 미조회'])
    kv.append(['개별공시지가', '**확인 필요**', '조회 후 매매가 배수 산출'])
    defs += ['용도지역 — 토지이용계획', '개별공시지가 — 매매가 배수 산출']

    b.append(T(['항목', '내용', '출처'], kv))

    if conflict:
        s, t, gap = conflict
        b.append(H('연면적이 확정되지 않았습니다'))
        b.append(P(f'층별 면적의 합은 **{s:,.2f}㎡**입니다.'))
        b.append(P(f'표의 계 행은 **{t:,.2f}㎡**입니다.'))
        b.append(P(f'**정확히 {gap:,.2f}㎡ 차이입니다.**'))
        b.append(P('건축물대장이 없어 어느 쪽이 맞는지 확정할 수 없습니다.'))
        b.append(W(f'검증 C19 — 면적 차이 {gap / max(s, t) * 100:.1f}%가 '
                   f'허용치 ±2%를 넘습니다. 발행이 중단됩니다.'))

    for d in c.attached_docs:
        if d['addressBand'].split()[1] != c.address_band.split()[1]:
            b.append(W(f'검증 G21 — 제출된 {d["kind"]}의 소재지가 다릅니다. '
                       f'{d["addressBand"]} 필지입니다. 서류 교체가 필요합니다.'))
            defs.append('첨부 공부 교체')

    b.append(N(f'자료 해상도 {res} — 등급별 열리는 내용은 다음 단계 면을 보십시오.'))
    return sec('property_overview', '물건 개요', '어떤 자산인가', b, defs)


# ── 2 입지 ─────────────────────────────────────────────────────────────
def location_access(c: IMCore) -> dict:
    gu = c.address_band.split()[-1]
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
    b.append(H('공실률'))
    b.append(T(['기준', '값', '산식'],
               [['구획 기준', pct(by_unit.value) if by_unit.known else '—', by_unit.basis],
                ['면적 기준', pct(by_area.value) if by_area.known else '**확인 필요**',
                 by_area.basis]], ['l', 'r', 'l']))
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

    b.append(H('가격 근거'))
    b.append(P('인근 실거래 비교사례가 제출되지 않았습니다.'))
    b.append(P('**시세 대비 위치와 목표 매각가를 산출하지 않았습니다.**'))
    b.append(P('비교사례 3~5건을 확보한 뒤 산출합니다.'))
    b.append(N('단가를 비교할 때는 분자와 분모의 기준을 맞춥니다.'))
    defs.append('인근 실거래 비교사례 3~5건')

    return sec('income_analysis', '투자 구조', '얼마가 들어가나', b, defs)


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
}
BUYER_CHECK = ['건축물대장으로 연면적·대지면적을 확인하십시오.',
               '등기부등본으로 근저당·권리 제한을 확인하십시오.',
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
        gd = {'C19': '면적 차이 ±2% 초과', 'G19': '표지 합계 ≠ 각 행의 합',
              'G21': '첨부 공부 소재지 불일치', 'G18': '기준일 부재'}
        b.append(H('발행 전 검증'))
        b.append(T(['코드', '내용', '판정'],
                   [[g, gd.get(g, '—'), '**중단**'] for g in c.gates_blocking] +
                   [[g, gd.get(g, '—'), '경고'] for g in c.gates_warning]))
        b.append(W(f'중단 사유 {len(c.gates_blocking)}건이 있습니다. '
                   f'현재 상태로 대외 발행할 수 없습니다.'))

    return sec('risk_check', '리스크 및 확인사항', '무엇이 위험한가',
               b, c.deficiencies)


# ── 7 거래 조건·다음 단계 ──────────────────────────────────────────────
def next_steps(c: IMCore) -> dict:
    res, short = c.resolution_computed
    b = [P('아래 순서로 진행하면 미확인 사항이 줄어듭니다.')]
    steps = []
    if c.fixture_id == 'dangsan':
        steps.append('**연면적 확정** — 건축물대장으로 1,441.15㎡와 1,141.15㎡ 중 확인')
    else:
        steps.append('**정본 확정** — 표지 요약과 각 행의 합 중 어느 쪽이 맞는지 확인')
        steps.append('**서류 교체** — 토지이용계획확인원이 본건이 아닙니다')
    n = sum(1 for r in c.rows if r.get('legalBasis') == '상가')
    steps.append(f'**자료 요청** — 임대차계약서 {n}건, 등기부등본, 운영비·관리비 내역')
    steps.append(f'**공부 조회** — 토지이용계획(용도지역), 개별공시지가')
    steps.append(f'**비교사례 확보** — 인근 {c.building_use} 유사 규모 실거래 3~5건')
    steps.append('**현장 확인** — 담당자에게 일정을 문의해 주십시오')
    b.append(L(steps))

    b.append(H('자료가 채워지면 무엇이 열리나'))
    b.append(P(f'현재 자료 해상도는 {res}입니다. '
               f'임대면적·적용법령·관리비·시작일이 채워지면 평당 단가가 열립니다. '
               f'최초 계약일과 대항력이 채워지면 갱신요구권이 열립니다.'))
    if short:
        b.append(P('지금 부족한 항목은 아래와 같습니다.'))
        b.append(L(short))

    b.append(H('거래 조건'))
    b.append(P(f'매매 희망가 {eok(c.price, 0)} · 승계 보증금 {eok(c.deposit)}원입니다. '
               f'잔금 일정은 협의합니다. 대출 승계 여부는 **확인 필요**입니다.'))

    b.append(N('문의 시 물건명과 임차인 상호는 가려서 보내주십시오.'))
    return sec('next_steps', '거래 조건·다음 단계', '다음에 뭘 하나', b, [])


SECTIONS = [property_overview, location_access, lease_status, income_analysis,
            investment_thesis, risk_check, next_steps]


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
    secs = [f(c) for f in SECTIONS]
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
