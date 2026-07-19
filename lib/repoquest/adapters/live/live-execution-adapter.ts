import "server-only";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { resolveInsideRoot } from "@/lib/repository/paths";
import { VerificationResultSchema } from "../../domain/schemas";
import type { ProposedPatch } from "../../domain/types";
import type { ExecutionAdapter } from "../types";

const execFileAsync = promisify(execFile);
const TEST_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 20_000;

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
  return resolved;
}

export class LiveExecutionAdapter implements ExecutionAdapter {
  constructor(private readonly root: string) {}

  async applyApprovedPatch(patch: ProposedPatch) {
    const changedFiles: string[] = [];
    let alreadyApplied = true;

    for (const file of patch.files) {
      const resolved = await assertWritableFile(this.root, file.path);
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
      await fs.writeFile(resolved, current.replace(file.before, file.after), "utf8");
      changedFiles.push(file.path);
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
    const command = commands[0];
    const { binary, args } = parseAllowedCommand(command);

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

    return VerificationResultSchema.parse({
      command,
      passed: exitCode === 0,
      exitCode,
      output: limitedOutput(output),
      criteria: [
        {
          id: "command-exited-zero",
          description: `${command} exits successfully.`,
          passed: exitCode === 0,
          evidence: exitCode === 0 ? "Command exited with code 0." : limitedOutput(output).slice(-1_000),
        },
      ],
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
