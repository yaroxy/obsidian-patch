# CSS customization

Add any of these overrides to an Obsidian CSS snippet:

```css
body {
  --font-mermaid: "Inter", sans-serif;
  --obsidian-patch-active-line-color: var(--color-accent);
  --obsidian-patch-callout-code-tint: 8%;
  --obsidian-patch-icon-size: 16px;
  --obsidian-patch-icon-gap: 4px;
  --obsidian-patch-icon-offset: -0.2em;
  --obsidian-patch-icon-color: var(--text-accent);
}
```


These variables change presentation, not note content. Explicit per-file icon colors override the inherited icon color. Use **Follow text** to return an icon to the text/snippet color. **Code background** must be enabled for the callout tint variable to apply.
