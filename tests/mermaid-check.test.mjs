import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["src/features/mermaid-check/model.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { diagramBlocks, errorLocation } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

test("Markdown block positions retain note offsets through callouts, lists, longer and tilde fences", () => {
  const lines = [
    "> [!note] Example", "> - Item", ">", ">   ~~~~patch-mermaid", ">   sequenceDiagram", ">     Alice->>Bob: Hi", ">   ~~~~~",
    "", "````markdown", "```patch-mermaid", "literal example", "```", "````",
    "", "~~~mermaid", "native", "~~~", "", "- ```patch-mermaid", "  flowchart LR", "    A --> B", "  ```",
  ];
  assert.deepEqual(diagramBlocks(lines.join("\r\n"), 5), [
    { line: 8, source: "sequenceDiagram\n  Alice->>Bob: Hi" },
    { line: 23, source: "flowchart LR\n  A --> B" },
  ]);
});

test("raw HTML, indented examples, display math and block comments keep their literal fences", () => {
  const fence = ["```patch-mermaid", "not a diagram", "```"];
  const lines = [
    "<pre>", ...fence, "</pre>", "", "%%", ...fence, "%%", "",
    "> $$", ...fence.map(line => "> " + line), "> $$", "", ...fence.map(line => "    " + line),
    "", "<!--", ...fence, "-->", "", "```patch-mermaid-extra", "unrelated", "```", "",
    "```patch-mermaid", "flowchart LR", "%% a Mermaid comment", " A --> B", "```",
  ];
  assert.deepEqual(diagramBlocks(lines.join("\n"), 0), [
    { line: lines.length - 5, source: "flowchart LR\n%% a Mermaid comment\n A --> B" },
  ]);
});

test("unfinished Obsidian math and comments hide fences only inside their Markdown container", () => {
  const diagram = ["```patch-mermaid", "flowchart LR", "```"];
  for (const opening of ["%% commented out", "$$", "$$$$"]) {
    assert.deepEqual(diagramBlocks([opening, ...diagram].join("\n"), 0), []);
    const quoted = [opening, ...diagram].map(line => `> ${line}`);
    const source = [...quoted, "", ...diagram];
    assert.deepEqual(diagramBlocks(source.join("\n"), 0), [{ line: quoted.length + 1, source: "flowchart LR" }]);
  }
  const multiLine = ["$$$$", "f(x) $$", ...diagram, "$$$$", "%%", "end %% %% next comment", ...diagram, "%%", ...diagram];
  assert.deepEqual(diagramBlocks(multiLine.join("\n"), 0), [{ line: multiLine.length - 3, source: "flowchart LR" }]);
  const inline = ["Before %%inline", ...diagram, "ends here%% after", "", ...diagram];
  assert.deepEqual(diagramBlocks(inline.join("\n"), 0).map(block => block.line), [1, 6]);
});

test("parser diagnostics distinguish note positions from unmappable Mermaid parser offsets", () => {
  const block = { line: 9, source: "pie\n  \"Yes\" : hello" };
  assert.deepEqual(errorLocation(block, "Parsing failed: Lexer error on line 2, column 11: unexpected character"), { line: 11, column: 10 });
  assert.equal(errorLocation(block, "Lexical error on line 2.").line, 11);
  for (const message of ["Parse error on line 3:", "No diagram type detected matching given configuration for text: line 2"]) {
    assert.deepEqual(errorLocation(block, message), { line: 9 });
  }
  for (const prefix of ["---\ntitle: Count\n---\n", "%% comment\n", "\n"]) {
    assert.deepEqual(errorLocation({ ...block, source: prefix + block.source }, "Parse error on line 2:"), { line: 9 });
  }
});
