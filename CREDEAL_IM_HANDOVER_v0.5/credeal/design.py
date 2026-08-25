#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
design.py — CREDEAL 디자인 시스템 (D19 §6)

모바일과 PPTX가 **같은 토큰**을 씁니다. 두 매체가 다른 색을 쓰면
같은 물건이 다른 자산으로 보입니다.

원칙
  · 색으로만 구분하는 정보를 만들지 않습니다 — 기호(▲▼) 병기
  · 회색은 #666보다 어둡게 (정본 §4.7 · A4 흑백 출력)
  · 숫자는 tabular-nums · 굵게 · 크게
"""
from __future__ import annotations

# ── 색 (D19 §6.1) ──────────────────────────────────────────────────────
C = {
    'ink':    '#0E1420',
    'ink2':   '#38404E',
    'mute':   '#5A6472',      # #666 보다 어둡게
    'navy':   '#14243D',
    'paper':  '#FFFFFF',
    'panel':  '#F4F6F8',
    'line':   '#DCE1E7',
    'gain':   '#0F5132',
    'gainbg': '#E9F1EC',
    'loss':   '#9E2B1C',
    'lossbg': '#FBEDEA',
    'seal':   '#7A5C2E',
    'sealbg': '#F5EFE4',
}


def rgb(name: str) -> tuple[int, int, int]:
    h = C[name].lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ── 활자 (D19 §6.2) ────────────────────────────────────────────────────
FONT_WEB = ('-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",'
            '"Noto Sans KR","Malgun Gothic",sans-serif')
FONT_PPT = 'Noto Sans CJK KR'

SIZE_WEB = {'hero': 30, 'title': 23, 'sub': 17, 'body': 17,
            'table': 14.5, 'caption': 13}
SIZE_PPT = {'hero': 26, 'title': 22, 'sub': 13, 'body': 11.5,
            'table': 9.5, 'caption': 8.5}


# ── 기호 (흑백 대응) ───────────────────────────────────────────────────
def signed(v: float, unit: str = '') -> tuple[str, str]:
    """(표시 문자열, 색 토큰). 색·기호·굵기 세 가지로 표시합니다."""
    if v < 0:
        return f'▼ {v:,.0f}{unit}'.replace('-', '−'), 'loss'
    return f'▲ +{v:,.0f}{unit}', 'gain'


# ── SVG 컴포넌트 (D19 §6.3) ────────────────────────────────────────────
def bar_compare(subject: float, lo: float, hi: float, *, label: str,
                unit: str = '만원/평', w: int = 420, h: int = 96) -> str:
    """③ 시세 비교 막대. **기준 라벨이 반드시 붙습니다.**

    v4 PDF의 `+367% 프리미엄` 사고는 연면적 단가를 토지 실거래와
    비교한 결과였습니다. 이 컴포넌트는 기준을 숨길 수 없게 만듭니다.
    """
    pad, bh = 14, 22
    lo_v, hi_v = min(lo, subject), max(hi, subject)
    span = (hi_v - lo_v) or 1
    x = lambda v: pad + (v - lo_v) / span * (w - pad * 2)          # noqa: E731
    y = 44
    sx = x(subject)
    return f'''<svg viewBox="0 0 {w} {h}" role="img" aria-label="{label}">
<text x="{pad}" y="14" font-size="11" fill="{C['mute']}">{label}</text>
<rect x="{x(lo):.1f}" y="{y}" width="{x(hi) - x(lo):.1f}" height="{bh}"
      rx="3" fill="{C['panel']}" stroke="{C['line']}"/>
<text x="{x(lo):.1f}" y="{y + bh + 14}" font-size="10.5" fill="{C['mute']}"
      text-anchor="start">{lo:,.0f}</text>
<text x="{x(hi):.1f}" y="{y + bh + 14}" font-size="10.5" fill="{C['mute']}"
      text-anchor="end">{hi:,.0f}</text>
<line x1="{sx:.1f}" y1="{y - 6}" x2="{sx:.1f}" y2="{y + bh + 4}"
      stroke="{C['ink']}" stroke-width="2.5"/>
<text x="{sx:.1f}" y="{y - 11}" font-size="12.5" font-weight="700"
      fill="{C['ink']}" text-anchor="middle">본 자산 {subject:,.0f}</text>
<text x="{w - pad}" y="14" font-size="10.5" fill="{C['mute']}"
      text-anchor="end">{unit}</text>
</svg>'''


def gauge_far(cur: float, limit: float, *, w: int = 420, h: int = 78) -> str:
    """④ 용적률 게이지. 잔여 %p를 숫자로 보여줍니다 (소구 원칙 3)."""
    pad, bh = 14, 26
    inner = w - pad * 2
    fill = min(cur / limit, 1.0) * inner
    return f'''<svg viewBox="0 0 {w} {h}" role="img"
     aria-label="용적률 {cur}% 상한 {limit}%">
<text x="{pad}" y="14" font-size="11" fill="{C['mute']}">용적률 (건축물대장 · 토지이용계획)</text>
<rect x="{pad}" y="26" width="{inner}" height="{bh}" rx="3"
      fill="{C['panel']}" stroke="{C['line']}"/>
<rect x="{pad}" y="26" width="{fill:.1f}" height="{bh}" rx="3" fill="{C['navy']}"/>
<text x="{pad + 8}" y="{26 + bh - 8}" font-size="12.5" font-weight="700"
      fill="#FFFFFF">현행 {cur:.2f}%</text>
<text x="{w - pad - 8}" y="{26 + bh - 8}" font-size="12" fill="{C['ink2']}"
      text-anchor="end">상한 {limit:.0f}%</text>
<text x="{pad}" y="{h - 6}" font-size="12" font-weight="700" fill="{C['gain']}">
잔여 {limit - cur:.1f}%p</text>
</svg>'''


def chips(items: list[str]) -> str:
    """① 근거 칩 — 실제 결합된 출처만."""
    return ''.join(f'<span class="chip">{i}</span>' for i in items)
