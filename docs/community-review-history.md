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

## Next-release candidate — local verification, 2026-11-17

The Community candidate based on `9cf765e2b04381a3cc68e331b664e36964e58346` adds combined icon/color selection, exact global line-width input, callout code-block backgrounds, and local documentation with refreshed demos. A fresh pre-push run passed 132 unit tests, the production build, release-package validation, and documentation build/link checks. The three plugin installation files exactly match the previously verified build deployed to the development and personal vaults. See the test history for native coverage and its limits. [Integration testing](integration-testing.md#next-release-candidate--2026-11-17)

The Community source still excludes the Full remote Mermaid loader. Simple Icons uses the host network API to retrieve graphic and color JSON, with jsDelivr use and caching disclosed in the README. This is local verification, not a new Directory approval: no service preview report has been received for this candidate. Version metadata remains 0.3.2 and the changes remain under Unreleased; request **Review branch** for the pushed candidate's exact commit before preparing a new version/tag. The documentation workflow only builds a review artifact and does not deploy Pages.

## Community preview — documentation CSS findings, 2026-11-17

The maintainer supplied a completed preview screenshot for `10f4291107f6989c08e73f7145cc434be83d9ff6`. The visible results report two CSS warnings in `site/.vitepress/theme/style.css`: partial `text-decoration` support against the scanner's Obsidian 1.11.4 baseline at line 38, and two `!important` declarations at line 77. The dependency scan passed. This screenshot does not establish the results of other review sections or release-asset checks.

Both reported rules belong to the documentation website, not the plugin stylesheet. The follow-up replaces the secondary link's decorative underline with a bottom border and gives the code-card paragraph a more specific selector, retaining its intended 11 px text and zero bottom margin without `!important`. The reported declarations are removed from the source rather than hidden from scanning. Recheck the pushed follow-up with **Review branch** to confirm service-side resolution; no new preview result is implied by the local CSS and website checks.

## Community preview — maintainer-confirmed pass, 2026-11-17

The maintainer confirmed that the preview for `3f62957d52dc96103dc3f5855cfede9f780e01eb` passed. The supplied screenshot shows Completed, a passing dependency scan, and no remaining CSS findings. This resolves the two documentation CSS warnings reported for `10f4291` in the previous screenshot. The confirmation applies to this source preview; no 0.4.0 release-asset or build-verification report has been supplied.

Prepare 0.4.0 from this reviewed implementation, with version metadata, changelog, and release documentation updated. The plugin implementation stays unchanged. Official assets will be built and attested by the existing tag-bound release workflow; record that workflow's verification separately from any subsequent Community Directory release review.

## 0.4.0 — published assets verified, 2026-11-17

[Release 0.4.0](https://github.com/yaroxy/obsidian-patch/releases/tag/0.4.0) was published as the latest regular release from tag commit `556ab7b18da76acab52be07dfe7c8f2920a382c6`, following the maintainer-confirmed source preview above. The [Prepare release workflow](https://github.com/yaroxy/obsidian-patch/actions/runs/44048875564) built Community on GitHub-hosted Node.js 22, passed tests/package checks, generated attestations, and verified its uploaded draft. Community Build, documentation deployment, and Full's separate Build also passed.

Before publication, the draft target, version, three attachment names, sizes, and SHA-256 digests were checked against the locally verified Community build. `gh attestation verify` passed for each file with the source ref fixed to `refs/tags/0.4.0`, source digest fixed to the tag commit, signer workflow fixed to `.github/workflows/release.yml`, and self-hosted runners disallowed. The public latest-release response subsequently confirmed `draft: false`, `prerelease: false`, version 0.4.0, and unchanged attachment digests.

The verified hashes are `main.js` `da28a18488765d8712375bb76d66dcbe7adf7d30b40dd0aa23c56eb2f13985b5`, `manifest.json` `83423bb25dfe53e487c1053188e9d6529bba85226eb5b40c55da1f1def44e0dc`, and `styles.css` `f14d16a0f8c0ee0d7828bdb493e0e4e144adebf435957e13db03265a923bed05`. These workflow/asset checks do not constitute a Community Directory release-review result; append that report when available. Full 0.4.0 source is at `a18cfa87012bae4ba773cf53308f4f97fb7530cd` and is not an official release attachment.

## Community branch preview — 2026-11-18

The Obsidian Community dashboard completed a **Review branch** scan for the exact Community commit `3be0d86e46eb04ea183da318e5b88540516b672f`. The report showed one source warning and a passing dependency check. It listed no errors. This preview covered the branch ahead of the next release. [Reviewed commit](https://github.com/yaroxy/obsidian-patch/commit/3be0d86e46eb04ea183da318e5b88540516b672f) · [Maintainer review dashboard](https://community.obsidian.md/account/plugins/patches)

The source warning flagged the GitHub folder picker passing `byPath.compare` to `Array.prototype.sort`. The `Intl.Collator.prototype.compare` getter returns a function already bound to its collator. A local check sorted `docs/1`, `docs/2`, and `docs/10` in numeric order with both the detached comparator and an explicit call. [Reported line](https://github.com/yaroxy/obsidian-patch/blob/3be0d86e46eb04ea183da318e5b88540516b672f/src/features/callout/folder-suggest.ts#L38) · [ECMA-402 compare accessor](https://tc39.es/ecma402/#sec-intl.collator.prototype.compare)

Both branch builds and the documentation deployment passed on GitHub. The follow-up changes the folder picker to call `byPath.compare(left, right)` explicitly in both distributions. [Community build](https://github.com/yaroxy/obsidian-patch/actions/runs/44295018661) · [Full build](https://github.com/yaroxy/obsidian-patch/actions/runs/44295018687) · [Pages deployment](https://github.com/yaroxy/obsidian-patch/actions/runs/44295018799)

### Follow-up preview for the explicit comparator

The dashboard marked preview `fd58c47bc1a53eab02f254b518e1ae460bb6f6f5` **Completed** on 2026-11-18. The final report displayed a passing dependency check and no source warnings, errors, or recommendations. The earlier folder-sort warning cleared. Community passed 138 local unit tests and 65 Callouts checks in the development vault. Full passed 143 local unit tests. Both production packages passed local validation. The two GitHub builds and Pages deployment succeeded. The published plugin version at the time of this branch preview was 0.4.0. [Community build](https://github.com/yaroxy/obsidian-patch/actions/runs/44296490603) · [Full build](https://github.com/yaroxy/obsidian-patch/actions/runs/44296490576) · [Pages deployment](https://github.com/yaroxy/obsidian-patch/actions/runs/44296490542)

## 0.5.0 release — 2026-11-18

The regular Community release was published from `d268cb0e0ed99b7650ad2ad5143efaa1290d6319`, including the completed branch-preview record. Its plugin source matches the reviewed `fd58c47` implementation. The Full source was synchronized at `2db95be`. The three downloaded Community attachments matched the locally tested files byte for byte. Their GitHub attestations verified against `release.yml` and `refs/tags/0.5.0`. [Release](https://github.com/yaroxy/obsidian-patch/releases/tag/0.5.0) · [Release workflow](https://github.com/yaroxy/obsidian-patch/actions/runs/44302042421)

| Attachment | SHA-256 |
| --- | --- |
| `main.js` | `0f28ccb12c83d92d21704c82edc36b0626c20eddaacc99ef29bb1a1b945191fa` |
| `manifest.json` | `bd20e04af1da79efb63418a2e2dc608853f8cbaa272aaaa85277132d7b7c720d` |
| `styles.css` | `7f4ab73ce5f3b2f7a09c7327699eba3e4312b61e2b6c9dba6e30f36458cd6ada` |

The Directory marked the release scan **Completed** and listed **0.5.0** as the current published version. The service reproduced `main.js` byte for byte, verified the displayed asset attestations, and passed the dependency check. The single release warning concerns the 10,812,781-byte `main.js`, which exceeds the 5 MB per-file limit on Obsidian Sync Standard. The behavior section listed vault enumeration as a recommendation and individual vault-file reads as a pass. No source error was reported. All five approved desktop screenshots appeared on the public listing in the selected order. [Directory listing](https://community.obsidian.md/plugins/patches) · [Maintainer report](https://community.obsidian.md/account/plugins/patches)

## 0.5.1 branch preview — 2026-11-19

The maintainer reported that the Community **Review branch** scan completed and approved proceeding with release. The preview branch pointed to `f62d1bc66b7dfd7a1fcd3b599a80ff41b47f2d38`. The release preparation retains that plugin implementation and advances version metadata and publication documentation. The published package receives its own Directory scan. [Reviewed candidate](https://github.com/yaroxy/obsidian-patch/commit/f62d1bc66b7dfd7a1fcd3b599a80ff41b47f2d38)

## 0.5.1 release disclosures — 2026-11-24

The maintainer supplied a Directory screenshot for the published 0.5.1 asset. It shows a 5 MB size warning, 28 network calls, runtime Base64 use and vault enumeration. Malware, obfuscation and network-request scans are marked unavailable. The screenshot supplies no result for those three scans. [Release](https://github.com/yaroxy/obsidian-patch/releases/tag/0.5.1)

The downloaded `main.js` is 10,813,900 bytes (SHA-256 `a90423d4a58790bd5be386a33db0157afbbe4303224d1eef56ee981b33cd6dd1`). It contains 27 calls to KaTeX’s parser method `.fetch()` and one definition of that method, which reads the next TeX token. This matches the displayed count numerically. The report supplies no per-call locations. Patches uses Obsidian’s `requestUrl` for the Simple Icons version lookup, graphics and color metadata. The installed package includes two local gzip/Base64 Mermaid icon packs. The banner picker enumerates vault files to find media, and the GitHub folder setting enumerates folders for completion. [Network and privacy](../site/privacy.md)

In the local working tree based on `a98b4ff`, the Community bundle went from 10,852,696 to 10,298,183 bytes after removing the duplicate ELK adapter and sharing concurrent Simple Icons loads. Mermaid 12 supplies all seven ELK layout names itself. The two icon packs still account for 4,701,930 bytes of the new bundle, which exceeds the Sync Standard per-file limit. These are local measurements of an unreleased build. [Mermaid layouts](https://mermaid.js.org/config/layouts.html) · [Obsidian Sync limits](https://obsidian.md/sync)

### Local distribution comparison — 2026-11-24

After the [table and callout fixes](integration-testing.md#table-and-callout-review-fixes--2026-11-24), the production Community `main.js` measured 10,297,850 bytes. Temporary builds used the same entry point, production minification and Mermaid 12.3.0. For Tiny, the upstream IIFE export was bound to the plugin module. The sizes below are raw file bytes, excluding any future icon download or import UI.

| Renderer bundled with Patches | Diagram icon data in the build | Bytes in `main.js` |
| --- | --- | ---: |
| Standard Mermaid | Neither pack | 5,595,942 |
| Mermaid Tiny | Neither pack | 3,158,951 |
| Mermaid Tiny | `material-icon-theme` as plain JSON | 4,013,140 |
| Mermaid Tiny with the official ELK adapter 1.0.2 | Neither pack | 5,653,491 |

The current Logos JSON is 8,735,991 bytes. The repository's existing gzip compressor produced 3,252,754 bytes of binary data for that pack. An optional versioned download could cache those bytes directly and decompress them locally, keeping that file below the same Sync limit. A local file import could use the same format.

The plain-JSON candidate had zero literal `.fetch(` calls and still contained two `atob(` and two `btoa(` calls. Simple Icons still uses Obsidian's `requestUrl`. Tiny omits mind maps, architecture diagrams, diagram KaTeX and built-in ELK. These experiments measured packaging only. The production renderer and icon distribution still match the standard offline build, and the Directory has not scanned these alternatives. [Mermaid Tiny](https://mermaid.js.org/config/usage.html#tiny-mermaid) · [Directory policies](https://docs.obsidian.md/community-directory/developer-policies) · [Plugin installation assets](https://docs.obsidian.md/plugins/releasing/submit-plugin)

### Optional icon storage with the standard renderer — 2026-11-24

Local builds retained standard Mermaid 12.3.0 and varied only the two embedded data payloads. The final column adds one binary gzip cache file for each omitted pack. All sizes count raw bytes for `main.js` plus those caches. The manifest and stylesheet are common to every case. A future download interface and cache metadata would add some overhead.

| Icon data installed with Patches | Initial bytes | Bytes after caching both packs in total |
| --- | ---: | ---: |
| Logos and Material bundled | 10,297,850 | 10,297,850 |
| Material bundled, Logos optional | 5,960,842 | 9,213,596 |
| Both packs optional | 5,595,942 | 9,122,370 |

Both optional downloads would contain only versioned icon data. Local gzip caches would occupy 3,252,754 bytes for Logos and 273,674 bytes for Material. The current production build still includes both packs offline. The exercise introduced no release or Directory scan. [Single-plugin validation](integration-testing.md#single-plugin-candidate-and-editor-findings--2026-11-24)

## Editor updates branch candidate — local verification, 2026-11-24

Local ESLint using the recommended `eslint-plugin-obsidianmd` 0.6.0 configuration on all 51 TypeScript source files reported zero errors and the six previously recorded `prefer-active-doc` warnings in Active Line, Callout Code and Mermaid. Callout appearance and table fonts now use static CSS rules and element-level custom properties. The historical forbidden-element error for creating a stylesheet was absent. The standard offline Mermaid renderer and both icon packs remain bundled, so the 5 MB Sync Standard warning is still expected. The maintainer's Directory preview for this candidate is pending. [Candidate build and native verification](integration-testing.md#editor-updates-branch-candidate--2026-11-24)

## Resizable preview follow-up — local verification, 2026-11-24

The table conversion preview now shares the desktop resize grip used by the table and callout editors and stores its dimensions separately. The updated default build passed the [native conversion and editor checks](integration-testing.md#resizable-conversion-preview--2026-11-24). Local recommended ESLint on all 51 TypeScript source files reported zero errors and the same six `prefer-active-doc` warnings. The public Directory entry still listed 0.5.1 on this date. An official branch preview result for this change is pending.

## 0.6.0 branch preview — maintainer-confirmed pass, 2026-11-24

The maintainer confirmed the Community branch preview passed for commit `1a64287718438134b8f70c92c7fb777454618378`. The screenshot shows **Completed** and a passing dependency check with no vulnerable dependencies found. The 0.6.0 build reproduces the reviewed `main.js` and `styles.css` byte for byte. The Directory reviews the published assets separately after release. [Reviewed commit](https://github.com/yaroxy/obsidian-patch/commit/1a64287718438134b8f70c92c7fb777454618378)

The [release workflow](https://github.com/yaroxy/obsidian-patch/actions/runs/45359246067) prepared a GitHub draft from tag `0.6.0` at `43d4e846157259fd1fe381ee9cc21d3fe33cc3d2`. Each of the three downloaded attachments matched the clean local build byte for byte. GitHub CLI verified the provenance of each attachment against this commit, tag, and repository release workflow on a GitHub-hosted runner.

## 0.7.0 Git and appearance candidate — 2026-11-24

The maintainer's Directory screenshot shows a completed preview for `417027fb6394a6e838bbd015c753225c0c87a7e5`. The visible source warnings cover the gutter's DOM element creation, CommonJS import style and desktop guards for three Node built-ins. The 0.7.0 candidate creates each gutter marker through its own editor window's Obsidian helper and loads the three modules inside an explicit desktop-app check.

The local recommended Obsidian ESLint configuration reported no diagnostics in the Git feature and six existing main-window warnings elsewhere. [0.7.0 package and native checks](integration-testing.md#070-community-candidate--2026-11-24)

## 0.7.0 branch preview and release draft — 2026-11-24

The maintainer confirmed the preview for `b1471f3b662890b6a03d9b0312d33fb6ed9697f1` completed. The screenshot shows a passing dependency check. Tag `0.7.0` points to that commit. The [release workflow](https://github.com/yaroxy/obsidian-patch/actions/runs/45375674004) created a draft with all three Community assets. The downloaded attachments matched the local build byte for byte, and GitHub CLI verified each attestation against this workflow, tag and commit. The Directory reviews the published release separately.

## 0.7.0 published release review — 2026-11-24

The maintainer's screenshot shows the Directory release review completed for version `0.7.0` at `b1471f3`. The visible release checks verified GitHub artifact attestations for `main.js` and `styles.css`. GitHub lists the [published release](https://github.com/yaroxy/obsidian-patch/releases/tag/0.7.0) with a 10,332,274-byte `main.js`, above Obsidian Sync Standard's 5 MB per-file limit. The README advises installing the plugin separately on each device using that plan.

The visible behavior checks warned about direct filesystem access and shell execution, recommended reviewing vault enumeration, and passed individual vault reads. In the [tagged Git implementation](https://github.com/yaroxy/obsidian-patch/blob/0.7.0/src/features/git-diff/head.ts), desktop discovery uses `fs.stat` to check for Git metadata in the vault directory and its ancestors. The comparison invokes the local Git executable with separate arguments to read the committed revision, tree entry and blob. The [cover picker](https://github.com/yaroxy/obsidian-patch/blob/0.7.0/src/features/banner/picker.ts) lists vault files to filter available media, and the [GitHub folder suggestions](https://github.com/yaroxy/obsidian-patch/blob/0.7.0/src/features/callout/folder-suggest.ts) list folders for path completion.

The maintainer's public Scorecard screenshot for 0.7.0 shows five disclosures. Two flag network-request calls and runtime Base64 conversion. The other three show unavailable results for malware, obfuscation and network-request scans. The screenshot leaves the call count and matched locations collapsed. In the tagged source, installing or updating Simple Icons can make up to four JSON requests to jsDelivr, and Mermaid decodes its two embedded icon packs locally. The three public warnings cover the Sync file-size limit and the two desktop Git capabilities described above. [Simple Icons requests](https://github.com/yaroxy/obsidian-patch/blob/0.7.0/src/features/icons/simple-icons.ts) · [Mermaid icon packs](https://github.com/yaroxy/obsidian-patch/blob/0.7.0/src/features/patch-mermaid.ts)

### Local 0.7.0 measurements and alternatives

The local release artifact matches the [recorded 0.7.0 SHA-256](integration-testing.md#070-community-candidate--2026-11-24). Its esbuild metafile attributes 4,337,019 bytes to the Logos data module and 364,911 to Material Icon Theme. Subtracting those contributions from 10,332,274 bytes leaves 5,630,344 bytes before implementing a download interface. The bundle contains four literal `atob(` calls and two `btoa(` calls. The plugin's icon decoder accounts for one of the four `atob(` calls. The bundle also contains the KaTeX parser's `fetch()` method for obtaining the next TeX token. The Directory supplies its own scan results for each release. [Optional icon storage measurements](#optional-icon-storage-with-the-standard-renderer--2026-11-24) · [Review a candidate branch](https://docs.obsidian.md/community-directory/manage-entry)

A post-install option could offer version-pinned icon data from the plugin settings, save a verified gzip file through the vault adapter, and read it locally through Mermaid's existing icon loaders. Opening a diagram offline with a missing pack should identify the pack and offer installation or local import. Users upgrading from 0.7.0 currently have both packs available on first use offline. That experience and the remaining size above 5 MB matter when deciding whether to change distribution. [Mermaid icon pack API](https://mermaid.js.org/config/icons.html) · [Directory network disclosures](https://docs.obsidian.md/community-directory/developer-policies)

The vault adapter can check a vault-root `.git` entry, including a hidden file. Discovering a working tree above the vault or locating an external object database extends beyond the documented vault-relative operations. On Debian, a temporary fixture confirmed that running `git rev-parse --is-inside-work-tree` in the vault directory recognized a repository root, a nested notes folder and a linked worktree, and returned exit 128 for an ordinary folder. Using that command alone would remove the plugin's own parent-directory `fs.stat` loop but would start Git for discovery in ordinary vaults as well. Reading committed note contents would still require a Git implementation. These were local checks of Git and the release bundle. [Obsidian Vault and Adapter](https://docs.obsidian.md/Plugins/Vault) · [Git repository layout](https://git-scm.com/docs/gitrepository-layout)

### Post-install Mermaid icon packs — local candidate, 2026-11-24

The Community candidate moves both Iconify packs out of `main.js`, which now measures 5,638,040 bytes compared with 10,332,274 bytes in published 0.7.0. It still exceeds the Sync Standard 5 MB limit. Each pack's settings button downloads the pinned JSON from jsDelivr and verifies it before caching. Opening a diagram uses local icon data. The production package validator checks that neither icon JSON file is bundled. The resulting file still contains three literal `atob(` calls and two `btoa(` calls. The desktop development vault passed both live-download and local-cache runs. The Directory results above apply to published 0.7.0. A new Scorecard result is needed to determine the disclosures shown for this change.

### Heading numbering and workspace layout — branch candidate, 2026-11-25

The Community candidate for `codex/review-heading-numbering` adds display-only heading numbers, revises the editor gutters and desktop workspace minimum, and moves both Mermaid icon packs to optional verified downloads. A clean build passed 185 unit tests and release validation. Native development-vault checks covered heading layout, Git gutters and live icon installation. The candidate still exceeds the 5 MB Sync Standard limit and uses local filesystem and Git process access for desktop comparisons. These are local results. The Directory preview is pending. [Pre-push verification](integration-testing.md#community-pre-push-check--2026-11-25)

### Heading numbering preview — completed for c8f25a5, 2026-11-25

The maintainer's screenshot identifies a completed Directory branch preview for `codex/review-heading-numbering` at `c8f25a5`. It shows four source warning groups (unsafe member access, assignment and calls, and direct element creation) and three CSS groups (multicolumn support for `column-gap`, a sidebar `!important` declaration and a heading `:has()` selector). [Reviewed commit](https://github.com/yaroxy/obsidian-patch/commit/c8f25a567cc05cf0301e0581038e72a08ce4733b)

The follow-up narrows parsed YAML, types the desktop Electron interface and creates the detached elements with their owning window’s Obsidian helpers. The settings grid uses `gap`. Live Preview marks visible empty source lines for the heading spacing rule, and the workspace temporarily reserves a 200 px flex basis for an undersized sidebar. Local ESLint with the recommended Obsidian plugin 0.6.0 configuration reported zero errors across 65 TypeScript files and six pre-existing `prefer-active-doc` warnings outside the changed files. The three reported CSS constructs are absent from the plugin stylesheet. The updated commit awaits its own Directory preview.

### 0.8.0 release preparation — 2026-11-25

The candidate on `main` includes the fixes for the preview of `c8f25a5`. The 0.8.0 package passed local release validation and native checks on Debian KDE. Its 5,654,854-byte `main.js` remains above the 5 MB Sync Standard limit. The latest supplied Directory report covers `c8f25a5`. [0.8.0 candidate checks](integration-testing.md#080-community-release-candidate--2026-11-25)

## Before the next review

1. Read the current [developer policies](https://docs.obsidian.md/community-directory/developer-policies), then compare the candidate's source and default build against the previously failing patterns above. Remote dependency updates remain outside the Community distribution.
2. Check the complete Community source tree as well as the bundle. Confirm that release, migration, and integration commands cannot accidentally select a stale Full package in this checkout.
3. Run unit tests, the production build, release-package checks, and affected development-vault suites. Record the revision, host version, actual results, and skipped coverage in [Integration testing](integration-testing.md).
4. Push the reviewed candidate and preview its exact commit with **Review branch** before creating the next version tag. Resolve blocking errors using the report's actual scope; warnings and recommendations can remain with explicit reasons.
5. Follow [Releases and migration](releases.md) to create a new immutable tag and CI-built, attested release. Request the new release review on the existing directory entry and append its results here.
