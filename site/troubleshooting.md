# Troubleshooting

## Line width does not change

1. Enable **Obsidian Settings → Editor → Readable line length**.
2. Enable **Patches → Line Width → Enabled**.
3. Check for a `patch-line-width` property on the note. A valid note property takes precedence over the global setting.
4. Try 600 px and 900 px in a wide pane. On Aether Core, both values took effect in our 1306 px Reading pane. Settings of 1200 and 1400 px both produced a 1166 px column because the theme reserved 70 px on each side. If 600 and 900 px also look the same for you, include the two settings, view mode, and pane width in your report.

In the numeric field, use a whole number from **500 to 2000**, then press Enter or leave the field. Empty, fractional, and out-of-range entries are not saved. The numeric field requires **0.4.0 or later**; see the [Line Width guide](features/line-width.md).

## My banner does not appear

Use a quoted vault link in `patch-banner`, make sure the file exists in the vault, and open the note in Reading View or Live Preview. Covers are not shown in Source mode, embedded notes, Canvas, hover previews, or PDFs.

If a video does not play, try a format supported by your device. Autoplay is muted and may be deferred by reduced-motion preferences. For flicker or unexpected sizing, include a short recording, the media format and dimensions, and your **Cover width** setting in the report. [Banner guide](features/banner.md).

## A banner flickers when I hover over it

With Patches 0.4.0 and Image Converter 1.4.6, hovering can shrink a cover to its natural width. Reopening a note can also give the cover the width saved for a body image that uses the same file. On 0.4.0, turning off Image Converter’s **Enable drag resize** temporarily stops the hover flicker. The development build keeps the cover width independent and lets you leave drag resizing enabled for body images. [Issue #38](https://github.com/yaroxy/obsidian-patch/issues/38)

## Simple Icons cannot load

Check access to jsDelivr, then retry the picker or **Patch Icons → Update**. Lucide icons and already-cached icon graphics remain available offline. In the color picker, unavailable brand metadata does not prevent text, preset, or custom colors. See the [icon guide](features/icons.md) for version availability.

## What are “Icons of missing files”?

These are saved icon assignments whose file or folder no longer exists, for example after an external rename. The development build lists the full paths and rechecks them when you select **Remove**. A file restored in the meantime keeps its icon and color. A disabled button means there is nothing to clean up. [Icon guide](features/icons.md)

## What does “GitHub folders” connect to?

This setting selects local vault folders, including their subfolders, for GitHub callout compatibility feedback. Use comma-separated paths or opt in a single note with `github: true`. In the development build, typing part of a path offers matching folders. [Folder completion demo](features/callouts.md#github-folders)

## Table conversion is unavailable

Place the cursor inside a standalone Markdown table, or select complete tables. Tables inside code blocks, lists, or callouts are excluded. Formulas, images, embeds, footnotes, and extra cells are rejected before conversion writes to the note. [Table guide](features/tables.md).

## A Mermaid example does not render

Use a `patch-mermaid` code block for Patches’ bundled renderer. Check the version shown in Patches settings. In the development build, run **Check diagrams in this note** and choose **Jump** to find the syntax error. The rendered block also reports errors that occur during layout. Some treeView icons require Loose mode and may still be affected by Mermaid’s own filtering. [Diagram checks](features/mermaid.md#check-diagrams-in-this-note)

## Report a problem

If practical, check the behavior with the default theme, CSS snippets disabled, and only Patches enabled. Include:

- Obsidian and Patches versions, operating system, and theme.
- Reading View, Live Preview, or Source mode.
- Exact steps and a small note that reproduces the issue.
- A screenshot or recording when the issue is visual.

[Open an issue on GitHub](https://github.com/yaroxy/obsidian-patch/issues).
