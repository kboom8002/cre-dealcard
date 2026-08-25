#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_mobile.py — 모바일 IM 생성 (D19)

**정본은 `IM_STANDARD_수익형.md` §5 입니다.**
  §5.2 첫 화면 — 한 줄 정의 · 숫자 3개 · 임차 한 줄 · CTA 3개
       스크롤 없이 완결 · 이미지 없이도 성립 · 16px 이상 · CTA 44px 이상
  §5.3 접힘 섹션 · §5.5 문장 길이 · §6.1 치환 사전 · §6.3 금지어
보조 준수: D8 `MOBILE_GAP_SPEC.md` (17px · aria · tel: 1순위)

**마크다운을 경유하지 않습니다.** Hero·수치는 IMCore 직결,
텍스트 블록만 인라인 강조(`**`)를 처리합니다.
"""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

import core as im_core
import copy_im as im_copy
import design as D
import public_data as PD

OUT = Path(__file__).resolve().parent

BROKER = {'name': '담당 중개인', 'phone': '02-000-0000',
          'org': '제이에스부동산중개(주)'}


def esc(t: str) -> str:
    return html.escape(t, quote=False)


def inline(t: str) -> str:
    """**강조**만 처리합니다. 그 외 마크다운은 카피에 쓰지 않습니다."""
    return re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', esc(t))


def render_block(b: dict) -> str:
    k = b['t']
    if k == 'p':
        return f'<p>{inline(b["text"])}</p>'
    if k == 'h':
        return f'<h3>{inline(b["text"])}</h3>'
    if k == 'note':
        return f'<p class="note">{inline(b["text"])}</p>'
    if k == 'warn':
        return f'<p class="warn" role="note">{inline(b["text"])}</p>'
    if k == 'list':
        li = ''.join(f'<li>{inline(x)}</li>' for x in b['items'])
        return f'<ul>{li}</ul>'
    if k == 'table':
        al = {'l': 'left', 'r': 'right', 'c': 'center'}
        th = ''.join(f'<th style="text-align:{al[a]}">{inline(h)}</th>'
                     for h, a in zip(b['head'], b['align']))
        tr = ''
        for row in b['rows']:
            td = ''.join(f'<td style="text-align:{al[a]}">{inline(str(v))}</td>'
                         for v, a in zip(row, b['align']))
            tr += f'<tr>{td}</tr>'
        return (f'<div class="tw"><table><thead><tr>{th}</tr></thead>'
                f'<tbody>{tr}</tbody></table></div>')
    raise ValueError(k)


CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",
"Noto Sans KR","Malgun Gothic",sans-serif;background:#F4F6F8;color:#0E1420;
line-height:1.68;-webkit-text-size-adjust:100%}
.wrap{max-width:480px;margin:0 auto;background:#fff;min-height:100vh;
padding-bottom:76px}
header{padding:22px 20px 18px;background:#0E1420;color:#fff}
.kicker{font-size:13px;letter-spacing:.06em;color:#5A6472;margin-bottom:7px}
h1{font-size:23px;line-height:1.34;font-weight:700;letter-spacing:-.01em}
.sub{font-size:15px;color:#c3ccd9;margin-top:9px}
.lease1{padding:13px 20px;font-size:15px;color:#38404E;background:#f7f8fa;border-bottom:1px solid #DCE1E7}
.chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:11px}
.chip{font-size:11.5px;padding:3px 8px;border-radius:3px;background:#1E2C42;color:#C8D2E0;letter-spacing:.01em}
.seal{display:inline-block;font-size:11.5px;padding:2px 7px;border-radius:3px;background:#F5EFE4;color:#7A5C2E;font-weight:600;margin-left:5px}
.fig{margin:14px 0;background:#F9FAFB;border:1px solid #DCE1E7;border-radius:7px;padding:8px}
.fig svg{display:block;width:100%;height:auto}
.band{display:inline-block;font-size:12px;padding:3px 9px;border-radius:4px;
background:#14243D;color:#c3ccd9;margin-top:11px;letter-spacing:.02em}
.hero{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#DCE1E7}
.cell{background:#fff;padding:15px 12px 13px}
.cell .l{font-size:13px;color:#5A6472;margin-bottom:5px}
td,.cell .v,th{font-variant-numeric:tabular-nums}
.cell .v{font-size:20px;font-weight:700;letter-spacing:-.02em;color:#0E1420}
.cell .b{font-size:12px;color:#5A6472;margin-top:5px;line-height:1.5}
.gate{background:#FBEDEA;border-top:1px solid #f3cfc6;padding:14px 20px;
font-size:15px;color:#9E2B1C}
.gate strong{color:#6d1f10}
section{border-top:9px solid #F4F6F8}
.sh{width:100%;display:flex;align-items:center;justify-content:space-between;
gap:10px;padding:17px 20px;background:#fff;border:0;cursor:pointer;
text-align:left;font:inherit}
.sq{font-size:17px;font-weight:700;color:#0E1420;letter-spacing:-.01em}
.st{font-size:12.5px;color:#5A6472;margin-top:3px}
.bg{flex:0 0 auto;font-size:12px;padding:4px 9px;border-radius:4px;
white-space:nowrap;font-weight:600}
.bg.ok{background:#E9F1EC;color:#0F5132}
.bg.chk{background:#fdf3e3;color:#8a5a12}
.chev{flex:0 0 auto;color:#a8b2c1;font-size:13px;transition:transform .18s}
.sh[aria-expanded="true"] .chev{transform:rotate(180deg)}
.body{padding:2px 20px 22px;font-size:17px}
.body p{margin:11px 0}
.body h3{font-size:16px;font-weight:700;margin:20px 0 8px;color:#0E1420;
padding-top:14px;border-top:1px solid #edeff2}
.body h3:first-child{border-top:0;padding-top:0;margin-top:8px}
.body ul{margin:11px 0 11px 19px}
.body li{margin:6px 0}
.note{font-size:14.5px;color:#5A6472;background:#f7f8fa;padding:11px 13px;
border-radius:6px;border-left:3px solid #d3d8df}
.warn{font-size:15.5px;color:#9E2B1C;background:#FBEDEA;padding:12px 13px;
border-radius:6px;border-left:3px solid #d9634a}
.tw{overflow-x:auto;margin:12px 0;-webkit-overflow-scrolling:touch}
table{border-collapse:collapse;width:100%;font-size:14.5px;min-width:100%}
th{background:#F4F6F8;font-weight:600;color:#38404E;padding:9px 10px;
border-bottom:1px solid #dfe3e8;white-space:nowrap}
td{padding:9px 10px;border-bottom:1px solid #edeff2;vertical-align:top}
tbody tr:last-child td{border-bottom:0}
footer{padding:22px 20px 26px;background:#f7f8fa;border-top:1px solid #DCE1E7;
font-size:13.5px;color:#5A6472}
footer p{margin:9px 0}
.bar{position:fixed;left:0;right:0;bottom:0;max-width:480px;margin:0 auto;
display:flex;gap:9px;padding:11px 14px;background:#fff;
border-top:1px solid #DCE1E7}
.bar a{flex:1;text-align:center;padding:14px 8px;border-radius:8px;
font-size:16px;font-weight:600;text-decoration:none;min-height:44px;
display:flex;align-items:center;justify-content:center}
.call{background:#0E1420;color:#fff}
.ask{background:#eef0f3;color:#2b3240}
.visit{background:#eef0f3;color:#2b3240}
@media(prefers-color-scheme:dark){
body{background:#0d1014;color:#e8eaee}.wrap{background:#14181e}
.cell{background:#14181e}.hero{background:#242a33}
.cell .v{color:#f2f4f7}.sh{background:#14181e}.sq{color:#f2f4f7}
section{border-top-color:#0d1014}.body h3{color:#f2f4f7;border-top-color:#242a33}
th{background:#1a1f27;color:#a8b2c1;border-bottom-color:#2a313b}
td{border-bottom-color:#1f242c}.note{background:#1a1f27;color:#a8b2c1;
border-left-color:#333b47}footer{background:#11151a;border-top-color:#242a33}
.bar{background:#14181e;border-top-color:#242a33}
.call{background:#e8eaee;color:#0d1014}
.ask,.visit{background:#242a33;color:#d6dae0}
}
"""

JS = """
document.querySelectorAll('.sh').forEach(function(btn){
  btn.addEventListener('click', function(){
    var open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!open));
    document.getElementById(btn.getAttribute('aria-controls'))
            .hidden = open;
  });
});
"""


def figures(core, key: str) -> str:
    """D19 §6.3 컴포넌트 3·4. 공공데이터가 있을 때만 그립니다."""
    if not core.has_public:
        return ''
    out = ''
    if key == 'price_basis':
        lo, hi = PD.comps_range(core.fixture_id, 'land')
        out += ('<div class="fig">' +
                D.bar_compare(core.land_pyeong_price.value / im_core.MAN, lo, hi,
                              label='토지 평당가 기준 — 인근 실거래 범위') +
                '</div>')
        glo, ghi = PD.comps_range(core.fixture_id, 'gfa')
        out += ('<div class="fig">' +
                D.bar_compare(core.gfa_pyeong_price.value / im_core.MAN, glo, ghi,
                              label='연면적 평당가 기준 — 인근 실거래 범위') +
                '</div>')
    if key == 'investment_thesis':
        out += ('<div class="fig">' +
                D.gauge_far(core.f('farPct').value, core.f('farLimit').value) +
                '</div>')
    return out


def build(core: im_core.IMCore) -> str:
    secs = im_copy.build(core)
    gu = core.address_band.split()[-1]
    title = f'{gu} {core.building_use} 매각'

    hero = ''.join(
        f'<div class="cell"><div class="l">{esc(h["label"])}</div>'
        f'<div class="v">{esc(h["value"])}</div>'
        f'<div class="b">{esc(h["basis"])}</div></div>'
        for h in core.hero())

    res, short = core.resolution_computed
    edition_label = ('공공데이터 결합 (R2판) · 임대 해상도 ' + res
                     if core.has_public else '원장 기반 (R1판) · 임대 해상도 ' + res)
    st = core.state_counts
    biz = [r['tenantBusiness'] for r in core.rows if r['tenantBusiness']]
    seen, kinds = set(), []
    for x in biz:
        if x not in seen:
            seen.add(x); kinds.append(x)
    lease_one = (f'{" · ".join(kinds[:3])} 등 {st.get("임대중", 0)}개 임차 · '
                 f'공실 {st.get("공실", 0)}'
                 + (f' · 자가사용 {st["자가사용"]}' if st.get('자가사용') else ''))

    gate = ''
    if core.gates_blocking:
        gate = (f'<div class="gate"><strong>발행 게이트 '
                f'{len(core.gates_blocking)}건 차단</strong> — '
                f'{esc(" · ".join(core.gates_blocking))}. '
                f'확인 필요 {len(core.deficiencies)}건이 해소되면 재발행됩니다. '
                f'본 자료는 내부 검토용입니다.</div>')

    body = ''
    for i, s in enumerate(secs, 1):
        sid = f'sec{i}'
        cls = 'ok' if s['badge'] == '자료 확보' else 'chk'
        n = len(s['deficiencies'])
        bl = s['badge'] + (f' {n}건' if n else '')
        if core.has_public and s['key'] in ('property_overview', 'location_access',
                                            'price_basis'):
            bl, cls = '공부 확인', 'ok'
        blocks = ''.join(render_block(b) for b in s['blocks'])
        blocks += figures(core, s['key'])
        body += (
            f'<section>'
            f'<button class="sh" aria-expanded="{"true" if i <= 2 else "false"}" '
            f'aria-controls="{sid}" id="h{sid}">'
            f'<span><span class="sq">{esc(s["question"])}</span>'
            f'<span class="st">{i}. {esc(s["title"])}</span></span>'
            f'<span class="bg {cls}">{esc(bl)}</span>'
            f'<span class="chev" aria-hidden="true">&#9660;</span>'
            f'</button>'
            f'<div class="body" id="{sid}" role="region" aria-labelledby="h{sid}"'
            f'{"" if i <= 2 else " hidden"}>{blocks}</div>'
            f'</section>')

    return f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{esc(title)} — CREDEAL Mobile IM</title>
<meta name="robots" content="noindex,nofollow">
<style>{CSS}</style></head>
<body><div class="wrap">
<header>
  <div class="kicker">CREDEAL 모바일 IM · 수익형</div>
  <h1>{esc(title)}</h1>
  <div class="sub">{esc(core.one_liner())}</div>
  <div class="chips">{D.chips(core.source_chips())}</div>
  <div class="band">{esc(edition_label)}</div>
</header>
<div class="hero">{hero}</div>
<div class="lease1">{esc(lease_one)}</div>
{gate}
{body}
<footer>
  <p>본 자료의 모든 수치는 <strong>제출된 임대 현황</strong>에서 산출했습니다.
     표지 요약과 다를 경우 각 행의 합을 씁니다.</p>
  <p>확인되지 않은 항목은 <strong>확인 필요</strong>로 표기했으며,
     추정값으로 채우지 않았습니다.</p>
  <p>물건명·법인명·임차인 상호는 표기하지 않습니다.
     문의 시에도 가려서 보내주십시오.</p>
  <p>본 자료는 투자 권유가 아니며, 실제 거래 전 등기부·건축물대장 원본 확인과
     법률·세무 검토가 필요합니다.</p>
  <p>{esc(BROKER['org'])} · {esc(BROKER['name'])}</p>
</footer>
</div>
<nav class="bar" aria-label="문의">
  <a class="call" href="tel:{BROKER['phone']}"
     aria-label="{esc(BROKER['name'])}에게 전화 걸기">전화 문의</a>
  <a class="ask" href="sms:{BROKER['phone']}"
     aria-label="확인 필요 항목 자료 요청 문자 보내기">자료 받기</a>
  <a class="visit" href="sms:{BROKER['phone']}?body=현장%20확인%20일정%20문의드립니다"
     aria-label="현장 확인 일정 문의">현장 확인</a>
</nav>
<script>{JS}</script>
</body></html>
"""


def main() -> int:
    for fid, name in (('dangsan', '당산동'), ('yangpyeong', '양평동')):
      for ed in ('R1', 'R2'):
        core = im_core.load(fid, edition=ed)
        p = OUT / f'{name}_모바일IM_{ed}.html'
        p.write_text(build(core), encoding='utf-8')
        print(f'{p.name:<30} {p.stat().st_size:>7,} B · 해상도 '
              f'{core.resolution_computed[0]} · 확인 필요 {len(core.deficiencies)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
