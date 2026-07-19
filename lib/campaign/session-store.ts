import type { CampaignSession } from "./types";

/**
 * Single-user in-memory session store. Attached to globalThis so it
 * survives Next.js dev-server module reloads.
 */
const globalStore = globalThis as unknown as {
  __repoquestSessions?: Map<string, CampaignSession>;
};

function store(): Map<string, CampaignSession> {
  globalStore.__repoquestSessions ??= new Map();
  return globalStore.__repoquestSessions;
}

export function saveSession(session: CampaignSession): void {
  store().set(session.id, session);
}

export function getSession(id: string): CampaignSession | undefined {
  return store().get(id);
}

export function clearSessions(): void {
  store().clear();
}
