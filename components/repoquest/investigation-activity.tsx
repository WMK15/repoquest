"use client";

import { Compass, FileCode2, FlaskConical, Hammer, Search, ShieldCheck, Sparkles } from "lucide-react";
import type { InvestigationEvent } from "@/lib/campaign/types";

const PHASE_ICONS = {
  scout: Compass,
  investigator: Search,
  builder: Hammer,
  reviewer: ShieldCheck,
} as const;

function EventRow({ event }: { event: InvestigationEvent }) {
  switch (event.type) {
    case "phase_started": {
      const Icon = PHASE_ICONS[event.phase];
      return (
        <div className="mt-3 flex items-center gap-2 first:mt-0">
          <Icon className="h-3.5 w-3.5 text-investigating" aria-hidden />
          <span className="rq-kicker !text-[0.6rem] !text-investigating">{event.label}</span>
        </div>
      );
    }
    case "file_read":
    case "documentation_read":
      return (
        <div className="pl-5 text-xs leading-relaxed text-muted">
          <span className="text-foreground/90">{event.message}</span>
          <span className="ml-1.5 font-mono text-[0.62rem] text-muted/80">
            <FileCode2 className="mr-0.5 inline h-2.5 w-2.5" aria-hidden />
            {event.path}
          </span>
        </div>
      );
    case "test_run":
      return (
        <div className="pl-5 text-xs leading-relaxed">
          <FlaskConical className="mr-1 inline h-3 w-3 text-muted" aria-hidden />
          <span className={event.success ? "text-success" : "text-danger"}>
            {event.message}
          </span>
          <span className="ml-1.5 font-mono text-[0.62rem] text-muted/80">{event.command}</span>
        </div>
      );
    case "finding":
      return (
        <div className="pl-5 text-xs leading-relaxed text-primary">
          <Sparkles className="mr-1 inline h-3 w-3" aria-hidden />
          {event.message}
        </div>
      );
    case "investigation_complete":
      return (
        <div className="mt-2 rounded-md border border-danger/40 bg-danger/10 p-2.5 text-xs leading-relaxed">
          <p className="rq-kicker !text-[0.58rem] !text-danger">Root cause</p>
          <p className="mt-1 text-foreground">{event.rootCause}</p>
        </div>
      );
  }
}

export function InvestigationActivity({
  events,
  idle,
}: {
  events: InvestigationEvent[];
  idle: boolean;
}) {
  return (
    <section className="rq-panel flex h-full min-h-0 flex-col p-5" aria-label="Codex activity">
      <p className="rq-kicker">Codex activity</p>
      <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1" aria-live="polite">
        {events.length === 0 && (
          <p className="text-xs text-muted">
            {idle
              ? "Awaiting mission start. Codex will log every file and document it inspects."
              : "Standing by…"}
          </p>
        )}
        {events.map((event, i) => (
          <EventRow key={i} event={event} />
        ))}
      </div>
    </section>
  );
}
