import { EvidenceSchema, LineRangeSchema } from "./contracts";
import type { Evidence, LineRange } from "./types";

export function createLineRange(start: number, end = start): LineRange {
  return LineRangeSchema.parse({ start, end });
}

export function createEvidence(input: {
  id: string;
  path: string;
  startLine: number;
  endLine?: number;
  claim: string;
  excerpt?: string;
  detectorId?: string;
}): Evidence {
  return EvidenceSchema.parse({
    id: input.id,
    path: input.path.replaceAll("\\", "/"),
    lines: createLineRange(input.startLine, input.endLine),
    claim: input.claim,
    excerpt: input.excerpt,
    detectorId: input.detectorId,
  });
}

export function evidenceKey(evidence: Evidence): string {
  return `${evidence.path}:${evidence.lines.start}-${evidence.lines.end}:${evidence.claim}`;
}
