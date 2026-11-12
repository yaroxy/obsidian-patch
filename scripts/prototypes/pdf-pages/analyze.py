"""PROTOTYPE: compare reference and token-annotated native PDFs and locate page starts.

Usage: python analyze.py OUTPUT_DIRECTORY
Requires pypdf and pdfplumber. No network, no writes to the vault.
"""
import json
import sys
from pathlib import Path

import pdfplumber
from pypdf import PdfReader

root = Path(sys.argv[1])
reports = []
boundaries = []
config = json.loads((root / "config.json").read_text())
export_status = json.loads((root / "export-status.json").read_text())
if export_status["runId"] != config["runId"] or not export_status["finished"] or export_status.get("error"):
    raise RuntimeError("Export must finish successfully for the current config before analysis.")

manifests = [root / (job["name"] + ".json") for job in export_status["jobs"] if job["name"].endswith("-marked")]
for manifest in sorted(manifests):
    meta = json.loads(manifest.read_text())
    stem = manifest.stem.removesuffix("-marked")
    plain = PdfReader(root / (stem + "-plain.pdf"))
    marked = PdfReader(root / (stem + "-marked.pdf"))
    report = {"name": stem, "file": meta["file"], "profile": meta["profile"], "plainPages": len(plain.pages), "markedPages": len(marked.pages), "pages": []}
    tokens = meta["tokens"]
    with pdfplumber.open(root / (stem + "-plain.pdf")) as p0, pdfplumber.open(root / (stem + "-marked.pdf")) as p1:
        for i, page in enumerate(marked.pages):
            annots = []
            chars1 = p1.pages[i].chars
            buckets = {}
            for c in chars1:
                buckets.setdefault(int((c["top"] + c["bottom"]) / 2 // 4), []).append(c)
            ghosts = 0
            for ref in page.get("/Annots", []):
                obj = ref.get_object()
                uri = str(obj.get("/A", {}).get("/URI", ""))
                if uri.startswith("https://pdf-probe.invalid/token/"):
                    ident = int(uri.rsplit("/", 1)[-1])
                    rect = [float(x) for x in obj["/Rect"]]
                    top, bottom = float(page.mediabox.height) - rect[3], float(page.mediabox.height) - rect[1]
                    candidates = [c for band in range(int(top // 4) - 1, int(bottom // 4) + 2) for c in buckets.get(band, [])]
                    visible = [c for c in candidates if rect[0] - .2 <= (c["x0"] + c["x1"]) / 2 <= rect[2] + .2 and top - .2 <= (c["top"] + c["bottom"]) / 2 <= bottom + .2]
                    # Chromium sometimes emits a link rect at a clipped fragment in the previous page's margin.
                    # Such a rectangle does not establish that its text is printed on that page.
                    if not visible:
                        ghosts += 1
                        continue
                    annots.append({"id": ident, "rect": rect, "top": top, "bottom": bottom})
            fresh = [a for a in annots if not tokens[a["id"]]["tableHeader"]]
            fresh.sort(key=lambda a: (-a["rect"][3], a["rect"][0]))
            chars0 = p0.pages[i].chars if i < len(p0.pages) else []
            text0 = "".join(c["text"] for c in chars0)
            text1 = "".join(c["text"] for c in chars1)
            same_text = text0 == text1
            displacement = max((max(abs(a[k] - b[k]) for k in ["x0", "top", "x1", "bottom"]) for a, b in zip(chars0, chars1)), default=0) if same_text else None
            vertical = max((max(abs(a[k] - b[k]) for k in ["top", "bottom"]) for a, b in zip(chars0, chars1)), default=0) if same_text else None
            images0 = p0.pages[i].images if i < len(p0.pages) else []
            images1 = p1.pages[i].images
            same_images = len(images0) == len(images1) and all(abs(a[k] - b[k]) < .01 for a, b in zip(images0, images1) for k in ["x0", "top", "x1", "bottom"])
            entry = {"page": i + 1, "sameText": same_text, "maxGlyphDeltaPt": displacement, "maxVerticalDeltaPt": vertical, "sameImageGeometry": same_images, "clippedAnnotationsIgnored": ghosts, "annotations": annots, "firstText": p1.pages[i].extract_text()[:160], "firstNewToken": fresh[0]["id"] if fresh else None}
            if fresh and i:
                token = tokens[fresh[0]["id"]]
                header_rects = [a for a in annots if tokens[a["id"]]["tableHeader"]]
                def in_header(c):
                    return any(a["rect"][0] - .2 <= (c["x0"] + c["x1"]) / 2 <= a["rect"][2] + .2 and a["top"] - .2 <= (c["top"] + c["bottom"]) / 2 <= a["bottom"] + .2 for a in header_rects)
                leading = [c for c in chars1 if c["text"].strip() and c["bottom"] < fresh[0]["top"] - .5 and not in_header(c)]
                leading_images = [im for im in images1 if im["top"] < fresh[0]["top"] - .5 and im["bottom"] > 0 and im["top"] < p1.pages[i].height]
                boundary = {"case": stem, "file": meta["file"], "page": i + 1, "token": token, "block": meta["blocks"][token["block"]], "pdfRect": fresh[0]["rect"], "samePageText": same_text, "maxGlyphDeltaPt": displacement, "leadingUnmappedGlyphs": len(leading), "leadingUnmappedImages": len(leading_images), "sourceBoundaryCandidate": not leading and not leading_images and token["sourceOffset"] is not None}
                boundaries.append(boundary)
                entry["sourceOffset"] = token["sourceOffset"]
                entry["sectionType"] = boundary["block"]["type"]
            report["pages"].append(entry)
    report["paginationAndLinesPreserved"] = report["plainPages"] == report["markedPages"] and all(p["sameText"] and p["maxVerticalDeltaPt"] < 0.01 and p["sameImageGeometry"] for p in report["pages"])
    report["pixelPerfectGlyphs"] = report["plainPages"] == report["markedPages"] and all(p["sameText"] and p["maxGlyphDeltaPt"] < 0.01 for p in report["pages"])
    report["annotatedTokens"] = len({a["id"] for p in report["pages"] for a in p["annotations"]})
    reports.append(report)
    print(json.dumps({k: v for k, v in report.items() if k != "pages"}))

(root / "pdf-analysis.json").write_text(json.dumps(reports, ensure_ascii=False, indent=2))
(root / "boundaries.json").write_text(json.dumps(boundaries, ensure_ascii=False, indent=2))
print(json.dumps({"boundaries": len(boundaries), "usablePageBoundaryPositions": sum(b["sourceBoundaryCandidate"] for b in boundaries), "unsupportedPageStarts": sum(not b["sourceBoundaryCandidate"] for b in boundaries)}))
