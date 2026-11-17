# Troubleshooting

## Line width does not change

1. Enable **Obsidian Settings → Editor → Readable line length**.
2. Enable **Patches → Line Width → Enabled**.
3. Check for a `patch-line-width` property on the note. A valid note property takes precedence over the global setting.
4. Make the pane wide enough to show a difference; a narrow window still limits the visible column.

In the numeric field, use a whole number from **500 to 2000**, then press Enter or leave the field. Empty, fractional, and out-of-range entries are not saved. The numeric field is new in the next release; see the [Line Width guide](features/line-width.md).

## My banner does not appear

Use a quoted vault link in `patch-banner`, make sure the file exists in the vault, and open the note in Reading View or Live Preview. Covers are not shown in Source mode, embedded notes, Canvas, hover previews, or PDFs.

If a video does not play, try a format supported by your device. Autoplay is muted and may be deferred by reduced-motion preferences. For flicker or unexpected sizing, include a short recording, the media format and dimensions, and your **Cover width** setting in the report. [Banner guide](features/banner.md).

## Simple Icons cannot load

Check access to jsDelivr, then retry the picker or **Patch Icons → Update**. Lucide icons and already-cached icon graphics remain available offline. In the color picker, unavailable brand metadata does not prevent text, preset, or custom colors. See the [icon guide](features/icons.md) for version availability.

## What are “Icons of missing files”?

These are saved icon assignments whose file or folder no longer exists, for example after a change made outside Obsidian. **Remove** clears those assignments, not your notes. A disabled button means there is nothing to clean up.

## What does “GitHub folders” connect to?

It does not establish a connection. The setting selects vault folders for GitHub callout compatibility feedback. Use comma-separated relative paths; leave it empty if you do not need folder-wide checks. Individual notes can opt in with `github: true`.

## Table conversion is unavailable

Place the cursor inside a standalone Markdown table, or select complete tables. Tables inside code blocks, lists, or callouts are excluded. Formulas, images, embeds, footnotes, and extra cells are rejected before conversion writes to the note. [Table guide](features/tables.md).

## A Mermaid example does not render

Use a `patch-mermaid` code block. A standard `mermaid` block still uses Obsidian’s renderer. Check that the diagram syntax is supported by the version shown in Patches settings. Some treeView icons require Loose mode and may still be affected by Mermaid’s own filtering. [Mermaid guide](features/mermaid.md).

## Report a problem

If practical, check the behavior with the default theme, CSS snippets disabled, and only Patches enabled. Include:

- Obsidian and Patches versions, operating system, and theme.
- Reading View, Live Preview, or Source mode.
- Exact steps and a small note that reproduces the issue.
- A screenshot or recording when the issue is visual.

[Open an issue on GitHub](https://github.com/yaroxy/obsidian-patch/issues).
