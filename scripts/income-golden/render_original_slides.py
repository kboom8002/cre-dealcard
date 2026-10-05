"""원본 IM(pptx) → 슬라이드 JPEG 스냅샷 (향후 지면 비교용 reference/original_slides).

사용: python scripts/income-golden/render_original_slides.py <pptx> <out_dir> [dpi]
LibreOffice(soffice)로 PDF 변환 후 PyMuPDF로 페이지별 JPEG 저장.
"""
import os, subprocess, sys, tempfile, shutil
import fitz

SOFFICE = r'C:\Program Files\LibreOffice\program\soffice.exe'


def main(pptx, out_dir, dpi=110):
    os.makedirs(out_dir, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='im_pdf_')
    try:
        src = os.path.join(tmp, 'src.pptx')
        shutil.copyfile(pptx, src)  # 한글 파일명 회피
        subprocess.run([SOFFICE, '--headless', '--convert-to', 'pdf', '--outdir', tmp, src], check=True, timeout=600,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        doc = fitz.open(os.path.join(tmp, 'src.pdf'))
        for i, page in enumerate(doc):
            pix = page.get_pixmap(dpi=int(dpi))
            pix.save(os.path.join(out_dir, f'slide{i + 1:02d}.jpg'), jpg_quality=82)
        print('ok', out_dir, len(doc), 'pages')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 110)
