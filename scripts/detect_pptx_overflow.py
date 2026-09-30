#!/usr/bin/env python3
"""
scripts/detect_pptx_overflow.py
================================
Independent PPTX physical geometry and text overflow inspector using python-pptx 1.0.2.

Inspects generated PPTX files for:
1. Text frame overflow: text bounding box height/width vs container limits.
2. Table cell expansion & spill: table rows expanding beyond row height or spilling
   off the slide bottom (>6.75" content safe area / 7.50" canvas boundary).
3. Canvas bleed: shapes placed outside slide dimensions (13.333" x 7.50").
4. Footer collisions: content shapes intersecting with the footer area (y >= 6.94").

Usage:
    python scripts/detect_pptx_overflow.py <path_to_pptx> [--strict] [--json]

Exit codes:
    0: Zero overflows / errors detected.
    1: One or more overflows / errors detected.
"""

import sys
import os
import argparse
import json
from typing import List, Dict, Any, Optional, Tuple

try:
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.enum.shapes import MSO_SHAPE_TYPE
except ImportError:
    print("Error: python-pptx is required. Install via 'pip install python-pptx'.", file=sys.stderr)
    sys.exit(1)

# Ensure UTF-8 output on Windows consoles
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Constants for 16:9 Widescreen Presentation Canvas
CANVAS_WIDTH = 13.333333
CANVAS_HEIGHT = 7.500000
SAFE_CONTENT_BOTTOM = 6.750000
FOOTER_BOUNDARY = 6.940000
TOLERANCE = 0.050000  # 0.05" margin of error for rounding and boundary fuzziness


def get_char_width_inches(ch: str, font_size_pt: float) -> float:
    """
    Calculates estimated width of a character in inches based on font size and character class.
    CJK full-width glyphs occupy ~1.0em.
    Latin uppercase ~0.65em, lowercase/digits ~0.55em, spaces ~0.28em, punctuation ~0.35em.
    """
    em = font_size_pt / 72.0
    code = ord(ch)

    # Korean Hangul Syllables, Jamo, CJK Unified Ideographs, Full-width ASCII
    if (
        (0xAC00 <= code <= 0xD7AF) or  # Hangul Syllables
        (0x1100 <= code <= 0x11FF) or  # Hangul Jamo
        (0x3130 <= code <= 0x318F) or  # Hangul Compatibility Jamo
        (0x4E00 <= code <= 0x9FFF) or  # CJK Unified Ideographs
        (0x3000 <= code <= 0x303F) or  # CJK Symbols and Punctuation
        (0xFF01 <= code <= 0xFF60)     # Full-width ASCII
    ):
        return em * 1.0

    if ch == ' ':
        return em * 0.28
    if 'A' <= ch <= 'Z':
        return em * 0.65
    if ('a' <= ch <= 'z') or ('0' <= ch <= '9'):
        return em * 0.55
    if ch in ',.:;!|\'"`?[]()_-/\\':
        return em * 0.35

    return em * 0.50


def simulate_text_wrap(
    text: str,
    width_inches: float,
    font_size_pt: float,
    word_wrap: bool = True
) -> Tuple[List[str], float]:
    """
    Simulates word and character wrapping for a block of text given available width.
    Returns (list of wrapped lines, maximum line width in inches).
    """
    if not text:
        return ([], 0.0)

    paragraphs = text.split('\n')
    all_lines: List[str] = []
    global_max_w = 0.0

    safe_width = max(0.1, width_inches)

    for para in paragraphs:
        if not para:
            all_lines.append('')
            continue

        if not word_wrap:
            # No word wrap: paragraph is a single line
            line_w = sum(get_char_width_inches(c, font_size_pt) for c in para)
            all_lines.append(para)
            if line_w > global_max_w:
                global_max_w = line_w
            continue

        words = para.split(' ')
        current_line = ''
        current_line_w = 0.0

        for i, word in enumerate(words):
            word_w = sum(get_char_width_inches(c, font_size_pt) for c in word)
            space_w = get_char_width_inches(' ', font_size_pt) if current_line else 0.0

            if current_line_w + space_w + word_w <= safe_width:
                current_line += (' ' if current_line else '') + word
                current_line_w += space_w + word_w
            else:
                # Word doesn't fit on current line
                if word_w > safe_width:
                    # Single word is wider than the box: break by characters
                    if current_line:
                        all_lines.append(current_line)
                        if current_line_w > global_max_w:
                            global_max_w = current_line_w
                        current_line = ''
                        current_line_w = 0.0

                    for c in word:
                        c_w = get_char_width_inches(c, font_size_pt)
                        if current_line_w + c_w > safe_width and current_line:
                            all_lines.append(current_line)
                            if current_line_w > global_max_w:
                                global_max_w = current_line_w
                            current_line = c
                            current_line_w = c_w
                        else:
                            current_line += c
                            current_line_w += c_w
                else:
                    if current_line:
                        all_lines.append(current_line)
                        if current_line_w > global_max_w:
                            global_max_w = current_line_w
                    current_line = word
                    current_line_w = word_w

        if current_line:
            all_lines.append(current_line)
            if current_line_w > global_max_w:
                global_max_w = current_line_w

    return (all_lines, global_max_w)


def get_paragraph_font_size(paragraph, default_fs: float = 11.0) -> float:
    """Extracts effective font size for a paragraph from paragraph or runs."""
    if paragraph.font and paragraph.font.size:
        return paragraph.font.size.pt
    run_sizes = [r.font.size.pt for r in paragraph.runs if r.font and r.font.size]
    if run_sizes:
        return max(run_sizes)
    return default_fs


class PPTXOverflowDetector:
    def __init__(self, pptx_path: str, strict: bool = False):
        self.pptx_path = pptx_path
        self.strict = strict
        self.issues: List[Dict[str, Any]] = []
        self.warnings: List[Dict[str, Any]] = []
        self.slide_count = 0

    def inspect(self) -> Dict[str, Any]:
        if not os.path.exists(self.pptx_path):
            raise FileNotFoundError(f"PPTX file not found: {self.pptx_path}")

        prs = Presentation(self.pptx_path)
        self.slide_count = len(prs.slides)

        for s_idx, slide in enumerate(prs.slides):
            slide_num = s_idx + 1
            self._inspect_slide(slide, slide_num)

        # In strict mode, warnings are treated as issues
        effective_issues = list(self.issues)
        if self.strict:
            effective_issues.extend(self.warnings)

        return {
            "file": os.path.abspath(self.pptx_path),
            "slide_count": self.slide_count,
            "is_pass": len(effective_issues) == 0,
            "strict_mode": self.strict,
            "error_count": len(effective_issues),
            "warning_count": len(self.warnings),
            "issues": effective_issues,
            "warnings": self.warnings if not self.strict else [],
        }

    def _inspect_slide(self, slide, slide_num: int):
        for shape in slide.shapes:
            self._inspect_shape(shape, slide_num)

    def _inspect_shape(self, shape, slide_num: int):
        # Recurse if group shape
        if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
            for sub_shape in shape.shapes:
                self._inspect_shape(sub_shape, slide_num)
            return

        left = shape.left.inches
        top = shape.top.inches
        width = shape.width.inches
        height = shape.height.inches
        right = left + width
        bottom = top + height

        # ── 1. Check Canvas Bleed ──
        self._check_bleed(shape, slide_num, left, top, right, bottom)

        # ── 2. Check Footer Collision ──
        self._check_footer_collision(shape, slide_num, left, top, right, bottom, width, height)

        # ── 3. Check Table Cell Expansion & Spill ──
        if shape.has_table:
            self._check_table(shape, slide_num, left, top, width, height)

        # ── 4. Check Text Frame Overflow ──
        elif shape.has_text_frame:
            self._check_text_frame(shape, slide_num, left, top, width, height)

    def _check_bleed(self, shape, slide_num: int, left: float, top: float, right: float, bottom: float):
        """Checks if shape coordinates exceed the slide boundaries."""
        if left < -TOLERANCE or top < -TOLERANCE:
            self.issues.append({
                "slide": slide_num,
                "shape_id": shape.shape_id,
                "shape_name": shape.name,
                "category": "CANVAS_BLEED",
                "severity": "ERROR",
                "message": f"Shape bleeds off canvas top/left: (left={left:.2f}\", top={top:.2f}\")",
                "bounds": {"left": left, "top": top, "right": right, "bottom": bottom}
            })
        if right > CANVAS_WIDTH + TOLERANCE:
            self.issues.append({
                "slide": slide_num,
                "shape_id": shape.shape_id,
                "shape_name": shape.name,
                "category": "CANVAS_BLEED",
                "severity": "ERROR",
                "message": f"Shape bleeds off canvas right: (right={right:.2f}\" > {CANVAS_WIDTH:.2f}\")",
                "bounds": {"left": left, "top": top, "right": right, "bottom": bottom}
            })
        if bottom > CANVAS_HEIGHT + TOLERANCE:
            self.issues.append({
                "slide": slide_num,
                "shape_id": shape.shape_id,
                "shape_name": shape.name,
                "category": "CANVAS_BLEED",
                "severity": "ERROR",
                "message": f"Shape bleeds off canvas bottom: (bottom={bottom:.2f}\" > {CANVAS_HEIGHT:.2f}\")",
                "bounds": {"left": left, "top": top, "right": right, "bottom": bottom}
            })

    def _check_footer_collision(
        self,
        shape,
        slide_num: int,
        left: float,
        top: float,
        right: float,
        bottom: float,
        width: float,
        height: float
    ):
        """
        Checks if content shapes intersect with the footer area (y >= 6.94").
        Exempts full-slide background rectangles, full-height vertical divider lines,
        and shapes intentionally positioned inside the footer area (top >= 6.90").
        """
        # Full slide backgrounds or full-height backdrop panels (e.g. cover split background)
        has_text = shape.has_text_frame and bool(shape.text_frame.text.strip())
        if top <= 0.05 and bottom >= 7.40 and not has_text:
            return
        # Full height decorative accent lines on cover
        if top <= 0.50 and height >= 6.00 and width <= 0.05:
            return
        # Shapes that originate in the footer area itself (>= 6.90")
        if top >= 6.90:
            return

        # If a content shape (starting above 6.90") extends into or past the footer line (6.94")
        if bottom > FOOTER_BOUNDARY + 0.02:
            self.issues.append({
                "slide": slide_num,
                "shape_id": shape.shape_id,
                "shape_name": shape.name,
                "category": "FOOTER_COLLISION",
                "severity": "ERROR",
                "message": f"Content shape intersects footer boundary: (top={top:.2f}\", bottom={bottom:.2f}\" > {FOOTER_BOUNDARY:.2f}\")",
                "bounds": {"left": left, "top": top, "right": right, "bottom": bottom}
            })
        elif bottom > SAFE_CONTENT_BOTTOM + 0.05:
            # Content encroaching safe area but before footer line
            self.warnings.append({
                "slide": slide_num,
                "shape_id": shape.shape_id,
                "shape_name": shape.name,
                "category": "SAFE_AREA_VIOLATION",
                "severity": "WARNING",
                "message": f"Content shape extends past safe bottom: (bottom={bottom:.2f}\" > {SAFE_CONTENT_BOTTOM:.2f}\")",
                "bounds": {"left": left, "top": top, "right": right, "bottom": bottom}
            })

    def _check_table(self, shape, slide_num: int, left: float, top: float, width: float, height: float):
        """Checks table height, row expansion, and cell text overflow."""
        tbl = shape.table
        col_widths = [col.width.inches for col in tbl.columns]
        row_heights = [row.height.inches for row in tbl.rows]
        total_table_h = sum(row_heights)
        table_bottom = top + total_table_h

        # 1. Total table spill checks
        if table_bottom > CANVAS_HEIGHT + TOLERANCE:
            self.issues.append({
                "slide": slide_num,
                "shape_id": shape.shape_id,
                "shape_name": shape.name,
                "category": "TABLE_SPILL",
                "severity": "ERROR",
                "message": f"Table spills off slide bottom: (bottom={table_bottom:.2f}\" > {CANVAS_HEIGHT:.2f}\")",
                "bounds": {"top": top, "total_height": total_table_h, "bottom": table_bottom}
            })
        elif table_bottom > SAFE_CONTENT_BOTTOM + TOLERANCE:
            msg = f"Table exceeds content safe area: (bottom={table_bottom:.2f}\" > {SAFE_CONTENT_BOTTOM:.2f}\")"
            if self.strict:
                self.issues.append({
                    "slide": slide_num,
                    "shape_id": shape.shape_id,
                    "shape_name": shape.name,
                    "category": "TABLE_SAFE_AREA_EXCEEDED",
                    "severity": "ERROR",
                    "message": msg,
                    "bounds": {"top": top, "total_height": total_table_h, "bottom": table_bottom}
                })
            else:
                self.warnings.append({
                    "slide": slide_num,
                    "shape_id": shape.shape_id,
                    "shape_name": shape.name,
                    "category": "TABLE_SAFE_AREA_EXCEEDED",
                    "severity": "WARNING",
                    "message": msg,
                    "bounds": {"top": top, "total_height": total_table_h, "bottom": table_bottom}
                })

        # 2. Individual cell checks
        for r_idx, row in enumerate(tbl.rows):
            cell_h = row_heights[r_idx]
            for c_idx, cell in enumerate(row.cells):
                cell_w = col_widths[c_idx]
                text = cell.text.strip()
                if not text:
                    continue

                # Cell padding: default ~0.11" horizontal, ~0.05" vertical
                margin_w = 0.11
                margin_h = 0.05
                if cell.margin_left and cell.margin_right:
                    margin_w = cell.margin_left.inches + cell.margin_right.inches
                if cell.margin_top and cell.margin_bottom:
                    margin_h = cell.margin_top.inches + cell.margin_bottom.inches

                usable_w = max(0.05, cell_w - margin_w)
                usable_h = max(0.05, cell_h - margin_h)

                # Determine font size (default 9.5pt for table cells)
                fs = 9.5
                if cell.text_frame and cell.text_frame.paragraphs:
                    fs = get_paragraph_font_size(cell.text_frame.paragraphs[0], default_fs=9.5)

                lines, _ = simulate_text_wrap(text, usable_w, fs, word_wrap=True)
                line_spacing = 1.20
                line_h = (fs / 72.0) * line_spacing
                required_h = len(lines) * line_h

                # If text needs more vertical space than the cell height affords (beyond buffer)
                if required_h > usable_h + 0.08:
                    snippet = text.replace('\n', ' ')
                    if len(snippet) > 30:
                        snippet = snippet[:28] + '…'
                    self.issues.append({
                        "slide": slide_num,
                        "shape_id": shape.shape_id,
                        "shape_name": shape.name,
                        "category": "TABLE_CELL_OVERFLOW",
                        "severity": "ERROR",
                        "cell": {"row": r_idx, "col": c_idx},
                        "message": f"Table cell ({r_idx}, {c_idx}) text overflow: '{snippet}' requires {len(lines)} lines (~{required_h:.2f}\") in cell_h={cell_h:.2f}\"",
                        "details": {
                            "text": snippet,
                            "lines": len(lines),
                            "required_height": round(required_h, 3),
                            "cell_height": round(cell_h, 3),
                            "usable_height": round(usable_h, 3),
                        }
                    })

    def _check_text_frame(self, shape, slide_num: int, left: float, top: float, width: float, height: float):
        """Checks if text within a shape overflows the shape bounding box."""
        tf = shape.text_frame
        full_text = tf.text.strip()
        if not full_text:
            return

        # Don't check tiny decorative icons or 0-height lines
        if width <= 0.10 or height <= 0.10:
            return

        margin_w = (tf.margin_left.inches if tf.margin_left else 0.0) + (tf.margin_right.inches if tf.margin_right else 0.0)
        margin_h = (tf.margin_top.inches if tf.margin_top else 0.0) + (tf.margin_bottom.inches if tf.margin_bottom else 0.0)

        usable_w = max(0.1, width - margin_w)
        usable_h = max(0.1, height - margin_h)

        total_required_h = 0.0
        max_line_w = 0.0

        for para in tf.paragraphs:
            para_text = para.text
            if not para_text:
                continue

            fs = get_paragraph_font_size(para, default_fs=11.0)
            lines, p_max_w = simulate_text_wrap(para_text, usable_w, fs, word_wrap=tf.word_wrap)

            if p_max_w > max_line_w:
                max_line_w = p_max_w

            line_spacing = 1.25
            line_h = (fs / 72.0) * line_spacing
            total_required_h += len(lines) * line_h

        # Height overflow check
        if total_required_h > usable_h + 0.08 and height >= 0.25:
            snippet = full_text.replace('\n', ' ')
            if len(snippet) > 40:
                snippet = snippet[:38] + '…'
            self.issues.append({
                "slide": slide_num,
                "shape_id": shape.shape_id,
                "shape_name": shape.name,
                "category": "TEXT_FRAME_OVERFLOW",
                "severity": "ERROR",
                "message": f"Text frame overflow: '{snippet}' requires ~{total_required_h:.2f}\" height in box_h={height:.2f}\" (usable={usable_h:.2f}\")",
                "details": {
                    "text": snippet,
                    "required_height": round(total_required_h, 3),
                    "box_height": round(height, 3),
                    "usable_height": round(usable_h, 3),
                    "overflow_inches": round(total_required_h - usable_h, 3)
                }
            })

        # Width overflow check (when word_wrap is False or unbreakable token)
        if not tf.word_wrap and max_line_w > usable_w + 0.10:
            snippet = full_text.replace('\n', ' ')
            if len(snippet) > 40:
                snippet = snippet[:38] + '…'
            self.issues.append({
                "slide": slide_num,
                "shape_id": shape.shape_id,
                "shape_name": shape.name,
                "category": "TEXT_FRAME_WIDTH_OVERFLOW",
                "severity": "ERROR",
                "message": f"Text frame width overflow: '{snippet}' requires ~{max_line_w:.2f}\" width in box_w={width:.2f}\"",
                "details": {
                    "text": snippet,
                    "required_width": round(max_line_w, 3),
                    "box_width": round(width, 3),
                    "usable_width": round(usable_w, 3),
                }
            })


def main():
    parser = argparse.ArgumentParser(
        description="Inspect PPTX for text overflow, table cell expansion, slide bleed, and footer collisions."
    )
    parser.add_argument("pptx_path", help="Path to PPTX presentation file to inspect")
    parser.add_argument("--strict", action="store_true", help="Enable strict mode (safe area >6.75\" warnings become errors)")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")

    args = parser.parse_args()

    if not os.path.isfile(args.pptx_path):
        print(f"Error: File does not exist: {args.pptx_path}", file=sys.stderr)
        sys.exit(1)

    try:
        detector = PPTXOverflowDetector(args.pptx_path, strict=args.strict)
        report = detector.inspect()
    except Exception as e:
        print(f"Error inspecting PPTX: {e}", file=sys.stderr)
        sys.exit(1)

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print("=" * 70)
        print(" PPTX Physical Layout & Overflow Inspection Report")
        print("=" * 70)
        print(f"File:         {report['file']}")
        print(f"Slide Count:  {report['slide_count']}")
        print(f"Strict Mode:  {'ON' if report['strict_mode'] else 'OFF'}")
        print(f"Errors:       {report['error_count']}")
        print(f"Warnings:     {report['warning_count']}")
        print("-" * 70)

        if report['error_count'] > 0:
            print("[FAIL] Layout / Overflow Defects Detected:")
            for issue in report['issues']:
                slide_str = f"Slide {issue['slide']}"
                cat_str = f"[{issue['category']}]"
                print(f"  • {slide_str:<10} {cat_str:<26} {issue['message']}")
        else:
            print("[PASS] Zero text overflow, slide bleed, or footer collisions detected!")

        if report['warnings'] and not report['strict_mode']:
            print("\n[INFO] Layout Warnings (Safe Area / Density):")
            for w in report['warnings']:
                slide_str = f"Slide {w['slide']}"
                cat_str = f"[{w['category']}]"
                print(f"  • {slide_str:<10} {cat_str:<26} {w['message']}")

        print("=" * 70)

    sys.exit(0 if report["is_pass"] else 1)


if __name__ == "__main__":
    main()
