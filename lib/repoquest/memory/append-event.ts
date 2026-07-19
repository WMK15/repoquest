import { RepoQuestEventSchema } from "../domain/events";
import type { EngineerRepositoryProfile, RepoQuestEvent } from "../domain/types";
import type { RebuildProfileInput, RepoQuestMemoryStore } from "./memory-store";

export async function appendEventAndRebuild(
  store: RepoQuestMemoryStore,
  event: RepoQuestEvent,
  profile: RebuildProfileInput
): Promise<EngineerRepositoryProfile> {
  await store.appendEvent(RepoQuestEventSchema.parse(event));
  return store.rebuildEngineerProfile(profile);
}
