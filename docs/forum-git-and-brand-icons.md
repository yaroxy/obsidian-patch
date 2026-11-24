Patches 0.7.0 adds a way to see what changed in a note since your last Git commit. On desktop, open a note in a Git-backed vault. A blue mark beside a line means you edited it, green means you added it, and a red triangle shows where you removed text.

![The editor gutter marks changes to a weekend watchlist](https://raw.githubusercontent.com/yaroxy/obsidian-patch/417027fb6394a6e838bbd015c753225c0c87a7e5/docs/images/note-git-gutter.png)

Click a marker to compare that part of the note. The upper pane shows the last commit and the lower pane follows your edits, including text you haven’t saved. If you prefer a clear margin, run **Patches: Toggle Git change markers for this vault**. You can still open the comparison from the command palette.

Callouts can now use brand logos. Open **Settings → Patches → Patch Icons → Simple Icons → Install** once, then go to **Callouts → Type appearance** and choose a logo and its brand color. The catalog works offline after installation and is shared with file and folder icons.

![Callout appearance with a brand icon and color swatches](https://raw.githubusercontent.com/yaroxy/obsidian-patch/417027fb6394a6e838bbd015c753225c0c87a7e5/docs/images/callout-brand-appearance.png)

If you use inline code in HTML tables, the font setting now previews the family you choose and suggests installed fonts on supported devices.

[Release notes](https://github.com/yaroxy/obsidian-patch/releases/tag/0.7.0) · [Git comparison guide](https://yaroxy.github.io/obsidian-patch/reference/commands.html#compare-a-note-with-git) · [Callout appearance guide](https://yaroxy.github.io/obsidian-patch/features/callouts.html#type-appearance)
