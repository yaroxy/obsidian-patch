import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runIntegration } from "./lib/integration-runner.mjs";

await runIntegration({ name: "navigation", folder: "Patch Navigation Tests",
  script: new URL("./navigation-integration.js", import.meta.url),
  prepare({ vault }) {
    const folder = join(vault, "Patch Navigation Tests");
    const lines = (...rows) => rows.join("\n");
    writeFileSync(join(folder, "Headings.md"), lines(
      "---", 'description: "# Not a heading"', "---", "",
      "# Level one", "", "## Level two", "", "### Level three", "", "#### Level four", "", "##### Level five", "", "###### Level six", "",
      "Setext title", "============", "", "## **Formatted** and `code`", "",
      "> [!note] Callout", "> ### Inside callout", "> Text", "",
      "```markdown", "# Not a heading", "```", "",
      "## Long title for wrapping " + "with several words ".repeat(18), "",
      ...Array.from({ length: 140 }, (_, i) => `Paragraph ${i}.`), "", "## Far away", "",
    ));
    writeFileSync(join(folder, "Navigation note.md"), lines(
      "# Navigation sample", "",
      "[[#Target Heading|Wiki target]]", "", "[Markdown slug](#target-heading)", "", "[Encoded](#%E4%B8%AD%E6%96%87%20%E6%A0%87%E9%A2%98)", "",
      "[[Navigation note#Target Heading|Same basename]]", "", "[[Patch Navigation Tests/Navigation note#Target Heading|Vault path]]", "",
      "[Relative Markdown](Navigation%20note.md#Target%20Heading)", "", "[[Other#Target Heading|Other note]]", "",
      "[[#Repeat|First repeated]]", "", "[Second repeat](#repeat-1)", "", "[Formatted](#bold-text-and-code)", "",
      "[[#Missing|Missing heading]]", "", "[[#^point|Block reference]]", "", "[External](https://example.com/#Target)", "",
      '<span id="obsidian-patch-pdf-heading-0">Existing anchor</span>', "", "## Repeat", "", "First repeated heading.", "",
      '<div style="break-before:page"></div>', "", "## Target Heading", "", "Destination paragraph. ^point", "",
      "### 中文 标题", "", "Unicode destination.", "", "### **Bold text** and `code`", "", "Formatted destination.", "",
      "## Repeat", "", "Second repeated heading.", "",
    ));
    writeFileSync(join(folder, "Other.md"), "# Target Heading\n\nThis is another note.\n");
    writeFileSync(join(folder, "Numbering.md"), lines(
      "---", "patch-heading-numbering: decimal", "---", "# Report", "", "[[#Methods]]", "",
      "## Methods", "#### Materials", "### Verification", "### 1.3 Existing", "## Methods", "",
      "Setext detail", "-------------", "", "> ### Quoted", "", "```md", "# Example", "```", "",
      "![[Numbering embed]]", "", ...Array.from({ length: 160 }, (_, i) => "Paragraph " + i + "."), "", "## Far away", "",
    ));
    writeFileSync(join(folder, "Numbering embed.md"), lines("---", "patch-heading-numbering: en-outline", "---", "## Embedded section", ""));
    writeFileSync(join(folder, "Linked headings.md"), lines("---", "patch-heading-numbering: decimal", "---",
      "## [[Other|1 方法]]", "", "## [2 结果][ref]", "", "## 讨论", "", "[ref]: Other.md", ""));
    writeFileSync(join(folder, "Number columns.md"), lines("# 章节", "", "正文", "", "## 方法概述", "### 数据来源", "## 结果分析",
      "#### 复核步骤与异常情况的记录方式，以及再次执行实验时需要核实的条件", ""));
  },
  verify({ output }) {
    const python = process.env.PDF_PYTHON ?? "python3";
    console.log(execFileSync(python, [new URL("./verify-navigation-pdf.py", import.meta.url).pathname, output], { encoding: "utf8", timeout: 30000 }).trim());
  },
});
