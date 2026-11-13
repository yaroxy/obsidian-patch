# Obsidian integration tests

On `codex/full`, these suites deploy the Full Patches build into a development vault and mutate dedicated `Patch … Tests/` fixtures. Build first with `npm run build`; install and enable `patches` in an open vault named `dev-vault`. They verify the live vault's resolved path before creating fixtures, so another vault with the same name is rejected. Use the [migration instructions](releases.md#migrating-from-obsidian-patch) before testing a vault that still uses the old plugin ID.

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
node scripts/test-banner.mjs /path/to/dev-vault --skip-playback
node scripts/test-runner-recovery.mjs /path/to/dev-vault
```

To include a real remote Mermaid and ELK load, run:

```sh
PATCHES_TEST_REMOTE=1 node scripts/test-mermaid.mjs /path/to/dev-vault
```

Without this opt-in, the suite stays on bundled Mermaid and records live-network coverage as skipped. The Full suite checks Cynefin, ELK, TreeView icons, themes, searchable settings, links, callbacks and hostile SVG handling through the production renderer.

- Obsidian 1.15.0 or later must finish loading, expose the CLI developer commands, and have no open dialogs in the development window.
- Runners deploy `dist/full/`. `PATCHES_BUILD=full` is optional; other distributions are rejected on this branch.
- `OBSIDIAN_CLI` overrides the executable. On macOS the runner prefers `/Applications/Obsidian.app/Contents/MacOS/obsidian-cli`, avoiding a PATH entry that launches the GUI executable. Other installations fall back to `obsidian` on PATH.
- Banner needs `ffmpeg` and `gif2webp` on PATH. Its image, portrait, GIF, animated WebP, MP4 and WebM samples are generated inside its fixture directory; a vault-root `banner.png` is no longer needed.
- Navigation needs `python3` with `pypdf` and `pdfplumber`. Set `PDF_PYTHON` to a Python environment with those packages. PDF verification is required and is not silently skipped.
- The optional second positional argument chooses an output directory. Otherwise each run gets a unique temporary directory, printed as `Results: …`.
- A per-vault lock prevents concurrent suites from overwriting one another's fixtures and settings. Run suites sequentially.

## Isolation and reports

`scripts/lib/integration-runner.mjs` owns CLI selection, preflight, deployment and result polling. `scripts/lib/obsidian-session.js` runs one suite inside Obsidian and owns its temporary tab, timeout and cleanup. A suite receives that tab, a cancellable `wait`, and a shared report; it must not reuse an existing user tab or leave asynchronous work running after returning.

The runner retains the newly deployed plugin build and test fixtures for inspection. The Icons suite removes its unique run folder, probe rows, and temporary popout, and restores the explorer expansion and sidebar state. It restores the original `data.json` bytes (or its absence), the two editor-size localStorage entries, the previous active tab, and the window's original background-throttling value. Existing tabs keep their notes and view modes. Math and Callout tests set their required options explicitly, then the shared cleanup restores the user's options.

Each output directory contains:

- `run.json`: the run ID, exact vault path, options and timeout.
- `settings-before.json`: the original plugin settings, when the file existed.
- `results.json`: checks, explicit skips, errors, cleanup errors and restoration results. `finished: true` is written only after cleanup. Reports are written atomically and polling ignores another run's ID.
- Navigation also produces screenshots, six native PDFs and `pdf-verification.json`.

CLI errors are checked even when Obsidian exits with status zero. Assertion failures and cleanup failures both make the command fail; a cleanup error does not overwrite the original assertion. `SIGINT` and `SIGTERM` request cancellation and wait for the same cleanup path. The in-app timeout interrupts the suite's next cancellable wait or checkpoint.

A frozen Obsidian process or a non-returning native operation cannot be forcibly unwound by this runner. If no completed cleanup report arrives, the command fails and retains the lock and settings backup. Inspect the recorded run and the development window before removing that lock or restoring the backup; do not start another suite while the old one can still write. Force-killing the runner also leaves the in-app timeout responsible for cleanup.

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

The build and 64 unit tests passed. Obsidian captured one `ResizeObserver loop completed with undelivered notifications` message during the first Banner run at 22:07 (Asia/Taipei). That run passed all included layout checks, and a later repeat of the Banner suite added no new captured errors. The cause of that isolated message was not established.

Banner playback remains deferred at the user's request. `--skip-playback` excludes repeated MP4/WebM autoplay and manual-pause checks and records the omission; it still checks video loading, view changes, split panes and resource cleanup. Without the flag those playback assertions still run and can fail. PDF pagination display remains a separate, deferred prototype.
