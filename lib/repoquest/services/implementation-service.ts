import type { RepoQuestRuntime } from "../adapters/create-runtime";
import type { SourceEvidence } from "../adapters/types";
import type {
  ContributionMission,
  ContributionSession,
  EngineerRepositoryProfile,
} from "../domain/types";
import { buildAgentContext } from "../memory/build-agent-context";

const MAX_IMPLEMENTATION_FILES = 16;
const MAX_IMPLEMENTATION_FILE_CHARS = 8_000;

export class ImplementationService {
  constructor(private readonly runtime: RepoQuestRuntime) {}

  private async sourceEvidence(session: ContributionSession): Promise<SourceEvidence[]> {
    const files = await Promise.all(
      session.allowedFiles.slice(0, MAX_IMPLEMENTATION_FILES).map(async (file) => {
        try {
          const content = await this.runtime.repository.readFile(file);
          return { path: file, content: content.slice(0, MAX_IMPLEMENTATION_FILE_CHARS) };
        } catch {
          return null;
        }
      })
    );
    return files.filter((file): file is SourceEvidence => file !== null);
  }

  private async documents(session: ContributionSession) {
    const relevant = new Set(session.relevantDocuments);
    return (await this.runtime.repository.readDocuments())
      .filter((document) => relevant.has(document.path))
      .slice(0, 10);
  }

  async generatePlan(input: {
    session: ContributionSession;
    mission: ContributionMission;
    repositorySummary: string;
    profile: EngineerRepositoryProfile;
  }) {
    return this.runtime.agent.generateImplementationPlan({
      ...input,
      sourceFiles: await this.sourceEvidence(input.session),
      documents: await this.documents(input.session),
      engineerContext: buildAgentContext(input.profile, input.session),
    });
  }

  async proposePatch(input: {
    session: ContributionSession;
    mission: ContributionMission;
    repositorySummary: string;
    profile: EngineerRepositoryProfile;
  }) {
    if (!input.session.implementationPlan) {
      throw new Error("An approved implementation plan is required before proposing a patch.");
    }
    return this.runtime.agent.proposePatch({
      ...input,
      plan: input.session.implementationPlan,
      sourceFiles: await this.sourceEvidence(input.session),
      documents: await this.documents(input.session),
      engineerContext: buildAgentContext(input.profile, input.session),
    });
  }

  applyApprovedPatch(session: ContributionSession) {
    if (!this.runtime.capabilities.canWriteRepository) {
      throw new Error("Patch application is unavailable for this read-only repository runtime.");
    }
    if (!session.proposedPatch) throw new Error("No proposed patch is available for approval.");
    return this.runtime.execution.applyApprovedPatch(session.proposedPatch);
  }
}
