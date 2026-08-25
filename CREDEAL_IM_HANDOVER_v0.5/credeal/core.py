#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
core.py — CREDEAL IM 단일 코어 (D19)

공공데이터 결합(R2판)과 원장 전용(R1판)을 한 코어가 처리합니다.

**모든 파생값을 여기서 한 번만 계산합니다.**
모바일·PPTX·문서는 이 코어를 읽기만 합니다. 각자 계산하지 않습니다.

v4 산출물의 최대 결함(원인 H — 같은 지표에 값이 2~3개)은
섹션마다 따로 계산했기 때문입니다. 코어를 한 곳에 두면 구조적으로 사라집니다.

모든 수치는 `Val(value, basis, source)` 로 감쌉니다.
`basis`가 없는 값은 렌더할 수 없습니다 (불변조건 2).
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import public_data as PD
import input_spec as ISPEC

EOK = 100_000_000          # 1억
MAN = 10_000               # 1만
PYEONG = 3.305785          # 1평 = 3.305785㎡

ACQ_TAX_RATE = 0.046       # 취득세 4.0 + 지방교육세 0.4 + 농특세 0.2
BROKER_FEE_RATE = 0.009    # 중개보수 법정 상한
ASSUMED_LOAN_RATE = 0.045  # 가정값 — D4 레지스트리
DEPOSIT_CONV_SEOUL = 900_000_000   # 환산보증금 지역기준 (서울) — 렌트롤 양식 v1.2


# ── 값 객체 ────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class Val:
    """수치 하나. basis 없이는 만들 수 없습니다."""
    value: float | int | None
    basis: str                      # 무엇을 분모/근거로 삼았는가
    source: str                     # ledger | official | derived | assumed | absent
    note: str = ''

    @property
    def known(self) -> bool:
        return self.value is not None


def absent(basis: str, what: str) -> Val:
    """결손. 0으로 채우지 않습니다 (불변조건 13)."""
    return Val(None, basis, 'absent', what)


# ── 표기 ───────────────────────────────────────────────────────────────
def eok(krw: float, digits: int = 2) -> str:
    return f'{krw / EOK:,.{digits}f}억'


def man(krw: float) -> str:
    return f'{krw / MAN:,.0f}만'


def pct(v: float, digits: int = 2) -> str:
    return f'{v:.{digits}f}%'


def sqm_pyeong(s: float) -> str:
    return f'{s:,.2f}㎡({s / PYEONG:,.2f}평)'


# ── 코어 ───────────────────────────────────────────────────────────────
@dataclass
class IMCore:
    fixture_id: str
    posture: str
    address_band: str
    building_use: str
    asset_type: str

    price: int
    deposit: int
    monthly_rent: int
    mgmt_fee: int | None

    # 파생 — 생성자에서 1회 계산
    acq_tax: Val = field(init=False)
    broker_fee: Val = field(init=False)
    total_acq_cost: Val = field(init=False)
    gross_price: Val = field(init=False)
    gross_price_deposit: Val = field(init=False)
    ltv_rows: list[dict] = field(init=False)
    negative_leverage: bool = field(init=False)
    roe_ceiling: Val = field(init=False)

    # 원장
    rows: list[dict] = field(default_factory=list)
    as_of: str | None = None
    stated_area: float | None = None
    stated_rent: int | None = None

    # 공부
    gfa_sqm: float | None = None
    far_base_sqm: float | None = None
    far_pct: float | None = None
    bcr_pct: float | None = None

    attached_docs: list[dict] = field(default_factory=list)
    deficiencies: list[str] = field(default_factory=list)
    gates_blocking: list[str] = field(default_factory=list)
    gates_warning: list[str] = field(default_factory=list)
    resolution: str = 'R1'
    price_band: str = ''
    edition: str = 'R1'          # 'R1' 원장만 · 'R2' 공공데이터 결합
    pub: dict = field(default_factory=dict)
    # ── 필지·제척·토지이용 (D22-8 · CATALOG_RULES P01~P03 · L10~L12) ──
    parcels: list = field(default_factory=list)      # parcel.Parcel[]
    zoning_items: list[str] = field(default_factory=list)
    relief: dict | None = None                       # 한시 완화 임계
    buyer_purpose: str = ''
    parcel_count_declared: int = 0   # 필지 수만 알고 내역이 없을 때

    def __post_init__(self):
        p = self.price
        self.acq_tax = Val(round(p * ACQ_TAX_RATE), '매매가 × 4.6%', 'derived',
                           '취득세 4.0 + 지방교육세 0.4 + 농특세 0.2')
        self.broker_fee = Val(round(p * BROKER_FEE_RATE), '매매가 × 0.9%', 'derived',
                              '법정 상한')
        self.total_acq_cost = Val(p + self.acq_tax.value + self.broker_fee.value,
                                  '매매가 + 취득세 + 중개보수', 'derived')

        ann = self.monthly_rent * 12
        self.gross_price = Val(ann / p * 100, '연 총임대료 ÷ 매매가', 'derived')
        self.gross_price_deposit = Val(ann / (p - self.deposit) * 100,
                                       '연 총임대료 ÷ (매매가 − 보증금)', 'derived')

        equity0 = self.total_acq_cost.value - self.deposit
        self.ltv_rows = []
        for ltv in (0.0, 0.4, 0.5):
            loan = round(p * ltv)
            eq = self.total_acq_cost.value - self.deposit - loan
            interest = loan * ASSUMED_LOAN_RATE / 12
            net = self.monthly_rent - interest
            self.ltv_rows.append({
                'ltv': ltv, 'loan': loan, 'equity': eq,
                'interest': interest, 'monthly_net': net,
                'roe': net * 12 / eq * 100 if eq > 0 else None,
            })

        self.negative_leverage = self.gross_price.value < ASSUMED_LOAN_RATE * 100
        self.roe_ceiling = Val(self.ltv_rows[0]['roe'],
                               '무차입 — 연 총임대료 ÷ 실투자금', 'derived',
                               '역레버리지 구간에서 ROE의 이론 상한')

    # ── 원장 집계 ──
    @property
    def ledger_sum_deposit(self) -> int:
        return sum(r['depositKrw'] or 0 for r in self.rows)

    @property
    def ledger_sum_rent(self) -> int:
        return sum(r['monthlyRentKrw'] or 0 for r in self.rows)

    @property
    def ledger_sum_mgmt(self) -> int:
        return sum(r['mgmtFeeKrw'] or 0 for r in self.rows)

    @property
    def ledger_sum_area(self) -> float:
        return sum(r['leaseAreaSqm'] or 0 for r in self.rows)

    @property
    def state_counts(self) -> dict[str, int]:
        c: dict[str, int] = {}
        for r in self.rows:
            c[r['leaseState']] = c.get(r['leaseState'], 0) + 1
        return c

    @property
    def vacancy(self) -> tuple[Val, Val]:
        """공실률은 두 기준을 모두 냅니다. 하나만 쓰면 basis 미표기가 됩니다."""
        vac = [r for r in self.rows if r['leaseState'] == '공실']
        by_unit = Val(len(vac) / len(self.rows) * 100 if self.rows else None,
                      '공실 구획 수 ÷ 전체 구획 수', 'derived')
        if vac and self.gfa_sqm:
            va = sum(r['leaseAreaSqm'] or 0 for r in vac)
            by_area = Val(va / self.gfa_sqm * 100, '공실 면적 ÷ 연면적', 'derived')
        elif not vac:
            by_area = Val(0.0, '공실 면적 ÷ 연면적', 'derived')
        else:
            by_area = absent('공실 면적 ÷ 연면적', '연면적 미확정')
        return by_unit, by_area

    # ── 해상도 (정본 IM_RESOLUTION_TIERS §1.1) ──
    @property
    def resolution_computed(self) -> tuple[str, list[str]]:
        """픽스처의 expect를 믿지 않고 규칙으로 판정합니다.

        R1 호실·업종·금액·만료일·임대상태
        R2 R1 + 면적·적용법령·관리비·시작일
        R3 R2 + 최초계약일·대항력
        종합 등급은 **가장 낮은 것**을 따릅니다 (§4.4).
        """
        live = [r for r in self.rows if r['leaseState'] == '임대중']
        miss: list[str] = []

        def lack(key, label, rows=None):
            src = rows if rows is not None else live
            n = sum(1 for r in src if not r.get(key) or r.get(key) == '미확인')
            if n:
                miss.append(f'{label} {n}건')
            return n

        r1 = not (lack('unitLabel', '호실') or lack('tenantBusiness', '업종')
                  or lack('currentExpiryDate', '만료일'))
        base = len(miss)
        lack('leaseAreaSqm', '임대면적', self.rows)
        lack('mgmtFeeKrw', '관리비')
        lack('currentStartDate', '현 계약 시작일')
        lack('legalBasis', '적용법령')
        r2 = r1 and len(miss) == base
        base2 = len(miss)
        lack('firstContractDate', '최초 계약일')
        lack('opposingPower', '대항력')
        r3 = r2 and len(miss) == base2

        return ('R3' if r3 else 'R2' if r2 else 'R1' if r1 else 'R0'), miss

    # ── 임대 현황 파생 (정본 §4.4) ──
    @property
    def first_floor_share(self) -> Val:
        """1층 임대료 비중. 소형상업용은 1층이 수입의 50~60%를 좌우합니다."""
        tot = self.ledger_sum_rent
        if not tot:
            return absent('1층 월세 ÷ 월세 합계', '월세 자료')
        f1 = sum(r['monthlyRentKrw'] or 0 for r in self.rows
                 if r['unitLabel'].startswith('1F'))
        return Val(f1 / tot * 100, '1층 월세 ÷ 월세 합계', 'derived')

    def conv_deposit(self, row: dict) -> Val:
        """환산보증금 = 보증금 + 월세 × 100. 초과 시 상임법 일부 미적용."""
        d, m = row.get('depositKrw'), row.get('monthlyRentKrw')
        if d is None or m is None:
            return absent('보증금 + 월세 × 100', '금액 자료')
        return Val(d + m * 100, '보증금 + 월세 × 100', 'derived')

    def expiry_gates(self, ref: date) -> tuple[list[str], list[str], dict]:
        """만료 게이트 G22·G23·G24 를 **계산합니다.**

        지금까지 이 게이트들은 픽스처의 `expect.gatesNotEvaluable` 에
        "평가 불가"로만 적혀 있었고 아무도 계산하지 않았습니다.
        양평동은 11건 전부가 만료일을 지났는데도 게이트가 조용했습니다.

        🔴 **만료 경과 = 공실이 아닙니다.**
        상가건물임대차보호법 제10조 갱신요구권과 민법 제639조 묵시의 갱신이
        있어, 만료일이 지나도 임차인이 계속 점유하면 계약은 유지됩니다.
        그래서 `leaseState` 가 '임대중' 인 한 **차단하지 않고 경고**합니다.
        만료와 함께 상태가 '공실' 로 뒤집힌 경우에만 차단입니다.
        """
        live = [r for r in self.rows if r['leaseState'] == '임대중']
        past = [r for r in live if self.expiry_state(r, ref) == '만료 경과']
        soon = [r for r in live if self.expiry_state(r, ref) == '만료 임박']
        vacated = [r for r in self.rows
                   if r['leaseState'] == '공실' and r.get('currentExpiryDate')
                   and self.expiry_state(r, ref) == '만료 경과']

        rent = lambda rs: sum(r.get('monthlyRentKrw') or 0 for r in rs)  # noqa: E731
        total = self.ledger_sum_rent or 1
        share = rent(past) / total * 100

        block, warn = [], []
        if past:
            warn.append('G22')
        if soon:
            warn.append('G24')
        if share > 50:
            # 묵시적 갱신 추정이므로 경고입니다. 근거를 확인해야 차단이 풀립니다.
            warn.append('G23')
        if vacated:
            block.append('G23')
        return block, warn, {
            'past': len(past), 'soon': len(soon), 'vacated': len(vacated),
            'past_rent_share': round(share, 1), 'ref': ref.isoformat(),
        }

    def expiry_state(self, row: dict, ref: date) -> str:
        """만료 경과 / 임박(60일) / 유효 — 정본 §4.4 시각 구분."""
        e = row.get('currentExpiryDate')
        if not e:
            return '확인 필요'
        d = (date.fromisoformat(e) - ref).days
        return '만료 경과' if d < 0 else '만료 임박' if d <= 60 else '유효'

    # ── 면적·단가 ──
    @property
    def area_conflict(self) -> tuple[float, float, float] | None:
        """층별 합 vs 표 계 행. ±2% 초과면 C33 차단.

        **모든 행에 임대면적이 있을 때만 비교합니다.** 일부 행만 면적이 있으면
        그 합은 건물 면적이 아니므로, 비교하면 없는 불일치를 만들어냅니다.
        (양평동은 B1 공실 행에만 면적이 있어 422.25㎡가 잡힙니다.)
        """
        if self.has_public:
            return None          # 공부로 확정됐습니다 (D19 §2.3)
        if self.stated_area is None or not self.ledger_sum_area:
            return None
        if any(r.get('leaseAreaSqm') is None for r in self.rows):
            return None
        s, t = self.ledger_sum_area, self.stated_area
        gap = abs(s - t)
        return (s, t, gap) if gap / max(s, t) > 0.02 else None

    # ── 공공데이터 (R2판) ──
    @property
    def has_public(self) -> bool:
        return self.edition == 'R2' and bool(self.pub)

    def f(self, key: str):
        """공공데이터 항목. R1판에서는 None을 돌려줍니다."""
        return self.pub.get(key) if self.has_public else None

    @property
    def land_sqm(self) -> Val:
        """대지면적. 공부(S1)가 최우선입니다."""
        p = self.f('landSqm')
        if p:
            return Val(p.value, '건축물대장 대지면적', 'official', p.source)
        if self.far_base_sqm and self.far_pct:
            return Val(self.far_base_sqm / (self.far_pct / 100),
                       '용적률산정연면적 ÷ 용적률', 'derived', '공부 확인 시 갱신')
        return absent('공부 기재', '대지면적')

    @property
    def gfa_confirmed(self) -> Val:
        """연면적. R2판에서는 공부 층별개요 합으로 확정합니다."""
        p = self.f('gfaSqm')
        if p:
            return Val(p.value, '건축물대장 층별개요 합', 'official', p.note or p.source)
        if self.gfa_sqm:
            return Val(self.gfa_sqm, '원장 기재', 'ledger')
        return absent('공부 기재', '연면적')

    @property
    def far_headroom(self) -> Val:
        """잔여 용적률 %p — 한국 매수자 소구 3원칙."""
        cur, lim = self.f('farPct'), self.f('farLimit')
        if not (cur and lim):
            return absent('법정 상한 − 현행', '용적률')
        return Val(lim.value - cur.value, '법정 상한 − 현행 용적률', 'derived')

    @property
    def land_price_total(self) -> Val:
        p = self.f('landPriceSqm')
        if not p:
            return absent('대지 × ㎡당 공시지가', '개별공시지가')
        return Val(self.land_sqm.value * p.value, '대지면적 × ㎡당 공시지가',
                   'derived', p.source)

    @property
    def land_price_multiple(self) -> Val:
        t = self.land_price_total
        if not t.known:
            return absent('매매가 ÷ 공시지가 총액', '개별공시지가')
        return Val(self.price / t.value, '매매가 ÷ 공시지가 총액', 'derived')

    @property
    def gfa_pyeong_price(self) -> Val:
        g = self.gfa_confirmed
        if not g.known:
            return absent('매매가 ÷ 연면적 평수', '연면적')
        return Val(self.price / (g.value / PYEONG), '매매가 ÷ 연면적 평수',
                   'derived', g.basis)

    @property
    def nearest_station(self):
        t = self.f('transit')
        return t.value[0] if t else None

    @property
    def land_pyeong_price(self) -> Val:
        """토지 평당가. 정본 §9.1 필수 요소 2 · 한국 매수자 소구 2원칙."""
        land = self.land_sqm
        if not land.known:
            return absent('매매가 ÷ 대지 평수', '대지면적')
        return Val(self.price / (land.value / PYEONG), '매매가 ÷ 대지 평수',
                   'derived', land.basis)

    def hero(self) -> list[dict]:
        """숫자 3개 — 정본 §5.2 · §9.2.3 (매매가 · 평당가 · 월 임대료).

        정본이 3개로 고정했습니다. "더 넣으면 아무것도 안 남음."
        평당가가 결손이면 **칸을 없애지 않고 확인 필요로 둡니다** (§4.2 ⑦).
        """
        pp = self.land_pyeong_price
        return [
            {'label': '매매 희망가', 'value': eok(self.price, 0),
             'basis': '중개인 제공'},
            {'label': '평당가 (토지)',
             'value': f'{pp.value / MAN:,.0f}만원/평' if pp.known else '확인 필요',
             'basis': pp.note or pp.basis if pp.known else '대지면적 미확보'},
            {'label': '월 임대료 합계', 'value': man(self.monthly_rent) + '원',
             'basis': f'임대 현황 {len(self.rows)}행 합계'},
        ]

    def one_liner(self) -> str:
        """한 줄 정의 — 25자 이내 (정본 §5.5).

        R2판은 역 거리와 대지 평수를 넣습니다 (소구 원칙 2·4).
        """
        gu = self.address_band.split()[-1]
        st = self.nearest_station
        land = self.land_sqm
        if st and land.known:
            name = st[0].split(' (')[0]
            cand = f'{name} {st[1]}m · 대지 {land.value / PYEONG:,.0f}평'
            if len(cand) <= 25:
                return cand
        live = self.state_counts.get('임대중', 0)
        vac = self.state_counts.get('공실', 0)
        tail = f'공실 {vac}' if vac else '공실 없음'
        s = f'{gu} · {live}개 임차 · {tail}'
        return s

    def _unused_hero(self) -> list[dict]:
        cells = []
        land = self.land_sqm
        if land.known:
            py = land.value / PYEONG
            cells.append({'label': '평당가 (대지)',
                          'value': f'{self.price / py / MAN:,.0f}만원/평',
                          'basis': f'매매가 ÷ 대지 {py:,.2f}평 · {land.basis}'})
        elif self.gfa_sqm:
            py = self.gfa_sqm / PYEONG
            cells.append({'label': '평당가 (연면적)',
                          'value': f'{self.price / py / MAN:,.0f}만원/평',
                          'basis': f'매매가 ÷ 연면적 {py:,.2f}평'})
        else:
            cells.append({'label': '총취득원가',
                          'value': eok(self.total_acq_cost.value),
                          'basis': self.total_acq_cost.basis})
        n = len(self.deficiencies)
        cells.append({'label': '확인 필요' if n else '자료 확보',
                      'value': f'{n}건' if n else '제출 자료 전량 확보',
                      'basis': '결손 목록에서 파생'})
        return cells

    # ── 입력 가용성 · 블록 게이팅 (D19 §8) ──
    def available_inputs(self) -> set[str]:
        """이 물건에 실제로 들어와 있는 입력의 집합."""
        a = {'price_krw', 'rr_unit', 'rr_business', 'rr_deposit', 'rr_rent',
             'rr_expiry', 'rr_state'}
        if self.as_of:
            a.add('rr_as_of')
        # 일부 행만 있으면 평당 단가·면적 공실률을 낼 수 없습니다
        if all(r.get('leaseAreaSqm') is not None for r in self.rows):
            a.add('rr_area')
        if all(r.get('legalBasis') for r in self.rows if r['leaseState'] == '임대중'):
            a.add('rr_legal')
        live = [r for r in self.rows if r['leaseState'] == '임대중']
        if live and all(r.get('mgmtFeeKrw') for r in live):
            a.add('rr_mgmt')
        if all(r.get('currentStartDate') for r in self.rows
               if r['leaseState'] == '임대중'):
            a.add('rr_start')
        if any(r.get('contractGroup') for r in self.rows):
            a.add('rr_group')
        if self.parcels:
            a.add('parcel_list')
            if any(p.exclusions for p in self.parcels):
                a |= {'exclusion_kind', 'exclusion_area', 'exclusion_affects_far'}
            if any(p.ownership == 'shared' for p in self.parcels):
                a.add('parcel_share')
        if self.buyer_purpose:
            a.add('buyer_purpose')
        if self.fixture_id == 'dangsan':
            a |= {'ownership_type', 'owner_count'}
        if self.has_public:
            a |= {'address_jibun'} | set(ISPEC.PUBLIC_AUTO)
            if self.pub.get('compsEnriched'):
                a |= {'comp_identify', 'comp_frontage', 'comp_floors',
                      'comp_land_sqm', 'comp_condition'}
            from pathlib import Path as _P
            ad = _P(__file__).resolve().parent / 'assets' / self.fixture_id
            imgs = {q.stem for q in ad.glob('*.jpg')} if ad.exists() else set()
            if {'hero', 'front'} & imgs:
                a.add('photo_ext')
            if any(q.startswith('in_') for q in imgs):
                a.add('photo_int')
        return a

    # ── 필지·제척 ──
    @property
    def land(self):
        """P01~P04. 필지가 없으면 None — 단일 필지 경로가 그대로 돕니다."""
        if not self.parcels:
            return None
        import parcel as PZ
        return PZ.summarize(self.parcels, self.far_base_sqm)

    @property
    def land_layout(self) -> dict:
        """L10·L11·L12 — 어떤 면을 켤지."""
        if not self.parcels:
            return {'L10': False, 'L11': False, 'L12': bool(self.zoning_items)}
        import parcel as PZ
        return PZ.layout_flags(self.parcels, self.zoning_items)

    @property
    def relief_cross(self) -> dict | None:
        """대장 기준 충족인데 유효 기준 이탈인가."""
        if not (self.parcels and self.relief):
            return None
        import parcel as PZ
        return PZ.relief_check(self.land, float(self.relief['thresholdPct']))

    def zoning_view(self) -> dict[str, list[str]]:
        """L12. 매수 목적이 없으면 전 항목을 본문에 냅니다 — 임의로 감추지 않습니다."""
        import parcel as PZ
        if not self.zoning_items:
            return {'본문': [], '접기': [], '부록': []}
        if not self.buyer_purpose:
            return {'본문': list(self.zoning_items), '접기': [],
                    '부록': list(self.zoning_items)}
        return PZ.zoning_view(self.zoning_items, self.buyer_purpose)

    def blocks(self) -> dict[str, tuple[bool, str]]:
        """블록 키 → (열림, 잠김 사유). 렌더러는 이 판정을 따르기만 합니다."""
        return {b.key: (ok, why)
                for b, ok, why in ISPEC.evaluate(self.available_inputs())}

    def resolution_pair(self) -> tuple[str, str, dict]:
        return ISPEC.resolve(self.available_inputs())

    def source_chips(self) -> list[str]:
        """실제로 결합된 출처만 켭니다 (D19 §1.1)."""
        if not self.has_public:
            return ['임대 현황(원장)']
        return ['건축물대장', '토지이용계획', '개별공시지가',
                '국토부 실거래', '카카오 로컬', '임대 현황(원장)']

    def badge(self, section_deficiencies: list[str]) -> str:
        """신뢰 신호는 결손에서 파생합니다. 독립 생성 금지 (D18 §4.6)."""
        return '자료 확보' if not section_deficiencies else '확인 필요'


# ── 픽스처 → 코어 ──────────────────────────────────────────────────────
DEFICIENCIES: dict[str, list[str]] = {
    'multiparcel': ['제척 12.5㎡ 관할 구청 확인 (토지이용계획도 판독값)',
                    '임대차계약 5건의 최초 계약일',
                    '임차인 대항력 요건 (사업자등록 여부)',
                    '운영비 내역',
                    '등기부등본 — 근저당·권리 제한',
                    '지하 1층 공실 — 목표 임대료·비교 임대사례'],
    'dangsan': ['연면적 확정 (층별 합 1,441.15㎡ vs 표 계 행 1,141.15㎡)',
                '임대차계약 6건의 최초 계약일',
                '관리비 부담 주체와 금액',
                '임차인 대항력 요건 (사업자등록 여부)',
                '운영비 내역',
                '등기부등본 — 근저당·권리 제한',
                '인근 지하철역까지의 실측 거리'],
    'yangpyeong': ['표지 요약과 각 행의 합 중 정본 (월세 5,017만 vs 4,657만)',
                   '임대 현황 기준일',
                   '임대차계약 11건의 최초 계약일',
                   '임차인 대항력 요건 (사업자등록 여부)',
                   '운영비 내역',
                   '등기부등본 — 근저당·권리 제한'],
}

PRICE_BANDS = [('B1', 3e9, 8e9), ('B2', 8e9, 15e9),
               ('B3', 15e9, 30e9), ('B4', 30e9, 50e9)]


def band_of(price: float) -> str:
    for b, lo, hi in PRICE_BANDS:
        if lo <= price < hi:
            return b
    return 'below' if price < 3e9 else 'above'


def load(fixture_id: str, root: Path | None = None,
         edition: str = 'R1') -> IMCore:
    root = root or Path(__file__).resolve().parent.parent
    d = json.loads((root / 'fixtures' / f'{fixture_id}.json').read_text(encoding='utf-8'))
    a, f, lg, e = d['asset'], d['financial'], d['ledger'], d['expect']
    core = IMCore(
        fixture_id=d['fixtureId'], posture=d['posture'],
        address_band=a['addressBand'], building_use=a['buildingUse'],
        asset_type=a['assetType'],
        price=f['priceKrw'], deposit=f['depositKrw'],
        monthly_rent=f['monthlyRentKrw'], mgmt_fee=f.get('mgmtFeeKrw'),
        rows=lg['rows'], as_of=lg.get('asOf'),
        stated_area=lg.get('statedTotalAreaSqm'),
        stated_rent=lg.get('statedMonthlyRent'),
        gfa_sqm=a.get('totalFloorAreaSqm'),
        far_base_sqm=a.get('farBaseAreaSqm'),
        far_pct=a.get('floorAreaRatio'),
        bcr_pct=a.get('buildingCoverageRatio'),
        attached_docs=d.get('attachedDocs') or [],
        deficiencies=list(DEFICIENCIES.get(d['fixtureId'], [])),
        gates_blocking=e.get('gatesBlocking') or [],
        gates_warning=e.get('gatesWarning') or [],
        resolution=e.get('resolution', 'R1'),
    )
    core.price_band = band_of(core.price)
    core.edition = edition

    # ── 필지·제척·토지이용 (D22-8) ──
    # 🔴 필지가 없는 물건은 그대로 둡니다. 빈 배열로 채우면 단일 필지가
    #    "1필지 물건" 으로 표기되어 없던 면이 생깁니다.
    land = d.get('land') or {}
    # 🔴 필지 수만 알고 내역이 없으면 **단일 필지로 오인하지 않습니다.**
    #    빈 배열을 그대로 두되 결손으로 남겨 확인사항이 받습니다 (불변조건 13).
    if land.get('parcelCount', 1) > 1 and not land.get('parcelsKnown', True):
        core.parcel_count_declared = int(land['parcelCount'])
        core.deficiencies = list(core.deficiencies) + [
            f'필지 {land["parcelCount"]}개 합지 — 필지별 면적·제척 미확보']
    if land.get('parcels'):
        import parcel as PZ
        core.parcels = [
            PZ.Parcel(
                jibun=x['jibun'], area=x['area'], jimok=x.get('jimok', '대'),
                ownership=x.get('ownership', 'sole'),
                share_num=x.get('shareNumerator'),
                share_den=x.get('shareDenominator'),
                official_price_sqm=x.get('officialPriceSqm'),
                exclusions=[
                    PZ.Exclusion(kind=e['kind'], area=e['area'],
                                 affects_far=e['affectsFAR'],
                                 provenance=e.get('provenance', 'broker'),
                                 note=e.get('note', ''))
                    for e in x.get('exclusions', [])],
            ) for x in land['parcels']]
    z = d.get('zoning') or {}
    core.zoning_items = list(z.get('items') or [])
    core.relief = z.get('temporaryRelief')
    core.buyer_purpose = (d.get('brokerInputs') or {}).get('buyerPurpose', '')
    if edition == 'R2':
        core.pub = PD.PUBLIC[fixture_id]
        filled = ('대지면적', '용도지역', '공시지가', '연면적 확정',
                  '인근 실거래', '비교사례', '인근 지하철역', '접면 도로')
        core.deficiencies = [d for d in core.deficiencies
                             if not any(k in d for k in filled)]
        # 공부로 확정되면 면적 게이트가 풀립니다 (D19 §2.3)
        core.gates_blocking = [g for g in core.gates_blocking if g != 'C33']
        core.attached_docs = []          # 정본 필지 매칭 완료 → G21 해소
        core.gates_blocking = [g for g in core.gates_blocking if g != 'G21']
        # 공부 층별개요가 임대면적을 채웁니다 → 해상도가 오를 수 있습니다
        by_unit = {lb.rstrip('F') if lb.startswith('B') else lb: a
                   for lb, a, _ in core.pub['floorTable'].value}
        for r in core.rows:
            if r.get('leaseAreaSqm') is None:
                key = r['unitLabel'].rstrip('F') if r['unitLabel'].startswith('B') \
                    else r['unitLabel']
                if key in by_unit:
                    r['leaseAreaSqm'] = by_unit[key]
                    r['_areaSource'] = core.pub['floorTable'].source
    return core


def selfcheck() -> int:
    """픽스처의 expect와 코어 계산이 일치하는지 확인합니다."""
    root = Path(__file__).resolve().parent.parent
    bad = 0
    for fid in ('dangsan', 'yangpyeong'):
        c = load(fid, root)
        e = json.loads((root / 'fixtures' / f'{fid}.json')
                       .read_text(encoding='utf-8'))['expect']
        checks = [
            ('취득세', c.acq_tax.value, e['equity']['acquisitionTax']),
            ('중개보수', c.broker_fee.value, e['equity']['brokerFee']),
            ('총취득원가', c.total_acq_cost.value, e['equity']['totalAcquisitionCost']),
            ('gross_price', round(c.gross_price.value, 2), e['yields']['gross_price']),
            ('gross_dep', round(c.gross_price_deposit.value, 2),
             e['yields']['gross_price_deposit']),
        ]
        for i, r in enumerate(c.ltv_rows):
            checks += [(f'LTV{int(r["ltv"]*100)} 실투자금', r['equity'], e['ltv'][i]['equity']),
                       (f'LTV{int(r["ltv"]*100)} 월순현금', round(r['monthly_net']),
                        e['ltv'][i]['monthlyNet']),
                       (f'LTV{int(r["ltv"]*100)} ROE', round(r['roe'], 2), e['ltv'][i]['roe'])]
        checks.append(('역레버리지', c.negative_leverage, e['negativeLeverage']))
        for name, got, want in checks:
            ok = got == want
            bad += not ok
            if not ok:
                print(f'  불일치 {fid} {name}: {got} != {want}')
        print(f'{fid:<12} {len(checks)}항 · {"전항 일치" if not bad else "불일치 있음"}')
    return bad


if __name__ == '__main__':
    import sys
    sys.exit(1 if selfcheck() else 0)
