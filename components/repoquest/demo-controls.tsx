"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";

export function DemoControls({
  deterministic,
  aiConfigured,
  onToggleDeterministic,
  onReset,
  onSkipToMap,
  onSkipToInvestigation,
}: {
  deterministic: boolean;
  aiConfigured: boolean;
  onToggleDeterministic: () => void;
  onReset: () => void;
  onSkipToMap: () => void;
  onSkipToInvestigation: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <div className="rq-panel mb-2 w-60 p-3">
          <p className="rq-kicker mb-2">Demo controls</p>
          <div className="space-y-1.5">
            {[
              { label: "Reset campaign + repository", action: onReset },
              { label: "Skip to map", action: onSkipToMap },
              { label: "Skip to investigation", action: onSkipToInvestigation },
              {
                label: `Deterministic mode: ${deterministic ? "on" : "off"}`,
                action: onToggleDeterministic,
              },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                className="block w-full rounded border border-line px-2.5 py-1.5 text-left text-xs text-muted transition hover:border-primary/50 hover:text-foreground"
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="mt-2 font-mono text-[0.6rem] text-muted">
            AI: {aiConfigured ? "configured" : "not configured (deterministic)"}
          </p>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Demo controls"
        className="rq-panel ml-auto block rounded-full p-2.5 text-muted transition hover:text-foreground"
      >
        <Settings2 className="h-4 w-4" />
      </button>
    </div>
  );
}
