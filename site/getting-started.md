# Getting started

Patches adds focused editing, appearance, and export improvements to Obsidian. Start with the features that fit your notes and adjust them under **Settings → Patches**.

## Install

Requires **Obsidian 1.15.0 or later**.

1. Open **Settings → Community plugins**.
2. Select **Browse**, search for **Patches**, and open its listing.
3. Select **Install**, then **Enable**.
4. Open **Settings → Patches** to configure its features.

In 0.7.0, Lucide icons are ready to use. For brand logos, select **Settings → Patches → Patch Icons → Simple Icons → Install**. One download serves callouts, files and folders.

[Open the Community Directory listing](https://community.obsidian.md/plugins/patches).

::: tip New in 0.8.0
Add `patch-heading-numbering: decimal` to one note to number its sections in Live Preview and Reading View. If your Mermaid diagrams use Logos or Material Icon Theme icons, install the matching pack before going offline. [Try heading numbers](features/heading-levels.md#heading-numbering) · [Install diagram icons](features/mermaid.md#install-diagram-icons)
:::

## Try one improvement

| If you want to… | Start here |
| --- | --- |
| Make a note more comfortable to read | Enable Obsidian’s **Readable line length**, then adjust [Line Width](features/line-width.md). |
| Give a table grouped headers | Put the cursor in a Markdown table and run **Patches: Convert Markdown tables to HTML**. [Table guide](features/tables.md). |
| Edit a callout without remembering syntax | Hover a rendered callout and choose **Edit callout**. [Callout guide](features/callouts.md). |
| Recognize folders at a glance | Right-click a folder and choose **Change icon**. [Icon guide](features/icons.md). |
| Export a document with an outline | Use Obsidian’s **Export to PDF** on desktop. [PDF guide](features/pdf-export.md). |

The [feature overview](features/index.md) lists all available tools. Commands appear in the command palette with the **Patches:** prefix.

## Updates

With Obsidian Sync Standard, install Patches on each device. The bundled `main.js` exceeds the plan’s 5 MB per-file limit.

Use **Settings → Community plugins → Check for updates** to install released versions.

## Manual installation

Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/yaroxy/obsidian-patch/releases/latest). Place all three files in `<vault>/.obsidian/plugins/patches/`, reload Obsidian, and enable Patches under Community plugins.

The Community Directory and official GitHub releases contain the **Community** build, which bundles Mermaid. The optional [Full branch](https://github.com/yaroxy/obsidian-patch/tree/codex/full) is a manual source build with remote Mermaid version choices. Both use the same plugin ID; installing one replaces the other.

## Get help

Start with [troubleshooting](troubleshooting.md). For a reproducible problem, [open an issue](https://github.com/yaroxy/obsidian-patch/issues) with your Obsidian and Patches versions, operating system, theme, view mode, and a small example.
