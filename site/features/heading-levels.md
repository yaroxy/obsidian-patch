# Heading levels

H1–H6 labels appear beside headings in Reading View, Live Preview, and Source mode. Wrapped headings leave room for the label, and Setext headings are supported. Toggle **Editor → Heading levels**; it is on by default. Labels do not change note source or appear in exported PDFs.

In Live Preview, a body heading shares its extra spacing evenly above and below the text. Reading View also balances the extra margins around a heading that follows a paragraph, quote, code block, table or list. On a wrapped heading, both the section number and the H1–H6 label sit beside the first line. The active-line bar in the editor spans the wrapped title.

![Line 190 with parallel Git and active-line bars, section number 2.1.2, a wrapped Chinese heading and its H3 label](../../docs/images/active-numbered-heading.png)

![Heading levels at the right edge of the reading column](../../docs/images/heading-levels.png)

## Where it works

Reading View, Live Preview, and Source mode. Exported PDFs use the note’s headings without the visual H1–H6 labels.

## Heading numbering

Patches 0.8.0 can display section numbers in Live Preview and Reading View. To try it in one note with the default settings, paste this example into an empty note. The vault-wide switch under **Settings → Patches → Editor → Heading numbering** starts off.

```markdown
---
patch-heading-numbering: decimal
---

# Lab notes

## Methods

### Materials

## Results
```

**Lab notes** stays unnumbered. The sections display as **1 Methods**, **1.1 Materials** and **2 Results**. Move the Results section above Methods and Materials becomes **2.1 Materials**. A link to `[[Lab notes#Materials]]` still works if the file is named `Lab notes.md`.

| Property value | Example sequence |
| --- | --- |
| `decimal` | 1 Methods → 1.1 Materials → 2 Results |
| `zh-report` | 一、方法 → （一）材料 → 二、结果 |
| `en-outline` | I. Methods → A. Materials → II. Results |
| `continuous` | 1 Methods → 2 Materials → 3 Results |
| `false` | Turns numbering off for this note |

A single H1 at the beginning serves as the document title. The first section below it starts at 1. A skipped heading level attaches to the closest preceding higher heading. Code examples, callouts, block quotes and embedded notes do not consume numbers. In 0.8.0, **Numbering options** sets the vault-wide starting heading level, maximum depth and first number. The sample updates as you change these settings.

### Per-note numbering options

In the development build, open the note and choose **Settings → Patches → Editor → Heading numbering → This note…**. Pick a style and, if needed, a first number. **Heading level and depth** holds the two less common controls. The preview updates as you edit. Choose **Apply** to save the choices in a single text property. Expand **Note properties (YAML)** to see the exact line.

```yaml
patch-heading-numbering: decimal start=10
```

With the sample note above, this displays **10 Methods**, **10.1 Materials** and **11 Results**. For top-level chapters only, use `decimal start=10 level=2 depth=1`.

| Part of the property value | Meaning |
| --- | --- |
| Optional style at the beginning | One of `decimal`, `zh-report`, `en-outline`, `continuous` or `false`. A style enables numbering in this note. Omit it to inherit the vault’s style and on/off switch. |
| `start=10` | Start at 10. Accepts a positive safe integer. Child sections start at 1. |
| `level=2` | Start at H2. Use 0 for Automatic or 1–6 for H1–H6. |
| `depth=1` | Number top-level sections only. Accepts 1–6. |

Omit any option to inherit that value. For example, `start=10` alone changes only the starting number. Earlier presets such as `patch-heading-numbering: decimal` continue to work. Notes with separate numeric properties from an earlier development build retain their settings. Editing their note options in the dialog consolidates the values into one property.

![Note options showing a first number of 10, H2 as the starting level and a depth of 1](../../docs/images/heading-numbering-note-settings.png)

In the development build, automatic numbers use bold text on a lightly tinted background with a fine outline. The tint follows the theme accent in light and dark modes. Column widths use the bold face of the vault font.

The fold arrow stays on the leading side of the shaded number, with its own click target. Numbers follow the vault’s text font. Changing that font updates the shared column width. Automatic numbers such as **9**, **10** and **10.1** align at the start of a shared column. Each automatic number has a subtle background that follows your theme and distinguishes it from a number typed into the title. The title and its wrapped lines align in the next column.

![Four shaded chapter numbers beside left-aligned Chinese titles in a narrow reading pane](../../docs/images/heading-number-alignment.png)

<details>
<summary>Dark mode</summary>

![The same four headings with lighter number backgrounds on the dark page](../../docs/images/heading-number-alignment-dark.png)

</details>

The settings preview below starts a Chinese report at chapter ten and limits numbering to one level. “Methods” and “Results” receive chapter numbers while the headings between them keep their original text.

![Heading numbering settings showing the Chinese report preset, H2 starting level, depth 1 and first number 10](../../docs/images/heading-numbering-settings.png)

A matching handwritten number appears once, including in a wiki link alias or Markdown reference link label. A conflicting number such as **7.3 Background** where **1.2** is expected pauses automatic prefixes across that note. Open the numbering setting with the note active to see the line and expected number. Correcting the heading resumes numbering. Markdown source, copied text, heading links and exported PDFs use the original titles.
