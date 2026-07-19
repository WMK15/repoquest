import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Cloned external repositories live here (gitignored). */
export const WORKSPACES_ROOT = path.resolve(process.cwd(), "workspaces");

const CLONE_TIMEOUT_MS = 120_000;

export interface Workspace {
  root: string;
  repoName: string;
  owner: string;
}

/**
 * Accepts `https://github.com/owner/repo`, with optional `.git` or trailing
 * slash, or the `owner/repo` shorthand. Anything else is rejected.
 */
export function parseGitHubUrl(input: string): { owner: string; repo: string } {
  const trimmed = input.trim().replace(/\/+$/, "").replace(/\.git$/, "");
  const match =
    trimmed.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)$/) ??
    trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!match) {
    throw new Error(
      "Enter a GitHub repository as https://github.com/owner/repo or owner/repo."
    );
  }
  return { owner: match[1], repo: match[2] };
}

/** Open an existing repository on the local filesystem. */
export function openLocalRepo(inputPath: string): Workspace {
  const resolved = path.resolve(inputPath.trim());
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Not a directory: ${resolved}`);
  }
  const appRoot = path.resolve(process.cwd());
  if (resolved === appRoot || appRoot.startsWith(resolved + path.sep)) {
    throw new Error("Choose a repository outside the RepoQuest project itself.");
  }
  return {
    root: resolved,
    repoName: path.basename(resolved),
    owner: "local",
  };
}

/** Shallow-clone a public GitHub repository into the workspaces directory. */
export async function cloneGitHubRepo(input: string): Promise<Workspace> {
  const { owner, repo } = parseGitHubUrl(input);
  const url = `https://github.com/${owner}/${repo}.git`;
  const dir = path.join(WORKSPACES_ROOT, `${owner}__${repo}`);

  fs.mkdirSync(WORKSPACES_ROOT, { recursive: true });

  if (fs.existsSync(dir)) {
    // Refresh a previous clone rather than failing.
    fs.rmSync(dir, { recursive: true, force: true });
  }

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

  return { root: dir, repoName: repo, owner };
}
