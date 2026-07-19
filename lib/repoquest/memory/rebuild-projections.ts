import type { EngineerRepositoryProfile } from "../domain/types";
import type { RebuildProfileInput, RepoQuestMemoryStore } from "./memory-store";

export function rebuildProjections(
  store: RepoQuestMemoryStore,
  input: RebuildProfileInput
): Promise<EngineerRepositoryProfile> {
  return store.rebuildEngineerProfile(input);
}
