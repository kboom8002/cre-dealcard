#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_d22.py — D22 규격에 따라 IM 을 생성합니다 (FR11 시연)

기존 `build_pptx_kr.build()` 는 페이지 순서를 **함수 안에 하드코딩**했습니다.
프리셋의 존재 이유가 순서를 바꾸는 것인데 순서를 바꾸려면 코드를 고쳐야
했습니다. 이 드라이버는 순서를 `ssot/im.pages.yaml` 에서 읽습니다.

또 하나 다른 점 — **중개인 보강 입력을 원장 위에 얹습니다.**
`broker_inputs/<물건>.json` 이 있으면 기준일·첨부공부·표지 정본을 덮어씁니다.
원장 자체는 제출받은 그대로 둡니다. 나중에 누가 무엇을 바꿨는지 추적하려면
두 층을 섞으면 안 됩니다.

사용:
    python3 build_d22.py --fixture yangpyeong --preset jsre_field_navy
    python3 build_d22.py --fixture yangpyeong --no-broker      # 보강 전 상태
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pptx import Presentation
from pptx.util import Inches

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'ssot'))

import build_mobile as M                                         # noqa: E402
import build_pptx_kr as K                                        # noqa: E402
import core as C                                                 # noqa: E402
import image_pipeline as IMG                                     # noqa: E402
import loader as SSOT                                            # noqa: E402
import presets as PS                                             # noqa: E402

RANK = {'D': 0, 'C': 1, 'B': 2, 'A': 3}


# 게이트가 풀리면 그 게이트를 근거로 쓰인 문장도 함께 사라져야 합니다.
# 🔴 손으로 쓴 확인사항·리스크 목록은 게이트가 풀려도 그대로 남습니다.
#    실제로 G19·G21 을 해소한 뒤에도 "표지 요약과 원장 합계 불일치" 와
#    "첨부 공부 오첨부" 가 리스크 칸에 남아 있었습니다.
RESOLVED_TEXT = {
    'G19': ('표지 요약', '표지·합계', '원장 합계'),
    'G21': ('오첨부', '첨부 공부', '정본 필지'),
    'G18': ('기준일',),
    'C33': ('연면적 확정', '면적 차이'),
}


def drop_resolved(items: list[str], cleared: set[str]) -> list[str]:
    pats = tuple(t for g in cleared for t in RESOLVED_TEXT.get(g, ()))
    return [i for i in items if not any(t in i for t in pats)]


# ── 중개인 보강 입력 ───────────────────────────────────────────────────
def overlay_broker(core, fid: str) -> dict:
    """원장 위에 보강 입력을 얹습니다. 원장은 건드리지 않습니다."""
    p = HERE / 'broker_inputs' / f'{fid}.json'
    if not p.exists():
        return {}
    b = json.loads(p.read_text(encoding='utf-8'))

    cleared: set[str] = set()
    if b.get('asOf'):
        core.as_of = b['asOf']
        core.gates_warning = [g for g in core.gates_warning if g != 'G18']
        cleared.add('G18')
    if b.get('statedMonthlyRentKrw'):
        core.stated_rent = b['statedMonthlyRentKrw']
        # 표지 요약 = 각 행의 합임을 중개인이 확정했습니다 → G19 해소
        if core.stated_rent == core.ledger_sum_rent:
            core.gates_blocking = [g for g in core.gates_blocking if g != 'G19']
            cleared.add('G19')
    if b.get('attachedDocsCorrected'):
        core.attached_docs = b['attachedDocsCorrected']
        band = core.address_band
        if all(d['addressBand'] in band or band in d['addressBand']
               for d in core.attached_docs):
            core.gates_blocking = [g for g in core.gates_blocking if g != 'G21']
            cleared.add('G21')
    # 해소된 게이트를 근거로 삼던 확인사항을 지웁니다.
    core.deficiencies = drop_resolved(list(core.deficiencies), cleared)
    b['_cleared'] = sorted(cleared)
    return b


# ── 사진 ───────────────────────────────────────────────────────────────
def resolve_photos(fid: str) -> tuple[dict, list[str], list[str]]:
    """(쓸 사진, 화질 경고, 뺀 사진)

    **필수 슬롯과 선택 슬롯을 다르게 다룹니다.**
    표지·위치도·지적도는 미달이어도 씁니다 — 사진 없는 IM 보다 흐린 사진이
    있는 IM 이 낫고, 대신 재촬영 안내를 냅니다.
    선택 슬롯은 미달이면 뺍니다 — 갤러리에 흐린 사진을 채울 이유가 없습니다.
    """
    d = HERE / 'assets' / fid
    kept, warn, dropped = {}, [], []
    for q in sorted(d.glob('*.jpg')) if d.exists() else []:
        try:
            diag = IMG.diagnose(q, q.stem)
            spec = SSOT.image_slot(q.stem)
        except KeyError:
            continue                                  # 규격에 없는 슬롯
        hard = [i for i in diag.issues if i.startswith('IMGQ01 해상도')]
        if not hard:
            kept[q.stem] = q
            continue
        msg = f'{q.stem} — 실효 {diag.effective_dpi:.0f}dpi (하한 {diag.min_dpi})'
        if spec.get('required'):
            kept[q.stem] = q
            warn.append(msg + ' · 필수 슬롯이라 사용 · 재촬영 권장')
        else:
            dropped.append(msg + ' · 선택 슬롯이라 제외')
    return kept, warn, dropped


# ── 페이지 편성 ────────────────────────────────────────────────────────
PAGE_SWITCH: dict = {}
CLEARED: set = set()


def sequence(preset: str, grade: str, core, A: dict) -> tuple[list[str], list[str]]:
    """(그릴 면, 생략한 면 + 사유)"""
    order = SSOT.page_order(preset)
    draw, skipped = [], []
    for key in order:
        pg = SSOT.page(key)
        if RANK[grade] < RANK[pg.get('min_grade', 'D')]:
            skipped.append(f'{key} — 등급 {grade} < {pg["min_grade"]}')
            continue
        if pg.get('requires_public') and not core.has_public:
            skipped.append(f'{key} — 공공데이터 미결합')
            continue
        # 🔴 스위치는 im.pages.yaml 이 소유합니다. presets.py 는 **스타일**만
        #    가집니다. 같은 이름을 두 곳에서 읽으면 어긋납니다.
        sw = pg.get('switch')
        if sw and not PAGE_SWITCH.get(sw):
            skipped.append(f'{key} — 프리셋 스위치 {sw} 꺼짐')
            continue
        # L10 — 필지 수 조건
        mp = pg.get('min_parcels') or 0
        if mp and len(getattr(core, 'parcels', []) or []) < mp:
            skipped.append(f'{key} — 필지 {len(core.parcels or [])}개 < {mp}개')
            continue
        need = pg.get('needs_photos') or 0
        if need:
            have = [k for k in (pg.get('photo') or []) if k in A]
            if len(have) < need:
                # 🔴 omit_policy=placeholder 면 면을 지우지 않습니다.
                #    없는 것을 조용히 없애면 결손이 사라집니다 (불변조건 13).
                pol = pg.get('omit_policy')
                if pol == 'placeholder' or (pol == 'placeholder_if_partial' and have):
                    skipped.append(f'{key} — 사진 {len(have)}매 < {need}매 · 안내 병기')
                    draw.append(key)
                    continue
                skipped.append(f'{key} — 사진 {len(have)}매 < 필요 {need}매')
                continue
        draw.append(key)
    return draw, skipped


def render(prs, key: str, core, A: dict, cp: dict, R: str) -> None:
    """페이지 키 → 빌더. 렌더러는 판단하지 않습니다."""
    if key == 'cover':
        K.s01_cover(prs, core, A)
    elif key == 'points':
        K.s02_points(prs, core, A, cp[f'points_{R}'])
    elif key == 'overview':
        K.s03_overview(prs, core, A, cp[f'tags_{R}'], cp[f'bullets_{R}'])
    elif key == 'location':
        K.s04_location(prs, core, A, cp['loc_notes'] if R == 'R2' else
                       ['접면 도로·배후 시설 현장 확인 필요',
                        '역 거리 미확보 — 도보 시간 임의 기재하지 않음'])
    elif key == 'parcels':
        K.sX_parcels(prs, core, A)
    elif key == 'land':
        K.s05_land(prs, core, A)
    elif key == 'rentroll':
        K.s06_rentroll(prs, core, A)
    elif key == 'lease2':
        K.s07_lease2(prs, core, A, cp['upside'])
    elif key == 'invest':
        K.s08_invest(prs, core, A)
    elif key == 'market':
        K.s09_market(prs, core, A)
    elif key == 'risk':
        K.s10_risk(prs, core, A, drop_resolved(list(cp['risk']), CLEARED))
    elif key == 'evidence':
        K.sX_evidence(prs, core, A)
    elif key == 'landvalue':
        K.sX_landvalue(prs, core, A)
    elif key == 'photos_ext':
        keys = [k for k in cp['ext'] if k in A]
        K.s11_photos(prs, core, A, keys, '건물 사진 — 외부',
                     cp['ext_caps'][:len(keys)])
    elif key == 'photos_int':
        keys = [k for k in cp['inr'] if k in A]
        K.s11_photos(prs, core, A, keys, '건물 사진 — 내부',
                     cp['inr_caps'][:len(keys)])
    elif key == 'terms':
        K.s12_terms(prs, core, A, K.STEPS)
    else:
        raise KeyError(f'빌더 없음: {key}')


# ── 생성 ───────────────────────────────────────────────────────────────
def build(fid: str, edition: str, preset: str, use_broker: bool = True):
    core = C.load(fid, edition=edition)
    broker = overlay_broker(core, fid) if use_broker else {}

    global CLEARED
    CLEARED = set(broker.get('_cleared') or ())
    K.apply_preset(PS.PRESETS[preset])
    global PAGE_SWITCH
    PAGE_SWITCH = dict(SSOT.load('im.pages')['presets'][preset]['switches'])

    L, P, lack = core.resolution_pair()
    grade = ('A' if L >= 'R2' and P >= 'P2' else
             'B' if L >= 'R1' and P >= 'P2' else
             'C' if L >= 'R1' and P == 'P1' else 'D')

    # 만료 게이트를 **계산합니다.** 픽스처에 적힌 것을 믿지 않습니다.
    from datetime import date as _date
    ref = _date.fromisoformat(core.as_of) if core.as_of else _date(2026, 8, 24)
    eb, ew, est = core.expiry_gates(ref)
    core.gates_blocking = sorted(set(core.gates_blocking) | set(eb))
    core.gates_warning = sorted(set(core.gates_warning) | set(ew))
    if est['past']:
        # 확인사항 한 줄은 45자를 넘지 않습니다 (정본 §4.7).
        # "100%" 는 금지어입니다 — 비중이 전부일 때는 말로 씁니다.
        live = sum(1 for r in core.rows if r['leaseState'] == '임대중')
        scope = ('임대중 전 호실' if est['past'] >= live
                 else f'월세 비중 {est["past_rent_share"]:.0f}%')
        core.deficiencies = list(core.deficiencies) + [
            f'만료 경과 {est["past"]}건 · {scope} — 묵시적 갱신 확인']

    A, photo_warn, dropped = resolve_photos(fid)
    # 결손은 사라지지 않고 확인사항으로 갑니다 (불변조건 13)
    need = SSOT.load('im.image')['minimum_set']['count']
    if len(A) < need:
        core.deficiencies = list(core.deficiencies) + [
            f'건물 사진 {len(A)}매 — 표준 최소 {need}매(외부3·내부3) 미달']
    if photo_warn:
        # 슬롯마다 한 줄씩 쓰면 확인사항이 사진 얘기로 덮입니다. 한 줄로 묶습니다.
        slots = ' · '.join(w.split(' —')[0] for w in photo_warn)
        core.deficiencies.append(f'사진 화질 미달 {len(photo_warn)}매 — {slots}')
    draw, skipped = sequence(preset, grade, core, A)

    prs = Presentation()
    prs.slide_width = Inches(K.SW)
    prs.slide_height = Inches(K.SH)
    cp = K.COPY[fid]
    for key in draw:
        render(prs, key, core, A, cp, edition)
    K.footer(prs, core)

    n = len(prs.slides)
    rules = SSOT.load('im.pages')['rules']
    cap = SSOT.load('im.pages')['presets'][preset]['max_pages']
    if n > cap:
        raise K.Overflow(f'{n}장 — 프리셋 {preset} 상한 {cap}장 초과')
    under = n < rules['min_pages']

    return {
        'prs': prs, 'core': core, 'broker': broker, 'grade': grade,
        'L': L, 'P': P, 'lack': lack, 'pages': n, 'draw': draw,
        'skipped': skipped, 'photos': sorted(A), 'photos_dropped': dropped,
        'photo_warn': photo_warn, 'expiry': est,
        'under_min': under,
        'blocking': list(core.gates_blocking),
        'warning': list(core.gates_warning),
    }


def report(r: dict, label: str) -> None:
    c = r['core']
    print(f'\n{label}')
    print('─' * 74)
    print(f'  해상도   L={r["L"]} · P={r["P"]} → 등급 {r["grade"]}')
    print(f'  면수     {r["pages"]}면' + ('  🔴 최소 12면 미달' if r['under_min'] else ''))
    print(f'  편성     {" → ".join(r["draw"])}')
    if r['skipped']:
        print('  생략')
        for s in r['skipped']:
            print(f'           {s}')
    print(f'  사진     사용 {len(r["photos"])}매 {r["photos"]}')
    for w in r['photo_warn']:
        print(f'           ⚠  {w}')
    for d in r['photos_dropped']:
        print(f'           제외 {d}')
    print(f'  차단     {r["blocking"] or "없음"}')
    print(f'  경고     {r["warning"] or "없음"}')
    e = r['expiry']
    print(f'  만료     경과 {e["past"]}건 (월세 비중 {e["past_rent_share"]}%) · '
          f'임박 {e["soon"]}건 · 공실 전환 {e["vacated"]}건 · 기준일 {e["ref"]}')
    if r['lack'].get('R3'):
        print(f'  R3 부족  {r["lack"]["R3"]}')
    print(f'  확인사항 {len(c.deficiencies)}건')


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--fixture', default='yangpyeong')
    ap.add_argument('--edition', default='R2')
    ap.add_argument('--preset', default='jsre_field_navy')
    ap.add_argument('--no-broker', action='store_true')
    ap.add_argument('--out')
    ap.add_argument('--no-mobile', action='store_true')
    a = ap.parse_args()

    r = build(a.fixture, a.edition, a.preset, use_broker=not a.no_broker)
    name = {'yangpyeong': '양평동', 'dangsan': '당산동'}.get(a.fixture, a.fixture)
    suffix = '' if not a.no_broker else '_보강전'
    stem = f'{name}_IM_D22_{r["grade"]}등급{suffix}'
    out = Path(a.out) if a.out else HERE / f'{stem}.pptx'
    r['prs'].save(str(out))
    report(r, f'{out.name}  ·  프리셋 {a.preset}')
    print(f'\n  저장 {out.name} · {out.stat().st_size / 1024:,.0f} KB')

    # 모바일 — **같은 코어**를 씁니다. 두 렌더러가 각자 판단하면 어긋납니다.
    if not a.no_mobile:
        html = HERE / f'{stem}_모바일.html'
        html.write_text(M.build(r['core']), encoding='utf-8')
        print(f'  저장 {html.name} · {html.stat().st_size / 1024:,.0f} KB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
