"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import type {
  InvestigationEvent,
  NodeStatus,
  RepositoryCampaign,
} from "@/lib/campaign/types";
import { ArchitectureMap, type MapOverrides } from "./architecture-map";
import { BootSequence } from "./boot-sequence";
import { BriefingScreen } from "./briefing-screen";
import { CandidatePicker } from "./candidate-picker";
import { ChatWindow } from "./chat-window";
import { CompletionScreen } from "./completion-screen";
import { ContributionWorkspace } from "./contribution-workspace";
import { DocumentationArchive } from "./documentation-archive";
import { ExplorationPanel } from "./exploration-panel";
import { InvestigationActivity } from "./investigation-activity";
import { LandingScreen } from "./landing-screen";
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
  | "complete";

const UNDERSTANDING: Record<UiStage, number> = {
  landing: 0,
  scanning: 12,
  briefing: 25,
  exploring: 25,
  complete: 100,
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
  const [feed, setFeed] = useState<InvestigationEvent[]>([]);
  const [contribution, setContribution] = useState<ContributionUpdate | null>(null);
  const [contributionMission, setContributionMission] = useState<ContributionMission | null>(null);
  const [contributionError, setContributionError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [exploredIds, setExploredIds] = useState<string[]>([]);
  const [readDocumentPaths, setReadDocumentPaths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const startedAtRef = useRef<number>(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const mainRef = useRef<HTMLDivElement>(null);

  const currentRegionId =
    campaign
      ? (campaign.nodes.find((n) => !exploredIds.includes(n.id))?.id ?? null)
      : null;
  const externalExplorationDone = Boolean(
    campaign && exploredIds.length === campaign.nodes.length
  );
  useEffect(() => {
    if (stage === "exploring" && mainRef.current) {
      gsap.fromTo(
        mainRef.current,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }
      );
    }
  }, [stage]);

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
              message: `${node.gameLabel} explored — +15 XP`,
            },
          ]);
        }
      }
    },
    [campaign]
  );

  const selectContribution = useCallback((candidateId?: string) => {
    if (!campaignId || busy) return;
    setBusy(true);
    setContributionError(null);
    fetch("/api/contributions/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, candidateId }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Could not start contribution.");
        return data;
      })
      .then((data) => {
        setContribution(data.contribution);
        setContributionMission(data.mission);
      })
      .catch((error) => {
        setContributionError(
          error instanceof Error ? error.message : "Could not start contribution."
        );
      })
      .finally(() => setBusy(false));
  }, [busy, campaignId]);

  const resetCampaign = useCallback(() => {
    if (resetting) return;
    setResetting(true);
    fetch("/api/campaign/reset", { method: "POST" })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error ?? "Reset failed.");
        return response.json();
      })
      .then(() => {
        setStage("landing");
        setCampaign(null);
        setCampaignId(null);
        setStartReady(false);
        setStartError(null);
        setBootFeed(undefined);
        setAiUsed(false);
        setFeed([]);
        setContribution(null);
        setContributionMission(null);
        setContributionError(null);
        setSelectedNodeId(null);
        setExploredIds([]);
        setReadDocumentPaths([]);
        setDurationSeconds(0);
      })
      .catch((error) => {
        setContributionError(error instanceof Error ? error.message : "Reset failed.");
      })
      .finally(() => setResetting(false));
  }, [resetting]);

  const updateContribution = useCallback((update: ContributionUpdate) => {
    setContribution(update);
    const sessionId = update.session.id;
    const verified = update.profile.verifiedContributions.some(
      (item) => item.sessionId === sessionId
    );
    const masteryRecorded = update.profile.completedMissions.some(
      (item) => item.sessionId === sessionId
    );
    if (update.session.verification?.passed && verified && masteryRecorded) {
      setDurationSeconds(
        Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
      );
      setStage("complete");
    }
  }, []);

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

  const leftPanel = campaign ? (
    <ExplorationPanel
      campaign={campaign}
      exploredIds={exploredIds}
      currentRegionId={currentRegionId}
      onFocusRegion={setSelectedNodeId}
    />
  ) : null;

  const liveContributionPanel =
    campaign && contribution && contributionMission ? (
      <ContributionWorkspace
        contribution={contribution}
        mission={contributionMission}
        repositorySummary={campaign.summary}
        onUpdate={updateContribution}
        onCompleted={() => {}}
      />
    ) : null;

  const candidatePanel =
    campaign && externalExplorationDone && !contribution ? (
      <CandidatePicker
        campaign={campaign}
        busy={busy}
        error={contributionError}
        onSelect={selectContribution}
      />
    ) : null;

  const actionPanel = liveContributionPanel ?? candidatePanel;

  const mobilePanel = campaign
    ? actionPanel && externalExplorationDone
      ? actionPanel
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
                  Detector-backed map
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-5">
              <UnderstandingMeter value={understanding} />
              <p className="hidden font-mono text-xs text-muted md:block">
                DOCS {readDocumentPaths.length}/{campaign.knowledgeArchive.length}
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
              {actionPanel ?? (
                <InvestigationActivity
                  events={feed}
                  idle={stage === "exploring"}
                />
              )}
            </div>
          </div>

          <div className="shrink-0">
            <DocumentationArchive
              docs={campaign.knowledgeArchive}
              campaignId={campaignId}
              onOpenDocument={(path) =>
                setReadDocumentPaths((paths) =>
                  paths.includes(path) ? paths : [...paths, path]
                )
              }
            />
          </div>
        </div>
      )}

      {stage === "complete" && campaign && contribution && contributionMission && (
        <CompletionScreen
          repositoryName={campaign.repositoryName}
          mission={contributionMission}
          contribution={contribution}
          exploredCount={exploredIds.length}
          documentsRead={readDocumentPaths.length}
          durationSeconds={durationSeconds}
          resetting={resetting}
          onReset={resetCampaign}
        />
      )}

      {campaignId && stage !== "scanning" && stage !== "complete" && (
        <ChatWindow campaignId={campaignId} />
      )}
    </div>
  );
}
