// PROTOTYPE: evaluated inside Obsidian. Nothing is installed into the plugin.
async function exportExperiment(app, config) {
  const fs = require("fs");
  const path = require("path");
  const wc = require("electron").remote.getCurrentWebContents();
  const oldThrottle = wc.getBackgroundThrottling();
  const previousLeaf = app.workspace.getMostRecentLeaf();
  const leaf = app.workspace.getLeaf("tab");
  const status = { runId: config.runId, done: 0, finished: false, jobs: [] };
  const save = () => fs.writeFileSync(path.join(config.output, "export-status.json"), JSON.stringify(status, null, 2));
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const box = r => ({ x: r.x, y: r.y, width: r.width, height: r.height });
  try {
    if (app.vault.adapter.getBasePath() !== config.vault) throw new Error("The CLI selected a different vault from the fixture destination.");
    wc.setBackgroundThrottling(false);
    save();
    for (const job of config.jobs) {
      const started = performance.now();
      let file;
      for (let i = 0; i < 40 && !file; i++) { file = app.vault.getFileByPath(job.file); if (!file) await wait(100); }
      if (!file) throw new Error(`Fixture not indexed: ${job.file}`);
      await leaf.openFile(file, { state: { mode: "preview" } });
      const source = await app.vault.read(file);
      const sections = app.metadataCache.getFileCache(file).sections;
      let cls = app.setting.constructor, Modal;
      while (cls?.prototype) {
        if (Object.prototype.hasOwnProperty.call(cls.prototype, "open")) Modal = cls;
        cls = Object.getPrototypeOf(cls);
      }
      let modal;
      const open = Modal.prototype.open;
      Modal.prototype.open = function () { modal = this; };
      try { leaf.view.printToPdf(); } finally { Modal.prototype.open = open; }
      if (!modal) throw new Error("Could not capture native PDF export modal.");
      const stem = `${file.basename.replaceAll(" ", "-").toLowerCase()}-${job.profile.name}`;
      const name = stem + (job.instrument ? "-marked" : "-plain");
      const meta = {
        name, file: job.file, profile: job.profile, instrument: job.instrument,
        environment: { electron: process.versions.electron, chrome: process.versions.chrome },
        source, sections, blocks: [], tokens: [],
      };
      const originalPrint = modal.print;
      modal.print = async function (...args) {
        const el = await originalPrint.apply(this, args);
        const doc = el.ownerDocument;
        await doc.fonts.ready;
        await Promise.all([...el.querySelectorAll("img")].map(img => img.decode().catch(() => {})));
        const heads = [...el.querySelectorAll("h1,h2,h3,h4,h5,h6")];
        heads.forEach((h, i) => h.id = `pdf-heading-${i}`);
        for (const a of el.querySelectorAll("a.internal-link[data-href]")) {
          const target = a.getAttribute("data-href");
          const hash = target.indexOf("#");
          const note = target.slice(0, hash);
          if (hash < 0 || (note && note !== file.basename)) continue;
          const heading = heads.find(h => h.getAttribute("data-heading") === target.slice(hash + 1));
          if (heading) a.setAttribute("href", `#${heading.id}`);
        }
        const blocks = [...el.children].slice(1); // includeName adds one H1 before source sections.
        meta.sectionCounts = { dom: blocks.length, metadata: sections.length };
        if (blocks.length !== sections.length) throw new Error(`Section correspondence failed: ${JSON.stringify(meta.sectionCounts)}`);
        for (let bi = 0; bi < blocks.length; bi++) {
          const block = blocks[bi], section = sections[bi];
          const slice = source.slice(section.position.start.offset, section.position.end.offset);
          const blockReport = { index: bi, type: section.type, tag: block.firstElementChild?.tagName ?? block.tagName, sourceStart: section.position.start.offset, sourceEnd: section.position.end.offset, rect: box(block.getBoundingClientRect()), text: block.textContent, skipped: [] };
          meta.blocks.push(blockReport);
          if (!job.instrument || section.type === "yaml") continue;
          const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
          const nodes = [];
          while (walker.nextNode()) nodes.push(walker.currentNode);
          let ni = 0;
          for (const node of nodes) {
            const text = node.textContent;
            const nodeIndex = ni++;
            if (!text.trim()) continue;
            if (node.parentElement.closest("a,button,svg,mjx-container,.math,.copy-code-button,.callout-title,.frontmatter")) {
              blockReport.skipped.push({ reason: "rendered-widget-or-existing-link", text: text.slice(0, 60) }); continue;
            }
            const at = slice.indexOf(text);
            const unique = at >= 0 && slice.indexOf(text, at + 1) < 0;
            let sourceBase = unique ? section.position.start.offset + at : null;
            let sourceMapping = unique ? "unique-literal-in-section" : "unresolved";
            let sourcePositions = null;
            if (sourceBase === null && section.type === "callout") {
              let normalized = "", positions = [], offset = section.position.start.offset;
              for (const line of slice.split("\n")) {
                const prefix = line.match(/^\s*> ?/)?.[0].length ?? 0;
                for (let i = prefix; i < line.length; i++) { normalized += line[i]; positions.push(offset + i); }
                normalized += "\n"; positions.push(offset + line.length); offset += line.length + 1;
              }
              const found = normalized.indexOf(text);
              if (found >= 0 && normalized.indexOf(text, found + 1) < 0) {
                sourcePositions = positions.slice(found, found + text.length);
                sourceMapping = "single-quote-prefix-fixture-map";
              }
            }
            const code = node.parentElement.closest("pre > code");
            if (section.type === "code" && code) {
              const codeAt = slice.indexOf(code.textContent);
              if (codeAt >= 0) {
                const before = doc.createRange(); before.selectNodeContents(code); before.setEnd(node, 0);
                sourceBase = section.position.start.offset + codeAt + before.toString().length;
                sourceMapping = "literal-code-block-plus-dom-text-offset";
              }
            }
            const cell = node.parentElement.closest("td,th");
            if (section.type === "table" && cell && !slice.includes("\\|")) {
              const rows = slice.split("\n"), rowIndex = cell.parentElement.rowIndex;
              const lineIndex = rowIndex === 0 ? 0 : rowIndex + 1;
              const line = rows[lineIndex] ?? "";
              const parts = line.split("|"), column = cell.cellIndex + (line.trimStart().startsWith("|") ? 1 : 0);
              const cellSource = parts[column] ?? "";
              const offset = cellSource.indexOf(text);
              if (offset >= 0 && cellSource.indexOf(text, offset + 1) < 0) {
                sourceBase = section.position.start.offset + rows.slice(0, lineIndex).reduce((n, s) => n + s.length + 1, 0) + parts.slice(0, column).reduce((n, s) => n + s.length + 1, 0) + offset;
                sourceMapping = "simple-fixture-table-cell";
              }
            }
            const frag = doc.createDocumentFragment();
            let end = 0;
            // Keep each English word intact; CJK characters permit character-level pagination.
            for (const match of text.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}_]+|[^\s]/gu)) {
              frag.append(text.slice(end, match.index));
              const a = doc.createElement("a");
              const id = meta.tokens.length;
              a.href = `https://pdf-probe.invalid/token/${id}`;
              a.style.cssText = "color:inherit!important;text-decoration:none!important;cursor:inherit!important;background:none!important;border:0!important;padding:0!important;margin:0!important;font:inherit!important;";
              a.textContent = match[0];
              frag.append(a);
              const range = doc.createRange();
              range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
              meta.tokens.push({ id, block: bi, nodeIndex, nodeText: text, textOffset: match.index, text: match[0], textLength: match[0].length, sourceOffset: sourcePositions ? sourcePositions[match.index] : sourceBase === null ? null : sourceBase + match.index, sourceMapping, tableHeader: !!node.parentElement.closest("thead"), rect: box(range.getBoundingClientRect()) });
              end = match.index + match[0].length;
            }
            frag.append(text.slice(end));
            node.replaceWith(frag);
          }
        }
        meta.render = { width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, font: doc.defaultView.getComputedStyle(el).font, sameWindow: doc.defaultView === window };
        return el;
      };
      const pdf = path.join(config.output, name + ".pdf");
      try {
        await modal.printToPdfDesktop({ ...job.profile, includeName: true, scaleFactor: job.profile.scale * 100, generateDocumentOutline: true, generateTaggedPDF: true, open: false, filepath: pdf });
      } finally { delete modal.print; }
      if (!fs.existsSync(pdf)) throw new Error(`Export failed: ${pdf}`);
      meta.elapsedMs = Math.round(performance.now() - started);
      meta.pdfBytes = fs.statSync(pdf).size;
      fs.writeFileSync(path.join(config.output, name + ".json"), JSON.stringify(meta));
      status.jobs.push({ name, elapsedMs: meta.elapsedMs, pdfBytes: meta.pdfBytes, tokens: meta.tokens.length });
      status.done++;
      save();
    }
  } catch (e) { status.error = e.stack ?? String(e); }
  finally {
    leaf.detach();
    if (previousLeaf?.parent) app.workspace.setActiveLeaf(previousLeaf, { focus: false });
    wc.setBackgroundThrottling(oldThrottle);
    status.finished = true;
    save();
  }
}
