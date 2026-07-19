import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { RepoQuestEventSchema } from "../domain/events";
import { buildEngineerProfile } from "../domain/engineer-profile";
import {
  ContributionSessionSchema,
  EngineerRepositoryProfileSchema,
} from "../domain/schemas";
import type {
  ContributionSession,
  EngineerRepositoryProfile,
  RepoQuestEvent,
} from "../domain/types";
import type {
  ProfileScope,
  RebuildProfileInput,
  RepoQuestMemoryStore,
} from "./memory-store";

const EventsFileSchema = z.array(RepoQuestEventSchema);
const SessionsFileSchema = z.array(ContributionSessionSchema);
const ProfilesFileSchema = z.array(EngineerRepositoryProfileSchema);

type MemoryFile = "events.json" | "sessions.json" | "profiles.json";

export class FileRepoQuestMemoryStore implements RepoQuestMemoryStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly root = path.resolve(process.cwd(), ".repoquest")) {}

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.writeQueue;
    let release: () => void = () => {};
    this.writeQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async ensureRoot() {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
  }

  private async atomicWrite(file: MemoryFile, value: unknown) {
    await this.ensureRoot();
    const destination = path.join(this.root, file);
    const temporary = path.join(this.root, `.${file}.${crypto.randomUUID()}.tmp`);
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(temporary, destination);
  }

  private async readValidated<T>(
    file: MemoryFile,
    schema: z.ZodType<T>,
    fallback: T
  ): Promise<T> {
    await this.ensureRoot();
    const source = path.join(this.root, file);
    try {
      return schema.parse(JSON.parse(await fs.readFile(source, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
      const quarantined = path.join(this.root, `${file}.corrupt-${Date.now()}`);
      await fs.rename(source, quarantined).catch(() => {});
      console.warn(`RepoQuest memory recovered a corrupt ${file}; previous data moved to ${quarantined}`);
      await this.atomicWrite(file, fallback);
      return fallback;
    }
  }

  async appendEvent(event: RepoQuestEvent): Promise<void> {
    const validated = RepoQuestEventSchema.parse(event);
    await this.exclusive(async () => {
      const events = await this.readValidated("events.json", EventsFileSchema, []);
      if (events.some((existing) => existing.id === validated.id)) return;
      await this.atomicWrite("events.json", [...events, validated]);
    });
  }

  async getEvents(input: ProfileScope): Promise<RepoQuestEvent[]> {
    const [events, sessions] = await Promise.all([
      this.readValidated("events.json", EventsFileSchema, []),
      this.readValidated("sessions.json", SessionsFileSchema, []),
    ]);
    const sessionIds = new Set(
      sessions
        .filter(
          (session) =>
            session.engineerId === input.engineerId &&
            session.repositoryId === input.repositoryId
        )
        .map((session) => session.id)
    );
    return events.filter((event) => sessionIds.has(event.sessionId));
  }

  async getSession(sessionId: string): Promise<ContributionSession | null> {
    const sessions = await this.readValidated("sessions.json", SessionsFileSchema, []);
    return sessions.find((session) => session.id === sessionId) ?? null;
  }

  async getSessions(input: ProfileScope): Promise<ContributionSession[]> {
    const sessions = await this.readValidated("sessions.json", SessionsFileSchema, []);
    return sessions.filter(
      (session) =>
        session.engineerId === input.engineerId &&
        session.repositoryId === input.repositoryId
    );
  }

  async saveSession(session: ContributionSession): Promise<void> {
    const validated = ContributionSessionSchema.parse(session);
    await this.exclusive(async () => {
      const sessions = await this.readValidated("sessions.json", SessionsFileSchema, []);
      const next = sessions.filter((existing) => existing.id !== validated.id);
      next.push(validated);
      await this.atomicWrite("sessions.json", next);
    });
  }

  async getEngineerProfile(input: ProfileScope): Promise<EngineerRepositoryProfile | null> {
    const profiles = await this.readValidated("profiles.json", ProfilesFileSchema, []);
    return (
      profiles.find(
        (profile) =>
          profile.engineerId === input.engineerId &&
          profile.repositoryId === input.repositoryId
      ) ?? null
    );
  }

  async saveEngineerProfile(profile: EngineerRepositoryProfile): Promise<void> {
    const validated = EngineerRepositoryProfileSchema.parse(profile);
    await this.exclusive(async () => {
      const profiles = await this.readValidated("profiles.json", ProfilesFileSchema, []);
      const next = profiles.filter(
        (existing) =>
          existing.engineerId !== validated.engineerId ||
          existing.repositoryId !== validated.repositoryId
      );
      next.push(validated);
      await this.atomicWrite("profiles.json", next);
    });
  }

  async rebuildEngineerProfile(
    input: RebuildProfileInput
  ): Promise<EngineerRepositoryProfile> {
    const [existing, sessions, events] = await Promise.all([
      this.getEngineerProfile(input),
      this.getSessions(input),
      this.getEvents(input),
    ]);
    const latestSession = sessions.at(-1);
    const profile = buildEngineerProfile({
      ...input,
      repositoryName: input.repositoryName ?? existing?.repositoryName ?? input.repositoryId,
      repositoryCommitSha:
        input.repositoryCommitSha ??
        latestSession?.repositoryCommitSha ??
        existing?.repositoryCommitSha ??
        "unknown",
      events,
      sessions,
      knownNodeIds:
        input.knownNodeIds ??
        existing?.nodeMastery.map((node) => node.nodeId) ??
        latestSession?.relevantNodeIds,
    });
    await this.saveEngineerProfile(profile);
    return profile;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.exclusive(async () => {
      const [sessions, events] = await Promise.all([
        this.readValidated("sessions.json", SessionsFileSchema, []),
        this.readValidated("events.json", EventsFileSchema, []),
      ]);
      await Promise.all([
        this.atomicWrite(
          "sessions.json",
          sessions.filter((session) => session.id !== sessionId)
        ),
        this.atomicWrite(
          "events.json",
          events.filter((event) => event.sessionId !== sessionId)
        ),
      ]);
    });
  }

  async resetEngineerProgress(input: ProfileScope): Promise<void> {
    await this.exclusive(async () => {
      const [sessions, events, profiles] = await Promise.all([
        this.readValidated("sessions.json", SessionsFileSchema, []),
        this.readValidated("events.json", EventsFileSchema, []),
        this.readValidated("profiles.json", ProfilesFileSchema, []),
      ]);
      const removedSessionIds = new Set(
        sessions
          .filter(
            (session) =>
              session.engineerId === input.engineerId &&
              session.repositoryId === input.repositoryId
          )
          .map((session) => session.id)
      );
      await Promise.all([
        this.atomicWrite(
          "sessions.json",
          sessions.filter((session) => !removedSessionIds.has(session.id))
        ),
        this.atomicWrite(
          "events.json",
          events.filter((event) => !removedSessionIds.has(event.sessionId))
        ),
        this.atomicWrite(
          "profiles.json",
          profiles.filter(
            (profile) =>
              profile.engineerId !== input.engineerId ||
              profile.repositoryId !== input.repositoryId
          )
        ),
      ]);
    });
  }
}

const globalMemory = globalThis as typeof globalThis & {
  __repoQuestMemoryStore?: FileRepoQuestMemoryStore;
};

export function getRepoQuestMemoryStore(): FileRepoQuestMemoryStore {
  globalMemory.__repoQuestMemoryStore ??= new FileRepoQuestMemoryStore();
  return globalMemory.__repoQuestMemoryStore;
}
