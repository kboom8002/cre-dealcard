#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
render_snapshot.py — 렌더 스냅샷 회귀 (D22-5 §4)

텍스트 검사로는 **보이는 문제**를 잡지 못합니다. 이번 세션에서 실제로
겪은 것들입니다.

    · 표 라벨 칸이 붉게 칠해져 흰 글씨가 보이지 않음
    · 줄바꿈된 본문의 space_after 가 누적되어 상자를 넘침
    · 제목만 남고 표가 다음 장으로 넘어감
    · 표지 전면 사진이 건물 하단을 잘라먹음

전부 텍스트 추출로는 통과합니다. 그려 봐야 압니다.

    PPTX → (soffice) → PDF → (pdftoppm) → PNG → 기준본과 픽셀 비교

사용:
    python3 render_snapshot.py --update   # 기준본 생성·갱신 (사람이 눈으로 본 뒤)
    python3 render_snapshot.py            # 회귀 검사
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops

HERE = Path(__file__).resolve().parent
BASE = HERE / 'snapshots'
DPI = 72                     # 회귀 판정에는 이 정도로 충분하고 훨씬 빠릅니다

TARGETS = [
    '../credeal/당산동_PPTX_IM_KR_R2.pptx',
    '../credeal/양평동_PPTX_IM_KR_R1.pptx',
    '../credeal/데모_당산동_evidence_first.pptx',
    '../credeal/데모_당산동_land_value_first.pptx',
    '../credeal/양평동_IM_D22_A등급.pptx',
    '../credeal/multiparcel_IM_D22_A등급.pptx',
]

# 픽셀 차이 임계. 폰트 힌팅 차이로 미세한 값은 늘 생깁니다.
THRESHOLD_PCT = 0.30


@dataclass
class Diff:
    page: int
    changed_pct: float
    ok: bool


def render(pptx: Path, out_dir: Path) -> list[Path]:
    """PPTX → PNG 목록. soffice 는 한 번에 한 프로세스만 돕니다."""
    out_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ['soffice', '--headless', '--convert-to', 'pdf',
         '--outdir', str(out_dir), str(pptx)],
        check=True, capture_output=True, timeout=300)
    pdf = out_dir / (pptx.stem + '.pdf')
    subprocess.run(
        ['pdftoppm', '-png', '-r', str(DPI), str(pdf), str(out_dir / 'p')],
        check=True, capture_output=True, timeout=300)
    return sorted(out_dir.glob('p-*.png'))


def compare(a: Path, b: Path) -> float:
    """다른 픽셀의 비율(%)."""
    ia, ib = Image.open(a).convert('L'), Image.open(b).convert('L')
    if ia.size != ib.size:
        return 100.0
    d = ImageChops.difference(ia, ib)
    # 힌팅 차이를 걸러냅니다. 8 이하는 같은 것으로 봅니다.
    hist = d.histogram()
    changed = sum(hist[9:])
    return changed / (ia.width * ia.height) * 100


def run(update: bool) -> int:
    bad = 0
    for rel in TARGETS:
        src = (HERE / rel).resolve()
        if not src.exists():
            print(f'  건너뜀  {src.name}')
            continue
        ref_dir = BASE / src.stem
        with tempfile.TemporaryDirectory() as td:
            pages = render(src, Path(td))

            if update:
                ref_dir.mkdir(parents=True, exist_ok=True)
                keep = {q.name for q in pages}
                for old in ref_dir.glob('p-*.png'):
                    if old.name in keep:
                        continue
                    # 🔴 면이 줄면 기준본을 **반드시 지웁니다.** 내용만 비우면
                    #    파일이 남아 면수 비교가 틀립니다 (실제로 겪음).
                    try:
                        old.unlink()
                    except OSError as e:
                        raise RuntimeError(
                            f'기준본 {old.name} 를 지울 수 없습니다: {e}. '
                            f'남겨 두면 면수 판정이 틀립니다.') from e
                for p in pages:
                    (ref_dir / p.name).write_bytes(p.read_bytes())
                print(f'  기준 갱신  {src.name:<34} {len(pages)}면')
                continue

            refs = sorted(ref_dir.glob('p-*.png'))
            if not refs:
                print(f'  🔴 기준 없음  {src.name} — --update 로 먼저 만드십시오')
                bad += 1
                continue
            if len(refs) != len(pages):
                print(f'  🔴 면수 변경  {src.name}  {len(refs)} → {len(pages)}')
                bad += 1
                continue

            diffs = [Diff(i + 1, compare(r, p), True)
                     for i, (r, p) in enumerate(zip(refs, pages))]
            for d in diffs:
                d.ok = d.changed_pct <= THRESHOLD_PCT
            worst = max(diffs, key=lambda d: d.changed_pct)
            fails = [d for d in diffs if not d.ok]
            bad += bool(fails)
            mark = '통과' if not fails else '🔴'
            print(f'  {mark}  {src.name:<34} {len(pages)}면 · '
                  f'최대 차이 {worst.changed_pct:.2f}% (면 {worst.page})')
            for d in fails:
                print(f'        면 {d.page}  {d.changed_pct:.2f}% '
                      f'> 임계 {THRESHOLD_PCT}%')
    return 1 if bad else 0


def selftest() -> int:
    """검사기가 실제로 잡는지 봅니다.

    기준본 한 면에 작은 사각형을 그려 넣고 임계를 넘는지 확인합니다.
    이것이 없으면 "아무것도 안 잡는 검사기"가 늘 통과합니다.
    """
    from PIL import ImageDraw
    ref = next(BASE.glob('*/p-01.png'), None)
    if ref is None:
        print('  기준본이 없습니다 — --update 를 먼저 돌리십시오')
        return 1
    im = Image.open(ref).convert('L')
    w, h = im.size
    ImageDraw.Draw(im).rectangle(
        [w // 4, h // 4, w // 4 + int(w * 0.06), h // 4 + int(h * 0.10)], fill=0)
    tmp = Path('/tmp/_snap_perturb.png')
    im.save(tmp)
    pct = compare(ref, tmp)
    ok = pct > THRESHOLD_PCT
    print(f'  {"통과" if ok else "🔴 놓침"}  '
          f'6%×10% 사각형 주입 → 차이 {pct:.2f}% (임계 {THRESHOLD_PCT}%)')
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--update', action='store_true',
                    help='기준본 갱신 — 사람이 눈으로 확인한 뒤에만')
    ap.add_argument('--selftest', action='store_true',
                    help='검사기 민감도 확인')
    a = ap.parse_args()
    if a.selftest:
        print('렌더 스냅샷 민감도 검사')
        print('─' * 74)
        return selftest()
    print('렌더 스냅샷 ' + ('기준 갱신' if a.update else '회귀 검사'))
    print('─' * 74)
    r = run(a.update)
    print('─' * 74)
    if a.update:
        print('기준본을 커밋하기 전에 반드시 눈으로 보십시오.')
        print('깨진 렌더를 기준으로 삼으면 그 뒤로 영영 통과합니다.')
    else:
        print('정상' if r == 0 else '회귀 발생 — 렌더를 눈으로 확인하십시오')
    return r


if __name__ == '__main__':
    sys.exit(main())
