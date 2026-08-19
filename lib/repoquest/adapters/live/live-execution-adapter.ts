import "server-only";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { resolveInsideRoot } from "../../../repository/paths";
import { VerificationResultSchema } from "../../domain/schemas";
import type { ProposedPatch } from "../../domain/types";
import type { ExecutionAdapter } from "../types";

const execFileAsync = promisify(execFile);
const TEST_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 20_000;
const GIT_TIMEOUT_MS = 15_000;

const ALLOWED_TEST_BINARIES = new Set([
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "node",
  "pytest",
  "go",
  "cargo",
]);

const SAFE_ARG_PATTERN = /^[\w@./:=+-]+$/;

function countOccurrences(content: string, search: string) {
  if (!search) return 0;
  return content.split(search).length - 1;
}

function parseAllowedCommand(command: string) {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) throw new Error("Verification command is empty.");
  const [binary, ...args] = parts;
  if (!ALLOWED_TEST_BINARIES.has(binary)) {
    throw new Error(`Verification command is not allowed: ${binary}`);
  }
  if (args.some((arg) => !SAFE_ARG_PATTERN.test(arg))) {
    throw new Error(`Verification command contains unsafe arguments: ${command}`);
  }
  if (binary === "npm" && !(args[0] === "test" || (args[0] === "run" && args[1]))) {
    throw new Error("Only npm test or npm run <script> verification commands are allowed.");
  }
  if (binary === "pnpm" && !(args[0] === "test" || (args[0] === "run" && args[1]))) {
    throw new Error("Only pnpm test or pnpm run <script> verification commands are allowed.");
  }
  if (binary === "yarn" && !(args[0] === "test" || (args[0] === "run" && args[1]))) {
    throw new Error("Only yarn test or yarn run <script> verification commands are allowed.");
  }
  if (binary === "bun" && !(args[0] === "test" || (args[0] === "run" && args[1]))) {
    throw new Error("Only bun test or bun run <script> verification commands are allowed.");
  }
  if (binary === "node" && !args[0]?.startsWith("--test")) {
    throw new Error("Only node --test verification commands are allowed.");
  }
  if (binary === "go" && args[0] !== "test") {
    throw new Error("Only go test verification commands are allowed.");
  }
  if (binary === "cargo" && args[0] !== "test") {
    throw new Error("Only cargo test verification commands are allowed.");
  }
  return { binary, args };
}

function limitedOutput(output: string) {
  return output.length > MAX_OUTPUT_CHARS ? output.slice(-MAX_OUTPUT_CHARS) : output;
}

async function assertWritableFile(root: string, relativePath: string) {
  const resolved = resolveInsideRoot(root, relativePath);
  const stat = await fs.lstat(resolved);
  if (!stat.isFile()) throw new Error(`Patch target is not a regular file: ${relativePath}`);
  if (stat.isSymbolicLink()) throw new Error(`Refusing to patch symlink: ${relativePath}`);
  const realRoot = await fs.realpath(root);
  const realFile = await fs.realpath(resolved);
  if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) {
    throw new Error(`Patch target escapes repository: ${relativePath}`);
  }
  return { resolved, mode: stat.mode & 0o777 };
}

async function writeFileAtomically(file: string, content: string, mode: number) {
  const temporary = path.join(
    path.dirname(file),
    `.repoquest-${path.basename(file)}-${crypto.randomUUID()}.tmp`
  );
  try {
    await fs.writeFile(temporary, content, { encoding: "utf8", flag: "wx", mode });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

async function assertCleanGitRepository(root: string) {
  const options = {
    cwd: root,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  };

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--is-inside-work-tree"],
      options
    );
    if (stdout.trim() !== "true") throw new Error("Not a Git work tree.");
  } catch {
    throw new Error(
      "Patch application requires the registered workspace to be a Git repository. RepoQuest cannot safely isolate writes from this runtime root."
    );
  }

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      options
    ));
  } catch {
    throw new Error(
      "Patch application was refused because RepoQuest could not verify that the Git working tree is clean."
    );
  }
  if (stdout.length > 0) {
    throw new Error(
      "Patch application requires a clean Git working tree, including no staged or untracked changes. This runtime is bound to the mapped repository root and cannot transparently switch mapping, diff, and verification to an isolated worktree; commit, stash, or remove existing changes before approving the patch."
    );
  }
}

export class LiveExecutionAdapter implements ExecutionAdapter {
  constructor(private readonly root: string) {}

  async applyApprovedPatch(patch: ProposedPatch) {
    const duplicatePath = patch.files.find(
      (file, index) => patch.files.findIndex((candidate) => candidate.path === file.path) !== index
    );
    if (duplicatePath) {
      throw new Error(`Patch contains the same file more than once: ${duplicatePath.path}`);
    }

    const replacements: Array<{
      path: string;
      resolved: string;
      mode: number;
      before: string;
      after: string;
    }> = [];
    const changedFiles: string[] = [];
    let alreadyApplied = true;

    for (const file of patch.files) {
      const { resolved, mode } = await assertWritableFile(this.root, file.path);
      const current = await fs.readFile(resolved, "utf8");
      if (current.includes(file.after) && !current.includes(file.before)) {
        continue;
      }
      alreadyApplied = false;
      const occurrences = countOccurrences(current, file.before);
      if (occurrences !== 1) {
        throw new Error(
          `Patch evidence is stale or malformed for ${file.path}; expected the before block to match exactly once, found ${occurrences}. Regenerate the proposed patch from the current file contents.`
        );
      }
      replacements.push({
        path: file.path,
        resolved,
        mode,
        before: current,
        after: current.replace(file.before, file.after),
      });
    }

    if (replacements.length > 0) await assertCleanGitRepository(this.root);

    try {
      for (const replacement of replacements) {
        if ((await fs.readFile(replacement.resolved, "utf8")) !== replacement.before) {
          throw new Error(`${replacement.path} changed after patch preflight`);
        }
        await writeFileAtomically(replacement.resolved, replacement.after, replacement.mode);
        changedFiles.push(replacement.path);
      }
    } catch (error) {
      const rollbackFailures: string[] = [];
      for (const file of [...replacements].reverse()) {
        if (!changedFiles.includes(file.path)) continue;
        try {
          const current = await fs.readFile(file.resolved, "utf8");
          if (current !== file.after) {
            rollbackFailures.push(`${file.path} changed concurrently`);
            continue;
          }
          await writeFileAtomically(file.resolved, file.before, file.mode);
        } catch (rollbackError) {
          rollbackFailures.push(
            `${file.path}: ${rollbackError instanceof Error ? rollbackError.message : "unknown error"}`
          );
        }
      }
      const cause = error instanceof Error ? error.message : "unknown write error";
      const rollback = rollbackFailures.length
        ? ` Rollback was incomplete: ${rollbackFailures.join("; ")}.`
        : " All files changed by this operation were restored.";
      throw new Error(`Patch application failed: ${cause}.${rollback}`, { cause: error });
    }

    const diff = await this.diff();
    return {
      patchId: patch.id,
      applied: changedFiles.length > 0,
      alreadyApplied,
      changedFiles,
      diff,
    };
  }

  async runAllowedTests(commands: string[]) {
    if (commands.length === 0) throw new Error("No verification command was provided.");
    // Validate the complete set before executing anything so a later unsafe command
    // cannot leave verification partially executed.
    const approvedCommands = commands.map((command) => ({
      command,
      ...parseAllowedCommand(command),
    }));
    const results: Array<{ command: string; exitCode: number; output: string }> = [];

    for (const { command, binary, args } of approvedCommands) {
      let exitCode = 0;
      let output = "";
      try {
        const result = await execFileAsync(binary, args, {
          cwd: this.root,
          timeout: TEST_TIMEOUT_MS,
          maxBuffer: 10 * 1024 * 1024,
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            CI: "true",
            NODE_ENV: "test",
            GIT_TERMINAL_PROMPT: "0",
            npm_config_audit: "false",
            npm_config_fund: "false",
          },
        });
        output = `${result.stdout}${result.stderr}`;
      } catch (error) {
        const failed = error as NodeJS.ErrnoException & {
          stdout?: string;
          stderr?: string;
          code?: number | string;
          signal?: string;
        };
        exitCode = typeof failed.code === "number" ? failed.code : 1;
        output = `${failed.stdout ?? ""}${failed.stderr ?? ""}`;
        if (failed.signal) output += `\nProcess terminated by ${failed.signal}.`;
        if (!output && failed.message) output = failed.message;
      }
      results.push({ command, exitCode, output: limitedOutput(output) });
    }

    const failedResult = results.find((result) => result.exitCode !== 0);
    const output = limitedOutput(
      results
        .map(
          (result) =>
            `=== ${result.command} (exit ${result.exitCode}) ===\n${result.output || "No output."}`
        )
        .join("\n\n")
    );

    return VerificationResultSchema.parse({
      command: commands.join("\n"),
      passed: !failedResult,
      exitCode: failedResult?.exitCode ?? 0,
      output,
      criteria: results.map((result, index) => ({
        id: `command-${index + 1}-exited-zero`,
        description: `${result.command} exits successfully.`,
        passed: result.exitCode === 0,
        evidence:
          result.exitCode === 0
            ? "Command exited with code 0."
            : result.output.slice(-1_000) || `Command exited with code ${result.exitCode}.`,
      })),
      changedFiles: [],
      diff: "",
      verifiedAt: new Date().toISOString(),
    });
  }

  async resetWorkspace(): Promise<void> {
    throw new Error("This live repository is not mutated by RepoQuest and does not need reset.");
  }

  private async diff() {
    try {
      const { stdout } = await execFileAsync("git", ["diff", "--no-ext-diff"], {
        cwd: this.root,
        timeout: 15_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      return limitedOutput(stdout);
    } catch {
      return "";
    }
  }
}
