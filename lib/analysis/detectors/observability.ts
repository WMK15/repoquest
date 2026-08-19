import type { DetectorResult } from "../types";
import ts from "typescript";

export interface ObservabilityFileInput {
  path: string;
  content: string;
}

export interface ObservabilityFinding {
  kind: "logging" | "metrics" | "tracing" | "error-reporting" | "health-check";
  name: string;
  description: string;
  confidence: "high" | "medium";
  evidence: Array<{ path: string; line: number; snippet: string }>;
  metadata?: Record<string, unknown>;
}

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/i;
const SIGNALS: Array<{
  kind: ObservabilityFinding["kind"];
  name: string;
  importPattern?: RegExp;
  usagePattern: RegExp;
}> = [
  { kind: "logging", name: "structured logging", importPattern: /(?:pino|winston|bunyan|log4js|consola|@logtail\/node)/i, usagePattern: /\b(?:logger|log)\.(?:trace|debug|info|warn|error|fatal)\s*\(/i },
  { kind: "logging", name: "console logging", usagePattern: /\bconsole\.(?:debug|info|warn|error|log)\s*\(/ },
  { kind: "metrics", name: "application metrics", importPattern: /(?:prom-client|hot-shots|statsd|@opentelemetry\/api-metrics)/i, usagePattern: /\b(?:Counter|Gauge|Histogram|Summary|metrics?)\s*[.(]/ },
  { kind: "tracing", name: "distributed tracing", importPattern: /(?:@opentelemetry\/|dd-trace|@aws-lambda-powertools\/tracer|newrelic)/i, usagePattern: /\b(?:startActiveSpan|startSpan|getTracer|traceparent|span\.(?:setAttribute|addEvent|end))\s*\(/ },
  { kind: "error-reporting", name: "error reporting", importPattern: /(?:@sentry\/|rollbar|bugsnag|honeybadger|airbrake|newrelic)/i, usagePattern: /\b(?:captureException|captureMessage|notify|reportError|recordException)\s*\(/ },
  { kind: "health-check", name: "health endpoint", usagePattern: /(?:["'`](?:\/api)?\/(?:healthz?|readyz?|livez?|readiness|liveness)["'`]|\bhealthCheck\s*[:=(])/i },
];

function evidence(file: ObservabilityFileInput, line: number) {
  return { path: file.path, line, snippet: file.content.split(/\r?\n/)[line - 1]?.trim().slice(0, 240) ?? "" };
}

function lineFor(content: string, offset: number) {
  return content.slice(0, offset).split(/\r?\n/).length;
}

function sourceKind(file: string) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

function sourceSignals(file: ObservabilityFileInput) {
  const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, sourceKind(file.path));
  const imports: Array<{ packageName: string; offset: number }> = [];
  const executable: Array<{ text: string; offset: number }> = [];
  const healthPaths: Array<{ text: string; offset: number }> = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      imports.push({ packageName: node.moduleSpecifier.text, offset: node.getStart(source) });
    } else if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(source);
      if ((expression === "require" || expression === "import") && ts.isStringLiteralLike(node.arguments[0])) {
        imports.push({ packageName: node.arguments[0].text, offset: node.getStart(source) });
      }
      executable.push({ text: `${expression}(`, offset: node.expression.getStart(source) });
      for (const argument of node.arguments) {
        if (ts.isStringLiteralLike(argument)) healthPaths.push({ text: argument.text, offset: argument.getStart(source) });
      }
    } else if (ts.isNewExpression(node)) {
      executable.push({ text: `${node.expression.getText(source)}(`, offset: node.expression.getStart(source) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { imports, executable, healthPaths };
}

export function detectObservability(files: ObservabilityFileInput[]): ObservabilityFinding[] {
  return files.filter((file) => SOURCE_FILE.test(file.path)).flatMap((file) => {
    const findings: ObservabilityFinding[] = [];
    const { imports, executable, healthPaths } = sourceSignals(file);
    for (const signal of SIGNALS) {
      const packageMatch = signal.importPattern
        ? imports.find((entry) => signal.importPattern?.test(entry.packageName))
        : undefined;
      const usageMatch = signal.kind === "health-check"
        ? healthPaths.find((entry) => signal.usagePattern.test(JSON.stringify(entry.text)))
        : executable.find((entry) => signal.usagePattern.test(entry.text));
      if (!packageMatch && !usageMatch) continue;
      const offset = packageMatch?.offset ?? usageMatch?.offset ?? 0;
      findings.push({
        kind: signal.kind,
        name: packageMatch?.packageName ?? signal.name,
        description: packageMatch
          ? `${packageMatch.packageName} provides ${signal.kind.replace("-", " ")}.`
          : `Source code implements ${signal.name}.`,
        confidence: packageMatch || signal.kind === "health-check" ? "high" : "medium",
        evidence: [evidence(file, lineFor(file.content, offset))],
        metadata: { package: packageMatch?.packageName },
      });
    }
    return findings;
  });
}

type DetectorContextLike = { files: ObservabilityFileInput[] };
type ObservabilityDetectorResult = Pick<DetectorResult, "detectorId"> & { findings: ObservabilityFinding[] };

export const observabilityDetector = {
  id: "observability",
  name: "Observability",
  detect(context: DetectorContextLike): ObservabilityDetectorResult {
    return { detectorId: "observability", findings: detectObservability(context.files) };
  },
};
export default observabilityDetector;
