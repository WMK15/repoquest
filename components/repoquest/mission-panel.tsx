"use client";

import { Radar } from "lucide-react";
import type { Mission } from "@/lib/campaign/types";

export function MissionPanel({
  mission,
  stageLabel,
  canInvestigate,
  investigating,
  onInvestigate,
}: {
  mission: Mission;
  stageLabel: string;
  canInvestigate: boolean;
  investigating: boolean;
  onInvestigate: () => void;
}) {
  return (
    <section
      className="rq-panel flex h-full max-h-[calc(100svh-7rem)] min-w-0 flex-col overflow-hidden lg:max-h-none"
      aria-label="Mission"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-5">
        <p className="rq-kicker">Mission 01</p>
        <h2 className="mt-2 min-w-0 break-words text-xl font-semibold tracking-tight">{mission.title}</h2>
        <p className="mt-3 min-w-0 break-words text-sm leading-relaxed text-muted">{mission.narrative}</p>

        <div className="mt-4 rq-inset rounded-md p-3">
          <p className="rq-kicker !text-[0.58rem]">Objective</p>
          <p className="mt-1 min-w-0 break-words text-sm text-foreground">{mission.objective}</p>
        </div>

        <div className="mt-4">
          <p className="rq-kicker !text-[0.58rem]">Reward</p>
          <ul className="mt-1 min-w-0 space-y-1 text-sm text-muted">
            <li className="break-words">Authentication flow knowledge</li>
            <li className="break-words">First verified contribution</li>
            <li className="break-words text-primary">+35% system understanding</li>
          </ul>
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <p className="rq-kicker !text-[0.58rem]">Campaign</p>
          <ul className="mt-1.5 min-w-0 space-y-1 font-mono text-[0.65rem]">
            <li className="break-words text-investigating">▸ 01 The Broken Gate — active</li>
            <li className="break-words text-muted">🔒 02 The Silent Sync — locked</li>
            <li className="break-words text-muted">🔒 03 The Phantom Deploy — locked</li>
          </ul>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 shrink-0 border-t border-line bg-surface-strong/90 px-5 py-4 backdrop-blur">
        <p className="mb-2 font-mono text-[0.65rem] text-muted">
          STAGE · {stageLabel}
        </p>
        {canInvestigate && (
          <button
            onClick={onInvestigate}
            disabled={investigating}
            className="flex w-full items-center justify-center gap-2 rq-cta rq-glow-primary rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            <Radar className="h-4 w-4" aria-hidden />
            {investigating ? "Investigating…" : "Begin investigation"}
          </button>
        )}
      </div>
    </section>
  );
}
