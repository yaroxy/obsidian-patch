# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Mermaid version setting with three choices. Latest, the new default, loads the newest Mermaid release from jsDelivr; Bundled works offline; Custom takes an exact release from 11.0.0 on. Remote versions fall back to the bundled copy when they cannot be loaded, and the setting shows the version in use.
- Inline styles: colorize bold, italic, and inline code with muted light and dark presets, each with its own toggle.
- Active line: tint the cursor's line and highlight its line number in Live Preview and Source mode.
- Mermaid diagrams use Obsidian's text font through `--font-mermaid`, the same property as Obsidian's built-in renderer.
- Mermaid diagrams follow Obsidian's light or dark theme.
- Open Mermaid diagrams re-render when the theme, the text font, or the security level changes, including diagrams in Live Preview.

### Changed

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
