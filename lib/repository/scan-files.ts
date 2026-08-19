import fg from "fast-glob";

const IGNORE = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/vendor/**",
  "**/.ssh/**",
  "**/.aws/**",
];

const SAFE_SECRET_TEMPLATES = /(?:\.example|\.sample|\.template|\.dist)$/i;
const SENSITIVE_FILE = /(?:^|\/)(?:\.env(?:\..+)?|\.npmrc|\.pypirc|kubeconfig|credentials(?:\.[^/]+)?|secrets?(?:\.[^/]+)?|id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:pem|key|p12|pfx|tfvars)|[^/]+\.tfstate(?:\..+)?)$/i;

/** Paths are returned for discovery only; likely credential-bearing files are omitted. */
export function isSafeRepositoryPath(file: string): boolean {
  const normalized = file.replaceAll("\\", "/");
  if (SAFE_SECRET_TEMPLATES.test(normalized)) return true;
  return !SENSITIVE_FILE.test(normalized);
}

export interface RepoScan {
  /** Every non-generated, non-sensitive file, including dotfiles such as workflows. */
  allFiles?: string[];
  /** Kept as JS/TS-only for compatibility with existing source sampling consumers. */
  sourceFiles: string[];
  markdownFiles: string[];
  totalFiles: number;
}

export async function scanRepo(root: string): Promise<RepoScan> {
  const all = (await fg(["**/*"], {
    cwd: root,
    ignore: IGNORE,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
  }))
    .filter(isSafeRepositoryPath)
    .sort();

  const sourceFiles = all
    .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f))
    .sort();
  const markdownFiles = all.filter((f) => /\.(md|mdx)$/i.test(f)).sort();

  return { allFiles: all, sourceFiles, markdownFiles, totalFiles: all.length };
}
