import fg from "fast-glob";
import { DEMO_REPO_ROOT } from "./paths";

const IGNORE = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/vendor/**",
  "**/*.lock",
  "**/package-lock.json",
  "**/pnpm-lock.yaml",
  "**/.env*",
];

export interface RepoScan {
  sourceFiles: string[];
  markdownFiles: string[];
  totalFiles: number;
}

/** Enumerate source and Markdown files inside a repository root. */
export async function scanRepo(root: string = DEMO_REPO_ROOT): Promise<RepoScan> {
  const all = await fg(["**/*"], {
    cwd: root,
    ignore: IGNORE,
    dot: false,
    onlyFiles: true,
  });

  const sourceFiles = all
    .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f))
    .sort();
  const markdownFiles = all.filter((f) => /\.(md|mdx)$/i.test(f)).sort();

  return { sourceFiles, markdownFiles, totalFiles: all.length };
}
