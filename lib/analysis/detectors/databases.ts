import path from "node:path";
import ts from "typescript";
import { dependencyEntries, evidenceAt, keyEvidence, packageManifests, readText, repositoryFiles } from "./ecosystems/helpers";
import type { DetectorFinding, DetectorOutput } from "./ecosystems/types";

const DATABASE_PACKAGES = /^(?:@prisma\/client|prisma|drizzle-orm|drizzle-kit|kysely|sequelize|typeorm|mongoose|pg|mysql2|better-sqlite3|sqlite3)$/;

function sourceKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

/** Detect SQL DDL/migrations and Prisma/Drizzle schema and tooling signals. */
export async function detectDatabases(root: string): Promise<DetectorOutput> {
  const findings: DetectorFinding[] = [];
  for (const manifest of await packageManifests(root)) {
    for (const [name, version, section] of dependencyEntries(manifest.pkg)) {
      if (!DATABASE_PACKAGES.test(name)) continue;
      findings.push({ type: "database-package", label: `${name} ${version}`, evidence: [keyEvidence(manifest.file, manifest.text, name)], details: { name, version, section, packageRoot: manifest.directory } });
    }
  }

  for (const file of await repositoryFiles(root, ["**/*.sql"])) {
    const text = readText(root, file);
    if (text === undefined) continue;
    if (/(^|\/)(?:migrations?|migrate|schema)(\/|$)/i.test(file)) {
      findings.push({ type: "sql-migration", label: file, evidence: [evidenceAt(file, text)], details: { file } });
    }
    const ddl = /\b(CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|INDEX|TYPE|SCHEMA|FUNCTION|TRIGGER)|ALTER\s+TABLE|DROP\s+(?:TABLE|VIEW|INDEX|TYPE))\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([`"\[]?[\w.-]+[`"\]]?)/gi;
    for (const match of text.matchAll(ddl)) {
      const operation = match[1].replace(/\s+/g, " ").toUpperCase();
      findings.push({
        type: "sql-ddl",
        label: `${operation} ${match[2]}`,
        evidence: [evidenceAt(file, text, match.index ?? 0)],
        details: { operation, object: match[2], file },
      });
    }
  }

  for (const file of await repositoryFiles(root, ["**/*.prisma"])) {
    const text = readText(root, file);
    if (text === undefined) continue;
    for (const match of text.matchAll(/^\s*(model|enum|type|view)\s+(\w+)/gm)) {
      findings.push({ type: `prisma-${match[1]}`, label: `${match[1]} ${match[2]}`, evidence: [evidenceAt(file, text, match.index ?? 0)], details: { kind: match[1], name: match[2], file } });
    }
    for (const match of text.matchAll(/^\s*(datasource|generator)\s+(\w+)/gm)) {
      findings.push({ type: `prisma-${match[1]}`, label: `${match[1]} ${match[2]}`, evidence: [evidenceAt(file, text, match.index ?? 0)], details: { kind: match[1], name: match[2], file } });
    }
  }
  for (const file of await repositoryFiles(root, ["**/prisma/migrations/**/migration.sql"])) {
    const text = readText(root, file);
    if (text !== undefined) findings.push({ type: "prisma-migration", label: path.posix.dirname(file), evidence: [evidenceAt(file, text)], details: { file } });
  }

  for (const file of await repositoryFiles(root, ["**/drizzle.config.{js,ts,mjs,cjs,mts,cts}"])) {
    const text = readText(root, file);
    if (text !== undefined) findings.push({ type: "drizzle-config", label: file, evidence: [evidenceAt(file, text)], details: { file } });
  }

  const sourceFiles = await repositoryFiles(root, ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"]);
  const drizzleFactories = new Set(["pgTable", "mysqlTable", "sqliteTable", "pgView", "mysqlView", "sqliteView", "relations"]);
  for (const file of sourceFiles) {
    const text = readText(root, file);
    if (text === undefined || !/[Tt]able|relations\s*\(/.test(text)) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, sourceKind(file));
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && drizzleFactories.has(node.expression.text)) {
        const factory = node.expression.text;
        const firstArgument = node.arguments[0];
        const name = firstArgument && ts.isStringLiteralLike(firstArgument) ? firstArgument.text : undefined;
        findings.push({
          type: factory === "relations" ? "drizzle-relations" : "drizzle-schema",
          label: name ? `${factory} ${name}` : factory,
          evidence: [evidenceAt(file, text, node.getStart(source))],
          details: { factory, name, file },
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return { detector: "databases", findings };
}
