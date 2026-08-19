"use client";

import { CheckCircle2, ChevronRight, Circle, FileCheck2, Route } from "lucide-react";
import type { CampaignNode, GuidedWalkthroughSection } from "@/lib/campaign/types";

export function GuidedWalkthrough({
  sections,
  nodes,
  exploredIds,
  onFocusComponent,
}: {
  sections: GuidedWalkthroughSection[];
  nodes: CampaignNode[];
  exploredIds: string[];
  onFocusComponent: (componentId: string) => void;
}) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const explored = new Set(exploredIds);
  const orderedSections = [...sections].sort((a, b) => a.order - b.order);

  return (
    <section className="mt-5 border-t border-line pt-4" aria-labelledby="guided-walkthrough-heading">
      <h3 id="guided-walkthrough-heading" className="rq-kicker flex items-center gap-1.5">
        <Route className="h-3 w-3" aria-hidden />
        Guided walkthrough
      </h3>
      <p className="mt-1.5 text-xs leading-5 text-muted">
        Follow the system in order and collect enough evidence to explain each section.
      </p>

      <ol className="mt-3 space-y-2">
        {orderedSections.map((section, index) => {
          const referencedIds = section.componentIds.filter((id) => nodeById.has(id));
          const complete = referencedIds.length > 0 && referencedIds.every((id) => explored.has(id));
          return (
            <li key={section.id}>
              <details className="group rq-hover-card rounded-md border border-line bg-surface-strong p-3" open={index === 0 && !complete}>
                <summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
                  {complete ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-investigating" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[0.58rem] uppercase tracking-wider text-muted">
                      Section {index + 1}
                    </span>
                    <span className="mt-0.5 block break-words text-sm font-medium text-foreground">
                      {section.title}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted transition group-open:rotate-90" aria-hidden />
                </summary>

                <div className="mt-3 border-t border-line pt-3">
                  <p className="rq-kicker !text-[0.56rem]">Objective</p>
                  <p className="mt-1 break-words text-xs leading-5 text-muted">{section.objective}</p>

                  {referencedIds.length > 0 && (
                    <div className="mt-3">
                      <p className="rq-kicker !text-[0.56rem]">Components</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {referencedIds.map((id) => {
                          const node = nodeById.get(id)!;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => onFocusComponent(id)}
                              className="max-w-full break-words rounded border border-primary/25 bg-primary-soft px-2 py-1 text-left text-xs text-primary hover:border-primary/60"
                            >
                              {node.gameLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {section.flowSteps.length > 0 && (
                    <div className="mt-3">
                      <p className="rq-kicker !text-[0.56rem]">Flow</p>
                      <ol className="mt-1.5 space-y-1.5 text-xs leading-5 text-muted">
                        {section.flowSteps.map((step, stepIndex) => (
                          <li key={`${section.id}-step-${stepIndex}`} className="flex min-w-0 items-start gap-2">
                            <span className="font-mono text-primary">{stepIndex + 1}.</span>
                            {step.componentId && nodeById.has(step.componentId) ? (
                              <button
                                type="button"
                                onClick={() => onFocusComponent(step.componentId!)}
                                className="min-w-0 break-words text-left hover:text-primary"
                              >
                                {step.instruction}
                              </button>
                            ) : (
                              <span className="min-w-0 break-words">{step.instruction}</span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  <RequirementList label="Complete when" items={section.completionRequirements} />
                  <RequirementList label="Evidence required" items={section.evidenceRequirements} />
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function RequirementList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="rq-kicker flex items-center gap-1.5 !text-[0.56rem]">
        <FileCheck2 className="h-3 w-3" aria-hidden />
        {label}
      </p>
      <ul className="mt-1.5 space-y-1 text-xs leading-5 text-muted">
        {items.map((item) => (
          <li key={item} className="flex min-w-0 items-start gap-1.5">
            <span className="text-primary" aria-hidden>&bull;</span>
            <span className="min-w-0 break-words">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
