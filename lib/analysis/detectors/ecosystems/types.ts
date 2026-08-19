/** Repository-relative source location supporting every detector finding. */
export interface DetectorEvidence {
  path: string;
  line?: number;
  endLine?: number;
  snippet?: string;
}

/**
 * Deliberately small integration surface. `details` contains detector-specific
 * structured data while `evidence` always explains where the finding came from.
 */
export interface DetectorFinding {
  type: string;
  label: string;
  evidence: DetectorEvidence[];
  details?: Record<string, unknown>;
}

export interface DetectorOutput {
  detector: string;
  findings: DetectorFinding[];
}
