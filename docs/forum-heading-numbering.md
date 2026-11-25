Here’s a preview of the next Patches update. I wanted to be able to move a section of a long note without having to renumber the headings below it. In the development build, section numbers follow the outline in Live Preview and Reading View. The Markdown file, copied headings and links to those headings keep their original text.

![Sections 9 and 10 with their subsections. The last title wraps onto three lines in the same text column.](https://raw.githubusercontent.com/yaroxy/obsidian-patch/main/docs/images/heading-number-alignment.png)

To try it on one note in the development build, add this property:

```yaml
---
patch-heading-numbering: decimal
---
```

You can also choose a Chinese report outline, an English outline or continuous numbering. Vault-wide numbering starts off. If you already typed a matching section number, Patches shows it once, including when it’s part of a link label. [Heading numbering guide](https://yaroxy.github.io/obsidian-patch/features/heading-levels.html#heading-numbering)

Two desktop changes are in the same build. Consecutive Git edits share a single margin bar. Clicking anywhere along it opens the change. With Line Width enabled, the main window keeps 500 px between the sidebars as you resize it. I tested the window behavior on Debian KDE.

If your diagrams use `logos:` or `material-icon-theme:`, the next build moves those icon packs to **Settings → Patches → Patch Mermaid**. Install the packs your diagrams use while online and they’ll be available offline afterward. The Mermaid renderer still ships with Patches.

If you number long notes by hand today, which numbering style do you use?
