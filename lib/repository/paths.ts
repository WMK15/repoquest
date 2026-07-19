import fs from "node:fs";
import path from "node:path";

const FORBIDDEN_BASENAMES = new Set([".env", ".env.local", ".env.production"]);

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

const MAX_FILE_BYTES = 256 * 1024;

export function readRepoFile(root: string, relativePath: string): string {
  const resolved = resolveInsideRoot(root, relativePath);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error(`Not a file: ${relativePath}`);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File too large to read: ${relativePath}`);
  }
  return fs.readFileSync(resolved, "utf8");
}
