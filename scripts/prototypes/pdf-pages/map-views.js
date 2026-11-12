// PROTOTYPE: verify actual reading/CM coordinates for PDF-derived source positions.
async function mapViews(app, config) {
  const fs = require("fs"), path = require("path");
  const boundaries = JSON.parse(fs.readFileSync(path.join(config.output, "boundaries.json"), "utf8"));
  const wc = require("electron").remote.getCurrentWebContents();
  const throttle = wc.getBackgroundThrottling();
  const previous = app.workspace.getMostRecentLeaf();
  const leaf = app.workspace.getLeaf("tab");
  const report = { runId: config.runId, results: [], finished: false };
  const save = () => fs.writeFileSync(path.join(config.output, "view-mapping.json"), JSON.stringify(report, null, 2));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const rect = r => r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
  const textNodes = el => {
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT), out = [];
    while (walker.nextNode()) out.push(walker.currentNode);
    return out;
  };
  const screenshot = async (view, r, mode) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${Math.max(4,r.right-r.left)}px;height:${r.bottom-r.top}px;background:#ffd54f99;border-left:2px solid #1565c0;pointer-events:none;z-index:999999;`;
    const label = document.createElement("span"); label.textContent = "PDF page 6 starts here";
    label.style.cssText = "position:absolute;bottom:100%;right:0;white-space:nowrap;font:12px sans-serif;color:#fff;background:#1565c0;padding:3px 5px;";
    overlay.append(label); document.body.append(overlay);
    const debugger_ = wc.debugger, owned = !debugger_.isAttached();
    try {
      if (owned) debugger_.attach("1.3");
      await wait(60);
      const area = view.contentEl.getBoundingClientRect();
      const clip = { x: Math.max(0,area.left), y: Math.max(0,r.top-75), width: Math.min(area.width,innerWidth-Math.max(0,area.left)), height: 180, scale: 1 };
      const shot = await debugger_.sendCommand("Page.captureScreenshot", { format: "png", clip });
      fs.writeFileSync(path.join(config.output, `${mode}-page6.png`), Buffer.from(shot.data,"base64"));
    } finally { overlay.remove(); if (owned) debugger_.detach(); }
  };
  try {
    wc.setBackgroundThrottling(false);
    for (const filePath of [...new Set(boundaries.map(b => b.file))]) {
      const file = app.vault.getFileByPath(filePath), source = await app.vault.read(file);
      const targets = boundaries.filter(b => b.file === filePath);
      const exported = JSON.parse(fs.readFileSync(path.join(config.output, targets[0].case + "-marked.json"), "utf8"));
      if (source !== exported.source) throw new Error(`The source changed after PDF export: ${filePath}`);
      for (const mode of ["reading", "reading-narrow", "source", "live-preview"]) {
        await leaf.openFile(file);
        await leaf.setViewState({ type: "markdown", state: { file: filePath, mode: mode.startsWith("reading") ? "preview" : "source", source: mode === "source" } });
        await wait(400);
        const view = leaf.view;
        const inlineWidth = view.contentEl.style.getPropertyValue("--file-line-width");
        const inlineWidthPriority = view.contentEl.style.getPropertyPriority("--file-line-width");
        if (mode === "reading-narrow") {
          view.contentEl.style.setProperty("--file-line-width", "520px", "important");
          view.previewMode.onResize(); await wait(250);
        }
        for (const b of targets) {
          const token = b.token;
          const result = { case: b.case, page: b.page, mode, sectionType: b.block.type, text: token.text, sourceOffset: token.sourceOffset, sourceBoundaryCandidate: b.sourceBoundaryCandidate };
          if (!b.sourceBoundaryCandidate) {
            result.status = b.leadingUnmappedGlyphs || b.leadingUnmappedImages ? "page-start-is-uninstrumented-content" : "source-map-unresolved";
            report.results.push(result); continue;
          }
          result.sourceMatches = source.slice(token.sourceOffset, token.sourceOffset + token.text.length) === token.text;
          const prefix = source.slice(0, token.sourceOffset), line = prefix.split("\n").length - 1;
          result.sourceLine = line;
          result.sourceColumn = token.sourceOffset - (prefix.lastIndexOf("\n") + 1);
          if (mode.startsWith("reading")) {
            // Native scrolling uses source lines but only estimates position within long sections.
            const renderer = view.previewMode.renderer;
            for (let i = 0; i < 30; i++) {
              if (view.previewMode.renderer.applyScroll(line, { center: true })) break;
              await wait(50);
            }
            await wait(90);
            const section = renderer.sections.find(s => s.start?.offset === b.block.sourceStart && s.end?.offset === b.block.sourceEnd);
            if (!section) { result.status = "reading-section-missing"; report.results.push(result); continue; }
            const nodes = textNodes(section.el);
            const matches = nodes.filter(n => n.textContent === token.nodeText);
            let node = matches.length === 1 ? matches[0] : null, offset = token.textOffset;
            result.readingMatch = node ? "unique-text-node-within-source-section" : null;
            // Highlighting can split code into many identical text nodes. Its full literal body is mapped instead.
            if (!node && b.block.type === "code") {
              const code = section.el.querySelector("pre > code");
              const codeAt = code ? source.indexOf(code.textContent, b.block.sourceStart) : -1;
              if (codeAt >= b.block.sourceStart && codeAt < b.block.sourceEnd) {
                let target = token.sourceOffset - codeAt;
                for (const n of textNodes(code)) {
                  if (target < n.length) { node = n; offset = target; break; }
                  target -= n.length;
                }
                if (node) result.readingMatch = "literal-code-body-offset";
              }
            }
            // Simple Markdown fixture table: use its row/cell position, not a whole-note text search.
            if (!node && b.block.type === "table") {
              const local = source.slice(b.block.sourceStart, token.sourceOffset);
              const row = local.split("\n").length - 1;
              const linePrefix = local.slice(local.lastIndexOf("\n") + 1);
              const col = (linePrefix.match(/\|/g) ?? []).length - 1;
              const tr = section.el.querySelectorAll("tr")[row === 0 ? 0 : row - 1];
              const cell = tr?.children[col];
              const found = cell ? textNodes(cell).filter(n => n.textContent === token.nodeText) : [];
              if (found.length === 1) { node = found[0]; result.readingMatch = "simple-fixture-table-cell"; }
            }
            if (!node) { result.status = "reading-text-ambiguous-or-missing"; report.results.push(result); continue; }
            const range = node.ownerDocument.createRange();
            range.setStart(node, offset); range.setEnd(node, offset + token.text.length);
            result.readingTextMatches = range.toString() === token.text;
            let r = range.getBoundingClientRect();
            result.connected = node.isConnected;
            if (!node.isConnected || r.width === 0 || r.height === 0) {
              result.status = node.parentElement.closest(".is-collapsed") ? "hidden-by-fold" : "reading-coordinate-unavailable";
            } else {
              // Bring the exact token into view rather than treating source-line scroll as an exact mapping.
              const scroll = renderer.previewEl, visible = scroll.getBoundingClientRect();
              scroll.scrollTop += r.top - visible.top - visible.height / 2;
              await wait(30);
              r = range.getBoundingClientRect();
              result.rect = rect(r);
              result.blockWidth = section.el.getBoundingClientRect().width;
              result.horizontalOffsetPx = r.left - section.el.getBoundingClientRect().left;
              result.status = result.sourceMatches && result.readingTextMatches ? "mapped" : "text-mismatch";
            }
          } else {
            const editor = view.editor, cm = editor.cm;
            const pos = editor.offsetToPos(token.sourceOffset);
            editor.scrollIntoView({ from: pos, to: pos }, true);
            await wait(80);
            const r = cm.coordsAtPos(token.sourceOffset);
            result.rect = rect(r);
            result.documentMatches = cm.state.doc.sliceString(token.sourceOffset, token.sourceOffset + token.text.length) === token.text;
            const dom = cm.domAtPos(token.sourceOffset);
            result.dom = { nodeType: dom.node.nodeType, element: (dom.node.nodeType === 1 ? dom.node : dom.node.parentElement).className };
            if (dom.node.nodeType === 3 && dom.node.textContent.slice(dom.offset, dom.offset + token.text.length) === token.text) {
              const rr = document.createRange(); rr.setStart(dom.node, dom.offset); rr.setEnd(dom.node, dom.offset + token.text.length);
              const dr = rr.getBoundingClientRect();
              result.textRect = rect(dr);
              result.horizontalOffsetPx = dr.left - dom.node.parentElement.closest(".cm-line").getBoundingClientRect().left;
              result.roundTripOffset = cm.posAtCoords({ x: dr.left + Math.min(1, dr.width / 4), y: (dr.top + dr.bottom) / 2 });
              result.status = dr.height > 0 && result.sourceMatches && result.roundTripOffset === token.sourceOffset ? "mapped" : "coordinate-roundtrip-failed";
            } else {
              // coordsAtPos alone can silently return a rendered widget's edge, not the target text.
              result.status = r ? "widget-boundary-only" : "editor-coordinate-unavailable";
              const widget = [...cm.contentDOM.querySelectorAll(".cm-embed-block")].find(el => cm.posAtDOM(el,0) === b.block.sourceStart);
              if (widget) {
                let nodes = textNodes(widget).filter(n => n.textContent === token.nodeText);
                if (nodes.length !== 1 && b.block.type === "table") {
                  const local = source.slice(b.block.sourceStart, token.sourceOffset), row = local.split("\n").length - 1;
                  const col = (local.slice(local.lastIndexOf("\n") + 1).match(/\|/g) ?? []).length - 1;
                  const cell = widget.querySelectorAll("tr")[row === 0 ? 0 : row - 1]?.children[col];
                  nodes = cell ? textNodes(cell).filter(n => n.textContent === token.nodeText) : [];
                }
                if (nodes.length === 1) {
                  const n = nodes[0], rr = document.createRange();
                  rr.setStart(n, token.textOffset); rr.setEnd(n, token.textOffset + token.text.length);
                  let dr = rr.getBoundingClientRect();
                  result.widgetTextMatches = rr.toString() === token.text;
                  if (dr.width && dr.height) {
                    const scroll = cm.scrollDOM, visible = scroll.getBoundingClientRect();
                    scroll.scrollTop += dr.top - visible.top - visible.height / 2;
                    await wait(30); dr = rr.getBoundingClientRect();
                    result.textRect = rect(dr);
                    result.status = n.isConnected && dr.width > 0 && dr.height > 0 && result.sourceMatches && result.widgetTextMatches ? "mapped-widget-dom" : "widget-coordinate-unavailable";
                  } else if (n.parentElement.closest(".is-collapsed")) result.status = "hidden-by-fold";
                }
              }
            }
          }
          if (b.case === "claude-pages-a4" && b.page === 6 && result.status === "mapped") {
            await screenshot(view, result.textRect ?? result.rect, mode);
          }
          report.results.push(result);
          save();
        }
        if (mode === "reading-narrow") {
          if (inlineWidth) view.contentEl.style.setProperty("--file-line-width", inlineWidth, inlineWidthPriority);
          else view.contentEl.style.removeProperty("--file-line-width");
          view.previewMode.onResize();
        }
      }
    }
  } catch (e) { report.error = e.stack ?? String(e); }
  finally {
    leaf.detach(); if (previous?.parent) app.workspace.setActiveLeaf(previous, { focus: false });
    wc.setBackgroundThrottling(throttle);
    report.finished = true; save();
  }
}
