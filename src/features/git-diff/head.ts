/// <reference types="node" />

import { Platform } from "obsidian";

export interface NoteHead {
  text: string;
  commit?: string;
  tracked: boolean;
}

// Obsidian's desktop renderer exposes Node built-ins through its CommonJS loader.
function desktopGitModules() {
  if (Platform.isDesktopApp) {
    return {
      childProcess: window.require("child_process") as typeof import("node:child_process"),
      fs: window.require("fs/promises") as typeof import("node:fs/promises"),
      path: window.require("path") as typeof import("node:path"),
    };
  }
  throw new Error("Local Git comparisons require the desktop app.");
}

/** Pass separate arguments to the desktop Git executable without starting a shell. */
async function runGit(cwd: string, args: string[], allowOne = false): Promise<string> {
  const { childProcess } = desktopGitModules();
  const env: NodeJS.ProcessEnv = { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "" };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE"]) delete env[key];
  return new Promise((resolve, reject) => {
    childProcess.execFile("git", ["--no-pager", "--no-optional-locks", "--literal-pathspecs", ...args], {
      cwd, env, windowsHide: true, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 10000,
    }, (error, stdout, stderr) => {
      if (!error || (allowOne && error.code === 1)) return resolve(stdout);
      if (error.code === "ENOENT") return reject(new Error("Git or the note folder could not be found. Check that Git is installed on this computer."));
      if (stderr.includes("not a git repository")) return reject(new Error("This note is outside a Git working tree."));
      reject(new Error(stderr.trim() || error.message));
    });
  });
}

export async function isGitWorkTree(directory: string): Promise<boolean> {
  if (!Platform.isDesktopApp) return false;
  const { fs, path: { dirname, join } } = desktopGitModules();
  // Most vaults have no Git metadata. Check only their ancestors, with no vault scan or Git process.
  for (let path = directory; ; path = dirname(path)) {
    if (await fs.stat(join(path, ".git")).then(() => true, () => false)) break;
    if (dirname(path) === path) return false;
  }
  return runGit(directory, ["rev-parse", "--is-inside-work-tree"]).then(value => value.trim() === "true", () => false);
}

export async function readNoteHead(file: string): Promise<NoteHead> {
  const { path: { dirname, basename } } = desktopGitModules();
  const git = (args: string[], allowOne = false): Promise<string> => runGit(dirname(file), args, allowOne);

  // Resolve once so a simultaneous commit cannot mix two revisions. Exit 1 means an unborn HEAD.
  const commit = (await git(["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], true)).trim();
  if (!commit) return { text: "", tracked: false };
  const entry = await git(["ls-tree", "-z", commit, "--", "./" + basename(file)]);
  if (!entry) return { text: "", tracked: false, commit };
  const blob = /^100[0-7]{3} blob ([0-9a-f]+)\t/.exec(entry)?.[1];
  if (!blob) throw new Error("The entry in HEAD is not a regular note file.");
  return { text: await git(["cat-file", "blob", blob]), tracked: true, commit };
}
