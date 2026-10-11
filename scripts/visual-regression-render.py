"""
PDF -> per-slide PNG (PyMuPDF) + embedded-font report, for scripts/visual-regression-gate.ts.

usage: python -X utf8 scripts/visual-regression-render.py --width 960 <pdf>=<outdir> [<pdf>=<outdir> ...]

writes <outdir>/slide-NN.png (NN = 1-based page, zero padded to 2) and prints one JSON document on stdout:
  {"pymupdf": "1.26.1", "decks": [{"pdf": "...", "outdir": "...", "pages": 25, "fonts": ["MalgunGothic", ...]}]}
Fonts are embedded-font family names with the subset prefix ("ABCDEF+") removed, sorted, unique:
they are the environment fingerprint for font substitution (LibreOffice falls back silently).
"""
import json
import os
import sys

import fitz  # PyMuPDF


def main(argv):
    width = 960
    jobs = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--width":
            width = int(argv[i + 1])
            i += 2
            continue
        if "=" not in a:
            sys.stderr.write("bad job (expected pdf=outdir): %s\n" % a)
            return 2
        pdf, outdir = a.split("=", 1)
        jobs.append((pdf, outdir))
        i += 1
    if not jobs:
        sys.stderr.write("no jobs\n")
        return 2

    decks = []
    for pdf, outdir in jobs:
        os.makedirs(outdir, exist_ok=True)
        for f in os.listdir(outdir):
            if f.startswith("slide-") and f.endswith(".png"):
                os.remove(os.path.join(outdir, f))
        doc = fitz.open(pdf)
        fonts = set()
        for idx, page in enumerate(doc):
            zoom = width / page.rect.width
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            pix.save(os.path.join(outdir, "slide-%02d.png" % (idx + 1)))
            for f in page.get_fonts():
                base = f[3] or ""
                fonts.add(base.split("+", 1)[1] if "+" in base else base)
        decks.append({"pdf": pdf, "outdir": outdir, "pages": len(doc), "fonts": sorted(x for x in fonts if x)})
        doc.close()
    sys.stdout.buffer.write(json.dumps({"pymupdf": fitz.VersionBind, "decks": decks}, ensure_ascii=True).encode("ascii"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
