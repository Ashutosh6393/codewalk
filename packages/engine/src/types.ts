import { z } from "zod";

/**
 * Structured facts the selection path emits. Facts inside, no prose (ADR D-05/D-18).
 * The engine never writes narrative — a consumer turns these into sentences later.
 *
 * Confidence is derived mechanically from the tier that fired (D-17), never a model
 * self-assessment: tier 1 -> high, tier 2 -> medium, tier 3 -> low.
 */

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

/** Which selection tier produced the result. See D-17. */
export const Tier = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type Tier = z.infer<typeof Tier>;

/** Detected framework family. `unknown` when no playbook matched. */
export const Framework = z.enum(["next", "unknown"]);
export type Framework = z.infer<typeof Framework>;

/** Confidence that corresponds to a tier. The single source of the tier->confidence map. */
export const confidenceForTier: Record<Tier, Confidence> = {
  1: "high",
  2: "medium",
  3: "low",
};

/**
 * Why the selector chose what it chose (D-18): the tier that fired, the detected
 * framework, and the named anchors that matched (the playbook conventions for tier 1;
 * empty for tiers that select by keyword or fan-in).
 */
export const Provenance = z.object({
  tier: Tier,
  framework: Framework,
  anchors: z.array(z.string()),
});
export type Provenance = z.infer<typeof Provenance>;

/**
 * The result of selecting a subsystem's anchor files. `anchors` are repo-relative
 * paths to the files the cascade picked. The bucket/coverage summary is added in a
 * later slice; the explanation call and citations are out of scope for the harness.
 */
export const SelectionResult = z.object({
  anchors: z.array(z.string()),
  confidence: Confidence,
  provenance: Provenance,
  /**
   * Honest-absence flag (D-20). `false` means the cascade found no auth and invented
   * nothing rather than reaching for a plausible-looking anchor. Derived mechanically
   * from whether the cascade produced anchors — never hand-set per tier.
   */
  hasAuth: z.boolean(),
});
export type SelectionResult = z.infer<typeof SelectionResult>;
