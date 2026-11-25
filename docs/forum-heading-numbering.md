Patches 0.8.0 adds automatic section numbers. I wanted to be able to move a section of a long note without having to renumber the headings below it. Section numbers follow the outline in Live Preview and Reading View. The Markdown file, copied headings and links to those headings keep their original text.

![Sections 9 and 10 with their subsections. The last title wraps onto three lines in the same text column.](https://raw.githubusercontent.com/yaroxy/obsidian-patch/c8f25a567cc05cf0301e0581038e72a08ce4733b/docs/images/heading-number-alignment.png)

To try it on one note after updating, add this property at the top.

```yaml
---
patch-heading-numbering: decimal
---
```

With decimal numbering, a subsection called **Materials** under **1 Methods** appears as **1.1 Materials**. Move Methods to second place and the same subsection reads **2.1 Materials**. You can also choose a Chinese report outline, an English outline or continuous numbering. Vault-wide numbering starts off. [Try the sample note](https://yaroxy.github.io/obsidian-patch/features/heading-levels.html#heading-numbering)

There are two desktop changes in 0.8.0. Consecutive Git edits share a single margin bar. Clicking anywhere along it opens the change. With Line Width enabled, the main window keeps 500 px between the sidebars as you resize it. I tested the window behavior on Debian KDE.

If your diagrams use `logos:` or `material-icon-theme:`, 0.8.0 moves those icon packs to **Settings → Patches → Patch Mermaid**. Install the packs your diagrams use while online and they’ll be available offline afterward. The Mermaid renderer still ships with Patches.

If you number long notes by hand today, which numbering style do you use?
