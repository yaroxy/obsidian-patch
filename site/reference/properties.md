# Note properties

Properties let a note opt into a feature or override a global setting. Add them in Obsidian’s Properties interface or YAML frontmatter.

| Property | Accepted value | Effect |
| --- | --- | --- |
| `patch-line-width` | Whole number from 500–2000, or a string such as `"1100px"` | Overrides the readable width for the pane showing this note. |
| `patch-banner` | A quoted vault link, such as `"[[assets/kyoto-cover.jpg]]"` | Uses that vault image, animation, or video as the note cover. |
| `patch-banner-width` (0.5.0) | Whole percentage from 10 to 100, such as `65` or `"65%"` | Centers this note’s cover at that percentage of the pane. Omitted or invalid values use the vault cover width. |
| `github` | `true` | Includes the note in GitHub callout compatibility counting. |

## One note, two appearance choices

```yaml
---
patch-line-width: 1100
patch-banner: "[[assets/kyoto-cover.jpg]]"
patch-banner-width: 65
---
```

Enable **Settings → Editor → Readable line length** for a text column up to 1100 px wide. In 0.5.0, the cover independently uses 65% of the pane in Reading view and Live Preview.

## Preparing a note for GitHub

```yaml
---
github: true
---
```

This enables compatibility feedback. It does not publish or upload the note. You can opt in entire folders through **Callouts → GitHub folders** instead.

## Related syntax

`patch-mermaid` is a code-block language, not a note property. See [Mermaid diagrams](../features/mermaid.md) for a complete example.
