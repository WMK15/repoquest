import {
  CheckCircle2,
  CircleHelp,
  CircleMinus,
  SearchX,
  ShieldAlert,
} from "lucide-react";
import type {
  AnalysisCoverageArea,
  AnalysisCoverageEntry,
  AnalysisCoverageStatus,
  CampaignNode,
} from "@/lib/campaign/types";

const AREAS: Array<{ area: AnalysisCoverageArea; label: string }> = [
  { area: "frontend", label: "Frontend" },
  { area: "backend", label: "Backend" },
  { area: "database", label: "Database" },
  { area: "logging", label: "Logging" },
  { area: "metrics", label: "Metrics" },
  { area: "tracing", label: "Tracing" },
  { area: "alerts", label: "Alerts" },
  { area: "external-services", label: "External services" },
  { area: "infrastructure", label: "Infrastructure" },
  { area: "ci", label: "CI" },
];

const STATUS: Record<
  AnalysisCoverageStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  found: { label: "Found", className: "text-success", icon: CheckCircle2 },
  "not-detected": { label: "Not detected", className: "text-muted", icon: SearchX },
  uncertain: { label: "Uncertain", className: "text-investigating", icon: CircleHelp },
  unsupported: { label: "Unsupported", className: "text-muted", icon: CircleMinus },
  "analysis-limited": { label: "Analysis limited", className: "text-danger", icon: ShieldAlert },
};

export function AnalysisCoverage({
  coverage,
  nodes,
  onFocusComponent,
}: {
  coverage: AnalysisCoverageEntry[];
  nodes: CampaignNode[];
  onFocusComponent: (componentId: string) => void;
}) {
  const entries = new Map(coverage.map((entry) => [entry.area, entry]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return (
    <section className="mt-5 border-t border-line pt-4" aria-labelledby="analysis-coverage-heading">
      <h3 id="analysis-coverage-heading" className="rq-kicker">
        Analysis coverage
      </h3>
      <p className="mt-1.5 text-xs leading-5 text-muted">
        Detection status by repository concern. Absence is not proof that a capability does not exist.
      </p>

      <dl className="mt-3 overflow-hidden rounded-md border border-line">
        {AREAS.map(({ area, label }) => {
          const entry = entries.get(area);
          const status = entry?.status ?? "analysis-limited";
          const presentation = STATUS[status];
          const Icon = presentation.icon;
          return (
            <div
              key={area}
              className="border-b border-line px-3 py-2 last:border-b-0 odd:bg-foreground/[0.025]"
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <dt className="min-w-0 break-words text-xs font-medium text-foreground">{label}</dt>
                <dd className={`flex shrink-0 items-center gap-1 font-mono text-[0.58rem] uppercase tracking-wide ${presentation.className}`}>
                  <Icon className="h-3 w-3" aria-hidden />
                  {presentation.label}
                </dd>
              </div>
              {entry?.summary && (
                <dd className="mt-1 break-words text-xs leading-5 text-muted">{entry.summary}</dd>
              )}
              {entry?.evidence && entry.evidence.length > 0 && (
                <dd className="mt-1.5 font-mono text-[0.62rem] leading-4 text-muted">
                  {entry.evidence.length} evidence {entry.evidence.length === 1 ? "item" : "items"}
                </dd>
              )}
              {entry?.componentIds && entry.componentIds.some((id) => nodeById.has(id)) && (
                <dd className="mt-1.5 flex flex-wrap gap-1">
                  {entry.componentIds.map((id) => {
                    const node = nodeById.get(id);
                    if (!node) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onFocusComponent(id)}
                        className="max-w-full break-words rounded border border-primary/25 bg-primary-soft px-1.5 py-0.5 text-left text-[0.65rem] text-primary hover:border-primary/60"
                      >
                        {node.gameLabel}
                      </button>
                    );
                  })}
                </dd>
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
