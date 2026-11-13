# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Community source and official releases now live on `main`; the separate `codex/full` branch retains opt-in remote Mermaid versions for manual builds. Each branch builds and validates its own distribution by default.
- Record Community Directory review failures, causes, accepted warnings, and verification boundaries in a dedicated review history.

### Fixed

- Render explorer icons using static CSS and per-row image masks instead of attaching style elements, while preserving lazy rendering, path changes, window ownership, and unload cleanup.
- Create detached banner, heading, and table-conversion elements with supported host helpers directly instead of native document fragments.

## [0.3.1] - 2026-11-13

### Added

- A manual GitHub release workflow that builds and checks both variants, attests the three Community installation files, and prepares a release draft from an existing version tag.

### Changed

- Updated installation instructions for the published 0.3.0 release, clarified Community and Full builds, and documented when to remove the old plugin after migration.
- Settings now use the declarative API so individual controls appear in settings search, while retaining alphabetical groups, immediate updates, and reset buttons.
- Simple Icons requests use the host network API with the existing timeout and offline fallback behavior.
- Full builds use native dynamic imports for remote Mermaid modules instead of constructing a function from a string. Community builds still exclude that loader.
- Explicit CodeMirror dependencies match the host API's existing peer versions and remain external to both bundles.
- Build-time icon compression uses a pinned JavaScript implementation with a fixed timestamp so native zlib versions do not change release bytes; the complete icon data remains bundled.

### Fixed

- Removed the redundant product name from the plugin description and added a release check to catch it before publishing.
- Sanitize generated Mermaid SVG before inserting DOM nodes, preserving diagram styles, HTML labels, safe local shape references, and note links while removing scripts, event handlers, and unsafe URLs.
- Preserve each note's document when creating banner, heading, table-conversion, and icon elements, and retain the receiver when invoking banner actions.

## [0.3.0] - 2026-11-13

### Added

- Separate community and full builds from the same source. `npm run build` writes the community package to `dist/community/`; `npm run build:full` writes the full package to `dist/full/`.
- A migration command that previews the move from `obsidian-patch` to `patches`, then backs up and migrates settings, enabled-plugin entries, and command hotkeys when explicitly applied with Obsidian closed.
- Release checks that require package, lockfile, manifest, and compatibility-map versions to agree before building publishable files.

### Changed

- Renamed the plugin to Patches with the plugin ID `patches`. Note properties, `patch-mermaid` blocks, and existing CSS customization names are unchanged.
- Minimum Obsidian version raised to 1.15.0, matching the recorded desktop test baseline.
- Community builds contain only bundled Mermaid and omit remote Mermaid/ELK loading and its settings. Old Latest or Custom choices become Bundled; full builds retain all three options.
- Integration runners deploy the selected build package and use the new plugin ID. Both build variants share settings, so a Community Directory update replaces a manually installed full build.

### Fixed

- Corrected the release metadata workflow after the 0.2.0 preview shipped with `0.1.0` in its plugin manifest. The published 0.2.0 tag remains unchanged.

## [0.2.1] - 2026-11-13

### Fixed

- Aligned the plugin manifest, npm package, lockfile, and compatibility map with the release version. The 0.2.0 release shipped a manifest that still reported 0.1.0.

### Changed

- Set the minimum Obsidian version to the tested baseline, 1.15.0.

## [0.2.0] - 2026-11-13

The first GitHub public preview was published under the name Obsidian Patch. Its package version was 0.2.0, but the attached plugin manifest still reported 0.1.0.

### Added

- Markdown-to-HTML table conversion from the cursor or a selection of complete tables, available through a command and the editor context menu. Tables open as editable previews with batch navigation; confirmation writes the whole batch in one isolated undo step. Alignment, inline formatting and links survive, and stale notes or unsupported content cannot cause a partial conversion.
- Heading Levels: right-aligned H1–H6 labels in Reading View, Live Preview, and Source mode, with room for wrapped headings and a toggle under Editor. Labels do not change note source or appear in PDFs.
- PDF Export: heading bookmarks and same-note heading jumps through Obsidian's native desktop export dialog. Both features can be toggled independently; Unicode headings, common Markdown fragments, and repeated-heading fragments are supported.
- Callout Editor: edit a callout's type, title, fold state, metadata, and content in a form with a rendered preview, from a button on the callout in Reading View and Live Preview or with **Edit callout**. **Insert callout** adds a callout or wraps the selected lines in one, and **Convert to text** and **Convert to blockquote** unwrap one. A header-only change rewrites only the header line. A GitHub panel tells whether GitHub renders the callout as an alert and can make it compatible, and notes with `github: true` or in chosen folders get a status bar count of callouts GitHub would show as plain blockquotes.
- Math Format: **Format math block** and **Format all math blocks in note** indent the environments of `$$` blocks, put each row of alignment environments on its own line, line up the `&` of the rows, and remove trailing spaces, changing only whitespace outside braces so formulas render as before. Blocks in callouts and lists keep their markers. The indent and the alignment of `&` and row ends are settings.
- HTML Tables: a visual editor for HTML tables in notes. **Insert HTML table** adds a new table at the cursor, and **Edit table**, on hover in Reading View and Live Preview, or **Edit HTML table** from the command palette, opens an existing one. Cells are edited in place; drag across cells to merge or split them, insert or delete rows and columns, toggle header cells, set alignment, and edit the caption, with undo and redo. The editor writes HTML that renders cleanly in Obsidian, keeps the markup of cells you do not touch, and writes nothing when a table is unchanged.
- The HTML table and callout editors resize from their bottom-right corner, reopen at that size, and keep their buttons in view while the content scrolls.
- Patch Banner: local image, animated image, and video banners configured with a single `patch-banner` property and displayed in full at their original aspect ratio. Covers use a configurable 10–100% of the note pane (90% by default, with a reset button), centered above the native title and Properties while keeping the text column at its normal width in Reading View and Live Preview, including empty notes, with Add/Change/Remove cover actions, vault media selection, media controls, reduced-motion behavior, and automatic video pausing when hidden.
- Patch Icons: Lucide and Simple Icons icons before file and folder names in the file explorer, chosen from a searchable picker in the file menu and kept across renames inside Obsidian. Simple Icons load from jsDelivr in their newest release, and the icons in use are saved so they display offline. Iconize's file and folder icons can be imported.
- Line Width: the readable line width from a status bar slider or the settings (500–2000 px, 900 px by default), and a `patch-line-width` property that resizes only the pane showing that note.
- Mermaid version setting with three choices. Bundled, the default, works offline and runs only code shipped with the plugin; Latest loads the newest Mermaid release from jsDelivr; Custom takes an exact release from 11.0.0 on. Remote versions fall back to the bundled copy when they cannot be loaded, and the setting shows the version in use.
- Callout code: inline code in callouts is tinted with the callout's own color instead of the page's gray chip, and code in a callout title takes the title's color, in Reading View and Live Preview.
- Active line: a bar in the margin marks the cursor's line in Live Preview and Source mode, in the caret's color and faded in unfocused splits, and its line number is highlighted.
- Mermaid diagrams use Obsidian's text font through `--font-mermaid`, the same property as Obsidian's built-in renderer.
- Mermaid diagrams follow Obsidian's light or dark theme.
- Open Mermaid diagrams re-render when the theme, the text font, or the security level changes, including diagrams in Live Preview.

### Changed

- Refreshed the README with a concise introduction, an alphabetical feature guide, an Obsidian logo badge, practical feature demos, and current examples.
- Integration tests share native CLI detection, exact vault verification, isolated tabs, settings and UI-state restoration, cancellation, and completion reports. Banner generates its own media fixtures and supports explicitly skipping playback checks. Recovery checks cover success, failure, and timeout.
- Aligned `versions.json` with the manifest's minimum Obsidian version, 1.13.7.
- Settings groups are sorted alphabetically by their displayed names.
- Minimum Obsidian version raised to 1.13.7 for the public editor and frontmatter interfaces used by Patch Banner.
- Renamed the Mermaid feature to Patch Mermaid and its code block language from `mermaid-latest` to `patch-mermaid`. Existing notes must use `patch-mermaid` to render with the plugin.
- Bundled Mermaid upgraded from 11.16.0 to 12.3.0, and `@mermaid-js/layout-elk` from 0.2.2 to 1.0.2.
- DOMPurify, which Strict mode relies on, updated to 3.4.17 for a moderate security advisory.
- Icon packs are embedded gzip-compressed and decoded on first use, which makes `main.js` about 3.3 MB smaller despite the larger Mermaid 12 bundle.

### Removed

- The Sandbox security level. A stored Sandbox setting falls back to Strict.

### Fixed

- TreeView labels and connector lines are readable in dark themes.

## [0.1.0] - 2026-07-30

### Added

- `mermaid-latest` code block rendered with a bundled Mermaid 11.16.0.
- ELK layout support.
- Material Icon Theme and SVG Logos icon packs for treeView diagrams.
- Strict, Sandbox, and Loose Mermaid security levels.
