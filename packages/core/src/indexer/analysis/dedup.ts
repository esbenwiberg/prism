/**
 * Finding deduplication and confidence scoring.
 *
 * Multiple detectors can flag the same file for related issues (e.g.
 * coupling + god-module). This module merges related findings on the
 * same primary file and assigns normalized confidence scores.
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FindingInput {
  category: string;
  severity: string;
  title: string;
  description: string;
  evidence: unknown;
  suggestion: string | null;
}

export interface DedupedFinding extends FindingInput {
  /** Unique fingerprint for deduplication */
  fingerprint: string;
  /** Normalized confidence score 0-1 */
  confidence: number;
  /** Categories that contributed to this finding (if merged) */
  mergedCategories: string[];
}

// ---------------------------------------------------------------------------
// Related category pairs — findings on the same file in these pairs get merged
// ---------------------------------------------------------------------------

const RELATED_PAIRS: [string, string][] = [
  ["coupling", "god-module"],
  ["circular-dep", "coupling"],
];

function areRelated(a: string, b: string): boolean {
  return RELATED_PAIRS.some(
    ([x, y]) => (a === x && b === y) || (a === y && b === x),
  );
}

// ---------------------------------------------------------------------------
// Severity ranking (higher = worse)
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

function severityOf(s: string): number {
  return SEVERITY_RANK[s] ?? 0;
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Extract the primary file path from a finding's evidence.
 *
 * Evidence is typically an object with `filePath`, `file`, `path`, or
 * `sourceFilePath` keys, or an array of such objects.  For circular-dep
 * findings the evidence has a `filePaths` array — we take the first entry.
 */
function extractPrimaryFile(evidence: unknown): string | null {
  if (evidence == null || typeof evidence !== "object") return null;

  // Array — recurse into first element
  if (Array.isArray(evidence)) {
    for (const item of evidence) {
      const result = extractPrimaryFile(item);
      if (result) return result;
    }
    return null;
  }

  const obj = evidence as Record<string, unknown>;

  // Direct path keys
  for (const key of ["filePath", "file", "path", "sourceFilePath"]) {
    if (typeof obj[key] === "string" && obj[key]) {
      return obj[key] as string;
    }
  }

  // filePaths array (circular-dep evidence shape)
  if (Array.isArray(obj["filePaths"]) && obj["filePaths"].length > 0) {
    const first = obj["filePaths"][0];
    if (typeof first === "string") return first;
  }

  return null;
}

/**
 * Generate a fingerprint for a finding: SHA-256 hash of
 * (category + primary-file + severity).
 */
export function generateFingerprint(finding: FindingInput): string {
  const primaryFile = extractPrimaryFile(finding.evidence) ?? "unknown";
  const payload = `${finding.category}|${primaryFile}|${finding.severity}`;
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Compute normalized confidence score based on how far a metric exceeds
 * its threshold.
 *
 *   confidence = min(1, max(0, (metric - threshold) / threshold))
 *
 * If threshold is 0, returns 1 (any non-zero metric is infinitely over).
 */
export function computeConfidence(metric: number, threshold: number): number {
  if (threshold === 0) return 1;
  return Math.min(1, Math.max(0, (metric - threshold) / threshold));
}

/**
 * Deduplicate and merge findings that share the same primary file and
 * belong to related categories.
 *
 * 1. Group findings by primary file.
 * 2. Within each group, merge findings whose categories are related
 *    (coupling+god-module, circular-dep+coupling).
 * 3. Merged findings take the highest severity and combined descriptions.
 * 4. Across all groups, drop exact fingerprint duplicates.
 */
export function deduplicateFindings(
  findings: FindingInput[],
): DedupedFinding[] {
  // Step 1: group by primary file
  const byFile = new Map<string, FindingInput[]>();
  for (const f of findings) {
    const key = extractPrimaryFile(f.evidence) ?? `__no_file_${byFile.size}`;
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key)!.push(f);
  }

  const merged: DedupedFinding[] = [];

  // Step 2-3: merge related within each file group
  for (const group of byFile.values()) {
    const used = new Set<number>();

    for (let i = 0; i < group.length; i++) {
      if (used.has(i)) continue;

      // Collect all related findings in this group
      const cluster: FindingInput[] = [group[i]];
      used.add(i);

      for (let j = i + 1; j < group.length; j++) {
        if (used.has(j)) continue;

        // Check if j is related to anything already in the cluster
        const isRelated = cluster.some((c) =>
          areRelated(c.category, group[j].category),
        );
        if (isRelated) {
          cluster.push(group[j]);
          used.add(j);
        }
      }

      merged.push(mergeFindingCluster(cluster));
    }
  }

  // Step 4: deduplicate by fingerprint across groups
  const seen = new Map<string, DedupedFinding>();
  for (const f of merged) {
    const existing = seen.get(f.fingerprint);
    if (!existing || f.confidence > existing.confidence) {
      seen.set(f.fingerprint, f);
    }
  }

  return Array.from(seen.values());
}

// ---------------------------------------------------------------------------
// Internal: merge a cluster of related findings into one
// ---------------------------------------------------------------------------

function mergeFindingCluster(cluster: FindingInput[]): DedupedFinding {
  if (cluster.length === 1) {
    const f = cluster[0];
    const fp = generateFingerprint(f);
    return {
      ...f,
      fingerprint: fp,
      confidence: 1, // single finding — full confidence
      mergedCategories: [f.category],
    };
  }

  // Sort by severity descending — take the worst
  cluster.sort((a, b) => severityOf(b.severity) - severityOf(a.severity));
  const primary = cluster[0];
  const categories = [...new Set(cluster.map((c) => c.category))];

  // Combine descriptions
  const combinedDescription = cluster
    .map((c) => c.description)
    .join(" Additionally: ");

  // Combine suggestions (deduplicate)
  const suggestions = [
    ...new Set(cluster.map((c) => c.suggestion).filter(Boolean)),
  ];
  const combinedSuggestion =
    suggestions.length > 0 ? suggestions.join(" Also: ") : null;

  const merged: FindingInput = {
    category: primary.category,
    severity: primary.severity,
    title: primary.title,
    description: combinedDescription,
    evidence: primary.evidence,
    suggestion: combinedSuggestion,
  };

  const fp = generateFingerprint(merged);

  return {
    ...merged,
    fingerprint: fp,
    // Multiple detectors converging = higher confidence
    confidence: Math.min(1, cluster.length * 0.5),
    mergedCategories: categories,
  };
}
