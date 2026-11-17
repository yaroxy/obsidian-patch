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
| Math source formatting | Switch to an editor | Yes | Yes |
| `patch-mermaid` rendering | Yes | Yes | Shows the source |

Explorer icons apply to files and folders in the file explorer, independently of the note’s view mode.

## Desktop-specific features

The line-width status bar control and enhanced native PDF export are desktop features. Video playback also depends on the platform’s available codecs.

## Appearance and exported documents

Heading labels are visual aids and are omitted from PDF output. Banners are omitted from PDF export, embeds, hover previews, and Canvas. Note properties and source remain portable Markdown/YAML, except that converted tables are HTML.

## Current verification

Recent checks used macOS, Obsidian 1.15.1, and the default theme. Mobile, other desktop platforms, and third-party themes have not received the same coverage. See [troubleshooting](../troubleshooting.md) for a short isolation procedure before reporting a theme-specific issue.
