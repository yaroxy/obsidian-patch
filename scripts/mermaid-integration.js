async function mermaidIntegration(app, context) {
  const { leaf, report, wait, save, build } = context;
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
  ];
  try {
    await plugin().setMermaidVersion("bundled");
    await plugin().setMermaidSecurityLevel("strict");
    let runtime = await plugin().mermaid.runtime();
    assert(runtime.origin === "bundled", "The test did not start with bundled Mermaid");
    report.mermaid = { build, bundledVersion: runtime.version, screenshots: [] };
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
    } else {
      report.skipped.push("Live jsDelivr requests: Latest/Custom loading, cache and failure fallback are covered by runtime unit tests; this suite renders the bundled runtime in both builds.");
    }

    app.setting.open();
    app.setting.openTabById("patches");
    await until(() => app.setting.activeTab?.containerEl?.querySelector(".setting-item"), "Patches settings opened");
    const settings = app.setting.activeTab.containerEl;
    const setting = name => [...settings.querySelectorAll(".setting-item")].find(el => el.querySelector(".setting-item-name")?.textContent === name);
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
      const custom = setting("Custom Mermaid version");
      assert(custom?.hidden, "The custom version field is not hidden in Bundled mode");
      dropdown.value = "custom";
      dropdown.dispatchEvent(new Event("change", { bubbles: true }));
      await until(() => !custom.hidden && custom.querySelector("input"), "custom version field appears");
      assert(plugin().settings.mermaidVersion === "bundled", "An empty custom choice triggered a version change");
      dropdown.value = "bundled";
      dropdown.dispatchEvent(new Event("change", { bubbles: true }));
      await until(() => custom.hidden, "custom version field hides");
      pass("full: Bundled, Latest and Custom choices exist; the custom field opens without loading a version");
    }
    app.setting.close();

    for (const fixture of cases) {
      const notePath = `Patch Mermaid Tests/${fixture.name}.md`;
      const contents = [`# ${fixture.name}`, "", "```patch-mermaid", fixture.source, "```", ""].join("\n");
      const file = app.vault.getFileByPath(notePath);
      if (file) await app.vault.modify(file, contents);
      else await app.vault.create(notePath, contents);
      await leaf.setViewState({ type: "markdown", state: { file: notePath, mode: "preview", source: false } });
      app.workspace.setActiveLeaf(leaf, { focus: false });
      leaf.view.previewMode.applyScroll(0);
      // Obsidian can insert the SVG while its preview section is still awaiting layout.
      await until(() => rendered(fixture.labels), `${fixture.name} rendered with visible dimensions`);
      assert(diagram().querySelectorAll("svg").length === 1, `${fixture.name} has duplicate diagrams`);
      const box = svg().getBoundingClientRect();
      assert(box.width > 0 && box.height > 0, `${fixture.name} SVG is empty`);
      pass(`${build}: ${fixture.name} renders its labels as one visible SVG in Strict mode`);

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
