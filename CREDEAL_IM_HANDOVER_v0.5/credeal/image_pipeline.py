#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
image_pipeline.py — 이미지 처리 파이프라인 참조구현 (D22-2)

불변조건 14는 문서 전체에 적용됩니다. **이미지도 문서입니다.**
지금까지 텍스트로는 임차인명을 가려 놓고 같은 장의 사진에는 상호 간판이
그대로 찍혀 있었습니다.

규격은 `ssot/im.image.yaml`(취득·품질·배치)과 `ssot/im.masking.yaml`
(무엇을 가리는가)가 소유합니다. 이 파일은 그 규격을 실행합니다.

이 구현이 **하지 않는 것** — 자동 검출입니다. 번호판·얼굴 검출 모델은
운영 시스템 몫이고, 여기서는 검출 결과(영역 목록)를 받아 처리합니다.
검출을 흉내 내면 정확도를 오해하게 만듭니다.

사용:
    python3 image_pipeline.py --audit          # 현 에셋 품질 진단
    python3 image_pipeline.py --process <파일> --regions '[[x,y,w,h],...]'
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'ssot'))

import loader as SSOT                                        # noqa: E402

PIPELINE_VERSION = 'v1'


# ── 진단 ───────────────────────────────────────────────────────────────
@dataclass
class Diagnosis:
    path: str
    slot: str
    width: int
    height: int
    long_px: int
    short_px: int
    min_long: int
    min_short: int
    below_minimum: bool
    effective_dpi: float
    aspect: float
    exif_tags: int
    has_gps: bool
    size_kb: int
    min_dpi: int = 0
    issues: list[str] = field(default_factory=list)


def diagnose(path: Path, slot: str) -> Diagnosis:
    spec = SSOT.image_slot(slot)
    im = Image.open(path)
    w, h = im.size
    long_px, short_px = max(w, h), min(w, h)
    need_long, need_short = SSOT.image_min_px(slot)

    # 배치 상자를 cover-fit 으로 채웠을 때의 실효 dpi.
    # 상자보다 사진이 가로로 길면 좌우가 잘리므로 세로가 제약이 됩니다.
    bw, bh = spec['box_in']['w'], spec['box_in']['h']
    box_ar, img_ar = bw / bh, w / h
    dpi = (h / bh) if img_ar > box_ar else (w / bw)

    ex = im.getexif()
    gps = bool(ex.get_ifd(0x8825)) if ex else False

    d = Diagnosis(
        path=str(path), slot=slot, width=w, height=h,
        long_px=long_px, short_px=short_px,
        min_long=need_long, min_short=need_short,
        below_minimum=(long_px < need_long or short_px < need_short),
        effective_dpi=round(dpi, 1),
        aspect=round(w / h, 3),
        exif_tags=len(ex) if ex else 0,
        has_gps=gps,
        size_kb=path.stat().st_size // 1024,
    )
    kind = 'capture' if spec.get('kind') == '캡처' else 'photo'
    floor = SSOT.load('im.image')['min_dpi'][kind]
    d.min_dpi = floor
    if dpi < floor:
        d.issues.append(f'IMGQ01 해상도 미달 — 실효 {dpi:.0f}dpi '
                        f'(하한 {floor}dpi) · {w}×{h} · 권장 {need_long}×{need_short}')
    elif d.below_minimum:
        d.issues.append(f'IMGQ01 권장 화소 미달 — {w}×{h} '
                        f'(권장 {need_long}×{need_short}) · 실효 {dpi:.0f}dpi로 통과')
    if not (0.5 < d.aspect < 2.5):
        d.issues.append(f'IMGQ02 종횡비 {d.aspect} — 크롭 손실이 큽니다')
    if d.size_kb > 15 * 1024:
        d.issues.append(f'IMGQ03 파일 {d.size_kb / 1024:.1f}MB — 15MB 초과')
    if path.suffix.lower().lstrip('.') not in ('jpg', 'jpeg', 'png', 'heic', 'webp'):
        d.issues.append(f'IMGQ04 허용되지 않는 포맷 {path.suffix}')
    if d.has_gps:
        d.issues.append('EXIF GPS 잔존 — 3단계 미수행')
    return d


# ── 처리 ───────────────────────────────────────────────────────────────
@dataclass
class MaskRegion:
    """가릴 영역. 좌표는 원본 픽셀 기준입니다."""
    x: int
    y: int
    w: int
    h: int
    kind: str            # signage | license_plate | face | neighbor_signage
    detected_by: str     # model | human


@dataclass
class ProcessResult:
    sha256: str
    slot: str
    out_path: str
    regions: int
    exif_removed: bool
    pipeline_version: str
    processed_at: str


def _strip_exif(im: Image.Image) -> Image.Image:
    """2·3단계 — 회전을 픽셀에 적용한 **다음** 태그를 지웁니다.

    순서를 바꾸면 사진이 눕습니다. `exif_transpose` 가 먼저입니다.
    """
    im = ImageOps.exif_transpose(im)
    clean = Image.new(im.mode, im.size)
    clean.putdata(list(im.getdata()))          # 메타데이터를 물려받지 않습니다
    return clean


def _blur(im: Image.Image, regions: list[MaskRegion]) -> Image.Image:
    """7단계 — 되돌릴 수 없게 픽셀에 굽습니다.

    오버레이 도형이나 CSS 필터를 쓰지 않습니다. 원본이 파일에 남습니다.
    반경은 영역 단변의 8% 이상 — 작으면 글자가 읽힙니다.
    """
    for r in regions:
        box = (r.x, r.y, r.x + r.w, r.y + r.h)
        patch = im.crop(box)
        radius = max(4, int(min(r.w, r.h) * 0.08))
        im.paste(patch.filter(ImageFilter.GaussianBlur(radius)), box)
    return im


def _cover_fit(im: Image.Image, box_w: float, box_h: float) -> Image.Image:
    """8단계 — 상자를 꽉 채우도록 자릅니다 (object-fit: cover).

    세로로 자를 때 상단 30% 지점을 기준으로 삼습니다. 정중앙을 쓰면
    건물 몸통이 아니라 하늘과 바닥이 반씩 남습니다.
    """
    box_ar, img_ar = box_w / box_h, im.width / im.height
    if img_ar > box_ar:
        nw = int(im.height * box_ar)
        im = im.crop(((im.width - nw) // 2, 0, (im.width + nw) // 2, im.height))
    else:
        nh = int(im.width / box_ar)
        top = int((im.height - nh) * 0.30)
        im = im.crop((0, top, im.width, top + nh))
    return im


def process(src: Path, slot: str, regions: list[MaskRegion],
            out_dir: Path, approved_by: str) -> ProcessResult:
    spec = SSOT.image_slot(slot)
    raw = src.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()

    im = Image.open(src)
    im = _strip_exif(im)                                       # 2·3단계
    im = _blur(im, regions)                                    # 7단계
    im = _cover_fit(im, spec['box_in']['w'], spec['box_in']['h'])   # 8단계

    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f'{slot}_{sha[:12]}.jpg'
    im.convert('RGB').save(out, 'JPEG', quality=88, exif=b'')

    return ProcessResult(
        sha256=sha, slot=slot, out_path=str(out), regions=len(regions),
        exif_removed=True, pipeline_version=PIPELINE_VERSION,
        processed_at=datetime.now(timezone.utc).isoformat(timespec='seconds'),
    )


# ── 발행 게이트 G20 ────────────────────────────────────────────────────
def gate_g20(used: list[dict], approvals: dict[str, dict]) -> list[str]:
    """발행 IM 에 쓰인 모든 이미지에 6단계 승인 이력이 있어야 합니다.

    반환값이 비어 있지 않으면 **발행을 막습니다.**
    """
    fails = []
    for u in used:
        a = approvals.get(u['sha256'])
        if a is None:
            fails.append(f'G20 차단 slot={u["slot"]} resolve=마스킹 승인 필요')
        elif a.get('pipelineVersion') != PIPELINE_VERSION:
            fails.append(f'G20 차단 slot={u["slot"]} resolve=파이프라인 재처리 필요')
    return fails


# ── CLI ────────────────────────────────────────────────────────────────
def audit() -> int:
    """현 에셋을 슬롯 규격에 대조합니다."""
    total = ok = 0
    rows: list[Diagnosis] = []
    for fid in ('dangsan', 'yangpyeong'):
        for p in sorted((HERE / 'assets' / fid).glob('*.jpg')):
            slot = p.stem
            try:
                SSOT.image_slot(slot)
            except KeyError:
                continue                    # 규격에 없는 슬롯은 건너뜁니다
            d = diagnose(p, slot)
            rows.append(d)
            total += 1
            ok += not any(i.startswith('IMGQ01 해상도') or i.startswith('IMGQ04')
                          or 'GPS' in i for i in d.issues)

    print(f'{"슬롯":<12}{"물건":<12}{"화소":>12}{"실효dpi":>9}  판정')
    print('─' * 76)
    for d in rows:
        fid = Path(d.path).parent.name
        hard = any(i.startswith('IMGQ01 해상도') or i.startswith('IMGQ04')
                   or 'GPS' in i for i in d.issues)
        mark = '🔴' if hard else ('⚠' if d.issues else '통과')
        print(f'{d.slot:<12}{fid:<12}{d.width:>5}×{d.height:<6}'
              f'{d.effective_dpi:>9.0f}  {mark}')
        for i in d.issues:
            print(f'{"":>24}└ {i}')
    print('─' * 76)
    print(f'{total}매 · 통과 {ok} · 미달 {total - ok}')

    need = SSOT.load('im.image')['minimum_set']
    for fid in ('dangsan', 'yangpyeong'):
        n = len(list((HERE / 'assets' / fid).glob('*.jpg')))
        print(f'  {fid:<12} {n}매 · 최소 {need["count"]}매 '
              f'{"충족" if n >= need["count"] else "미달"}')

    print()
    print('🔴 마스킹은 이 진단에 포함되지 않습니다 — 검출 모델이 필요합니다.')
    print('   im.masking.yaml §images 의 차단 대상 4종은 여전히 미구현입니다.')
    return 0 if ok == total else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--audit', action='store_true')
    ap.add_argument('--process')
    ap.add_argument('--slot')
    ap.add_argument('--regions', default='[]')
    ap.add_argument('--approved-by', default='')
    a = ap.parse_args()

    if a.audit:
        return audit()
    if a.process:
        regs = [MaskRegion(*r[:4], kind=r[4] if len(r) > 4 else 'signage',
                           detected_by='human') for r in json.loads(a.regions)]
        r = process(Path(a.process), a.slot, regs,
                    HERE / 'assets' / '_masked', a.approved_by)
        print(json.dumps(asdict(r), ensure_ascii=False, indent=2))
        return 0
    ap.print_help()
    return 2


if __name__ == '__main__':
    sys.exit(main())
