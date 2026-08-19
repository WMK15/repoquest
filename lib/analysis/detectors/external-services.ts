import type { DetectorResult } from "../types";
import ts from "typescript";

export interface ExternalServiceFileInput {
  path: string;
  content: string;
}

export interface ExternalServiceFinding {
  kind: "external-service";
  name: string;
  description: string;
  confidence: "high" | "medium";
  evidence: Array<{ path: string; line: number; snippet: string }>;
  metadata: { signal: "dependency" | "import" | "environment" | "terraform" | "github-action"; identifier: string };
}

const SERVICES: Array<{ name: string; pattern: RegExp }> = [
  { name: "AWS", pattern: /(?:^|[-_/@.])(?:aws|amazon|s3|sqs|sns|dynamodb|cloudfront|cognito)(?:$|[-_/@.])/i },
  { name: "Google Cloud", pattern: /(?:^|[-_/@.])(?:google-cloud|gcp|firebase|firestore|bigquery|gcs)(?:$|[-_/@.])/i },
  { name: "Microsoft Azure", pattern: /(?:^|[-_/@.])(?:azure|microsoft-graph)(?:$|[-_/@.])/i },
  { name: "Stripe", pattern: /(?:^|[-_/@.])stripe(?:$|[-_/@.])/i },
  { name: "Twilio", pattern: /(?:^|[-_/@.])twilio(?:$|[-_/@.])/i },
  { name: "SendGrid", pattern: /(?:^|[-_/@.])sendgrid(?:$|[-_/@.])/i },
  { name: "Slack", pattern: /(?:^|[-_/@.])slack(?:$|[-_/@.])/i },
  { name: "GitHub", pattern: /(?:^|[-_/@.])(?:github|octokit)(?:$|[-_/@.])/i },
  { name: "Sentry", pattern: /(?:^|[-_/@.])sentry(?:$|[-_/@.])/i },
  { name: "Datadog", pattern: /(?:^|[-_/@.])(?:datadog|dd-trace)(?:$|[-_/@.])/i },
  { name: "PostHog", pattern: /(?:^|[-_/@.])posthog(?:$|[-_/@.])/i },
  { name: "OpenAI", pattern: /(?:^|[-_/@.])openai(?:$|[-_/@.])/i },
  { name: "Anthropic", pattern: /(?:^|[-_/@.])anthropic(?:$|[-_/@.])/i },
  { name: "Supabase", pattern: /(?:^|[-_/@.])supabase(?:$|[-_/@.])/i },
  { name: "MongoDB", pattern: /(?:^|[-_/@.])(?:mongodb|mongoose)(?:$|[-_/@.])/i },
  { name: "Redis", pattern: /(?:^|[-_/@.])(?:redis|ioredis|upstash)(?:$|[-_/@.])/i },
  { name: "Elastic", pattern: /(?:^|[-_/@.])(?:elasticsearch|elastic-cloud)(?:$|[-_/@.])/i },
  { name: "Cloudflare", pattern: /(?:^|[-_/@.])cloudflare(?:$|[-_/@.])/i },
  { name: "Vercel", pattern: /(?:^|[-_/@.])vercel(?:$|[-_/@.])/i },
  { name: "Auth0", pattern: /(?:^|[-_/@.])auth0(?:$|[-_/@.])/i },
];

const SAFE_ENV_SUFFIX = /_(?:URL|URI|HOST|ENDPOINT|REGION|PROJECT|PROJECT_ID|BUCKET|QUEUE|TOPIC|ACCOUNT|WORKSPACE|ORG|ORGANIZATION|TENANT|DATABASE)$/;
const SECRET_ENV_PART = /(?:SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|API_KEY|ACCESS_KEY|CLIENT_SECRET|SIGNING_KEY)/;

function evidence(file: ExternalServiceFileInput, line: number) {
  return { path: file.path, line, snippet: file.content.split(/\r?\n/)[line - 1]?.trim().slice(0, 240) ?? "" };
}

function lineFor(content: string, offset: number) {
  return content.slice(0, offset).split(/\r?\n/).length;
}

function serviceFor(identifier: string) {
  return SERVICES.find((service) => service.pattern.test(identifier));
}

function packageRoot(specifier: string) {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}

function pushSignal(
  findings: ExternalServiceFinding[],
  seen: Set<string>,
  file: ExternalServiceFileInput,
  identifier: string,
  signal: ExternalServiceFinding["metadata"]["signal"],
  offset: number,
) {
  const service = serviceFor(identifier);
  if (!service) return;
  const key = `${service.name}:${signal}:${file.path}:${lineFor(file.content, offset)}`;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push({
    kind: "external-service",
    name: service.name,
    description: `${service.name} is indicated by ${signal.replace("-", " ")} ${identifier}.`,
    confidence: signal === "environment" ? "medium" : "high",
    evidence: [evidence(file, lineFor(file.content, offset))],
    metadata: { signal, identifier },
  });
}

function dependencySignals(file: ExternalServiceFileInput) {
  if (!/(?:^|\/)(?:package\.json|pyproject\.toml|requirements[^/]*\.txt|go\.mod|Cargo\.toml)$/.test(file.path)) return [];
  const dependencies: Array<{ value: string; offset: number }> = [];
  if (file.path.endsWith("package.json")) {
    try {
      const manifest = JSON.parse(file.content) as Record<string, unknown>;
      for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        const entries = manifest[section];
        if (!entries || typeof entries !== "object" || Array.isArray(entries)) continue;
        for (const name of Object.keys(entries)) {
          dependencies.push({ value: name, offset: Math.max(0, file.content.indexOf(JSON.stringify(name))) });
        }
      }
    } catch {
      return [];
    }
  } else {
    for (const match of file.content.matchAll(/^\s*([@A-Za-z0-9_.-]+)(?:\[[^\]]+\])?(?:\s*[=~^<>!]|\s+v?\d)/gm)) {
      dependencies.push({ value: match[1], offset: match.index });
    }
  }
  return dependencies;
}

function sourceKind(file: string) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

function executableSourceSignals(file: ExternalServiceFileInput) {
  const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, sourceKind(file.path));
  const imports: Array<{ value: string; offset: number }> = [];
  const environments: Array<{ value: string; offset: number }> = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      imports.push({ value: packageRoot(node.moduleSpecifier.text), offset: node.getStart(source) });
    } else if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(source);
      if ((expression === "require" || expression === "import") && ts.isStringLiteralLike(node.arguments[0])) {
        imports.push({ value: packageRoot(node.arguments[0].text), offset: node.getStart(source) });
      }
    }
    if (ts.isPropertyAccessExpression(node)) {
      const owner = node.expression.getText(source);
      if (owner === "process.env" || owner === "import.meta.env") {
        environments.push({ value: node.name.text, offset: node.getStart(source) });
      }
    } else if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
      const owner = node.expression.getText(source);
      if (owner === "process.env" || owner === "import.meta.env" || owner === "env") {
        environments.push({ value: node.argumentExpression.text, offset: node.getStart(source) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { imports, environments };
}

function withoutComments(content: string) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, content);
  const chars = [...content];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    for (let index = scanner.getTokenPos(); index < scanner.getTextPos(); index += 1) {
      if (chars[index] !== "\n" && chars[index] !== "\r") chars[index] = " ";
    }
  }
  let quote = false;
  for (let index = 0; index < chars.length; index += 1) {
    if (chars[index] === '"' && chars[index - 1] !== "\\") quote = !quote;
    if (chars[index] !== "#" || quote) continue;
    while (index < chars.length && chars[index] !== "\n" && chars[index] !== "\r") {
      chars[index] = " ";
      index += 1;
    }
  }
  return chars.join("");
}

export function detectExternalServices(files: ExternalServiceFileInput[]): ExternalServiceFinding[] {
  const findings: ExternalServiceFinding[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    for (const dependency of dependencySignals(file)) {
      pushSignal(findings, seen, file, dependency.value, "dependency", dependency.offset);
    }

    if (/\.[cm]?[jt]sx?$/.test(file.path)) {
      const signals = executableSourceSignals(file);
      for (const imported of signals.imports) {
        pushSignal(findings, seen, file, imported.value, "import", imported.offset);
      }
      for (const environment of signals.environments) {
        if (SECRET_ENV_PART.test(environment.value) || !SAFE_ENV_SUFFIX.test(environment.value)) continue;
        pushSignal(findings, seen, file, environment.value, "environment", environment.offset);
      }
    }

    if (file.path.endsWith(".tf")) {
      const terraform = withoutComments(file.content);
      for (const match of terraform.matchAll(/\b(?:resource|data)\s+"([A-Za-z0-9_-]+)"/g)) {
        pushSignal(findings, seen, file, match[1], "terraform", match.index);
      }
      for (const match of terraform.matchAll(/\bsource\s*=\s*"([^"]+)"/g)) {
        pushSignal(findings, seen, file, match[1], "terraform", match.index);
      }
    }

    if (/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(file.path.replace(/^\.\//, ""))) {
      for (const match of file.content.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)) {
        pushSignal(findings, seen, file, match[1], "github-action", match.index);
      }
    }
  }
  return findings;
}

type DetectorContextLike = { files: ExternalServiceFileInput[] };
type ExternalServicesDetectorResult = Pick<DetectorResult, "detectorId"> & { findings: ExternalServiceFinding[] };

export const externalServicesDetector = {
  id: "external-services",
  name: "External services",
  detect(context: DetectorContextLike): ExternalServicesDetectorResult {
    return { detectorId: "external-services", findings: detectExternalServices(context.files) };
  },
};
export default externalServicesDetector;
