# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- HTML Tables: a visual editor for HTML tables in notes. **Insert HTML table** adds a new table at the cursor, and **Edit table**, on hover in Reading View and Live Preview, or **Edit HTML table** from the command palette, opens an existing one. Cells are edited in place; drag across cells to merge or split them, insert or delete rows and columns, toggle header cells, set alignment, and edit the caption, with undo and redo. The editor writes HTML that renders cleanly in Obsidian, keeps the markup of cells you do not touch, and writes nothing when a table is unchanged.
- Patch Banner: local image, animated image, and video banners configured with a single `patch-banner` property and displayed in full at their original aspect ratio. Covers use a configurable 10–100% of the note pane (90% by default, with a reset button), centered above the native title and Properties while keeping the text column at its normal width in Reading View and Live Preview, including empty notes, with Add/Change/Remove cover actions, vault media selection, media controls, reduced-motion behavior, and automatic video pausing when hidden.
- Patch Icons: Lucide and Simple Icons icons before file and folder names in the file explorer, chosen from a searchable picker in the file menu and kept across renames inside Obsidian. Simple Icons load from jsDelivr in their newest release, and the icons in use are saved so they display offline. Iconize's file and folder icons can be imported.
- Line Width: the readable line width from a status bar slider or the settings (500–2000 px, 900 px by default), and a `patch-line-width` property that resizes only the pane showing that note.
- Mermaid version setting with three choices. Latest, the new default, loads the newest Mermaid release from jsDelivr; Bundled works offline; Custom takes an exact release from 11.0.0 on. Remote versions fall back to the bundled copy when they cannot be loaded, and the setting shows the version in use.
- Inline styles: colorize bold, italic, and inline code with muted light and dark presets, each with its own toggle.
- Active line: tint the cursor's line and highlight its line number in Live Preview and Source mode.
- Mermaid diagrams use Obsidian's text font through `--font-mermaid`, the same property as Obsidian's built-in renderer.
- Mermaid diagrams follow Obsidian's light or dark theme.
- Open Mermaid diagrams re-render when the theme, the text font, or the security level changes, including diagrams in Live Preview.

### Changed

- Minimum Obsidian version raised to 1.13.7 for the public editor and frontmatter interfaces used by Patch Banner.
- Renamed the Mermaid feature to Patch Mermaid and its code block language from `mermaid-latest` to `patch-mermaid`. Existing notes must use `patch-mermaid` to render with the plugin.
- Bundled Mermaid upgraded from 11.16.0 to 12.1.0, and `@mermaid-js/layout-elk` from 0.2.2 to 1.0.1.
- DOMPurify, which Strict mode relies on, updated to 3.4.16 for a moderate security advisory.
- Icon packs are embedded gzip-compressed and decoded on first use, which cuts `main.js` from 13.1 MB to 9.8 MB despite the larger Mermaid 12 bundle.

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
