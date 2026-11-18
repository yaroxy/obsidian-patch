# Code block linting and bilingual notes

Design research, 2026-11-18. The comparisons below use upstream documentation and public source. The maintainer approved the diagram check and deferred translation implementation.

## Code block linting

| Existing tool | What it checks or changes |
| --- | --- |
| Linter | Adds a default language to unlabeled fences and normalizes spacing around fences. These rules act on the surrounding Markdown. [Rule list](https://github.com/platers/obsidian-linter#readme) |
| Prettier | Formats the whole note or a selection. An optional setting formats embedded JS/TS, CSS, HTML, JSON and YAML, among others. This suits a user who wants consistent indentation and layout. [Plugin documentation](https://community.obsidian.md/plugins/prettier) |
| Code Block Kit | Underlines the first syntax error in the active block and shows the message on hover. It also bundles Prettier for offline formatting, including inside lists and callouts. Its supported languages include JS/TS, JSON, YAML and CSS. [Editor behavior and supported languages](https://github.com/paddychenc75/obsidian-code-block-kit#edit) |
| Mermaid Fixer | Previews rule-based repairs and checks remaining errors with Obsidian’s Mermaid parser for the current note. It also offers a vault-wide repair scan. [Commands and parser behavior](https://community.obsidian.md/plugins/mermaid-fixer) |

**Accepted scope.** The **Check diagrams in this note** command checks the current note’s `patch-mermaid` fences using the same configured runtime as the renderer. Reading view reads the saved file and the editor uses its current buffer, including unsaved edits. The command parses each block and reports its ordinal, note line, runtime version and parser message. Native `mermaid` and other fence languages stay outside this command. [Renderer](../src/features/patch-mermaid.ts) · [Mermaid parse API](https://mermaid.js.org/config/usage.html#syntax-validation-without-rendering)

Use Markdown block tokens to keep literal fence examples out of diagnostics and locate diagrams inside quotes, callouts and lists. Map a reliable parser line and column back through Markdown indentation and quote prefixes. When Mermaid has stripped preprocessing lines or provides no usable position, link to the opening fence. Preserve the source and undo history. Discard a result if the note changed during the check and check the snapshot again before a jump. [Implementation](../src/features/mermaid-check.ts) · [Fence and position mapping](../src/features/mermaid-check/model.ts)

The report centers within the viewport and grows to 760 CSS pixels wide. Long lists scroll below the summary. Each issue starts as a single row with its diagram number, note line and error type. **Jump** opens the source and **Details** expands just that parser message. Narrow panes can wrap the controls onto the next line.

## Bilingual translation across views

| Existing tool | Where the translation appears | How it is stored |
| --- | --- | --- |
| Interlinear | Paragraphs in Reading view with bilingual and translation-only layouts. Nested lists and tables have limited structural fidelity. | Injects sibling elements and keeps a local translation cache. [README](https://github.com/linyp/obsidian-interlinear#readme) · [Reading-view adapter](https://github.com/linyp/obsidian-interlinear/blob/main/src/render/postProcessor.ts) |
| Underleaf | Beneath the paragraph under the pointer, or beneath visible paragraphs as the reader scrolls. Reading view on desktop. | Optional local cache. The original note stays intact. [Plugin documentation](https://community.obsidian.md/plugins/underleaf) |
| Selection Translator | Selection and current-paragraph commands in the editor, immersive bilingual display in Reading view, and a linked note for side-by-side comparison. | The side-by-side command creates a translated Markdown note. [Feature descriptions](https://github.com/TlmKira/selection-translator#readme) |
| Transparent Translate | Switches the displayed text between English, German and the original in Reading view and Live Preview. Live Preview covers paragraphs, headings and lists. | Sentence-level cache. Mobile displays translations generated on desktop. [Features and limitations](https://community.obsidian.md/plugins/transparent-translate) |
| mi18n | Language switching in Reading view, Live Preview and Source mode, plus synchronized comparison panes. | Stores language-marked blocks in the Markdown note. This suits authors who want to edit and version multiple languages together. [Language comparison and AI translation](https://github.com/cns-red/obsidian-mi18n#language-comparison) |

**Review decision, 2026-11-18.** Defer implementation. Reading view and Live Preview are the two candidate surfaces for paragraph-aligned bilingual text. Source mode always shows the original Markdown and initiates no translation. Existing plugins already offer paragraph translation and local caches. Further work depends on demonstrating a measurable benefit for frequently edited notes.

### Incremental translation research

- Compare whole-note translation, an exact paragraph cache, and retranslation of changed segments on the same series of edits. Measure provider requests, input and output tokens, time to the first updated paragraph, and translation quality in context.
- Include insertions, deletions, moves, identical paragraphs, sentence splits, a change of target language or model, and edits while a request is in flight. Determine when a neighboring segment needs fresh context and when its cached result is sufficient.
- Keep source Markdown, code, formulae and link destinations intact. Specify how Reading view and Live Preview reuse a result, where cached text lives, and when edited prose may be sent to a provider. Switching to Source mode must display only the source.
- Review measurements and provider/privacy choices before building a translation interface. No provider has been selected.

[Interlinear cache and reading workflow](https://github.com/linyp/obsidian-interlinear#readme) · [Obsidian views and modes](https://obsidian.md/help/edit-and-read) · [CodeMirror decorations](https://codemirror.net/examples/decoration/)
