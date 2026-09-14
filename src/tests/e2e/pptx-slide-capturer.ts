/**
 * @file pptx-slide-capturer.ts
 * @description LibreOffice + PyMuPDF 기반 PPTX 슬라이드별 고화질 PNG 이미지 변환 유틸리티
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

export interface SlideCaptureResult {
  pdfPath: string;
  slideImages: string[]; // Paths to individual slide PNGs
  slideCount: number;
}

export async function convertPptxToSlideImages(
  pptxBuffer: Buffer,
  outputDir: string,
  baseName: string = 'presentation',
  dpi: number = 150
): Promise<SlideCaptureResult> {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  let pptxPath = join(outputDir, `${baseName}.pptx`);
  try {
    writeFileSync(pptxPath, pptxBuffer);
  } catch (e: any) {
    if (e?.code === 'EBUSY') {
      // 파일이 다른 프로세스(LibreOffice 등)에 잠겨있으면 타임스탬프 추가
      pptxPath = join(outputDir, `${baseName}_${Date.now()}.pptx`);
      writeFileSync(pptxPath, pptxBuffer);
    } else {
      throw e;
    }
  }

  // Python script to invoke LibreOffice and PyMuPDF
  const normalizedPptxPath = pptxPath.replace(/\\/g, '/');
  const normalizedOutputDir = outputDir.replace(/\\/g, '/');

  const pythonScript = `
import subprocess, os, sys, fitz

pptx_path = os.path.normpath("${normalizedPptxPath}")
output_dir = os.path.normpath("${normalizedOutputDir}")
base_name = "${baseName}"
dpi = ${dpi}

soffice_path = r"C:\\Program Files\\LibreOffice\\program\\soffice.com"
if not os.path.exists(soffice_path):
    soffice_path = r"C:\\Program Files\\LibreOffice\\program\\soffice.exe"
if not os.path.exists(soffice_path):
    soffice_path = "soffice"

# 1. Remove stale PDF to avoid LibreOffice lock issues
pptx_basename = os.path.splitext(os.path.basename(pptx_path))[0]
old_pdf = os.path.join(output_dir, f"{pptx_basename}.pdf")
if os.path.exists(old_pdf):
    try:
        os.remove(old_pdf)
    except:
        pass

# 2. Convert PPTX to PDF via LibreOffice
cmd = [soffice_path, "--headless", "--convert-to", "pdf", pptx_path, "--outdir", output_dir]
res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
if res.returncode != 0:
    print(f"ERROR: LibreOffice conversion failed: {res.stderr or res.stdout}", file=sys.stderr)
    sys.exit(1)

pdf_path = os.path.join(output_dir, f"{pptx_basename}.pdf")
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
`;

  const scriptPath = join(outputDir, `_convert_${baseName}.py`);
  writeFileSync(scriptPath, pythonScript, 'utf8');

  try {
    const stdout = execSync(`python "${scriptPath}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
    });

    const lines = stdout.split('\n');
    let slideCount = 0;
    const slideImages: string[] = [];

    for (const line of lines) {
      if (line.startsWith('SLIDE_COUNT:')) {
        slideCount = parseInt(line.replace('SLIDE_COUNT:', '').trim(), 10);
      } else if (line.startsWith('SLIDE_PATH:')) {
        slideImages.push(line.replace('SLIDE_PATH:', '').trim());
      }
    }

    const pdfPath = join(outputDir, `${baseName}.pdf`);
    return {
      pdfPath,
      slideImages,
      slideCount: slideImages.length || slideCount,
    };
  } catch (error: any) {
    throw new Error(`Failed to convert PPTX to slide images: ${error.message || error}`);
  }
}
