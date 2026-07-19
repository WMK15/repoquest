import "server-only";

import { aiAvailable } from "@/lib/agent/client";
import type { RepoQuestMode } from "../domain/types";
import { getRepoQuestMemoryStore } from "../memory/file-memory-store";
import type { RepoQuestMemoryStore } from "../memory/memory-store";
import { DemoExecutionAdapter } from "./demo/demo-execution-adapter";
import { DemoRepositoryAdapter } from "./demo/demo-repository-adapter";
import { DeterministicAgentAdapter } from "./demo/deterministic-agent-adapter";
import { LiveExecutionAdapter } from "./live/live-execution-adapter";
import { LocalRepositoryAdapter } from "./live/local-repository-adapter";
import { OpenAIAgentAdapter } from "./live/openai-agent-adapter";
import {
  RuntimeCapabilitiesSchema,
  type AgentAdapter,
  type ExecutionAdapter,
  type FeatureStatus,
  type RepositoryAdapter,
  type RuntimeCapabilities,
} from "./types";

export interface RepoQuestRuntime {
  mode: RepoQuestMode;
  engineerId: string;
  repositoryId: string;
  repository: RepositoryAdapter;
  agent: AgentAdapter;
  execution: ExecutionAdapter;
  memory: RepoQuestMemoryStore;
  capabilities: RuntimeCapabilities;
  features: FeatureStatus;
}

export interface CreateRuntimeInput {
  mode: RepoQuestMode;
  engineerId: string;
  repositoryId: string;
  repositoryRoot?: string;
  repositoryName?: string;
}

function demoFeatures(): FeatureStatus {
  return {
    "repository-map": "supported",
    "markdown-archive": "supported",
    "guided-investigation": "supported",
    "implementation-plan": "supported",
    "patch-preview": "supported",
    "human-approval": "supported",
    "real-test-verification": "supported",
    "mastery-evidence": "supported",
    "persistent-memory": "supported",
    "next-contribution": "supported",
  };
}

function liveFeatures(): FeatureStatus {
  return {
    "repository-map": "supported",
    "markdown-archive": "supported",
    "guided-investigation": "degraded",
    "implementation-plan": aiAvailable() ? "supported" : "degraded",
    "patch-preview": aiAvailable() ? "supported" : "degraded",
    "human-approval": "supported",
    "real-test-verification": "supported",
    "mastery-evidence": "supported",
    "persistent-memory": "supported",
    "next-contribution": "supported",
  };
}

export function createRepoQuestRuntime(input: CreateRuntimeInput): RepoQuestRuntime {
  if (input.mode === "demo") {
    return {
      mode: "demo",
      engineerId: input.engineerId,
      repositoryId: "pulseboard",
      repository: new DemoRepositoryAdapter(),
      agent: new DeterministicAgentAdapter(),
      execution: new DemoExecutionAdapter(),
      memory: getRepoQuestMemoryStore(),
      capabilities: RuntimeCapabilitiesSchema.parse({
        canReadRepository: true,
        canWriteRepository: true,
        canRunTests: true,
        canStreamAgentActivity: true,
        canPersistMemory: true,
        canCreateBranches: false,
        canGenerateLiveRecommendations: false,
      }),
      features: demoFeatures(),
    };
  }

  if (!input.repositoryRoot || !input.repositoryName) {
    throw new Error("Live runtime creation requires a server-resolved repository workspace.");
  }

  return {
    mode: "live",
    engineerId: input.engineerId,
    repositoryId: input.repositoryId,
    repository: new LocalRepositoryAdapter(
      input.repositoryRoot,
      input.repositoryId,
      input.repositoryName
    ),
    agent: new OpenAIAgentAdapter(input.repositoryRoot, input.repositoryName),
    execution: new LiveExecutionAdapter(input.repositoryRoot),
    memory: getRepoQuestMemoryStore(),
    capabilities: RuntimeCapabilitiesSchema.parse({
      canReadRepository: true,
      canWriteRepository: true,
      canRunTests: true,
      canStreamAgentActivity: true,
      canPersistMemory: true,
      canCreateBranches: false,
      canGenerateLiveRecommendations: aiAvailable(),
    }),
    features: liveFeatures(),
  };
}
