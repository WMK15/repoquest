import path from "node:path";
import ts from "typescript";
import { dependencyEntries, evidenceAt, keyEvidence, packageManifests, readText, repositoryFiles } from "./ecosystems/helpers";
import type { DetectorFinding, DetectorOutput } from "./ecosystems/types";

interface PackageJson extends Record<string, unknown> {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function cleanAppSegments(segments: string[]): string[] {
  return segments.filter((segment) => !/^\(.*\)$/.test(segment) && !segment.startsWith("@")).map((segment) => {
    if (segment.startsWith("(.)")) return segment.slice(3);
    if (segment.startsWith("(..)(..)")) return segment.slice(8);
    if (segment.startsWith("(..)")) return segment.slice(4);
    return segment;
  });
}

function appRoute(file: string, appDirectory: string): string {
  const segments = cleanAppSegments(file.slice(appDirectory.length + 1).split("/").slice(0, -1));
  return `/${segments.join("/")}`.replace(/\/$|^$/, "/");
}

function pagesRoute(file: string, pagesDirectory: string): string {
  const route = file.slice(pagesDirectory.length + 1).replace(/\.(?:[cm]?[jt]sx?)$/, "").replace(/\/index$/, "");
  return `/${route}`.replace(/\/$|^$/, "/");
}

function sourceKind(file: string): ts.ScriptKind {
  return file.endsWith("x") ? (file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JSX) : file.includes(".js") ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

/** Detect Next.js routing conventions and explicit server/client execution boundaries. */
export async function detectNextJs(root: string): Promise<DetectorOutput> {
  const findings: DetectorFinding[] = [];
  const nextRoots = new Set<string>();
  for (const manifest of await packageManifests<PackageJson>(root)) {
    const nextDependency = dependencyEntries(manifest.pkg).find(([name]) => name === "next");
    if (!nextDependency) continue;
    nextRoots.add(manifest.directory);
    findings.push({ type: "framework", label: `Next.js ${nextDependency[1]}`, evidence: [keyEvidence(manifest.file, manifest.text, "next")], details: { version: nextDependency[1], packageRoot: manifest.directory } });
  }
  for (const file of await repositoryFiles(root, ["next.config.{js,mjs,cjs,ts,mts,cts}", "**/next.config.{js,mjs,cjs,ts,mts,cts}"])) {
    const text = readText(root, file);
    if (text !== undefined) {
      const packageRoot = path.posix.dirname(file) === "." ? "" : path.posix.dirname(file);
      nextRoots.add(packageRoot);
      findings.push({ type: "next-config", label: file, evidence: [evidenceAt(file, text)], details: { packageRoot } });
    }
  }

  const appDirectories = [...nextRoots].flatMap((packageRoot) => [path.posix.join(packageRoot, "app"), path.posix.join(packageRoot, "src/app")]);
  const appFiles = await repositoryFiles(root, appDirectories.map((directory) => `${directory}/**/{page,layout,route,loading,error,not-found,template,default}.{js,jsx,ts,tsx}`));
  for (const file of appFiles) {
    const text = readText(root, file);
    if (text === undefined) continue;
    const convention = path.basename(file).split(".")[0];
    const appDirectory = appDirectories.find((directory) => file.startsWith(`${directory}/`));
    if (!appDirectory) continue;
    const route = appRoute(file, appDirectory);
    const type = convention === "route" ? "app-api-route" : convention === "page" ? "app-page-route" : "app-route-convention";
    findings.push({ type, label: `${route} (${convention})`, evidence: [evidenceAt(file, text)], details: { router: "app", route, convention, file } });
  }

  const pagesDirectories = [...nextRoots].flatMap((packageRoot) => [path.posix.join(packageRoot, "pages"), path.posix.join(packageRoot, "src/pages")]);
  const pageFiles = await repositoryFiles(root, pagesDirectories.map((directory) => `${directory}/**/*.{js,jsx,ts,tsx}`));
  for (const file of pageFiles) {
    const text = readText(root, file);
    if (text === undefined) continue;
    const basename = path.basename(file).replace(/\.(?:[cm]?[jt]sx?)$/, "");
    if (["_app", "_document", "_error"].includes(basename)) {
      findings.push({ type: "pages-router-convention", label: basename, evidence: [evidenceAt(file, text)], details: { router: "pages", convention: basename, file } });
      continue;
    }
    const pagesDirectory = pagesDirectories.find((directory) => file.startsWith(`${directory}/`));
    if (!pagesDirectory) continue;
    const route = pagesRoute(file, pagesDirectory);
    const api = route === "/api" || route.startsWith("/api/");
    findings.push({ type: api ? "pages-api-route" : "pages-page-route", label: route, evidence: [evidenceAt(file, text)], details: { router: "pages", route, file } });
  }

  const middlewarePatterns = [...nextRoots].flatMap((packageRoot) => [path.posix.join(packageRoot, "middleware.{js,ts}"), path.posix.join(packageRoot, "src/middleware.{js,ts}")]);
  for (const file of await repositoryFiles(root, middlewarePatterns)) {
    const text = readText(root, file);
    if (text !== undefined) findings.push({ type: "middleware", label: "Next.js middleware", evidence: [evidenceAt(file, text)], details: { file } });
  }

  const sources = await repositoryFiles(root, [...appDirectories, ...pagesDirectories].map((directory) => `${directory}/**/*.{js,jsx,ts,tsx}`));
  for (const file of sources) {
    const text = readText(root, file);
    if (text === undefined) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, sourceKind(file));
    const directive = source.statements.find((statement) => ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression));
    if (directive && ts.isExpressionStatement(directive) && ts.isStringLiteral(directive.expression)) {
      const value = directive.expression.text;
      if (value === "use client" || value === "use server") {
        findings.push({
          type: "execution-boundary",
          label: `${value === "use client" ? "client" : "server"} boundary: ${file}`,
          evidence: [evidenceAt(file, text, directive.getStart(source))],
          details: { boundary: value === "use client" ? "client" : "server", file },
        });
      }
    }
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (specifier !== "server-only" && specifier !== "client-only") continue;
      findings.push({
        type: "execution-boundary",
        label: `${specifier}: ${file}`,
        evidence: [evidenceAt(file, text, statement.getStart(source))],
        details: { boundary: specifier.replace("-only", ""), marker: specifier, file },
      });
    }
  }

  return { detector: "nextjs", findings };
}
