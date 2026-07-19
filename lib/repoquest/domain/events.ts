import { z } from "zod";
import { GuidanceLevelSchema } from "./schemas";

const EventBaseSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  occurredAt: z.string().datetime(),
});

export const RepoQuestEventSchema = z.discriminatedUnion("type", [
  EventBaseSchema.extend({
    type: z.literal("MISSION_STARTED"),
    missionId: z.string().min(1),
    nodeIds: z.array(z.string().min(1)),
  }),
  EventBaseSchema.extend({
    type: z.literal("NODE_EXPLORED"),
    nodeId: z.string().min(1),
  }),
  EventBaseSchema.extend({
    type: z.literal("DOCUMENT_READ"),
    path: z.string().min(1),
    nodeIds: z.array(z.string().min(1)),
  }),
  EventBaseSchema.extend({
    type: z.literal("FLOW_TRACED"),
    flowId: z.string().min(1),
    nodeIds: z.array(z.string().min(1)),
  }),
  EventBaseSchema.extend({
    type: z.literal("CHALLENGE_COMPLETED"),
    challengeId: z.string().min(1),
    correct: z.boolean(),
    nodeIds: z.array(z.string().min(1)),
  }),
  EventBaseSchema.extend({
    type: z.literal("READY_TO_IMPLEMENT"),
    nodeIds: z.array(z.string().min(1)),
  }),
  EventBaseSchema.extend({
    type: z.literal("PLAN_GENERATED"),
    planId: z.string().min(1),
  }),
  EventBaseSchema.extend({
    type: z.literal("PLAN_APPROVED"),
    planId: z.string().min(1),
  }),
  EventBaseSchema.extend({
    type: z.literal("PATCH_PROPOSED"),
    patchId: z.string().min(1),
    files: z.array(z.string().min(1)),
  }),
  EventBaseSchema.extend({
    type: z.literal("PATCH_APPROVED"),
    patchId: z.string().min(1),
  }),
  EventBaseSchema.extend({
    type: z.literal("PATCH_APPLIED"),
    patchId: z.string().min(1),
    changedFiles: z.array(z.string().min(1)),
  }),
  EventBaseSchema.extend({
    type: z.literal("TEST_EXECUTED"),
    command: z.string().min(1),
    passed: z.boolean(),
    exitCode: z.number().int(),
  }),
  EventBaseSchema.extend({
    type: z.literal("CONTRIBUTION_VERIFIED"),
    missionId: z.string().min(1),
    nodeIds: z.array(z.string().min(1)),
    changedFiles: z.array(z.string().min(1)),
    testCommand: z.string().min(1),
    guidanceLevel: GuidanceLevelSchema,
  }),
  EventBaseSchema.extend({
    type: z.literal("MISSION_COMPLETED"),
    missionId: z.string().min(1),
  }),
]);

export type RepoQuestEvent = z.infer<typeof RepoQuestEventSchema>;

export function createRepoQuestEvent<T extends RepoQuestEvent["type"]>(
  event: Omit<Extract<RepoQuestEvent, { type: T }>, "id" | "occurredAt"> & {
    type: T;
    id?: string;
    occurredAt?: string;
  }
): Extract<RepoQuestEvent, { type: T }> {
  return RepoQuestEventSchema.parse({
    ...event,
    id: event.id ?? crypto.randomUUID(),
    occurredAt: event.occurredAt ?? new Date().toISOString(),
  }) as Extract<RepoQuestEvent, { type: T }>;
}
