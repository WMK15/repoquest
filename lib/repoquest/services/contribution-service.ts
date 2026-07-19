import { z } from "zod";
import type { RepoQuestRuntime } from "../adapters/create-runtime";
import type { FeatureStatus, RuntimeCapabilities } from "../adapters/types";
import { createContributionSession } from "../domain/contribution-session";
import { reduceContributionSession } from "../domain/contribution-reducer";
import { createRepoQuestEvent } from "../domain/events";
import {
  ContributionMissionSchema,
  ContributionSessionSchema,
  GuidanceLevelSchema,
} from "../domain/schemas";
import type {
  ContributionMission,
  ContributionSession,
  EngineerRepositoryProfile,
  NodeMastery,
  RepoQuestEvent,
} from "../domain/types";
import { ImplementationService } from "./implementation-service";
import { MasteryService } from "./mastery-service";
import { VerificationService } from "./verification-service";

const StartMissionInputSchema = z.object({
  mission: ContributionMissionSchema,
  guidanceLevel: GuidanceLevelSchema.optional(),
});

const SessionInputSchema = z.object({ sessionId: z.string().min(1) });
const ExploreNodeInputSchema = SessionInputSchema.extend({ nodeId: z.string().min(1) });
const DocumentReadInputSchema = SessionInputSchema.extend({
  path: z.string().min(1),
  nodeIds: z.array(z.string().min(1)),
});
const FlowTracedInputSchema = SessionInputSchema.extend({
  flowId: z.string().min(1),
  nodeIds: z.array(z.string().min(1)),
});
const ChallengeInputSchema = SessionInputSchema.extend({
  challengeId: z.string().min(1),
  correct: z.boolean(),
  nodeIds: z.array(z.string().min(1)),
});
const MissionOperationInputSchema = SessionInputSchema.extend({
  mission: ContributionMissionSchema,
  repositorySummary: z.string(),
});

export interface ContributionViewModel {
  session: ContributionSession;
  mastery: NodeMastery[];
  profile: EngineerRepositoryProfile;
  recommendation: ContributionMission | null;
  capabilities: RuntimeCapabilities;
  features: FeatureStatus;
}

export interface ContributionService {
  startMission(input: z.input<typeof StartMissionInputSchema>): Promise<ContributionViewModel>;
  exploreNode(input: z.input<typeof ExploreNodeInputSchema>): Promise<ContributionViewModel>;
  recordDocumentRead(input: z.input<typeof DocumentReadInputSchema>): Promise<ContributionViewModel>;
  traceFlow(input: z.input<typeof FlowTracedInputSchema>): Promise<ContributionViewModel>;
  completeChallenge(input: z.input<typeof ChallengeInputSchema>): Promise<ContributionViewModel>;
  beginImplementation(input: z.input<typeof SessionInputSchema>): Promise<ContributionViewModel>;
  generatePlan(input: z.input<typeof MissionOperationInputSchema>): Promise<ContributionViewModel>;
  approvePlan(input: z.input<typeof SessionInputSchema>): Promise<ContributionViewModel>;
  proposePatch(input: z.input<typeof MissionOperationInputSchema>): Promise<ContributionViewModel>;
  approveAndApplyPatch(input: z.input<typeof SessionInputSchema>): Promise<ContributionViewModel>;
  verifyContribution(input: z.input<typeof SessionInputSchema>): Promise<ContributionViewModel>;
  completeMission(input: z.input<typeof SessionInputSchema>): Promise<ContributionViewModel>;
  getSession(sessionId: string): Promise<ContributionViewModel>;
}

export class DefaultContributionService implements ContributionService {
  private readonly implementation: ImplementationService;
  private readonly verification: VerificationService;
  private readonly mastery: MasteryService;

  constructor(private readonly runtime: RepoQuestRuntime) {
    this.implementation = new ImplementationService(runtime);
    this.verification = new VerificationService(runtime);
    this.mastery = new MasteryService(runtime);
  }

  private async requireSession(sessionId: string) {
    const session = await this.runtime.memory.getSession(sessionId);
    if (!session) throw new Error("Unknown contribution session.");
    if (
      session.engineerId !== this.runtime.engineerId ||
      session.repositoryId !== this.runtime.repositoryId
    ) {
      throw new Error("Contribution session does not belong to this runtime.");
    }
    return session;
  }

  private async scopedEvents(session: ContributionSession) {
    return (await this.runtime.memory.getEvents({
      engineerId: session.engineerId,
      repositoryId: session.repositoryId,
    })).filter((event) => event.sessionId === session.id);
  }

  private async appendEvents(
    session: ContributionSession,
    events: RepoQuestEvent[]
  ): Promise<ContributionSession> {
    for (const event of events) await this.runtime.memory.appendEvent(event);
    const projected = reduceContributionSession(session, await this.scopedEvents(session));
    await this.runtime.memory.saveSession(projected);
    return projected;
  }

  private async view(session: ContributionSession): Promise<ContributionViewModel> {
    const identity = await this.runtime.repository.getRepositoryIdentity();
    const profile = await this.mastery.rebuild({
      repositoryName: identity.name,
      repositoryCommitSha: identity.commitSha,
      knownNodeIds: session.relevantNodeIds,
    });
    return {
      session,
      mastery: profile.nodeMastery,
      profile,
      recommendation: profile.recommendation,
      capabilities: this.runtime.capabilities,
      features: this.runtime.features,
    };
  }

  async startMission(raw: z.input<typeof StartMissionInputSchema>) {
    const input = StartMissionInputSchema.parse(raw);
    const identity = await this.runtime.repository.getRepositoryIdentity();
    const session = createContributionSession({
      engineerId: this.runtime.engineerId,
      repositoryId: this.runtime.repositoryId,
      repositoryCommitSha: identity.commitSha,
      missionId: input.mission.id,
      guidanceLevel: input.guidanceLevel ?? input.mission.recommendedGuidanceLevel,
      relevantNodeIds: input.mission.nodeIds,
      allowedFiles: input.mission.allowedFiles,
      relevantDocuments: input.mission.relevantDocuments,
    });
    await this.runtime.memory.saveSession(session);
    const projected = await this.appendEvents(session, [
      createRepoQuestEvent({
        type: "MISSION_STARTED",
        sessionId: session.id,
        missionId: session.missionId,
        nodeIds: session.relevantNodeIds,
      }),
    ]);
    return this.view(projected);
  }

  async exploreNode(raw: z.input<typeof ExploreNodeInputSchema>) {
    const input = ExploreNodeInputSchema.parse(raw);
    const session = await this.requireSession(input.sessionId);
    if (!session.relevantNodeIds.includes(input.nodeId)) {
      throw new Error("Node is outside the contribution scope.");
    }
    return this.view(
      await this.appendEvents(session, [
        createRepoQuestEvent({
          type: "NODE_EXPLORED",
          sessionId: session.id,
          nodeId: input.nodeId,
        }),
      ])
    );
  }

  async recordDocumentRead(raw: z.input<typeof DocumentReadInputSchema>) {
    const input = DocumentReadInputSchema.parse(raw);
    const session = await this.requireSession(input.sessionId);
    if (!session.relevantDocuments.includes(input.path)) {
      throw new Error("Document is outside the contribution scope.");
    }
    if (input.nodeIds.some((nodeId) => !session.relevantNodeIds.includes(nodeId))) {
      throw new Error("Document evidence references a node outside the contribution scope.");
    }
    return this.view(
      await this.appendEvents(session, [
        createRepoQuestEvent({
          type: "DOCUMENT_READ",
          sessionId: session.id,
          path: input.path,
          nodeIds: input.nodeIds,
        }),
      ])
    );
  }

  async traceFlow(raw: z.input<typeof FlowTracedInputSchema>) {
    const input = FlowTracedInputSchema.parse(raw);
    const session = await this.requireSession(input.sessionId);
    if (input.nodeIds.some((nodeId) => !session.relevantNodeIds.includes(nodeId))) {
      throw new Error("Flow references a node outside the contribution scope.");
    }
    return this.view(
      await this.appendEvents(session, [
        createRepoQuestEvent({
          type: "FLOW_TRACED",
          sessionId: session.id,
          flowId: input.flowId,
          nodeIds: input.nodeIds,
        }),
      ])
    );
  }

  async completeChallenge(raw: z.input<typeof ChallengeInputSchema>) {
    const input = ChallengeInputSchema.parse(raw);
    const session = await this.requireSession(input.sessionId);
    return this.view(
      await this.appendEvents(session, [
        createRepoQuestEvent({
          type: "CHALLENGE_COMPLETED",
          sessionId: session.id,
          challengeId: input.challengeId,
          correct: input.correct,
          nodeIds: input.nodeIds,
        }),
      ])
    );
  }

  async beginImplementation(raw: z.input<typeof SessionInputSchema>) {
    const input = SessionInputSchema.parse(raw);
    const session = await this.requireSession(input.sessionId);
    return this.view(
      await this.appendEvents(session, [
        createRepoQuestEvent({
          type: "READY_TO_IMPLEMENT",
          sessionId: session.id,
          nodeIds: session.relevantNodeIds,
        }),
      ])
    );
  }

  async generatePlan(raw: z.input<typeof MissionOperationInputSchema>) {
    const input = MissionOperationInputSchema.parse(raw);
    const session = await this.requireSession(input.sessionId);
    if (input.mission.id !== session.missionId) throw new Error("Mission does not match session.");
    const profile = (await this.view(session)).profile;
    const implementationPlan = await this.implementation.generatePlan({
      session,
      mission: input.mission,
      repositorySummary: input.repositorySummary,
      profile,
    });
    const withPlan = ContributionSessionSchema.parse({ ...session, implementationPlan });
    return this.view(
      await this.appendEvents(withPlan, [
        createRepoQuestEvent({
          type: "PLAN_GENERATED",
          sessionId: session.id,
          planId: implementationPlan.id,
        }),
      ])
    );
  }

  async approvePlan(raw: z.input<typeof SessionInputSchema>) {
    const input = SessionInputSchema.parse(raw);
    const session = await this.requireSession(input.sessionId);
    if (!session.implementationPlan) throw new Error("No implementation plan is available.");
    return this.view(
      await this.appendEvents(session, [
        createRepoQuestEvent({
          type: "PLAN_APPROVED",
          sessionId: session.id,
          planId: session.implementationPlan.id,
        }),
      ])
    );
  }

  async proposePatch(raw: z.input<typeof MissionOperationInputSchema>) {
    const input = MissionOperationInputSchema.parse(raw);
    const session = await this.requireSession(input.sessionId);
    const profile = (await this.view(session)).profile;
    const proposedPatch = await this.implementation.proposePatch({
      session,
      mission: input.mission,
      repositorySummary: input.repositorySummary,
      profile,
    });
    const withPatch = ContributionSessionSchema.parse({ ...session, proposedPatch });
    return this.view(
      await this.appendEvents(withPatch, [
        createRepoQuestEvent({
          type: "PATCH_PROPOSED",
          sessionId: session.id,
          patchId: proposedPatch.id,
          files: proposedPatch.files.map((file) => file.path),
        }),
      ])
    );
  }

  async approveAndApplyPatch(raw: z.input<typeof SessionInputSchema>) {
    const input = SessionInputSchema.parse(raw);
    const session = await this.requireSession(input.sessionId);
    if (!session.proposedPatch) throw new Error("No patch is available for approval.");
    const result = await this.implementation.applyApprovedPatch(session);
    return this.view(
      await this.appendEvents(session, [
        createRepoQuestEvent({
          type: "PATCH_APPROVED",
          sessionId: session.id,
          patchId: session.proposedPatch.id,
        }),
        createRepoQuestEvent({
          type: "PATCH_APPLIED",
          sessionId: session.id,
          patchId: session.proposedPatch.id,
          changedFiles: result.changedFiles,
        }),
      ])
    );
  }

  async verifyContribution(raw: z.input<typeof SessionInputSchema>) {
    const input = SessionInputSchema.parse(raw);
    const session = await this.requireSession(input.sessionId);
    const events = await this.scopedEvents(session);
    const verification = await this.verification.verify(session, events);
    const withVerification = ContributionSessionSchema.parse({ ...session, verification });
    const nextEvents: RepoQuestEvent[] = [
      createRepoQuestEvent({
        type: "TEST_EXECUTED",
        sessionId: session.id,
        command: verification.command,
        passed: verification.passed,
        exitCode: verification.exitCode,
      }),
    ];
    if (verification.passed) {
      nextEvents.push(
        createRepoQuestEvent({
          type: "CONTRIBUTION_VERIFIED",
          sessionId: session.id,
          missionId: session.missionId,
          nodeIds: session.relevantNodeIds,
          changedFiles: verification.changedFiles,
          testCommand: verification.command,
          guidanceLevel: session.guidanceLevel,
        })
      );
    }
    return this.view(await this.appendEvents(withVerification, nextEvents));
  }

  async completeMission(raw: z.input<typeof SessionInputSchema>) {
    const input = SessionInputSchema.parse(raw);
    const session = await this.requireSession(input.sessionId);
    if (session.stage !== "completed" || !session.verification?.passed) {
      throw new Error("Only a verified contribution can complete the mission.");
    }
    return this.view(
      await this.appendEvents(session, [
        createRepoQuestEvent({
          type: "MISSION_COMPLETED",
          sessionId: session.id,
          missionId: session.missionId,
        }),
      ])
    );
  }

  async getSession(sessionId: string) {
    return this.view(await this.requireSession(sessionId));
  }
}
