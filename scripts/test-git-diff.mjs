import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runIntegration } from "./lib/integration-runner.mjs";

await runIntegration({
  name: "git-diff", folder: "Patch Git Diff Tests", script: new URL("./git-diff-integration.js", import.meta.url),
  prepare({ output }) {
    // Commit only inside the runner's scratch directory. The vault fixture points to this object store.
    const repo = join(output, "baseline");
    mkdirSync(repo);
    const git = args => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
    git(["init", "-q", "--template="]);
    const note = ["# Weekend watchlist", "", "## Friday", "- Arrival", "", "## Saturday", "- Spirited Away", "", "## Notes", "Bring the projector.", "Charge the speakers.", "Check the subtitles.", "", "Start at 8 pm.", ""].join("\n");
    writeFileSync(join(repo, "Weekend watchlist.md"), note);
    git(["--literal-pathspecs", "add", "--", "Weekend watchlist.md"]);
    git(["-c", "user.name=Patches test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgSign=false", "commit", "-qm", "Test baseline"]);
    const next = git(["-c", "user.name=Patches test", "-c", "user.email=test@example.invalid", "commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", "Later baseline"]).toString().trim();
    writeFileSync(join(output, "next-head.txt"), next);
  },
});
