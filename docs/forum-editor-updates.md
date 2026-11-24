Patches 0.6.0 can turn an HTML table back into an ordinary Markdown table. In my weekend watchlist, one “Friday” cell spans *Arrival* and *Moon*. When I share the list, I want the day beside each film.

Place the cursor in the HTML table and run **Patches: Convert HTML tables to Markdown**. Choose **Repeat across slots** to put Friday on both rows. The preview shows the Markdown and the rendered table side by side, including what happens to the caption. On desktop you can drag the bottom-right corner for more room. After applying, one undo restores the original table.

![Conversion preview showing Friday beside both Arrival and Moon, and the caption above the Markdown table](https://raw.githubusercontent.com/yaroxy/obsidian-patch/026d7d1284f387c0d712afbd0fb77a5074202aee/docs/images/watchlist-html-to-markdown.png)

Callouts can have their own icon and color, too. Under **Settings → Patches → Callouts → Type appearance**, I gave `WATCHLIST` a teal clapperboard. Typing `> [!watch` brings up `WATCHLIST`, and pasting several lines of plain text inside the callout keeps them quoted.

![Choosing the clapperboard icon and a custom teal color for WATCHLIST, then applying them and viewing the result in the note](https://raw.githubusercontent.com/yaroxy/obsidian-patch/8adc9779e4920614f62448f61dab90f858cc0e59/docs/images/callout-type-appearance.gif)

For the earlier question about phones, I tested this movie list on Linux desktop with Obsidian 1.15.1. I haven’t verified table conversion on iOS or Android yet.

Update Patches in **Settings → Community plugins → Check for updates**. [Patches 0.6.0 release notes](https://github.com/yaroxy/obsidian-patch/releases/tag/0.6.0) · [Table guide and copyable watchlist](https://yaroxy.github.io/obsidian-patch/features/tables.html#convert-an-html-table-to-markdown) · [Callout appearance](https://yaroxy.github.io/obsidian-patch/features/callouts.html#type-appearance)
