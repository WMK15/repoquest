import type { EngineerRepositoryProfile } from "../domain/types";
import type { RebuildProfileInput, RepoQuestMemoryStore } from "./memory-store";

export async function loadEngineerProfile(
  store: RepoQuestMemoryStore,
  input: RebuildProfileInput
): Promise<EngineerRepositoryProfile> {
  return (await store.getEngineerProfile(input)) ?? store.rebuildEngineerProfile(input);
}
