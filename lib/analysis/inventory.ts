import fs from "node:fs/promises";
import path from "node:path";
import { scanRepo, type RepoScan } from "../repository/scan-files";
import { FileCategorySchema, RepositoryInventorySchema } from "./contracts";
import type { FileCategory, InventoryFile, RepositoryInventory } from "./types";

const PACKAGE_FILES = new Set([
  "package.json",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "requirements.txt",
  "pipfile",
  "poetry.lock",
  "cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "gemfile",
  "composer.json",
]);

const MANIFEST_FILES = /(?:^|\/)(?:manifest\.json|app\.json|deno\.jsonc?|go\.sum|package-lock\.json|pnpm-lock\.yaml|bun\.lock|[^/]+\.lock|[^/]+\.(?:csproj|fsproj|vbproj))$/i;
const CONFIG_FILES = /(?:^|\/)(?:components\.json|tsconfig(?:\.[^/]+)?\.json|jsconfig\.json|next\.config\.[^/]+|vite\.config\.[^/]+|webpack\.config\.[^/]+|eslint\.config\.[^/]+|\.eslintrc(?:\.[^/]+)?|\.prettierrc(?:\.[^/]+)?|prettier\.config\.[^/]+|\.editorconfig|\.gitignore|\.dockerignore|\.env\.(?:example|sample|template|dist)|[^/]+\.(?:jsonc?|ya?ml|toml|ini|cfg|conf|xml|hcl|graphql|gql|proto))$/i;
const SUPPORTED_TEXT_FILE = /(?:^|\/)(?:Dockerfile(?:\..+)?|[^/]+\.(?:[cm]?[jt]sx?|mdx?|rst|adoc|txt|sql|prisma|css|pcss|postcss|py|rb|rs|go|java|kt|kts|cs|fs|php|swift|scala|sh|bash|zsh|fish|c|cc|cpp|cxx|h|hpp|hxx|jsonc?|ya?ml|toml|ini|cfg|conf|xml|hcl|graphql|gql|proto|tf))$/i;

export function classifyRepositoryFile(file: string): FileCategory {
  const normalized = file.replaceAll("\\", "/");
  const lower = normalized.toLowerCase();
  const name = lower.slice(lower.lastIndexOf("/") + 1);

  if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(lower)) return "github-actions";
  if (name === "dockerfile" || name.startsWith("dockerfile.") || /(?:^|\/)(?:docker-)?compose\.ya?ml$/.test(lower)) return "docker";
  if (/\.tf(?:vars)?(?:\.json)?$/.test(lower) || /(?:^|\/)\.terraform\.lock\.hcl$/.test(lower)) return "terraform";
  if (PACKAGE_FILES.has(name)) return "package";
  if (/\.(?:ts|tsx|mts|cts)$/.test(lower)) return "typescript";
  if (/\.(?:js|jsx|mjs|cjs)$/.test(lower)) return "javascript";
  if (/\.sql$/.test(lower)) return "sql";
  if (/\.(?:prisma|css|pcss|postcss)$/.test(lower)) return "source";
  if (/\.(?:md|mdx|rst|adoc|txt)$/.test(lower) || /(?:^|\/)(?:readme|contributing|architecture|changelog|license)(?:\.[^/]*)?$/i.test(normalized)) return "documentation";
  if (MANIFEST_FILES.test(normalized)) return "manifest";
  if (CONFIG_FILES.test(normalized)) return "config";
  if (/\.(?:py|rb|rs|go|java|kt|kts|cs|fs|php|swift|scala|sh|bash|zsh|fish|c|cc|cpp|cxx|h|hpp|hxx)$/.test(lower)) return "source";
  if (/(?:^|\/)(?:test|tests|spec|specs|__tests__)\//.test(lower)) return "test";
  if (/\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|mp3|mp4|webm)$/.test(lower)) return "asset";
  return "other";
}

function isContentSafe(file: string, category: FileCategory): boolean {
  return (
    category !== "asset" &&
    (category !== "other" || SUPPORTED_TEXT_FILE.test(file)) &&
    !/(?:^|\/)\.env\.(?:example|sample|template|dist)$/i.test(file)
  );
}

export async function buildRepositoryInventory(
  root: string,
  scan?: RepoScan
): Promise<RepositoryInventory> {
  const repositoryScan = scan ?? (await scanRepo(root));
  const inventoryPaths = repositoryScan.allFiles ?? [
    ...new Set([...repositoryScan.sourceFiles, ...repositoryScan.markdownFiles]),
  ];
  const files = await Promise.all(
    inventoryPaths.map(async (file): Promise<InventoryFile> => {
      const stats = await fs.stat(path.resolve(root, file));
      const category = classifyRepositoryFile(file);
      return {
        path: file.replaceAll("\\", "/"),
        category,
        sizeBytes: stats.size,
        // Templates are discoverable but deliberately never marked for content ingestion.
        safeToRead: isContentSafe(file, category),
      };
    })
  );

  const categoryCounts = Object.fromEntries(
    FileCategorySchema.options.map((category) => [
      category,
      files.filter((file) => file.category === category).length,
    ])
  );

  return RepositoryInventorySchema.parse({
    root: path.resolve(root),
    files,
    totalFiles: files.length,
    categoryCounts,
  });
}
