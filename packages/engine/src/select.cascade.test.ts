import { describe, expect, test } from "bun:test";
import { handRolledAuth } from "./__fixtures__/hand-rolled-auth.js";
import { nextAuthClean } from "./__fixtures__/next-auth-clean.js";
import { noVocabulary } from "./__fixtures__/no-vocabulary.js";
import { select } from "./select.js";

/** Content reader shared by the tier-2/tier-3 fixtures below (both carry a `contents` map). */
function readFileFrom(contents: Record<string, string>) {
  return (path: string) => {
    const content = contents[path];
    if (content === undefined) {
      throw new Error(`no fixture content for ${path}`);
    }
    return content;
  };
}

describe("select('auth') — tier 3 fan-in fallback (T-12)", () => {
  test("T-12: no playbook match and no dictionary hit falls back to the top-fan-in files at low confidence", () => {
    const result = select("auth", {
      files: [...noVocabulary.files],
      manifest: noVocabulary.manifest,
      readFile: readFileFrom(noVocabulary.contents),
      fanIn: noVocabulary.fanIn,
    });

    // Tier 3's contract: the top 2 files by fan-in count, descending. The fixture's fan-in
    // gap (5, 3, then nothing) makes "top 2" unambiguous.
    expect(result.anchors).toEqual([...noVocabulary.expectedAuthAnchors]);
    expect(result.confidence).toBe("low");
    expect(result.provenance.tier).toBe(3);
  });
});

describe("select('auth') — cascade degrades in tier order (T-14)", () => {
  test("T-14: a next-auth repo fires tier 1 at high confidence", () => {
    const result = select("auth", {
      files: [...nextAuthClean.files],
      manifest: nextAuthClean.manifest,
    });
    expect(result.provenance.tier).toBe(1);
    expect(result.confidence).toBe("high");
  });

  test("T-14: a hand-rolled auth repo skips tier 1 and fires tier 2 at medium confidence, excluding the decoy", () => {
    const result = select("auth", {
      files: [...handRolledAuth.files],
      manifest: handRolledAuth.manifest,
      readFile: readFileFrom(handRolledAuth.contents as Record<string, string>),
    });
    expect(result.provenance.tier).toBe(2);
    expect(result.confidence).toBe("medium");
    expect(result.anchors).toContain("lib/auth.ts");
    expect(result.anchors).toContain("lib/session.ts");
    expect(result.anchors).not.toContain("lib/analytics.ts");
  });

  test("T-14: a repo with no playbook and no vocabulary hit skips to tier 3 at low confidence", () => {
    const result = select("auth", {
      files: [...noVocabulary.files],
      manifest: noVocabulary.manifest,
      readFile: readFileFrom(noVocabulary.contents),
      fanIn: noVocabulary.fanIn,
    });
    expect(result.provenance.tier).toBe(3);
    expect(result.confidence).toBe("low");
  });
});
