import path from "node:path";
import ts from "typescript";
import { evidenceAt, parseJson, readText, repositoryFiles } from "./helpers";
import type { DetectorFinding, DetectorOutput } from "./types";

const SOURCE_GLOB = "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}";

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function importKind(node: ts.Node): string | undefined {
  if (ts.isImportDeclaration(node)) return node.importClause?.isTypeOnly ? "type-import" : "static-import";
  if (ts.isExportDeclaration(node) && node.moduleSpecifier) return node.isTypeOnly ? "type-export" : "re-export";
  if (ts.isImportEqualsDeclaration(node)) return "import-equals";
  if (ts.isCallExpression(node)) {
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return "dynamic-import";
    if (ts.isIdentifier(node.expression) && node.expression.text === "require") return "require";
  }
  return undefined;
}

function moduleSpecifier(node: ts.Node): ts.Expression | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return node.moduleReference.expression;
  }
  if (ts.isCallExpression(node)) return node.arguments[0];
}

/** Detect imports, tsconfig aliases, and project references without resolving or executing code. */
export async function detectJavaScriptTypeScript(root: string): Promise<DetectorOutput> {
  const findings: DetectorFinding[] = [];
  const files = await repositoryFiles(root, [SOURCE_GLOB]);

  for (const file of files) {
    const text = readText(root, file);
    if (text === undefined) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
    const visit = (node: ts.Node) => {
      const kind = importKind(node);
      const specifier = kind && moduleSpecifier(node);
      if (kind && specifier) {
        const imported = ts.isStringLiteralLike(specifier) ? specifier.text : specifier.getText(source);
        const start = node.getStart(source);
        findings.push({
          type: "module-import",
          label: `${kind}: ${imported}`,
          evidence: [evidenceAt(file, text, start)],
          details: { kind, specifier: imported, literal: ts.isStringLiteralLike(specifier), sourceFile: file },
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  const configs = await repositoryFiles(root, ["**/tsconfig*.json", "**/jsconfig*.json"]);
  for (const file of configs) {
    const text = readText(root, file);
    if (text === undefined) continue;
    const config = parseJson<{
      compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
      references?: Array<{ path?: string }>;
    }>(text, path.basename(file));
    if (!config) continue;
    for (const [alias, targets] of Object.entries(config.compilerOptions?.paths ?? {})) {
      const offset = text.search(new RegExp(`["']${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`));
      findings.push({
        type: "tsconfig-alias",
        label: `${alias} -> ${targets.join(", ")}`,
        evidence: [evidenceAt(file, text, Math.max(0, offset))],
        details: { alias, targets, baseUrl: config.compilerOptions?.baseUrl },
      });
    }
    for (const reference of config.references ?? []) {
      if (!reference.path) continue;
      const offset = text.indexOf(reference.path);
      findings.push({
        type: "tsconfig-reference",
        label: `${file} references ${reference.path}`,
        evidence: [evidenceAt(file, text, Math.max(0, offset))],
        details: { config: file, reference: reference.path },
      });
    }
  }

  return { detector: "javascript-typescript", findings };
}
