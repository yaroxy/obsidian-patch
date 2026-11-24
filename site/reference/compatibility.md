# Views and platforms

Patches requires **Obsidian 1.15.0 or later**. Features apply to the places described below; this table describes intended behavior, not a claim that every platform and theme has been tested.

| Feature | Reading View | Live Preview | Source mode |
| --- | --- | --- | --- |
| Active line | — | Yes | Yes |
| Heading labels | Yes | Yes | Yes |
| Readable line width | Yes | Yes | Yes |
| Banners | Yes | Yes | — |
| Callout code backgrounds | Yes | Yes | — |
| Table/callout hover editors | Yes | Yes | Use commands at the cursor |
| HTML table to Markdown (next release) | Choose **Edit table → Convert to Markdown** and confirm in the same tab | Use the table editor or command | Use the command at the cursor or on a selection of complete tables |
| Callout type suggestions and multiline plain-text paste (next release) | — | Yes | Yes |
| Math source formatting | Switch to an editor | Yes | Yes |
| `patch-mermaid` rendering | Yes | Yes | Shows the source |
| Check diagrams in this note (0.5.0) | Checks saved text and opens the source line | Checks unsaved edits | Checks unsaved edits |
| Check callouts for GitHub (0.5.0) | Checks saved text and scrolls to the callout | Checks unsaved edits and moves the cursor | Checks unsaved edits and moves the cursor |

Explorer icons apply to files and folders in the file explorer, independently of the note’s view mode.

## Desktop-specific features

The line-width status bar control and enhanced native PDF export are desktop features. Video playback also depends on the platform’s available codecs.

## Appearance and exported documents

Heading labels are visual aids and are omitted from PDF output. Banners are omitted from PDF export, embeds, hover previews, and Canvas. Note properties and source remain portable Markdown/YAML, except that converted tables are HTML.

## Current verification

The next release’s table editing and conversion, callouts, Mermaid, and icons were tested on Debian with Obsidian 1.15.1. Table conversion on iOS and Android has yet to be verified. [Desktop test results](https://github.com/yaroxy/obsidian-patch/blob/b621a23c6fdff4d49408d99b5c9acbc26313cae0/docs/integration-testing.md#editor-updates-branch-candidate--2026-11-24)

The 0.5.0 tests used macOS and Obsidian 1.15.1. The line-width investigation also covered Aether Core with four CSS snippets, and the cover investigation isolated a conflict with Image Converter 1.4.6. [Troubleshooting](../troubleshooting.md)
