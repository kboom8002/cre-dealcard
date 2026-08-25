#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parcel.py — 다필지 · 제척 · 유효 대지면적 (D22-8)

CATALOG_SLOTS.md §2.1·§5.5 와 CATALOG_RULES.md P01~P03 · G12 · L10~L12 를
구현합니다. **새 규격이 아니라 이미 있던 규격의 구현입니다.**

왜 지금까지 없었는가 — 계산식을 소유하던 `IM_PRECISION_SPEC.md` 가
SUPERSEDED 되면서 승계 문서에 제척·다필지가 넘어가지 않았고, 그 위에
D19·D22 를 쌓았기 때문입니다. D22-1 §D5 는 아예 "다필지 차단" 을
결정했습니다 — 이미 지원하도록 설계된 것을 막기로 한 것입니다.

사용:
    python3 parcel.py            # 잠원동 두원빌딩 2필지 실사례
"""
from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'ssot'))

import loader as SSOT                                            # noqa: E402


# 출처 표시. 화면에 영어를 내지 않습니다 — 정본 §6 어휘 규칙.
PROV_KO = {'broker': '중개인', 'official': '공부', 'api': '공공API',
           'derived': '파생', 'assumed': '가정'}


# ── 모형 ───────────────────────────────────────────────────────────────
@dataclass
class Exclusion:
    kind: str                       # ExclusionKind 7종
    area: float                     # ㎡
    affects_far: bool               # 용적률 산정 대지면적에서 빠지는가
    provenance: str = 'broker'      # 🔴 대개 중개인 — API 로 안 나옵니다
    note: str = ''

    @property
    def label(self) -> str:
        for k in SSOT.load('im.parcel')['exclusion_kinds']:
            if k['key'] == self.kind:
                return k['label']
        raise KeyError(f'미등록 제척 사유: {self.kind}')


@dataclass
class Parcel:
    jibun: str
    area: float                     # 대장 면적 ㎡
    jimok: str = '대'
    ownership: str = 'sole'         # sole | shared
    share_num: int | None = None
    share_den: int | None = None
    official_price_sqm: int | None = None
    exclusions: list[Exclusion] = field(default_factory=list)

    @property
    def owned_area(self) -> float:
        """지분 반영 면적. 공유지분이면 내 몫만 셉니다."""
        if self.ownership == 'shared':
            if not (self.share_num and self.share_den):
                raise ValueError(f'{self.jibun} 공유지분인데 지분이 없습니다')
            return self.area * self.share_num / self.share_den
        return self.area

    @property
    def excluded_area(self) -> float:
        return sum(e.area for e in self.exclusions if e.affects_far)

    @property
    def effective_area(self) -> float:
        # 필지별로 음수가 되지 않게 자릅니다. 제척이 면적을 넘으면 G12 가 잡습니다.
        return max(0.0, self.owned_area - self.excluded_area)


# ── 파생 (CATALOG_RULES P01~P04) ───────────────────────────────────────
@dataclass
class LandSummary:
    count: int
    ledger_area: float              # P04
    owned_area: float
    excluded_area: float
    effective_area: float           # P01
    exclusion_impact_pct: float     # P03
    effective_far_pct: float | None = None    # P02
    ledger_far_pct: float | None = None


def summarize(parcels: list[Parcel], far_counted_area: float | None = None
              ) -> LandSummary:
    ledger = sum(p.area for p in parcels)
    owned = sum(p.owned_area for p in parcels)
    excl = sum(p.excluded_area for p in parcels)
    eff = sum(p.effective_area for p in parcels)
    s = LandSummary(
        count=len(parcels), ledger_area=ledger, owned_area=owned,
        excluded_area=excl, effective_area=eff,
        exclusion_impact_pct=(excl / ledger * 100) if ledger else 0.0,
    )
    if far_counted_area:
        s.ledger_far_pct = far_counted_area / ledger * 100 if ledger else None
        # 🔴 유효 대지가 작아지면 용적률은 **올라갑니다.** 여유가 줄어듭니다.
        s.effective_far_pct = far_counted_area / eff * 100 if eff else None
    return s


# ── 교차검증 X05 ───────────────────────────────────────────────────────
def crosscheck_x05(parcels: list[Parcel], ledger_land_sqm: float,
                   tol_pct: float = 0.5) -> dict:
    """필지 면적 합 = 공부 대지면적.

    🔴 **이것이 D22-1 §D5 우려의 진짜 답입니다.**
    원래 걱정은 "다필지를 합산값으로 돌리면 오차가 허용범위 안에 들어와
    틀린 것이 통과한다" 였습니다. 답은 X01~X04 를 유효 면적으로 바꾸는 것이
    아니라 — 그러면 공부끼리의 항등식이 깨집니다 — **필지 합 자체를
    따로 검산**하는 것입니다.

    X01·X02·X04 는 공부가 선언한 대장 대지로 계산합니다. 건폐율·용적률이
    대장 대지 기준으로 고시되기 때문입니다. 유효 면적은 P01·P02 가 냅니다.
    """
    total = sum(p.area for p in parcels)
    delta = abs(total - ledger_land_sqm)
    pct = delta / ledger_land_sqm * 100 if ledger_land_sqm else 0.0
    return {
        'code': 'X05', 'label': '필지 면적 합 = 공부 대지면적',
        'expected': round(total, 2), 'actual': round(ledger_land_sqm, 2),
        'delta_pct': round(pct, 3), 'tol_pct': tol_pct, 'ok': pct <= tol_pct,
    }


# ── 게이트 G12 ─────────────────────────────────────────────────────────
def gate_g12(parcels: list[Parcel], s: LandSummary) -> list[str]:
    """제척 합계 ≤ 대지 합계 · 유효 용적률 재계산 일치.

    🔴 로그에 값을 담지 않습니다. 필지 식별자만 냅니다.
    """
    fails = []
    for p in parcels:
        if p.excluded_area > p.owned_area + 1e-9:
            fails.append(f'G12 차단 parcel={p.jibun} resolve=제척 면적 재확인')
    if s.effective_area > s.owned_area + 1e-9:
        fails.append('G12 차단 field=effectiveArea resolve=산식 확인')
    return fails


# ── 레이아웃 L10~L12 ───────────────────────────────────────────────────
def layout_flags(parcels: list[Parcel], zoning_items: list[str]) -> dict:
    s_excl = sum(p.excluded_area for p in parcels)
    return {
        'L10': len(parcels) >= 2,          # 필지 명세 면 추가
        'L11': s_excl > 0,                 # 유효 대지·유효 용적률 강조
        'L12': bool(zoning_items),         # 목적별 relevance 필터
    }


# ── 한시 완화 임계 ─────────────────────────────────────────────────────
def relief_check(s: LandSummary, threshold_pct: float) -> dict | None:
    """대장 기준으로는 충족인데 유효 기준으로는 이탈하는 경우를 잡습니다."""
    if s.ledger_far_pct is None or s.effective_far_pct is None:
        return None
    on_ledger = s.ledger_far_pct < threshold_pct
    on_eff = s.effective_far_pct < threshold_pct
    if on_ledger and not on_eff:
        return {
            'threshold_pct': threshold_pct,
            'ledger_far_pct': round(s.ledger_far_pct, 1),
            'effective_far_pct': round(s.effective_far_pct, 1),
            'verdict': '대장 기준 충족 · 유효 기준 이탈',
            'action': '완화를 전제한 규모 산출을 하지 않습니다',
        }
    return None


# ── 토지이용계획 목적별 표시 (L12) ─────────────────────────────────────
def zoning_view(items: list[str], purpose: str) -> dict[str, list[str]]:
    """항목을 본문·접기·부록으로 나눕니다.

    🔴 **전체 목록은 항상 부록에 실립니다.** 고르는 것은 강조일 뿐
       감추는 것이 아닙니다. 감추면 누락 책임이 생깁니다.
    """
    z = SSOT.load('im.parcel')['zoning_display']
    if purpose not in z['purposes']:
        raise KeyError(f'미등록 매수 목적: {purpose}')
    rel = {r['item']: r.get(purpose, 'low') for r in z['relevance']}

    # 🔴 부록은 **전체**입니다. low 만 모으는 것이 아닙니다.
    #    처음에 low 를 부록에 또 넣어 중복 계상했습니다 (7항목인데 9로 나옴).
    out: dict[str, list[str]] = {'본문': [], '접기': [], '부록': list(items)}
    for it in items:
        lv = rel.get(it)
        if lv is None:
            # 매핑에 없는 항목은 임의로 낮추지 않습니다. 접기에 두고 표시합니다.
            out['접기'].append(it + ' ◇ 관련도 미등록')
            continue
        if lv == 'high':
            out['본문'].append(it)
        elif lv == 'medium':
            out['접기'].append(it)
        # low 는 부록에만 — 이미 들어 있습니다
    return out


# ── 실사례 ─────────────────────────────────────────────────────────────
JAMWON = [
    Parcel('잠원동 26-14', 511.7),
    Parcel('잠원동 26-16', 104.4, exclusions=[
        Exclusion('planned_road', 12.5, True, 'broker',
                  '9M 도로 확폭 계획 저촉 (토지이용계획도 판독) — 관할 구청 확인 필요'),
    ]),
]
JAMWON_FAR_AREA = 1534.0     # 용적률 산정 연면적 — 대장 616.1㎡ 기준 249%


def demo() -> int:
    print('다필지 · 제척 — 잠원동 두원빌딩 (2필지)')
    print('─' * 74)
    s = summarize(JAMWON, JAMWON_FAR_AREA)

    print(f'  {"필지":<16}{"대장(㎡)":>10}{"지분반영":>10}{"제척":>8}{"유효":>10}')
    for p in JAMWON:
        print(f'  {p.jibun:<16}{p.area:>10,.1f}{p.owned_area:>10,.1f}'
              f'{p.excluded_area:>8,.1f}{p.effective_area:>10,.1f}')
        for e in p.exclusions:
            print(f'  {"":<16}└ {e.label} {e.area}㎡ '
                  f'({"용적률 산정 제외" if e.affects_far else "산정 포함"}) '
                  f'· ●{PROV_KO.get(e.provenance, e.provenance)}')
    print('  ' + '─' * 62)
    print(f'  {"P04 대장 합":<16}{s.ledger_area:>10,.1f}')
    print(f'  {"P01 유효 대지":<16}{s.effective_area:>10,.1f}')
    print(f'  {"P03 제척 영향도":<16}{s.exclusion_impact_pct:>9,.2f}%')
    print()
    print(f'  용적률 산정 연면적 {JAMWON_FAR_AREA:,.0f}㎡ 기준')
    print(f'    대장 기준   {s.ledger_far_pct:>6.1f}%')
    print(f'    P02 유효     {s.effective_far_pct:>6.1f}%   '
          f'(+{s.effective_far_pct - s.ledger_far_pct:.1f}%p)')

    r = relief_check(s, 250.0)
    print()
    if r:
        print(f'  🔴 한시 완화 임계 {r["threshold_pct"]:.0f}% — {r["verdict"]}')
        print(f'     {r["ledger_far_pct"]}% → {r["effective_far_pct"]}%  '
              f'· {r["action"]}')
        print(f'     제척 {s.excluded_area}㎡ 하나가 사업 구조를 바꿉니다.')
    else:
        print('  한시 완화 임계 — 이탈 없음')

    print()
    g = gate_g12(JAMWON, s)
    x5 = crosscheck_x05(JAMWON, 616.1)
    print(f'  G12  {g or "통과"}')
    print(f'  X05  필지 합 {x5["expected"]} = 공부 {x5["actual"]} · '
          f'차이 {x5["delta_pct"]}% · {"충족" if x5["ok"] else "불일치"}')
    zi = ['용도지역', '정비구역', '지구단위계획구역', '도시계획시설 저촉',
          '과밀억제군역', '가로구역별 최고높이 제한구역', '토지거래허가구역']
    zi[4] = '과밀억제권역'
    fl = layout_flags(JAMWON, zi)
    print(f'  레이아웃  ' + ' · '.join(f'{k}={"켬" if v else "끔"}'
                                    for k, v in fl.items()))

    print()
    print('  토지이용계획 목적별 표시 (L12)')
    for pu in ('income', 'development'):
        v = zoning_view(zi, pu)
        lbl = SSOT.load('im.parcel')['zoning_display']['purpose_labels'][pu]
        print(f'    [{lbl}] 본문 {len(v["본문"])} · 접기 {len(v["접기"])} · '
              f'부록 {len(v["부록"])}')
        print(f'       본문 — {" · ".join(v["본문"])}')

    print()
    print('  🔴 제척 면적은 API 로 나오지 않습니다. 중개인 입력 + 구청 확인입니다.')
    return 1 if g else 0


def selftest() -> int:
    """검사기가 실제로 잡는지 봅니다 — 결함을 주입합니다."""
    bad = 0

    # ① 제척이 면적을 넘음 → G12 차단
    ps = [Parcel('시험 1', 100.0, exclusions=[Exclusion('park', 120.0, True)])]
    g = gate_g12(ps, summarize(ps))
    ok = any('G12 차단' in x for x in g)
    bad += not ok
    print(f'  {"통과" if ok else "🔴 놓침"}  제척 120㎡ > 대지 100㎡ → G12')

    # ② 공유지분 — 1/2 지분이면 절반만 셉니다
    ps = [Parcel('시험 2', 200.0, ownership='shared', share_num=1, share_den=2)]
    v = summarize(ps).effective_area
    ok = abs(v - 100.0) < 1e-9
    bad += not ok
    print(f'  {"통과" if ok else "🔴"}  공유지분 1/2 → 유효 {v:.1f}㎡ (기대 100.0)')

    # ③ 지분 없는 공유 → 조용히 전체로 세지 않고 예외
    try:
        Parcel('시험 3', 200.0, ownership='shared').owned_area
        print('  🔴 놓침  지분 없는 공유지분이 통과했습니다')
        bad += 1
    except ValueError:
        print('  통과  지분 없는 공유지분 → 예외')

    # ④ 미등록 제척 사유 → 예외 (조용히 무시하지 않습니다)
    try:
        Exclusion('unknown_kind', 1.0, True).label
        print('  🔴 놓침  미등록 제척 사유가 통과했습니다')
        bad += 1
    except KeyError:
        print('  통과  미등록 제척 사유 → 예외')

    # ⑤ 미등록 매수 목적 → 예외
    try:
        zoning_view(['용도지역'], 'speculation')
        print('  🔴 놓침  미등록 매수 목적이 통과했습니다')
        bad += 1
    except KeyError:
        print('  통과  미등록 매수 목적 → 예외')

    # ⑥ 관련도 미등록 항목은 조용히 부록으로 내리지 않습니다
    v = zoning_view(['정체불명 규제'], 'income')
    ok = any('관련도 미등록' in x for x in v['접기'])
    bad += not ok
    print(f'  {"통과" if ok else "🔴 놓침"}  매핑 없는 항목 → 접기 + 표시')

    # ⑦ X05 — 필지 합이 공부와 어긋나면 잡습니다
    ps = [Parcel('시험 4', 300.0), Parcel('시험 5', 200.0)]
    r = crosscheck_x05(ps, 600.0)
    ok = not r['ok']
    bad += not ok
    print(f'  {"통과" if ok else "🔴 놓침"}  필지 합 500 vs 공부 600 → X05 불일치 '
          f'({r["delta_pct"]}%)')

    # ⑧ 부록은 항상 전체
    items = ['용도지역', '고도지구', '과밀억제권역']
    v = zoning_view(items, 'income')
    ok = v['부록'] == items
    bad += not ok
    print(f'  {"통과" if ok else "🔴"}  부록 = 전체 {len(v["부록"])}/{len(items)}')

    print()
    print('정상' if not bad else f'실패 {bad}건')
    return 1 if bad else 0


if __name__ == '__main__':
    if '--selftest' in sys.argv:
        print('parcel 자기검사')
        print('─' * 74)
        sys.exit(selftest())
    sys.exit(demo())
