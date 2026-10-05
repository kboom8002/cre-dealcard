"""실매물 IM(pptx) → 이미지-캡션 자동 매칭 + 슬라이드 텍스트 추출 + 미리보기 컨택트시트.

사용: python scripts/income-golden/extract_im_assets.py <pptx> <out_dir>
산출(out_dir):
  _assets_index.json   슬라이드별 그림(rId, media, 위치/크기)과 최근접 캡션 후보
  source_extract.md    슬라이드별 텍스트 전량 (원본 그대로)
  _contact/slideNN.jpg 슬라이드별 그림 썸네일 + 자동 캡션 (검수용)
그림-캡션 확정은 build 스크립트의 매핑표에서 사람이 검수 후 고정한다 (자동 매칭은 후보일 뿐).
"""
import io, json, os, re, sys, zipfile
from xml.etree import ElementTree as ET

NS = {
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}
EMU_IN = 914400


def slide_no(n):
    m = re.search(r'slide(\d+)\.xml$', n)
    return int(m.group(1)) if m else 0


def xfrm_of(el):
    off = el.find('.//a:xfrm/a:off', NS)
    ext = el.find('.//a:xfrm/a:ext', NS)
    if off is None or ext is None:
        return None
    return [int(off.get('x')), int(off.get('y')), int(ext.get('cx')), int(ext.get('cy'))]


def walk_shapes(tree, acc, group_off=(0, 0)):
    for el in tree:
        tag = el.tag.split('}')[1]
        if tag == 'grpSp':
            walk_shapes(el, acc, group_off)
        elif tag == 'pic':
            blip = el.find('.//a:blip', NS)
            rid = blip.get('{%s}embed' % NS['r']) if blip is not None else None
            acc['pics'].append({'rid': rid, 'xfrm': xfrm_of(el)})
        elif tag in ('sp', 'graphicFrame'):
            texts = []
            for para in el.iter('{%s}p' % NS['a']):
                t = ''.join(x.text or '' for x in para.iter('{%s}t' % NS['a'])).strip()
                if t:
                    texts.append(t)
            # 그림 채우기(blipFill) 도형도 그림으로 취급
            blip = el.find('.//a:blipFill/a:blip', NS)
            if blip is not None:
                acc['pics'].append({'rid': blip.get('{%s}embed' % NS['r']), 'xfrm': xfrm_of(el)})
            if texts:
                acc['texts'].append({'text': ' '.join(texts), 'xfrm': xfrm_of(el), 'table': tag == 'graphicFrame'})


def nearest_caption(pic, texts):
    if not pic['xfrm']:
        return None
    x, y, cx, cy = pic['xfrm']
    pcx, pbottom = x + cx / 2, y + cy
    best, bd = None, None
    for t in texts:
        if not t['xfrm'] or t['table'] or len(t['text']) > 30:
            continue
        tx, ty, tcx, tcy = t['xfrm']
        tcenter_x = tx + tcx / 2
        # 그림 하단 근처(위/아래 0.8in) & 가로 중심 근접
        dy = min(abs(ty - pbottom), abs((ty + tcy) - y), abs(ty - y))
        dx = abs(tcenter_x - pcx)
        if dx > max(cx, tcx) * 0.75:
            continue
        d = dy + dx * 0.3
        if bd is None or d < bd:
            best, bd = t['text'], d
    return best if bd is not None and bd < EMU_IN * 1.2 else None


def main(pptx, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    z = zipfile.ZipFile(pptx)
    names = z.namelist()
    slides = sorted([n for n in names if re.match(r'ppt/slides/slide\d+\.xml$', n)], key=slide_no)
    index, md = [], [f'# 원본 추출: {os.path.basename(pptx)}', '', '> 원본 슬라이드 텍스트 전량 (수정 없음). 표는 셀 단위로 펼쳐짐.', '']
    try:
        from PIL import Image, ImageDraw, ImageFont
        font = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 18)
    except Exception:
        Image = None
    os.makedirs(os.path.join(out_dir, '_contact'), exist_ok=True)
    for s in slides:
        n = slide_no(s)
        root = ET.fromstring(z.read(s))
        acc = {'pics': [], 'texts': []}
        walk_shapes(root.find('.//p:cSld/p:spTree', NS), acc)
        rels_path = s.replace('slides/', 'slides/_rels/') + '.rels'
        rels = {}
        if rels_path in names:
            for m in re.finditer(r'Id="([^"]+)"[^>]*Target="\.\./media/([^"]+)"', z.read(rels_path).decode('utf-8', 'ignore')):
                rels[m.group(1)] = m.group(2)
            for m in re.finditer(r'Target="\.\./media/([^"]+)"[^>]*Id="([^"]+)"', z.read(rels_path).decode('utf-8', 'ignore')):
                rels[m.group(2)] = m.group(1)
        pics = []
        for p in acc['pics']:
            media = rels.get(p['rid'])
            if not media or media.endswith('.wdp'):
                continue
            size = z.getinfo('ppt/media/' + media).file_size
            pics.append({'media': media, 'kb': size // 1024, 'xfrm_in': [round(v / EMU_IN, 2) for v in p['xfrm']] if p['xfrm'] else None,
                         'caption_guess': nearest_caption(p, acc['texts'])})
        index.append({'slide': n, 'pics': pics, 'texts': [t['text'] for t in acc['texts']]})
        md.append(f'## 슬라이드 {n}')
        for t in acc['texts']:
            md.append(('- [표] ' if t['table'] else '- ') + t['text'])
        if pics:
            md.append('')
            md.append('그림: ' + ', '.join(f"`{p['media']}`({p['kb']}KB{', 캡션후보: ' + p['caption_guess'] if p['caption_guess'] else ''})" for p in pics))
        md.append('')
        if Image and pics:
            thumbs = []
            for p in pics:
                try:
                    im = Image.open(io.BytesIO(z.read('ppt/media/' + p['media']))).convert('RGB')
                    im.thumbnail((360, 260))
                    canvas = Image.new('RGB', (380, 310), 'white')
                    canvas.paste(im, (10, 10))
                    d = ImageDraw.Draw(canvas)
                    d.text((10, 275), f"{p['media']} | {p['caption_guess'] or '-'}", fill='black', font=font)
                    thumbs.append(canvas)
                except Exception as e:  # svg 등
                    pass
            if thumbs:
                cols = 3
                rows = (len(thumbs) + cols - 1) // cols
                sheet = Image.new('RGB', (380 * cols, 310 * rows), 'white')
                for i, t in enumerate(thumbs):
                    sheet.paste(t, ((i % cols) * 380, (i // cols) * 310))
                sheet.save(os.path.join(out_dir, '_contact', f'slide{n:02d}.jpg'), quality=80)
    json.dump(index, open(os.path.join(out_dir, '_assets_index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(os.path.join(out_dir, 'source_extract.md'), 'w', encoding='utf-8').write('\n'.join(md))
    print('ok', out_dir, len(slides), 'slides')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
