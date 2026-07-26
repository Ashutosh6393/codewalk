import { Glob } from "bun";
import { authCandidates, matchAuthVocabulary } from "./dictionary/auth.js";
import { detectFramework, nextAuthAnchorGlobs } from "./playbook/next.js";
import { confidenceForTier, type SelectionResult } from "./types.js";

/**
 * The selection cascade (ADR D-17). Given a repo's file listing and manifest, pick the
 * files that implement a subsystem, degrading through tiers and setting confidence from
 * the tier that fired: tier 1 (playbook anchors), tier 2 (keyword/symbol dictionary),
 * tier 3 (fan-in fallback). A repo none of the tiers can claim bottoms out with no
 * anchors at the lowest confidence.
 */

/** Tier 3's cutoff: rank by fan-in, keep only the top 2 files. */
const TIER_3_TOP_N = 2;

export type Intent = "auth";

export interface RepoInput {
  /** Repo-relative paths in the universe (post ignore-list). */
  files: string[];
  /** Parsed package.json, or undefined when there is none. */
  manifest?: unknown;
  /** Reads a file's contents. Used by the tier-2 dictionary and the tier-3 auth gate. */
  readFile?: (path: string) => string;
  /** Fan-in per file. Used by the tier-3 fallback. */
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
        hasAuth: true,
      };
    }
  }

  // Tier 2 — auth keyword dictionary. Fires when the playbook missed but we can still
  // read file content to look for auth vocabulary.
  if (intent === "auth" && repo.readFile) {
    const matched = matchAuthVocabulary(repo.files, repo.readFile);
    if (matched.length > 0) {
      return {
        anchors: matched,
        confidence: confidenceForTier[2],
        provenance: { tier: 2, framework, anchors: [] },
        hasAuth: true,
      };
    }
  }

  // Tier 3 — fan-in fallback. Floor of the cascade. Fan-in alone is not evidence that
  // auth exists (D-20): every repo has import structure, so ranking the whole repo by
  // fan-in would invent an anchor out of nothing. Fan-in is a ranker among plausible
  // candidates, never evidence on its own — rank only the files that already carry some
  // auth vocabulary, drop any with zero fan-in, and keep the top N. That's what makes
  // `no-auth` come back empty: its `package.json` has a term but no fan-in, and its
  // high-fan-in files have no term, so neither qualifies and the cascade honestly reports
  // nothing.
  const topFanIn =
    repo.fanIn && repo.readFile
      ? rankByFanIn(authCandidates(repo.files, repo.readFile), repo.fanIn, TIER_3_TOP_N)
      : [];
  return {
    anchors: topFanIn,
    confidence: confidenceForTier[3],
    provenance: { tier: 3, framework, anchors: [] },
    hasAuth: topFanIn.length > 0,
  };
}

/** The top `n` candidates by fan-in count, descending, excluding zero fan-in. */
function rankByFanIn(
  candidates: string[],
  fanIn: ReadonlyMap<string, number>,
  n: number,
): string[] {
  return candidates
    .map((file) => [file, fanIn.get(file) ?? 0] as const)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([file]) => file);
}

/** Files matching any of the glob patterns, preserving input order. */
function matchGlobs(globs: readonly string[], files: string[]): string[] {
  const matchers = globs.map((g) => new Glob(g));
  return files.filter((f) => matchers.some((m) => m.match(f)));
}
