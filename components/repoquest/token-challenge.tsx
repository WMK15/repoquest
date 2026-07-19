"use client";

import { useState } from "react";
import { CircleAlert, KeyRound } from "lucide-react";

const SAMPLE_TOKEN = "eyJhbGciOiJIUzI1NiJ9";

export function TokenChallenge({ onSolved }: { onSolved: () => void }) {
  const [wrong, setWrong] = useState(false);

  return (
    <div className="min-w-0">
      <p className="rq-kicker">The bearer-token interaction</p>
      <p className="mt-1.5 break-words text-sm text-muted">
        Every protected request carries this header. Which part should be
        passed to token validation?
      </p>
      <pre className="mt-3 overflow-x-auto rq-code rounded-md p-3 font-mono text-xs">
        <span className="text-[#8ba3bd]">Authorization: </span>
        <span className="text-[#fbbf24]">Bearer</span>{" "}
        <span className="text-[#7dd3fc]">{SAMPLE_TOKEN}</span>
      </pre>
      <div className="mt-3 flex flex-wrap gap-2.5">
        <button
          onClick={() => setWrong(true)}
          className="rq-hover-card rounded-md border border-line bg-surface-strong px-4 py-2 font-mono text-xs hover:border-investigating/70"
        >
          Bearer
        </button>
        <button
          onClick={onSolved}
          className="flex max-w-full items-center gap-1.5 rq-hover-card rounded-md border border-line bg-surface-strong px-4 py-2 font-mono text-xs hover:border-primary/70"
        >
          <KeyRound className="h-3 w-3 text-primary" aria-hidden />
          <span className="min-w-0 break-all">{SAMPLE_TOKEN}</span>
        </button>
      </div>
      {wrong && (
        <p className="mt-3 flex min-w-0 items-start gap-2 break-words rounded-md border border-investigating/40 bg-investigating/10 p-2.5 text-xs" role="alert">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-investigating" aria-hidden />
          “Bearer” is the authentication scheme — a label, not a credential.
          The verifier needs the signed token that follows it.
        </p>
      )}
    </div>
  );
}
