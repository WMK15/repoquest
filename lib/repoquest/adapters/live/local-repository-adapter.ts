import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readRepoFile } from "@/lib/repository/paths";
import { readKnowledgeArchive } from "@/lib/repository/read-markdown";
import { scanRepo } from "@/lib/repository/scan-files";
import { RepositoryIdentitySchema } from "../../domain/schemas";
import type { RepositoryAdapter } from "../types";

const execFileAsync = promisify(execFile);

export class LocalRepositoryAdapter implements RepositoryAdapter {
  constructor(
    private readonly root: string,
    private readonly repositoryId: string,
    private readonly repositoryName: string
  ) {}

  async getRepositoryIdentity() {
    let commitSha = "unversioned";
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
        cwd: this.root,
        timeout: 15_000,
      });
      commitSha = stdout.trim();
    } catch {
      // Non-git directories remain readable but are explicitly unversioned.
    }
    return RepositoryIdentitySchema.parse({
      id: this.repositoryId,
      name: this.repositoryName,
      commitSha,
    });
  }

  scanRepository() {
    return scanRepo(this.root);
  }

  async readFile(file: string) {
    return readRepoFile(this.root, file);
  }

  readDocuments() {
    return readKnowledgeArchive(this.root);
  }

  async getDiff() {
    try {
      const { stdout } = await execFileAsync("git", ["diff", "--no-ext-diff"], {
        cwd: this.root,
        timeout: 15_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      return stdout.slice(0, 20_000);
    } catch {
      return "";
    }
  }
}
