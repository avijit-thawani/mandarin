#!/usr/bin/env python3
"""
OCR the Developing Chinese: Elementary Speaking Course 1 PDF (scanned, no text layer)
using macOS Vision, page by page. Writes one text file per page plus a combined file.

Usage: ocr_extract.py [--pages 264-270] [--out DIR]
"""
import argparse
import sys
from pathlib import Path

import fitz
import Vision
import Quartz
from Foundation import NSData

HERE = Path(__file__).parent
PDF = next(HERE.glob("*.pdf"))


def ocr_png(png_bytes: bytes) -> str:
    ns_data = NSData.dataWithBytes_length_(png_bytes, len(png_bytes))
    src = Quartz.CGImageSourceCreateWithData(ns_data, None)
    if not src:
        return ""
    cg = Quartz.CGImageSourceCreateImageAtIndex(src, 0, None)
    if not cg:
        return ""
    handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(cg, None)
    req = Vision.VNRecognizeTextRequest.alloc().init()
    req.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    req.setRecognitionLanguages_(["zh-Hans", "en"])
    req.setUsesLanguageCorrection_(True)
    ok, _ = handler.performRequests_error_([req], None)
    if not ok:
        return ""
    lines = []
    for obs in req.results() or []:
        cands = obs.topCandidates_(1)
        if cands:
            lines.append(cands[0].string())
    return "\n".join(lines)


def parse_pages(spec: str, total: int):
    if not spec:
        return range(1, total + 1)
    out = []
    for part in spec.split(","):
        if "-" in part:
            a, b = part.split("-")
            out.extend(range(int(a), int(b) + 1))
        else:
            out.append(int(part))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", default="", help="1-indexed page spec, e.g. 264-270,15")
    ap.add_argument("--out", default=str(HERE / "ocr"))
    ap.add_argument("--dpi", type=int, default=300)
    args = ap.parse_args()

    doc = fitz.open(PDF)
    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)

    for pno in parse_pages(args.pages, len(doc)):
        dest = outdir / f"page_{pno:03d}.txt"
        if dest.exists():
            continue
        pix = doc[pno - 1].get_pixmap(dpi=args.dpi)
        text = ocr_png(pix.tobytes("png"))
        dest.write_text(text, encoding="utf-8")
        print(f"page {pno}: {len(text)} chars", file=sys.stderr)


if __name__ == "__main__":
    main()
