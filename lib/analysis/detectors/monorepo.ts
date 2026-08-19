import path from "node:path";
import {
  dependencyEntries,
  evidenceAt,
  keyEvidence,
  packageManifests,
  parseJson,
  readText,
  repositoryFiles,
} from "./ecosystems/helpers";
import type { DetectorFinding, DetectorOutput } from "./ecosystems/types";

interface PackageJson extends Record<string, unknown> {
  name?: string;
  private?: boolean;
  workspaces?: string[] | { packages?: string[] };
  scripts?: Record<string, string>;
}

function pnpmWorkspacePatterns(text: string): Array<{ pattern: string; offset: number }> {
  const result: Array<{ pattern: string; offset: number }> = [];
  const lines = text.split(/\r?\n/);
  let inPackages = false;
  let offset = 0;
  for (const line of lines) {
    if (/^packages\s*:\s*$/.test(line)) {
      inPackages = true;
      offset += line.length + 1;
      continue;
    }
    if (inPackages && /^\S/.test(line) && line.trim()) break;
    if (inPackages) {
      const match = line.match(/^\s+-\s*["']?([^"'#]+?)["']?\s*(?:#.*)?$/);
      if (match) result.push({ pattern: match[1].trim(), offset });
    }
    offset += line.length + 1;
  }
  return result;
}

function classifyPackage(file: string, pkg: PackageJson): string {
  const dependencies = new Set(dependencyEntries(pkg).map(([name]) => name));
  const scripts = Object.keys(pkg.scripts ?? {});
  if (dependencies.has("next") || dependencies.has("react-scripts") || dependencies.has("@angular/core")) return "application";
  if (dependencies.has("express") || dependencies.has("fastify") || dependencies.has("@nestjs/core")) return "service";
  if (/^(apps?|services?)\//.test(file)) return "application";
  if (/^(packages?|libs?)\//.test(file)) return "library";
  if (dependencies.has("eslint") || dependencies.has("typescript") || scripts.some((script) => /lint|format|build/.test(script))) return "tooling";
  return pkg.private ? "private-package" : "package";
}

function packagePatterns(pkg: PackageJson): string[] {
  if (Array.isArray(pkg.workspaces)) return pkg.workspaces;
  return pkg.workspaces?.packages ?? [];
}

/** Discover workspace packages, package roles, internal edges, task runners, and configured tasks. */
export async function detectMonorepo(root: string): Promise<DetectorOutput> {
  const findings: DetectorFinding[] = [];
  const patterns: Array<{ pattern: string; resolvedPattern: string; path: string; offset: number }> = [];
  const allManifests = await packageManifests<PackageJson>(root);
  const manifestByFile = new Map(allManifests.map((manifest) => [manifest.file, manifest]));
  const workspaceRoots = new Set<string>();

  for (const manifest of allManifests) {
    const workspacePatterns = packagePatterns(manifest.pkg);
    if (workspacePatterns.length) workspaceRoots.add(manifest.file);
    for (const pattern of workspacePatterns) {
      const negated = pattern.startsWith("!");
      const value = negated ? pattern.slice(1) : pattern;
      const resolved = path.posix.join(manifest.directory, value);
      patterns.push({ pattern, resolvedPattern: `${negated ? "!" : ""}${resolved}`, path: manifest.file, offset: manifest.text.indexOf(pattern) });
    }
    const packageManager = typeof manifest.pkg.packageManager === "string" ? manifest.pkg.packageManager : undefined;
    if (packageManager) {
      findings.push({
        type: "package-manager",
        label: packageManager,
        evidence: [keyEvidence(manifest.file, manifest.text, "packageManager")],
        details: { packageManager, workspaceRoot: manifest.directory },
      });
    }
  }

  for (const file of await repositoryFiles(root, ["pnpm-workspace.yaml", "**/pnpm-workspace.yaml"])) {
    const pnpmText = readText(root, file);
    if (!pnpmText) continue;
    const workspaceRoot = path.posix.dirname(file) === "." ? "" : path.posix.dirname(file);
    const rootManifest = path.posix.join(workspaceRoot, "package.json");
    if (manifestByFile.has(rootManifest)) workspaceRoots.add(rootManifest);
    for (const entry of pnpmWorkspacePatterns(pnpmText)) {
      const negated = entry.pattern.startsWith("!");
      const value = negated ? entry.pattern.slice(1) : entry.pattern;
      patterns.push({ pattern: entry.pattern, resolvedPattern: `${negated ? "!" : ""}${path.posix.join(workspaceRoot, value)}`, path: file, offset: entry.offset });
    }
    findings.push({ type: "package-manager", label: "pnpm workspace", evidence: [evidenceAt(file, pnpmText)], details: { workspaceRoot } });
  }

  const lockSignals: Array<[string, string]> = [
    ["package-lock.json", "npm"],
    ["yarn.lock", "yarn"],
    ["pnpm-lock.yaml", "pnpm"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
  ];
  for (const [name, manager] of lockSignals) {
    for (const file of await repositoryFiles(root, [name, `**/${name}`])) {
      const text = readText(root, file);
      if (text !== undefined) findings.push({ type: "package-manager", label: `${manager} lockfile`, evidence: [evidenceAt(file, text)], details: { workspaceRoot: path.posix.dirname(file) === "." ? "" : path.posix.dirname(file) } });
    }
  }

  const uniquePatterns = [...new Set(patterns.map(({ resolvedPattern }) => resolvedPattern))];
  for (const configured of patterns) {
    const source = readText(root, configured.path);
    if (source === undefined) continue;
    findings.push({
      type: "workspace-pattern",
      label: configured.pattern,
      evidence: [evidenceAt(configured.path, source, Math.max(0, configured.offset))],
      details: { pattern: configured.pattern },
    });
  }

  const manifests = new Set<string>(workspaceRoots);
  if (uniquePatterns.length) {
    const packageGlobs = uniquePatterns
      .filter((pattern) => !pattern.startsWith("!"))
      .map((pattern) => `${pattern.replace(/\/$/, "")}/package.json`);
    const negativeGlobs = uniquePatterns.filter((pattern) => pattern.startsWith("!")).map((pattern) => `!${pattern.slice(1).replace(/\/$/, "")}/package.json`);
    for (const file of await repositoryFiles(root, [...packageGlobs, ...negativeGlobs])) manifests.add(file);
  }

  const packages = new Map<string, { file: string; text: string; pkg: PackageJson }>();
  for (const file of [...manifests].sort()) {
    const text = readText(root, file);
    const pkg = text ? parseJson<PackageJson>(text, path.basename(file)) : undefined;
    if (!text || !pkg) continue;
    const name = pkg.name ?? (file === "package.json" ? path.basename(root) : path.basename(path.dirname(file)));
    packages.set(name, { file, text, pkg });
    findings.push({
      type: "workspace-package",
      label: `${name} (${classifyPackage(file, pkg)})`,
      evidence: [pkg.name ? keyEvidence(file, text, "name") : evidenceAt(file, text)],
      details: { name, directory: path.posix.dirname(file), classification: classifyPackage(file, pkg), private: pkg.private === true },
    });
  }

  for (const [from, entry] of packages) {
    for (const [to, version, section] of dependencyEntries(entry.pkg)) {
      if (!packages.has(to)) continue;
      findings.push({
        type: "internal-dependency",
        label: `${from} -> ${to}`,
        evidence: [keyEvidence(entry.file, entry.text, to)],
        details: { from, to, version, section },
      });
    }
  }

  for (const file of await repositoryFiles(root, ["turbo.json", "**/turbo.json"])) {
    const turboText = readText(root, file);
    if (!turboText) continue;
    const turbo = parseJson<{ tasks?: Record<string, unknown>; pipeline?: Record<string, unknown> }>(turboText, file);
    const workspaceRoot = path.posix.dirname(file) === "." ? "" : path.posix.dirname(file);
    findings.push({ type: "task-runner", label: "Turborepo", evidence: [evidenceAt(file, turboText)], details: { workspaceRoot } });
    for (const [task, config] of Object.entries(turbo?.tasks ?? turbo?.pipeline ?? {})) {
      findings.push({ type: "workspace-task", label: `turbo ${task}`, evidence: [keyEvidence(file, turboText, task)], details: { runner: "turbo", task, config, workspaceRoot } });
    }
  }

  for (const file of await repositoryFiles(root, ["nx.json", "**/nx.json"])) {
    const nxText = readText(root, file);
    if (!nxText) continue;
    const nx = parseJson<{ targetDefaults?: Record<string, unknown>; plugins?: unknown[] }>(nxText, file);
    const workspaceRoot = path.posix.dirname(file) === "." ? "" : path.posix.dirname(file);
    findings.push({ type: "task-runner", label: "Nx", evidence: [evidenceAt(file, nxText)], details: { plugins: nx?.plugins ?? [], workspaceRoot } });
    for (const [task, config] of Object.entries(nx?.targetDefaults ?? {})) {
      findings.push({ type: "workspace-task", label: `nx ${task}`, evidence: [keyEvidence(file, nxText, task)], details: { runner: "nx", task, config, workspaceRoot } });
    }
  }
  for (const file of await repositoryFiles(root, ["**/project.json"])) {
    const text = readText(root, file);
    const project = text ? parseJson<{ name?: string; targets?: Record<string, unknown> }>(text, file) : undefined;
    if (!text || !project) continue;
    const projectRoot = path.posix.dirname(file);
    findings.push({ type: "nx-project", label: project.name ?? projectRoot, evidence: [project.name ? keyEvidence(file, text, "name") : evidenceAt(file, text)], details: { project: project.name, projectRoot } });
    for (const [task, config] of Object.entries(project.targets ?? {})) {
      findings.push({ type: "workspace-task", label: `${project.name ?? projectRoot}:${task}`, evidence: [keyEvidence(file, text, task)], details: { runner: "nx", project: project.name, projectRoot, task, config } });
    }
  }

  return { detector: "monorepo", findings };
}
