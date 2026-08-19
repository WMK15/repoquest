"use client";

import { CheckCircle2, RotateCcw } from "lucide-react";
import type {
  ContributionMission,
  ContributionSession,
  EngineerRepositoryProfile,
} from "@/lib/repoquest/domain/types";

export function CompletionScreen({
  repositoryName,
  mission,
  contribution,
  exploredCount,
  documentsRead,
  durationSeconds,
  resetting,
  onReset,
}: {
  repositoryName: string;
  mission: ContributionMission;
  contribution: {
    session: ContributionSession;
    profile: EngineerRepositoryProfile;
  };
  exploredCount: number;
  documentsRead: number;
  durationSeconds: number;
  resetting: boolean;
  onReset: () => void;
}) {
  const { session, profile } = contribution;
  const verification = session.verification;
  const verifiedContribution = profile.verifiedContributions.find(
    (item) => item.sessionId === session.id
  );
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  const changedFiles = verification?.changedFiles ?? verifiedContribution?.changedFiles ?? [];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-2 backdrop-blur-sm sm:p-6">
      <div className="rq-panel max-h-[94dvh] w-[44rem] max-w-full overflow-y-auto p-5 sm:max-h-[88vh] sm:p-8">
        <p className="rq-kicker !text-success">Onboarding complete</p>
        <h2 className="mt-2 break-words text-2xl font-semibold tracking-tight">
          First contribution verified in {repositoryName}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          The contribution passed repository verification and its mastery evidence is recorded.
        </p>

        <div className="mt-5 rounded-lg border border-success/35 bg-success/10 p-4">
          <p className="rq-kicker !text-success">Selected mission</p>
          <p className="mt-1.5 break-words text-base font-semibold">{mission.title}</p>
          <p className="mt-1 break-words text-sm leading-6 text-muted">{mission.summary}</p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rq-inset min-w-0 rounded-md p-4">
            <p className="rq-kicker !text-[0.58rem]">Changed files</p>
            {changedFiles.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {changedFiles.map((file) => (
                  <li key={file} className="flex min-w-0 items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                    <span className="break-all font-mono text-xs text-primary">{file}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No changed files were reported.</p>
            )}
          </div>

          <div className="rq-inset min-w-0 rounded-md p-4">
            <p className="rq-kicker !text-[0.58rem]">Verification</p>
            <p className="mt-1.5 break-all font-mono text-xs text-foreground">
              {verification?.command ?? verifiedContribution?.testCommand}
            </p>
            <p className="mt-1 font-mono text-xs text-success">
              {verification?.passed ? `Passed with exit code ${verification.exitCode}` : "Verified"}
            </p>
            {verification?.output && (
              <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-surface p-2 font-mono text-[0.65rem] leading-5 text-muted">
                {verification.output}
              </pre>
            )}
          </div>
        </div>

        <dl className="mt-4 grid gap-2 rounded-md border border-line bg-surface-strong p-4 font-mono text-xs sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Regions explored</dt>
            <dd>{exploredCount}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Documents opened</dt>
            <dd>{documentsRead}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Mission duration</dt>
            <dd>{minutes}m {seconds}s</dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={onReset}
          disabled={resetting}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-line px-5 py-2.5 text-sm font-medium transition hover:border-primary/60 disabled:opacity-60 sm:w-auto"
        >
          <RotateCcw className={`h-4 w-4 ${resetting ? "animate-spin" : ""}`} aria-hidden />
          {resetting ? "Resetting..." : "Map another repository"}
        </button>
      </div>
    </div>
  );
}
