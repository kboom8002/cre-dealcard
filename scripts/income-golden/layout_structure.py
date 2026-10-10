#!/usr/bin/env python3
"""
scripts/income-golden/layout_structure.py — 오프라인(이미지 불필요) 구조 기반 지면 지표 (계획 D / P3)

PPTX 의 도형 좌표·폰트에서 직접 계산한다 (LibreOffice 렌더 불필요 → L2 오프라인 루프에서 수 초).

사용:
    python scripts/income-golden/layout_structure.py <deck.pptx> [--json out.json]

지표 (슬라이드별, 표지·마지막 면은 판정 제외):
  - bottom_blank_pct : 콘텐츠 영역(제목밴드·푸터 제외)에서 마지막 콘텐츠 도형 아래의 빈 높이 비율 (%)
  - occupancy_pct    : 콘텐츠 영역 격자(48x24) 중 도형이 덮는 칸 비율 (%)
  - overflow         : 푸터 영역(SAFE_BOTTOM 초과)까지 침범한 비-푸터 도형 수
  - min_font_pt      : 최소 지정 폰트(pt)
  - small_font       : 8pt 미만 런 수
  - dash_columns / ellipsis : layout_metrics.py 와 동일
출력의 `warnings` 가 비어 있지 않으면 해당 슬라이드는 지면 경고.
"""
import sys, re, json, argparse

try:
    from pptx import Presentation
    from pptx.util import Emu
except ImportError:
    print('python-pptx 필요: pip install python-pptx', file=sys.stderr); sys.exit(2)

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try: sys.stdout.reconfigure(encoding='utf-8')
    except Exception: pass

TOP, BOTTOM, LEFT, RIGHT = 0.17, 0.91, 0.04, 0.96   # layout_metrics.py 와 동일
WARN = {'bottom_blank_pct': 30.0, 'occupancy_pct': 38.0, 'min_font_pt': 8.0, 'abs_min_font_pt': 6.5}
DASH = {'-', '', '—', '–', '〃'}
SUMMARY_RE = re.compile(r'^(합계|소계|총계|계)$')
GX, GY = 48, 24


def iter_shapes(shapes):
    for s in shapes:
        if s.shape_type == 6 and hasattr(s, 'shapes'):
            yield from iter_shapes(s.shapes)
        else:
            yield s


def slide_metrics(slide, W, H):
    cx0, cx1, cy0, cy1 = W * LEFT, W * RIGHT, H * TOP, H * BOTTOM
    ch = cy1 - cy0
    cover = [[False] * GX for _ in range(GY)]
    max_bottom = cy0
    overflow = 0
    fonts, small = [], 0
    dash_cols, ellipsis = [], 0
    for s in iter_shapes(slide.shapes):
        try:
            l, t, w, h = s.left, s.top, s.width, s.height
        except Exception:
            continue
        if l is None or t is None or w is None or h is None: continue
        r, b = l + w, t + h
        has_text = getattr(s, 'has_text_frame', False) and s.has_text_frame and s.text_frame.text.strip()
        has_table = getattr(s, 'has_table', False) and s.has_table
        is_pic = s.shape_type == 13
        content_like = has_text or has_table or is_pic or (w < W * 0.9 and h < ch * 0.9 and h > 0)
        # 푸터 침범: 콘텐츠 영역 안에서 시작해 푸터 밴드 아래로 넘어가는 도형 (시작이 이미 푸터인 도형은 제외)
        if t < cy1 - Emu(9144 * 5) and b > H * 0.93 and h < H * 0.6: overflow += 1
        if has_text:
            for p in s.text_frame.paragraphs:
                for run in p.runs:
                    if run.font.size:
                        pt = run.font.size.pt
                        fonts.append(pt)
                        txt = run.text.strip()
                        stacking_label = bool(re.search(r'\d㎡$', txt))  # 스태킹 셀 라벨(Rule 65: 셀 폭 한계) 면제
                        if txt and not stacking_label and (pt < WARN['abs_min_font_pt'] or (pt < WARN['min_font_pt'] and len(txt) > 12)): small += 1
            ellipsis += len(re.findall(r'…|\.\.\.', s.text_frame.text))
        if has_table:
            rows = [[c.text.strip() for c in rw.cells] for rw in s.table.rows]
            for rw in rows: ellipsis += sum(len(re.findall(r'…|\.\.\.', v)) for v in rw)
            if len(rows) >= 3:
                header, body = rows[0], [rw for rw in rows[1:] if not SUMMARY_RE.match(rw[0] if rw else '')]
                for ci, name in enumerate(header):
                    vals = [rw[ci] for rw in body if ci < len(rw)]
                    if vals and all(v in DASH for v in vals): dash_cols.append(name or f'col{ci}')
        if not content_like: continue
        # 콘텐츠 영역과 교차하는 부분만 반영
        ix0, ix1 = max(l, cx0), min(r, cx1)
        iy0, iy1 = max(t, cy0), min(b, cy1)
        if ix1 <= ix0 or iy1 <= iy0: continue
        max_bottom = max(max_bottom, iy1)
        gx0, gx1 = int((ix0 - cx0) / (cx1 - cx0) * GX), int((ix1 - cx0) / (cx1 - cx0) * GX + 0.999)
        gy0, gy1 = int((iy0 - cy0) / ch * GY), int((iy1 - cy0) / ch * GY + 0.999)
        for gy in range(max(0, gy0), min(GY, gy1)):
            for gx in range(max(0, gx0), min(GX, gx1)):
                cover[gy][gx] = True
    occ = 100.0 * sum(sum(1 for c in row if c) for row in cover) / (GX * GY)
    return {
        'bottom_blank_pct': round(100.0 * (cy1 - max_bottom) / ch, 1),
        'occupancy_pct': round(occ, 1),
        'overflow': overflow,
        'min_font_pt': round(min(fonts), 1) if fonts else None,
        'small_font': small,
        'dash_columns': dash_cols,
        'ellipsis': ellipsis,
    }


def analyze(path):
    prs = Presentation(path)
    W, H = prs.slide_width, prs.slide_height
    n = len(prs.slides)
    out = []
    for i, slide in enumerate(prs.slides):
        idx = i + 1
        m = {'slide': idx, **slide_metrics(slide, W, H)}
        judged = 1 < idx < n
        warn = []
        if judged and m['bottom_blank_pct'] > WARN['bottom_blank_pct']: warn.append(f"하단 여백 {m['bottom_blank_pct']}%")
        if judged and m['occupancy_pct'] < WARN['occupancy_pct']: warn.append(f"점유율 {m['occupancy_pct']}%")
        if m['overflow']: warn.append(f"푸터 침범 {m['overflow']}건")
        if m['small_font']: warn.append(f"8pt 미만 {m['small_font']}런")
        if m['dash_columns']: warn.append("전부 '-' 열: " + ', '.join(m['dash_columns']))
        if m['ellipsis']: warn.append(f"말줄임 {m['ellipsis']}건")
        m['warnings'] = warn
        out.append(m)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pptx'); ap.add_argument('--json')
    a = ap.parse_args()
    res = analyze(a.pptx)
    total = 0
    for m in res:
        total += len(m['warnings'])
        flag = '⚠' if m['warnings'] else '✓'
        print(f"{flag} slide{m['slide']:02d} blank={m['bottom_blank_pct']}% occ={m['occupancy_pct']}% minpt={m['min_font_pt']} {' | '.join(m['warnings'])}")
    print(f'TOTAL_WARNINGS={total}')
    if a.json:
        with open(a.json, 'w', encoding='utf-8') as f:
            json.dump({'pptx': a.pptx, 'slides': res, 'warnings': total}, f, ensure_ascii=False, indent=2)


if __name__ == '__main__':
    main()
