async function mermaidIntegration(app, context) {
  const { leaf, report, wait, save, build, options } = context;
  const fs = require("fs"), path = require("path");
  const doc = document, body = doc.body;
  const originalTheme = { dark: body.classList.contains("theme-dark"), light: body.classList.contains("theme-light") };
  const plugin = () => app.plugins.plugins["patches"];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const pass = label => { context.checkpoint(); report.checks.push(label); save(); };
  // Markdown views retain a hidden editor; inspect the active reading preview only.
  const preview = () => leaf.view.previewMode?.containerEl;
  const diagram = () => preview()?.querySelector(".obsidian-patch-mermaid");
  const svg = () => diagram()?.querySelector("svg");
  const rendered = labels => {
    const element = svg();
    if (!element?.isConnected || !labels.every(label => element.textContent.includes(label))) return false;
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  const until = async (condition, label) => {
    for (let i = 0; i < 200; i++) {
      context.checkpoint();
      const error = preview()?.querySelector(".obsidian-patch-mermaid--error");
      if (error) throw new Error(`${label}: ${error.textContent}`);
      if (await condition()) return;
      await wait(50);
    }
    const element = svg(), box = element?.getBoundingClientRect();
    throw new Error(`Timed out: ${label}; ${JSON.stringify({ file: leaf.view.file?.path, mode: leaf.view.getMode?.(), svg: element && { width: box.width, height: box.height, viewBox: element.getAttribute("viewBox") }, hidden: doc.hidden })}`);
  };
  const capture = async name => {
    const wc = require("electron").remote.getCurrentWebContents();
    const rect = leaf.view.contentEl.getBoundingClientRect();
    const x = Math.max(0, Math.floor(rect.left)), y = Math.max(0, Math.floor(rect.top));
    const width = Math.floor(Math.min(rect.right, window.innerWidth) - x);
    const height = Math.floor(Math.min(rect.bottom, window.innerHeight) - y);
    assert(width > 0 && height > 0, "The test tab is not visible for capture");
    const image = await wc.capturePage({ x, y, width, height });
    fs.writeFileSync(path.join(context.output, `${name}.png`), image.toPNG());
  };
  const cases = [
    {
      name: "Cynefin", labels: ["Incident Response", "Investigate root cause", "Restart service", "Unknown failure mode"],
      source: ["cynefin-beta", "  title Incident Response", "", "  complex", '    "Investigate root cause"', '    "Run chaos experiment"', "", "  complicated", '    "Analyze performance data"', '    "Expert review needed"', "", "  clear", '    "Restart service"', '    "Apply known fix"', "", "  chaotic", '    "Page on-call immediately"', "", "  confusion", '    "Unknown failure mode"'].join("\n"),
    },
    {
      name: "ELK", labels: ["Incident", "Check impact", "Apply known fix", "Escalate"],
      source: ["---", "config:", "  layout: elk", "---", "flowchart LR", '  A["Incident"] --> B["Check impact"]', '  B --> C["Apply known fix"]', '  B --> D["Escalate"]'].join("\n"),
    },
    {
      name: "TreeView", securityLevel: "loose", labels: ["incident-response", "triage.md", "responder.js", "styles", "web-store"],
      source: ["treeView-beta", "    incident-response/ icon(material-icon-theme:folder-project)", "        triage.md icon(material-icon-theme:markdown)", "        responder.js icon(logos:nodejs-icon)", "        styles/ icon(material-icon-theme:folder-css)", "        web-store icon(logos:chrome-web-store)"].join("\n"),
    },
  ];
  try {
    await plugin().setMermaidVersion("bundled");
    await plugin().setMermaidSecurityLevel("strict");
    let runtime = await plugin().mermaid.runtime();
    assert(runtime.origin === "bundled", "The test did not start with bundled Mermaid");
    report.mermaid = { build, bundledVersion: runtime.version, screenshots: [], knownLimitations: [] };
    pass(`${build}: bundled Mermaid ${runtime.version} loads in Obsidian`);

    if (build === "community") {
      for (const choice of ["latest", "12.1.0"]) {
        const legacy = { ...plugin().settings, mermaidVersion: choice, mermaidCachedLatest: "12.3.0" };
        await plugin().saveData(legacy);
        await app.plugins.disablePlugin("patches");
        await app.plugins.enablePlugin("patches");
        assert(plugin(), "Patches did not reload for legacy-setting verification");
        runtime = await plugin().mermaid.runtime();
        const persisted = await plugin().loadData();
        assert(plugin().settings.mermaidVersion === "bundled" && runtime.origin === "bundled", `Old ${choice} setting enabled remote Mermaid`);
        assert(persisted.mermaidVersion === "bundled" && !Object.hasOwn(persisted, "mermaidCachedLatest"), "Normalized Mermaid settings were not persisted");
        pass(`community: loading old ${choice} settings selects Bundled and removes the saved cache`);
        assert((await plugin().setMermaidVersion(choice)).origin === "bundled", "A direct version change bypassed the community loader");
        assert(plugin().settings.mermaidVersion === "bundled", "A direct version change persisted a remote choice");
        pass(`community: requesting ${choice} through the plugin still uses Bundled`);
      }
    } else if (!options.remote) {
      report.skipped.push("Live jsDelivr requests: Latest/Custom loading, cache and failure fallback are covered by runtime unit tests; this suite renders the bundled runtime in both builds.");
    }

    app.setting.open();
    app.setting.openTabById("patches");
    await until(() => app.setting.activeTab?.containerEl?.querySelector(".setting-item"), "Patches settings opened");
    const settings = app.setting.activeTab.containerEl;
    const setting = name => [...settings.querySelectorAll(".setting-item")].find(el => el.querySelector(".setting-item-name")?.textContent === name);
    const definitions = app.setting.activeTab.getSettingDefinitions();
    const groups = definitions.map(group => group.heading);
    assert(JSON.stringify(groups) === JSON.stringify([...groups].sort((a, b) => a.localeCompare(b, "en"))), "Settings groups lost their alphabetical order");
    const names = definitions.flatMap(group => group.items.map(item => item.name));
    for (const name of ["Mermaid version", "Mermaid security level", "Active line", "Heading levels", "Document outline", "Heading links"]) {
      assert(names.includes(name) && setting(name), `Searchable setting is missing: ${name}`);
    }
    pass(`${build}: native settings render searchable definitions in alphabetical groups`);
    const version = setting("Mermaid version");
    assert(version, "Mermaid version setting is missing");
    if (build === "community") {
      assert(!version.querySelector("select") && !setting("Custom Mermaid version"), "Community settings expose remote Mermaid choices");
      assert(version.textContent.includes(runtime.version), "The bundled version is not shown");
      pass("community: settings show the bundled version without Latest or Custom controls");
    } else {
      const dropdown = version.querySelector("select");
      assert(dropdown, "Full settings are missing the version dropdown");
      assert(JSON.stringify([...dropdown.options].map(option => option.value)) === JSON.stringify(["bundled", "latest", "custom"]), "Full settings have unexpected version choices");
      const custom = () => setting("Custom Mermaid version");
      const customVisible = () => !!custom()?.isConnected && !custom().hidden && getComputedStyle(custom()).display !== "none";
      assert(!customVisible(), "The custom version field is not hidden in Bundled mode");
      dropdown.value = "custom";
      dropdown.dispatchEvent(new Event("change", { bubbles: true }));
      await until(() => customVisible() && custom().querySelector("input"), "custom version field appears");
      assert(plugin().settings.mermaidVersion === "bundled", "An empty custom choice triggered a version change");
      dropdown.value = "bundled";
      dropdown.dispatchEvent(new Event("change", { bubbles: true }));
      await until(() => !customVisible(), "custom version field hides");
      pass("full: Bundled, Latest and Custom choices exist; the custom field opens without loading a version");
    }
    app.setting.close();

    for (const fixture of cases) {
      await plugin().setMermaidSecurityLevel(fixture.securityLevel ?? "strict");
      const notePath = `Patch Mermaid Tests/${fixture.name}.md`;
      const contents = [`# ${fixture.name}`, "", "```patch-mermaid", fixture.source, "```", ""].join("\n");
      const file = app.vault.getFileByPath(notePath);
      if (file) await app.vault.modify(file, contents);
      else await app.vault.create(notePath, contents);
      const originalRender = runtime.mermaid.render;
      let rawTreeView;
      if (fixture.name === "TreeView") {
        runtime.mermaid.render = async (...args) => {
          const result = await originalRender(...args);
          if (String(args[1]).trim() === fixture.source.trim()) rawTreeView = result.svg;
          return result;
        };
      }
      try {
        await leaf.setViewState({ type: "markdown", state: { file: notePath, mode: "preview", source: false } });
        app.workspace.setActiveLeaf(leaf, { focus: false });
        leaf.view.previewMode.applyScroll(0);
        // Obsidian can insert the SVG while its preview section is still awaiting layout.
        await until(() => rendered(fixture.labels), `${fixture.name} rendered with visible dimensions`);
      } finally {
        runtime.mermaid.render = originalRender;
      }
      assert(diagram().querySelectorAll(":scope > svg").length === 1, `${fixture.name} has duplicate diagrams`);
      const box = svg().getBoundingClientRect();
      assert(box.width > 0 && box.height > 0, `${fixture.name} SVG is empty`);
      pass(`${build}: ${fixture.name} renders its labels as one visible SVG in ${fixture.securityLevel ?? "strict"} mode`);
      assert(svg().querySelector("style"), `${fixture.name} lost its diagram styles`);
      if (fixture.name === "TreeView") {
        const icons = [...svg().querySelectorAll(".treeView-node-icon svg")];
        assert(icons.length === 5, "TreeView lost an icon container");
        assert(icons.slice(0, 3).every(icon => icon.querySelector("path[d]") && icon.getBoundingClientRect().width > 0 && icon.getBoundingClientRect().height > 0), "TreeView lost the visible vector shapes in its project, Markdown or Node.js icon");
        pass(`${build}: TreeView displays the project, Markdown and Node.js icons from both bundled packs`);
        assert(rawTreeView, "The original Mermaid output was not captured");
        const rawDocument = new DOMParser().parseFromString(rawTreeView, "image/svg+xml");
        const rawIcons = [...rawDocument.querySelectorAll(".treeView-node-icon svg")];
        assert(rawIcons.length === icons.length, "The raw Mermaid icon count differs from the inserted SVG");
        const geometry = icon => JSON.stringify([...icon.querySelectorAll("*")].map(element => ({
          tag: element.localName,
          attributes: [...element.attributes].filter(attribute => !attribute.name.startsWith("xmlns")).map(attribute => [attribute.name, attribute.value]).sort(([a], [b]) => a.localeCompare(b)),
        })));
        for (const index of [3, 4]) {
          assert(geometry(rawIcons[index]) === geometry(icons[index]), "Final sanitization changed the CSS folder or Chrome Web Store icon geometry supplied by Mermaid");
          assert(rawIcons[index].querySelectorAll("use").length === icons[index].querySelectorAll("use").length, "Final sanitization changed an icon's local reference count");
        }
        const upstreamReferences = rawIcons.slice(3).reduce((count, icon) => count + icon.querySelectorAll("use").length, 0);
        if (upstreamReferences < 3) {
          report.mermaid.knownLimitations.push(`Bundled Mermaid ${runtime.version} already returns ${upstreamReferences} of the three SVG use references in the CSS folder and Chrome Web Store icons. Its internal icon sanitizer removes these references before the Patches insertion boundary, so these two icons are incomplete upstream; this check verifies no additional loss during final sanitization.`);
        }
        pass(`${build}: final sanitization preserves the two reference-based icons exactly as returned by Mermaid; upstream limitations are recorded separately`);
      }

      // Always finish with the original appearance. No persisted app theme setting is changed.
      for (const theme of originalTheme.dark ? ["light", "dark"] : ["dark", "light"]) {
        const previous = svg();
        body.classList.toggle("theme-dark", theme === "dark");
        body.classList.toggle("theme-light", theme === "light");
        app.workspace.trigger("css-change");
        await until(async () => {
          const loaded = await plugin().mermaid.runtime();
          return rendered(fixture.labels) && svg() !== previous
            && loaded.mermaid.mermaidAPI.getConfig().theme === (theme === "dark" ? "dark" : "default");
        }, `${fixture.name} follows the ${theme} theme`);
        pass(`${build}: ${fixture.name} re-renders in the ${theme} theme`);
        const name = `${fixture.name.toLowerCase()}-${theme}`;
        await capture(name);
        report.mermaid.screenshots.push(`${name}.png`);
      }
      assert(await app.vault.read(app.vault.getFileByPath(notePath)) === contents, `${fixture.name} rendering changed the note source`);
      pass(`${build}: ${fixture.name} leaves its note source unchanged`);
    }

    // Real Mermaid installs its click handlers after the sanitized SVG is inserted.
    const callbackName = "__patchesMermaidCallbackProbe";
    const originalCallback = window[callbackName];
    try {
      let callbacks = 0;
      window[callbackName] = () => { callbacks++; };
      await plugin().setMermaidSecurityLevel("loose");
      const notePath = "Patch Mermaid Tests/Interactions.md";
      const contents = ["```patch-mermaid", "flowchart LR", '  A["Run callback"] --> B["Web link"] --> C["Note link"]', `  click A ${callbackName} "Run probe"`, '  click B "https://example.com/patches" "Web"', '  click C "obsidian://open?vault=example" "Note"', "```", ""].join("\n");
      const file = app.vault.getFileByPath(notePath);
      if (file) await app.vault.modify(file, contents);
      else await app.vault.create(notePath, contents);
      await leaf.setViewState({ type: "markdown", state: { file: notePath, mode: "preview", source: false } });
      await until(() => rendered(["Run callback", "Web link", "Note link"]), "interactive Mermaid renders");
      const hrefs = [...svg().querySelectorAll("a")].map(element => element.getAttribute("href") ?? element.getAttributeNS("http://www.w3.org/1999/xlink", "href"));
      assert(hrefs.includes("https://example.com/patches") && hrefs.includes("obsidian://open?vault=example"), "Sanitization removed a safe web or Obsidian link");
      pass(`${build}: Loose Mermaid preserves HTTPS and Obsidian links without navigating`);
      const callbackNode = [...svg().querySelectorAll("g.node")].find(node => node.textContent.trim() === "Run callback");
      assert(callbackNode, "The callback node is missing");
      callbackNode.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      assert(callbacks === 1, "Mermaid's callback did not bind to the sanitized node");
      pass(`${build}: a real Loose Mermaid click callback runs once after sanitization`);
      assert(await app.vault.read(app.vault.getFileByPath(notePath)) === contents, "Interactions changed the note source");
    } finally {
      if (originalCallback === undefined) delete window[callbackName];
      else window[callbackName] = originalCallback;
    }

    // Exercise the production insertion path with hostile output, without
    // storing that markup in a note or relying on Mermaid to sanitize it first.
    const originalRender = runtime.mermaid.render;
    const marker = "__patchesMermaidSanitizerExecuted";
    const originalMarker = window[marker];
    try {
      window[marker] = false;
      runtime.mermaid.render = async () => ({ svg: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="100" onload="window.${marker}=true"><style>.audit-label{fill:rgb(12,34,56)}</style><script>window.${marker}=true</script><defs><path id="audit-shape" d="M0 0L10 10"/><g id="audit-cycle"><use href="#audit-cycle"/></g></defs><use href="#audit-shape"/><use href="https://example.invalid/icon.svg#shape"/><use href="data:image/svg+xml,test"/><use href="#audit-missing"/><use href="#audit-cycle"/><use href="javascript:window.${marker}=true"/><animate attributeName="href" values="javascript:window.${marker}=true"/><set attributeName="href" to="javascript:window.${marker}=true"/><text class="audit-label" y="20">Sanitizer probe</text><a href="javascript:window.${marker}=true"><text y="40">Unsafe link</text></a><foreignObject y="50" width="300" height="40"><div xmlns="http://www.w3.org/1999/xhtml"><img src="data:," onerror="window.${marker}=true"/><span>Safe HTML label</span><script>window.${marker}=true</script></div></foreignObject></svg>` });
      for (const mode of ["strict", "loose"]) {
        await plugin().setMermaidSecurityLevel(mode);
        const notePath = `Patch Mermaid Tests/Sanitizer ${mode}.md`;
        const contents = "```patch-mermaid\nflowchart LR\nA --> B\n```\n";
        const file = app.vault.getFileByPath(notePath);
        if (file) await app.vault.modify(file, contents);
        else await app.vault.create(notePath, contents);
        await leaf.setViewState({ type: "markdown", state: { file: notePath, mode: "preview", source: false } });
        await until(() => rendered(["Sanitizer probe", "Safe HTML label"]), "sanitized diagram output appears");
        const root = svg();
        assert(!root.querySelector("script,iframe,object,animate,set"), "Executable SVG, HTML nodes or SVG attribute animations survived sanitization");
        const uses = [...root.querySelectorAll("use")];
        assert(uses.length === 1 && uses[0].getAttribute("href") === "#audit-shape", "Local SVG reference filtering retained an unsafe, missing or cyclic target, or lost a safe shape");
        for (const element of [root, ...root.querySelectorAll("*")]) {
          for (const attribute of element.attributes) {
            assert(!/^on/i.test(attribute.name), `Event handler survived: ${attribute.name}`);
            assert(!/^javascript:/i.test(attribute.value.trim()), `Executable URL survived: ${attribute.name}`);
          }
        }
        assert(root.querySelector("style") && root.querySelector("foreignObject span"), "Sanitization removed required diagram styles or labels");
        await wait(50);
        assert(window[marker] === false, "Hostile diagram output executed code");
        pass(`${build}: ${mode} output strips scripts, handlers, executable URLs and unsafe SVG references while retaining styles, HTML labels and local shapes`);
      }
    } finally {
      runtime.mermaid.render = originalRender;
      if (originalMarker === undefined) delete window[marker];
      else window[marker] = originalMarker;
    }

    if (build === "full" && options.remote) {
      const remote = await plugin().setMermaidVersion(runtime.version);
      assert(remote?.origin === "cdn", `Full remote import failed: ${remote?.fallbackReason}`);
      pass(`full: native dynamic import loads Mermaid ${remote.version} from jsDelivr without Function construction`);
      const notePath = "Patch Mermaid Tests/Remote Mermaid.md";
      const contents = "```patch-mermaid\n---\nconfig:\n  layout: elk\n---\nflowchart LR\nA[\"Remote source\"] --> B[\"Remote target\"]\n```\n";
      const file = app.vault.getFileByPath(notePath);
      if (file) await app.vault.modify(file, contents);
      else await app.vault.create(notePath, contents);
      await leaf.setViewState({ type: "markdown", state: { file: notePath, mode: "preview", source: false } });
      await until(() => rendered(["Remote source", "Remote target"]), "remote Mermaid renders the fixture");
      pass("full: remote Mermaid and ELK render a visible sanitized diagram");
      await plugin().setMermaidVersion("bundled");
    }
  } catch (error) {
    report.error = error.stack ?? String(error);
    throw error;
  } finally {
    app.setting.close();
    const changed = body.classList.contains("theme-dark") !== originalTheme.dark || body.classList.contains("theme-light") !== originalTheme.light;
    const previous = svg();
    body.classList.toggle("theme-dark", originalTheme.dark);
    body.classList.toggle("theme-light", originalTheme.light);
    if (changed) {
      app.workspace.trigger("css-change");
      // Cleanup remains bounded and continues even when the suite's cancellable wait was aborted.
      for (let i = 0; i < 200 && plugin()?.mermaid; i++) {
        const loaded = await plugin().mermaid.runtime();
        const restored = loaded.mermaid.mermaidAPI.getConfig().theme === (originalTheme.dark ? "dark" : "default");
        if (restored && (!previous || (svg() && svg() !== previous))) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    report.themeRestored = body.classList.contains("theme-dark") === originalTheme.dark && body.classList.contains("theme-light") === originalTheme.light;
    assert(report.themeRestored, "The original theme classes were not restored");
  }
}
