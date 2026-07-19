"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  FileDiff,
  Play,
  Sparkles,
} from "lucide-react";
import type { FeatureStatus, RuntimeCapabilities } from "@/lib/repoquest/adapters/types";
import type {
  ContributionMission,
  ContributionSession,
  EngineerRepositoryProfile,
  NodeMastery,
} from "@/lib/repoquest/domain/types";

type ContributionUpdate = {
  session: ContributionSession;
  mastery: NodeMastery[];
  profile: EngineerRepositoryProfile;
  recommendation: ContributionMission | null;
  capabilities: RuntimeCapabilities;
  features: FeatureStatus;
};

const EVIDENCE_LABELS = {
  navigation: "Explored the relevant region",
  documentation: "Read linked documentation",
  flow_tracing: "Traced the repository flow",
  debugging: "Completed debugging evidence",
  implementation: "Applied a bounded code change",
  verification: "Passed execution verification",
} as const;

const STEP_LABELS: { stage: ContributionSession["stage"]; label: string }[] = [
  { stage: "planning", label: "Plan" },
  { stage: "awaiting_plan_approval", label: "Approve plan" },
  { stage: "implementing", label: "Preview patch" },
  { stage: "awaiting_patch_approval", label: "Apply patch" },
  { stage: "verifying", label: "Verify" },
  { stage: "completed", label: "Record mastery" },
];

function stepState(current: ContributionSession["stage"], step: ContributionSession["stage"]) {
  const currentIndex = STEP_LABELS.findIndex((item) => item.stage === current);
  const stepIndex = STEP_LABELS.findIndex((item) => item.stage === step);
  if (current === "failed") return step === "verifying" ? "current" : stepIndex < STEP_LABELS.length - 1 ? "done" : "todo";
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "current";
  return "todo";
}

export function ContributionWorkspace({
  contribution,
  mission,
  repositorySummary,
  onUpdate,
  onCompleted,
}: {
  contribution: ContributionUpdate;
  mission: ContributionMission;
  repositorySummary: string;
  onUpdate: (update: ContributionUpdate) => void;
  onCompleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [patchOpen, setPatchOpen] = useState(false);
  const { session } = contribution;

  async function request(action: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/contributions/${session.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Contribution action failed.");
      onUpdate(data);
      if (action === "complete") onCompleted();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Contribution action failed.");
    } finally {
      setBusy(false);
    }
  }

  const currentMastery = contribution.mastery.filter((node) =>
    session.relevantNodeIds.includes(node.nodeId)
  );
  const evidence = currentMastery.flatMap((node) =>
    Object.entries(node.dimensions)
      .filter(([, level]) => level > 0)
      .map(([dimension]) => EVIDENCE_LABELS[dimension as keyof typeof EVIDENCE_LABELS])
  );
  const uniqueEvidence = [...new Set(evidence)];
  const hasActionBeforePlan = session.stage === "implementing" && !session.proposedPatch;
  const masteryRecorded = contribution.profile.completedMissions.some(
    (completed) => completed.sessionId === session.id
  );
  const uniqueVerificationEvidence = [
    ...new Set(session.verification?.criteria.map((criterion) => criterion.evidence) ?? []),
  ];
  const implementationPlanDialog =
    planOpen && session.implementationPlan && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-slate-950/55 p-2 backdrop-blur-sm sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Implementation plan"
            onClick={() => setPlanOpen(false)}
          >
            <div
              className="rq-panel flex max-h-[min(42rem,calc(100dvh-1rem))] w-[min(44rem,calc(100vw-1rem))] max-w-full flex-col overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="shrink-0 border-b border-line bg-surface-strong/90 px-4 py-3 backdrop-blur sm:px-5 sm:py-4">
                <p className="rq-kicker">Implementation plan</p>
                <h3 className="mt-1 break-words text-base font-semibold text-foreground sm:text-lg">
                  {mission.title}
                </h3>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5">
                <p className="break-words text-sm leading-6 text-muted sm:text-base sm:leading-7">
                  {session.implementationPlan.summary}
                </p>
                <ol className="mt-4 space-y-3">
                  {session.implementationPlan.steps.map((step) => (
                    <li key={step.id} className="min-w-0 rounded-lg border border-line/70 bg-surface-strong px-3 py-3 text-sm">
                      <p className="break-words font-semibold text-foreground">{step.description}</p>
                      <p className="mt-1 break-words leading-6 text-muted">{step.reason}</p>
                      {step.files.length > 0 && (
                        <p className="mt-2 break-all font-mono text-[0.7rem] leading-5 text-primary">
                          {step.files.join(" · ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>

                {session.implementationPlan.expectedTests.length > 0 && (
                  <div className="mt-4 min-w-0 rounded-lg border border-line bg-primary-soft px-3 py-3">
                    <p className="rq-kicker !text-primary">Expected verification</p>
                    <p className="mt-2 break-words font-mono text-xs leading-5 text-muted">
                      {session.implementationPlan.expectedTests.join(" · ")}
                    </p>
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-2 border-t border-line bg-surface-strong/95 p-3 backdrop-blur sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPlanOpen(false)}
                  className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-muted transition hover:border-primary/50 hover:text-foreground"
                >
                  Do later
                </button>
                {session.stage === "awaiting_plan_approval" && (
                  <button
                    type="button"
                    onClick={() => {
                      setPlanOpen(false);
                      void request("approve-plan");
                    }}
                    disabled={busy}
                    className="rq-cta flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Approve plan <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;
  const proposedPatchDialog =
    patchOpen && session.proposedPatch && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-slate-950/55 p-2 backdrop-blur-sm sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Proposed patch"
            onClick={() => setPatchOpen(false)}
          >
            <div
              className="rq-panel flex max-h-[min(42rem,calc(100dvh-1rem))] w-[min(48rem,calc(100vw-1rem))] max-w-full flex-col overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="shrink-0 border-b border-line bg-surface-strong/90 px-4 py-3 backdrop-blur sm:px-5 sm:py-4">
                <p className="rq-kicker">Proposed patch</p>
                <h3 className="mt-1 break-words text-base font-semibold text-foreground sm:text-lg">
                  Review the bounded patch before applying it
                </h3>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5">
                {session.proposedPatch.files.map((file) => (
                  <div key={file.path} className="min-w-0 rounded-lg border border-line bg-surface-strong p-3">
                    <p className="break-all font-mono text-xs leading-5 text-primary">{file.path}</p>
                    <p className="mt-2 min-w-0 break-words text-sm leading-6 text-muted">
                      {file.explanation}
                    </p>
                    <pre className="rq-code mt-3 max-w-full overflow-x-hidden whitespace-pre-wrap break-words p-3 text-xs leading-5">
                      <code>{file.unifiedDiff}</code>
                    </pre>
                  </div>
                ))}

                {!contribution.capabilities.canWriteRepository && (
                  <CapabilityNotice message="This repository is read-only: review the proposal here, then apply it in your normal development environment." />
                )}
              </div>

              <div className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-2 border-t border-line bg-surface-strong/95 p-3 backdrop-blur sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPatchOpen(false)}
                  className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-muted transition hover:border-muted/50 hover:text-foreground"
                >
                  Do later
                </button>
                {session.stage === "awaiting_patch_approval" && (
                  <button
                    type="button"
                    onClick={() => {
                      setPatchOpen(false);
                      void request("apply");
                    }}
                    disabled={busy || !contribution.capabilities.canWriteRepository}
                    className="rq-cta rq-glow-success flex items-center justify-center gap-2 rounded-md bg-success px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Apply patch <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <section className="rq-panel w-full min-w-0 max-w-full overflow-hidden" aria-label="Contribution workspace">
      <div className="border-b border-line bg-surface-strong/70 px-3 py-3 sm:px-4">
        <p className="rq-kicker">Contribution workspace</p>
        <h3 className="mt-1 min-w-0 break-words text-base font-semibold">{mission.title}</h3>
        <p className="mt-1 min-w-0 break-words text-sm leading-6 text-muted">{mission.objective}</p>
      </div>

      <div className="space-y-4 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 min-[520px]:grid-cols-3">
          {STEP_LABELS.map((step, index) => {
            const state = stepState(session.stage, step.stage);
            const label = step.stage === "completed" && masteryRecorded ? "Mastery recorded" : step.label;
            return (
              <div
                key={step.stage}
                className={`min-w-0 rounded-md border px-2.5 py-2 text-xs ${
                  state === "current"
                    ? "border-primary/50 bg-primary-soft text-primary"
                    : state === "done"
                      ? "border-success/35 bg-success/10 text-success"
                      : "border-line bg-surface-strong text-muted"
                }`}
              >
                <p className="font-mono text-[0.58rem] uppercase tracking-wider">Step {index + 1}</p>
                <p className="mt-0.5 break-words font-medium leading-5">{label}</p>
              </div>
            );
          })}
        </div>

        {session.stage === "planning" && (
          <ActionCard
            icon={<ClipboardCheck className="h-4 w-4" />}
            title="Prepare implementation plan"
            description="Generate a bounded plan from the traced flow, relevant source, documentation, and engineer memory."
            action="Generate plan"
            busy={busy}
            onAction={() => request("plan", { mission, repositorySummary })}
          />
        )}

        {hasActionBeforePlan && (
          <ActionCard
            icon={<FileDiff className="h-4 w-4" />}
            title="Preview bounded patch"
            description="Generate a patch proposal only for the approved mission files. It is not applied yet."
            action="Generate patch preview"
            busy={busy}
            disabled={contribution.features["patch-preview"] === "degraded"}
            unavailableMessage="Patch previews need the configured live agent for this repository."
            onAction={() => request("propose-patch", { mission, repositorySummary })}
          />
        )}

        {session.implementationPlan && !session.proposedPatch && session.stage !== "verifying" && (
          <button
            type="button"
            onClick={() => setPlanOpen(true)}
            className="rq-cta flex w-full items-center justify-center rounded-md border border-line bg-surface-strong px-3 py-2 text-sm font-semibold text-muted transition hover:border-muted/50 hover:text-foreground"
          >
            View Implementation Plan
          </button>
        )}

        {session.stage === "implementing" && !session.proposedPatch && !hasActionBeforePlan && (
          <ActionCard
            icon={<FileDiff className="h-4 w-4" />}
            title="Preview bounded patch"
            description="Generate a patch proposal only for the approved mission files. It is not applied yet."
            action="Generate patch preview"
            busy={busy}
            disabled={contribution.features["patch-preview"] === "degraded"}
            unavailableMessage="Patch previews need the configured live agent for this repository."
            onAction={() => request("propose-patch", { mission, repositorySummary })}
          />
        )}

        {session.proposedPatch && session.stage !== "verifying" && (
          <button
            type="button"
            onClick={() => setPatchOpen(true)}
            className="rq-cta flex w-full items-center justify-center rounded-md border border-line bg-surface-strong px-3 py-2 text-sm font-semibold text-muted transition hover:border-muted/50 hover:text-foreground"
          >
            View Proposed Patch
          </button>
        )}

        {session.stage === "awaiting_patch_approval" && session.proposedPatch && (
          <button
            type="button"
            onClick={() => request("propose-patch", { mission, repositorySummary })}
            disabled={busy || contribution.features["patch-preview"] === "degraded"}
            className="rq-cta flex w-full items-center justify-center rounded-md border border-line bg-surface-strong px-3 py-2 text-sm font-semibold text-muted transition hover:border-muted/50 hover:text-foreground disabled:opacity-60"
          >
            Regenerate patch preview
          </button>
        )}

        {session.stage === "verifying" && (
          <ActionCard
            icon={<Play className="h-4 w-4" />}
            title="Run required verification"
            description={session.implementationPlan?.expectedTests.join(" · ") ?? "Run the required mission tests."}
            action="Run verification"
            busy={busy}
            disabled={!contribution.capabilities.canRunTests}
            unavailableMessage="This runtime intentionally does not execute arbitrary live repository commands."
            onAction={() => request("verify")}
          />
        )}

        {session.stage === "completed" && session.verification?.passed && !masteryRecorded && (
          <ActionCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            title="Record mastery"
            description="Save this verified contribution to your repository mastery profile and unlock the next recommendation."
            action="Record mastery"
            busy={busy}
            onAction={() => request("complete")}
          />
        )}

        {session.stage === "completed" && (
          <div className="rounded-lg border border-success/35 bg-success/10 p-3">
            <p className="rq-kicker !text-success">Contribution verified</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {mission.title} · evidence recorded
            </p>
            <div className="mt-3 space-y-1.5 text-xs text-foreground">
              {uniqueEvidence.map((item) => (
                <p key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  {item}
                </p>
              ))}
              {uniqueVerificationEvidence.map((evidenceItem) => (
                <p key={evidenceItem} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  {evidenceItem}
                </p>
              ))}
            </div>
            <p className="mt-3 font-mono text-[0.65rem] uppercase tracking-wider text-muted">
              Guidance: {session.guidanceLevel} contribution
            </p>
            {masteryRecorded && contribution.recommendation && (
              <div className="mt-3 rounded border border-line bg-surface-strong p-3">
                <p className="rq-kicker flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> Next contribution</p>
                <p className="mt-1 text-sm font-semibold">{contribution.recommendation.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{contribution.recommendation.objective}</p>
              </div>
            )}
          </div>
        )}

        {error && <CapabilityNotice message={error} error />}
      </div>
      {implementationPlanDialog}
      {proposedPatchDialog}
    </section>
  );
}

function ActionCard({
  icon,
  title,
  description,
  action,
  onAction,
  busy,
  disabled,
  unavailableMessage,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: string;
  onAction: () => void;
  busy: boolean;
  disabled?: boolean;
  unavailableMessage?: string;
}) {
  return (
      <div className="min-w-0 rounded-lg border border-line bg-surface-strong p-3">
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 text-primary">{icon}</span>
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold">{title}</p>
          <p className="mt-1 break-words text-xs leading-5 text-muted">{description}</p>
        </div>
      </div>
      <button
        onClick={onAction}
        disabled={busy || disabled}
        className="rq-cta mt-3 w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Working…" : action}
      </button>
      {disabled && unavailableMessage && <CapabilityNotice message={unavailableMessage} />}
    </div>
  );
}

function CapabilityNotice({ message, error = false }: { message: string; error?: boolean }) {
  return (
    <p className={`mt-3 flex min-w-0 items-start gap-1.5 break-words text-xs leading-5 ${error ? "text-danger" : "text-muted"}`}>
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  );
}
