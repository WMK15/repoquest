import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Cloned external repositories live here (gitignored). */
export const WORKSPACES_ROOT = path.resolve(process.cwd(), "workspaces");

const CLONE_TIMEOUT_MS = 120_000;

export interface Workspace {
  root: string;
  repoName: string;
  owner: string;
  identity: string;
}

/**
 * Accepts `https://github.com/owner/repo` or `github.com/owner/repo`, with
 * optional `.git` or trailing slash, or the `owner/repo` shorthand.
 */
export function parseGitHubUrl(input: string): { owner: string; repo: string } {
  const trimmed = input.trim().replace(/\/+$/, "").replace(/\.git$/, "");
  const match =
    trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)$/) ??
    trimmed.match(/^(?!github\.com\/)([\w.-]+)\/([\w.-]+)$/);
  if (!match) {
    throw new Error(
      "Enter a GitHub repository as github.com/owner/repo, https://github.com/owner/repo, or owner/repo."
    );
  }
  return { owner: match[1], repo: match[2] };
}

function isSameOrAncestor(candidate: string, target: string): boolean {
  return candidate === target || target.startsWith(candidate + path.sep);
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    timeout: CLONE_TIMEOUT_MS,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.trim();
}

export function createRemoteWorkspaceLocation(owner: string, repo: string) {
  const id = randomUUID();
  return {
    root: path.join(WORKSPACES_ROOT, `${owner}__${repo}__${id}`),
    identity: `github:${owner}/${repo}:${id}`,
  };
}

/** Create an isolated worktree for an existing local repository. */
export async function openLocalRepo(inputPath: string): Promise<Workspace> {
  const resolved = path.resolve(inputPath.trim());
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Not a directory: ${resolved}`);
  }

  const canonicalInput = fs.realpathSync(resolved);
  const appRoot = fs.realpathSync(process.cwd());
  if (isSameOrAncestor(canonicalInput, appRoot)) {
    throw new Error("Choose a repository outside the RepoQuest project itself.");
  }

  let sourceRoot: string;
  try {
    const insideWorkTree = await git(canonicalInput, ["rev-parse", "--is-inside-work-tree"]);
    if (insideWorkTree !== "true") throw new Error("not a worktree");
    sourceRoot = fs.realpathSync(
      await git(canonicalInput, ["rev-parse", "--show-toplevel"])
    );
  } catch {
    throw new Error("Local repositories must be valid Git working trees.");
  }

  if (isSameOrAncestor(sourceRoot, appRoot)) {
    throw new Error("Choose a repository outside the RepoQuest project itself.");
  }

  try {
    await git(sourceRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
  } catch {
    throw new Error("Local repositories must have at least one commit.");
  }

  const status = await git(sourceRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) {
    throw new Error("Local repositories must have a completely clean working tree.");
  }

  const repoName = path.basename(sourceRoot);
  const owner = `local-${createHash("sha256").update(sourceRoot).digest("hex").slice(0, 16)}`;
  const id = randomUUID();
  const safeRepoName = repoName.replace(/[^\w.-]+/g, "-") || "repository";
  const isolatedRoot = path.join(WORKSPACES_ROOT, `${owner}__${safeRepoName}__${id}`);
  const branch = `repoquest/${id}`;

  fs.mkdirSync(WORKSPACES_ROOT, { recursive: true });
  await git(sourceRoot, ["worktree", "add", "-b", branch, isolatedRoot, "HEAD"]);

  return {
    root: isolatedRoot,
    repoName,
    owner,
    identity: `local:${owner}:${id}`,
  };
}

/** Shallow-clone a public GitHub repository into the workspaces directory. */
export async function cloneGitHubRepo(input: string): Promise<Workspace> {
  const { owner, repo } = parseGitHubUrl(input);
  const url = `https://github.com/${owner}/${repo}.git`;
  const location = createRemoteWorkspaceLocation(owner, repo);
  const dir = location.root;

  fs.mkdirSync(WORKSPACES_ROOT, { recursive: true });

  try {
    await execFileAsync(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--single-branch",
        "--no-tags",
        "--recurse-submodules=no",
        url,
        dir,
      ],
      { timeout: CLONE_TIMEOUT_MS, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }
    );
  } catch (error) {
    if (isSameOrAncestor(WORKSPACES_ROOT, dir) && dir !== WORKSPACES_ROOT) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    throw error;
  }

  return { root: dir, repoName: repo, owner, identity: location.identity };
}
