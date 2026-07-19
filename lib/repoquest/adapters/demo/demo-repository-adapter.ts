import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gitDiff } from "@/lib/repository/apply-fix";
import {
  DEMO_REPO_ROOT,
  demoRepoGitArgs,
  readRepoFile,
} from "@/lib/repository/paths";
import { readKnowledgeArchive } from "@/lib/repository/read-markdown";
import { scanRepo } from "@/lib/repository/scan-files";
import { RepositoryIdentitySchema } from "../../domain/schemas";
import type { RepositoryAdapter } from "../types";

const execFileAsync = promisify(execFile);

export class DemoRepositoryAdapter implements RepositoryAdapter {
  async getRepositoryIdentity() {
    const { stdout } = await execFileAsync(
      "git",
      [...demoRepoGitArgs(), "rev-parse", "HEAD"],
      { cwd: DEMO_REPO_ROOT, timeout: 15_000 }
    );
    return RepositoryIdentitySchema.parse({
      id: "pulseboard",
      name: "PulseBoard",
      commitSha: stdout.trim(),
    });
  }

  scanRepository() {
    return scanRepo(DEMO_REPO_ROOT);
  }

  async readFile(file: string) {
    return readRepoFile(DEMO_REPO_ROOT, file);
  }

  readDocuments() {
    return readKnowledgeArchive(DEMO_REPO_ROOT);
  }

  getDiff() {
    return gitDiff();
  }
}
