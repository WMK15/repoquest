import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ProposedPatch } from "../lib/repoquest/domain/types";

vi.mock("server-only", () => ({}));

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function createRepository(git = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repoquest-execution-"));
  roots.push(root);
  await fs.writeFile(path.join(root, "a.txt"), "alpha\n", "utf8");
  await fs.writeFile(path.join(root, "b.txt"), "bravo\n", "utf8");
  await fs.writeFile(path.join(root, "pass.test.js"), "console.log('SECOND_COMMAND_RAN')\n", "utf8");
  await fs.writeFile(path.join(root, "fail.test.js"), "throw new Error('FIRST_COMMAND_FAILED')\n", "utf8");
  if (git) {
    await execFileAsync("git", ["init", "--quiet"], { cwd: root });
    await execFileAsync("git", ["add", "."], { cwd: root });
    await execFileAsync(
      "git",
      ["-c", "user.name=RepoQuest Test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", "initial"],
      { cwd: root }
    );
  }
  return root;
}

function patch(files: ProposedPatch["files"]): ProposedPatch {
  return {
    id: "patch-1",
    missionId: "mission-1",
    files,
    testsToRun: ["npm test"],
    createdAt: new Date().toISOString(),
  };
}

function replacement(filePath: string, before: string, after: string) {
  return { path: filePath, before, after, unifiedDiff: "diff", explanation: "test" };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("LiveExecutionAdapter contribution writes", () => {
  test("applies an approved patch on a clean Git tree and remains idempotent", async () => {
    const { LiveExecutionAdapter } = await import(
      "../lib/repoquest/adapters/live/live-execution-adapter"
    );
    const root = await createRepository();
    const adapter = new LiveExecutionAdapter(root);
    const proposed = patch([replacement("a.txt", "alpha", "changed")]);

    await expect(adapter.applyApprovedPatch(proposed)).resolves.toMatchObject({
      applied: true,
      alreadyApplied: false,
      changedFiles: ["a.txt"],
    });
    expect(await fs.readFile(path.join(root, "a.txt"), "utf8")).toBe("changed\n");
    await expect(adapter.applyApprovedPatch(proposed)).resolves.toMatchObject({
      applied: false,
      alreadyApplied: true,
      changedFiles: [],
    });
  });

  test("refuses non-Git and dirty repositories without changing files", async () => {
    const { LiveExecutionAdapter } = await import(
      "../lib/repoquest/adapters/live/live-execution-adapter"
    );
    const nonGit = await createRepository(false);
    await expect(
      new LiveExecutionAdapter(nonGit).applyApprovedPatch(
        patch([replacement("a.txt", "alpha", "changed")])
      )
    ).rejects.toThrow("requires the registered workspace to be a Git repository");
    expect(await fs.readFile(path.join(nonGit, "a.txt"), "utf8")).toBe("alpha\n");

    const dirty = await createRepository();
    await fs.writeFile(path.join(dirty, "untracked.txt"), "dirty", "utf8");
    await expect(
      new LiveExecutionAdapter(dirty).applyApprovedPatch(
        patch([replacement("a.txt", "alpha", "changed")])
      )
    ).rejects.toThrow("requires a clean Git working tree");
    expect(await fs.readFile(path.join(dirty, "a.txt"), "utf8")).toBe("alpha\n");
  });

  test("preflights every file before applying a multi-file patch", async () => {
    const { LiveExecutionAdapter } = await import(
      "../lib/repoquest/adapters/live/live-execution-adapter"
    );
    const root = await createRepository();
    await expect(
      new LiveExecutionAdapter(root).applyApprovedPatch(
        patch([
          replacement("a.txt", "alpha", "changed"),
          replacement("b.txt", "missing", "changed"),
        ])
      )
    ).rejects.toThrow("expected the before block to match exactly once");
    expect(await fs.readFile(path.join(root, "a.txt"), "utf8")).toBe("alpha\n");
    expect(await fs.readFile(path.join(root, "b.txt"), "utf8")).toBe("bravo\n");
  });

  test("rolls back files changed by the operation when a later write fails", async () => {
    const { LiveExecutionAdapter } = await import(
      "../lib/repoquest/adapters/live/live-execution-adapter"
    );
    const root = await createRepository();
    const realRename = fs.rename.bind(fs);
    let patchRenames = 0;
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (path.basename(String(from)).startsWith(".repoquest-")) {
        patchRenames += 1;
        if (patchRenames === 2) throw new Error("injected write failure");
      }
      return realRename(from, to);
    });

    await expect(
      new LiveExecutionAdapter(root).applyApprovedPatch(
        patch([
          replacement("a.txt", "alpha", "changed-a"),
          replacement("b.txt", "bravo", "changed-b"),
        ])
      )
    ).rejects.toThrow("All files changed by this operation were restored");
    expect(await fs.readFile(path.join(root, "a.txt"), "utf8")).toBe("alpha\n");
    expect(await fs.readFile(path.join(root, "b.txt"), "utf8")).toBe("bravo\n");
  });
});

describe("LiveExecutionAdapter verification", () => {
  test("executes and aggregates every approved command even when one fails", async () => {
    const { LiveExecutionAdapter } = await import(
      "../lib/repoquest/adapters/live/live-execution-adapter"
    );
    const root = await createRepository();

    const result = await new LiveExecutionAdapter(root).runAllowedTests([
      "node --test fail.test.js",
      "node --test pass.test.js",
    ]);

    expect(result.passed).toBe(false);
    expect(result.criteria).toHaveLength(2);
    expect(result.criteria.map((criterion) => criterion.passed)).toEqual([false, true]);
    expect(result.output).toContain("FIRST_COMMAND_FAILED");
    expect(result.output).toContain("SECOND_COMMAND_RAN");
  });
});
