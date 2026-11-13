async function iconsIntegration(app, context) {
  const { report, wait, save, leaf } = context;
  const fs = require("fs"), path = require("path");
  const plugin = () => app.plugins.plugins.patches;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const pass = label => { context.checkpoint(); report.checks.push(label); save(); };
  const until = async (condition, label) => {
    for (let i = 0; i < 160; i++) {
      context.checkpoint();
      if (await condition()) return;
      await wait(50);
    }
    throw new Error(`Timed out: ${label}`);
  };
  const rootPath = `Patch Icons Tests/Run-${context.runId}`;
  let projectPath = `${rootPath}/Release planning`;
  let notePath = `${projectPath}/Launch checklist.md`;
  const cachedPath = `${rootPath}/Reference links.md`;
  const simpleId = "simple-icons:test-brand";
  const cachedSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3zM7 7v10h10V7z"/></svg>';
  const selector = ".nav-file-title[data-path],.nav-folder-title[data-path]";
  const iconClass = "obsidian-patch-icons-has-icon", iconProperty = "--obsidian-patch-icon";
  const explorers = () => app.workspace.getLeavesOfType("file-explorer");
  const existing = explorers();
  assert(existing.length > 0, "Open the development vault's file explorer before testing icons");
  const main = existing.find(item => item.view.containerEl.ownerDocument === document) ?? existing[0];
  const sidebarCollapsed = app.workspace.leftSplit.collapsed;
  const originalFolders = Object.values(main.view.fileItems).filter(item => item.collapsible)
    .map(item => [item.file.path, item.collapsed]);
  const originalScroll = main.view.navFileContainerEl.scrollTop;
  const originalActiveLeaf = main.parent?.getActiveLeaf?.();
  const capturedErrors = [];
  const observedWindows = new Set();
  const observeErrors = win => {
    if (observedWindows.has(win)) return;
    observedWindows.add(win);
    win.addEventListener("error", onError);
    win.addEventListener("unhandledrejection", onRejection);
  };
  const onError = event => capturedErrors.push(event.error?.stack ?? event.message);
  const onRejection = event => capturedErrors.push(String(event.reason?.stack ?? event.reason));
  let popout, probe, detachedProbe, popoutRow;
  const row = (view, filePath) => [...view.containerEl.querySelectorAll(selector)]
    .find(element => element.getAttribute("data-path") === filePath);
  const decorated = element => !!element?.classList.contains(iconClass) && !!element.style.getPropertyValue(iconProperty);
  const undecorated = element => !!element && !element.classList.contains(iconClass) && !element.style.getPropertyValue(iconProperty);
  const painted = (view, filePath) => {
    const title = row(view, filePath), inner = title?.querySelector(":scope > .tree-item-inner");
    if (!decorated(title) || !inner) return false;
    const css = inner.ownerDocument.defaultView.getComputedStyle(inner, "::before");
    const image = css.maskImage || css.webkitMaskImage;
    return image.includes("data:image/svg+xml,") && Number.parseFloat(css.width) > 0 && Number.parseFloat(css.height) > 0 && css.content !== "none";
  };
  const reveal = async (view, filePath) => {
    const file = app.vault.getAbstractFileByPath(filePath);
    assert(file, `Fixture missing: ${filePath}`);
    await view.revealInFolder(file);
    await until(() => row(view, filePath)?.isConnected, `explorer row for ${filePath}`);
  };
  const reload = async () => {
    await app.plugins.disablePlugin("patches");
    await app.plugins.enablePlugin("patches");
    assert(plugin(), "Patches did not reload");
  };
  const screenshot = async name => {
    const wc = require("electron").remote.getCurrentWebContents();
    const image = await wc.capturePage();
    fs.writeFileSync(path.join(context.output, name), image.toPNG());
    report.icons.screenshots.push(name);
  };
  report.icons = { build: context.build, fixture: rootPath, screenshots: [], errors: capturedErrors, cleanup: {} };
  observeErrors(window);
  try {
    await until(() => app.vault.getAbstractFileByPath("Patch Icons Tests"), "test parent folder registered");
    assert(!app.vault.getAbstractFileByPath(rootPath), "Refusing to reuse an existing fixture folder");
    await app.vault.createFolder(rootPath);
    await app.vault.createFolder(projectPath);
    await app.vault.create(notePath, "# Launch checklist\n\n- Review release notes\n- Check installation files\n- Publish after review\n");
    await app.vault.create(cachedPath, "# Reference links\n\nKeep the release guide and review checklist together.\n");
    await leaf.openFile(app.vault.getAbstractFileByPath(notePath));
    await plugin().saveData({ ...plugin().settings, icons: {
      enabled: true, paths: { [projectPath]: "lucide:folder", [notePath]: "lucide:book-open", [cachedPath]: simpleId },
      svgs: { [simpleId]: cachedSvg },
    } });
    await reload();
    app.workspace.leftSplit.expand();
    await app.workspace.revealLeaf(main);
    await reveal(main.view, notePath);
    await reveal(main.view, cachedPath);
    await until(() => [projectPath, notePath, cachedPath].every(filePath => painted(main.view, filePath)), "computed icon masks");
    const simpleImage = row(main.view, cachedPath).style.getPropertyValue(iconProperty);
    assert(simpleImage.includes(encodeURIComponent(cachedSvg)), "Cached Simple Icons SVG was not used");
    assert(decodeURIComponent(row(main.view, notePath).style.getPropertyValue(iconProperty)).includes("lucide-book-open"), "The Lucide book icon was not used");
    assert(plugin().icons.simpleIconsStatus().status === "idle", "Cached icon coverage unexpectedly loaded the network");
    assert(!document.getElementById("obsidian-patch-icons"), "Icons recreated a dynamic stylesheet");
    pass("Lucide and cached Simple Icons render actual ::before masks without a dynamic stylesheet or network request");
    await screenshot("icons-main.png");

    await plugin().icons.setEnabled(false);
    await until(() => [projectPath, notePath, cachedPath].every(filePath => undecorated(row(main.view, filePath))), "disabled icons clear");
    pass("Disabling icons clears every rendered fixture row");
    await plugin().icons.setEnabled(true);
    await until(() => [projectPath, notePath, cachedPath].every(filePath => painted(main.view, filePath)), "enabled icons return");
    pass("Re-enabling icons restores file and folder masks");

    const oldProject = projectPath, oldNote = notePath;
    projectPath = `${rootPath}/Publication planning`;
    notePath = `${projectPath}/Launch checklist.md`;
    await app.fileManager.renameFile(app.vault.getAbstractFileByPath(oldProject), projectPath);
    await reveal(main.view, notePath);
    await until(() => painted(main.view, projectPath) && painted(main.view, notePath), "renamed folder and descendant icons");
    assert(!Object.hasOwn(plugin().settings.icons.paths, oldProject) && !Object.hasOwn(plugin().settings.icons.paths, oldNote), "Old icon paths survived the folder rename");
    assert(plugin().settings.icons.paths[notePath] === "lucide:book-open", "Nested icon path did not follow its folder");
    pass("A native folder rename preserves folder and nested file icons and removes the old paths");

    const folderItem = main.view.fileItems[projectPath];
    folderItem.setCollapsed(true);
    await until(() => folderItem.collapsed, "fixture folder collapses");
    const lazyPath = `${projectPath}/Post-release follow-up.md`;
    await app.vault.create(lazyPath, "# Post-release follow-up\n\nCollect feedback after publication.\n");
    await plugin().saveData({ ...plugin().settings, icons: { ...plugin().settings.icons,
      paths: { ...plugin().settings.icons.paths, [lazyPath]: "lucide:check" } } });
    await reload();
    main.view.fileItems[projectPath].setCollapsed(false);
    await reveal(main.view, lazyPath);
    await until(() => painted(main.view, lazyPath) && painted(main.view, notePath), "lazy child rows after expansion");
    pass("A note created while its folder is collapsed receives its icon when the folder expands");

    probe = row(main.view, notePath).cloneNode(true);
    probe.classList.remove(iconClass);
    probe.style.removeProperty(iconProperty);
    probe.setAttribute("data-path", cachedPath);
    main.view.navFileContainerEl.append(probe);
    await until(() => decorated(probe) && probe.style.getPropertyValue(iconProperty) === simpleImage, "new explorer row receives icon");
    probe.setAttribute("data-path", `${rootPath}/No icon.md`);
    await until(() => undecorated(probe), "recycled row clears previous icon");
    probe.setAttribute("data-path", notePath);
    await until(() => decorated(probe), "recycled row receives new path icon");
    detachedProbe = probe;
    probe.remove();
    probe = undefined;
    await until(() => undecorated(detachedProbe), "detached row clears decoration");
    pass("New, reused and detached explorer DOM rows reconcile without stale icon decorations");

    await plugin().icons.removeIcons([cachedPath]);
    await until(() => undecorated(row(main.view, cachedPath)), "removed icon clears");
    assert(!Object.hasOwn(plugin().settings.icons.paths, cachedPath), "Removed icon remains in saved settings");
    pass("Removing a cached icon clears its row and saved path");

    assert(typeof app.workspace.openPopoutLeaf === "function", "Desktop popout API is unavailable");
    popout = app.workspace.openPopoutLeaf({ size: { width: 700, height: 700 } });
    await popout.setViewState({ type: "file-explorer", active: true });
    await until(() => popout.view.getViewType() === "file-explorer" && popout.view.containerEl.ownerDocument !== document, "native file explorer popout");
    const popoutWindow = popout.view.containerEl.ownerDocument.defaultView;
    observeErrors(popoutWindow);
    await reveal(popout.view, notePath);
    await until(() => painted(popout.view, projectPath) && painted(popout.view, notePath), "popout computed icon masks");
    popoutRow = row(popout.view, notePath);
    assert(popoutRow.ownerDocument === popoutWindow.document, "Popout row has the wrong owner document");
    pass("A second native file explorer in a popout paints icons in its own document");

    await app.plugins.disablePlugin("patches");
    await until(() => undecorated(row(main.view, notePath)) && undecorated(popoutRow), "unload clears both windows");
    popoutRow.setAttribute("data-path", lazyPath);
    await wait(150);
    assert(undecorated(popoutRow), "An observer continued decorating rows after plugin unload");
    popoutRow.setAttribute("data-path", notePath);
    pass("Plugin unload clears both windows and disconnected observers do not repaint changed rows");
    await app.plugins.enablePlugin("patches");
    await until(() => painted(main.view, notePath) && painted(popout.view, notePath), "reload reconnects both windows");
    pass("Plugin reload restores icons in both existing explorer windows");

    const closingRow = popoutRow;
    popout.detach();
    popout = undefined;
    await until(() => undecorated(closingRow), "closed popout decoration cleanup");
    assert(painted(main.view, notePath), "Closing the popout removed the main explorer icon");
    pass("Closing the test popout clears its rows while the main explorer remains decorated");
    assert(capturedErrors.length === 0, `Native errors occurred: ${capturedErrors.join("; ")}`);
    pass("The native icon lifecycle run reports no window errors or unhandled rejections");
    report.skipped.push("Other desktop platforms, mobile platforms and other themes were not exercised.");
    report.skipped.push("Live Simple Icons downloads and the native context-menu picker were not exercised; this suite uses persisted cached icon settings.");
  } finally {
    const clean = async (name, fn) => {
      try { await fn(); report.icons.cleanup[name] = true; }
      catch (error) { report.icons.cleanup[name] = String(error.stack ?? error); report.error ??= `Icons cleanup failed: ${name}`; }
    };
    await clean("probeRows", () => { probe?.remove(); detachedProbe?.remove(); });
    await clean("popout", () => { popout?.detach(); });
    await clean("fixture", async () => {
      if (leaf.view.file?.path.startsWith(rootPath + "/")) await leaf.setViewState({ type: "empty" });
      const folder = app.vault.getAbstractFileByPath(rootPath);
      if (folder) await app.vault.delete(folder, true);
      assert(!app.vault.getAbstractFileByPath(rootPath), "The unique fixture folder still exists");
    });
    await clean("explorerState", () => {
      for (const [filePath, collapsed] of originalFolders) main.view.fileItems[filePath]?.setCollapsed(collapsed);
      main.view.navFileContainerEl.scrollTop = originalScroll;
      if (sidebarCollapsed) app.workspace.leftSplit.collapse();
      else app.workspace.leftSplit.expand();
      if (originalActiveLeaf?.parent) app.workspace.setActiveLeaf(originalActiveLeaf, { focus: false });
    });
    for (const win of observedWindows) {
      win.removeEventListener("error", onError);
      win.removeEventListener("unhandledrejection", onRejection);
    }
    save();
  }
}
