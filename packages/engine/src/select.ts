import { Glob } from "bun";
import { detectFramework, nextAuthAnchorGlobs } from "./playbook/next.js";
import { confidenceForTier, type SelectionResult } from "./types.js";

/**
 * The selection cascade (ADR D-17). Given a repo's file listing and manifest, pick the
 * files that implement a subsystem, degrading through tiers and setting confidence from
 * the tier that fired.
 *
 * This slice implements tier 1 (playbook anchors) only — the walking skeleton. Tiers 2
 * (keyword/symbol dictionary) and 3 (fan-in) arrive in Slice 4; until then a repo the
 * playbook can't claim bottoms out with no anchors at the lowest confidence.
 */

export type Intent = "auth";

export interface RepoInput {
  /** Repo-relative paths in the universe (post ignore-list). */
  files: string[];
  /** Parsed package.json, or undefined when there is none. */
  manifest?: unknown;
  /** Reads a file's contents. Used by the tier-2 dictionary (Slice 4). */
  readFile?: (path: string) => string;
  /** Fan-in per file. Used by the tier-3 fallback (Slice 4). */
  fanIn?: ReadonlyMap<string, number>;
}

export function select(intent: Intent, repo: RepoInput): SelectionResult {
  const framework = detectFramework(repo.manifest);

  // Tier 1 — playbook anchors. On a known framework these override fan-in (D-17): a
  // convention-wired route file is imported by nobody, so fan-in would bury it.
  if (framework === "next" && intent === "auth") {
    const matched = matchGlobs(nextAuthAnchorGlobs, repo.files);
    if (matched.length > 0) {
      return {
        anchors: matched,
        confidence: confidenceForTier[1],
        provenance: { tier: 1, framework, anchors: matched },
      };
    }
  }

  // Tiers 2 and 3 land in Slice 4. Empty fallthrough at the cascade's floor for now.
  return {
    anchors: [],
    confidence: confidenceForTier[3],
    provenance: { tier: 3, framework, anchors: [] },
  };
}

/** Files matching any of the glob patterns, preserving input order. */
function matchGlobs(globs: readonly string[], files: string[]): string[] {
  const matchers = globs.map((g) => new Glob(g));
  return files.filter((f) => matchers.some((m) => m.match(f)));
}
