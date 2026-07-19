"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import type {
  FixResult,
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
import { DemoControls } from "./demo-controls";
import { DocumentationArchive } from "./documentation-archive";
import { ExplorationPanel } from "./exploration-panel";
import { InvestigationActivity } from "./investigation-activity";
import { LandingScreen } from "./landing-screen";
import { MissionPanel } from "./mission-panel";
import { NodeDetailsDrawer } from "./node-details-drawer";
import { SuspectSelector } from "./suspect-selector";
import { TokenChallenge } from "./token-challenge";
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
  | "challenge"
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
  challenge: 72,
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
  challenge: "Evidence review",
  "fix-ready": "Fix prepared",
  fixing: "Deploying fix",
  complete: "System restored",
};

const EVENT_DELAY_MS = 650;

type ContributionUpdate = {
  session: ContributionSession;
  mastery: NodeMastery[];
  profile: EngineerRepositoryProfile;
  recommendation: ContributionMission | null;
  capabilities: RuntimeCapabilities;
  features: FeatureStatus;
};

/** PulseBoard request-path edges, lit progressively during investigation. */
const PATH_EDGES = ["e-login-auth", "e-auth-token", "e-token-gate"];

export function CampaignShell() {
  const [stage, setStage] = useState<UiStage>("landing");
  const [mode, setMode] = useState<"pulseboard" | "external">("pulseboard");
  const [campaign, setCampaign] = useState<RepositoryCampaign | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [startReady, setStartReady] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [bootFeed, setBootFeed] = useState<string[] | undefined>(undefined);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);
  const [deterministic, setDeterministic] = useState(false);
  const [investigation, setInvestigation] = useState<InvestigationResult | null>(null);
  const [feed, setFeed] = useState<InvestigationEvent[]>([]);
  const [scanningNodeId, setScanningNodeId] = useState<string | null>(null);
  const [litEdges, setLitEdges] = useState<string[]>([]);
  const [focusGate, setFocusGate] = useState(false);
  const [restored, setRestored] = useState(false);
  const [fixResult, setFixResult] = useState<(FixResult & { testSummary?: string }) | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);
  const [contribution, setContribution] = useState<ContributionUpdate | null>(null);
  const [contributionMission, setContributionMission] = useState<ContributionMission | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [exploredIds, setExploredIds] = useState<string[]>([]);
  const [resetting, setResetting] = useState(false);
  const [busy, setBusy] = useState(false);
  const startedAtRef = useRef<number>(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mainRef = useRef<HTMLDivElement>(null);

  const isExternal = mode === "external";
  const currentRegionId =
    isExternal && campaign
      ? (campaign.nodes.find((n) => !exploredIds.includes(n.id))?.id ?? null)
      : null;
  const externalExplorationDone = Boolean(
    isExternal && campaign && exploredIds.length === campaign.nodes.length
  );
  const externalContributionAvailable = Boolean(
    isExternal &&
      contribution &&
      contribution.session.stage !== "understanding" &&
      contribution.session.stage !== "investigating"
  );

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => setAiConfigured(Boolean(h.aiConfigured)))
      .catch(() => {});
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

  /* ------------------------------------------------ start: PulseBoard */
  const beginOnboarding = useCallback(() => {
    setMode("pulseboard");
    setBootFeed(undefined);
    setStage("scanning");
    setStartError(null);
    setStartReady(false);
    startedAtRef.current = Date.now();
    fetch("/api/campaign/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deterministic }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Scan failed.");
        return r.json();
      })
      .then((data) => {
        setCampaign(data.campaign);
        setCampaignId(data.campaignId);
        setAiUsed(Boolean(data.aiGenerated));
        setContribution(data.contribution ?? null);
        setContributionMission(data.contributionMission ?? null);
        setStartReady(true);
      })
      .catch((e) => setStartError(e.message ?? "Repository scan failed."));
  }, [deterministic]);

  /* ------------------------------------------------ start: external repo */
  const beginExternal = useCallback(
    async (repoInput: string) => {
      setMode("external");
      setStage("scanning");
      setStartError(null);
      setStartReady(false);
      setBootFeed([`Preparing ${repoInput}…`]);
      startedAtRef.current = Date.now();
      try {
        const response = await fetch("/api/campaign/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl: repoInput, deterministic }),
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
    [deterministic]
  );

  /* ------------------------------------------------ exploration */
  const markUnderstood = useCallback(
    (nodeId: string) => {
      if (!campaign) return;
      const node = campaign.nodes.find((n) => n.id === nodeId);
      setExploredIds((ids) => (ids.includes(nodeId) ? ids : [...ids, nodeId]));
      setSelectedNodeId(null);
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

  /* ------------------------------------------------ investigation (PulseBoard) */
  const playEvents = useCallback(
    (events: InvestigationEvent[], onDone: () => void) => {
      events.forEach((event, i) => {
        schedule(() => {
          setFeed((f) => [...f, event]);
          if ("nodeId" in event && event.nodeId) setScanningNodeId(event.nodeId);
          const step = Math.min(
            PATH_EDGES.length,
            Math.floor(((i + 1) / events.length) * PATH_EDGES.length)
          );
          setLitEdges(PATH_EDGES.slice(0, step));
        }, i * EVENT_DELAY_MS);
      });
      schedule(onDone, events.length * EVENT_DELAY_MS + 250);
    },
    [schedule]
  );

  const splitEvents = useCallback((inv: InvestigationResult) => {
    const idx = inv.events.findIndex(
      (e) => "path" in e && e.path.includes("require-auth") && e.type === "file_read"
    );
    const cut = idx === -1 ? inv.events.length - 2 : idx;
    return { phase1: inv.events.slice(0, cut), phase2: inv.events.slice(cut) };
  }, []);

  const beginInvestigation = useCallback(() => {
    if (!campaignId || busy) return;
    setBusy(true);
    setStage("investigating");
    setFeed([]);
    fetch("/api/campaign/investigate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, deterministic }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Investigation failed.");
        return r.json();
      })
      .then((data) => {
        const inv: InvestigationResult = data.investigation;
        setInvestigation(inv);
        if (data.contribution) setContribution(data.contribution);
        const { phase1 } = splitEvents(inv);
        playEvents(phase1, () => {
          setScanningNodeId(null);
          setStage("suspects");
          setBusy(false);
        });
      })
      .catch(() => {
        setBusy(false);
        setStage("mapped");
        setFeed([
          {
            type: "finding",
            nodeId: "access-gate",
            message: "Investigation request failed — try again.",
          },
        ]);
      });
  }, [campaignId, busy, deterministic, playEvents, splitEvents]);

  const suspectConfirmed = useCallback(() => {
    if (!investigation) return;
    const { phase2 } = splitEvents(investigation);
    setFocusGate(true);
    playEvents(
      phase2.filter((e) => e.type !== "investigation_complete"),
      () => {
        setScanningNodeId(null);
        setStage("challenge");
      }
    );
  }, [investigation, playEvents, splitEvents]);

  const challengeSolved = useCallback(() => {
    if (!investigation) return;
    const complete = investigation.events.find(
      (e) => e.type === "investigation_complete"
    );
    if (complete) setFeed((f) => [...f, complete]);
    if (contribution) {
      fetch(`/api/contributions/${contribution.session.id}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "challenge",
          challengeId: "bearer-token-extraction",
          correct: true,
          nodeIds: contribution.session.relevantNodeIds,
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setContribution(data);
        })
        .catch(() => {});
    }
    setStage("fix-ready");
  }, [investigation, contribution]);

  /* ------------------------------------------------ fix (PulseBoard) */
  const deployFix = useCallback(() => {
    if (!campaignId || busy) return;
    setBusy(true);
    setFixError(null);
    setStage("fixing");
    setFeed((f) => [
      ...f,
      { type: "phase_started", phase: "builder", label: "Builder applying correction" },
    ]);
    schedule(() => {
      setFeed((f) => [
        ...f,
        { type: "phase_started", phase: "reviewer", label: "Reviewer running authentication.test.ts" },
      ]);
    }, 900);

    fetch("/api/campaign/fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Fix failed.");
        return r.json();
      })
      .then((data: FixResult & { testSummary?: string; contribution?: ContributionUpdate }) => {
        setBusy(false);
        setFixResult(data);
        if (data.contribution) setContribution(data.contribution as ContributionUpdate);
        setFeed((f) => [
          ...f,
          {
            type: "test_run",
            command: data.testCommand,
            success: data.success,
            message: data.success
              ? `Reviewer verified the passing test — ${data.testSummary ?? "all green"}`
              : "Test suite still failing after the patch",
          },
        ]);
        if (data.success) {
          setRestored(true);
          setFocusGate(false);
          setLitEdges(PATH_EDGES.concat("e-gate-vault"));
          setDurationSeconds(
            Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
          );
          schedule(() => setStage("complete"), 2100);
        } else {
          setFixError(data.testOutput || "The test did not pass. You can retry or reset.");
          setStage("fix-ready");
        }
      })
      .catch((e) => {
        setBusy(false);
        setFixError(e.message ?? "Fix deployment failed.");
        setStage("fix-ready");
      });
  }, [campaignId, busy, schedule]);

  /* ------------------------------------------------ reset */
  const resetCampaign = useCallback(() => {
    setResetting(true);
    fetch("/api/campaign/reset", { method: "POST" })
      .catch(() => {})
      .finally(() => {
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
        setResetting(false);
        setStage("landing");
        setMode("pulseboard");
        setCampaign(null);
        setCampaignId(null);
        setInvestigation(null);
        setFeed([]);
        setBootFeed(undefined);
        setScanningNodeId(null);
        setLitEdges([]);
        setFocusGate(false);
        setRestored(false);
        setFixResult(null);
        setFixError(null);
        setContribution(null);
        setContributionMission(null);
        setSelectedNodeId(null);
        setExploredIds([]);
      });
  }, []);

  /* ------------------------------------------------ demo controls */
  const skipToMap = useCallback(() => {
    if (stage === "landing") beginOnboarding();
  }, [stage, beginOnboarding]);

  const skipToInvestigation = useCallback(() => {
    if (stage === "mapped") beginInvestigation();
    else if (stage === "landing") beginOnboarding();
  }, [stage, beginOnboarding, beginInvestigation]);

  /* ------------------------------------------------ derived view state */
  const understanding = (() => {
    if (isExternal && campaign && (stage === "exploring" || stage === "complete")) {
      return Math.round(25 + (75 * exploredIds.length) / Math.max(1, campaign.nodes.length));
    }
    return UNDERSTANDING[stage];
  })();

  /* ------------------------------------------------ render */
  if (stage === "landing") {
    return (
      <>
        <LandingScreen onBegin={beginOnboarding} onBeginExternal={beginExternal} />
        <DemoControls
          deterministic={deterministic}
          aiConfigured={aiConfigured}
          onToggleDeterministic={() => setDeterministic((d) => !d)}
          onReset={resetCampaign}
          onSkipToMap={skipToMap}
          onSkipToInvestigation={skipToInvestigation}
        />
      </>
    );
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
  if (isExternal && campaign) {
    for (const id of exploredIds) statusOverrides[id] = "healthy";
    if (currentRegionId) statusOverrides[currentRegionId] = "scanning";
  } else {
    if (scanningNodeId) statusOverrides[scanningNodeId] = "scanning";
    if (restored) statusOverrides["access-gate"] = "restored";
  }

  const overrides: MapOverrides = {
    statuses: statusOverrides,
    focusNodeIds: focusGate ? ["access-gate", "token-service"] : undefined,
    activeEdgeIds: litEdges,
  };

  const interaction = (() => {
    if (!campaign || isExternal || !investigation) return null;
    if (stage === "suspects")
      return <SuspectSelector campaign={campaign} onCorrect={suspectConfirmed} />;
    if (stage === "challenge") return <TokenChallenge onSolved={challengeSolved} />;
    if (stage === "fix-ready" || stage === "fixing")
      return (
        <div>
          <CodeEvidencePanel
            investigation={investigation}
            deploying={stage === "fixing"}
            onDeploy={contribution && contributionMission ? undefined : deployFix}
          />
          {contribution && contributionMission && (
            <div className="mt-4">
              <ContributionWorkspace
                contribution={contribution}
                mission={contributionMission}
                repositorySummary={campaign.summary}
                onUpdate={setContribution}
                onCompleted={() => {
                  setRestored(true);
                  setFocusGate(false);
                  setLitEdges(PATH_EDGES.concat("e-gate-vault"));
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
              <button onClick={resetCampaign} className="mt-2 rounded border border-line px-3 py-1.5 text-xs hover:border-primary/60">
                Reset repository
              </button>
            </div>
          )}
        </div>
      );
    return null;
  })();

  const leftPanel = campaign ? (
    isExternal ? (
      <ExplorationPanel
        campaign={campaign}
        exploredIds={exploredIds}
        currentRegionId={currentRegionId}
        onFocusRegion={setSelectedNodeId}
        onBeginContribution={beginLiveContribution}
        contributionAvailable={externalContributionAvailable}
        beginningContribution={busy}
      />
    ) : interaction ? (
      <section className="rq-panel h-full overflow-y-auto p-5" aria-label="Interaction">
        <p className="rq-kicker mb-1">Mission 01 · {campaign.mission.title}</p>
        <div className="mt-3">{interaction}</div>
      </section>
    ) : (
      <MissionPanel
        mission={campaign.mission}
        stageLabel={STAGE_LABELS[stage]}
        canInvestigate={stage === "mapped"}
        investigating={busy}
        onInvestigate={beginInvestigation}
      />
    )
  ) : null;

  const liveContributionPanel =
    isExternal && campaign && contribution && contributionMission && externalContributionAvailable ? (
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
    ? isExternal
      ? liveContributionPanel && externalExplorationDone
        ? liveContributionPanel
        : leftPanel
      : !interaction
        ? leftPanel
        : (
          <section className="rq-panel min-w-0 overflow-hidden p-5" aria-label="Current step">
            <p className="rq-kicker mb-1">Mission 01 · {campaign.mission.title}</p>
            <div className="mt-3 min-w-0">{interaction}</div>
          </section>
        )
    : null;

  return (
    <div className="rq-grid-bg flex h-screen max-w-full flex-col overflow-hidden">
      {stage === "scanning" && (
        <BootSequence
          ready={startReady}
          error={startError}
          onComplete={() => setStage(isExternal ? "briefing" : "mapped")}
          title={isExternal ? "Sub-agent crew mapping repository" : undefined}
          liveLines={bootFeed}
        />
      )}

      {campaign && (
        <div ref={mainRef} className="flex min-h-0 w-full max-w-full flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-2 pb-20 sm:p-3 sm:pb-20 lg:pb-3">
          {/* Header */}
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

          {/* Main three-column area */}
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
                    isExternal && selectedNodeId === currentRegionId
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

      {stage === "complete" && fixResult && (
        <CompletionScreen
          fixResult={fixResult}
          durationSeconds={durationSeconds}
          resetting={resetting}
          onReset={resetCampaign}
        />
      )}

      {campaignId && stage !== "scanning" && <ChatWindow campaignId={campaignId} />}

      <DemoControls
        deterministic={deterministic}
        aiConfigured={aiConfigured}
        onToggleDeterministic={() => setDeterministic((d) => !d)}
        onReset={resetCampaign}
        onSkipToMap={skipToMap}
        onSkipToInvestigation={skipToInvestigation}
      />
    </div>
  );
}
