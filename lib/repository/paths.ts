import fs from "node:fs";
import path from "node:path";

/** Absolute path of the prepared PulseBoard demo repository. */
export const DEMO_REPO_ROOT = path.resolve(process.cwd(), "demo-repo");

/**
 * demo-repo's git history lives either in an external git dir
 * (.demo-repo-git, so the parent repo can track demo-repo's files) or in a
 * conventional nested demo-repo/.git.
 */
export function demoRepoGitDir(): string | null {
  const external = path.resolve(process.cwd(), ".demo-repo-git");
  if (fs.existsSync(external)) return external;
  const nested = path.join(DEMO_REPO_ROOT, ".git");
  if (fs.existsSync(nested)) return nested;
  return null;
}

/** Arguments pinning git to demo-repo's history and work tree. */
export function demoRepoGitArgs(): string[] {
  const gitDir = demoRepoGitDir();
  if (!gitDir) throw new Error("demo-repo has no git history; run: node scripts/setup-demo-repo.mjs");
  return ["--git-dir", gitDir, "--work-tree", DEMO_REPO_ROOT];
}

/** Files the AI or UI may never read, regardless of location. */
const FORBIDDEN_BASENAMES = new Set([".env", ".env.local", ".env.production"]);

export function assertDemoRepoExists(): void {
  if (!fs.existsSync(path.join(DEMO_REPO_ROOT, "package.json"))) {
    throw new Error(`Demo repository not found at ${DEMO_REPO_ROOT}`);
  }
}

/**
 * Resolve a repo-relative path and guarantee it stays inside the given
 * root. Throws on traversal attempts, absolute paths, and forbidden files.
 */
export function resolveInsideRoot(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path escapes repository: ${relativePath}`);
  }
  if (FORBIDDEN_BASENAMES.has(path.basename(resolved))) {
    throw new Error(`Refusing to read protected file: ${relativePath}`);
  }
  return resolved;
}

export function resolveInsideDemoRepo(relativePath: string): string {
  return resolveInsideRoot(DEMO_REPO_ROOT, relativePath);
}

const MAX_FILE_BYTES = 256 * 1024;

/** Safely read a UTF-8 file from inside a repository root. */
export function readRepoFile(root: string, relativePath: string): string {
  const resolved = resolveInsideRoot(root, relativePath);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error(`Not a file: ${relativePath}`);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File too large to read: ${relativePath}`);
  }
  return fs.readFileSync(resolved, "utf8");
}

export function readDemoRepoFile(relativePath: string): string {
  return readRepoFile(DEMO_REPO_ROOT, relativePath);
}
