(async (app, context) => {
  const { leaf, wait, report } = context;
  const checks = report.checks;
  const plugin = () => app.plugins.plugins["obsidian-patch"];
  app.setting.close();
  const doc = leaf.view.contentEl.ownerDocument;
  const assert = (value, message) => { if (!value) throw new Error(message); };
  async function until(check, label) {
    for (let i = 0; i < 100; i++) {
      if (check()) { checks.push(label); return; }
      await wait(50);
    }
    throw new Error(`Timed out: ${label}`);
  }
  const root = () => leaf.view.getMode() === "preview" ? leaf.view.previewMode.containerEl : leaf.view.contentEl.querySelector(".markdown-source-view");
  async function write(name, link, body = "# Banner test\n\nFull image, original aspect ratio.") {
    const path = `Patch Banner Tests/${name}.md`;
    const text = (link ? `---\npatch-banner: ${JSON.stringify(`[[${link}]]`)}\n---\n\n` : "") + body + "\n";
    const file = app.vault.getFileByPath(path);
    if (file) await app.vault.modify(file, text);
    else await app.vault.create(path, text);
    return path;
  }
  async function open(path, mode = "source") {
    await leaf.setViewState({ type: "markdown", state: { file: path, mode, source: false } });
    app.workspace.setActiveLeaf(leaf, { focus: false });
    leaf.view.editor.scrollTo(0, 0);
    leaf.view.previewMode.applyScroll(0);
  }
  function fullImage() {
    const img = root()?.querySelector("img.obsidian-patch-banner-media");
    if (!img?.naturalWidth) return false;
    const box = img.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && Math.abs(box.width / box.height - img.naturalWidth / img.naturalHeight) < 0.01;
  }
  function coverWidthIs(percent) {
    const cover = root()?.querySelector(".obsidian-patch-banner-cover");
    const viewport = root()?.querySelector(leaf.view.getMode() === "preview" ? ".markdown-preview-view" : ".cm-scroller");
    if (!cover || !viewport) return false;
    const box = cover.getBoundingClientRect();
    const expected = viewport.clientWidth * percent / 100;
    const left = viewport.getBoundingClientRect().left + viewport.clientLeft + (viewport.clientWidth - expected) / 2;
    return Math.abs(box.width - expected) < 1 && Math.abs(box.left - left) < 1;
  }
  try {
    await plugin().setBanner({ enabled: true, autoplayVideos: true, widthPercent: 100 });
    await until(() => !!app.vault.getFileByPath("Patch Banner Tests/media/test-portrait.png"), "media indexed");
    const cases = [
      ["Image", "Patch Banner Tests/media/test-image.png"],
      ["Portrait", "Patch Banner Tests/media/test-portrait.png"],
      ["GIF", "Patch Banner Tests/media/test-animation.gif"],
      ["Animated WebP", "Patch Banner Tests/media/test-animation.webp"],
    ];
    for (const [name, link] of cases) {
      const path = await write(name, link);
      for (const mode of ["preview", "source"]) {
        await open(path, mode);
        await until(fullImage, `${name}: full aspect ratio in ${mode}`);
        await until(() => {
          const cover = root()?.querySelector(".obsidian-patch-banner-cover");
          const viewport = root()?.querySelector(mode === "preview" ? ".markdown-preview-view" : ".cm-scroller");
          if (!cover || !viewport) return false;
          const box = cover.getBoundingClientRect();
          return Math.abs(box.width - viewport.clientWidth) < 1 &&
            Math.abs(box.left - viewport.getBoundingClientRect().left - viewport.clientLeft) < 1;
        }, `${name}: cover fills the note viewport in ${mode}`);
        assert(root().querySelectorAll(".obsidian-patch-banner").length === 1, "Duplicate banner");
        await until(() => {
          const cover = root()?.querySelector(".obsidian-patch-banner-cover");
          const title = root()?.querySelector(".inline-title");
          const properties = root()?.querySelector(".metadata-container");
          return cover && title && cover.getBoundingClientRect().bottom <= title.getBoundingClientRect().top + 1 &&
            (!properties || cover.getBoundingClientRect().bottom <= properties.getBoundingClientRect().top + 1);
        }, `${name}: cover before native title and properties in ${mode}`);
        assert(!Array.from(root().querySelectorAll("button")).some(b => b.textContent === "Adjust banner"), "Obsolete crop action");
      }
      await until(() => {
        const fm = app.metadataCache.getFileCache(app.vault.getFileByPath(path))?.frontmatter;
        return JSON.stringify(Object.keys(fm ?? {})) === JSON.stringify(["patch-banner"]);
      }, `${name}: only patch-banner is stored`);
    }
    checks.push("only patch-banner is stored on notes");
    for (const mode of ["preview", "source"]) {
      await open("Patch Banner Tests/Image.md", mode);
      await plugin().setBanner({ ...plugin().settings.banner, enabled: false, autoplayVideos: true });
      await until(() => leaf.view.contentEl.querySelector(".obsidian-patch-banner-cover")?.hidden, `cover disabled for text-width comparison in ${mode}`);
      const before = root().querySelector(".inline-title").getBoundingClientRect();
      await plugin().setBanner({ enabled: true, autoplayVideos: true, widthPercent: 100 });
      await until(() => {
        const title = root()?.querySelector(".inline-title")?.getBoundingClientRect();
        return fullImage() && title && Math.abs(title.width - before.width) < 1 && Math.abs(title.left - before.left) < 1;
      }, `full-width cover preserves title width and horizontal position in ${mode}`);
    }
    for (const mode of ["preview", "source"]) {
      await open("Patch Banner Tests/Image.md", mode);
      const title = root().querySelector(".inline-title").getBoundingClientRect();
      for (const widthPercent of [10, 50, 75, 90, 100]) {
        await plugin().setBanner({ ...plugin().settings.banner, widthPercent });
        await until(() => coverWidthIs(widthPercent) && fullImage(), `${widthPercent}% cover is centered with full aspect ratio in ${mode}`);
        const current = root().querySelector(".inline-title").getBoundingClientRect();
        assert(Math.abs(current.left - title.left) < 1 && Math.abs(current.width - title.width) < 1, "Percentage changed text width");
      }
    }
    app.setting.open();
    app.setting.openTabById("obsidian-patch");
    await until(() => Array.from(app.setting.activeTab.containerEl.querySelectorAll(".setting-item")).some(el => el.querySelector(".setting-item-name")?.textContent === "Cover width (%)"), "percentage control appears in plugin settings");
    const control = Array.from(app.setting.activeTab.containerEl.querySelectorAll(".setting-item")).find(el => el.querySelector(".setting-item-name")?.textContent === "Cover width (%)");
    const slider = control.querySelector("input[type=range]");
    assert(slider.min === "10" && slider.max === "100" && slider.step === "1", "Wrong percentage range");
    slider.value = "60";
    slider.dispatchEvent(new slider.ownerDocument.defaultView.Event("input", { bubbles: true }));
    slider.dispatchEvent(new slider.ownerDocument.defaultView.Event("change", { bubbles: true }));
    await until(() => plugin().settings.banner.widthPercent === 60 && coverWidthIs(60), "settings slider applies the percentage to the open note");
    assert((await plugin().loadData()).banner.widthPercent === 60, "Percentage was not persisted");
    checks.push("percentage is saved in plugin settings");
    const reset = control.querySelector('[aria-label="Reset to 90%"]');
    assert(reset, "Width reset button is missing");
    reset.click();
    await until(() => plugin().settings.banner.widthPercent === 90 && slider.value === "90" &&
      control.querySelector(".slider-value")?.textContent === "90" && coverWidthIs(90), "reset restores the slider and current cover to 90%");
    assert((await plugin().loadData()).banner.widthPercent === 90, "Reset percentage was not persisted");
    checks.push("reset percentage is saved in plugin settings");
    app.setting.close();
    await app.plugins.disablePlugin("obsidian-patch");
    await app.plugins.enablePlugin("obsidian-patch");
    await until(() => plugin().settings.banner.widthPercent === 90 && coverWidthIs(90), "reset percentage survives a plugin reload");
    await plugin().setBanner({ ...plugin().settings.banner, widthPercent: 100 });
    await open("Patch Banner Tests/Image.md", "preview");
    await until(() => fullImage() && root()?.querySelector("img.obsidian-patch-banner-media")?.src.includes("/test-image.png?"), "image identity settled before rerender checks");
    const coverImage = root().querySelector("img.obsidian-patch-banner-media");
    for (let i = 0; i < 3; i++) {
      leaf.view.previewMode.rerender(true);
      await wait(80);
    }
    await until(() => root()?.querySelectorAll(".obsidian-patch-banner-cover").length === 1 &&
      root().querySelector("img.obsidian-patch-banner-media") === coverImage,
    "reading rerenders preserve exactly one cover and media instance");
    // Reading View detaches the header while it is far above the viewport.
    const long = await write("Long", "Patch Banner Tests/media/test-portrait.png",
      Array.from({ length: 80 }, (_, i) => `Paragraph ${i + 1}`).join("\n\n"));
    await open(long, "preview");
    await until(fullImage, "long note: portrait cover loaded");
    const scroller = root().querySelector(".markdown-preview-view");
    const longImage = root().querySelector("img.obsidian-patch-banner-media");
    scroller.scrollTop = scroller.scrollHeight;
    await until(() => !longImage.isConnected, "long note: Reading View detaches the header at the end");
    for (let i = 0; i < 200 && scroller.scrollTop > 0; i++) {
      const previous = scroller.scrollTop;
      scroller.scrollTop -= 120;
      await wait(32);
      assert(scroller.scrollTop < previous, `Scrolling up stalled or jumped from ${Math.round(previous)} to ${Math.round(scroller.scrollTop)}`);
    }
    assert(scroller.scrollTop === 0, "Scrolling up did not reach the top");
    assert(root().querySelector("img.obsidian-patch-banner-media") === longImage, "Detached header lost its cover media");
    checks.push("Reading View scrolls up from the end of a note with a tall cover");
    // Live Preview measures the text before a late cover pushes it down, as when the
    // image decodes after a note opens in the same tab; scrolling down must stay smooth.
    await plugin().setBanner({ ...plugin().settings.banner, enabled: false });
    await open("Patch Banner Tests/Plain.md");
    await leaf.openFile(app.vault.getFileByPath(long));
    await until(() => leaf.view.file?.path === long && root()?.querySelector(".cm-line"), "long note: opened in the same Live Preview tab");
    await wait(300);
    await plugin().setBanner({ ...plugin().settings.banner, enabled: true });
    await until(fullImage, "long note: cover appears above the measured text");
    const editorScroller = root().querySelector(".cm-scroller");
    let reached = editorScroller.scrollTop;
    for (let i = 0; i < 400 && reached < editorScroller.scrollHeight - editorScroller.clientHeight - 1; i++) {
      editorScroller.scrollTop += 60;
      await wait(32);
      const now = editorScroller.scrollTop;
      assert(now >= reached && now - reached <= 62, `Live Preview scroll jumped from ${Math.round(reached)} to ${Math.round(now)}`);
      reached = now;
    }
    checks.push("Live Preview scrolls down a long note with a tall cover without jumping");
    await open("Patch Banner Tests/Image.md");
    const value = leaf.view.editor.getValue();
    const start = value.indexOf("Patch Banner Tests/media/test-image.png");
    leaf.view.editor.replaceRange("Patch Banner Tests/media/test-portrait.png", leaf.view.editor.offsetToPos(start), leaf.view.editor.offsetToPos(start + "Patch Banner Tests/media/test-image.png".length));
    await until(() => {
      const img = root()?.querySelector("img.obsidian-patch-banner-media");
      return img?.naturalHeight > img?.naturalWidth;
    }, "Live Preview reacts to the current editor frontmatter");
    leaf.view.editor.setValue(value);
    await until(() => root()?.querySelector("img.obsidian-patch-banner-media")?.src.includes("/test-image.png?"), "editor fixture restored after frontmatter edit");
    await open("Patch Banner Tests/Portrait.md");
    await until(() => {
      const img = root()?.querySelector("img.obsidian-patch-banner-media");
      const heading = root()?.querySelector(".HyperMD-header-1");
      return fullImage() && heading && heading.getBoundingClientRect().top >= img.getBoundingClientRect().bottom;
    }, "editor measures the full portrait height without overlapping text");

    // Keep standard body shapes and empty-note fixtures available in the test vault.
    for (const [name, body] of [["List", "- First\n- Second"], ["Quote", "> Quote\n\nBody"], ["Code", "```js\nconsole.log(1)\n```\n\nBody"], ["Empty", ""], ["Rename", "# Rename fixture"], ["Missing", "# Restored image fixture"], ["Corrupt", "# Replaced image fixture"]]) {
      await write(name, "Patch Banner Tests/media/test-image.png", body);
    }
    for (const [name, ext] of [["Video", "mp4"], ["WebM", "webm"]]) {
      await write(name, `Patch Banner Tests/media/test-clip.${ext}`);
    }
    if (context.options.skipPlayback) {
      report.skipped.push("MP4/WebM automatic playback and manual pause checks (--skip-playback)");
    } else {
      for (const name of ["Video", "WebM"]) {
        const path = `Patch Banner Tests/${name}.md`;
        for (let round = 0; round < 3; round++) for (const mode of ["preview", "source"]) {
          await open(path, mode);
          await until(() => {
            const video = root()?.querySelector("video");
            if (!video || video.readyState < 2 || video.paused) return false;
            const box = video.getBoundingClientRect();
            return Math.abs(box.width / box.height - video.videoWidth / video.videoHeight) < 0.01;
          }, `${name}: full aspect ratio and playback in ${mode}, round ${round + 1}`);
        }
      }
      const video = root().querySelector("video");
      Array.from(root().querySelectorAll("button")).find(b => b.textContent === "Pause video").click();
      await until(() => video.paused, "manual pause still works");
      await plugin().setBanner({ ...plugin().settings.banner, enabled: true, autoplayVideos: false });
      await until(() => root().querySelector("video") === video && video.paused, "settings preserve media instance and pause state");
    }

    const empty = await write("Empty", "Patch Banner Tests/media/test-image.png", "");
    for (const mode of ["preview", "source"]) {
      await open(empty, mode);
      await until(fullImage, `frontmatter-only note has a cover in ${mode}`);
    }
    const plain = await write("Plain");
    await open(plain, "preview");
    await until(() => {
      const add = root()?.querySelector(".obsidian-patch-banner-add");
      return add && !add.hidden;
    }, "empty cover offers Add cover above the title");
    await app.fileManager.processFrontMatter(app.vault.getFileByPath(plain), fm => { fm["patch-banner"] = "[[Patch Banner Tests/media/test-image.png]]"; });
    await until(fullImage, "first banner added to an open Reading View");
    Array.from(root().querySelectorAll("button")).find(b => b.textContent === "Remove cover").click();
    await until(() => !app.metadataCache.getFileCache(app.vault.getFileByPath(plain))?.frontmatter?.["patch-banner"], "remove command deletes only the banner reference");
    await until(() => !root().querySelector(".obsidian-patch-banner-add").hidden, "remove restores Add cover");
    root().querySelector(".obsidian-patch-banner-add").click();
    await until(() => !!doc.querySelector(".prompt-input"), "media picker opens");
    const input = doc.querySelector(".prompt-input");
    input.value = "test-image.png";
    input.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
    await until(() => Array.from(doc.querySelectorAll(".suggestion-item")).some(el => el.textContent.includes("test-image.png")), "picker finds the vault image");
    Array.from(doc.querySelectorAll(".suggestion-item")).find(el => el.textContent.includes("test-image.png")).click();
    await until(() => app.metadataCache.getFileCache(app.vault.getFileByPath(plain))?.frontmatter?.["patch-banner"] === "[[Patch Banner Tests/media/test-image.png]]", "picker writes one canonical property");
    assert(!app.commands.commands["obsidian-patch:adjust-banner"], "Obsolete adjustment command registered");

    await open("Patch Banner Tests/Video.md");
    await until(() => (root()?.querySelector("video")?.readyState ?? 0) >= 2, "video loaded before unload");
    const retiring = root().querySelector("video");
    const coverBeforeSwitch = root().querySelector(".obsidian-patch-banner-cover");
    await open("Patch Banner Tests/Video.md", "preview");
    await until(() => root()?.querySelector("video") === retiring, "mode switch preserves the media instance");
    assert(root().querySelector(".obsidian-patch-banner-cover") === coverBeforeSwitch, "Cover instance replaced during mode switch");
    await leaf.setViewState({ type: "markdown", state: { file: "Patch Banner Tests/Video.md", mode: "source", source: true } });
    await until(() => leaf.view.contentEl.querySelector(".obsidian-patch-banner-cover")?.hidden && retiring.paused,
      "Source mode hides cover controls and stops the video");
    await open("Patch Banner Tests/Video.md");
    const background = app.workspace.getLeaf("split");
    try {
      await background.setViewState({ type: "markdown", state: { file: "Patch Banner Tests/Video.md", mode: "source", source: false } });
      await until(() => !!background.view.contentEl.querySelector("video.obsidian-patch-banner-media"), "second split receives its own cover");
      await until(() => [leaf, background].every(pane => {
        const viewport = pane.view.contentEl.querySelector(".cm-scroller");
        const cover = pane.view.contentEl.querySelector(".obsidian-patch-banner-cover");
        return viewport && cover && Math.abs(cover.getBoundingClientRect().width - viewport.clientWidth) < 1;
      }), "cover widths follow both split-pane sizes");
      await background.setViewState({ type: "markdown", state: { file: "Patch Banner Tests/Plain.md", mode: "source", source: false } });
      await until(() => background.view.contentEl.querySelector(".obsidian-patch-banner-cover")?.dataset.bannerNote === "Patch Banner Tests/Plain.md",
        "background split changes cover identity without relying on focus");
    } finally {
      background.detach();
      app.workspace.setActiveLeaf(leaf, { focus: false });
    }
    await app.plugins.disablePlugin("obsidian-patch");
    await until(() => !leaf.view.contentEl.querySelector(".obsidian-patch-banner"), "unload removes banner DOM");
    assert(retiring.paused && !retiring.getAttribute("src"), "Video source retained after unload");
    await app.plugins.enablePlugin("obsidian-patch");
    await until(() => !!leaf.view.contentEl.querySelector(".obsidian-patch-banner"), "re-enable restores the banner");
  } catch (failure) {
    const video = root()?.querySelector("video");
    const box = video?.getBoundingClientRect();
    const diagnostics = { file: leaf.view.file?.path, mode: leaf.view.getMode(), hidden: doc.hidden,
      video: video && { src: video.src, paused: video.paused, ready: video.readyState,
        width: video.videoWidth, height: video.videoHeight, error: video.error?.message,
        box: box && { x: box.x, y: box.y, width: box.width, height: box.height } },
      scroll: Array.from(leaf.view.contentEl.querySelectorAll(".cm-scroller,.markdown-preview-view")).map(e => ({ cls: e.className, top: e.scrollTop })) };
    report.error = (failure.stack ?? String(failure)) + "\n" + JSON.stringify(diagnostics);
  } finally {
    app.setting.close();
    if (!plugin()) await app.plugins.enablePlugin("obsidian-patch");
  }
})
