import type {
  ContributionSession,
  EngineerRepositoryProfile,
  RepoQuestEvent,
} from "../domain/types";

export interface ProfileScope {
  engineerId: string;
  repositoryId: string;
}

export interface RebuildProfileInput extends ProfileScope {
  repositoryName?: string;
  repositoryCommitSha?: string;
  knownNodeIds?: string[];
}

export interface RepoQuestMemoryStore {
  appendEvent(event: RepoQuestEvent): Promise<void>;
  getEvents(input: ProfileScope): Promise<RepoQuestEvent[]>;
  getSession(sessionId: string): Promise<ContributionSession | null>;
  getSessions(input: ProfileScope): Promise<ContributionSession[]>;
  saveSession(session: ContributionSession): Promise<void>;
  getEngineerProfile(input: ProfileScope): Promise<EngineerRepositoryProfile | null>;
  saveEngineerProfile(profile: EngineerRepositoryProfile): Promise<void>;
  rebuildEngineerProfile(input: RebuildProfileInput): Promise<EngineerRepositoryProfile>;
  deleteSession(sessionId: string): Promise<void>;
  resetEngineerProgress(input: ProfileScope): Promise<void>;
}
