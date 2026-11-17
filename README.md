<div align="center">

# Patches

Focused fixes and enhancements for everyday Obsidian work.

Edit tables and callouts, shape your reading space, and make diagrams and exported PDFs more useful.

[![Obsidian](https://img.shields.io/badge/Obsidian-1.15.0%2B-7C3AED?logo=obsidian&logoColor=white)](https://obsidian.md/) [![Build](https://github.com/yaroxy/obsidian-patch/actions/workflows/build.yml/badge.svg)](https://github.com/yaroxy/obsidian-patch/actions/workflows/build.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**[Install](#installation) · [Website](https://yaroxy.github.io/obsidian-patch/) · [User guide](https://yaroxy.github.io/obsidian-patch/getting-started.html) · [Changelog](CHANGELOG.md) · [Report an issue](https://github.com/yaroxy/obsidian-patch/issues)**

</div>

![A Kyoto travel note combining an autumn banner, a merged itinerary table, and a callout with tinted code backgrounds and syntax highlighting](docs/images/home-overview.png)

One note, a few improvements: a [vault-image banner](https://yaroxy.github.io/obsidian-patch/features/banner.html), a [grouped itinerary](https://yaroxy.github.io/obsidian-patch/features/tables.html), and [code that fits its callout](https://yaroxy.github.io/obsidian-patch/features/callouts.html).

## New in 0.4.0

- **[Icon colors](https://yaroxy.github.io/obsidian-patch/features/icons.html):** choose an icon and its color together, with brand colors, eight presets, and custom colors.
- **[Exact line width](https://yaroxy.github.io/obsidian-patch/features/line-width.html):** type a global width in pixels and keep it synchronized with the slider.
- **[Callout code backgrounds](https://yaroxy.github.io/obsidian-patch/features/callouts.html#code-backgrounds):** tint code blocks to match each callout, including nested ones, while preserving syntax highlighting.

[Patches 0.4.0](https://github.com/yaroxy/obsidian-patch/releases/tag/0.4.0) adds these improvements. See [the changelog](CHANGELOG.md) for the complete changes and the linked guides for recorded demos.

## Features

Configure Patches under **Settings → Patches**. Each guide includes examples, settings, and limitations.

| Feature | What it adds |
| --- | --- |
| [HTML tables](https://yaroxy.github.io/obsidian-patch/features/tables.html) | Visual editing, merged cells, grouped headers, captions, and Markdown conversion. |
| [Callouts](https://yaroxy.github.io/obsidian-patch/features/callouts.html) | Editing, preview, conversion, GitHub compatibility, and matching code backgrounds. |
| [Math formatting](https://yaroxy.github.io/obsidian-patch/features/math-format.html) | Indentation and alignment for display math, preserving formulas. |
| [Banners](https://yaroxy.github.io/obsidian-patch/features/banner.html) | Vault images, animations, and videos as note covers. |
| [File and folder icons](https://yaroxy.github.io/obsidian-patch/features/icons.html) | Lucide icons and Simple Icons brand marks, with colors you choose. |
| [Line width](https://yaroxy.github.io/obsidian-patch/features/line-width.html) | Exact global width and per-note overrides for readable columns. |
| [Active line](https://yaroxy.github.io/obsidian-patch/features/active-line.html) | A margin marker and highlighted line number for the cursor’s line. |
| [Heading levels](https://yaroxy.github.io/obsidian-patch/features/heading-levels.html) | H1–H6 labels beside headings in reading and editing views. |
| [Mermaid diagrams](https://yaroxy.github.io/obsidian-patch/features/mermaid.html) | Newer diagram types and syntax that follow Obsidian’s theme. |
| [PDF navigation](https://yaroxy.github.io/obsidian-patch/features/pdf-export.html) | Heading bookmarks and same-note heading links in desktop PDF exports. |

## Installation

Requires **Obsidian 1.15.0 or later**. [Patches is available in the Community Directory](https://community.obsidian.md/plugins/patches).

1. Open **Settings → Community plugins → Browse**.
2. Search for **Patches**, then select **Install** and **Enable**.
3. Open **Settings → Patches** to choose your settings.

For manual installation, download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/yaroxy/obsidian-patch/releases/latest). Put them in `<vault>/.obsidian/plugins/patches/`, reload Obsidian, and enable Patches.

Official releases contain the **Community** build with bundled Mermaid. The optional [Full branch](https://github.com/yaroxy/obsidian-patch/tree/codex/full) adds remote Mermaid versions for manual source builds. Both use the same plugin ID; installing one replaces the other.

## Try it

Enable Obsidian’s **Settings → Editor → Readable line length**, then give one note a wider column:

```yaml
---
patch-line-width: 1100
---
```

Other notes keep their global width. See [note properties](https://yaroxy.github.io/obsidian-patch/reference/properties.html), [commands](https://yaroxy.github.io/obsidian-patch/reference/commands.html), and [views and platforms](https://yaroxy.github.io/obsidian-patch/reference/compatibility.html) for more examples and scope.

## Network and privacy

The Community build runs its bundled Mermaid code locally. The icon picker may contact **jsDelivr** to resolve and download Simple Icons graphic data and matching brand-color JSON. Already-used graphics and available brand colors are cached locally. Missing cached graphics can trigger a download. Icon search text, note contents, and vault file names are not sent in these requests.

The optional Full build can download and execute Mermaid/ELK JavaScript from jsDelivr when Latest or Custom is selected, with access to Obsidian. The cover picker lists vault media locally, and Iconize import reads settings within the vault. Patches has no analytics or telemetry. See [network and privacy](https://yaroxy.github.io/obsidian-patch/privacy.html) for details.

## Help

Start with [troubleshooting](https://yaroxy.github.io/obsidian-patch/troubleshooting.html). When [reporting a bug](https://github.com/yaroxy/obsidian-patch/issues), include Obsidian/Patches versions, OS, theme, view mode, reproduction steps, and a small example or recording.

## Development

Use Node.js **22 or later**:

```bash
npm ci
npm test
npm run build       # community plugin → dist/community/
npm run docs:dev    # local documentation preview
npm run docs:build  # static site → site/.vitepress/dist/
```

Install the three plugin files from `dist/community/` into the vault’s `patches` directory and reload the plugin. Integration checks deploy to `dev-vault` and create temporary fixtures; read [integration testing](docs/integration-testing.md) first.

See [AGENTS.md](AGENTS.md) for feature design references, [release documentation](docs/releases.md) for the plugin workflow, and [documentation maintenance](docs/site-design.md) for the website.

## Acknowledgments

**Line Width** follows the ideas of [Editor Width Slider](https://github.com/MugishoMp/obsidian-editor-width-slider) by MugishoMp (MIT), and **Patch Icons** follows [Iconize](https://github.com/FlorianWoelki/obsidian-iconize) by Florian Woelki (MIT). Their implementations are written for this plugin; the Iconize importer reads its settings format.

Icons come from [Lucide](https://lucide.dev/) (ISC), [Simple Icons](https://simpleicons.org/) (CC0 1.0), and the [Iconify](https://iconify.design/) packs used by Mermaid. Brand icons are trademarks of their respective owners.

## License

[MIT](LICENSE).
