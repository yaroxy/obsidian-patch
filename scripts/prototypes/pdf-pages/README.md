# Native PDF pagination experiment

This disposable experiment asks whether page starts in Obsidian's actual PDF output can be traced to source positions and then located in Reading View, Source mode, and Live Preview. It is outside the plugin bundle. The measured results and remaining limits are in `docs/pdf-pagination-prototype.md` and `results/2026-11-12.json`.

The user deferred implementation of PDF pagination display on 2026-11-12. Keep this as reproducible research; it is not an active implementation plan.

## Run

Open `dev-vault` in desktop Obsidian with its CLI available, then run from the repository root:

```sh
node scripts/prototypes/pdf-pages/run.mjs \
  /path/to/dev-vault \
  "${TMPDIR:-/tmp}/obsidian-patch-pdf-repro"
```

Requirements include Node.js, Obsidian's native CLI, and Python with `pypdf` and `pdfplumber`. The recorded run used pypdf 6.21.4 and pdfplumber 0.11.9. Set `PDF_PYTHON` to select an interpreter, or use the default `python3`. The runner uses the [integration test CLI settings](../../../docs/integration-testing.md#running), including `OBSIDIAN_CLI` for a custom executable.

Supply the path to the open `dev-vault` as the first argument. The optional output directory defaults to `obsidian-patch-pdf-prototype` under the system temporary directory.

The command recreates three owned fixtures under `dev-vault/Patch PDF Prototype/`: `Claude Pages.md`, `Edge Cases.md`, and `banner.png`. It exports twelve PDFs, analyzes six reference/marked pairs, and measures the page-start positions in four view configurations. It leaves the fixtures and output files for inspection. Temporary tabs, print interception, debugger attachment, and background throttling are restored when the respective operation finishes. It does not deploy or modify the plugin.

`PDF_PROBE_QUICK=1` limits the run to A4 portrait. An output directory may contain older files; analysis selects only jobs listed in the current completed export status.

To rerun just the view measurements on existing results:

```sh
node scripts/prototypes/pdf-pages/map.mjs "${TMPDIR:-/tmp}/obsidian-patch-pdf-repro"
```

This rejects changed fixture source and PDF instrumentation that changed the measured pagination or line layout. Theme, fonts, screen width, Obsidian version, and print settings can change pagination or screen coordinates. Treat the recorded counts as a result for the recorded environment.

## Files and method

- `run.mjs` writes the fixtures and invokes the pipeline. It checks that the CLI selected the same vault as the fixture destination.
- `export.js` captures the native print modal, intercepts its print DOM, and invokes the native PDF exporter. Both variants receive identical heading IDs and same-note heading-link preparation. `plain` means no token instrumentation; it is not a byte-for-byte untouched native export.
- The marked variant wraps selected text tokens in visually inherited links with `https://pdf-probe.invalid/token/ID` destinations. These destinations identify PDF annotations and are not fetched. They make this a measurement PDF, unsuitable as the user's final export.
- `analyze.py` checks page counts, glyph sequences, vertical glyph positions, and image geometry against the reference. It intersects annotation rectangles with visible PDF glyphs, discards clipped rectangles and repeated table headers, and rejects candidates preceded by uninstrumented text or images.
- `map-views.js` resolves a source section and an exact text range in Reading View. Source mode uses CodeMirror positions and a coordinate round trip. Live Preview additionally inspects rendered table/callout widgets because `coordsAtPos()` can return a widget edge. The narrow reading pass temporarily uses a 520 px text width.

Outputs include `config.json` with fixture hashes, `export-status.json`, twelve PDFs and their DOM/source metadata, `pdf-analysis.json`, `boundaries.json`, `view-mapping.json`, and representative screenshots. JSON source positions are zero-based UTF-16 offsets and line/column pairs. The screenshots contain temporary measurement overlays, not an installed UI feature.

## Scope of the source map

The fixture mapper supports literal text within a known metadata section, literal code bodies, simple Markdown table cells, and callouts with one quote prefix. It does not implement a general Markdown source map. Formula glyphs, image starts, nested callouts, escaped table pipes, transformations such as entities, existing links at a page start, generated content, and pages without instrumented text need additional handling. The leading-content check is deliberately limited; it is not a complete PDF reading-order algorithm.

The presence of an escape, emoji, or link somewhere in a fixture does not establish correct page-start mapping through that construct. Long English words split across pages, complex scripts, HTML tables, embeds, footnotes, other themes, live editing, and the oldest supported Obsidian version remain outside this experiment's acceptance claim.

Do not copy the dense token instrumentation into production without addressing its output overhead and proving that it preserves pagination across the intended supported corpus.
