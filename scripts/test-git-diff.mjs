import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runIntegration } from "./lib/integration-runner.mjs";

const samples = [
  ["h3", "### 块 ID"], ["paragraph", "Following paragraph."], ["h1", "# 一级标题"], ["h2", "## 二级标题"],
  ["h4", "#### 四级标题"], ["h5", "##### 五级标题"], ["h6", "###### 六级标题"],
  ["list", "- List item"], ["quote", "> Quoted text"], ["code", "Fenced code line"],
  ["wrapped-heading", "### 复核步骤与异常情况：如何记录实验条件、核对原始数据，并在再次执行实验时确认结果可以复现"],
  ["wrapped", "A paragraph long enough to wrap across several visual lines. ".repeat(6).trim()],
];
const fixtureLines = Array(166).fill("Paragraph.").concat("");
for (const [kind, text] of samples) {
  if (kind === "code") fixtureLines.push("```text");
  fixtureLines.push(text);
  if (kind === "code") fixtureLines.push("```");
  fixtureLines.push("");
}

await runIntegration({
  options: { samples, fixtureLines },
  name: "git-diff", folder: "Patch Git Diff Tests", script: new URL("./git-diff-integration.js", import.meta.url),
  prepare({ output }) {
    // Commit only inside the runner's scratch directory. The vault fixture points to this object store.
    const repo = join(output, "baseline");
    mkdirSync(repo);
    const git = args => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
    git(["init", "-q", "--template="]);
    const note = ["# Weekend watchlist", "", "## Friday", "- Arrival", "", "## Saturday", "- Spirited Away", "", "## Notes", "Bring the projector.", "Charge the speakers.", "Check the subtitles.", "", "Start at 8 pm.", ""].join("\n");
    writeFileSync(join(repo, "Weekend watchlist.md"), note);
    // Both layout probes are isolated additions beside otherwise committed text.
    const headingBaseline = fixtureLines.filter(line => !line.startsWith("### ")).join("\n");
    writeFileSync(join(repo, "Headings.md"), headingBaseline);
    git(["--literal-pathspecs", "add", "--", "Weekend watchlist.md", "Headings.md"]);
    git(["-c", "user.name=Patches test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgSign=false", "commit", "-qm", "Test baseline"]);
    const next = git(["-c", "user.name=Patches test", "-c", "user.email=test@example.invalid", "commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", "Later baseline"]).toString().trim();
    writeFileSync(join(output, "next-head.txt"), next);
  },
});
