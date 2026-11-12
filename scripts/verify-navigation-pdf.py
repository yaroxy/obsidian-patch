"""Verify actual native PDF bookmarks, destinations and unchanged page content.

Requires pypdf and pdfplumber. Run after test-navigation.mjs, or with its output directory.
"""
from collections import Counter
import json
from pathlib import Path
import sys
from urllib.parse import unquote

import pdfplumber
from pypdf import PdfReader

root = Path(sys.argv[1])
report = json.loads((root / "results.json").read_text())
assert report["finished"] and not report.get("error"), "Native integration must finish first"
expected = {
    "Wiki target": ("Target Heading", 2),
    "Markdown slug": ("Target Heading", 2),
    "Encoded": ("中文 标题", 2),
    "Same basename": ("Target Heading", 2),
    "Vault path": ("Target Heading", 2),
    "Relative Markdown": ("Target Heading", 2),
    "First repeated": ("Repeat", 1),
    "Second repeat": ("Repeat", 2),
    "Formatted": ("Bold text and code", 2),
}


def outlines(items):
    for item in items:
        if isinstance(item, list):
            yield from outlines(item)
        else:
            yield item


results = []
with pdfplumber.open(root / "disabled.pdf") as reference:
    for export in report["exports"]:
        name = export["name"]
        outline_on = name in {"enabled", "outline-only", "reloaded"}
        links_on = name in {"enabled", "links-only", "reloaded"}
        reader = PdfReader(root / f"{name}.pdf")
        assert len(reader.pages) == 2, f"Unexpected pagination for {name}"
        bookmarks = list(outlines(reader.outline))
        if outline_on:
            assert [d.title for d in bookmarks] == [h["text"] for h in export["headings"]], (name, "Bookmark labels/order differ from the printed headings")
            assert reader.get_destination_page_number(next(d for d in bookmarks if d.title == "Target Heading")) == 1
            assert any(isinstance(d, list) for d in reader.outline), "The outline is not hierarchical"
        else:
            assert not bookmarks, f"Outline remained enabled for {name}"

        destinations = []
        external = []
        for page in reader.pages:
            for ref in page.get("/Annots", []):
                annotation = ref.get_object()
                action = annotation.get("/A", {})
                dest = annotation.get("/Dest") or action.get("/D")
                if dest is not None:
                    destinations.append(str(dest))
                if action.get("/URI"):
                    external.append(str(action["/URI"]))
        assert external == ["https://example.com/#Target"], (name, "External URL changed")
        if links_on:
            counts = Counter()
            for text, (heading_text, page) in expected.items():
                link = next(a for a in export["links"] if a["text"] == text)
                ident = unquote(link["href"][1:])
                heading = next(h for h in export["headings"] if h["id"] == ident)
                assert heading["text"] == heading_text, (name, text, heading)
                destination = reader.named_destinations[f"/{ident}"]
                assert reader.get_destination_page_number(destination) + 1 == page, (name, text, "Wrong destination page")
                counts[f"/{ident}"] += 1
            assert Counter(destinations) == counts, (name, "Missing, duplicate or unexpected PDF links", destinations, counts)
        else:
            assert not destinations, f"Local links remained enabled for {name}"
        with pdfplumber.open(root / f"{name}.pdf") as pdf:
            for actual, baseline in zip(pdf.pages, reference.pages):
                assert [c["text"] for c in actual.chars] == [c["text"] for c in baseline.chars], (name, "Visible content changed")
                assert all(abs(a[k] - b[k]) < .01 for a, b in zip(actual.chars, baseline.chars) for k in ["x0", "top", "x1", "bottom"]), (name, "Glyph layout changed")
        results.append({"name": name, "pages": len(reader.pages), "bookmarks": len(bookmarks), "internalLinks": len(destinations), "externalLinks": len(external), "glyphsMatchNativeBaseline": True})
        print(f"PASS {name}: {len(bookmarks)} bookmarks, {len(destinations)} local jumps, unchanged visible PDF layout")
(root / "pdf-verification.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
