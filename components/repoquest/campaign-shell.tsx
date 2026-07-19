"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import type {
  InvestigationEvent,
  InvestigationResult,
  NodeStatus,
  RepositoryCampaign,
} from "@/lib/campaign/types";
import { ArchitectureMap, type MapOverrides } from "./architecture-map";
import { BootSequence } from "./boot-sequence";
import { BriefingScreen } from "./briefing-screen";
import { ChatWindow } from "./chat-window";
import { CodeEvidencePanel } from "./code-evidence-panel";
import { CompletionScreen } from "./completion-screen";
import { ContributionWorkspace } from "./contribution-workspace";
import { DocumentationArchive } from "./documentation-archive";
import { ExplorationPanel } from "./exploration-panel";
import { InvestigationActivity } from "./investigation-activity";
import { LandingScreen } from "./landing-screen";
import { MissionPanel } from "./mission-panel";
import { NodeDetailsDrawer } from "./node-details-drawer";
import { UnderstandingMeter } from "./understanding-meter";
import type { FeatureStatus, RuntimeCapabilities } from "@/lib/repoquest/adapters/types";
import type {
  ContributionMission,
  ContributionSession,
  EngineerRepositoryProfile,
  NodeMastery,
} from "@/lib/repoquest/domain/types";

type UiStage =
  | "landing"
  | "scanning"
  | "briefing"
  | "exploring"
  | "mapped"
  | "investigating"
  | "suspects"
  | "fix-ready"
  | "fixing"
  | "complete";

const UNDERSTANDING: Record<UiStage, number> = {
  landing: 0,
  scanning: 12,
  briefing: 25,
  exploring: 25,
  mapped: 42,
  investigating: 58,
  suspects: 58,
  "fix-ready": 88,
  fixing: 88,
  complete: 100,
};

const STAGE_LABELS: Record<UiStage, string> = {
  landing: "Landing",
  scanning: "Repository scan",
  briefing: "Mission briefing",
  exploring: "Exploring the territory",
  mapped: "Architecture mapped",
  investigating: "Investigation running",
  suspects: "Identify the fault",
  "fix-ready": "Fix prepared",
  fixing: "Deploying fix",
  complete: "System restored",
};

type ContributionUpdate = {
  session: ContributionSession;
  mastery: NodeMastery[];
  profile: EngineerRepositoryProfile;
  recommendation: ContributionMission | null;
  capabilities: RuntimeCapabilities;
  features: FeatureStatus;
};

export function CampaignShell() {
  const [stage, setStage] = useState<UiStage>("landing");
  const [campaign, setCampaign] = useState<RepositoryCampaign | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [startReady, setStartReady] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [bootFeed, setBootFeed] = useState<string[] | undefined>(undefined);
  const [aiUsed, setAiUsed] = useState(false);
  const [investigation, setInvestigation] = useState<InvestigationResult | null>(null);
  const [feed, setFeed] = useState<InvestigationEvent[]>([]);
  const [scanningNodeId, setScanningNodeId] = useState<string | null>(null);
  const [fixResult, setFixResult] = useState<unknown>(null);
  const [fixError, setFixError] = useState<string | null>(null);
  const [contribution, setContribution] = useState<ContributionUpdate | null>(null);
  const [contributionMission, setContributionMission] = useState<ContributionMission | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [exploredIds, setExploredIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const startedAtRef = useRef<number>(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mainRef = useRef<HTMLDivElement>(null);

  const currentRegionId =
    campaign
      ? (campaign.nodes.find((n) => !exploredIds.includes(n.id))?.id ?? null)
      : null;
  const externalExplorationDone = Boolean(
    campaign && exploredIds.length === campaign.nodes.length
  );
  const externalContributionAvailable = Boolean(
    contribution &&
      contribution.session.stage !== "understanding" &&
      contribution.session.stage !== "investigating"
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if ((stage === "mapped" || stage === "exploring") && mainRef.current) {
      gsap.fromTo(
        mainRef.current,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }
      );
    }
  }, [stage]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);

  const beginExternal = useCallback(
    async (repoInput: string) => {
      setStage("scanning");
      setStartError(null);
      setStartReady(false);
      setBootFeed([`Preparing ${repoInput}…`]);
      startedAtRef.current = Date.now();
      try {
        const response = await fetch("/api/campaign/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl: repoInput }),
        });
        if (!response.ok || !response.body) {
          throw new Error("Repository mapping failed.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const msg = JSON.parse(line);
            if (msg.type === "event") {
              setBootFeed((f) => [...(f ?? []), msg.message]);
            } else if (msg.type === "complete") {
              setCampaign(msg.campaign);
              setCampaignId(msg.campaignId);
              setAiUsed(Boolean(msg.aiGenerated));
              setContribution(msg.contribution ?? null);
              setContributionMission(msg.contributionMission ?? null);
              setStartReady(true);
            } else if (msg.type === "error") {
              throw new Error(msg.error);
            }
          }
        }
      } catch (e) {
        setStartError(e instanceof Error ? e.message : "Repository mapping failed.");
      }
    },
    []
  );

  const markUnderstood = useCallback(
    (nodeId: string) => {
      if (!campaign) return;
      setExploredIds((ids) => (ids.includes(nodeId) ? ids : [...ids, nodeId]));
      setSelectedNodeId(null);
      if (campaign) {
        const node = campaign.nodes.find((n) => n.id === nodeId);
        if (node) {
          setFeed((f) => [
            ...f,
            {
              type: "finding",
              nodeId,
              message: `${node.gameLabel} understood — +15 XP`,
            },
          ]);
        }
      }
      if (contribution) {
        fetch(`/api/contributions/${contribution.session.id}/explore`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodeId }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data) setContribution(data);
          })
          .catch(() => {});
      }
    },
    [campaign, contribution]
  );

  const beginLiveContribution = useCallback(() => {
    if (!contribution || busy) return;
    setBusy(true);
    fetch(`/api/contributions/${contribution.session.id}/begin-implementation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Could not start contribution.");
        return r.json();
      })
      .then((data) => {
        setContribution(data);
      })
      .catch((error) => {
        setFeed((f) => [
          ...f,
          {
            type: "finding",
            nodeId: contribution.session.relevantNodeIds[0] ?? "repository",
            message: error instanceof Error ? error.message : "Could not start contribution.",
          },
        ]);
      })
      .finally(() => setBusy(false));
  }, [busy, contribution]);

  const understanding = (() => {
    if (campaign && (stage === "exploring" || stage === "complete")) {
      return Math.round(25 + (75 * exploredIds.length) / Math.max(1, campaign.nodes.length));
    }
    return UNDERSTANDING[stage];
  })();

  if (stage === "landing") {
    return <LandingScreen onBegin={beginExternal} />;
  }

  if (stage === "briefing" && campaign) {
    return (
      <BriefingScreen
        campaign={campaign}
        aiGenerated={aiUsed}
        onBegin={() => setStage("exploring")}
      />
    );
  }

  const statusOverrides: Partial<Record<string, NodeStatus>> = {};
  if (campaign) {
    for (const id of exploredIds) statusOverrides[id] = "healthy";
    if (currentRegionId) statusOverrides[currentRegionId] = "scanning";
  }

  const overrides: MapOverrides = {
    statuses: statusOverrides,
  };

  const interaction = (() => {
    if (!campaign) return null;
    if (stage === "fix-ready" || stage === "fixing") {
      return (
        <div>
          {investigation && (
            <CodeEvidencePanel
              investigation={investigation}
              deploying={stage === "fixing"}
            />
          )}
          {contribution && contributionMission && (
            <div className="mt-4">
              <ContributionWorkspace
                contribution={contribution}
                mission={contributionMission}
                repositorySummary={campaign.summary}
                onUpdate={setContribution}
                onCompleted={() => {
                  setDurationSeconds(
                    Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
                  );
                  schedule(() => setStage("complete"), 1400);
                }}
              />
            </div>
          )}
          {fixError && (
            <div className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-3" role="alert">
              <p className="rq-kicker !text-danger">Fix did not verify</p>
              <pre className="mt-1 max-h-32 overflow-auto font-mono text-[0.65rem] text-muted">{fixError}</pre>
            </div>
          )}
        </div>
      );
    }
    return null;
  })();

  const leftPanel = campaign ? (
    <ExplorationPanel
      campaign={campaign}
      exploredIds={exploredIds}
      currentRegionId={currentRegionId}
      onFocusRegion={setSelectedNodeId}
      onBeginContribution={beginLiveContribution}
      contributionAvailable={externalContributionAvailable}
      beginningContribution={busy}
    />
  ) : null;

  const liveContributionPanel =
    campaign && contribution && contributionMission && externalContributionAvailable ? (
      <ContributionWorkspace
        contribution={contribution}
        mission={contributionMission}
        repositorySummary={campaign.summary}
        onUpdate={setContribution}
        onCompleted={() => {
          setDurationSeconds(
            Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
          );
          setStage("complete");
        }}
      />
    ) : null;

  const mobilePanel = campaign
    ? liveContributionPanel && externalExplorationDone
      ? liveContributionPanel
      : leftPanel
    : null;

  return (
    <div className="rq-grid-bg flex h-screen max-w-full flex-col overflow-hidden">
      {stage === "scanning" && (
        <BootSequence
          ready={startReady}
          error={startError}
          onComplete={() => setStage("briefing")}
          title="Sub-agent crew mapping repository"
          liveLines={bootFeed}
        />
      )}

      {campaign && (
        <div ref={mainRef} className="flex min-h-0 w-full max-w-full flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-2 pb-20 sm:p-3 sm:pb-20 lg:pb-3">
          <header className="rq-panel flex min-w-0 shrink-0 items-center justify-between gap-4 px-5 py-3">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="font-mono text-sm font-bold tracking-[0.25em] text-foreground">
                REPOQUEST
              </p>
              <p className="font-mono text-xs uppercase text-primary">
                {campaign.repositoryName}
              </p>
              {aiUsed ? (
                <p className="hidden font-mono text-[0.6rem] uppercase tracking-widest text-success sm:block">
                  Codex analysis
                </p>
              ) : (
                <p className="hidden font-mono text-[0.6rem] uppercase tracking-widest text-muted sm:block">
                  Verified campaign
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-5">
              <UnderstandingMeter value={understanding} />
              <p className="hidden font-mono text-xs text-muted md:block">
                DOCS {campaign.knowledgeArchive.length}/{campaign.knowledgeArchive.length}
              </p>
            </div>
          </header>

          {mobilePanel && <div className="w-full min-w-0 max-w-full shrink-0 lg:hidden">{mobilePanel}</div>}

          <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[19rem_1fr_19rem]">
            <div className="hidden min-h-0 lg:block">{leftPanel}</div>

            <div className="rq-panel relative min-h-[24rem] min-w-0 overflow-hidden lg:min-h-0">
              <p className="rq-kicker absolute left-4 top-3 z-10">System Atlas</p>
              <ArchitectureMap
                campaign={campaign}
                overrides={overrides}
                onNodeSelect={setSelectedNodeId}
              />
              {selectedNodeId && (
                <NodeDetailsDrawer
                  campaign={campaign}
                  nodeId={selectedNodeId}
                  statusOverride={statusOverrides[selectedNodeId]}
                  onClose={() => setSelectedNodeId(null)}
                  onMarkUnderstood={
                    selectedNodeId === currentRegionId
                      ? () => markUnderstood(selectedNodeId)
                      : undefined
                  }
                />
              )}
            </div>

            <div className="hidden min-h-0 lg:block">
              {liveContributionPanel ?? (
                <InvestigationActivity
                  events={feed}
                  idle={stage === "mapped" || stage === "exploring"}
                />
              )}
            </div>
          </div>

          <div className="shrink-0">
            <DocumentationArchive docs={campaign.knowledgeArchive} campaignId={campaignId} />
          </div>
        </div>
      )}

      {stage === "complete" && (
        <CompletionScreen
          fixResult={fixResult}
          durationSeconds={durationSeconds}
          resetting={false}
          onReset={() => {}} // todo
        />
      )}

      {campaignId && stage !== "scanning" && <ChatWindow campaignId={campaignId} />}
    </div>
  );
}
