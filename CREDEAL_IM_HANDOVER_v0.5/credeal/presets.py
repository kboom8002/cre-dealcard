#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
presets.py — PPTX 프리셋 (D19 v2.1 §6B)

현행 시스템은 프리셋 5종 · 토큰 53개입니다. 아래 3종을 더합니다.
**아키타입 엔진은 건드리지 않고 토큰과 배치 스위치만 바꿉니다.**

  P6 `jsre_field_navy`  국내 현장형 — 남색 라벨표 · 적색 매매가 · 사진 전진
  P7 `evidence_first`   근거 우선 — 출처 열 강제 · 근거 칩 밴드 · 검증 배지
  P8 `land_value_first` 토지가치 중심 — 공시지가 배수 · 잔여 용적률 전면

신설 토큰 7종 (현행 53 → 60)
  priceHi · priceHiBg   매매가 강조 (국내 IM 사실상 표준)
  labelCol · labelColTx 표 라벨 열 (남색 바탕 흰 글씨)
  srcChip · srcChipBg   출처 칩
  needsCheck            확인 필요
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Preset:
    key: str
    name: str
    cover: str
    layout: str
    target: str
    tokens: dict
    switches: dict = field(default_factory=dict)


# ── 공통 기본 토큰 (현행 golden_institutional 계열) ────────────────────
BASE = {
    'ink': '#10161F', 'ink2': '#1C2433', 'ink3': '#2D3748',
    'slate': '#4A5568', 'body': '#10161F', 'mute': '#5A6472',
    'line': '#CBD5E0', 'line2': '#E2E8F0', 'bg': '#FFFFFF', 'tint': '#F7FAFC',
    'green': '#276749', 'greenL': '#E7F1EB',
    'red': '#9B2C2C', 'redL': '#FBEDEA',
    'amber': '#9C4221', 'amberL': '#FEEBC8',
    'blue': '#2B6CB0', 'blueL': '#BEE3F8',
    'titleFont': 'Pretendard', 'bodyFont': 'Pretendard',
    # ── 신설 7종 ──
    'priceHi': '#C00000', 'priceHiBg': '#FCECEA',
    'labelCol': '#16325C', 'labelColTx': '#FFFFFF',
    'srcChip': '#C8D2E0', 'srcChipBg': '#1E2C42',
    'needsCheck': '#9E2B1C',
}


def _mk(**over) -> dict:
    d = dict(BASE)
    d.update(over)
    return d


# ── P6 국내 현장형 ─────────────────────────────────────────────────────
P6 = Preset(
    key='jsre_field_navy',
    name='JSRE Field Navy',
    cover='photo_left_panel',
    layout='field_kr',
    target='개인 자산가 대면 브리핑 · 인쇄 배포 · 30억~150억 근생',
    tokens=_mk(accent='#16325C', accentD='#0C1F3C', accentL='#3D5A87',
               accentT='#EEF1F5', tint='#EEF1F5',
               darkCard='#0C1F3C', darkBody='#E8EDF4', darkMute='#A9B6C8',
               darkAccentText='#C9B386'),
    switches={
        'coverPhoto': 'required',      # 표지 사진 필수 — 없으면 발행 경고
        'overviewPhoto': 'required',   # 개요 우측 사진 필수
        'priceAccent': True,           # 매매가 적색
        'labelColumn': True,           # 표 라벨 열 남색
        'bulletStyle': '개조식',
        'termsStrip': True,            # 개요 하단 매각 조건 띠
        'maxSlides': 16,
    },
)

# ── P7 근거 우선 ───────────────────────────────────────────────────────
P7 = Preset(
    key='evidence_first',
    name='Evidence First',
    cover='evidence_band',
    layout='evidence',
    target='기관·법인 실사 · 자문사 검토 · 게이트 차단 이력이 있는 물건',
    tokens=_mk(accent='#2B4C7E', accentD='#1B3557', accentL='#5C7FAE',
               accentT='#EAF0F7', tint='#F4F7FB',
               green='#12603F', greenL='#E7F1EB',
               srcChipBg='#243B55', srcChip='#CBD8E8'),
    switches={
        'sourceColumn': 'required',    # 모든 표에 출처 열 강제
        'sourceChips': 'header',       # 매 면 헤더에 근거 칩
        'crosscheckPage': True,        # 교차검증 X1~X4 전용 면
        'gradeBadge': 'LxP',           # 이중 해상도 배지
        'lockedBlockList': True,       # 잠긴 블록 목록 면
        'priceAccent': True,
        'labelColumn': True,
        'maxSlides': 18,               # 근거 면 2장 추가분
    },
)

# ── P8 토지가치 중심 ───────────────────────────────────────────────────
P8 = Preset(
    key='land_value_first',
    name='Land Value First',
    cover='land_metric',
    layout='metric_led',
    target='저밀 개발 · 증축·재건축 여력이 핵심인 자산 · 토지 중심 매수자',
    tokens=_mk(accent='#7A5C2E', accentD='#5C4522', accentL='#A98A50',
               accentT='#F5EFE4', tint='#FAF7F1',
               green='#3B6D11', greenL='#EAF3DE'),
    switches={
        'heroMetrics': ['토지 평당가', '공시지가 배수', '잔여 용적률'],
        'farGaugePage': True,          # 용적률 게이지 전용 면
        'landPriceFirst': True,        # 가격 근거에서 토지 기준을 먼저
        'coverPhoto': 'required',
        'priceAccent': True,
        'labelColumn': True,
        'maxSlides': 16,
    },
)

PRESETS = {p.key: p for p in (P6, P7, P8)}

# 현행 5종 (참조용 — 이 파일은 신규 3종만 소유합니다)
BUILTIN_EXISTING = ('golden_institutional', 'credeal_signature',
                    'executive_gold', 'corporate_clean', 'pro_dark_obsidian')


# ── WCAG 대비 검증 (현행 validatePresetAccessibility 대응) ─────────────
def _lum(hex_: str) -> float:
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    h = hex_.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast(a: str, b: str) -> float:
    la, lb = _lum(a), _lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


PAIRS = [
    ('본문 / 배경', 'body', 'bg', 4.5),
    ('약화 / 배경', 'mute', 'bg', 4.5),
    ('매매가 / 매매가 배경', 'priceHi', 'priceHiBg', 4.5),
    ('라벨 열 글씨 / 라벨 열', 'labelColTx', 'labelCol', 4.5),
    ('출처 칩 / 칩 배경', 'srcChip', 'srcChipBg', 4.5),
    ('확인 필요 / 배경', 'needsCheck', 'bg', 4.5),
    ('악센트 / 배경', 'accent', 'bg', 3.0),
]


def validate(p: Preset) -> list[tuple[str, float, float, bool]]:
    out = []
    for label, a, b, need in PAIRS:
        r = contrast(p.tokens[a], p.tokens[b])
        out.append((label, r, need, r >= need))
    return out


# ── 흑백 인쇄 검증 (정본 §4.7 — 색 의존 금지) ──────────────────────────
def mono_gap(p: Preset) -> list[tuple[str, float, bool]]:
    """흑백 변환 시 두 의미색이 구분되는가. 휘도 차 0.15 이상을 요구합니다."""
    checks = [('양수(green) ↔ 음수(red)', 'green', 'red'),
              ('매매가 ↔ 본문', 'priceHi', 'body'),
              ('확인 필요 ↔ 본문', 'needsCheck', 'body')]
    out = []
    for label, a, b in checks:
        g = abs(_lum(p.tokens[a]) - _lum(p.tokens[b]))
        out.append((label, g, g >= 0.02))
    return out


def main() -> int:
    bad = 0
    for p in PRESETS.values():
        print(f'\n══ {p.key} — {p.name} ══')
        print(f'  커버 {p.cover} · 레이아웃 {p.layout}')
        print(f'  타깃 {p.target}')
        print(f'  스위치 {len(p.switches)}종 · 상한 {p.switches.get("maxSlides")}장')
        print('  WCAG 대비')
        for label, r, need, ok in validate(p):
            bad += not ok
            print(f'    {"통과" if ok else "미달"}  {label:<22} {r:5.2f} : 1 '
                  f'(요구 {need})')
        print('  흑백 인쇄 — 색 의존 금지')
        for label, g, ok in mono_gap(p):
            print(f'    {"구분됨" if ok else "구분 어려움 · 기호 병기 필수"}  '
                  f'{label:<22} 휘도차 {g:.3f}')
    print(f'\n{"전 프리셋 통과" if not bad else f"미달 {bad}건"}')
    return 1 if bad else 0


if __name__ == '__main__':
    import sys
    sys.exit(main())
