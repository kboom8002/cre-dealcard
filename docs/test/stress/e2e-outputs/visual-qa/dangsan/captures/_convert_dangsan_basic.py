
import subprocess, os, sys, fitz

pptx_path = os.path.normpath("C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/dangsan/captures/dangsan_basic.pptx")
output_dir = os.path.normpath("C:/Users/User/cre-dealcard/docs/test/stress/e2e-outputs/visual-qa/dangsan/captures")
base_name = "dangsan_basic"
dpi = 150

soffice_path = r"C:\Program Files\LibreOffice\program\soffice.exe"
if not os.path.exists(soffice_path):
    soffice_path = "soffice"

# 1. Convert PPTX to PDF via LibreOffice
cmd = [soffice_path, "--headless", "--convert-to", "pdf", pptx_path, "--outdir", output_dir]
res = subprocess.run(cmd, capture_output=True, text=True)
if res.returncode != 0:
    print(f"ERROR: LibreOffice conversion failed: {res.stderr or res.stdout}", file=sys.stderr)
    sys.exit(1)

pdf_path = os.path.join(output_dir, f"{base_name}.pdf")
if not os.path.exists(pdf_path):
    print(f"ERROR: PDF file not generated at {pdf_path}", file=sys.stderr)
    sys.exit(1)

# 2. Render each page as high-res PNG via PyMuPDF
doc = fitz.open(pdf_path)
slide_count = len(doc)
slide_paths = []

for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=dpi)
    img_filename = f"{base_name}_slide_{i+1:02d}.png"
    img_path = os.path.join(output_dir, img_filename)
    pix.save(img_path)
    slide_paths.append(img_path)

print(f"SLIDE_COUNT:{slide_count}")
for sp in slide_paths:
    print(f"SLIDE_PATH:{sp}")
