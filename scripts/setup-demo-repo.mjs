#!/usr/bin/env node
/**
 * Ensure demo-repo has its broken baseline and its own git history.
 *
 * Run after cloning RepoQuest (the parent repo tracks demo-repo's files but
 * not its git history). Safe to run repeatedly.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const demoRepo = path.join(root, "demo-repo");
const externalGitDir = path.join(root, ".demo-repo-git");
const nestedGitDir = path.join(demoRepo, ".git");
const middleware = path.join(demoRepo, "src", "middleware", "require-auth.ts");

const BROKEN = 'const token = authorizationHeader.split(" ")[0];';
const FIXED = 'const token = authorizationHeader.split(" ")[1];';

if (!fs.existsSync(path.join(demoRepo, "package.json"))) {
  console.error("demo-repo not found — run from the RepoQuest root.");
  process.exit(1);
}

// 1. The baseline must contain the deliberate bug.
const source = fs.readFileSync(middleware, "utf8");
if (source.includes(FIXED)) {
  fs.writeFileSync(middleware, source.replace(FIXED, BROKEN), "utf8");
  console.log("Restored the deliberate bug in require-auth.ts");
}

// 2. Ensure a git history exists (external dir preferred so the parent repo
//    can track demo-repo's files).
if (fs.existsSync(externalGitDir) || fs.existsSync(nestedGitDir)) {
  console.log("demo-repo git history already present.");
  process.exit(0);
}

const git = (...args) =>
  execFileSync(
    "git",
    ["--git-dir", externalGitDir, "--work-tree", demoRepo, ...args],
    { stdio: "pipe" }
  );

execFileSync("git", ["init", "--quiet", "--separate-git-dir", externalGitDir, demoRepo]);
// git init --separate-git-dir leaves a .git pointer file; remove it so the
// parent repo keeps tracking demo-repo's files as plain files.
if (fs.existsSync(nestedGitDir) && fs.statSync(nestedGitDir).isFile()) {
  fs.rmSync(nestedGitDir);
}
git("add", "-A");
git(
  "-c", "user.name=RepoQuest",
  "-c", "user.email=repoquest@demo.local",
  "commit", "--quiet", "-m",
  "Broken baseline: Access Gate extracts the scheme instead of the token"
);
console.log("Initialised demo-repo history with the broken baseline commit.");
