import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import ts from "typescript";
import type { DetectorEvidence } from "./types";

const IGNORE = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.turbo/**",
  "**/.nx/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/generated/**",
  "**/__generated__/**",
  "**/vendor/**",
];

const MAX_FILE_BYTES = 1024 * 1024;

export async function repositoryFiles(root: string, patterns: string[]): Promise<string[]> {
  return fg(patterns, { cwd: root, ignore: IGNORE, dot: true, onlyFiles: true, unique: true });
}

export function readText(root: string, relativePath: string): string | undefined {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) return undefined;
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return undefined;
    return fs.readFileSync(resolved, "utf8");
  } catch {
    return undefined;
  }
}

export function parseJson<T = Record<string, unknown>>(text: string, fileName: string): T | undefined {
  const parsed = ts.parseConfigFileTextToJson(fileName, text);
  return parsed.error ? undefined : (parsed.config as T);
}

export function lineAt(text: string, offset: number): number {
  return text.slice(0, Math.max(0, offset)).split("\n").length;
}

export function evidenceAt(relativePath: string, text: string, offset = 0): DetectorEvidence {
  const line = lineAt(text, offset);
  return {
    path: relativePath.replaceAll(path.sep, "/"),
    line,
    snippet: text.split(/\r?\n/)[line - 1]?.trim().slice(0, 240),
  };
}

export function keyEvidence(relativePath: string, text: string, key: string): DetectorEvidence {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`["']${escaped}["']\\s*:`).exec(text);
  return evidenceAt(relativePath, text, match?.index ?? 0);
}

export function dependencyEntries(pkg: Record<string, unknown>): Array<[string, string, string]> {
  const entries: Array<[string, string, string]> = [];
  for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const values = pkg[section];
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    for (const [name, version] of Object.entries(values)) {
      if (typeof version === "string") entries.push([name, version, section]);
    }
  }
  return entries;
}

export interface PackageManifest<T extends Record<string, unknown> = Record<string, unknown>> {
  file: string;
  directory: string;
  text: string;
  pkg: T;
}

/** Read every source package manifest while retaining repository-relative ownership. */
export async function packageManifests<T extends Record<string, unknown> = Record<string, unknown>>(
  root: string
): Promise<Array<PackageManifest<T>>> {
  const manifests: Array<PackageManifest<T>> = [];
  for (const file of await repositoryFiles(root, ["package.json", "**/package.json"])) {
    const text = readText(root, file);
    const pkg = text ? parseJson<T>(text, file) : undefined;
    if (!text || !pkg) continue;
    manifests.push({ file, directory: path.posix.dirname(file) === "." ? "" : path.posix.dirname(file), text, pkg });
  }
  return manifests.sort((a, b) => a.file.localeCompare(b.file));
}
