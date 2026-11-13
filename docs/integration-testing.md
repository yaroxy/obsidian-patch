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
node scripts/test-banner.mjs /path/to/dev-vault --skip-playback
node scripts/test-runner-recovery.mjs /path/to/dev-vault
```

Run the Mermaid suite against the full build separately:

```sh
npm run build:full
PATCHES_BUILD=full node scripts/test-mermaid.mjs /path/to/dev-vault
```

- Obsidian 1.15.0 or later must finish loading, expose the CLI developer commands, and have no open dialogs in the development window.
- Runners deploy `dist/community/` by default. To test the full build, first run `npm run build:full`, then prefix a runner command with `PATCHES_BUILD=full`, for example `PATCHES_BUILD=full node scripts/test-table.mjs /path/to/dev-vault`.
- `OBSIDIAN_CLI` overrides the executable. On macOS the runner prefers `/Applications/Obsidian.app/Contents/MacOS/obsidian-cli`, avoiding a PATH entry that launches the GUI executable. Other installations fall back to `obsidian` on PATH.
- Banner needs `ffmpeg` and `gif2webp` on PATH. Its image, portrait, GIF, animated WebP, MP4 and WebM samples are generated inside its fixture directory; a vault-root `banner.png` is no longer needed.
- Navigation needs `python3` with `pypdf` and `pdfplumber`. Set `PDF_PYTHON` to a Python environment with those packages. PDF verification is required and is not silently skipped.
- The optional second positional argument chooses an output directory. Otherwise each run gets a unique temporary directory, printed as `Results: …`.
- A per-vault lock prevents concurrent suites from overwriting one another's fixtures and settings. Run suites sequentially.

## Isolation and reports

`scripts/lib/integration-runner.mjs` owns CLI selection, preflight, deployment and result polling. `scripts/lib/obsidian-session.js` runs one suite inside Obsidian and owns its temporary tab, timeout and cleanup. A suite receives that tab, a cancellable `wait`, and a shared report; it must not reuse an existing user tab or leave asynchronous work running after returning.

The runner retains the newly deployed plugin build and test fixtures for inspection. It restores the original `data.json` bytes (or its absence), the two editor-size localStorage entries, the previous active tab, and the window's original background-throttling value. Existing tabs keep their notes and view modes. Math and Callout tests set their required options explicitly, then the shared cleanup restores the user's options.

Each output directory contains:

- `run.json`: the run ID, exact vault path, options and timeout.
- `settings-before.json`: the original plugin settings, when the file existed.
- `results.json`: checks, explicit skips, errors, cleanup errors and restoration results. `finished: true` is written only after cleanup. Reports are written atomically and polling ignores another run's ID.
- Navigation also produces screenshots, six native PDFs and `pdf-verification.json`.

CLI errors are checked even when Obsidian exits with status zero. Assertion failures and cleanup failures both make the command fail; a cleanup error does not overwrite the original assertion. `SIGINT` and `SIGTERM` request cancellation and wait for the same cleanup path. The in-app timeout interrupts the suite's next cancellable wait or checkpoint.

A frozen Obsidian process or a non-returning native operation cannot be forcibly unwound by this runner. If no completed cleanup report arrives, the command fails and retains the lock and settings backup. Inspect the recorded run and the development window before removing that lock or restoring the backup; do not start another suite while the old one can still write. Force-killing the runner also leaves the in-app timeout responsible for cleanup.

## Verified scope — 2026-11-13

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
