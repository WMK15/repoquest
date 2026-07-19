import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEMO_REPO_ROOT, demoRepoGitArgs, resolveInsideDemoRepo } from "./paths";

const execFileAsync = promisify(execFile);

/**
 * The only mutation this application is allowed to perform: the approved
 * one-line correction to the Access Gate middleware. The server — never the
 * model — decides the file and the exact change.
 */
export const APPROVED_FIX = {
  file: "src/middleware/require-auth.ts",
  before: `const token = authorizationHeader.split(" ")[0];`,
  after: `const token = authorizationHeader.split(" ")[1];`,
} as const;

export interface ApplyFixResult {
  applied: boolean;
  alreadyFixed: boolean;
  diff: string;
}

export async function applyApprovedFix(): Promise<ApplyFixResult> {
  const target = resolveInsideDemoRepo(APPROVED_FIX.file);
  const source = fs.readFileSync(target, "utf8");

  if (source.includes(APPROVED_FIX.after)) {
    return { applied: false, alreadyFixed: true, diff: await gitDiff() };
  }
  if (!source.includes(APPROVED_FIX.before)) {
    throw new Error(
      `Expected broken line not found in ${APPROVED_FIX.file}; refusing to patch.`
    );
  }

  fs.writeFileSync(
    target,
    source.replace(APPROVED_FIX.before, APPROVED_FIX.after),
    "utf8"
  );
  return { applied: true, alreadyFixed: false, diff: await gitDiff() };
}

export async function gitDiff(): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    [...demoRepoGitArgs(), "diff", "--", APPROVED_FIX.file],
    { cwd: DEMO_REPO_ROOT, timeout: 15_000 }
  );
  return stdout.slice(0, 8_000);
}
