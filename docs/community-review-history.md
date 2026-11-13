# Community Directory review history

This file records the automated reports supplied by the maintainer, their causes, and the evidence needed to close them. A local fix or passing test is not a passing Community Directory review. Reports below are historical snapshots; append a new version's result instead of rewriting an earlier failure as a success.

## Review boundaries

The directory reviews the manifest, release assets, source code, and build reproducibility separately. Its source scan is not limited to modules included in the bundle. The scanner selects `build` before `build:plugin` or `compile`, so the default build must produce the intended Community package. See [review management](https://docs.obsidian.md/community-directory/manage-entry) and the [scanning FAQ](https://docs.obsidian.md/community-directory/faq).

Community source and release tags belong on `main`. The separately maintained `codex/full` branch preserves opt-in remote Mermaid loading for manual installation outside the directory. A build flag that excludes remote code from `main.js` does not remove that code from the reviewed source tree. Keep the separation explicit in source, build commands, CI, and installation documentation; do not disguise a remote loader or move it into a scanner-excluded directory.

## 0.3.0 — failed review

Source: the maintainer's automated report for [release 0.3.0](https://github.com/yaroxy/obsidian-patch/releases/tag/0.3.0), commit `cbd9d13e165b019fbcf52f7ec594383e8e0491d6`. These findings were reported on 2026-11-13. The first report was incomplete; a later report added the build-verification warning.

| Finding | Cause and response | Evidence / remaining limit |
| --- | --- | --- |
| **Error:** description contains “Obsidian” | The directory already supplies that context. Removed it from `manifest.json` and added a release-metadata guard. | Included in 0.3.1; absent from the supplied 0.3.1 findings. |
| **Error:** unsafe `innerHTML` assignment in `patch-mermaid.ts` | Generated SVG was inserted as a string. Added DOMPurify sanitization and DOM-fragment insertion, with checks for unsafe URLs and local SVG references. | Included in 0.3.1; native Mermaid and hostile-SVG regression passed. This does not fix Mermaid's upstream loss of some icon `<use>` references. |
| **Warning:** release `main.js` differs from rebuilt output | Native gzip output varied between Node/zlib versions despite identical source and locked dependencies. Replaced build-time compression with pinned `fflate`, level 9, timestamp zero. | Clean Node 22 and Node 26 builds matched after the fix. The supplied 0.3.1 report contains no build-verification result; service-side success is not established by that omission. |
| **Recommendation:** missing artifact attestations | Release files had been uploaded without CI provenance. Added tag-bound CI builds, attestations, draft upload, and uploaded-asset checksum verification. | The 0.3.1 review explicitly reports verified attestations for `main.js` and `styles.css`. |
| **Warning:** `main.js` exceeds 5 MB | Complete Mermaid, layouts, and icon packs are bundled. | Accepted by the maintainer to preserve functionality; Obsidian Sync Standard cannot sync this file. |
| **Recommendation:** vault enumeration | The banner media picker lists eligible vault media paths so the user can search and select a cover. | Retained intentionally. This operation lists paths; individual file reads are a separate reported behavior. |
| **Warning:** unnecessary regex escape in banner configuration | An unnecessary `\[` escape was present. | Removed in 0.3.1. |
| **Warning:** missing direct CodeMirror dependencies | Source imported host-provided `state` and `view` packages without declaring them directly. | Declared versions matching the host API peers in 0.3.1; both remain external to the bundle. |
| **Warnings:** `globalThis`, cross-window `instanceof`, detached DOM creation | Banner and other views needed their owning window/document and supported host helpers. | 0.3.1 addressed window selection and type checks, but its `createDocumentFragment().create*()` replacement still triggered four DOM-helper warnings in 0.3.1. |
| **Warnings:** unbound banner/PDF methods | Method references were extracted before invocation. | Banner callbacks now retain their receiver. PDF's private-host adapter intentionally invokes captured methods with `.call`/`.apply`; those three warnings remain in 0.3.1. |
| **Warning:** `fetch` in Simple Icons | Network requests bypassed the host API. | Changed to `requestUrl` in 0.3.1, retaining timeouts and offline fallback. |
| **Warnings:** `Function` constructor / implied eval | Full used a constructed function for remote module imports. | Replaced with native `import(url)` in 0.3.1. That removed the constructor but did not resolve the Community source-policy issue; see the next review. |
| **Warnings:** unsafe persisted-data assignment/member access | `loadData()` values were accessed without an explicit unknown-value boundary. | Added record validation before settings parsing in 0.3.1. |
| **Warnings/recommendations:** missing declarative settings, repeated `display()`, deprecated dynamic slider tooltip | The settings tab used older rendering APIs. | Adopted searchable setting definitions, `update()`/DOM refresh, and inline slider values in 0.3.1. |
| **Recommendation:** deprecated `execCommand` | The HTML table editor uses native contenteditable editing/formatting commands. | Retained pending an editing/undo-preserving replacement; still reported in 0.3.1. |

The dependency scan reported no vulnerable dependencies. The vault-read check passed. Those results do not override the manifest/source errors.

## 0.3.1 — new blocking source errors

Source: the maintainer's automated report for [release 0.3.1](https://github.com/yaroxy/obsidian-patch/releases/tag/0.3.1), based on commit `f85579534c9b8d3c6c585d03b17686db86d7c46f`. The supplied report does not include a build-verification section or a dated scan identifier.

| Finding | Why the previous change was insufficient | Next response |
| --- | --- | --- |
| **Error:** attaching a `style` element, `src/features/icons.ts:75` | Replacing `document.createElement` with `createEl` kept the prohibited dynamic stylesheet behavior. | Put icon presentation in `styles.css`; apply only an icon class and encoded SVG data-URL variable to explorer title nodes, with node-rebuild, rename, window, and unload handling. |
| **Error:** unsafe variable import, `src/features/mermaid-runtime/remote.ts:14` | The Full-only loader remained in the reviewed source tree despite being excluded from the Community bundle. Native import is still remote code loading. | Preserve Full in its own distribution branch; remove its loader and build target from Community source and official release CI. Verify the actual Community candidate with **Review branch**. |
| **Warnings:** DOM helpers, `banner/cover.ts:43`, `banner/media.ts:119`, `heading-levels.ts:14`, `table/conversion.ts:70` | `createDocumentFragment()` was itself flagged; chaining a host helper after it did not address the whole rule. | Use detached host helpers from the correct window directly, preserving ownership in popout windows. |
| **Warnings:** unbound methods, `pdf-export.ts:28,29,43` | The adapter captures private host methods before wrapping them. | Retain the explicit receiver invocation and document the warning. Do not annotate receiver-dependent methods with `this: void` or bind a prototype as their receiver merely to silence lint. |
| **Recommendation:** `execCommand`, `table/editor.ts:374,385,386` | Existing contenteditable implementation. | Retained; replacing it requires table-formatting and undo regression coverage. |

The large-file warning and vault-enumeration recommendation remain accepted. `main.js` and `styles.css` attestations, vault reads, and the dependency scan explicitly passed. No new manifest error was included.

At the time of the 0.3.1 report, the follow-up changes were local candidates awaiting commit, review, and a new release. Neither 0.3.0 nor 0.3.1 assets or tags should be replaced. Record the new report here after scanning; do not infer approval from a successful build or an absent section.

## Local follow-up checks — not a directory review

The split Community source passed 124 unit tests, its production build, and release-package validation; Full passed 129 tests and its own build/validation after receiving the same icon and DOM fixes. A new native icon suite passed 12 lifecycle checks, including a real popout file explorer, rename and lazy rows, unload/reload, and cleanup. See [Integration testing](integration-testing.md) for the candidate's complete regression scope and remaining gaps.

The official `eslint-plugin-obsidianmd` recommended configuration was run against all 38 Community TypeScript source files using isolated ESLint 9.39.4, plugin 0.5.1, TypeScript 6.0.3, and typescript-eslint 8.72.2. The temporary TypeScript version was necessary because the lint parser did not support the repository's TypeScript 7; project dependencies were not changed. The dynamic-style and detached-DOM rules produced no findings, and in-memory positive controls confirmed that the old patterns were detected. This is not a clean result for the complete recommended configuration:

| Local finding | Count and severity | Disposition |
| --- | --- | --- |
| PDF `unbound-method` | 3 errors | The same captured methods that the supplied directory report labels warnings. Explicit `.call`/`.apply` receivers are retained; local and service severity are recorded separately. |
| `prefer-active-doc` | 6 warnings | Additional local findings in `active-line.ts:11,17`, `callout-code.ts:11,17`, and `patch-mermaid.ts:207,208`. Broader popout behavior is follow-up work; these were not included in the supplied 0.3.1 report. |
| Table `execCommand` deprecation | 3 warnings | Existing editing/undo behavior is retained. |

Local reports and the exact lint configuration are under ignored `dist/validation/community-review-followup/`. At the time of these local checks, source isolation still awaited a service preview; its subsequent result is recorded below.

## Community preview — completed without reported errors, 2026-11-13

Source: the maintainer's completed **Review branch** screenshot and accompanying report. The exact ref and commit are `fc5c2f556dcfefab9aefd96ab5c0ff5b0af4a505` on Community `main`. The screenshot labels this run **Preview**, with status **Completed**; the supplied report contains no Error findings.

| Result | Reported scope | Disposition |
| --- | --- | --- |
| No reported source errors | The dynamic `style` element and variable remote import errors are absent. The four detached-DOM helper warnings are also absent. | The source changes are supported by this service preview, not only local tests. |
| **Warning:** unbound methods | `src/features/pdf-export.ts:28,29,43` | Retain the explicit `.call`/`.apply` receivers in the native PDF adapter; no behavior change solely to silence this warning. |
| **Recommendation:** deprecated `execCommand` | `src/features/table/editor.ts:374,385,386` | Retain the existing table editing and undo behavior pending a separately tested replacement. |
| **Pass:** dependency scan | No vulnerable dependencies found. | Confirmed for this preview's reviewed inputs. |

The additional six `prefer-active-doc` warnings found by local ESLint were not included in this service report; their absence does not establish that the underlying popout concerns were fixed. Local lint severity and service severity remain distinct.

This result applies to the Community commit above, not to `codex/full` or the previously published 0.3.1 assets. The supplied preview report contains no release-asset or build-verification results, so it does not establish acceptance of future 0.3.2 assets, their attestations, reproducibility, or public directory availability. Next, prepare a new version and publish the Community package through the release workflow, then record its release review here. Keep the published 0.3.1 tag and assets unchanged.

## Remaining warning fixes — local verification, 2026-11-13

After the Community preview, the maintainer requested fixes for both remaining source findings. The PDF adapter now binds `print` and `printToPdfDesktop` to their modal. The shared `Modal.open` hook retains its dynamic receiver and saves/restores the complete property descriptor, preserving original function identity and flags even when native export throws; an unsupported non-writable host method stays on the native path. No receiver-dependent method is marked `this: void` and no lint rule is suppressed.

The table editor no longer calls `execCommand`. `Selection`/`Range` insertion accepts only a selection within one editable cell or caption, inserts plain text and `<br>` nodes, normalizes line endings, and retains a trailing caret placeholder when needed. It updates the existing table model/history directly; cancellable `beforeinput` undo/redo requests use the same history. The existing native test harness still uses `execCommand` to simulate ordinary typing; production code does not.

Official local recommended lint now reports zero errors and only the six previously recorded `prefer-active-doc` warnings. The PDF unbound-method and table deprecation findings are absent. Community passed 127 unit tests and Full passed 132, with both production builds and package checks passing. On Community, native Table passed 30 checks, Markdown conversion 16, Navigation 16, and all six actual PDF checks passed. Details and limitations are in [Integration testing](integration-testing.md).

These changes have been synchronized to both working trees but have not received a new service preview. The earlier preview of `fc5c2f5` does not cover this later implementation. Recheck the next committed Community revision with **Review branch** before publishing. Local results are retained under ignored `dist/validation/remaining-warnings/`.

## Community preview — maintainer-confirmed pass, 2026-11-13

The maintainer confirmed that the follow-up preview passed and both the PDF unbound-method warning and table `execCommand` recommendation disappeared. The requested scan ref was Community commit `a4ba9639094548ab4cbf187a6d5a0e44e97e89f2`. This entry records that confirmation; no new full report or scan identifier was supplied, so it does not infer results for unreported checks.

Prepare 0.3.2 from that reviewed Community implementation, with version metadata and release documentation updated. Full remains a separate manual distribution and receives the same feature version. Preview success does not establish that 0.3.2 release assets have passed attestation/build verification or that the directory listing is publicly available; append the release review separately after publication.

## Before the next review

1. Read the current [developer policies](https://docs.obsidian.md/community-directory/developer-policies), then compare the candidate's source and default build against the previously failing patterns above. Remote dependency updates remain outside the Community distribution.
2. Check the complete Community source tree as well as the bundle. Confirm that release, migration, and integration commands cannot accidentally select a stale Full package in this checkout.
3. Run unit tests, the production build, release-package checks, and affected development-vault suites. Record the revision, host version, actual results, and skipped coverage in [Integration testing](integration-testing.md).
4. Push the reviewed candidate and preview its exact commit with **Review branch** before creating the next version tag. Resolve blocking errors using the report's actual scope; warnings and recommendations can remain with explicit reasons.
5. Follow [Releases and migration](releases.md) to create a new immutable tag and CI-built, attested release. Request the new release review on the existing directory entry and append its results here.
