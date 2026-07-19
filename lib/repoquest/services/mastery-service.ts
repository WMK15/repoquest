import type { RepoQuestRuntime } from "../adapters/create-runtime";

export class MasteryService {
  constructor(private readonly runtime: RepoQuestRuntime) {}

  rebuild(input: {
    repositoryName: string;
    repositoryCommitSha: string;
    knownNodeIds: string[];
  }) {
    return this.runtime.memory.rebuildEngineerProfile({
      engineerId: this.runtime.engineerId,
      repositoryId: this.runtime.repositoryId,
      ...input,
    });
  }
}
