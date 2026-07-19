import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEMO_REPO_ROOT, demoRepoGitArgs, demoRepoGitDir } from "./paths";

const execFileAsync = promisify(execFile);

function assertResetTargetIsDemoRepo(): void {
  const expected = path.resolve(process.cwd(), "demo-repo");
  if (DEMO_REPO_ROOT !== expected) {
    throw new Error("Reset target is not the expected demo-repo path.");
  }
  if (!demoRepoGitDir()) {
    throw new Error("demo-repo has no git history; refusing reset.");
  }
  if (!fs.existsSync(path.join(DEMO_REPO_ROOT, "package.json"))) {
    throw new Error("demo-repo does not look like PulseBoard; refusing reset.");
  }
}

/** The broken baseline is the root commit of demo-repo's own history. */
async function brokenCommitHash(): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    [...demoRepoGitArgs(), "rev-list", "--max-parents=0", "HEAD"],
    { cwd: DEMO_REPO_ROOT, timeout: 15_000 }
  );
  const hash = stdout.trim().split("\n")[0];
  if (!/^[0-9a-f]{40}$/.test(hash)) {
    throw new Error("Could not determine the broken baseline commit.");
  }
  return hash;
}

/** Restore demo-repo to its broken starting state. */
export async function resetDemoRepo(): Promise<{ resetTo: string }> {
  assertResetTargetIsDemoRepo();
  const hash = await brokenCommitHash();
  const gitArgs = demoRepoGitArgs();

  await execFileAsync("git", [...gitArgs, "reset", "--hard", hash], {
    cwd: DEMO_REPO_ROOT,
    timeout: 30_000,
  });
  // -e node_modules is belt-and-braces; it is also .gitignore'd.
  await execFileAsync("git", [...gitArgs, "clean", "-fd", "-e", "node_modules"], {
    cwd: DEMO_REPO_ROOT,
    timeout: 30_000,
  });

  return { resetTo: hash };
}
