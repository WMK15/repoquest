import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import {
  WORKSPACES_ROOT,
  createRemoteWorkspaceLocation,
  openLocalRepo,
  parseGitHubUrl,
} from "../lib/repository/workspace";

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];
const worktrees: Array<{ source: string; root: string }> = [];

async function git(cwd: string, args: string[]) {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function createRepository(commit = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repoquest-workspace-"));
  temporaryRoots.push(root);
  await git(root, ["init", "--quiet"]);
  await fs.writeFile(path.join(root, "tracked.txt"), "source\n", "utf8");
  if (commit) {
    await git(root, ["add", "."]);
    await git(root, [
      "-c",
      "user.name=RepoQuest Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "--quiet",
      "-m",
      "initial",
    ]);
  }
  return root;
}

afterEach(async () => {
  for (const worktree of worktrees.splice(0)) {
    await execFileAsync("git", ["worktree", "remove", worktree.root], {
      cwd: worktree.source,
    }).catch(() => undefined);
    await fs.rm(worktree.root, { recursive: true, force: true });
  }
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

describe("parseGitHubUrl", () => {
  test.each([
    "https://github.com/owner/repo",
    "github.com/owner/repo",
    "github.com/owner/repo.git/",
    "owner/repo",
  ])("accepts %s", (input) => {
    expect(parseGitHubUrl(input)).toEqual({ owner: "owner", repo: "repo" });
  });

  test("rejects non-GitHub hosts and incomplete paths", () => {
    expect(() => parseGitHubUrl("gitlab.com/owner/repo")).toThrow();
    expect(() => parseGitHubUrl("github.com/owner")).toThrow();
  });
});

describe("remote workspace allocation", () => {
  test("uses unique clone roots and runtime identities for the same repository", () => {
    const first = createRemoteWorkspaceLocation("owner", "repo");
    const second = createRemoteWorkspaceLocation("owner", "repo");

    expect(first.root.startsWith(WORKSPACES_ROOT + path.sep)).toBe(true);
    expect(first.root).not.toBe(second.root);
    expect(first.identity).not.toBe(second.identity);
    expect(first.identity).toMatch(/^github:owner\/repo:[0-9a-f-]{36}$/);
  });
});

describe("openLocalRepo", () => {
  test("creates a unique isolated worktree from the canonical repository HEAD", async () => {
    const source = await createRepository();
    const link = `${source}-link`;
    temporaryRoots.push(link);
    await fs.symlink(source, link, "dir");
    const sourceHead = await git(source, ["rev-parse", "HEAD"]);

    const workspace = await openLocalRepo(link);
    worktrees.push({ source, root: workspace.root });

    expect(workspace.root.startsWith(WORKSPACES_ROOT + path.sep)).toBe(true);
    expect(workspace.root).not.toBe(source);
    expect(workspace.repoName).toBe(path.basename(source));
    expect(workspace.owner).toMatch(/^local-[a-f0-9]{16}$/);
    expect(workspace.identity).toMatch(/^local:local-[a-f0-9]{16}:[0-9a-f-]{36}$/);
    expect(await git(workspace.root, ["rev-parse", "HEAD"])).toBe(sourceHead);
    expect(await git(workspace.root, ["branch", "--show-current"])).toMatch(/^repoquest\//);

    await fs.writeFile(path.join(workspace.root, "tracked.txt"), "isolated\n", "utf8");
    expect(await fs.readFile(path.join(source, "tracked.txt"), "utf8")).toBe("source\n");
    expect(await git(source, ["status", "--porcelain=v1"])).toBe("");

    const secondWorkspace = await openLocalRepo(source);
    worktrees.push({ source, root: secondWorkspace.root });
    expect(secondWorkspace.root).not.toBe(workspace.root);
    expect(secondWorkspace.identity).not.toBe(workspace.identity);
    expect(await git(secondWorkspace.root, ["branch", "--show-current"])).not.toBe(
      await git(workspace.root, ["branch", "--show-current"])
    );
  });

  test("refuses dirty repositories before creating a worktree", async () => {
    const source = await createRepository();
    await fs.writeFile(path.join(source, "untracked.txt"), "dirty\n", "utf8");

    await expect(openLocalRepo(source)).rejects.toThrow("completely clean working tree");
  });

  test("refuses repositories without a commit", async () => {
    const source = await createRepository(false);

    await expect(openLocalRepo(source)).rejects.toThrow("at least one commit");
  });

  test("refuses RepoQuest itself", async () => {
    await expect(openLocalRepo(process.cwd())).rejects.toThrow(
      "outside the RepoQuest project"
    );
  });
});
