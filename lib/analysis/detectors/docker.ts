import type { DetectorResult } from "../types";

export interface DockerFileInput {
  path: string;
  content: string;
}

export interface DockerFinding {
  kind: "image" | "stage" | "service" | "port" | "dependency" | "health-check";
  name: string;
  description: string;
  confidence: "high" | "medium";
  evidence: Array<{ path: string; line: number; snippet: string }>;
  metadata?: Record<string, unknown>;
}

function evidence(file: DockerFileInput, line: number) {
  return {
    path: file.path,
    line,
    snippet: file.content.split(/\r?\n/)[line - 1]?.trim().slice(0, 240) ?? "",
  };
}

function logicalDockerfileLines(content: string) {
  const physical = content.split(/\r?\n/);
  const logical: Array<{ text: string; line: number }> = [];
  let current = "";
  let start = 1;

  physical.forEach((raw, index) => {
    const trimmed = raw.trim();
    if (!current && (!trimmed || trimmed.startsWith("#"))) return;
    if (!current) start = index + 1;
    current += `${current ? " " : ""}${trimmed.replace(/\\\s*$/, "")}`;
    if (!/\\\s*$/.test(trimmed)) {
      logical.push({ text: current, line: start });
      current = "";
    }
  });
  if (current) logical.push({ text: current, line: start });
  return logical;
}

function parseDockerfile(file: DockerFileInput): DockerFinding[] {
  const findings: DockerFinding[] = [];
  for (const logical of logicalDockerfileLines(file.content)) {
    const from = logical.text.match(/^FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i);
    if (from) {
      findings.push({
        kind: "image",
        name: from[1],
        description: `Docker image ${from[1]} is used as a build source.`,
        confidence: "high",
        evidence: [evidence(file, logical.line)],
        metadata: { stage: from[2] },
      });
      if (from[2]) {
        findings.push({
          kind: "stage",
          name: from[2],
          description: `Docker multi-stage build stage ${from[2]} is declared.`,
          confidence: "high",
          evidence: [evidence(file, logical.line)],
          metadata: { image: from[1] },
        });
      }
    }

    const exposed = logical.text.match(/^EXPOSE\s+(.+)/i);
    if (exposed) {
      for (const port of exposed[1].split(/\s+/)) {
        findings.push({
          kind: "port",
          name: port,
          description: `Docker image exposes port ${port}.`,
          confidence: "high",
          evidence: [evidence(file, logical.line)],
          metadata: { source: "dockerfile" },
        });
      }
    }

    if (/^HEALTHCHECK\b/i.test(logical.text)) {
      findings.push({
        kind: "health-check",
        name: "Docker HEALTHCHECK",
        description: "The image declares a container health check.",
        confidence: "high",
        evidence: [evidence(file, logical.line)],
        metadata: { instruction: logical.text.slice("HEALTHCHECK".length).trim() },
      });
    }
  }
  return findings;
}

function indentation(line: string) {
  return line.match(/^\s*/)?.[0].replace(/\t/g, "  ").length ?? 0;
}

function scalar(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "").replace(/\s+#.*$/, "");
}

function parseCompose(file: DockerFileInput): DockerFinding[] {
  const lines = file.content.split(/\r?\n/);
  const findings: DockerFinding[] = [];
  let servicesIndent = -1;
  let serviceIndent = -1;
  let serviceEntryIndent = -1;
  let currentService: string | undefined;
  let section: "ports" | "depends_on" | "healthcheck" | undefined;
  let sectionIndent = -1;

  lines.forEach((raw, index) => {
    const clean = raw.replace(/\s+#.*$/, "");
    const trimmed = clean.trim();
    const indent = indentation(raw);
    if (!trimmed || trimmed.startsWith("#")) return;

    if (/^services:\s*$/.test(trimmed)) {
      servicesIndent = indent;
      serviceEntryIndent = -1;
      currentService = undefined;
      return;
    }
    if (servicesIndent < 0) return;
    if (indent <= servicesIndent && !/^services:/.test(trimmed)) {
      servicesIndent = -1;
      currentService = undefined;
      return;
    }

    const key = trimmed.match(/^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/);
    if (key && indent > servicesIndent && (serviceEntryIndent < 0 || indent === serviceEntryIndent)) {
      if (serviceEntryIndent < 0) serviceEntryIndent = indent;
      currentService = key[1];
      serviceIndent = indent;
      section = undefined;
      findings.push({
        kind: "service",
        name: currentService,
        description: `Compose service ${currentService} is declared.`,
        confidence: "high",
        evidence: [evidence(file, index + 1)],
      });
      return;
    }
    if (!currentService || indent <= serviceIndent) return;

    const image = trimmed.match(/^image:\s*(.+)$/);
    if (image) {
      const name = scalar(image[1]);
      findings.push({
        kind: "image",
        name,
        description: `Compose service ${currentService} uses image ${name}.`,
        confidence: "high",
        evidence: [evidence(file, index + 1)],
        metadata: { service: currentService },
      });
    }

    const sectionMatch = trimmed.match(/^(ports|depends_on|healthcheck):(?:\s*(.*))?$/);
    if (sectionMatch) {
      section = sectionMatch[1] as typeof section;
      sectionIndent = indent;
      if (section === "healthcheck") {
        findings.push({
          kind: "health-check",
          name: `${currentService} healthcheck`,
          description: `Compose service ${currentService} declares a health check.`,
          confidence: "high",
          evidence: [evidence(file, index + 1)],
          metadata: { service: currentService },
        });
      }
      const inline = sectionMatch[2]?.match(/^\[([^\]]*)\]/)?.[1];
      if (inline && section !== "healthcheck") {
        for (const item of inline.split(",").map(scalar).filter(Boolean)) {
          findings.push({
            kind: section === "ports" ? "port" : "dependency",
            name: item,
            description: `Compose service ${currentService} ${section === "ports" ? "publishes port" : "depends on"} ${item}.`,
            confidence: "high",
            evidence: [evidence(file, index + 1)],
            metadata: { service: currentService, source: "compose" },
          });
        }
      }
      return;
    }

    if (!section || indent <= sectionIndent) {
      section = undefined;
      return;
    }
    if (section === "healthcheck") return;

    const listItem = trimmed.match(/^-\s*(.+)$/)?.[1];
    const mapItem = section === "depends_on" && indent > sectionIndent
      ? trimmed.match(/^([A-Za-z0-9_.-]+):/)?.[1]
      : undefined;
    const value = scalar(listItem ?? mapItem ?? "");
    if (!value) return;
    findings.push({
      kind: section === "ports" ? "port" : "dependency",
      name: value,
      description: `Compose service ${currentService} ${section === "ports" ? "publishes port" : "depends on"} ${value}.`,
      confidence: "high",
      evidence: [evidence(file, index + 1)],
      metadata: { service: currentService, source: "compose" },
    });
  });
  return findings;
}

export function detectDocker(files: DockerFileInput[]): DockerFinding[] {
  return files.flatMap((file) => {
    const base = file.path.split("/").pop() ?? file.path;
    if (/^Dockerfile(?:\..+)?$/i.test(base)) return parseDockerfile(file);
    if (/^(?:docker-)?compose(?:\.[\w.-]+)?\.ya?ml$/i.test(base) || /^docker-compose\.ya?ml$/i.test(base)) {
      return parseCompose(file);
    }
    return [];
  });
}

type DetectorContextLike = { files: DockerFileInput[] };
type DockerDetectorResult = Pick<DetectorResult, "detectorId"> & { findings: DockerFinding[] };

export const dockerDetector = {
  id: "docker",
  name: "Docker",
  detect(context: DetectorContextLike): DockerDetectorResult {
    return { detectorId: "docker", findings: detectDocker(context.files) };
  },
};
export default dockerDetector;
