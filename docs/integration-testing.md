# Obsidian integration tests

These suites deploy the selected Patches build into a development vault and mutate dedicated `Patch … Tests/` fixtures. Build first with `npm run build`; install and enable `patches` in an open vault named `dev-vault`. They verify the live vault's resolved path before creating fixtures, so another vault with the same name is rejected. Use the [migration instructions](releases.md#migrating-from-obsidian-patch) before testing a vault that still uses the old plugin ID.

## Running

```sh
npm test
npm run build
node scripts/test-table.mjs /path/to/dev-vault
node scripts/test-table-conversion.mjs /path/to/dev-vault
node scripts/test-callout.mjs /path/to/dev-vault
node scripts/test-math-format.mjs /path/to/dev-vault
node scripts/test-mermaid.mjs /path/to/dev-vault
node scripts/test-navigation.mjs /path/to/dev-vault
node scripts/test-icons.mjs /path/to/dev-vault
node scripts/test-git-diff.mjs /path/to/dev-vault
node scripts/test-banner.mjs /path/to/dev-vault --skip-playback
node scripts/test-runner-recovery.mjs /path/to/dev-vault
```

Run Full tests from a separate `codex/full` checkout using its own instructions and default build:

```sh
npm run build
node scripts/test-mermaid.mjs /path/to/dev-vault
```

Add `PATCHES_TEST_REMOTE=1` to the full-build command to also load the bundled version number from jsDelivr and render an ELK diagram with that remote runtime. Without this opt-in, the suite stays on bundled Mermaid and records the live-network coverage as skipped. Both variants check Cynefin, ELK, TreeView icons, themes, searchable settings, and hostile SVG handling through the production renderer.

- Obsidian 1.15.0 or later must finish loading, expose the CLI developer commands, and have no open dialogs in the development window.
- Runners in `main` deploy `dist/community/` and reject Full, including any stale Full output. The separate `codex/full` checkout deploys its own `dist/full/` by default. Run suites from only one checkout at a time.
- `OBSIDIAN_CLI` overrides the executable. On macOS the runner prefers `/Applications/Obsidian.app/Contents/MacOS/obsidian-cli`, avoiding a PATH entry that launches the GUI executable. Other installations fall back to `obsidian` on PATH.
- On macOS, Obsidian 1.15.1 uses one `~/.obsidian-cli.sock` per account, including when processes have separate `--user-data-dir` values. Open a second test vault in the running app, or use a separate OS account for a fully isolated process. Starting and then closing a second process under the same account can disconnect the original app’s CLI until its next normal restart.
- Banner needs `ffmpeg` and `gif2webp` on PATH. Its image, portrait, GIF, animated WebP, MP4 and WebM samples are generated inside its fixture directory; a vault-root `banner.png` is no longer needed.
- Navigation needs `python3` with `pypdf` and `pdfplumber`. Set `PDF_PYTHON` to a Python environment with those packages. PDF verification is required and is not silently skipped.
- Icons verifies the combined icon/color picker using cached fixtures. Add `PATCHES_TEST_ICONS_REMOTE=1` to require a live Simple Icons download, matching upstream brand-color metadata, and cached-color rendering after reload. The native OS context menu itself is not automated; registered menu handlers open the real picker.
- The optional second positional argument chooses an output directory. Otherwise each run gets a unique temporary directory, printed as `Results: …`.
- A per-vault lock prevents concurrent suites from overwriting one another's fixtures and settings. Run suites sequentially.

## Isolation and reports

`scripts/lib/integration-runner.mjs` owns CLI selection, preflight, deployment and result polling. `scripts/lib/obsidian-session.js` runs one suite inside Obsidian and owns its temporary tab, timeout and cleanup. A suite receives that tab, a cancellable `wait`, and a shared report; it must not reuse an existing user tab or leave asynchronous work running after returning.

The runner retains the newly deployed plugin build and test fixtures for inspection. The Icons suite removes its unique run folder, test catalog, probe rows and temporary popout, and restores the explorer expansion and sidebar state. The Git suite creates its baseline repository in the test output directory, removes its temporary notes and restores the vault’s line-number and note-marker preferences. The shared cleanup restores the original `data.json` bytes (or its absence), the saved sizes of the table editor, callout editor, callout appearance panel and HTML-to-Markdown preview, the previous active tab, and the window's original background-throttling value. Existing tabs keep their notes and view modes. Math and Callout tests set their required options explicitly, then the shared cleanup restores the user's options.

Each output directory contains:

- `run.json`: the run ID, exact vault path, options and timeout.
- `settings-before.json`: the original plugin settings, when the file existed.
- `results.json`: checks, explicit skips, errors, cleanup errors and restoration results. `finished: true` is written only after cleanup. Reports are written atomically and polling ignores another run's ID.
- Navigation also produces screenshots, six native PDFs and `pdf-verification.json`.

CLI errors are checked even when Obsidian exits with status zero. Assertion failures and cleanup failures both make the command fail; a cleanup error does not overwrite the original assertion. `SIGINT` and `SIGTERM` request cancellation and wait for the same cleanup path. The in-app timeout interrupts the suite's next cancellable wait or checkpoint.

A frozen Obsidian process or a non-returning native operation cannot be forcibly unwound by this runner. If no completed cleanup report arrives, the command fails and retains the lock and settings backup. Inspect the recorded run and the development window before removing that lock or restoring the backup; do not start another suite while the old one can still write. Force-killing the runner also leaves the in-app timeout responsible for cleanup.

## Callout interface font and branch verification — 2026-11-24

On Debian with Obsidian 1.15.1, the Community build passed 104 Callout, 57 Table, 31 Git diff and 22 Icons checks. The Callout type field and its open suggestions both followed changes to the interface font. The separate HTML table setting still completed installed font names and applied the selected font to inline code. The Icons suite exercised a live catalog installation. All four suites restored their sessions. Mobile, other desktop platforms and themes, and the native OS context menu were outside this run.

Node 22 passed 177 unit tests. The production build, package validation, and documentation check passed for 21 pages and 878 links and assets. Local Obsidian lint reported zero errors and the six previously recorded main-window warnings.

## Vault-wide Git markers and the Simple Icons installation tip — 2026-11-24

On Debian with Obsidian 1.15.1, the Git suite passed 31 checks. It supplied a temporary discovery root during plugin enable and used an isolated local Git object store. An ordinary root exposed neither Git command, even with a repository under the open note. Adding or removing working-tree metadata and refocusing the window updated the commands and gutters. Visible editors showed their own changes by default, the off switch survived a reload, and the manual comparison remained available. After the first committed version was cached, twelve edits and creation of an unopened note started zero additional Git processes for the fixture.

The Icons suite passed 22 checks with live catalog installation, including the settings button changing from **Install** to **Update**. Unit tests covered the one-time tip, skipping the tip when already installed, nested vaults and bare repositories. Both native suites restored their sessions. These checks covered the Community build on Debian.

## Per-note Git markers, shared brand icons and installed fonts — 2026-11-24

The unreleased Community build passed 175 unit tests under Node 22, TypeScript, production package validation and the documentation check for 21 pages and 878 links and assets. The local Obsidian lint run reported zero errors and six existing main-window warnings in Active Line, Callout Code and Mermaid.

On Debian with Obsidian 1.15.1, the Git suite passed 22 checks. Source mode and Live Preview showed added, modified and deleted lines with line numbers visible or hidden. Clicking a marker opened the correct hunk, unsaved edits appeared below their committed version, and the active-line bar had its own space. Marker preferences survived switching notes and reloading the plugin. Returning to the editor picked up a new Git commit. The comparison left the fixture index byte-for-byte intact.

The same build passed 105 Callout, 57 Table and 21 Icons checks. The appearance dialog kept its width, and its type field and suggestions used the selected font. Chromium’s rendered-glyph inspection confirmed JetBrains Mono in HTML table cells in Reading View, Live Preview and the visual editor. The explicit Simple Icons update installed a 2,022,839-byte compressed catalog for version 16.38.1. After a reload the Callout picker found a previously unused brand locally, and its icon and color persisted with file explorer icons disabled. The four suites restored their sessions. Other desktop operating systems, mobile, other themes, the native OS context menu and the Full build were outside this run.

## Resizable conversion preview — 2026-11-24

On Debian with Obsidian 1.15.1, the Community build with `main.js` SHA-256 `74b7f0ee55611bfc04003f95101a336a9cc73fe2c9a9ceae558074f3069de399` passed 32 Table conversion, 52 Table, 99 Callout, 32 Mermaid and 20 Icons checks. A native desktop mouse drag resized the conversion preview to 600 × 400 CSS pixels. The source and rendered table stacked vertically, a 40-row table scrolled with the footer in view, and the visual editor opened the preview at the dimensions saved through the standalone command. Double-clicking the grip restored the default size on reopening and preserved the visual editor’s independent size. All five suites restored their sessions. The runner also restored settings and size preferences after success, intentional failure and timeout. Mobile, Full, other desktop platforms and themes, and the native icon context menu were outside this run.

The documentation check covered 21 built pages. Chrome loaded the Active Line and Heading Levels illustrations once per guide and displayed the two watchlist screenshots within the page at viewport widths of 390 and 1280 pixels. The narrow browser check covers the documentation layout.

## Editor updates branch candidate — 2026-11-24

The Community build passed 169 unit tests across 22 files, TypeScript, production packaging, and the documentation build and link check (21 pages and 854 links and assets). Its production `main.js` is 10,307,133 bytes with SHA-256 `4e1d3f230ff9ebc8964901e4e1228f3bb75fc4f5d55c875d5d7e70b22c1754d6`.

Obsidian 1.15.1 on Debian passed 99 Callout, 52 Table, 29 Table conversion, 32 Mermaid and 20 Icons checks on this build. Each suite restored settings and session state. Callout tests covered uppercase suggestions through the native editor, per-type icon and color overrides across Settings windows, and conflicts after extending a callout. Table tests covered custom inline-code fonts and new links to table IDs added while a conversion preview was open. Native round trips retained the default link and highlight behavior. Icons downloaded live graphics and matching brand colors and checked cached rendering after reload. Mobile, other desktop platforms, other themes, the native OS context menu, Full, and unrelated suites were outside this pass.

## Uppercase callout types — 2026-11-24

The unreleased Community build passed 164 unit tests, package validation, the documentation build and the site check. On Debian with Obsidian 1.15.1, the Callout suite passed 93 checks with no skipped groups and restored the development session. The native editor inserted `NOTE`, wrapped a selection with `TIP`, saved the alias `TLDR` and the custom type `DECISION`, and completed a lowercase `war` query to `WARNING`. Explicitly selecting an existing lowercase type changed its marker to uppercase. Editing just the title or body kept its existing spelling. The native appearance dialog showed uppercase names and retained the saved icon and color. The model tests cover Unicode type identities. Mobile and the Full build were outside this run.

## Table fonts, callout appearance, and editor fixes — 2026-11-24

The unreleased Community build based on `a98b4ff` passed 163 unit tests, the production build and release validation. Debian and Obsidian 1.15.1 passed 52 Table checks, 28 Table conversion checks, 89 Callout checks and 32 Mermaid checks. All four suites completed with zero skipped groups and restored the development session. The documentation build and check covered 21 pages and 854 site links and assets. Mobile, Full and other themes were outside this pass.

The native settings tests selected an installed font and inspected inline code in a Live Preview HTML widget, Reading View and the visual table editor. Markdown pipe table cells and ordinary inline code retained their original fonts. A custom callout type used a Lucide icon, a theme palette color, a custom color and its original theme defaults in sequence. Both the existing and freshly rendered title displayed the configured icon. Inline and fenced code changed tint with the selected color and the nested callout retained its own tint.

The five findings below were retested. Both table conversion entry points preserved literal code whitespace. An ordinary Reading View save retained the mixed line endings byte for byte. CRLF tables converted at the correct positions and one undo restored the prior editor text. Saving the resulting native editor transaction on this host wrote LF throughout. Concurrent ordinary table saves in Reading View, Live Preview and the source command kept the draft open. Callout save and conversion conflicts also kept the draft, and a clipboard carrying HTML and plain text remained available to the native paste handler. A deterministic unit test verified the delayed A → B → A preview sequence. Mermaid’s two TreeView example icons with unresolved upstream SVG references remain as recorded below.

## Single-plugin candidate and editor findings — 2026-11-24

A temporary copy of the Community working tree based on `a98b4ff`, including the six new source and test files, installed its locked dependencies from the npm cache and passed all 157 unit tests. Its production `main.js`, `manifest.json` and `styles.css` matched the workspace build byte for byte and passed package validation. With Obsidian 1.15.1 on Debian, the Mermaid suite passed 32 checks with no skipped groups, including ELK, Cynefin, TreeView, both bundled icon packs and theme changes. The upstream renderer still dropped all three local SVG references used by the CSS folder and Chrome Web Store example icons. The suite restored its tab, settings, editor sizes and background throttling. Mobile and Full were outside this run.

Additional probes on the same installed build used temporary development-vault notes and the normal editing commands. The test removed its notes and restored the session. The observations below describe the build before the fixes recorded above.

| Case | Observed result |
| --- | --- |
| Convert a table cell containing `<code>a  b</code>` to Markdown | The output code span and rendered cell contained a single space. The preview reported a lossless round-trip. |
| Edit a cell in a CRLF-only note from Reading View | Saving produced a mix of CRLF and LF. Choosing **Convert to Markdown** in a fresh copy of the unchanged note produced a stale-source notice and kept the conversion dialog open. |
| Change a callout title in Reading View while another edit updates its body | The concurrent edit survived. The save conflict closed the modal and discarded the new title. |
| Paste a multiline clipboard selection containing both plain text and an HTML link into a callout | The paste handler consumed the event and inserted the link label as plain text, dropping the destination. |

A separate controlled test of the callout editor held a preview render for title B open while the field changed from A to B and back to A. Releasing the pending render displayed B while the field still showed A.

## Table and callout review fixes — 2026-11-24

The Community working tree based on `a98b4ff` passed 157 unit tests, the production build, release-file validation and the documentation build and check (21 pages and 853 links and assets). On Debian with Obsidian 1.15.1, the development-vault suites passed 27 table conversion checks, 30 table editing checks and 74 callout checks. All three suites restored their session state and reported zero skipped groups. Mobile, Full, other desktop platforms and unrelated native suites were outside this follow-up.

Direct and visual-editor conversion placed the same text in the same columns for zero and positive row spans across two body groups and a footer. Both commands refused a sparse table over the 50,000-position limit. Detaching the original Reading View table kept its drafts open and the file intact. Restoring it allowed conversion followed by a single undo. A Reading View callout title edit preserved the surrounding mixed CRLF and LF bytes, with lone CR and an unterminated last line also covered in unit tests.

## Community bundle and working-tree review — 2026-11-24

The unreleased Community working tree based on `a98b4ff` passed 154 unit tests, the production build, package validation and documentation checks. On Debian with Obsidian 1.15.1, Mermaid passed 32 checks including ELK rendering and icons from both offline packs. Icons passed 20 checks including a live Simple Icons and brand-color download and cached rendering after reload. Callouts passed 71, Table editing 30 and Table conversion 24. Each suite restored its settings and session state. Mobile, other desktop platforms, other themes, the native icon context menu and unrelated suites were outside this run. [Release disclosures and bundle measurements](community-review-history.md#051-release-disclosures--2026-11-24)

A separate in-memory check in the same development window found a conversion discrepancy outside those suites. In a two-column table, the first body cell `A` spans to the end of its row group with `rowspan="0"`, `B` is beside it, and `C` is in the next row. Direct conversion places `C` in column two. Passing the original table through the HTML editor’s draft model first places `C` in column one and reports no loss.

## Inline math in converted tables — 2026-11-19

The Community candidate based on `5f95d60` passed 138 unit tests, the production build, release-file validation, and documentation checks for 21 pages and 850 links and assets. On macOS with Obsidian 1.15.1, the Table and Markdown conversion suites passed 30 and 18 checks. Conversion preserved the formula source and cell positions in the reported table and the public vector example. The suites covered one-step undo, editable TeX in the modal, native Reading View and Live Preview rendering, and restoration of the test session state. The screenshot is a crop of the converted vector example in Reading View. Mobile, other desktop platforms, and Full were outside this run. [Screenshot](images/inline-math-table.png)

The versioned 0.5.1 Community build retained the reviewed implementation at `f62d1bc`. It passed 138 unit tests, tag-specific package validation, the 21-page documentation build and link check, and a fresh run of Markdown conversion (18 checks) and Table editing (30 checks) on macOS with Obsidian 1.15.1. Full passed 143 unit tests, its production build, and tag-specific package validation. Mobile, other desktop platforms, and a native Full run were outside this packaging pass.

## 0.5.0 release candidate — 2026-11-18

Both release trees retain the plugin implementation from Community `fd58c47` and Full `355b936`. Community passed 138 unit tests and Full passed 143. Both production builds passed tag-specific package validation. The Community site passed checks for 21 pages and 846 local links and assets.

The versioned Community package ran in dev-vault on macOS with Obsidian 1.15.1. Callouts passed 65 checks, Mermaid 32, Icons 19, and Banner 93. The suites restored their settings and tab. The Icons run used cached graphics and the Banner run skipped video playback. Mobile, other desktop platforms, and a fresh native Full run were outside this packaging pass. The development checks below cover earlier playback, remote icon data, and Full runtime verification.

## Development checks — 2026-11-18

The Community candidate passed 138 unit tests, and the Full candidate passed 143. Each passed its own production build and release-package validation. The initial Community site build covered 21 pages and 847 local links and assets. Desktop (1280 px) and mobile-width (390 px) browser checks covered the demo buttons, images, layout, and the Unreleased link. The native suites below ran sequentially in `dev-vault` on macOS with Obsidian 1.15.1.

| Native suite | Community | Full | What was verified |
| --- | ---: | ---: | --- |
| Callouts | 65 | 65 | Folder completion preserved neighboring paths and updated a child note’s count. The Reading-view command worked in an unmarked note. An external save updated the count and invalidated a stale jump. [Folder demo](images/callout-folder-completion.gif) · [Report screenshot](images/callout-github-report.png) |
| Banner | 107 | 107 | Same-file covers and body images retained independent widths in both views. The suites covered per-note and split-pane widths plus MP4/WebM playback and manual pause. The first Community playback run timed out while the document was hidden. Both complete runs passed in a visible window. [Banner measurements](banner-testing.md#逐笔记封面宽度2026-11-18) |
| Icons | 20 | 19 | Both checked folder colors, missing paths, and restoration before cleanup. Community also fetched a live graphic and its matching brand color and verified the cache after reload. Full used cached fixtures. The native OS context menu itself was outside both runs. [Icon verification](icons-design.md) |
| Mermaid | 32 | 31 | Both checked unsaved edits, nested fences, stale results, undo, and a Reading-view jump that preserved CRLF file bytes. The bundled version was 12.3.0. Full also rendered with custom 12.1.0 from jsDelivr and displayed that engine’s version in the whole-note check. [Checker design](code-block-lint-and-bilingual-translation.md#code-block-linting) |

Both reports kept the final actions reachable with 32 entries at 100%, 150%, and 200% desktop zoom and in a 340 CSS pixel container. In the GitHub report, Space expanded only the focused row. Supported alerts with an advisory kept their explanation, and fully compatible alerts showed only **Jump**. All completed suites restored settings, the previous tab, editor sizes, and background throttling. The final Icons run restored the Community plugin files to the development vault. Native mobile, Windows, and Linux checks were outside this round.

### Numbered flowchart example

On Obsidian 1.15.1, the published 0.4.0 Community build and both development builds rendered steps 1 and 2 with Bundled 12.3.0, Strict, and the diagram’s explicit Dagre layout. Both arrows took turns highlighting and the dot moved along each one. The same source drew a static three-node flowchart in native Pele and in Full with upstream Mermaid 12.1.0 selected. The gallery and the 60-frame site loop were captured from the published build. The updated site passed checks for 21 pages and 850 links and assets. At both 390 and 1280 px, Chrome loaded the GIF with standard motion and the PNG when reduced motion was requested. All three sessions restored the original settings and tab. After the final session, the development vault’s three plugin files matched the original Community candidate byte for byte. [Diagram source](../site/features/mermaid.md#number-the-steps-in-a-flowchart) · [Gallery comparison](images/community/05-mermaid-diagram.png)

### Earlier Mermaid checks

In a separate source copy of 0.4.0, selecting Mermaid 12.1.0 with `npm install --save-exact mermaid@12.1.0` passed 132 unit tests, the production build, package validation, and 25 native Mermaid checks. Build metadata and the settings panel reported 12.1.0. This run predates the whole-note checker and covers the suite’s diagrams and configurations on this host. Other custom versions, including 13.x prereleases, were outside this run. The subsequent Icons run restored the default 12.3.0 build to the development vault.

With the 12.3.0 runtime, the initial checker passed 29 native checks and 136 unit tests, plus the build, package, and documentation checks. It located the original line and column inside nested lists and callouts, opened the correct fence from Reading view, and skipped a plain `mermaid` block that Obsidian rendered as a Pele SVG.

A comparison with the installed Obsidian 1.15.1 Markdown section parser found the same opening-fence lines in all 119 offline samples after correcting how unfinished comments and display math end at a container boundary. The samples covered nested lists and quotes, literal Markdown examples, raw HTML, and opening and closing delimiter lengths.

After a normal Obsidian restart restored the dev-vault CLI connection, five save/undo cases reproduced a stale Reading-view buffer. The saved file and editor held the restored text while the view retained the preceding revision. Reading the saved source in Reading view and checking it against the editor before a jump restored the correct destination in all five cases. The suite also covered unfinished math and comments in blockquotes and restored settings, the active tab, editor sizes, and background throttling.

## 0.4.0 release preparation — 2026-11-17

After the maintainer confirmed the Community preview for `3f62957d52dc96103dc3f5855cfede9f780e01eb` passed, version metadata and the compatibility map were updated to 0.4.0 / Obsidian 1.15.0. Fresh Community verification passed 132 unit tests, the production build, tag-specific package validation, and documentation build/link checks. The implementation and plugin stylesheet are unchanged from the reviewed commit; rebuilt `main.js` and `styles.css` hashes exactly match the previously native-tested candidate below. Native suites were not repeated for this metadata-only release preparation, and their recorded platform/feature limits still apply.

Full was synchronized in an isolated checkout with identical shared feature files, while preserving its separate remote Mermaid runtime and build rules. It passed a fresh dependency installation, 137 unit tests, the Full production build, and 0.4.0 package validation. Full native UI and remote-runtime checks were not rerun. Official release artifacts are Community only; successful local checks do not establish release-asset acceptance by the Community Directory.

## Next-release candidate — 2026-11-17

Before committing the Community candidate based on `9cf765e2b04381a3cc68e331b664e36964e58346`, a fresh run passed 132 unit tests, the production build, release-package validation, documentation build, 21 generated pages / 810 local links and assets plus README links, and whitespace checks. The plugin's three installation files match the already-tested and deployed build byte-for-byte: `main.js` SHA-256 `da28a18488765d8712375bb76d66dcbe7adf7d30b40dd0aa23c56eb2f13985b5`, `manifest.json` `f8affdbe921c8930cddd8659cc932403ae7a3ea40870c1878297bbed3651ad27`, and `styles.css` `f14d16a0f8c0ee0d7828bdb493e0e4e144adebf435957e13db03265a923bed05`. The manifest still reports 0.3.2; these are unreleased development assets, not replacements for published 0.3.2 attachments.

Earlier in this candidate's development on macOS / Obsidian 1.15.1, Icons passed 17 checks with live graphic and brand-color downloads, followed by 18 checks after the mixed-color and keyboard fixes with additional network coverage disabled. Callout code backgrounds passed 43 targeted assertions across light/dark, Reading View/Live Preview, nested callouts, syntax highlighting, and disabled/outside-callout cases. The feature capture passed three targeted checks, including an exact 1137 px global width, and the combined homepage capture verified the original banner proportions and merged table. Settings, active tabs, display preferences, and temporary capture fixtures were restored. See [icon verification](icons-design.md) and [callout verification](callout-design.md) for the detailed boundaries; these native suites were not rerun during the final pre-push check.

Browser checks covered the new homepage on desktop and a 390 px viewport, light/dark presentation, mouse and keyboard demo switching, image loading, and absence of horizontal overflow or captured browser errors. Mobile Obsidian, other operating systems, third-party themes, the native OS context menu itself, and the full unrelated feature suites remain outside this candidate's fresh verification. Full was not updated or tested in this preparation. No Directory preview, new release, or Pages deployment is established by these local results.

## 0.3.2 release preparation — 2026-11-13

Both distribution versions, lockfile root versions, manifests and compatibility entries were updated to 0.3.2 / Obsidian 1.15.0. Community passed 127 unit tests and Full passed 132, with both production builds, tag-specific package checks and diff whitespace checks passing. Each distribution's `main.js` and `styles.css` hashes are identical to its already-tested remaining-warning candidate; only the installation manifest version changed. The native regression scope below therefore remains applicable to the unchanged implementation, without claiming a new full native-suite run for the version bump.

The maintainer confirmed that the Community preview requested for `a4ba9639094548ab4cbf187a6d5a0e44e97e89f2` passed and the two remaining findings disappeared. Release-asset review is still separate; see [Community review history](community-review-history.md).

## Remaining warning fixes — unreleased, 2026-11-13

The working trees based on Community `fc5c2f5` and Full `5d4f0c0` replace deprecated table text insertion and make PDF host-method receivers/restoration explicit. Community passed 127 unit tests and Full passed 132; both production builds and release-file checks passed. Three new PDF adapter unit cases cover bound instance receivers, exact shared-descriptor restoration after an exception, and a non-writable host-method fallback.

On macOS / Obsidian 1.15.1, the Community native suites passed Table 30, Markdown conversion 16, and Navigation 16, plus six PDF verifications. Table coverage now includes partial-selection replacement, CRLF/CR normalization, literal HTML text, continued insertion at the resulting caret, final-line placeholders, composition Enter pass-through, keyboard and cancellable beforeinput history requests, caption paste, cross-cell selection refusal, and exact saved HTML without placeholder breaks. Existing merge, untouched-markup, Live Preview, and batch-undo checks remain covered. All settings/tab/throttling restoration checks passed; the final captured error log was empty and no test/modal remained active. The development vault retains the Community candidate; the personal vault was not modified.

Official recommended lint in the isolated TypeScript 6 toolchain reports zero errors and six existing `prefer-active-doc` warnings across 39 source files. Neither of the two targeted warning types remains. Evidence is under ignored `dist/validation/remaining-warnings/`. These are local results, not a new Community preview result.

The composition test synthesizes the browser's composing-key event; actual OS input-method candidate selection was not automated. Mobile, other desktop platforms/themes, table editing in popouts, non-cancellable native history events, unrelated features, and Full native UI were not rerun. Full contains identical shared implementations and passed its own unit/build/package checks. PDF verification retains the existing explicitly paginated two-page fixture.

## Review follow-up verification — unreleased, 2026-11-13

These checks cover the uncommitted Community and Full working trees based on `f85579534c9b8d3c6c585d03b17686db86d7c46f`, after source separation and the icon/DOM fixes. Their manifests still report 0.3.1; these modified packages are not the published 0.3.1 assets and need a new version before release. Community passed 124 unit tests and Full passed 129; both production builds, installation-file checks, and diff whitespace checks passed.

On macOS with Obsidian 1.15.1, the affected native suites passed 170 checks: Icons 12, Community Mermaid 25, Full Mermaid 23, Banner 78, Markdown-to-HTML conversion 16, and Navigation 16. Full made real jsDelivr requests for Mermaid and ELK. Six additional native PDF checks passed, with all exported glyph positions matching the disabled baseline; the fixture still uses explicit two-page pagination.

The new Icons runner verifies actual Lucide and cached Simple Icons masks, enabling/disabling/removing icons, folder and nested-file renames, lazy rows, reused/detached DOM nodes, a real second file explorer in a popout, and unload/reload/close cleanup. It restores explorer/sidebar state and removes its unique fixture and popout. Every suite restored settings and UI state, both Mermaid runs restored the theme, and the final application error log was empty. The development vault retains the Community candidate; its three installation files match the source build exactly. The personal vault was not changed.

The two known upstream Mermaid icon-reference limitations remain. Banner playback was explicitly skipped. Other platforms/themes, live Simple Icons downloads, the native icon-picker menu, natural PDF overflow, and unrelated feature suites were not rerun. These are targeted regression results, not complete platform or feature coverage.

The full official ESLint recommended configuration was also run in isolated compatible tooling against 38 Community source files. The targeted DOM/style findings are absent, but the complete result still has three PDF method-capture errors and nine warnings. [Community review history](community-review-history.md#local-follow-up-checks--not-a-directory-review) records their exact scope and the distinction from service results. Local evidence, screenshots, lint configuration and artifact hashes are under ignored `dist/validation/community-review-followup/`; the subsequent Community preview of `fc5c2f556dcfefab9aefd96ab5c0ff5b0af4a505` completed without reported errors, as recorded in the review history. That preview does not validate a new release's assets.

## Historical verified scope — 0.3.1, 2026-11-13

The review-fix candidate passed 122 unit tests, both production builds and release-package checks, and `git diff --check`. Its description no longer contains the directory-rejected product name. Direct CodeMirror dependencies match the installed host API's existing peer versions and remain external to the bundles.

On macOS with Obsidian 1.15.1, the final Community Mermaid suite passed 25 checks and Full passed 23, including real jsDelivr imports of Mermaid 12.3.0 and ELK. Both variants retained Cynefin and ELK layouts, the original three TreeView fixture icons, theme changes, searchable settings, HTTPS and Obsidian links, and a real Loose-mode click callback. Two additional TreeView icons have an upstream rendering limitation recorded below; comparing raw Mermaid output with the final DOM confirmed no additional geometry loss. The renderer stripped scripts, event handlers, executable URLs, and unsafe SVG references in both security modes while preserving styles and HTML labels. A separate native DOM probe passed 21 checks, including encoded unsafe links and preserved Obsidian links. Loose mode still requires trusted diagram input because Mermaid renders and binds interactions before or around the final SVG insertion boundary.

Banner passed 78 checks with its playback group explicitly skipped, and Markdown-to-HTML conversion passed 16. Each suite restored settings and UI state. The development vault retains the final Community 0.3.1 candidate and its fixtures for inspection. The personal vault was not modified. Reports and screenshots are retained locally under `dist/validation/0.3.1/` and are not release attachments.

Follow-up regression passed Table editing (23), Callout editing (41), Math Format (8), and Navigation (16), plus six native PDF verifications. A separate native UI smoke test passed 24 checks covering Active Line in both editor modes, actual line widths and note overrides in all three note modes, status-bar controls, and Lucide/cached Simple Icons in the file explorer. Settings, active tabs, sidebar state, and temporary smoke-test notes were restored; the final error log was empty. These reports are under `dist/validation/0.3.1/regression-N4YkTx/`.

The final reports total 254 passing integration and UI checks, excluding the six separate PDF verifications. The final Mermaid runs restored the original settings bytes, active tab, and theme, cleared their temporary probe globals, and left no captured errors. Their reports are under `final-mermaid-community/` and `final-mermaid-full/` within the validation directory.

A further SVG compatibility probe covered all 70 bundled icons containing `<use>` references. The final sanitizer preserves all 213 references with existing targets, and two representative icons match their original rasterized pixels exactly; one source reference already points to a missing ID. Six native reference-safety checks passed. However, Mermaid 12.3.0's own icon sanitization removes these references before returning rendered diagrams, even in Loose mode. The real TreeView output therefore retains this pre-existing limitation for icons such as `material-icon-theme:folder-css` and `logos:chrome-web-store`. The 0.3.0 lockfile already used the same Mermaid and DOMPurify versions. The standalone sanitizer result is not evidence that the complete Mermaid pipeline renders those icons correctly.

Build comparison reproduced the 0.3.0 release exactly from its tag with Node 26.0.0 and zlib 1.2.12. The same locked inputs under Node 22.23.5 and zlib 1.3.1 produced different bytes; substituting only the two original compressed icon payloads restored the exact released bundle. After switching to pinned JavaScript compression with a zero timestamp, fresh dependency installations in two independent directories produced identical Community and Full installation files under both Node versions. Both matched the repository's final `dist/` files. Full icon JSON roundtrips unchanged, the compressor is absent from runtime bundles, and the dependency audit reported no vulnerabilities. Reports are under `dist/validation/0.3.1/build-reproducibility/`; the community service's Linux rebuild has not been run.

Mobile platforms, other desktop platforms and themes, every Mermaid diagram type, and live Simple Icons downloads remain unverified. PDF navigation uses an explicitly paginated two-page fixture; naturally overflowing long documents are not covered by that suite. Banner playback remains explicitly skipped. The release-attestation workflow was validated locally, including seven draft-attachment verification cases, but has not run on GitHub; attestations do not exist until that workflow succeeds. No package-size reduction was attempted, preserving all diagram types, layouts, and icon packs.

## Historical verified scope — 0.3.0, 2026-11-13

The Patches 0.3.0 candidate passed 103 unit tests, both production builds, both release-package checks, and `git diff --check`. These checks ran on the working tree based on `5dcf9ea4a7583b8b1f463f8e4da4f237eba5abbb`, before the release-preparation commit. The local build environment used Node.js 26.0.0 and npm 11.12.1; CI remains configured for Node.js 22.

On macOS with Obsidian 1.15.1, the development-vault runs passed Markdown-to-HTML table conversion (16 checks), Callout (41), community Mermaid (14), and full Mermaid (10). Mermaid verification covered Cynefin and ELK rendering, light/dark theme changes, unchanged note source, and each build's settings. The community suite also confirmed that legacy remote-version settings normalize to Bundled and are saved. Diagram checks target the visible Reading view because a hidden Live Preview editor can retain a separate SVG with zero dimensions.

All 81 integration checks passed and every suite reported successful state restoration. After testing, the temporary Patches installation was removed, the original plugin was re-enabled, and the original settings bytes, enable list, active tab, and theme were restored. Dedicated test fixtures remain for inspection. Obsidian reported no captured errors after cleanup. Reports and Mermaid screenshots were retained under `dist/validation/2026-11-13/` in the local workspace; this directory is not tracked or published.

The full Mermaid suite explicitly skipped live jsDelivr requests; remote loading, cache handling, and fallback have unit coverage with mocked requests. Mobile platforms, Banner playback, Math Format, Navigation/PDF export, and the broader table-editing suite were not rerun for this candidate. The minimum supported version remains the approved Obsidian 1.15.0 baseline; this session's actual host was 1.15.1.

## Historical verified scope — 2026-11-12

These results predate the Patches rename and the two-build setup. They describe that earlier revision, not fresh verification of the current build.

On macOS with Obsidian 1.15.0, the updated runners passed Table (23), Callout (41), Math Format (8), Navigation (16 plus six actual PDF verifications), and Banner (78 with the playback group explicitly skipped). Every suite confirmed settings, dialog sizes, active tab and background throttling were restored.

The recovery suite intentionally changes settings and editor sizes in three cases: successful completion, an assertion failure, and a timeout. All three restored the original state in the real application. Unit tests also cover wrong-vault refusal and cleanup failures.

The build and 64 unit tests passed. Obsidian captured one `ResizeObserver loop completed with undelivered notifications` message during the first Banner run. That run passed all included layout checks, and a later repeat of the Banner suite added no new captured errors. The cause of that isolated message was not established.

Banner playback remains deferred at the user's request. `--skip-playback` excludes repeated MP4/WebM autoplay and manual-pause checks and records the omission; it still checks video loading, view changes, split panes and resource cleanup. Without the flag those playback assertions still run and can fail. PDF pagination display remains a separate, deferred prototype.
